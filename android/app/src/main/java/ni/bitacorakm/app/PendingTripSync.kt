package ni.bitacorakm.app

import kotlinx.coroutines.CancellationException

object PendingTripSync {
    suspend fun run(ids: List<String>, send: suspend (String)->Unit, failed: suspend (String,Exception)->Unit) {
        for(id in ids) {
            try { send(id) }
            catch(e:Exception) {
                if(e is CancellationException)throw e
                failed(id,e)
            }
        }
    }
}
