import { AppState } from '../types';
import { createSeedState } from '../data/seedData';

const DB_NAME = 'lewis_sales_assistant_db';
const STORE_NAME = 'app_state';
const DB_VERSION = 1;
const LOCALSTORAGE_KEY = 'lewis_sales_assistant_state_v1';

export function openIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this environment.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(request.error || new Error('Failed to open IndexedDB.'));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

export async function loadAppStateFromIDB(): Promise<AppState> {
  try {
    const db = await openIndexedDB();
    const state = await new Promise<AppState | undefined>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get('current_state');

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as AppState | undefined);
    });

    if (state && Array.isArray(state.customers) && Array.isArray(state.followUps)) {
      return state;
    }

    // Check localStorage migration once
    const legacyRaw = window.localStorage.getItem(LOCALSTORAGE_KEY);
    if (legacyRaw) {
      try {
        const parsed = JSON.parse(legacyRaw) as Partial<AppState>;
        if (Array.isArray(parsed.customers) && Array.isArray(parsed.followUps)) {
          const migratedState: AppState = {
            customers: parsed.customers,
            followUps: parsed.followUps,
            expiryActions:
              parsed.expiryActions && typeof parsed.expiryActions === 'object'
                ? parsed.expiryActions
                : {},
          };
          await saveAppStateToIDB(migratedState);
          window.localStorage.removeItem(LOCALSTORAGE_KEY);
          return migratedState;
        }
      } catch {
        // Ignore legacy parse error
      }
      window.localStorage.removeItem(LOCALSTORAGE_KEY);
    }

    const seed = createSeedState();
    await saveAppStateToIDB(seed);
    return seed;
  } catch (err) {
    console.warn('IndexedDB load failed, falling back to seed/localStorage:', err);
    // Fallback to localStorage or seed
    const legacyRaw = window.localStorage.getItem(LOCALSTORAGE_KEY);
    if (legacyRaw) {
      try {
        const parsed = JSON.parse(legacyRaw) as Partial<AppState>;
        if (Array.isArray(parsed.customers) && Array.isArray(parsed.followUps)) {
          return {
            customers: parsed.customers,
            followUps: parsed.followUps,
            expiryActions:
              parsed.expiryActions && typeof parsed.expiryActions === 'object'
                ? parsed.expiryActions
                : {},
          };
        }
      } catch {
        // ignore
      }
    }
    return createSeedState();
  }
}

export async function saveAppStateToIDB(state: AppState): Promise<void> {
  try {
    const db = await openIndexedDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(state, 'current_state');

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (err) {
    console.warn('IndexedDB save failed, falling back to localStorage cache:', err);
    try {
      window.localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(state));
    } catch {
      // quota exceeded or storage unavailable
    }
  }
}
