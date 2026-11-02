package ni.bitacorakm.app

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.CancellationException

class OdometerCorrectionTest {
    private fun trip(phase:String="stopped")=JSONObject("""{"id":"original-id","phase":"$phase","startedAt":"2026-10-05T15:00:00Z","endedAt":"2026-10-05T15:10:00Z","gpsEndFix":true,"odometerStartPath":"remote/photo.jpg","fields":{"kmInitial":"7234","kmFinal":"1250","photoStart":"original-start.jpg","photoEnd":"original-end.jpg","origin":"Oficina","destination":"Proyecto","observation":"Gestión original"}}""")
    @Test fun correctTypingErrorPreservesEvidenceAndGps() {
        val original=trip();val result=OdometerCorrection.apply(original,"1234","1250","Digitó 7 en vez de 1","now")
        assertEquals("1234",result.getJSONObject("fields").getString("kmInitial"))
        assertEquals("7234",original.getJSONObject("fields").getString("kmInitial"))
        for(key in listOf("id","phase","startedAt","endedAt","gpsEndFix","odometerStartPath"))assertEquals(original.get(key),result.get(key))
        for(key in listOf("photoStart","photoEnd","origin","destination"))assertEquals(original.getJSONObject("fields").get(key),result.getJSONObject("fields").get(key))
        assertEquals("7234",result.getJSONArray("odometerCorrections").getJSONObject(0).getString("initialBefore"))
        assertTrue(OdometerCorrection.observation(result).contains("Digitó 7 en vez de 1"))
    }
    @Test fun activeTripCanCorrectInitialBeforeFinalIsAvailable() {
        val result=OdometerCorrection.apply(trip("recording"),"1234","","Error de digitación","now")
        assertEquals("recording",result.getString("phase"));assertEquals("",result.getJSONObject("fields").getString("kmFinal"))
    }
    @Test fun invalidOrAlreadyReceivedTripCannotChange() {
        for(args in listOf(Triple("stopped","1300","1250"),Triple("queued","1234",""),Triple("synced","1234","1250"),Triple("gps_pending","1234","1250"),Triple("stopped","NaN","1250"),Triple("stopped","-1","1250"))) {
            val original=trip(args.first);val before=original.toString()
            try { OdometerCorrection.apply(original,args.second,args.third,"Error de digitación","now");fail("Invalid correction accepted") }catch(_:IllegalArgumentException){}
            assertEquals(before,original.toString())
        }
    }
    @Test fun oneInvalidTripDoesNotBlockLaterTrips()=runBlocking {
        val accepted=mutableListOf<String>();val failed=mutableListOf<String>()
        PendingTripSync.run(listOf("invalid-odometer","valid-trip"),send={id->if(id=="invalid-odometer")throw IllegalStateException("Odómetro inválido");accepted.add(id)},failed={id,_->failed.add(id)})
        assertEquals(listOf("valid-trip"),accepted);assertEquals(listOf("invalid-odometer"),failed)
    }
    @Test fun cancellationNeverMarksATripAsAnUploadError()=runBlocking {
        var marked=false
        try{PendingTripSync.run(listOf("trip"),send={throw CancellationException()},failed={_,_->marked=true});fail("Cancellation swallowed")}catch(_:CancellationException){}
        assertFalse(marked)
    }
}
