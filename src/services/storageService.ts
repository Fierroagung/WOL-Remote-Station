/**
 * StorageService - Penyimpanan Konfigurasi Universal Permanen
 * Menyimpan data ke Android SharedPreferences & iOS UserDefaults secara native.
 * Data TIDAK AKAN HILANG saat aplikasi ditutup atau HP di-restart.
 */

import { saveSettingNative, getSettingNative } from '../../modules/expo-wol';

const memoryCache: Record<string, string> = {};

export const StorageService = {
  async getItem(key: string): Promise<string | null> {
    // 1. Coba baca dari Native Disk Storage (Android SharedPreferences / iOS UserDefaults)
    try {
      const nativeVal = await getSettingNative(key);
      if (nativeVal !== null && nativeVal !== undefined && nativeVal.length > 0) {
        memoryCache[key] = nativeVal;
        return nativeVal;
      }
    } catch {}

    // 2. Coba browser localStorage (jika di Web mode)
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const val = window.localStorage.getItem(key);
        if (val !== null) return val;
      }
    } catch {}

    // 3. Fallback memory cache
    return memoryCache[key] || null;
  },

  async setItem(key: string, value: string): Promise<void> {
    memoryCache[key] = value;

    // 1. Simpan ke Native Disk Storage permanen
    try {
      await saveSettingNative(key, value);
    } catch {}

    // 2. Simpan ke browser localStorage jika Web
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } catch {}
  },

  async removeItem(key: string): Promise<void> {
    delete memoryCache[key];
    try {
      await saveSettingNative(key, '');
    } catch {}
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch {}
  },
};
