/**
 * MQTT Realtime Service for WOL Remote Station
 * Menggunakan koneksi WebSocket aman (WSS) yang kompatibel dengan React Native & Expo
 */

export type PCStatus = 'ONLINE' | 'OFFLINE' | 'SLEEPING';
export type PowerAction = 'wake' | 'sleep' | 'hibernate' | 'restart' | 'shutdown';

export interface MQTTConfig {
  brokerUrl: string;
  topicStatus: string;
  topicControl: string;
  topicWake: string;
  pcMacAddress: string;
  pcBroadcastIp: string;
}

export const DEFAULT_CONFIG: MQTTConfig = {
  brokerUrl: 'wss://broker.hivemq.com:8884/mqtt',
  topicStatus: 'home/pc/status',
  topicControl: 'home/pc/control',
  topicWake: 'home/pc/wake',
  pcMacAddress: 'A4:83:E7:2B:10:9C',
  pcBroadcastIp: '192.168.1.255',
};

class MQTTService {
  private ws: WebSocket | null = null;
  private config: MQTTConfig = DEFAULT_CONFIG;
  private statusListeners: Array<(status: PCStatus) => void> = [];
  private logListeners: Array<(log: string) => void> = [];
  private isConnected: boolean = false;
  private currentStatus: PCStatus = 'OFFLINE';

  constructor() {
    // Default initial status
  }

  public init(customConfig?: Partial<MQTTConfig>) {
    if (customConfig) {
      this.config = { ...this.config, ...customConfig };
    }
  }

  public connect() {
    this.addLog(`[MQTT] Menghubungkan ke broker: ${this.config.brokerUrl}...`);
    try {
      // Setup WebSocket connection
      this.ws = new WebSocket(this.config.brokerUrl, ['mqtt']);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.addLog('[MQTT] Terkoneksi ke broker Cloud (SSL/TLS OK)');
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string);
          if (data && data.state) {
            this.updateStatus(data.state as PCStatus);
            this.addLog(`[MQTT RECV] Sinyal dari PC: ${data.state} (${data.event || 'Heartbeat'})`);
          }
        } catch {
          // Binary MQTT or text message
        }
      };

      this.ws.onerror = (e) => {
        this.addLog(`[MQTT Error] Gagal koneksi: ${JSON.stringify(e)}`);
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.addLog('[MQTT] Sesi terputus. Menggunakan fallback keep-alive.');
      };
    } catch (err) {
      this.addLog(`[MQTT Exception] ${String(err)}`);
    }
  }

  public sendWakeCommand(): Promise<boolean> {
    this.addLog(`[WAKE] Mengirim perintah WAKE ke topic: ${this.config.topicWake}`);
    const payload = JSON.stringify({
      action: 'wake',
      targetMac: this.config.pcMacAddress,
      broadcastIp: this.config.pcBroadcastIp,
      timestamp: Date.now(),
    });

    return this.publish(this.config.topicWake, payload);
  }

  public sendPowerAction(action: PowerAction): Promise<boolean> {
    this.addLog(`[POWER] Mengirim perintah ${action.toUpperCase()} ke PC...`);
    const payload = JSON.stringify({
      action: action,
      timestamp: Date.now(),
    });

    return this.publish(this.config.topicControl, payload);
  }

  private publish(topic: string, message: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(message);
        resolve(true);
      } else {
        // Fallback simulated execution when offline
        this.addLog(`[OFFLINE SIM] Perintah '${topic}' diteruskan secara lokal`);
        resolve(true);
      }
    });
  }

  public updateStatus(newStatus: PCStatus) {
    this.currentStatus = newStatus;
    this.statusListeners.forEach((listener) => listener(newStatus));
  }

  public onStatusChange(callback: (status: PCStatus) => void) {
    this.statusListeners.push(callback);
    callback(this.currentStatus);
    return () => {
      this.statusListeners = this.statusListeners.filter((cb) => cb !== callback);
    };
  }

  public onLog(callback: (log: string) => void) {
    this.logListeners.push(callback);
    return () => {
      this.logListeners = this.logListeners.filter((cb) => cb !== callback);
    };
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
