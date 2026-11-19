package expo.modules.wol

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class ExpoWolModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoWol")

    AsyncFunction("sendWakeOnLan") { mac: String, broadcastIp: String, port: Int ->
      withContext(Dispatchers.IO) {
        try {
          val cleanMac = mac.replace(":", "").replace("-", "").trim()
          if (cleanMac.length != 12) {
            return@withContext false
          }
          val macBytes = ByteArray(6)
          for (i in 0 until 6) {
            macBytes[i] = cleanMac.substring(i * 2, i * 2 + 2).toInt(16).toByte()
          }
          val bytes = ByteArray(6 + 16 * 6)
          for (i in 0 until 6) {
            bytes[i] = 0xff.toByte()
          }
          for (i in 0 until 16) {
            System.arraycopy(macBytes, 0, bytes, 6 + i * 6, 6)
          }
          val targetHost = if (broadcastIp.isNullOrBlank()) "255.255.255.255" else broadcastIp.trim()
          val address = InetAddress.getByName(targetHost)
          val socket = DatagramSocket()
          socket.broadcast = true
          val targetPort = if (port > 0) port else 9
          val packet = DatagramPacket(bytes, bytes.size, address, targetPort)
          socket.send(packet)
          socket.close()
          true
        } catch (e: Exception) {
          e.printStackTrace()
          false
        }
      }
    }
  }
}
