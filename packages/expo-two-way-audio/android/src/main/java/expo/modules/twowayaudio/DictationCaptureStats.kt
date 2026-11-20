import kotlin.math.abs
import kotlin.math.sqrt

internal class DictationCaptureStats {
    private var buffers = 0
    private var zeroBuffers = 0
    private var dropped = 0
    private var peak = 0
    private var samples = 0
    private var squareSum = 0L

    fun add(buffer: ByteArray, size: Int, silenced: Boolean): Boolean {
        var bufferPeak = 0
        for (index in 0 until size - 1 step 2) {
            val sample = ((buffer[index].toInt() and 0xff) or
                (buffer[index + 1].toInt() shl 8)).toShort().toInt()
            bufferPeak = maxOf(bufferPeak, abs(sample))
            squareSum += sample.toLong() * sample
            samples++
        }
        buffers++
        if (bufferPeak == 0) zeroBuffers++
        if (silenced) dropped++
        peak = maxOf(peak, bufferPeak)
        return bufferPeak == 0
    }

    fun reset() {
        buffers = 0
        zeroBuffers = 0
        dropped = 0
        peak = 0
        samples = 0
        squareSum = 0
    }

    override fun toString(): String {
        val rms = if (samples == 0) 0 else sqrt(squareSum.toDouble() / samples).toInt()
        return "read=$buffers peak=$peak rms=$rms zero=$zeroBuffers dropped=$dropped"
    }
}
