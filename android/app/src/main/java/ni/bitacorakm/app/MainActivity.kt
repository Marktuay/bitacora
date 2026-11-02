package ni.bitacorakm.app

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import androidx.exifinterface.media.ExifInterface
import android.content.Intent
import android.content.ClipData
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.provider.Settings
import android.util.AtomicFile
import android.webkit.*
import android.widget.*
import androidx.activity.ComponentActivity
import androidx.activity.addCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.FileProvider
import androidx.webkit.*
import kotlinx.coroutines.*
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.UUID

class MainActivity:ComponentActivity() {
    private val scope=MainScope()
    private lateinit var web:WebView
    private var cameraRequest:CompletableDeferred<Boolean>?=null
    private var attachmentRequest:CompletableDeferred<Uri?>?=null
    private val attachmentPicker=registerForActivityResult(ActivityResultContracts.OpenDocument()){uri->attachmentRequest?.complete(uri);attachmentRequest=null}
    private var exportBytes:ByteArray?=null
    private val exportDocument=registerForActivityResult(ActivityResultContracts.StartActivityForResult()){result->
        val bytes=exportBytes;exportBytes=null
        val uri=result.data?.data
        if(result.resultCode==RESULT_OK&&uri!=null&&bytes!=null)scope.launch {
            try{withContext(Dispatchers.IO){contentResolver.openOutputStream(uri)?.use{it.write(bytes)}?:error("No se pudo guardar el archivo")};Toast.makeText(this@MainActivity,"Reporte guardado",Toast.LENGTH_LONG).show()}
            catch(e:Exception){Toast.makeText(this@MainActivity,e.message,Toast.LENGTH_LONG).show()}
        }
    }
    private val camera=registerForActivityResult(ActivityResultContracts.TakePicture()){ok->cameraRequest?.complete(ok);cameraRequest=null}
    private val local="https://appassets.androidplatform.net/assets/mobile.html"
    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(state:Bundle?) {
        super.onCreate(state)
        val layout=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(0,36,0,18)}
        web=WebView(this);layout.addView(web,LinearLayout.LayoutParams(-1,0,1f));setContentView(layout)
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            setContentView(TextView(this).apply {
                text="Actualizá Android System WebView y Chrome desde Play Store, y volvé a abrir Bitácora KM. Este teléfono todavía no admite la conexión segura del formulario con el GPS."
                setPadding(32,80,32,32); textSize=18f
            })
            return
        }
        web.settings.javaScriptEnabled=true;web.settings.domStorageEnabled=true
        web.settings.userAgentString="BitacoraKM/"+BuildConfig.VERSION_NAME+" (Android; NewCentury)"
        web.settings.allowFileAccess=false;web.settings.allowContentAccess=false
        web.settings.mixedContentMode=WebSettings.MIXED_CONTENT_NEVER_ALLOW
        CookieManager.getInstance().apply { setAcceptCookie(true); setAcceptThirdPartyCookies(web,false) }
        val loader=WebViewAssetLoader.Builder().addPathHandler("/assets/",WebViewAssetLoader.AssetsPathHandler(this)).build()
        web.webViewClient=object:WebViewClient(){
            override fun shouldInterceptRequest(view:WebView,request:WebResourceRequest):WebResourceResponse?=loader.shouldInterceptRequest(request.url)
            override fun shouldOverrideUrlLoading(view:WebView,request:WebResourceRequest):Boolean {
                val scheme=request.url.scheme
                if(scheme!="https" && !(BuildConfig.DEBUG&&scheme=="http"))return true
                return false
            }
            override fun onReceivedError(v:WebView,r:WebResourceRequest,e:WebResourceError){if(r.isForMainFrame&&r.url.host!="appassets.androidplatform.net")Toast.makeText(this@MainActivity,"Sin conexión al servidor. Mi recorrido sigue disponible.",Toast.LENGTH_LONG).show()}
            override fun onPageFinished(view:WebView,url:String){
                super.onPageFinished(view,url)
                if(isLoginCallback(url)) {
                    view.loadUrl(local)
                } else if(isServerLoginPage(url)) {
                    // El APK garantiza este control aun si Android conserva login.js en caché.
                    // Solo se ejecuta en /login del origen HTTPS de la Bitácora.
                    view.evaluateJavascript(SHOW_LOGIN_PASSWORD_JS,null)
                }
            }
        }
        web.webChromeClient=object:WebChromeClient(){
            override fun onJsAlert(v:WebView,url:String,message:String,result:JsResult):Boolean {android.app.AlertDialog.Builder(this@MainActivity).setMessage(message).setPositiveButton("Aceptar"){_,_->result.confirm()}.setOnCancelListener{result.cancel()}.show();return true}
        }
        if(!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            Toast.makeText(this,"Actualizá Android System WebView para usar Bitácora KM",Toast.LENGTH_LONG).show();return
        }
        WebViewCompat.addWebMessageListener(web,"NativeKM",setOf("https://appassets.androidplatform.net")){_,message,origin,isMainFrame,reply->
            if(!isMainFrame||origin.host!="appassets.androidplatform.net")return@addWebMessageListener
            scope.launch {
                var id=""
                try {
                    val m=JSONObject(message.data?:"{}");id=m.getString("id");val b=m.optJSONObject("body")?:JSONObject()
                    val data:Any=when(m.getString("action")){
                        "state"->KmStore.state()
                        "location-settings"->{
                            val intent=if(!KmStore.locationEnabled()) Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)
                                else Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:$packageName"))
                            startActivity(intent);JSONObject().put("opened",true)
                        }
                        "battery-settings"->{
                            startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:$packageName")))
                            JSONObject().put("opened",true)
                        }
                        "server"->KmStore.configureServer(b.getString("url"))
                        "auth"->{
                            KmStore.adoptCorporateEndpoint()
                            val base=KmStore.serverUrl();val result=KmStore.authState(cookieHeader(base));applyCookies(base,result.cookies);result.data
                        }
                        "switch"->{
                            val base=KmStore.serverUrl();val result=KmStore.switchProfile(cookieHeader(base),b);applyCookies(base,result.cookies);result.data
                        }
                        "reconnect"->{
                            val base=KmStore.serverUrl()
                            val result=KmStore.reconnectCurrentDevice(cookieHeader(base))
                            applyCookies(base,result.cookies)
                            result.data
                        }
                        "login"->{
                            web.post{web.loadUrl(loginUrl())};JSONObject().put("navigating",true)
                        }
                        "logout"->{
                            val base=KmStore.serverUrl();val result=KmStore.logoutSession(cookieHeader(base));applyCookies(base,result.cookies);web.post{web.loadUrl(local)};JSONObject().put("navigating",true)
                        }
                        "photo"->takePhoto()
                        "attachment"->pickAttachment()
                        "draft"->KmStore.saveDraft(b)
                        "odometer-details"->KmStore.odometerDetails(b.getString("id"))
                        "correct-odometer"->KmStore.correctOdometer(b)
                        "password"->{
                            val base=KmStore.serverUrl();val result=KmStore.changePassword(cookieHeader(base),b);applyCookies(base,result.cookies);result.data
                        }
                        "start"->JSONObject().put("id",KmStore.start(this@MainActivity,b))
                        "stop"->KmStore.stop()
                        "finish"->KmStore.finish(b)
                        "sync"->{val ok=KmStore.sync();val s=KmStore.state();JSONObject().put("success",ok).put("pendingTrips",s.optInt("pendingTrips")).put("pendingGps",s.optLong("pendingGps")).put("pendingGpsFinal",s.optInt("pendingGpsFinal")).put("lastSyncError",s.optString("lastSyncError"))}
                        "download"->downloadPersonalReport(b)
                        "open"->{
                            if(b.getString("page")=="audit"){
                                val base=KmStore.serverUrl();val session=KmStore.authState(cookieHeader(base));applyCookies(base,session.cookies)
                                require(session.data.optBoolean("admin") || (session.data.optJSONArray("managedCompanies")?.length()?:0)>0){"Permiso de revisión requerido"}
                            }
                            val s=KmStore.state();val target=when(b.getString("page")){"recovery"->KmStore.serverUrl()+"/recuperar.html?mobile=1";"gps"->s.getString("baseUrl")+"/reportes";"reports"->s.getString("baseUrl")+"/reportes";"audit"->s.getString("baseUrl")+"/auditoria";else->throw IllegalArgumentException("Página inválida")}
                            require(target.startsWith("https://")||BuildConfig.DEBUG&&target.startsWith("http://")){"Informática debe configurar la dirección del servidor GPS"};enableExports(target);web.loadUrl(target);JSONObject().put("ok",true)
                        }
                        else->throw IllegalArgumentException("Operación inválida")
                    }
                    reply.postMessage(JSONObject().put("id",id).put("ok",true).put("data",data).toString())
                }catch(e:Exception){reply.postMessage(JSONObject().put("id",id).put("ok",false).put("error",e.message?:"No se pudo completar la operación").toString())}
            }
        }
        onBackPressedDispatcher.addCallback(this){if(web.url!=local)web.loadUrl(local) else moveTaskToBack(true)}
        web.loadUrl(local)
    }
    override fun onResume() {
        super.onResume()
        // WorkManager envía los recorridos automáticamente cuando vuelve la conexión.
        KmStore.scheduleSync()
        if(::web.isInitialized)web.post {
            if(web.url==local)web.evaluateJavascript("window.dispatchEvent(new Event('km-resume'))",null)
        }
    }
    private fun cookieHeader(base:String):String=CookieManager.getInstance().getCookie(base).orEmpty()
    private fun applyCookies(base:String,cookies:List<String>){
        if(cookies.isEmpty())return
        val manager=CookieManager.getInstance();cookies.forEach{manager.setCookie(base,it)};manager.flush()
    }
    private fun loginUrl():String=KmStore.serverUrl().trimEnd('/')+"/login.html?next=%2Fmobile-auth.html"
    private fun isServerLoginPage(raw:String):Boolean=try{
        val current=Uri.parse(raw)
        val server=Uri.parse(KmStore.serverUrl())
        current.scheme==server.scheme&&current.host==server.host&&current.port==server.port&&
            (current.path=="/login.html"||current.path=="/login")
    }catch(_:Exception){false}
    private val SHOW_LOGIN_PASSWORD_JS = """
      (() => {
        const field=document.getElementById('password');
        if (!field || document.getElementById('showLoginPassword')) return;
        const label=document.createElement('label');
        label.setAttribute('for','showLoginPassword');
        label.style.cssText='display:flex;align-items:center;gap:9px;margin:12px 0;cursor:pointer;';
        const checkbox=document.createElement('input');
        checkbox.id='showLoginPassword';
        checkbox.type='checkbox';
        checkbox.style.cssText='width:auto;min-width:18px;min-height:18px;';
        const text=document.createElement('span');
        text.textContent='Mostrar contraseña';
        label.append(checkbox,text);
        const row=field.closest('.field');
        if(row)row.insertAdjacentElement('afterend',label);
        else field.insertAdjacentElement('afterend',label);
        checkbox.addEventListener('change',()=>{
          field.type=checkbox.checked?'text':'password';
        });
      })();
    """.trimIndent()

    private fun isLoginCallback(raw:String):Boolean=try{
        val current=Uri.parse(raw);val server=Uri.parse(KmStore.serverUrl())
        current.scheme==server.scheme&&current.host==server.host&&current.port==server.port&&current.path=="/mobile-auth.html"
    }catch(_:Exception){false}
    private suspend fun pickAttachment():JSONObject {
        check(attachmentRequest==null){"Ya hay un archivo en selección"}
        val deferred=CompletableDeferred<Uri?>();attachmentRequest=deferred
        attachmentPicker.launch(arrayOf("image/jpeg","image/png","image/webp","application/pdf"))
        val uri=deferred.await()?:throw IllegalArgumentException("Selección cancelada")
        return withContext(Dispatchers.IO) {
            var displayName="Soporte de gestión"
            contentResolver.query(uri,arrayOf(OpenableColumns.DISPLAY_NAME),null,null,null)?.use { cursor->
                if(cursor.moveToFirst())displayName=cursor.getString(0)?.take(150)?:displayName
            }
            val bytes=contentResolver.openInputStream(uri)?.use { input->
                val output=ByteArrayOutputStream();val chunk=ByteArray(8192)
                while(true){val count=input.read(chunk);if(count<0)break;check(output.size()+count<=EvidenceTypes.MAX_BYTES){"El soporte no debe superar 3 MB"};output.write(chunk,0,count)}
                output.toByteArray()
            }?:throw IllegalArgumentException("No se pudo leer el archivo")
            val mime=EvidenceTypes.type(bytes)?:throw IllegalArgumentException("Usá una foto JPG, PNG o WebP, o un PDF")
            val name=UUID.randomUUID().toString()+"."+EvidenceTypes.extension(mime)
            // Copia inmediata: ya no depende del proveedor de archivos ni de internet.
            val atomic=AtomicFile(KmStore.attachment(name));val stream=atomic.startWrite()
            try{stream.write(bytes);atomic.finishWrite(stream)}catch(e:Throwable){atomic.failWrite(stream);throw e}
            JSONObject().put("name",name).put("displayName",displayName).put("contentType",mime)
        }
    }
    private suspend fun downloadPersonalReport(body:JSONObject):JSONObject {
        check(exportBytes==null){"Primero guardá o cancelá el reporte anterior"}
        val state=KmStore.state();require(state.optBoolean("configured")){"Seleccioná tu colaborador antes de descargar"}
        val profile=state.getJSONObject("profile");val employee=profile.getJSONObject("employee")
        val format=body.optString("format");val from=body.optString("from");val to=body.optString("to")
        require(format in listOf("xlsx","pdf")){"Elegí Excel o PDF"}
        require(from.matches(Regex("\\d{4}-\\d{2}-\\d{2}"))&&to.matches(Regex("\\d{4}-\\d{2}-\\d{2}"))){"Elegí las fechas desde y hasta"}
        val dateFormat=java.text.SimpleDateFormat("yyyy-MM-dd",java.util.Locale.US).apply{isLenient=false;timeZone=java.util.TimeZone.getTimeZone("UTC")}
        val start=dateFormat.parse(from)!!.time;val end=dateFormat.parse(to)!!.time
        require(end>=start&&end-start<=365L*86400000){"Elegí un período válido de hasta un año"}
        val base=KmStore.serverUrl().trimEnd('/');val cookies=cookieHeader(base)
        val query=Uri.Builder().appendQueryParameter("company",profile.getString("company")).appendQueryParameter("employeeId",employee.getString("id")).appendQueryParameter("from",from).appendQueryParameter("to",to).build().encodedQuery
        val result=withContext(Dispatchers.IO){
            val connection=java.net.URL("$base/api/report-$format?$query").openConnection() as java.net.HttpURLConnection
                connection.setRequestProperty("skip_zrok_interstitial","true")
            try{
                connection.connectTimeout=15000;connection.readTimeout=45000;connection.setRequestProperty("Cookie",cookies)
                val status=connection.responseCode
                if(status!=200){
                    val raw=connection.errorStream?.bufferedReader()?.use{it.readText()}.orEmpty()
                    val error=try{JSONObject(raw).optString("error","No se pudo descargar la bitácora")}catch(_:Exception){"No se pudo descargar la bitácora"}
                    throw IllegalStateException(if(status==401)"Iniciá sesión de nuevo para descargar tu bitácora" else error)
                }
                val bytes=connection.inputStream.use{input->
                    val output=ByteArrayOutputStream();val chunk=ByteArray(8192)
                    while(true){val count=input.read(chunk);if(count<0)break;check(output.size()+count<=25*1024*1024){"El reporte es demasiado grande; elegí un período menor"};output.write(chunk,0,count)}
                    output.toByteArray()
                }
                val updated=connection.headerFields.entries.filter{it.key?.equals("Set-Cookie",true)==true}.flatMap{it.value?:emptyList()}
                Pair(bytes,updated)
            }finally{connection.disconnect()}
        }
        applyCookies(base,result.second)
        val name="bitacora-${employee.getString("name")}-${from}-${to}.$format"
        if(body.optBoolean("shareWhatsApp"))return shareReportWhatsApp(result.first,name)
        chooseReportFile(result.first,name)
        return JSONObject().put("choosingLocation",true)
    }
    private fun reportMime(bytes:ByteArray):String=when{
        bytes.size>4&&bytes[0]==0x25.toByte()&&bytes[1]==0x50.toByte()->"application/pdf"
        bytes.size>4&&bytes[0]==0x50.toByte()&&bytes[1]==0x4b.toByte()->"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        else->throw IllegalArgumentException("Formato de reporte no admitido")
    }
    private fun reportName(suggestedName:String,mime:String):String {
        val name=suggestedName.replace(Regex("[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ._ -]"),"_").take(180).trim().ifBlank{"bitacora"}
        return if(name.contains('.'))name else name+if(mime=="application/pdf")".pdf" else ".xlsx"
    }
    private suspend fun shareReportWhatsApp(bytes:ByteArray,suggestedName:String):JSONObject {
        val mime=reportMime(bytes);val name=reportName(suggestedName,mime)
        val packages=listOf("com.whatsapp","com.whatsapp.w4b").filter { target->
            Intent(Intent.ACTION_SEND).setType(mime).setPackage(target).resolveActivity(packageManager)!=null
        }
        if(packages.isEmpty()){
            chooseReportFile(bytes,name)
            return JSONObject().put("choosingLocation",true).put("whatsAppUnavailable",true)
        }
        val file=withContext(Dispatchers.IO){
            val dir=File(cacheDir,"exports/${UUID.randomUUID()}").apply{check(mkdirs()){"No se pudo preparar el reporte"}}
            File(dir,name).apply{writeBytes(bytes)}
        }
        val uri=FileProvider.getUriForFile(this,"$packageName.files",file)
        fun intent(target:String)=Intent(Intent.ACTION_SEND).setType(mime).setPackage(target)
            .putExtra(Intent.EXTRA_STREAM,uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            .apply{clipData=ClipData.newUri(contentResolver,name,uri)}
        val primary=intent(packages.first())
        val outgoing=if(packages.size==1)primary else Intent.createChooser(primary,"Enviar por WhatsApp")
            .putExtra(Intent.EXTRA_INITIAL_INTENTS,arrayOf(intent(packages[1])))
        try{startActivity(outgoing)}catch(_:android.content.ActivityNotFoundException){
            chooseReportFile(bytes,name)
            return JSONObject().put("choosingLocation",true).put("whatsAppUnavailable",true)
        }
        return JSONObject().put("sharingWhatsApp",true)
    }
    private fun chooseReportFile(bytes:ByteArray,suggestedName:String){
        check(exportBytes==null){"Primero guardá o cancelá el reporte anterior"}
        val mime=reportMime(bytes);val name=reportName(suggestedName,mime)
        exportBytes=bytes
        exportDocument.launch(Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime).putExtra(Intent.EXTRA_TITLE,name))
    }
    private fun enableExports(target:String){
        check(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)){"Actualizá Android System WebView para guardar los reportes"}
        val parsed=Uri.parse(target);val origin="${parsed.scheme}://${parsed.encodedAuthority}"
        WebViewCompat.removeWebMessageListener(web,"KMDownload")
        WebViewCompat.addWebMessageListener(web,"KMDownload",setOf(origin)){_,message,source,isMainFrame,_->
            if(!isMainFrame||"${source.scheme}://${source.encodedAuthority}"!=origin)return@addWebMessageListener
            try{
                check(exportBytes==null){"Primero guardá o cancelá el reporte anterior"}
                val obj=JSONObject(message.data?:"{}");val data=obj.getString("data")
                require(data.length<=36*1024*1024){"El reporte es demasiado grande; elegí un período menor"}
                val bytes=android.util.Base64.decode(data,android.util.Base64.DEFAULT)
                chooseReportFile(bytes,obj.optString("name","reporte"))
            }catch(e:Exception){Toast.makeText(this,e.message,Toast.LENGTH_LONG).show()}
        }
        web.setDownloadListener { url,_,disposition,mime,_->
            val uri=Uri.parse(url)
            if(uri.scheme!="blob"&&"${uri.scheme}://${uri.encodedAuthority}"!=origin)return@setDownloadListener
            val name=URLUtil.guessFileName(url,disposition,mime)
            val script="""(async()=>{try{const r=await fetch(${JSONObject.quote(url)},{credentials:'include'});if(!r.ok)throw Error('No se pudo descargar');const b=await r.blob();if(b.size>25*1024*1024)throw Error('Elegí un período menor');const f=new FileReader();f.onload=()=>KMDownload.postMessage(JSON.stringify({name:${JSONObject.quote(name)},data:f.result.split(',')[1]}));f.readAsDataURL(b)}catch(e){alert(e.message)}})()"""
            web.evaluateJavascript(script,null)
        }
    }
    private suspend fun takePhoto():JSONObject {
        check(cameraRequest==null){"Ya hay una foto en proceso"}
        val dir=File(cacheDir,"camera").apply{mkdirs()};val original=File(dir,UUID.randomUUID().toString()+".jpg")
        val uri=FileProvider.getUriForFile(this,"$packageName.files",original)
        val deferred=CompletableDeferred<Boolean>();cameraRequest=deferred;camera.launch(uri)
        check(deferred.await()){"Foto cancelada"}
        return withContext(Dispatchers.IO){
            val options=BitmapFactory.Options().apply{inJustDecodeBounds=true};BitmapFactory.decodeFile(original.path,options)
            var sample=1;while(options.outWidth/sample>2400||options.outHeight/sample>2400)sample*=2
            val decoded=BitmapFactory.decodeFile(original.path,BitmapFactory.Options().apply{inSampleSize=sample})?:throw IllegalArgumentException("No se pudo leer la foto")
            val matrix=Matrix();when(ExifInterface(original.path).getAttributeInt(ExifInterface.TAG_ORIENTATION,ExifInterface.ORIENTATION_NORMAL)){
                ExifInterface.ORIENTATION_ROTATE_90->matrix.postRotate(90f)
                ExifInterface.ORIENTATION_ROTATE_180->matrix.postRotate(180f)
                ExifInterface.ORIENTATION_ROTATE_270->matrix.postRotate(270f)
                ExifInterface.ORIENTATION_FLIP_HORIZONTAL->matrix.postScale(-1f,1f)
                ExifInterface.ORIENTATION_FLIP_VERTICAL->matrix.postScale(1f,-1f)
                ExifInterface.ORIENTATION_TRANSPOSE->{matrix.postRotate(90f);matrix.postScale(-1f,1f)}
                ExifInterface.ORIENTATION_TRANSVERSE->{matrix.postRotate(270f);matrix.postScale(-1f,1f)}
            }
            val oriented=Bitmap.createBitmap(decoded,0,0,decoded.width,decoded.height,matrix,true)
            val longest=maxOf(oriented.width,oriented.height);val ratio=minOf(1.0,1600.0/longest)
            val resized=Bitmap.createScaledBitmap(oriented,(oriented.width*ratio).toInt(),(oriented.height*ratio).toInt(),true)
            val output=ByteArrayOutputStream();resized.compress(Bitmap.CompressFormat.JPEG,90,output)
            val bytes=output.toByteArray();check(bytes.size<3*1024*1024){"La foto supera 3 MB; volvé a tomarla"}
            val name=UUID.randomUUID().toString()+".jpg";val file=KmStore.photo(name)
            file.outputStream().use{it.write(bytes);it.fd.sync()};original.delete()
            if(resized!==decoded&&resized!==oriented)resized.recycle();if(oriented!==decoded)oriented.recycle();decoded.recycle()
            JSONObject().put("name",name).put("preview","data:image/jpeg;base64,"+android.util.Base64.encodeToString(bytes,android.util.Base64.NO_WRAP))
        }
    }
    private fun Int.dp()=(this*resources.displayMetrics.density).toInt()
    override fun onDestroy(){super.onDestroy();scope.cancel();web.destroy()}
}
