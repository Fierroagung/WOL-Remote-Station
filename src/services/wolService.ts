/**
 * Wake-on-LAN (WOL) Magic Packet Generator & LAN Broadcaster
 * Berjalan secara native di Android dan iOS melalui modul ExpoWol
 */

import { sendWakeOnLanNative } from '../../modules/expo-wol';

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
      // Transmisikan ganda ke universal 255.255.255.255 untuk menjamin lolos di semua model router
      if (targetIp !== '255.255.255.255') {
        try {
          await sendWakeOnLanNative(cleanMac, '255.255.255.255', port);
        } catch {}
      }
      return r1;
    } catch {
      return false;
    }
  }

  /**
   * Membuat payload Magic Packet standar (102 bytes):
   * - 6 byte 0xFF
   * - 16x repetisi MAC address target (6 byte x 16 = 96 byte)
   */
  public static createMagicPacket(macAddress: string): Uint8Array {
    const cleanMac = macAddress.replace(/[^0-9A-Fa-f]/g, '');
    if (cleanMac.length !== 12) {
      throw new Error(`MAC Address tidak valid: ${macAddress}. Harus 12 digit heksadesimal.`);
    }

    const macBytes = new Uint8Array(6);
    for (let i = 0; i < 6; i++) {
      macBytes[i] = parseInt(cleanMac.substring(i * 2, i * 2 + 2), 16);
    }

    const packet = new Uint8Array(102);
    for (let i = 0; i < 6; i++) {
      packet[i] = 0xff;
    }
    for (let i = 0; i < 16; i++) {
      for (let j = 0; j < 6; j++) {
        packet[6 + i * 6 + j] = macBytes[j];
      }
    }

    return packet;
  }

  public static isValidMac(mac: string): boolean {
    const regex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
    return regex.test(mac) || mac.replace(/[^0-9A-Fa-f]/g, '').length === 12;
  }
}
