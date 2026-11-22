/**
 * Universal MQTT 3.1.1 Realtime Client for React Native / Expo
 * Beroperasi langsung di atas WebSocket (WSS) standar tanpa library eksternal (Zero Dependencies).
 * Mendukung arsitektur Dual-Role: HP Utama (Controller) <-> HP Kedua (Gateway Standby) <-> PC Desktop
 */

export type PCStatus = 'ONLINE' | 'OFFLINE' | 'SLEEPING' | 'UNCONFIGURED';
export type PowerAction = 'wake' | 'sleep' | 'hibernate' | 'restart' | 'shutdown' | 'lock';

export interface StationConfig {
  stationName: string;
  stationKey: string;
  macAddress: string;
  broadcastIp: string;
  brokerUrl: string;
}

export const DEFAULT_STATION_CONFIG: StationConfig = {
  stationName: 'DESKTOP-FIERRO',
  stationKey: 'WOL-9341-PC',
  macAddress: 'F0:2F:74:8B:F6:43',
  broadcastIp: '192.168.0.255',
  brokerUrl: 'wss://broker.hivemq.com:8884/mqtt',
};

export const EMPTY_STATION_CONFIG: StationConfig = { ...DEFAULT_STATION_CONFIG };

export const DEFAULT_BROKER_WS = 'wss://broker.hivemq.com:8884/mqtt';

// ============================================================================
// MQTT 3.1.1 Packet Serialization Utilities
// ============================================================================

function encodeUtf8(str: string): Uint8Array {
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

function buildPublishPacket(topic: string, payloadStr: string, retain: boolean = false): Uint8Array {
  const topicBytes = encodeString(topic);
  const payloadBytes = encodeUtf8(payloadStr);

  const body = new Uint8Array([...topicBytes, ...payloadBytes]);
  const remLen = encodeRemainingLength(body.length);
  const header = retain ? 0x31 : 0x30;
  return new Uint8Array([header, ...remLen, ...body]);
}

function buildPingPacket(): Uint8Array {
  return new Uint8Array([0xc0, 0x00]);
}

export function sanitizeBrokerUrl(rawUrl: string): string {
  if (!rawUrl || !rawUrl.trim()) {
    return DEFAULT_BROKER_WS;
  }
  let url = rawUrl.trim();
  if (url.includes(':1883')) {
    url = url.replace(':1883', ':8884/mqtt');
  }
  if (!/^wss?:\/\//i.test(url)) {
    url = 'wss://' + url;
  }
  try {
    if (url.includes('hivemq.com') && !url.includes(':8884')) {
      url = 'wss://broker.hivemq.com:8884/mqtt';
    }
  } catch {
    return DEFAULT_BROKER_WS;
  }
  return url;
}

class MQTTService {
  private ws: WebSocket | null = null;
  private config: StationConfig = DEFAULT_STATION_CONFIG;
  private statusListeners: Array<(status: PCStatus, rawData?: any) => void> = [];
  private wakeListeners: Array<(wakeData: { targetMac: string; broadcastIp: string }) => void> = [];
  private controlListeners: Array<(action: string, rawData?: any) => void> = [];
  private gatewayListeners: Array<(gatewayAlive: boolean, pcStatus?: PCStatus) => void> = [];
  private ackListeners: Array<(ackData: any) => void> = [];
  private logListeners: Array<(log: string) => void> = [];
  private connectionListeners: Array<(connected: boolean) => void> = [];

  private isConnected: boolean = false;
  private currentStatus: PCStatus = 'OFFLINE';
  private isGatewayAlive: boolean = false;
  private pingInterval: any = null;
  private reconnectTimer: any = null;
  private gatewayHeartbeatTimer: any = null;
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

  public getTopicGateway(): string {
    if (!this.config.stationKey) return '';
    return `wol_station/${this.config.stationKey}/gateway`;
  }

  public getTopicAck(): string {
    if (!this.config.stationKey) return '';
    return `wol_station/${this.config.stationKey}/ack`;
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
      this.addLog(`[CONFIG] Konfigurasi stasiun: ${this.config.stationKey}`);
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
      } catch {}
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
      this.addLog('[MQTT] Konfigurasi stasiun kosong.');
      this.updateStatus('UNCONFIGURED');
      return;
    }

    const safeUrl = sanitizeBrokerUrl(this.config.brokerUrl);
    this.addLog(`[MQTT] Menghubungkan ke Cloud Broker: ${safeUrl}...`);

    try {
      this.ws = new WebSocket(safeUrl, ['mqtt']);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        this.addLog('[MQTT] WebSocket terhubung. Mengirim handshake CONNECT...');
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
            if (typeof (raw as any).arrayBuffer === 'function') {
              try {
                const buf = await (raw as any).arrayBuffer();
                bytes = new Uint8Array(buf);
              } catch {}
            }
          } else if (typeof raw === 'string') {
            bytes = encodeUtf8(raw);
          }

          if (!bytes || bytes.length < 2) return;
          const packetType = bytes[0] >> 4;

          // 1. CONNACK (Type 2)
          if (packetType === 2) {
            const returnCode = bytes.length >= 4 ? bytes[3] : 0;
            if (returnCode === 0) {
              this.setConnected(true);
              this.addLog(`[MQTT] Terkoneksi Sukses ke Stasiun ${this.config.stationKey}`);

              if (this.pingInterval) clearInterval(this.pingInterval);
              this.pingInterval = setInterval(() => {
                this.sendPacket(buildPingPacket());
              }, 30000);

              // Subscribe ke Status, Wake, Control, Gateway, Ack
              const topics = [
                this.getTopicStatus(),
                this.getTopicWake(),
                this.getTopicControl(),
                this.getTopicGateway(),
                this.getTopicAck(),
              ];

              topics.forEach((t) => {
                if (t) {
                  this.sendPacket(buildSubscribePacket(this.packetId++, t));
                }
              });
            } else {
              this.addLog(`[MQTT Ditolak] Broker menolak koneksi (code: ${returnCode})`);
            }
          }

          // 2. PUBLISH (Type 3)
          else if (packetType === 3) {
            let offset = 1;
            while (offset < bytes.length && (bytes[offset] & 0x80) !== 0) {
              offset++;
            }
            offset++;

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
        } catch (e) {
          this.addLog(`[MQTT Parse Error] ${String(e)}`);
        }
      };

      this.ws.onerror = (e: any) => {
        this.addLog(`[MQTT Error] Gagal terhubung ke broker.`);
        this.setConnected(false);
      };

      this.ws.onclose = () => {
        this.setConnected(false);
        if (this.isConfigured() && !this.reconnectTimer) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
          }, 5000);
        }
      };
    } catch (err) {
      this.addLog(`[MQTT Exception] ${String(err)}`);
      this.setConnected(false);
    }
  }

  private handleIncomingPublish(topic: string, payloadStr: string) {
    try {
      const data = JSON.parse(payloadStr);
      const topicStatus = this.getTopicStatus();
      const topicWake = this.getTopicWake();
      const topicControl = this.getTopicControl();
      const topicGateway = this.getTopicGateway();
      const topicAck = this.getTopicAck();

      // Status PC
      if (topic === topicStatus) {
        if (data && data.state) {
          this.updateStatus(data.state as PCStatus, data);
        }
      }
      // Sinyal Wake (Diterima oleh HP Kedua Gateway)
      else if (topic === topicWake) {
        this.addLog(`[WAKE DITERIMA] Membangunkan: ${data.targetMac || this.config.macAddress}`);
        this.wakeListeners.forEach((l) =>
          l({
            targetMac: data.targetMac || this.config.macAddress,
            broadcastIp: data.broadcastIp || this.config.broadcastIp,
          })
        );
      }
      // Perintah Kontrol Daya (Diterima oleh HP Kedua atau PC)
      else if (topic === topicControl) {
        if (data && data.action) {
          this.controlListeners.forEach((l) => l(data.action, data));
        }
      }
      // Gateway Heartbeat dari HP Kedua
      else if (topic === topicGateway) {
        const alive = data.state === 'ACTIVE';
        this.isGatewayAlive = alive;
        this.gatewayListeners.forEach((l) => l(alive, data.pcStatus));
        if (data.pcStatus) {
          this.updateStatus(data.pcStatus);
        }
      }
      // ACK Laporan
      else if (topic === topicAck) {
        this.ackListeners.forEach((l) => l(data));
      }
    } catch {}
  }

  // HP Utama -> Kirim sinyal bangun ke Gateway
  public sendWakeCommand(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.isConnected) {
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
      const ok = this.sendPacket(buildPublishPacket(topic, payload));
      resolve(ok);
    });
  }

  // HP Utama -> Kirim perintah daya (Sleep, Restart, Shutdown, Lock)
  public sendPowerAction(action: PowerAction): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.isConnected) {
        resolve(false);
        return;
      }
      const topic = this.getTopicControl();
      const upper = action.toUpperCase();
      const payload = JSON.stringify({
        action: upper,
        mac: this.config.macAddress,
        stationKey: this.config.stationKey,
        timestamp: Math.floor(Date.now() / 1000),
      });
      const ok = this.sendPacket(buildPublishPacket(topic, payload));
      resolve(ok);
    });
  }

  // HP Kedua -> Publikasikan Laporan Status Fisik PC ke HP Utama
  public publishPcStatus(status: PCStatus): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.isConnected) {
        resolve(false);
        return;
      }
      const topic = this.getTopicStatus();
      const payload = JSON.stringify({
        state: status,
        stationKey: this.config.stationKey,
        source: 'HOME_GATEWAY_RELAY',
        timestamp: Math.floor(Date.now() / 1000),
      });
      const ok = this.sendPacket(buildPublishPacket(topic, payload, true));
      resolve(ok);
    });
  }

  // HP Kedua -> Publikasikan ACK saat Magic Packet ditembakkan
  public publishWakeAck(info: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.isConnected) {
        resolve(false);
        return;
      }
      const topic = this.getTopicAck();
      const payload = JSON.stringify({
        event: 'WAKE_FIRED_BY_GATEWAY',
        message: info,
        stationKey: this.config.stationKey,
        timestamp: Math.floor(Date.now() / 1000),
      });
      const ok = this.sendPacket(buildPublishPacket(topic, payload));
      resolve(ok);
    });
  }

  // HP Kedua -> Detak Jantung Gateway 24/7
  public publishGatewayHeartbeat(alive: boolean, pcStatus: PCStatus): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.isConnected) {
        resolve(false);
        return;
      }
      const topic = this.getTopicGateway();
      const payload = JSON.stringify({
        state: alive ? 'ACTIVE' : 'OFFLINE',
        pcStatus: pcStatus,
        stationKey: this.config.stationKey,
        timestamp: Math.floor(Date.now() / 1000),
      });
      const ok = this.sendPacket(buildPublishPacket(topic, payload, true));
      resolve(ok);
    });
  }

  public updateStatus(newStatus: PCStatus, rawData?: any) {
    this.currentStatus = newStatus;
    this.statusListeners.forEach((l) => l(newStatus, rawData));
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

  public onControlReceived(callback: (action: string, rawData?: any) => void) {
    this.controlListeners.push(callback);
    return () => {
      this.controlListeners = this.controlListeners.filter((cb) => cb !== callback);
    };
  }

  public onGatewayStatus(callback: (alive: boolean, pcStatus?: PCStatus) => void) {
    this.gatewayListeners.push(callback);
    callback(this.isGatewayAlive, this.currentStatus);
    return () => {
      this.gatewayListeners = this.gatewayListeners.filter((cb) => cb !== callback);
    };
  }

  public onAckReceived(callback: (ackData: any) => void) {
    this.ackListeners.push(callback);
    return () => {
      this.ackListeners = this.ackListeners.filter((cb) => cb !== callback);
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
    this.logListeners.forEach((cb) => cb(`[${time}] ${log}`));
  }

  public getIsConnected() {
    return this.isConnected;
  }

  public getIsGatewayAlive() {
    return this.isGatewayAlive;
  }
}

export const mqttClient = new MQTTService();
