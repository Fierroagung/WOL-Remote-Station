/**
/**
 * Universal MQTT 3.1.1 Realtime Client for React Native / Expo
 * Beroperasi langsung di atas WebSocket (WSS) standar tanpa library eksternal (Zero Dependencies).
 * Mendukung Android, iOS, dan Web tanpa crash native.
 */

export type PCStatus = 'ONLINE' | 'OFFLINE' | 'SLEEPING' | 'UNCONFIGURED';
export type PowerAction = 'wake' | 'sleep' | 'hibernate' | 'restart' | 'shutdown';

export interface StationConfig {
  stationName: string;
  stationKey: string;
  macAddress: string;
  broadcastIp: string;
  brokerUrl: string;
}

export const DEFAULT_STATION_CONFIG: StationConfig = {
  stationName: 'DESKTOP-FIERRO',
  stationKey: 'WOL-45KR-PC',
  macAddress: '9C:71:C4:11:44:13',
  broadcastIp: '192.168.0.255',
  brokerUrl: 'wss://broker.hivemq.com:8884/mqtt',
};

export const EMPTY_STATION_CONFIG: StationConfig = { ...DEFAULT_STATION_CONFIG };

export const DEFAULT_BROKER_WS = 'wss://broker.hivemq.com:8884/mqtt';

// ============================================================================
// MQTT 3.1.1 Packet Serialization Utilities
// ============================================================================

function encodeUtf8(str: string): Uint8Array {
  // Polyfill / safe encoder untuk React Native
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str);
  }
  const utf8: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let charcode = str.charCodeAt(i);
    if (charcode < 0x80) utf8.push(charcode);
    else if (charcode < 0x800) {
      utf8.push(0xc0 | (charcode >> 6), 0x80 | (charcode & 0x3f));
    } else if (charcode < 0xd800 || charcode >= 0xe000) {
      utf8.push(0xe0 | (charcode >> 12), 0x80 | ((charcode >> 6) & 0x3f), 0x80 | (charcode & 0x3f));
    } else {
      i++;
      charcode = 0x10000 + (((charcode & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
      utf8.push(
        0xf0 | (charcode >> 18),
        0x80 | ((charcode >> 12) & 0x3f),
        0x80 | ((charcode >> 6) & 0x3f),
        0x80 | (charcode & 0x3f)
      );
    }
  }
  return new Uint8Array(utf8);
}

function decodeUtf8(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder().decode(bytes);
  }
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const c = bytes[i++];
    if (c < 128) {
      out += String.fromCharCode(c);
    } else if (c > 191 && c < 224) {
      out += String.fromCharCode(((c & 31) << 6) | (bytes[i++] & 63));
    } else if (c > 239) {
      const c2 = bytes[i++];
      const c3 = bytes[i++];
      const c4 = bytes[i++];
      const code = (((c & 7) << 18) | ((c2 & 63) << 12) | ((c3 & 63) << 6) | (c4 & 63)) - 0x10000;
      out += String.fromCharCode((code >> 10) + 0xd800, (code & 0x3ff) + 0xdc00);
    } else {
      out += String.fromCharCode(((c & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63));
    }
  }
  return out;
}

function encodeString(str: string): Uint8Array {
  const enc = encodeUtf8(str);
  const buf = new Uint8Array(2 + enc.length);
  buf[0] = (enc.length >> 8) & 0xff;
  buf[1] = enc.length & 0xff;
  buf.set(enc, 2);
  return buf;
}

function encodeRemainingLength(len: number): Uint8Array {
  const bytes: number[] = [];
  do {
    let encByte = len % 128;
    len = Math.floor(len / 128);
    if (len > 0) encByte |= 128;
    bytes.push(encByte);
  } while (len > 0);
  return new Uint8Array(bytes);
}

function buildConnectPacket(clientId: string): Uint8Array {
  const protoName = encodeString('MQTT');
  const protoLevel = new Uint8Array([4]); // MQTT 3.1.1
  const connectFlags = new Uint8Array([0x02]); // Clean session
  const keepAlive = new Uint8Array([0x00, 0x3c]); // 60s
  const clientPayload = encodeString(clientId);

  const varHeader = new Uint8Array([
    ...protoName,
    ...protoLevel,
    ...connectFlags,
    ...keepAlive,
    ...clientPayload,
  ]);
  const remLen = encodeRemainingLength(varHeader.length);
  return new Uint8Array([0x10, ...remLen, ...varHeader]);
}

function buildSubscribePacket(packetId: number, topic: string): Uint8Array {
  const idBytes = new Uint8Array([(packetId >> 8) & 0xff, packetId & 0xff]);
  const topicBytes = encodeString(topic);
  const qos = new Uint8Array([0x00]); // QoS 0

  const body = new Uint8Array([...idBytes, ...topicBytes, ...qos]);
  const remLen = encodeRemainingLength(body.length);
  return new Uint8Array([0x82, ...remLen, ...body]);
}

function buildPublishPacket(topic: string, payloadStr: string): Uint8Array {
  const topicBytes = encodeString(topic);
  const payloadBytes = encodeUtf8(payloadStr);

  const body = new Uint8Array([...topicBytes, ...payloadBytes]);
  const remLen = encodeRemainingLength(body.length);
  return new Uint8Array([0x30, ...remLen, ...body]); // 0x30 = PUBLISH QoS 0
}

function buildPingPacket(): Uint8Array {
  return new Uint8Array([0xc0, 0x00]); // PINGREQ
}

// ============================================================================
// URL Sanitizer (Mencegah Crash Android pada Input User)
// ============================================================================

export function sanitizeBrokerUrl(rawUrl: string): string {
  if (!rawUrl || !rawUrl.trim()) {
    return DEFAULT_BROKER_WS;
  }
  let url = rawUrl.trim();

  // Jika user memasukkan port standard TCP 1883 atau mengetik hostname tanpa skema
  if (url.includes(':1883')) {
    url = url.replace(':1883', ':8884/mqtt');
  }

  // Jika belum ada prefix protokol ws:// atau wss://
  if (!/^wss?:\/\//i.test(url)) {
    url = 'wss://' + url;
  }

  // Jika URL mengarah ke broker HiveMQ atau EMQX tanpa port/path WebSocket
  try {
    // Pastikan jika hanya domain, tambahkan default port dan path websocket jika hivemq
    if (url.includes('hivemq.com') && !url.includes(':8884')) {
      url = 'wss://broker.hivemq.com:8884/mqtt';
    }
  } catch {
    return DEFAULT_BROKER_WS;
  }

  return url;
}

// ============================================================================
// Service Singleton
// ============================================================================

class MQTTService {
  private ws: WebSocket | null = null;
  private config: StationConfig = EMPTY_STATION_CONFIG;
  private statusListeners: Array<(status: PCStatus, rawData?: any) => void> = [];
  private wakeListeners: Array<(wakeData: { targetMac: string; broadcastIp: string }) => void> = [];
  private logListeners: Array<(log: string) => void> = [];
  private connectionListeners: Array<(connected: boolean) => void> = [];

  private isConnected: boolean = false;
  private currentStatus: PCStatus = 'UNCONFIGURED';
  private pingInterval: any = null;
  private reconnectTimer: any = null;
  private packetId: number = 1;

  public getTopicStatus(): string {
    if (!this.config.stationKey) return '';
    return `wol_station/${this.config.stationKey}/status`;
  }

  public getTopicControl(): string {
    if (!this.config.stationKey) return '';
    return `wol_station/${this.config.stationKey}/control`;
  }

  public getTopicWake(): string {
    if (!this.config.stationKey) return '';
    return `wol_station/${this.config.stationKey}/wake`;
  }

  public getConfig(): StationConfig {
    return { ...this.config };
  }

  public isConfigured(): boolean {
    return Boolean(this.config.stationKey && this.config.stationKey.trim().length > 0);
  }

  public updateConfig(newConfig: Partial<StationConfig>) {
    this.config = { ...this.config, ...newConfig };
    if (this.isConfigured()) {
      this.addLog(`[CONFIG] Konfigurasi stasiun diperbarui: ${this.config.stationKey}`);
      if (this.currentStatus === 'UNCONFIGURED') {
        this.updateStatus('OFFLINE');
      }
    } else {
      this.updateStatus('UNCONFIGURED');
    }

    this.reconnect();
  }

  public reconnect() {
    this.disconnect();
    this.connect();
  }

  public disconnect() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;
        this.ws.close();
      } catch {
        // Ignore
      }
      this.ws = null;
    }
    this.setConnected(false);
  }

  private sendPacket(packet: Uint8Array): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(packet);
      return true;
    } catch {
      try {
        this.ws.send(packet.buffer as ArrayBuffer);
        return true;
      } catch {
        return false;
      }
    }
  }

  public connect() {
    if (!this.isConfigured()) {
      this.addLog('[MQTT] Konfigurasi stasiun masih kosong. Menunggu input di menu ⚙️ Pengaturan...');
      this.updateStatus('UNCONFIGURED');
      return;
    }

    const safeUrl = sanitizeBrokerUrl(this.config.brokerUrl);
    this.addLog(`[MQTT] Menghubungkan ke Cloud Broker: ${safeUrl}...`);

    try {
      this.ws = new WebSocket(safeUrl, ['mqtt']);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        this.addLog('[MQTT] WebSocket terhubung. Mengirim handshake MQTT CONNECT...');
        const clientId = `wol_app_${Math.random().toString(16).substring(2, 10)}`;
        try {
          const connectPacket = buildConnectPacket(clientId);
          this.sendPacket(connectPacket);
        } catch (err) {
          this.addLog(`[MQTT Handshake Error] ${String(err)}`);
        }
      };

      this.ws.onmessage = async (event) => {
        try {
          const raw = event.data;
          let bytes: Uint8Array | null = null;

          if (raw instanceof ArrayBuffer) {
            bytes = new Uint8Array(raw);
          } else if (ArrayBuffer.isView(raw)) {
            bytes = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
          } else if (typeof Blob !== 'undefined' && raw instanceof Blob) {
            // Android React Native OkHttp delivers WebSocket binary frames as Blob
            if (typeof (raw as any).arrayBuffer === 'function') {
              try {
                const buf = await (raw as any).arrayBuffer();
                bytes = new Uint8Array(buf);
              } catch {}
            }
            if (!bytes && typeof FileReader !== 'undefined') {
              bytes = await new Promise<Uint8Array | null>((resolve) => {
                const reader = new FileReader();
                reader.onload = () => {
                  if (reader.result instanceof ArrayBuffer) {
                    resolve(new Uint8Array(reader.result));
                  } else {
                    resolve(null);
                  }
                };
                reader.onerror = () => resolve(null);
                reader.readAsArrayBuffer(raw);
              });
            }
          } else if (typeof raw === 'string') {
            // Coba decode base64 jika ada
            try {
              if (typeof atob === 'function') {
                const binStr = atob(raw);
                const b = new Uint8Array(binStr.length);
                for (let i = 0; i < binStr.length; i++) {
                  b[i] = binStr.charCodeAt(i);
                }
                if (b.length >= 2 && ((b[0] >> 4) === 2 || (b[0] >> 4) === 3)) {
                  bytes = b;
                }
              }
            } catch {}
            if (!bytes) {
              bytes = encodeUtf8(raw);
            }
          }

          if (!bytes || bytes.length < 2) return;
          const packetType = bytes[0] >> 4;

          // 1. CONNACK (Type 2)
          if (packetType === 2) {
            const returnCode = bytes.length >= 4 ? bytes[3] : 0;
            if (returnCode === 0) {
              this.setConnected(true);
              this.addLog(`[MQTT] Terkoneksi Sukses! Berlangganan stasiun: ${this.config.stationKey}`);

              // Mulai PING interval (30 detik)
              if (this.pingInterval) clearInterval(this.pingInterval);
              this.pingInterval = setInterval(() => {
                this.sendPacket(buildPingPacket());
              }, 30000);

              // Subscribe ke Status PC & Wake Commands
              const topicStatus = this.getTopicStatus();
              const topicWake = this.getTopicWake();

              if (topicStatus) {
                this.sendPacket(buildSubscribePacket(this.packetId++, topicStatus));
                this.addLog(`[MQTT] Subscribed ke ${topicStatus}`);
              }
              if (topicWake) {
                this.sendPacket(buildSubscribePacket(this.packetId++, topicWake));
                this.addLog(`[MQTT] Subscribed ke ${topicWake}`);
              }
            } else {
              this.addLog(`[MQTT Ditolak] Broker menolak koneksi dengan kode: ${returnCode}`);
            }
          }

          // 2. PUBLISH (Type 3)
          else if (packetType === 3) {
            let offset = 1;
            // Decode remaining length
            while (offset < bytes.length && (bytes[offset] & 0x80) !== 0) {
              offset++;
            }
            offset++; // Maju setelah remaining length

            if (offset + 2 > bytes.length) return;
            const topicLen = (bytes[offset] << 8) | bytes[offset + 1];
            offset += 2;

            if (offset + topicLen > bytes.length) return;
            const topicBytes = bytes.subarray(offset, offset + topicLen);
            const topic = decodeUtf8(topicBytes);
            offset += topicLen;

            const payloadBytes = bytes.subarray(offset);
            const payloadStr = decodeUtf8(payloadBytes);

            this.handleIncomingPublish(topic, payloadStr);
          }

          // 3. PINGRESP (Type 13)
          else if (packetType === 13) {
            // Heartbeat OK
          }
        } catch (e) {
          this.addLog(`[MQTT Parse Error] ${String(e)}`);
        }
      };

      this.ws.onerror = (e: any) => {
        this.addLog(`[MQTT Sinyal Gagal] Tidak dapat terhubung ke broker: ${e?.message || 'Koneksi Ditolak'}`);
        this.setConnected(false);
      };

      this.ws.onclose = () => {
        if (this.isConnected) {
          this.addLog('[MQTT] Koneksi terputus. Mencoba reconnect otomatis dalam 5 detik...');
        }
        this.setConnected(false);
        if (this.isConfigured() && !this.reconnectTimer) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
          }, 5000);
        }
      };
    } catch (err) {
      this.addLog(`[MQTT Exception] Gagal membuka WebSocket: ${String(err)}`);
      this.setConnected(false);
    }
  }

  private handleIncomingPublish(topic: string, payloadStr: string) {
    try {
      this.addLog(`[MQTT RECV] [${topic}] ${payloadStr}`);
      const data = JSON.parse(payloadStr);

      const topicStatus = this.getTopicStatus();
      const topicWake = this.getTopicWake();

      if (topic === topicStatus) {
        if (data && data.state) {
          this.updateStatus(data.state as PCStatus, data);
        }
      } else if (topic === topicWake) {
        this.addLog(`[WAKE Sinyal Diterima] Membangunkan target: ${data.targetMac || this.config.macAddress}`);
        this.wakeListeners.forEach((listener) =>
          listener({
            targetMac: data.targetMac || this.config.macAddress,
            broadcastIp: data.broadcastIp || this.config.broadcastIp,
          })
        );
      }
    } catch {
      // Raw string
    }
  }

  public sendWakeCommand(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.isConfigured()) {
        this.addLog('[ERROR] Tidak dapat mengirim WAKE: Konfigurasi stasiun belum diisi!');
        resolve(false);
        return;
      }
      if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.addLog('[ERROR] Tidak dapat mengirim WAKE: Belum terhubung ke Cloud Broker!');
        resolve(false);
        return;
      }

      const topic = this.getTopicWake();
      const payload = JSON.stringify({
        action: 'wake',
        targetMac: this.config.macAddress,
        broadcastIp: this.config.broadcastIp,
        stationKey: this.config.stationKey,
        timestamp: Math.floor(Date.now() / 1000),
      });

      try {
        const packet = buildPublishPacket(topic, payload);
        const ok = this.sendPacket(packet);
        if (ok) {
          this.addLog(`[WAKE TERKIRIM] Berhasil broadcast sinyal WAKE ke stasiun ${this.config.stationKey}`);
          resolve(true);
        } else {
          this.addLog('[ERROR WAKE] Gagal mengirim paket melalui socket');
          resolve(false);
        }
      } catch (e) {
        this.addLog(`[ERROR WAKE] Gagal mengirim paket: ${String(e)}`);
        resolve(false);
      }
    });
  }

  public sendPowerAction(action: PowerAction): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.isConfigured()) {
        this.addLog(`[ERROR] Tidak dapat mengirim ${action.toUpperCase()}: Konfigurasi stasiun belum diisi!`);
        resolve(false);
        return;
      }
      if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.addLog(`[ERROR] Tidak dapat mengirim ${action.toUpperCase()}: Belum terhubung ke Cloud Broker!`);
        resolve(false);
        return;
      }

      const topic = this.getTopicControl();
      const upperAction = action.toUpperCase();
      const payload = JSON.stringify({
        action: upperAction,
        stationKey: this.config.stationKey,
        timestamp: Math.floor(Date.now() / 1000),
      });

      try {
        const packet = buildPublishPacket(topic, payload);
        const ok = this.sendPacket(packet);
        if (ok) {
          this.addLog(`[KONTROL TERKIRIM] Perintah ${upperAction} dikirim ke stasiun ${this.config.stationKey}`);
          resolve(true);
        } else {
          this.addLog(`[ERROR KONTROL] Gagal mengirim ${upperAction}`);
          resolve(false);
        }
      } catch (e) {
        this.addLog(`[ERROR KONTROL] Gagal mengirim perintah: ${String(e)}`);
        resolve(false);
      }
    });
  }

  public updateStatus(newStatus: PCStatus, rawData?: any) {
    this.currentStatus = newStatus;
    this.statusListeners.forEach((listener) => listener(newStatus, rawData));
  }

  public onStatusChange(callback: (status: PCStatus, rawData?: any) => void) {
    this.statusListeners.push(callback);
    callback(this.currentStatus);
    return () => {
      this.statusListeners = this.statusListeners.filter((cb) => cb !== callback);
    };
  }

  public onWakeReceived(callback: (wakeData: { targetMac: string; broadcastIp: string }) => void) {
    this.wakeListeners.push(callback);
    return () => {
      this.wakeListeners = this.wakeListeners.filter((cb) => cb !== callback);
    };
  }

  public onConnectionChange(callback: (connected: boolean) => void) {
    this.connectionListeners.push(callback);
    callback(this.isConnected);
    return () => {
      this.connectionListeners = this.connectionListeners.filter((cb) => cb !== callback);
    };
  }

  public onLog(callback: (log: string) => void) {
    this.logListeners.push(callback);
    return () => {
      this.logListeners = this.logListeners.filter((cb) => cb !== callback);
    };
  }

  private setConnected(connected: boolean) {
    this.isConnected = connected;
    this.connectionListeners.forEach((cb) => cb(connected));
  }

  private addLog(log: string) {
    const time = new Date().toLocaleTimeString('id-ID', { hour12: false });
    const formatted = `[${time}] ${log}`;
    this.logListeners.forEach((cb) => cb(formatted));
  }

  public getIsConnected() {
    return this.isConnected;
  }
}

export const mqttClient = new MQTTService();
