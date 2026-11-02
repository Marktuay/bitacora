package org.traccar.client

import io.ktor.client.HttpClient
import io.ktor.client.request.forms.submitForm
import io.ktor.client.request.header
import io.ktor.client.statement.HttpResponse
import io.ktor.http.Parameters
import io.ktor.http.isSuccess
import kotlin.coroutines.cancellation.CancellationException
import kotlin.math.round

class HttpUploader(
    private val config: Config,
    private val httpClient: HttpClient,
) : Uploader {

    // Un heartbeat sin coordenadas no es un punto GPS y no debe bloquear la cola.
    override suspend fun upload(position: Position): Boolean = if (config.uploadToken != null && (position.latitude == null || position.longitude == null)) true else try {
        val response: HttpResponse = httpClient.submitForm(
            url = config.serverUrl,
            formParameters = Parameters.build {
                append("id", config.deviceId)
                position.latitude?.let { append("lat", it.toString()) }
                position.longitude?.let { append("lon", it.toString()) }
                // OsmAnd accepts Unix milliseconds. Preserve sub-second boundaries
                // so the initial fix is not rounded to before the trip start.
                append("timestamp", position.time.toString())
                position.accuracy?.let { append("accuracy", it.toString()) }
                position.altitude?.let { append("altitude", it.toString()) }
                position.speed?.let { append("speed", it.toKnots().toString()) }
                position.bearing?.let { append("bearing", it.toString()) }
                position.battery?.let { append("batt", it.toString()) }
                position.charging?.let { append("charge", it.toString()) }
                position.alarm?.let { append("alarm", it) }
            },
        ) { config.uploadToken?.let { header("X-Device-Token", it) } }
        Log.log("Upload response ${response.status.value}")
        response.status.isSuccess()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Throwable) {
        Log.log("Upload error: ${e::class.simpleName}")
        false
    }

    private fun Double.toKnots(): Double = round(this * 1.94384 * 100) / 100
}
