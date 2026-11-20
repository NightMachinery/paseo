package sh.paseo.clientlogs

import android.os.Process
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val MAX_BYTES = 2 * 1024 * 1024
private val LOGCAT_TIMESTAMP = Regex("""^\s*(\d{10}\.\d+)\s""")

class PaseoClientLogsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PaseoClientLogs")

    AsyncFunction("readLogcat") { clearedAt: Double ->
      val process = ProcessBuilder(
        "/system/bin/logcat", "-d", "-v", "threadtime", "-v", "epoch", "-v", "usec",
        "--pid=${Process.myPid()}"
      ).redirectErrorStream(true).start()
      try {
        val lines = ArrayDeque<Pair<String, Int>>()
        var bytes = 0
        process.inputStream.bufferedReader().useLines { incoming ->
          for (line in incoming) {
            // An unprivileged app cannot clear the device log buffers.
            val epoch = LOGCAT_TIMESTAMP.find(line)?.groupValues?.get(1)?.toDoubleOrNull()
            if (clearedAt > 0 && (epoch == null || epoch * 1000 < clearedAt)) continue
            val size = line.toByteArray(Charsets.UTF_8).size + 1
            lines.addLast(line to size)
            bytes += size
            while (bytes > MAX_BYTES) bytes -= lines.removeFirst().second
          }
        }
        check(process.waitFor() == 0) { "Unable to read Android app logcat" }
        lines.joinToString("\n") { it.first }
      } finally {
        process.destroy()
      }
    }
  }
}
