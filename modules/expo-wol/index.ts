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
