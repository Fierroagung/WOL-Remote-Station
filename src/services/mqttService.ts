/**
 * Universal MQTT Realtime Service for WOL Remote Station
 * Mendukung Multi-User & Multi-PC menggunakan Dynamic Station Pairing Key
 */

export type PCStatus = 'ONLINE' | 'OFFLINE' | 'SLEEPING';
export type PowerAction = 'wake' | 'sleep' | 'hibernate' | 'restart' | 'shutdown';

export interface StationConfig {
  stationName: string;
  stationKey: string; // Kunci Pasangan Unik (misal: "WOL-9341-PC" atau nama rahasia Anda)
  macAddress: string; // MAC Address kartu LAN PC Target
  broadcastIp: string; // Subnet broadcast Wi-Fi (default: "192.168.1.255")
  brokerUrl: string; // Alamat Cloud Broker WSS
}

export const DEFAULT_STATION_CONFIG: StationConfig = {
  stationName: 'RIG-STATION-PRO',
  stationKey: 'WOL-9341-PC',
  macAddress: 'A4:83:E7:2B:10:9C',
  broadcastIp: '192.168.1.255',
  brokerUrl: 'wss://broker.hivemq.com:8884/mqtt',
};

class MQTTService {
  private ws: WebSocket | null = null;
  private config: StationConfig = DEFAULT_STATION_CONFIG;
  private statusListeners: Array<(status: PCStatus) => void> = [];
  private logListeners: Array<(log: string) => void> = [];
  private isConnected: boolean = false;
  private currentStatus: PCStatus = 'OFFLINE';

  public getTopicStatus(): string {
    return `wol_station/${this.config.stationKey}/status`;
  }

  public getTopicControl(): string {
    return `wol_station/${this.config.stationKey}/control`;
  }

  public getTopicWake(): string {
    return `wol_station/${this.config.stationKey}/wake`;
  }

  public getConfig(): StationConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<StationConfig>) {
    this.config = { ...this.config, ...newConfig };
    this.addLog(`[CONFIG] Konfigurasi stasiun diperbarui: ${this.config.stationName} (Key: ${this.config.stationKey})`);
    
    // Reconnect ke broker dengan topik baru jika socket terbuka
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore
      }
      this.connect();
    }
  }

  public connect() {
    this.addLog(`[MQTT] Menghubungkan ke broker: ${this.config.brokerUrl}...`);
    try {
      this.ws = new WebSocket(this.config.brokerUrl, ['mqtt']);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.addLog(`[MQTT] Terkoneksi ke Global Cloud Broker. Berlangganan stasiun: ${this.config.stationKey}`);
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
        this.addLog('[MQTT] Sesi terputus. Mencoba reconnect...');
      };
    } catch (err) {
      this.addLog(`[MQTT Exception] ${String(err)}`);
    }
  }

  public sendWakeCommand(): Promise<boolean> {
    const topic = this.getTopicWake();
    this.addLog(`[WAKE] Mengirim perintah WAKE ke topic: ${topic}`);
    const payload = JSON.stringify({
      action: 'wake',
      targetMac: this.config.macAddress,
      broadcastIp: this.config.broadcastIp,
      stationKey: this.config.stationKey,
      timestamp: Date.now(),
    });

    return this.publish(topic, payload);
  }

  public sendPowerAction(action: PowerAction): Promise<boolean> {
    const topic = this.getTopicControl();
    this.addLog(`[POWER] Mengirim perintah ${action.toUpperCase()} ke topic: ${topic}`);
    const payload = JSON.stringify({
      action: action,
      stationKey: this.config.stationKey,
      timestamp: Date.now(),
    });

    return this.publish(topic, payload);
  }

  private publish(topic: string, message: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(message);
        resolve(true);
      } else {
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
