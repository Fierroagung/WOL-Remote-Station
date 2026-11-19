import ExpoModulesCore
import Foundation
import Darwin

public class ExpoWolModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoWol")

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
  }
}
