package ni.bitacorakm.app

import org.json.JSONArray
import org.json.JSONObject

object OdometerCorrection {
    fun apply(original: JSONObject, initial: String, final: String, reason: String, at: String): JSONObject {
        val phase=original.getString("phase")
        require(phase in listOf("recording","stopped","queued")) { "Esta gestión ya fue enviada. Solicitá la revisión a Auditoría." }
        val start=initial.toDoubleOrNull()
        val end=final.takeIf { it.isNotBlank() }?.toDoubleOrNull()
        require(start!=null&&start.isFinite()&&start>=0) { "El odómetro inicial debe ser un número válido, igual o mayor a cero" }
        require(final.isBlank()||end!=null&&end.isFinite()) { "El odómetro final debe ser un número válido" }
        require(phase!="queued"||end!=null) { "Completá el odómetro final" }
        require(end==null||end>=start) { "El odómetro final debe ser igual o mayor al inicial. Corregí el valor según las fotos." }
        require(reason.trim().length in 3..300) { "Indicá el motivo de la corrección (3 a 300 caracteres)" }
        val trip=JSONObject(original.toString())
        val fields=trip.getJSONObject("fields")
        if(fields.optString("kmInitial")==initial&&fields.optString("kmFinal")==final)return trip
        val history=trip.optJSONArray("odometerCorrections")?:JSONArray()
        history.put(JSONObject().put("at",at).put("initialBefore",fields.optString("kmInitial")).put("finalBefore",fields.optString("kmFinal")).put("initialAfter",initial).put("finalAfter",final).put("reason",reason.trim()))
        fields.put("kmInitial",initial).put("kmFinal",final)
        trip.put("odometerCorrections",history).remove("lastSyncError")
        return trip
    }
    fun observation(trip: JSONObject): String {
        val history=trip.optJSONArray("odometerCorrections")?:return trip.getJSONObject("fields").optString("observation")
        val notes=(maxOf(0,history.length()-4) until history.length()).joinToString("\n") { index ->
            val h=history.getJSONObject(index)
            "Corrección odómetro ${h.optString("at")}: inicial ${h.optString("initialBefore")} → ${h.optString("initialAfter")}; final ${h.optString("finalBefore").ifBlank{"pendiente"}} → ${h.optString("finalAfter").ifBlank{"pendiente"}}. ${h.optString("reason")}."
        }
        return (trip.getJSONObject("fields").optString("observation").take(1000)+"\n"+notes).trim().take(3000)
    }
}
