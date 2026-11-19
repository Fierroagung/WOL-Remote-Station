package expo.modules.wol

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import kotlin.concurrent.thread

class ExpoWolModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoWol")

    AsyncFunction("sendWakeOnLan") { mac: String, broadcastIp: String, port: Int, promise: Promise ->
      thread {
        try {
          val cleanMac = mac.replace(":", "").replace("-", "").trim()
          if (cleanMac.length != 12) {
            promise.resolve(false)
            return@thread
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
          promise.resolve(true)
        } catch (e: Exception) {
          e.printStackTrace()
          promise.resolve(false)
        }
      }
    }

    AsyncFunction("saveSetting") { key: String, value: String, promise: Promise ->
      try {
        val context = appContext.reactContext ?: appContext.currentActivity?.applicationContext
        val prefs = context?.getSharedPreferences("wol_remote_station_prefs", android.content.Context.MODE_PRIVATE)
        val saved = prefs?.edit()?.putString(key, value)?.commit() ?: false
        promise.resolve(saved)
      } catch (e: Exception) {
        promise.resolve(false)
      }
    }

    AsyncFunction("getSetting") { key: String, promise: Promise ->
      try {
        val context = appContext.reactContext ?: appContext.currentActivity?.applicationContext
        val prefs = context?.getSharedPreferences("wol_remote_station_prefs", android.content.Context.MODE_PRIVATE)
        val value = prefs?.getString(key, null)
        promise.resolve(value)
      } catch (e: Exception) {
        promise.resolve(null)
      }
    }
  }
}
