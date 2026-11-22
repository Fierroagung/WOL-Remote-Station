import ExpoModulesCore
import Foundation
import Darwin

public class ExpoWolModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoWol")

    // 1. Kirim Magic Packet UDP (102 Bytes) ke LAN
    AsyncFunction("sendWakeOnLan") { (mac: String, broadcastIp: String, port: Int, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        let cleanMac = mac.replacingOccurrences(of: ":", with: "")
                          .replacingOccurrences(of: "-", with: "")
                          .trimmingCharacters(in: .whitespacesAndNewlines)
        guard cleanMac.count == 12 else {
          promise.resolve(false)
          return
        }

        var macBytes = [UInt8]()
        for i in stride(from: 0, to: cleanMac.count, by: 2) {
          let start = cleanMac.index(cleanMac.startIndex, offsetBy: i)
          let end = cleanMac.index(start, offsetBy: 2)
          if let byte = UInt8(cleanMac[start..<end], radix: 16) {
            macBytes.append(byte)
          }
        }
        guard macBytes.count == 6 else {
          promise.resolve(false)
          return
        }

        var packet = [UInt8](repeating: 0xFF, count: 6)
        for _ in 0..<16 {
          packet.append(contentsOf: macBytes)
        }

        let sock = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP)
        guard sock >= 0 else {
          promise.resolve(false)
          return
        }

        var broadcastEnable: Int32 = 1
        setsockopt(sock, SOL_SOCKET, SO_BROADCAST, &broadcastEnable, socklen_t(MemoryLayout<Int32>.size))

        var addr = sockaddr_in()
        addr.sin_family = sa_family_t(AF_INET)
        let targetPort = port > 0 ? port : 9
        addr.sin_port = in_port_t(UInt16(targetPort).bigEndian)

        let ipStr = broadcastIp.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "255.255.255.255" : broadcastIp.trimmingCharacters(in: .whitespacesAndNewlines)
        inet_pton(AF_INET, ipStr, &addr.sin_addr)

        let sent = withUnsafePointer(to: &addr) {
          $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
            sendto(sock, packet, packet.count, 0, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
          }
        }
        close(sock)
        promise.resolve(sent > 0)
      }
    }

    // 2. Ping Host Lokal via TCP Socket
    AsyncFunction("pingHost") { (host: String, timeoutMs: Int, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        let sock = socket(AF_INET, SOCK_STREAM, 0)
        guard sock >= 0 else {
          promise.resolve(false)
          return
        }

        var timeout = timeval()
        let tMs = timeoutMs > 0 ? timeoutMs : 1500
        timeout.tv_sec = tMs / 1000
        timeout.tv_usec = Int32((tMs % 1000) * 1000)
        setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))
        setsockopt(sock, SOL_SOCKET, SO_SNDTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))

        var addr = sockaddr_in()
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = in_port_t(UInt16(20388).bigEndian) // Companion port
        inet_pton(AF_INET, host.trimmingCharacters(in: .whitespacesAndNewlines), &addr.sin_addr)

        let connected = withUnsafePointer(to: &addr) {
          $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
            connect(sock, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
          }
        }
        close(sock)
        promise.resolve(connected == 0)
      }
    }

    // 3. Kirim Perintah UDP Cepat ke PC Companion
    AsyncFunction("sendUdpCommand") { (ip: String, port: Int, payload: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        let sock = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP)
        guard sock >= 0 else {
          promise.resolve(false)
          return
        }

        var addr = sockaddr_in()
        addr.sin_family = sa_family_t(AF_INET)
        let targetPort = port > 0 ? port : 20388
        addr.sin_port = in_port_t(UInt16(targetPort).bigEndian)
        inet_pton(AF_INET, ip.trimmingCharacters(in: .whitespacesAndNewlines), &addr.sin_addr)

        let data = Array(payload.utf8)
        let sent = withUnsafePointer(to: &addr) {
          $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
            sendto(sock, data, data.count, 0, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
          }
        }
        close(sock)
        promise.resolve(sent > 0)
      }
    }

    AsyncFunction("startKeepAliveService") { (promise: Promise) in
      promise.resolve(true)
    }

    AsyncFunction("stopKeepAliveService") { (promise: Promise) in
      promise.resolve(true)
    }

    AsyncFunction("saveSetting") { (key: String, value: String, promise: Promise) in
      UserDefaults.standard.set(value, forKey: "wol_remote_" + key)
      UserDefaults.standard.synchronize()
      promise.resolve(true)
    }

    AsyncFunction("getSetting") { (key: String, promise: Promise) in
      let val = UserDefaults.standard.string(forKey: "wol_remote_" + key)
      promise.resolve(val)
    }
  }
}
