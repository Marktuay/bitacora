package ni.bitacorakm.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class GpsPolicyTest {
    @Test fun intervalMaintainsContinuousRouteWithoutFiveSecondPolling() {
        assertEquals(8, GpsPolicy.INTERVAL_SECONDS)
    }

    @Test fun avoidsPersistentCpuWakeLockWhileForegroundServiceTracks() {
        assertFalse(GpsPolicy.WAKE_LOCK_ENABLED)
    }
}
