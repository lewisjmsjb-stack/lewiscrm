import { AppState, AppUser, Customer, FollowUp } from '../types';
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

const sampleCustomerIds = new Set(['cust_pacific_cold', 'cust_senoko_fresh', 'cust_tuas_cryopharma', 'cust_changi_aero']);
const sampleCompanySubstrings = ['pacific cold', 'senoko fresh', 'tuas cryopharma', 'changi aerocatering'];

function cleanSampleData(customers: Customer[], followUps: FollowUp[]): { customers: Customer[]; followUps: FollowUp[]; changed: boolean } {
  let changed = false;
  const filteredCustomers = customers.filter((c) => {
    const isSampleId = sampleCustomerIds.has(c.id);
    const nameLower = (c.companyName || '').toLowerCase();
    const isSampleName = sampleCompanySubstrings.some((sub) => nameLower.includes(sub));
    if (isSampleId || isSampleName) {
      changed = true;
      return false;
    }
    return true;
  });

  const validCustomerIds = new Set(filteredCustomers.map((c) => c.id));
  const filteredFollowUps = followUps.filter((f) => {
    if (!validCustomerIds.has(f.customerId)) {
      changed = true;
      return false;
    }
    return true;
  });

  return { customers: filteredCustomers, followUps: filteredFollowUps, changed };
}

export async function loadAppStateFromIDB(): Promise<AppState> {
  const defaultAdmin = await createDefaultAdminUser();
  const seed = createSeedState();

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
      let users = Array.isArray(state.users) && state.users.length > 0 ? state.users : [defaultAdmin];

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

      const { customers: cleanedCustomers, followUps: cleanedFollowUps, changed: sampleCleaned } = cleanSampleData(state.customers, state.followUps);
      if (sampleCleaned) {
        hasChanges = true;
      }

      let userProfile = state.userProfile || seed.userProfile;
      if (userProfile && (userProfile.email || '').trim().toLowerCase() === 'lewisls.jmsjb@gmail.com') {
        userProfile = { ...userProfile, email: 'lewis.jmsjb@gmail.com' };
      }

      const currentUserId = state.currentUserId !== undefined ? state.currentUserId : null;
      const finalState: AppState = {
        ...state,
        userProfile,
        users: cleanedUsers,
        currentUserId,
        customers: cleanedCustomers,
        followUps: cleanedFollowUps,
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

          const { customers: cleanedCustomers, followUps: cleanedFollowUps } = cleanSampleData(parsed.customers, parsed.followUps);

          const migratedState: AppState = {
            userProfile: parsed.userProfile || seed.userProfile,
            users,
            currentUserId: parsed.currentUserId !== undefined ? parsed.currentUserId : null,
            customers: cleanedCustomers,
            followUps: cleanedFollowUps,
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

    const initialState: AppState = {
      ...seed,
      users: [defaultAdmin],
      currentUserId: null,
    };
    await saveAppStateToIDB(initialState);
    return initialState;
  } catch (err) {
    console.warn('IndexedDB load failed, falling back to seed/localStorage:', err);
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
          const { customers: cleanedCustomers, followUps: cleanedFollowUps } = cleanSampleData(parsed.customers, parsed.followUps);
          return {
            userProfile: parsed.userProfile || seed.userProfile,
            users,
            currentUserId: parsed.currentUserId !== undefined ? parsed.currentUserId : null,
            customers: cleanedCustomers,
            followUps: cleanedFollowUps,
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
