import { requireNativeModule } from 'expo-modules-core';

let ExpoWol: any = null;
try {
  ExpoWol = requireNativeModule('ExpoWol');
} catch {
  ExpoWol = null;
}

export async function sendWakeOnLanNative(
  mac: string,
  broadcastIp: string = '255.255.255.255',
  port: number = 9
): Promise<boolean> {
  if (ExpoWol && ExpoWol.sendWakeOnLan) {
    try {
      return await ExpoWol.sendWakeOnLan(mac, broadcastIp, port);
    } catch {
      return false;
    }
  }
  return false;
}

export async function pingHostNative(host: string, timeoutMs: number = 1500): Promise<boolean> {
  if (ExpoWol && ExpoWol.pingHost) {
    try {
      return await ExpoWol.pingHost(host, timeoutMs);
    } catch {
      return false;
    }
  }
  return false;
}

export async function sendUdpCommandNative(
  ip: string,
  port: number = 20388,
  payload: string = ''
): Promise<boolean> {
  if (ExpoWol && ExpoWol.sendUdpCommand) {
    try {
      return await ExpoWol.sendUdpCommand(ip, port, payload);
    } catch {
      return false;
    }
  }
  return false;
}

export async function startKeepAliveNative(): Promise<boolean> {
  if (ExpoWol && ExpoWol.startKeepAliveService) {
    try {
      return await ExpoWol.startKeepAliveService();
    } catch {
      return false;
    }
  }
  return false;
}

export async function stopKeepAliveNative(): Promise<boolean> {
  if (ExpoWol && ExpoWol.stopKeepAliveService) {
    try {
      return await ExpoWol.stopKeepAliveService();
    } catch {
      return false;
    }
  }
  return false;
}

export async function saveSettingNative(key: string, value: string): Promise<boolean> {
  if (ExpoWol && ExpoWol.saveSetting) {
    try {
      return await ExpoWol.saveSetting(key, value);
    } catch {
      return false;
    }
  }
  return false;
}

export async function getSettingNative(key: string): Promise<string | null> {
  if (ExpoWol && ExpoWol.getSetting) {
    try {
      return await ExpoWol.getSetting(key);
    } catch {
      return null;
    }
  }
  return null;
}
