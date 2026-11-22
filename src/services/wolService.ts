/**
 * Wake-on-LAN (WOL) Magic Packet Generator, Local Broadcaster & Hardware Ping
 */

import {
  sendWakeOnLanNative,
  pingHostNative,
  sendUdpCommandNative,
  startKeepAliveNative,
  stopKeepAliveNative,
} from '../../modules/expo-wol';

export class WOLService {
  /**
   * Mengirim sinyal Magic Packet langsung ke kartu LAN PC via UDP Broadcast
   */
  public static async sendMagicPacket(
    macAddress: string,
    broadcastIp: string = '192.168.0.255',
    port: number = 9
  ): Promise<boolean> {
    try {
      const cleanMac = macAddress.replace(/[^0-9A-Fa-f]/g, '');
      if (cleanMac.length !== 12) {
        return false;
      }

      const targetIp = (broadcastIp && broadcastIp.trim().length > 0) ? broadcastIp.trim() : '192.168.0.255';
      const r1 = await sendWakeOnLanNative(cleanMac, targetIp, port);

      // Transmisikan ganda ke universal 255.255.255.255 & port 7 untuk menjamin lolos di semua router
      if (targetIp !== '255.255.255.255') {
        try {
          await sendWakeOnLanNative(cleanMac, '255.255.255.255', port);
          await sendWakeOnLanNative(cleanMac, targetIp, 7);
        } catch {}
      }
      return r1;
    } catch {
      return false;
    }
  }

  /**
   * Ping perangkat lokal PC di LAN untuk mengetahui status hidup/mati riil
   */
  public static async pingPC(targetIp: string = '192.168.0.102', timeoutMs: number = 1500): Promise<boolean> {
    try {
      return await pingHostNative(targetIp, timeoutMs);
    } catch {
      return false;
    }
  }

  /**
   * Kirim perintah daya langsung ke PC Companion via Local LAN (Port 20388)
   */
  public static async sendLocalPowerCommand(
    targetIp: string,
    macAddress: string,
    command: 'SLEEP' | 'HIBERNATE' | 'RESTART' | 'SHUTDOWN' | 'LOCK'
  ): Promise<boolean> {
    try {
      const payload = JSON.stringify({
        type: 'POWER_COMMAND',
        command: command,
        mac: macAddress,
        time: Math.floor(Date.now() / 1000),
      });
      return await sendUdpCommandNative(targetIp, 20388, payload);
    } catch {
      return false;
    }
  }

  /**
   * Kunci CPU ponsel agar tidak dimatikan Android saat berperan sebagai Gateway Standby
   */
  public static async setGatewayKeepAlive(active: boolean): Promise<boolean> {
    if (active) {
      return await startKeepAliveNative();
    } else {
      return await stopKeepAliveNative();
    }
  }

  public static isValidMac(mac: string): boolean {
    const regex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
    return regex.test(mac) || mac.replace(/[^0-9A-Fa-f]/g, '').length === 12;
  }
}
