/**
 * Wake-on-LAN (WOL) Magic Packet Generator & LAN Broadcaster
 * Digunakan oleh HP Rumah (Mode Bridge) saat mendengarkan sinyal dari HP Utama
 */

export class WOLService {
  /**
   * Membuat payload Magic Packet standar (102 bytes):
   * - 6 byte 0xFF
   * - 16x repetisi MAC address target (6 byte x 16 = 96 byte)
   */
  public static createMagicPacket(macAddress: string): Uint8Array {
    // Normalisasi MAC address (hilangkan titik dua, spasi, atau tanda minus)
    const cleanMac = macAddress.replace(/[^0-9A-Fa-f]/g, '');
    if (cleanMac.length !== 12) {
      throw new Error(`MAC Address tidak valid: ${macAddress}. Harus 12 digit heksadesimal.`);
    }

    const macBytes = new Uint8Array(6);
    for (let i = 0; i < 6; i++) {
      macBytes[i] = parseInt(cleanMac.substring(i * 2, i * 2 + 2), 16);
    }

    // Alokasi 102 byte
    const packet = new Uint8Array(102);

    // 6 byte pertama: 0xFF
    for (let i = 0; i < 6; i++) {
      packet[i] = 0xff;
    }

    // 16 kali pengulangan MAC address
    for (let i = 0; i < 16; i++) {
      for (let j = 0; j < 6; j++) {
        packet[6 + i * 6 + j] = macBytes[j];
      }
    }

    return packet;
  }

  /**
   * Memvalidasi format MAC address
   */
  public static isValidMac(mac: string): boolean {
    const regex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
    return regex.test(mac) || mac.replace(/[^0-9A-Fa-f]/g, '').length === 12;
  }
}
