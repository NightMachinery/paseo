import android.media.AudioDeviceInfo

internal fun isBluetoothMicrophone(type: Int): Boolean =
    type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO || type == AudioDeviceInfo.TYPE_BLE_HEADSET

internal fun isBluetoothCommunicationSink(type: Int, isSink: Boolean): Boolean =
    isSink && isBluetoothMicrophone(type)

internal class BluetoothRouteWait(
    private val deviceId: Int? = null,
    val accepted: Boolean = true,
    val alreadyActive: Boolean = false,
) {
    enum class Start { READY, WAIT, FALLBACK }

    fun initialDecision(scoConnected: Boolean): Start = when {
        !accepted -> Start.FALLBACK
        alreadyActive || matchesSco(scoConnected) -> Start.READY
        else -> Start.WAIT
    }

    fun matchesDevice(id: Int?): Boolean = deviceId != null && deviceId == id
    fun matchesSco(connected: Boolean): Boolean = deviceId == null && connected

    companion object {
        const val TIMEOUT_MS = 2_000L
    }
}

internal class HeadsetSilenceDetector(sampleRate: Int) {
    private val fallbackSamples = 2 * sampleRate
    private var silentSamples = 0

    fun add(samples: Int, headsetSilence: Boolean): Boolean {
        silentSamples = if (headsetSilence) (silentSamples + samples).coerceAtMost(fallbackSamples) else 0
        return silentSamples >= fallbackSamples
    }
}
