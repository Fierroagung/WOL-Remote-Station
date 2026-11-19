/**
 * StorageService - Penyimpanan Konfigurasi Universal
 * Bekerja secara otomatis di Android, iOS, dan Web browser
 */

const memoryCache: Record<string, string> = {};

export const StorageService = {
  async getItem(key: string): Promise<string | null> {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
      return memoryCache[key] || null;
    } catch {
      return memoryCache[key] || null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
      memoryCache[key] = value;
    } catch {
      memoryCache[key] = value;
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
      delete memoryCache[key];
    } catch {
      delete memoryCache[key];
    }
  },
};
