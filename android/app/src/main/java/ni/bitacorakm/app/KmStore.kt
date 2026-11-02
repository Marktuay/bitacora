package ni.bitacorakm.app

import android.content.Context
import android.Manifest
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.Build
import android.os.PowerManager
import android.util.AtomicFile
import androidx.core.location.LocationManagerCompat
import androidx.work.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import org.traccar.client.*
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.SecureRandom
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import java.util.concurrent.TimeUnit

object KmStore {
    data class SessionCall(val data: JSONObject, val cookies: List<String>)
    lateinit var context: Context
    private fun now():String = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",Locale.US).apply { timeZone=TimeZone.getTimeZone("UTC") }.format(Date())
    private fun timestamp(value:String):Long = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",Locale.US).apply { timeZone=TimeZone.getTimeZone("UTC") }.parse(value)!!.time
    private val lock = Mutex()
    private val syncLock = Mutex()
    private val root get() = File(context.filesDir, "bitacora").apply { mkdirs() }
    private val tripsDir get() = File(root, "trips").apply { mkdirs() }
    val photosDir get() = File(root, "photos").apply { mkdirs() }
    private val attachmentsDir get() = File(root, "attachments").apply { mkdirs() }
    private val prefs get() = context.getSharedPreferences("bitacora", Context.MODE_PRIVATE)
    private fun config() = JSONObject(prefs.getString("config", "{}")!!)
    private fun saveConfig(c: JSONObject) { check(prefs.edit().putString("config", c.toString()).commit()) { "No se pudo guardar la configuración" } }
    fun serverUrl(): String = prefs.getString("server_url", "")?.trim().orEmpty().ifBlank {
        BuildConfig.SERVER_URL.takeUnless { it.endsWith(".invalid") }.orEmpty()
    }
    // Al actualizar desde la APK con Cloudflare, cambiar sin perder gestiones locales.
    // Si existe una gestion o GPS pendiente, conserva la URL anterior hasta sincronizar.
    suspend fun adoptCorporateEndpoint(): Boolean {
        val target=BuildConfig.SERVER_URL.takeUnless { it.endsWith(".invalid") }.orEmpty()
        if(target.isBlank() || serverUrl()==target) return true
        return try { configureServer(target); true } catch(_:Exception) { false }
    }
    fun locationEnabled(): Boolean {
        val manager=context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return false
        return LocationManagerCompat.isLocationEnabled(manager)
    }
    fun batteryOptimizationRestricted(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return false
        val power = context.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return false
        return !power.isIgnoringBatteryOptimizations(context.packageName)
    }
    fun locationPermissionGranted(): Boolean =
        context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED &&
            (Build.VERSION.SDK_INT<Build.VERSION_CODES.Q ||
                context.checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION)==PackageManager.PERMISSION_GRANTED)
    private fun tripFile(id: String): File { require(id.matches(Regex("[a-f0-9-]{36}"))); return File(tripsDir, "$id.json") }
    private fun write(t: JSONObject) {
        val atomic = AtomicFile(tripFile(t.getString("id")))
        val stream = atomic.startWrite()
        try { stream.write(t.toString().toByteArray()); atomic.finishWrite(stream) }
        catch(e: Throwable) { atomic.failWrite(stream); throw e }
    }
    private fun read(id: String) = JSONObject(AtomicFile(tripFile(id)).readFully().toString(Charsets.UTF_8))
    private fun all(): List<JSONObject> = tripsDir.listFiles()?.filter { it.name.endsWith(".json") }?.map { read(it.name.removeSuffix(".json")) }?.sortedBy { it.getString("startedAt") } ?: emptyList()
    private fun active(): JSONObject? = all().firstOrNull { it.getString("phase") in listOf("recording", "stopping", "stopped") }
    private fun draftFile()=AtomicFile(File(root,"draft.json"))
    private fun readDraft():JSONObject = try{JSONObject(draftFile().readFully().toString(Charsets.UTF_8))}catch(_:java.io.FileNotFoundException){JSONObject()}
    suspend fun saveDraft(body:JSONObject):JSONObject = withContext(Dispatchers.IO){lock.withLock {
        val currentId=active()?.getString("id")?:"new"
        if(body.optString("tripId")!=currentId)return@withLock JSONObject().put("saved",false)
        val values=body.optJSONObject("fields")?:JSONObject();val safe=JSONObject()
        for(k in listOf("areaRequest","origin","destination","managementType","orderReference","kmInitial","photoStart","kmFinal","photoEnd","result","observation","supportName","supportDisplayName"))safe.put(k,values.optString(k).take(3000))
        val atomic=draftFile();val stream=atomic.startWrite()
        try{stream.write(JSONObject().put("tripId",currentId).put("fields",safe).toString().toByteArray());atomic.finishWrite(stream)}catch(e:Throwable){atomic.failWrite(stream);throw e}
        JSONObject().put("saved",true)
    }}
    fun photo(name: String): File { require(name.matches(Regex("[a-f0-9-]{36}\\.jpg"))); return File(photosDir,name) }
    fun attachment(name: String): File { require(name.matches(Regex("[a-f0-9-]{36}\\.(jpg|png|webp|pdf)"))); return File(attachmentsDir,name) }
    private fun apiUrl(base: String, action: String) = base.trimEnd('/') + "/api/traccar?action=mobile-" + action
    private fun validBase(raw: String): String {
        val u=URL(raw.trim().trimEnd('/'))
        require(u.userInfo == null && u.query == null && u.ref == null && (u.path.isEmpty() || u.path == "/")) { "Usá la dirección principal de Bitácora KM" }
        val local = u.host == "localhost" || u.host == "127.0.0.1" || u.host.startsWith("192.168.") || u.host.startsWith("10.") || Regex("172\\.(1[6-9]|2[0-9]|3[01])\\..*").matches(u.host)
        require(u.protocol == "https") { "El servidor debe usar HTTPS" }
        return raw.trim().trimEnd('/')
    }
    private fun http(url: String, body: JSONObject?, token: String?): JSONObject {
        val c=URL(url).openConnection() as HttpURLConnection
        c.connectTimeout=15000; c.readTimeout=25000; c.instanceFollowRedirects=false
        c.setRequestProperty("Accept","application/json")
        // Los proxies de zrok con pagina intermedia deben permitir el acceso a las API Android.
        c.setRequestProperty("skip_zrok_interstitial","true")
        token?.let { c.setRequestProperty("x-device-token",it) }
        try {
            if(body!=null){c.requestMethod="POST";c.doOutput=true;c.setRequestProperty("Content-Type","application/json");c.outputStream.use{it.write(body.toString().toByteArray())}}
            val status=c.responseCode
            val raw=(if(status in 200..299)c.inputStream else c.errorStream)?.bufferedReader()?.use{it.readText()} ?: "{}"
            val result=try{JSONObject(raw)}catch(_:Exception){JSONObject()}
            if(status !in 200..299)throw IllegalStateException(result.optString("error","Servidor no disponible ($status)"))
            return result
        } finally { c.disconnect() }
    }
    private fun sessionHttp(url:String, method:String="GET", body:JSONObject?=null, cookie:String="", token:String?=null):SessionCall {
        val c=URL(url).openConnection() as HttpURLConnection
        c.connectTimeout=15000;c.readTimeout=25000;c.instanceFollowRedirects=false;c.requestMethod=method
        c.setRequestProperty("Accept","application/json")
        // Los proxies de zrok con pagina intermedia deben permitir el acceso a las API Android.
        c.setRequestProperty("skip_zrok_interstitial","true")
        if(cookie.isNotBlank())c.setRequestProperty("Cookie",cookie)
        token?.let{c.setRequestProperty("x-device-token",it)}
        try {
            if(body!=null){c.doOutput=true;c.setRequestProperty("Content-Type","application/json");c.outputStream.use{it.write(body.toString().toByteArray())}}
            val status=c.responseCode
            val setCookies=c.headerFields.entries.filter{it.key?.equals("Set-Cookie",true)==true}.flatMap{it.value?: emptyList()}
            val raw=(if(status in 200..299)c.inputStream else c.errorStream)?.bufferedReader()?.use{it.readText()}?:"{}"
            val result=try{JSONObject(raw)}catch(_:Exception){JSONObject()}
            if(status !in 200..299)throw IllegalStateException(result.optString("error",if(status==401)"Iniciá sesión para continuar" else "Servidor no disponible ($status)"))
            return SessionCall(result,setCookies)
        } finally { c.disconnect() }
    }
    suspend fun configureServer(raw:String):JSONObject=withContext(Dispatchers.IO) { syncLock.withLock { lock.withLock {
        val base=validBase(raw)
        require(active()==null) { "Finalizá el recorrido antes de cambiar el servidor" }
        require(all().none { it.optString("phase") in listOf("recording","stopping","stopped","queued","gps_pending") }) {
            "Sincronizá todas las gestiones pendientes antes de cambiar el servidor"
        }
        require((sharedTracker()?.pendingPositions()?:0L)==0L) { "Sincronizá las ubicaciones pendientes antes de cambiar el servidor" }
        val health=http("$base/api/health",null,null)
        require(health.optBoolean("ok") && health.optBoolean("database")) { "La dirección no responde como Bitácora KM con PostgreSQL" }
        val c=config()
        if(c.has("profile")) {
            val fresh=http(apiUrl(base,"profile"),null,c.getString("token")).getJSONObject("profile")
            require(fresh.getString("id")==c.getJSONObject("profile").getString("id")) { "Este servidor no tiene la misma asignación. Contactá a Auditoría." }
            c.put("profile",fresh).put("baseUrl",base)
            saveConfig(c)
        }
        check(prefs.edit().putString("server_url",base).commit()) { "No se pudo guardar el servidor" }
        if(c.has("profile"))tracker()
        JSONObject().put("serverUrl",base)
    } } }
    suspend fun authState(cookie:String):SessionCall=withContext(Dispatchers.IO){
        require(serverUrl().isNotBlank()) { "Configurá la dirección HTTPS del servidor" }
        val c=config()
        sessionHttp(apiUrl(serverUrl(),"session"),cookie=cookie,token=c.optString("token").takeIf{it.isNotBlank()})
    }
    suspend fun switchProfile(cookie:String,body:JSONObject):SessionCall=withContext(Dispatchers.IO){syncLock.withLock{lock.withLock{
        require(active()==null){"Finalizá el recorrido activo antes de cambiar de colaborador"}
        require(all().none{it.getString("phase") in listOf("queued","gps_pending")}){"Sincronizá las gestiones pendientes antes de cambiar de colaborador"}
        require((sharedTracker()?.pendingPositions()?:0L)==0L){"Sincronizá las ubicaciones pendientes antes de cambiar de colaborador"}
        val c=config();val base=validBase(serverUrl())
        val enrolled=c.has("profile")
        val token=c.optString("token").ifEmpty { ByteArray(32).also{SecureRandom().nextBytes(it)}.joinToString(""){"%02x".format(it)} }
        c.put("baseUrl",base).put("token",token);saveConfig(c)
        val payload=JSONObject(body.toString())
        val result=if(!enrolled){
            payload.put("deviceToken",token)
            sessionHttp(apiUrl(base,"enroll"),"POST",payload,cookie,token)
        } else {
            try {
                sessionHttp(apiUrl(base,"session"),"POST",payload,cookie,token)
            } catch(e: IllegalStateException) {
                // Tras migrar PostgreSQL, la sesion puede seguir vigente, pero el
                // telefono todavia no figura en km_mobile_devices del servidor nuevo.
                // Solo este rechazo especifico habilita el alta con la sesion
                // autenticada y los permisos de colaborador verificados en servidor.
                if(e.message!="Dispositivo no autorizado") throw e
                payload.put("deviceToken",token)
                sessionHttp(apiUrl(base,"enroll"),"POST",payload,cookie,token)
            }
        }
        c.put("profile",result.data.getJSONObject("profile"));c.remove("gps");saveConfig(c)
        prefs.edit().remove("lastError").apply()
        tracker();scheduleSync();result
    }}}
    // Reconecta exclusivamente la misma asignación al servidor autorizado.
    // Conserva el token del teléfono, las gestiones, las fotos y la cola GPS.
    // No debe usarse para cambiar de colaborador ni para migrar un servidor.
    suspend fun reconnectCurrentDevice(cookie:String):SessionCall=withContext(Dispatchers.IO){syncLock.withLock{lock.withLock{
        val c=config()
        val prior=c.optJSONObject("profile")
            ?: throw IllegalStateException("Primero elegí el colaborador de este teléfono")
        val token=c.optString("token")
        require(token.matches(Regex("^[a-f0-9]{64}$"))) {
            "Falta la identificación del teléfono. Contactá a Auditoría; no borrés los recorridos."
        }
        val base=validBase(serverUrl())
        require(c.optString("baseUrl")==base) {
            "Este teléfono tiene gestiones de otra dirección de servidor. Contactá a Auditoría; no borrés los recorridos."
        }
        val company=prior.getString("company")
        val employeeId=prior.getJSONObject("employee").getString("id")
        val vehicleId=prior.getJSONObject("vehicle").getString("id")
        val payload=JSONObject().put("company",company).put("employeeId",employeeId)
            .put("vehicleId",vehicleId).put("deviceToken",token)
        val response=sessionHttp(apiUrl(base,"enroll"),"POST",payload,cookie,token)
        val fresh=response.data.getJSONObject("profile")
        require(fresh.getString("company")==company &&
            fresh.getJSONObject("employee").getString("id")==employeeId &&
            fresh.getJSONObject("vehicle").getString("id")==vehicleId) {
            "El servidor devolvió otra asignación. Contactá a Auditoría; los datos siguen guardados."
        }
        c.put("profile",fresh)
        saveConfig(c)
        prefs.edit().putString("lastError","").apply()
        // No restablecer tracker() ni limpiar su buffer: los puntos GPS quedan intactos.
        scheduleSync()
        response
    }}}
    suspend fun logoutSession(cookie:String):SessionCall=withContext(Dispatchers.IO){
        val base=serverUrl();sessionHttp(base+"/api/session?action=logout","POST",null,cookie,null)
    }
    suspend fun changePassword(cookie:String,body:JSONObject):SessionCall=withContext(Dispatchers.IO){
        sessionHttp(serverUrl()+"/api/session?action=password","POST",body,cookie,null)
    }
    suspend fun odometerDetails(id:String):JSONObject=withContext(Dispatchers.IO){lock.withLock{
        val trip=read(id);val f=trip.getJSONObject("fields")
        require(trip.getString("phase") in listOf("recording","stopped","queued")){"Esta gestión ya fue enviada. Solicitá la revisión a Auditoría."}
        val result=JSONObject().put("id",id).put("phase",trip.getString("phase")).put("kmInitial",f.optString("kmInitial")).put("kmFinal",f.optString("kmFinal"))
        for((key,name) in listOf("photoStart" to f.optString("photoStart"),"photoEnd" to f.optString("photoEnd"))){
            if(name.isNotBlank()&&photo(name).isFile)result.put(key,"data:image/jpeg;base64,"+android.util.Base64.encodeToString(photo(name).readBytes(),android.util.Base64.NO_WRAP))
        }
        result
    }}
    suspend fun correctOdometer(body:JSONObject):JSONObject=withContext(Dispatchers.IO){syncLock.withLock{lock.withLock{
        val id=body.getString("id");val original=read(id)
        if(original.getString("phase")=="queued"){
            val c=config()
            val receipt=try{http(apiUrl(c.getString("baseUrl"),"receipt")+"?id="+id,null,c.getString("token"))}catch(_:Exception){null}
            require(receipt?.optBoolean("received")!=true){"La gestión ya llegó al servidor. Solicitá la revisión a Auditoría."}
        }
        val corrected=OdometerCorrection.apply(original,body.optString("kmInitial"),body.optString("kmFinal"),body.optString("reason"),now())
        write(corrected)
        // The draft may contain a final photo or observation that has not yet been submitted.
        val draft=readDraft()
        if(draft.optString("tripId")==id){
            val f=draft.optJSONObject("fields")?:JSONObject();f.put("kmInitial",body.optString("kmInitial"))
            f.put("kmFinal",body.optString("kmFinal"))
            draft.put("fields",f);val atomic=draftFile();val stream=atomic.startWrite()
            try{stream.write(draft.toString().toByteArray());atomic.finishWrite(stream)}catch(e:Throwable){atomic.failWrite(stream);throw e}
        }
        if(corrected.getString("phase")=="queued")scheduleSync()
        JSONObject().put("saved",true).put("id",id)
    }}}
    private suspend fun tracker(): Tracker {
        val c=config(); require(c.has("token")) { "Iniciá sesión y elegí el colaborador" }
        // Mantener alta precisión y el servicio GPS en primer plano, sin bloqueo de CPU continuo.
        // Intervalo de 8 s: menor carga y calor que 5 s sin perder el muestreo de giros habituales.
        // No usar distanceMeters>0: el SDK cambia internamente a intervalo 0.
        val cfg=Config(serverUrl=apiUrl(c.getString("baseUrl"),"position"),deviceId=c.getString("token"),uploadToken=null,buffer=true,wakeLock=GpsPolicy.WAKE_LOCK_ENABLED,location=LocationConfig(accuracy=Accuracy.HIGH,distanceMeters=0,intervalSeconds=GpsPolicy.INTERVAL_SECONDS,stopDetection=false),notification=NotificationConfig(text="Bitácora KM · recorrido GPS activo"))
        val old=sharedTracker()
        return if(old==null)sharedTracker(cfg) else if(old.config!=cfg)old.updateConfig(cfg) else old
    }
    suspend fun initialize(ctx: Context) {
        context=ctx.applicationContext
        lock.withLock {
            if(config().has("token")) {
                val t=tracker()
                val pending=active()
                if(pending==null || pending.getString("phase") != "recording") {
                    t.stop()
                    if(pending?.getString("phase")=="stopping") { pending.put("phase","stopped");write(pending) }
                }
            }
        }
        val constraints=Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
        val periodic=PeriodicWorkRequestBuilder<SyncWorker>(15,TimeUnit.MINUTES).setConstraints(constraints).build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork("bitacora-periodic",ExistingPeriodicWorkPolicy.KEEP,periodic)
        scheduleSync()
        // Al abrir la app, intenta sacar inmediatamente cualquier gestión que haya quedado
        // guardada localmente. WorkManager queda como respaldo, no como único disparador.
        if(config().has("profile")) {
            try { sync() } catch(_:Exception) {}
        }
    }
    fun scheduleSync() {
        val work=OneTimeWorkRequestBuilder<SyncWorker>().setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).setBackoffCriteria(BackoffPolicy.EXPONENTIAL,30,TimeUnit.SECONDS).build()
        WorkManager.getInstance(context).enqueueUniqueWork("bitacora-sync",ExistingWorkPolicy.KEEP,work)
    }
    suspend fun activate(base: String, code: String): JSONObject = withContext(Dispatchers.IO) {
        lock.withLock {
            require(all().isEmpty()) { "Este teléfono conserva recorridos. No borres ni reemplaces su activación." }
            val baseUrl=validBase(base)
            // El token se genera y persiste ANTES de activar: un corte de red permite repetir sin perder la cuenta.
            val previous=config();val token=previous.optString("token").ifEmpty { ByteArray(32).also{SecureRandom().nextBytes(it)}.joinToString(""){"%02x".format(it)} }
            saveConfig(JSONObject().put("baseUrl",baseUrl).put("token",token))
            val response=http(apiUrl(baseUrl,"activate"),JSONObject().put("code",code.trim().lowercase()).put("deviceToken",token),null)
            val saved=JSONObject().put("baseUrl",baseUrl).put("token",token).put("profile",response.getJSONObject("profile"))
            saveConfig(saved);tracker();response.getJSONObject("profile")
        }
    }
    suspend fun state(): JSONObject = withContext(Dispatchers.IO) {
        lock.withLock {
            val records=all();val c=config();val t=if(c.has("profile"))tracker() else null
            val pendingGps=t?.pendingPositions() ?: 0
            val a=active()
            val fix=t?.state?.value?.lastAcceptedLocation
            val fixInTrip=fix?.takeIf { a?.optString("phase")=="recording" && it.time>=timestamp(a.getString("startedAt")) }
            val savedDraft=readDraft().takeIf{it.optString("tripId")== (a?.getString("id")?:"new")}
            JSONObject().put("configured",c.has("profile")).put("baseUrl",c.optString("baseUrl",serverUrl())).put("serverUrl",serverUrl())
                .put("appVersion",BuildConfig.VERSION_NAME)
                .put("locationEnabled",locationEnabled()).put("locationPermission",locationPermissionGranted())
                .put("batteryOptimizationRestricted",batteryOptimizationRestricted())
                .put("profile",c.optJSONObject("profile")?:JSONObject()).put("active",a?:JSONObject.NULL)
                .put("draft",savedDraft?.optJSONObject("fields")?:JSONObject())
                .put("tracking",t?.state?.value?.enabled ?: false).put("pendingGps",pendingGps)
                .put("gpsAccuracy",fixInTrip?.accuracy?:JSONObject.NULL)
                .put("gpsAgeSeconds",fixInTrip?.let { ((System.currentTimeMillis()-it.time)/1000).coerceAtLeast(0) }?:JSONObject.NULL)
                .put("pendingTrips",records.count { it.getString("phase")=="queued" })
                .put("pendingGpsFinal",records.count { it.getString("phase")=="gps_pending" })
                .put("lastSyncError",prefs.getString("lastError","")).put("trips",JSONArray(records.reversed().take(30).map{
                    JSONObject().put("id",it.getString("id")).put("phase",it.getString("phase")).put("startedAt",it.getString("startedAt")).put("origin",it.getJSONObject("fields").optString("origin")).put("destination",it.getJSONObject("fields").optString("destination")).put("kmInitial",it.getJSONObject("fields").optString("kmInitial")).put("kmFinal",it.getJSONObject("fields").optString("kmFinal")).put("lastSyncError",it.optString("lastSyncError"))
                }))
        }
    }
    suspend fun start(activity: android.app.Activity, fields: JSONObject): String = lock.withLock {
        require(config().has("profile")) { "Iniciá sesión y elegí el colaborador" }
        require(active()==null) { "Completá el recorrido pendiente" }
        require(config().optString("baseUrl")==serverUrl()) { "Este teléfono conserva la conexión anterior. Entrá a Cambiar colaborador y confirmá la asignación para conectarlo al servidor actual. Los datos guardados no se borrarán." }
        for(k in listOf("areaRequest","origin","destination","kmInitial","photoStart"))require(fields.optString(k).isNotBlank()) { "Falta $k" }
        val km=fields.getString("kmInitial").toDouble();require(km.isFinite()&&km>=0) { "Odómetro inicial inválido" }
        require(photo(fields.getString("photoStart")).isFile) { "Tomá la foto inicial" }
        val allowed=JSONObject();for(k in listOf("areaRequest","origin","destination","kmInitial","photoStart","managementType","orderReference"))allowed.put(k,fields.optString(k).take(3000))
        check(locationEnabled()) { "La ubicación del teléfono está apagada. Tocá Activar ubicación y volvé a iniciar antes de moverte. El recorrido no se inició." }
        val id=UUID.randomUUID().toString();val t=tracker()
        val startedAt: String
        // Solo guardar el inicio cuando los permisos, el interruptor y un punto nuevo estén listos.
        try {
            t.startTracking(activity)
            check(locationEnabled() && locationPermissionGranted()) { "Falta activar la ubicación precisa y permitirla todo el tiempo. El recorrido no se inició." }
            startedAt=now()
            check(t.requestPosition("trip-start", notBefore=timestamp(startedAt))) { "Todavía no hay una ubicación GPS precisa. Activá Ubicación, salí a un lugar abierto y volvé a iniciar antes de moverte." }
            check(locationEnabled() && locationPermissionGranted()) { "La ubicación se desactivó durante el inicio. Activala y volvé a intentar. El recorrido no se inició." }
        } catch(e:Exception) { t.stop();throw e }
        try { withContext(Dispatchers.IO) { write(JSONObject().put("id",id).put("phase","recording").put("startedAt",startedAt).put("fields",allowed)) } }
        catch(e:Throwable){t.stop();throw e}
        withContext(Dispatchers.IO){draftFile().delete()}
        scheduleSync();id
    }
    suspend fun stop(): JSONObject = lock.withLock {
        val a=active()?:throw IllegalStateException("No hay recorrido activo")
        if(a.getString("phase")=="recording") {
            val t=tracker()
            // Solicita un último fix antes de fijar la hora final para que ese punto quede dentro del recorrido.
            val endFix=if(!locationEnabled() || !locationPermissionGranted()) false else try { t.requestPosition("trip-end") } catch(e:Exception) {
                if(e is kotlinx.coroutines.CancellationException)throw e
                false
            }
            // Diario de cierre: al reabrir o reiniciar se completa la detención pendiente.
            a.put("endedAt",now()).put("phase","stopping").put("gpsEndFix",endFix)
            withContext(Dispatchers.IO){write(a)}
            t.stop()
            a.put("phase","stopped");withContext(Dispatchers.IO){write(a)}
        }
        a
    }
    suspend fun finish(fields: JSONObject): JSONObject {
        val a=stop()
        return withContext(Dispatchers.IO) { lock.withLock {
            val current=read(a.getString("id"));val f=current.getJSONObject("fields")
            val km=fields.optString("kmFinal").toDoubleOrNull()
            require(km!=null&&km.isFinite()&&km>=f.getString("kmInitial").toDouble()) { "Odómetro final inválido" }
            require(photo(fields.optString("photoEnd")).isFile) { "Tomá la foto final" }
            val support=fields.optString("supportName")
            if(support.isNotBlank()) {
                val file=attachment(support);require(file.isFile&&file.length()<=EvidenceTypes.MAX_BYTES){"El soporte adicional no está disponible o supera 3 MB"}
                require(EvidenceTypes.type(file.readBytes())!=null){"Formato del soporte no admitido"}
            }
            for(k in listOf("kmFinal","photoEnd","result","observation","supportName","supportDisplayName"))f.put(k,fields.optString(k).take(3000))
            current.put("phase","queued");write(current);draftFile().delete();scheduleSync()
            JSONObject().put("id",current.getString("id")).put("savedLocally",true)
        } }
    }
    private fun upload(c: JSONObject, company: String, name: String, kind: String): String {
        val bytes=(if(kind=="support")attachment(name) else photo(name)).readBytes()
        val mime=EvidenceTypes.type(bytes)?:throw IllegalArgumentException("Archivo local inválido")
        val b=JSONObject().put("company",company).put("kind",kind).put("uploadId",name.substringBeforeLast('.')).put("fileName",name).put("contentType",mime).put("base64",android.util.Base64.encodeToString(bytes,android.util.Base64.NO_WRAP))
        return http(c.getString("baseUrl")+"/api/support",b,c.getString("token")).getString("path")
    }
    suspend fun sync(): Boolean = withContext(Dispatchers.IO) { syncLock.withLock {
        val c=config();if(!c.has("profile"))return@withLock true
        try {
            val fresh=http(apiUrl(c.getString("baseUrl"),"profile"),null,c.getString("token")).getJSONObject("profile")
            c.remove("gps")
            lock.withLock { c.put("profile",fresh);saveConfig(c);tracker() }
            val tracker=lock.withLock{tracker()}
            val queued=lock.withLock { all().filter{it.getString("phase")=="queued"}.map{it.getString("id")} }

            // Nunca bloquear la entrega del comprobante esperando la cola GPS.
            // Persistir las fotos/gestión inmediatamente; si restan posiciones,
            // el servidor marca gps_pending y el trabajador reintenta su finalización.
            var pendingGps=tracker.pendingPositions()
            val failures=mutableListOf<String>()
            PendingTripSync.run(queued, send={id ->
                val t=lock.withLock{read(id)};val fields=t.getJSONObject("fields");val company=fresh.getString("company")
                for((remote,local,kind) in listOf(Triple("odometerStartPath","photoStart","odometer-start"),Triple("odometerEndPath","photoEnd","odometer-end"))) {
                    if(!t.has(remote)) { t.put(remote,upload(c,company,fields.getString(local),kind));lock.withLock{write(t)} }
                }
                if(fields.optString("supportName").isNotBlank()&&!t.has("supportPath")) {
                    t.put("supportPath",upload(c,company,fields.getString("supportName"),"support"));lock.withLock{write(t)}
                }
                pendingGps=tracker.pendingPositions()
                val gpsFlushed=pendingGps==0L
                val body=JSONObject(fields.toString()).put("id",id).put("startedAt",t.getString("startedAt")).put("endedAt",t.getString("endedAt"))
                    .put("odometerStartPath",t.getString("odometerStartPath")).put("odometerEndPath",t.getString("odometerEndPath")).put("gpsFlushed",gpsFlushed)
                body.put("observation",OdometerCorrection.observation(t))
                if(t.has("supportPath"))body.put("supportPath",t.getString("supportPath"))
                val receipt=http(apiUrl(c.getString("baseUrl"),"submit"),body,c.getString("token"))
                check(receipt.getString("id")==id) { "El servidor no confirmó el recorrido" }
                val finalized=receipt.optBoolean("gpsFinalized",false)
                lock.withLock {
                    t.remove("lastSyncError")
                    t.put("phase",if(finalized)"synced" else "gps_pending")
                    if(finalized)t.put("syncedAt",now())
                    write(t)
                }
            }, failed={id,e ->
                val text=e.message?.take(240)?:"No se pudo enviar esta gestión. Se conserva en el teléfono."
                failures.add(text)
                lock.withLock {val failed=read(id);failed.put("lastSyncError",text);write(failed)}
            })

            // Cuando SQLite ya quedó vacío, finaliza los registros que el servidor recibió
            // previamente sin congelar una distancia parcial.
            pendingGps=tracker.pendingPositions()
            if(pendingGps==0L) {
                val waiting=lock.withLock { all().filter{it.getString("phase")=="gps_pending"}.map{it.getString("id")} }
                for(id in waiting) {
                  try {
                    val receipt=http(apiUrl(c.getString("baseUrl"),"finalize"),JSONObject().put("id",id),c.getString("token"))
                    if(receipt.optBoolean("gpsFinalized",false)) {
                        lock.withLock {
                            val t=read(id);t.put("phase","synced").put("syncedAt",now());write(t)
                        }
                    }
                  }catch(e:Exception){
                    if(e is kotlinx.coroutines.CancellationException)throw e
                    failures.add(e.message?.take(240)?:"GPS pendiente de confirmar")
                  }
                }
            }

            val remaining=lock.withLock { all() }
            val unsent=remaining.count{it.getString("phase")=="queued"}
            val gpsWaiting=remaining.count{it.getString("phase")=="gps_pending"}
            pendingGps=tracker.pendingPositions()
            if(unsent>0 || gpsWaiting>0 || pendingGps>0) {
                val msg=when {
                    unsent>0 -> "Quedan $unsent gestiones pendientes de envío. " + (failures.firstOrNull()?:"Se reintentará automáticamente.")
                    gpsWaiting>0 && pendingGps>0 -> "Gestión recibida por el servidor. Quedan $pendingGps ubicaciones GPS por confirmar; la distancia se finalizará automáticamente."
                    gpsWaiting>0 -> "Gestión recibida. La distancia GPS está pendiente de finalizar."
                    else -> "Quedan $pendingGps ubicaciones GPS por confirmar."
                }
                prefs.edit().putString("lastError",msg).apply()
                return@withLock false
            }
            prefs.edit().putString("lastError","").apply()
            true
        } catch(e:Exception) {
            if(e is kotlinx.coroutines.CancellationException)throw e
            prefs.edit().putString("lastError",e.message?.take(240)?:"Sin conexión. Se conservan todos los datos.").apply()
            false
        }
    } }
}
