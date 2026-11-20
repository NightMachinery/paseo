package expo.modules.twowayaudio

import BluetoothRouteWait
import DictationCaptureStats
import HeadsetSilenceDetector
import android.media.AudioDeviceInfo
import isBluetoothCommunicationSink
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BluetoothDictationRouteTest {
    @Test
    fun onlyBluetoothHeadsetSinksCanBeSelectedAsCommunicationDevices() {
        assertTrue(isBluetoothCommunicationSink(AudioDeviceInfo.TYPE_BLUETOOTH_SCO, true))
        assertTrue(isBluetoothCommunicationSink(AudioDeviceInfo.TYPE_BLE_HEADSET, true))
        assertFalse(isBluetoothCommunicationSink(AudioDeviceInfo.TYPE_BLUETOOTH_SCO, false))
        assertFalse(isBluetoothCommunicationSink(AudioDeviceInfo.TYPE_BLUETOOTH_A2DP, true))
    }

    @Test
    fun onlyAnAlreadyActiveRouteCanSkipTheWait() {
        assertEquals(BluetoothRouteWait.Start.WAIT, BluetoothRouteWait(deviceId = 24).initialDecision(false))
        assertEquals(
            BluetoothRouteWait.Start.FALLBACK,
            BluetoothRouteWait(deviceId = 24, accepted = false).initialDecision(false)
        )
        assertEquals(
            BluetoothRouteWait.Start.READY,
            BluetoothRouteWait(deviceId = 24, alreadyActive = true).initialDecision(false)
        )
        assertEquals(BluetoothRouteWait.Start.WAIT, BluetoothRouteWait().initialDecision(false))
        assertEquals(BluetoothRouteWait.Start.READY, BluetoothRouteWait().initialDecision(true))
    }

    @Test
    fun modernRouteWaitIgnoresOtherSinksAndScoBroadcasts() {
        val route = BluetoothRouteWait(deviceId = 24)
        assertFalse(route.matchesDevice(null))
        assertFalse(route.matchesDevice(23))
        assertFalse(route.matchesSco(true))
        assertTrue(route.matchesDevice(24))
    }

    @Test
    fun legacyRouteWaitRequiresScoConnected() {
        val route = BluetoothRouteWait()
        assertFalse(route.matchesDevice(24))
        assertFalse(route.matchesSco(false))
        assertTrue(route.matchesSco(true))
    }

    @Test
    fun headsetFallbackRequiresTwoSecondsOfUninterruptedEligibleSilence() {
        val silence = HeadsetSilenceDetector(sampleRate = 16_000)
        assertFalse(silence.add(31_999, true))
        // Any audible buffer, non-headset route or Android-silenced buffer breaks the run.
        assertFalse(silence.add(512, false))
        assertFalse(silence.add(31_999, true))
        assertTrue(silence.add(1, true))
    }

    @Test
    fun captureStatsDistinguishPcmZerosFromDroppedInput() {
        val stats = DictationCaptureStats()
        assertTrue(stats.add(byteArrayOf(0, 0, 0, 0), 4, true))
        assertFalse(stats.add(byteArrayOf(-1, 0, 0, -128), 4, false))
        assertEquals("read=2 peak=32768 rms=16384 zero=1 dropped=1", stats.toString())
    }
}
