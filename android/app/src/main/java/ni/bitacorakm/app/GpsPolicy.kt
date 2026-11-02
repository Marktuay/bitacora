package ni.bitacorakm.app

/**
 * Política de GPS para recorridos activos. La precisión sigue en HIGH;
 * el primer y el último punto se solicitan de forma explícita.
 * El seguimiento usa un servicio Android de primer plano.
 */
internal object GpsPolicy {
    const val INTERVAL_SECONDS = 8
    const val WAKE_LOCK_ENABLED = false
}
