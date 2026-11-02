package ni.bitacorakm.app
import android.app.Application
import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.*

class KmApp: Application() {
    override fun onCreate() {
        super.onCreate();KmStore.context=applicationContext
        CoroutineScope(SupervisorJob()+Dispatchers.IO).launch { KmStore.initialize(applicationContext) }
    }
}
class SyncWorker(context:Context, params:WorkerParameters):CoroutineWorker(context,params) {
    override suspend fun doWork():Result {
        KmStore.context=applicationContext
        return if(KmStore.sync())Result.success() else Result.retry()
    }
}
