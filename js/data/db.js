/**
 * IndexedDB storage — for large datasets that exceed the ~5 MB localStorage
 * limit. Holds the API result cache and per-profile saved datasets.
 *
 * Simple key/value store: one object store "kv" keyed by string.
 * All functions are async and degrade gracefully if IndexedDB is unavailable
 * (e.g. very old browsers or private mode), falling back to localStorage.
 */

const DB_NAME = 'atlas-industriel';
const DB_VERSION = 1;
const STORE = 'kv';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB indisponible'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Ouverture IndexedDB échouée'));
  });
  return dbPromise;
}

/** Store a JSON-serializable value under a key. */
export async function idbSet(key, value) {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction annulée'));
    });
  } catch (e) {
    // Fallback to localStorage for small payloads
    try {
      localStorage.setItem('idbfallback.' + key, JSON.stringify(value));
      return true;
    } catch (e2) {
      throw e2; // genuinely out of space everywhere
    }
  }
}

/** Read a value by key. Returns null if absent. */
export async function idbGet(key) {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    try {
      const raw = localStorage.getItem('idbfallback.' + key);
      return raw ? JSON.parse(raw) : null;
    } catch (e2) {
      return null;
    }
  }
}

/** Delete a value by key. */
export async function idbDelete(key) {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    try { localStorage.removeItem('idbfallback.' + key); } catch (e2) {}
    return false;
  }
}

/** Approximate storage usage (bytes) if the browser exposes it. */
export async function idbEstimate() {
  try {
    if (navigator.storage?.estimate) {
      const { usage, quota } = await navigator.storage.estimate();
      return { usage: usage ?? 0, quota: quota ?? 0 };
    }
  } catch (e) { /* ignore */ }
  return null;
}
