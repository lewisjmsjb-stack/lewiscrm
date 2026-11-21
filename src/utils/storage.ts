import { AppState, AppUser } from '../types';
import { createSeedState } from '../data/seedData';
import { hashPassword } from './auth';

const DB_NAME = 'lewis_sales_assistant_db';
const STORE_NAME = 'app_state';
const DB_VERSION = 1;
const LOCALSTORAGE_KEY = 'lewis_sales_assistant_state_v1';

export async function createDefaultAdminUser(): Promise<AppUser> {
  const passwordHash = await hashPassword('Admin1');
  return {
    id: 'user_admin_lewis',
    fullName: 'Lewis Lee',
    email: 'lewis.jmsjb@gmail.com',
    phone: '+601170718928',
    passwordHash,
    role: 'Admin',
    verified: true,
    status: 'Active',
    createdAt: new Date().toISOString().slice(0, 10),
  };
}

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

    const defaultAdmin = await createDefaultAdminUser();

    if (state && Array.isArray(state.customers) && Array.isArray(state.followUps)) {
      let users = Array.isArray(state.users) && state.users.length > 0 ? state.users : [defaultAdmin];

      // One-time cleanup: migrate any lewisls.jmsjb@gmail.com -> lewis.jmsjb@gmail.com and remove duplicates
      let hasChanges = false;
      const seenEmails = new Set<string>();
      const cleanedUsers: AppUser[] = [];

      for (const u of users) {
        let email = (u.email || '').trim().toLowerCase();
        if (email === 'lewisls.jmsjb@gmail.com') {
          email = 'lewis.jmsjb@gmail.com';
          hasChanges = true;
        }
        if (email && seenEmails.has(email)) {
          // duplicate user with legacy email, skip
          hasChanges = true;
          continue;
        }
        if (email) seenEmails.add(email);

        if (email !== u.email) {
          cleanedUsers.push({ ...u, email });
          hasChanges = true;
        } else {
          cleanedUsers.push(u);
        }
      }

      if (cleanedUsers.length === 0) {
        cleanedUsers.push(defaultAdmin);
        hasChanges = true;
      }

      let userProfile = state.userProfile;
      if (userProfile && (userProfile.email || '').trim().toLowerCase() === 'lewisls.jmsjb@gmail.com') {
        userProfile = { ...userProfile, email: 'lewis.jmsjb@gmail.com' };
        hasChanges = true;
      }

      const currentUserId = state.currentUserId !== undefined ? state.currentUserId : null;
      const finalState: AppState = {
        ...state,
        userProfile,
        users: cleanedUsers,
        currentUserId,
      };

      if (hasChanges) {
        await saveAppStateToIDB(finalState);
      }

      return finalState;
    }

    // Check localStorage migration once
    const legacyRaw = window.localStorage.getItem(LOCALSTORAGE_KEY);
    if (legacyRaw) {
      try {
        const parsed = JSON.parse(legacyRaw) as Partial<AppState>;
        if (Array.isArray(parsed.customers) && Array.isArray(parsed.followUps)) {
          let users = Array.isArray(parsed.users) && parsed.users.length > 0 ? parsed.users : [defaultAdmin];
          users = users.map((u) => {
            const email = (u.email || '').trim().toLowerCase() === 'lewisls.jmsjb@gmail.com' ? 'lewis.jmsjb@gmail.com' : u.email;
            return { ...u, email };
          });

          const migratedState: AppState = {
            userProfile: parsed.userProfile,
            users,
            currentUserId: parsed.currentUserId !== undefined ? parsed.currentUserId : null,
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
    const initialState: AppState = {
      ...seed,
      users: [defaultAdmin],
      currentUserId: null,
    };
    await saveAppStateToIDB(initialState);
    return initialState;
  } catch (err) {
    console.warn('IndexedDB load failed, falling back to seed/localStorage:', err);
    const defaultAdmin = await createDefaultAdminUser();
    const legacyRaw = window.localStorage.getItem(LOCALSTORAGE_KEY);
    if (legacyRaw) {
      try {
        const parsed = JSON.parse(legacyRaw) as Partial<AppState>;
        if (Array.isArray(parsed.customers) && Array.isArray(parsed.followUps)) {
          let users = Array.isArray(parsed.users) && parsed.users.length > 0 ? parsed.users : [defaultAdmin];
          users = users.map((u) => ({
            ...u,
            email: (u.email || '').trim().toLowerCase() === 'lewisls.jmsjb@gmail.com' ? 'lewis.jmsjb@gmail.com' : u.email,
          }));
          return {
            userProfile: parsed.userProfile,
            users,
            currentUserId: parsed.currentUserId !== undefined ? parsed.currentUserId : null,
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
    const seed = createSeedState();
    return {
      ...seed,
      users: [defaultAdmin],
      currentUserId: null,
    };
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
