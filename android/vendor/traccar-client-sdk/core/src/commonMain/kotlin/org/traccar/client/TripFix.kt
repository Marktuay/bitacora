package org.traccar.client

internal fun usableTripFix(position: Position, nowMillis: Long): Boolean =
    position.latitude?.let { it.isFinite() && it in -90.0..90.0 } == true &&
    position.longitude?.let { it.isFinite() && it in -180.0..180.0 } == true &&
    position.accuracy?.let { it.isFinite() && it in 0.0..50.0 } == true &&
    nowMillis - position.time in -1000L..10000L
