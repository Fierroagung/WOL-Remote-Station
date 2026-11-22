package expo.modules.wol

import android.content.Context
import android.os.PowerManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.Socket
import java.net.InetSocketAddress
import kotlin.concurrent.thread

class ExpoWolModule : Module() {
  private var wakeLock: PowerManager.WakeLock? = null

  override fun definition() = ModuleDefinition {
    Name("ExpoWol")

    // 1. Kirim Magic Packet UDP (102 Bytes) ke LAN
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

    // 2. Ping Host Fisik Lokal (Deteksi PC Hidup/Mati secara Instan)
    AsyncFunction("pingHost") { host: String, timeoutMs: Int, promise: Promise ->
      thread {
        try {
          val cleanHost = host.trim()
          val timeout = if (timeoutMs > 0) timeoutMs else 1500

          // Tes 1: ICMP isReachable
          val addr = InetAddress.getByName(cleanHost)
          if (addr.isReachable(timeout)) {
            promise.resolve(true)
            return@thread
          }

          // Tes 2: TCP Socket Connect ke Port Companion 20388
          try {
            val sock = Socket()
            sock.connect(InetSocketAddress(cleanHost, 20388), timeout)
            sock.close()
            promise.resolve(true)
            return@thread
          } catch (_: Exception) {}

          promise.resolve(false)
        } catch (e: Exception) {
          promise.resolve(false)
        }
      }
    }

    // 3. Kirim Perintah UDP Cepat ke PC Companion (Port 20388)
    AsyncFunction("sendUdpCommand") { ip: String, port: Int, payload: String, promise: Promise ->
      thread {
        try {
          val cleanIp = ip.trim()
          val targetPort = if (port > 0) port else 20388
          val data = payload.toByteArray(Charsets.UTF_8)
          val addr = InetAddress.getByName(cleanIp)
          val socket = DatagramSocket()
          val packet = DatagramPacket(data, data.size, addr, targetPort)
          socket.send(packet)
          socket.close()
          promise.resolve(true)
        } catch (e: Exception) {
          promise.resolve(false)
        }
      }
    }

    // 4. Kunci CPU WakeLock (Mencegah Android Mematikan HP Kedua saat Layar Mati)
    AsyncFunction("startKeepAliveService") { promise: Promise ->
      try {
        val context = appContext.reactContext ?: appContext.currentActivity?.applicationContext
        if (wakeLock == null && context != null) {
          val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
          wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "WOLRemoteStation::GatewayWakeLock")
          wakeLock?.acquire(24 * 60 * 60 * 1000L) // Tahan 24 jam
        }
        promise.resolve(true)
      } catch (e: Exception) {
        promise.resolve(false)
      }
    }

    AsyncFunction("stopKeepAliveService") { promise: Promise ->
      try {
        if (wakeLock?.isHeld == true) {
          wakeLock?.release()
        }
        wakeLock = null
        promise.resolve(true)
      } catch (e: Exception) {
        promise.resolve(false)
      }
    }

    // 5. Simpan dan Baca Pengaturan Lokal
    AsyncFunction("saveSetting") { key: String, value: String, promise: Promise ->
      try {
        val context = appContext.reactContext ?: appContext.currentActivity?.applicationContext
        val prefs = context?.getSharedPreferences("wol_remote_station_prefs", Context.MODE_PRIVATE)
        val saved = prefs?.edit()?.putString(key, value)?.commit() ?: false
        promise.resolve(saved)
      } catch (e: Exception) {
        promise.resolve(false)
      }
    }

    AsyncFunction("getSetting") { key: String, promise: Promise ->
      try {
        val context = appContext.reactContext ?: appContext.currentActivity?.applicationContext
        val prefs = context?.getSharedPreferences("wol_remote_station_prefs", Context.MODE_PRIVATE)
        val value = prefs?.getString(key, null)
        promise.resolve(value)
      } catch (e: Exception) {
        promise.resolve(null)
      }
    }
  }
}
