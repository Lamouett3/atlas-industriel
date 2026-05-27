/**
 * Profile manager — local accounts.
 *
 * IMPORTANT — these are not "real" accounts:
 *   - Data lives in localStorage on this browser only
 *   - No password hashing, no server-side auth
 *   - The optional PIN is a soft-lock (anyone with browser access can read raw localStorage)
 *
 * For multi-device sync or team sharing, add a real backend (Supabase, Firebase…).
 * This module exposes a small API that a backend layer could replace later
 * without changing the rest of the app.
 *
 * Storage layout:
 *   atlas.profiles.v1       → { profiles: [{id, name, color, pin, createdAt}], activeId }
 *   atlas.profile.<id>.crm  → { favorites, statuses, contacts, notes }  (handled by crm.js)
 */

const LS_KEY = 'atlas.profiles.v1';

const listeners = new Set();

const store = {
  profiles: [],
  activeId: null
};

/** Load from localStorage on app start. */
export function initProfiles() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.profiles)) store.profiles = parsed.profiles;
      if (typeof parsed.activeId === 'string') store.activeId = parsed.activeId;
    }
  } catch (e) {
    console.warn('Profile init failed:', e);
  }

  // Validate: ensure activeId points to a real profile
  if (store.activeId && !store.profiles.find(p => p.id === store.activeId)) {
    store.activeId = null;
  }
}

function persist() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      profiles: store.profiles,
      activeId: store.activeId
    }));
  } catch (e) {
    console.warn('Profile persist failed:', e);
  }
}

function emit(change) { listeners.forEach(fn => fn(change)); }

export function subscribeProfiles(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ============================================================
//  Public API
// ============================================================

export function listProfiles() {
  return [...store.profiles];
}

export function getActiveProfile() {
  if (!store.activeId) return null;
  return store.profiles.find(p => p.id === store.activeId) ?? null;
}

export function getActiveProfileId() {
  return store.activeId;
}

/** Create a new profile. Returns the created profile. */
export function createProfile({ name, color, pin }) {
  const trimmed = (name ?? '').trim();
  if (!trimmed) throw new Error('Le nom du profil est requis');
  if (store.profiles.some(p => p.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error('Un profil avec ce nom existe déjà');
  }

  const profile = {
    id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    name: trimmed,
    color: color || pickRandomColor(),
    pin: pin ? hashPin(pin) : null,
    createdAt: new Date().toISOString()
  };
  store.profiles.push(profile);
  persist();
  emit('create');
  return profile;
}

/** Switch to another profile (after PIN verification if required). */
export function switchTo(profileId, pinAttempt = null) {
  const profile = store.profiles.find(p => p.id === profileId);
  if (!profile) throw new Error('Profil introuvable');
  if (profile.pin) {
    if (!pinAttempt) throw new Error('PIN requis');
    if (hashPin(pinAttempt) !== profile.pin) throw new Error('PIN incorrect');
  }
  store.activeId = profileId;
  persist();
  emit('switch');
  return profile;
}

/** Sign out — back to the profile selector. */
export function signOut() {
  store.activeId = null;
  persist();
  emit('signOut');
}

/** Update an existing profile (name, color, pin). */
export function updateProfile(profileId, patch) {
  const idx = store.profiles.findIndex(p => p.id === profileId);
  if (idx < 0) throw new Error('Profil introuvable');
  const cur = store.profiles[idx];

  const next = { ...cur };
  if (patch.name != null) {
    const trimmed = patch.name.trim();
    if (!trimmed) throw new Error('Le nom du profil est requis');
    next.name = trimmed;
  }
  if (patch.color != null) next.color = patch.color;
  if ('pin' in patch) {
    next.pin = patch.pin ? hashPin(patch.pin) : null;
  }
  store.profiles[idx] = next;
  persist();
  emit('update');
  return next;
}

/** Delete a profile and its associated CRM data. */
export function deleteProfile(profileId) {
  const idx = store.profiles.findIndex(p => p.id === profileId);
  if (idx < 0) return;
  store.profiles.splice(idx, 1);
  // Remove associated CRM data
  try { localStorage.removeItem(`atlas.profile.${profileId}.crm`); } catch (e) {}
  if (store.activeId === profileId) store.activeId = null;
  persist();
  emit('delete');
}

// ============================================================
//  Export / import (JSON)
// ============================================================

/** Returns the full profile + its CRM data as a JSON object.
 *  The caller may pass `dataset` (fetched from the repository/IndexedDB) to
 *  embed the saved search results in the bundle. */
export function exportProfile(profileId, dataset = null) {
  const profile = store.profiles.find(p => p.id === profileId);
  if (!profile) throw new Error('Profil introuvable');

  let crm = null;
  try {
    const raw = localStorage.getItem(`atlas.profile.${profileId}.crm`);
    if (raw) crm = JSON.parse(raw);
  } catch (e) { /* ignore */ }

  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    profile,
    crm,
    dataset   // may be null; embedded by the caller when available
  };
}

/** Import a previously exported profile bundle.
 *  Returns { profile, dataset } so the caller can persist the dataset into the
 *  repository (IndexedDB). */
export function importProfile(bundle) {
  if (!bundle || typeof bundle !== 'object' || !bundle.profile) {
    throw new Error('Fichier d\'import invalide');
  }
  const original = bundle.profile;
  const newId = 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const profile = {
    ...original,
    id: newId,
    name: ensureUniqueName(original.name || 'Importé')
  };
  store.profiles.push(profile);

  if (bundle.crm) {
    try {
      localStorage.setItem(`atlas.profile.${newId}.crm`, JSON.stringify(bundle.crm));
    } catch (e) {
      console.warn('Import CRM persist failed:', e);
    }
  }

  persist();
  emit('import');
  // Hand the dataset back to the caller (persisted into IndexedDB there)
  const dataset = (bundle.dataset && Array.isArray(bundle.dataset.companies))
    ? bundle.dataset : null;
  return { profile, dataset };
}

function ensureUniqueName(base) {
  let candidate = base;
  let i = 2;
  while (store.profiles.some(p => p.name.toLowerCase() === candidate.toLowerCase())) {
    candidate = `${base} (${i++})`;
  }
  return candidate;
}

// ============================================================
//  Helpers
// ============================================================

/**
 * Hash a PIN with SubtleCrypto if available, else a deterministic fallback.
 * NOTE: this is NOT cryptographically robust against a determined attacker —
 * it just prevents a casual onlooker from reading the raw PIN in localStorage.
 */
function hashPin(pin) {
  // Simple djb2 hash with salt — synchronous, no crypto dependency
  const SALT = 'atlas.v1';
  let h = 5381;
  const s = SALT + ':' + String(pin);
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

const PROFILE_COLORS = [
  '#4FD1C5', '#FFB347', '#FF7B6B', '#7AAFFF',
  '#C084FC', '#6EE7B7', '#F472B6', '#FFD23F'
];

function pickRandomColor() {
  const used = new Set(store.profiles.map(p => p.color));
  const free = PROFILE_COLORS.filter(c => !used.has(c));
  const pool = free.length ? free : PROFILE_COLORS;
  return pool[Math.floor(Math.random() * pool.length)];
}

export const PROFILE_COLOR_PALETTE = PROFILE_COLORS;
