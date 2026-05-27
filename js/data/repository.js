/**
 * Repository — single source of truth for company data.
 *
 * Combines three layers:
 *   1. CURATED      — hand-picked entries shipped with the app (companies.js)
 *   2. API          — fetched from recherche-entreprises.api.gouv.fr,
 *                     cached in localStorage between sessions
 *   3. CUSTOM       — entries created by the user in the app, persisted locally
 *
 * Merge rules:
 *   - CUSTOM overrides CURATED if same id
 *   - API entries are added if not already in CURATED (matched by name+city)
 *   - User can mark CURATED entries as deleted (soft delete, persisted)
 *
 * The merged list is exposed as `getAllCompanies()`.
 */
import { COMPANIES as CURATED } from './companies.js';
import { fetchIndustrialCompanies } from './api.js';
import { idbGet, idbSet, idbDelete } from './db.js';

const LS_KEY_API     = 'atlas.cache.api.v1';   // legacy localStorage key (migrated to IndexedDB)
const LS_KEY_CUSTOM  = 'atlas.user.custom.v1';
const LS_KEY_DELETED = 'atlas.user.deleted.v1';
const LS_KEY_OVERRIDES = 'atlas.user.overrides.v1';

// IndexedDB keys (large datasets live here — no ~5 MB cap)
const IDB_KEY_API = 'cache.api';
function idbDatasetKey(profileId) {
  return `profile.${profileId}.dataset`;
}

/** legacy localStorage key holding the dataset saved on a given profile. */
function datasetKey(profileId) {
  return `atlas.profile.${profileId}.dataset.v1`;
}

const repo = {
  curated: CURATED.map(c => ({ ...c, source: c.source ?? 'curated' })),
  api: [],                  // loaded from cache or fetched
  custom: [],               // user-created
  deletedIds: new Set(),    // soft-deleted ids
  overrides: {},            // id → partial Company (user edits to curated/api)
  lastFetch: null,
  isLoading: false,
  loadingProgress: null
};

const subscribers = new Set();
function emit(change) { subscribers.forEach(fn => fn(change)); }

export function subscribeRepo(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

// ============================================================
//  INIT — restore cache from localStorage
// ============================================================
export async function initRepo() {
  // Each localStorage key is read independently so a single corrupted entry
  // doesn't prevent the others from loading.
  const readJSON = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed ?? fallback;
    } catch (e) {
      console.warn(`Repo init: "${key}" corrupted, ignoring`, e);
      return fallback;
    }
  };

  // Small data stays in localStorage
  const custom = readJSON(LS_KEY_CUSTOM, []);
  repo.custom = Array.isArray(custom) ? custom : [];
  const deleted = readJSON(LS_KEY_DELETED, []);
  repo.deletedIds = new Set(Array.isArray(deleted) ? deleted : []);
  const overrides = readJSON(LS_KEY_OVERRIDES, {});
  repo.overrides = (overrides && typeof overrides === 'object') ? overrides : {};

  // Large API dataset lives in IndexedDB (no ~5 MB cap)
  try {
    let cached = await idbGet(IDB_KEY_API);

    // One-time migration: if nothing in IndexedDB yet but an old localStorage
    // cache exists, move it over then clear the old key to free space.
    if (!cached) {
      const legacy = readJSON(LS_KEY_API, null);
      if (legacy && Array.isArray(legacy.companies)) {
        cached = legacy;
        try { await idbSet(IDB_KEY_API, legacy); } catch (e) { /* ignore */ }
      }
    }
    // Always drop the legacy localStorage cache — it's the biggest space hog
    try { localStorage.removeItem(LS_KEY_API); } catch (e) {}

    if (cached && Array.isArray(cached.companies)) {
      repo.api = cached.companies;
      repo.lastFetch = cached.lastFetch ?? null;
    }
  } catch (e) {
    console.warn('Repo init: IndexedDB load failed', e);
  }
}

// ============================================================
//  GETTERS
// ============================================================

/** Returns the merged list of all visible companies. */
export function getAllCompanies() {
  // Build a Set of (name|city) keys for API to dedupe against curated
  const curatedKeys = new Set(
    repo.curated.map(c => keyOf(c))
  );
  const customKeys = new Set(
    repo.custom.map(c => keyOf(c))
  );

  // API entries that don't collide with curated or custom
  const apiUnique = repo.api.filter(c =>
    !curatedKeys.has(keyOf(c)) && !customKeys.has(keyOf(c))
  );

  // Merge in priority order: custom > curated > api
  const merged = [
    ...repo.curated,
    ...apiUnique,
    ...repo.custom
  ]
    .filter(c => !repo.deletedIds.has(c.id))
    .map(c => applyOverrides(c))
    .map(c => normalizeDeptOn(c));    // ensure c.dept is always canonical INSEE form

  return merged;
}

/** Ensure c.dept is in canonical INSEE form ("01" not "1", "2A"/"2B" preserved). */
function normalizeDeptOn(c) {
  if (c.dept == null) return c;
  let s = String(c.dept).trim().toUpperCase();
  if (s === '2A' || s === '2B') return c.dept === s ? c : { ...c, dept: s };
  if (/^\d$/.test(s)) return { ...c, dept: '0' + s };
  return c.dept === s ? c : { ...c, dept: s };
}

function applyOverrides(company) {
  const ov = repo.overrides[company.id];
  return ov ? { ...company, ...ov, _edited: true } : company;
}

function keyOf(c) {
  return (c.name?.toLowerCase().trim() ?? '') + '|' + (c.city?.toLowerCase().trim() ?? '');
}

export function getStats() {
  return {
    curated: repo.curated.length,
    api: repo.api.length,
    custom: repo.custom.length,
    deleted: repo.deletedIds.size,
    edited: Object.keys(repo.overrides).length,
    total: getAllCompanies().length,
    lastFetch: repo.lastFetch
  };
}

export function isLoading() { return repo.isLoading; }
export function getLoadingProgress() { return repo.loadingProgress; }
export function getLastFetch() { return repo.lastFetch; }

// ============================================================
//  REFRESH — fetch from public API
// ============================================================

let currentAbort = null;

/**
 * Refresh the API layer by querying recherche-entreprises.api.gouv.fr.
 *
 * @param {object} opts
 * @param {string[]} opts.departements    — list of dept codes to fetch
 * @param {boolean}  [opts.includeTPE]
 * @param {number|null} [opts.maxPerDept] — null = no cap (until last page)
 * @param {boolean}  [opts.deepMode]      — segment by NAF division (gets past 10k cap)
 * @returns {Promise<{added: number, total: number, errors: string[]}>}
 */
export async function refreshFromAPI(opts = {}) {
  if (repo.isLoading) {
    throw new Error('Une recherche est déjà en cours');
  }
  if (currentAbort) currentAbort.abort();
  currentAbort = new AbortController();

  repo.isLoading = true;
  repo.loadingProgress = {
    phase: 'init',
    done: 0,
    total: opts.departements?.length ?? 0,
    collected: 0
  };
  emit('refresh:start');

  try {
    const { companies, errors } = await fetchIndustrialCompanies({
      departements: opts.departements,
      includeTPE: opts.includeTPE ?? true,
      maxPerDept: opts.maxPerDept ?? null,
      deepMode: opts.deepMode ?? false,
      nafFilter: opts.nafFilter ?? '',
      includeSecondary: opts.includeSecondary ?? false,
      signal: currentAbort.signal,
      onProgress: (p) => {
        repo.loadingProgress = p;
        emit('refresh:progress');
      }
    });

    const previousCount = repo.api.length;

    // MERGE rather than replace: each new search adds to what's already loaded,
    // so a specific search never wipes out previous results. Dedupe by `id`
    // (siret-based), and let the newest version of a record win.
    const byId = new Map();
    for (const c of repo.api) {
      if (c?.id != null) byId.set(c.id, c);
    }
    let freshlyAdded = 0;
    for (const c of companies) {
      if (c?.id == null) continue;
      if (!byId.has(c.id)) freshlyAdded++;
      byId.set(c.id, c);   // newest wins on conflict (refreshed data)
    }
    repo.api = Array.from(byId.values());
    repo.lastFetch = Date.now();
    await persistAPI();

    const added = freshlyAdded;
    emit('refresh:done');
    return { added, total: repo.api.length, errors };
  } catch (e) {
    emit('refresh:error');
    throw e;
  } finally {
    repo.isLoading = false;
    repo.loadingProgress = null;
    currentAbort = null;
  }
}

export function cancelRefresh() {
  if (currentAbort) currentAbort.abort();
}

// ============================================================
//  CRUD — custom entries
// ============================================================

/** Add a user-created company. Generates an id automatically. */
export function addCustomCompany(data) {
  const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const company = {
    id,
    name: data.name?.trim() ?? 'Sans nom',
    sector: data.sector ?? 'Mécanique',
    city: data.city?.trim() ?? '',
    dept: data.dept ?? '',
    lat: parseFloat(data.lat) || 45.5,
    lng: parseFloat(data.lng) || 5.5,
    employees: parseInt(data.employees, 10) || 0,
    size: data.size ?? 'PME',
    desc: data.desc?.trim() ?? '',
    source: 'custom',
    createdAt: new Date().toISOString().slice(0, 10),
    fetchedAt: Date.now()
  };
  repo.custom.push(company);
  persistCustom();
  emit('custom:add');
  return company;
}

/** Update a custom OR override a curated/API entry. */
export function updateCompany(id, patch) {
  const idx = repo.custom.findIndex(c => c.id === id);
  if (idx >= 0) {
    repo.custom[idx] = { ...repo.custom[idx], ...patch };
    persistCustom();
  } else {
    repo.overrides[id] = { ...(repo.overrides[id] ?? {}), ...patch };
    persistOverrides();
  }
  emit('update');
}

/** Remove a company (custom is hard-deleted; curated/api is soft-deleted). */
export function removeCompany(id) {
  const customIdx = repo.custom.findIndex(c => c.id === id);
  if (customIdx >= 0) {
    repo.custom.splice(customIdx, 1);
    persistCustom();
  } else {
    repo.deletedIds.add(id);
    persistDeleted();
  }
  emit('remove');
}

/** Restore a soft-deleted entry. */
export function restoreCompany(id) {
  if (repo.deletedIds.delete(id)) {
    persistDeleted();
    emit('restore');
  }
}

/** Wipe all user data (custom + overrides + deletions). Confirms via UI. */
export function resetUserData() {
  repo.custom = [];
  repo.deletedIds = new Set();
  repo.overrides = {};
  persistCustom();
  persistDeleted();
  persistOverrides();
  emit('reset');
}

/** Empty the loaded API dataset (start from a clean slate). Async — clears
 *  the IndexedDB cache too. Does NOT touch per-profile saved datasets. */
export async function clearApiCache() {
  repo.api = [];
  repo.lastFetch = null;
  try { await idbDelete(IDB_KEY_API); } catch (e) {}
  try { localStorage.removeItem(LS_KEY_API); } catch (e) {}
  emit('refresh:done');
}

// ============================================================
//  PERSISTENCE
// ============================================================

async function persistAPI() {
  try {
    await idbSet(IDB_KEY_API, {
      companies: repo.api,
      lastFetch: repo.lastFetch
    });
  } catch (e) {
    console.warn('persistAPI failed', e);
  }
}
function persistCustom()    { tryStore(LS_KEY_CUSTOM, repo.custom); }
function persistOverrides() { tryStore(LS_KEY_OVERRIDES, repo.overrides); }
function persistDeleted()   { tryStore(LS_KEY_DELETED, [...repo.deletedIds]); }

function tryStore(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch (e) { console.warn(`Persist ${key} failed`, e); }
}

// ============================================================
//  PER-PROFILE DATASET — save/load API results on the account
//  Large payload → IndexedDB. Small metadata (count + date) → localStorage,
//  so getSavedDatasetInfo() stays synchronous for the menu UI.
// ============================================================

function datasetMetaKey(profileId) {
  return `atlas.profile.${profileId}.dataset.meta.v1`;
}

/** Save the currently loaded API results onto the given profile so they can be
 *  restored at the next session without re-running a search.
 *  @returns {Promise<{ok:boolean, count:number, error?:string}>} */
export async function saveDatasetToProfile(profileId) {
  if (!profileId) return { ok: false, count: 0, error: 'Aucun profil actif' };
  try {
    const payload = {
      companies: repo.api,
      lastFetch: repo.lastFetch,
      savedAt: Date.now()
    };
    await idbSet(idbDatasetKey(profileId), payload);
    // Lightweight metadata for the menu (no big array)
    try {
      localStorage.setItem(datasetMetaKey(profileId), JSON.stringify({
        count: repo.api.length, savedAt: payload.savedAt
      }));
    } catch (e) { /* meta is best-effort */ }
    // Clean up any legacy localStorage dataset for this profile
    try { localStorage.removeItem(datasetKey(profileId)); } catch (e) {}
    return { ok: true, count: repo.api.length };
  } catch (e) {
    return { ok: false, count: repo.api.length,
      error: e?.message || 'Échec de la sauvegarde' };
  }
}

/** Load the dataset previously saved on a profile into the repo.
 *  @returns {Promise<{ok:boolean, count:number, savedAt:number|null}>} */
export async function loadDatasetFromProfile(profileId) {
  if (!profileId) return { ok: false, count: 0, savedAt: null };
  try {
    let parsed = await idbGet(idbDatasetKey(profileId));
    // Migration: fall back to a legacy localStorage dataset if present
    if (!parsed) {
      try {
        const raw = localStorage.getItem(datasetKey(profileId));
        if (raw) {
          parsed = JSON.parse(raw);
          await idbSet(idbDatasetKey(profileId), parsed);
          localStorage.removeItem(datasetKey(profileId));
        }
      } catch (e) { /* ignore */ }
    }
    if (parsed && Array.isArray(parsed.companies)) {
      repo.api = parsed.companies;
      repo.lastFetch = parsed.lastFetch ?? null;
      await persistAPI();
      emit('refresh:done');
      return { ok: true, count: repo.api.length, savedAt: parsed.savedAt ?? null };
    }
  } catch (e) {
    console.warn('loadDatasetFromProfile failed', e);
  }
  return { ok: false, count: 0, savedAt: null };
}

/** Metadata about a profile's saved dataset (synchronous, from localStorage).
 *  @returns {{exists:boolean, count:number, savedAt:number|null}} */
export function getSavedDatasetInfo(profileId) {
  if (!profileId) return { exists: false, count: 0, savedAt: null };
  try {
    const raw = localStorage.getItem(datasetMetaKey(profileId));
    if (raw) {
      const meta = JSON.parse(raw);
      const count = meta?.count ?? 0;
      return { exists: count > 0, count, savedAt: meta?.savedAt ?? null };
    }
    // Legacy fallback: old full dataset stored in localStorage
    const legacy = localStorage.getItem(datasetKey(profileId));
    if (legacy) {
      const parsed = JSON.parse(legacy);
      const count = Array.isArray(parsed?.companies) ? parsed.companies.length : 0;
      return { exists: count > 0, count, savedAt: parsed?.savedAt ?? null };
    }
  } catch (e) { /* ignore */ }
  return { exists: false, count: 0, savedAt: null };
}

/** Delete the saved dataset from a profile. */
export async function clearSavedDataset(profileId) {
  if (!profileId) return;
  try { await idbDelete(idbDatasetKey(profileId)); } catch (e) {}
  try { localStorage.removeItem(datasetMetaKey(profileId)); } catch (e) {}
  try { localStorage.removeItem(datasetKey(profileId)); } catch (e) {}
}

/** Fetch a profile's saved dataset object (for embedding in an export bundle).
 *  @returns {Promise<object|null>} */
export async function getProfileDatasetForExport(profileId) {
  if (!profileId) return null;
  try {
    const ds = await idbGet(idbDatasetKey(profileId));
    if (ds && Array.isArray(ds.companies)) return ds;
    // legacy fallback
    const raw = localStorage.getItem(datasetKey(profileId));
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
  return null;
}

/** Persist an imported dataset onto a profile (IndexedDB + light metadata). */
export async function restoreProfileDataset(profileId, dataset) {
  if (!profileId || !dataset || !Array.isArray(dataset.companies)) return false;
  try {
    await idbSet(idbDatasetKey(profileId), dataset);
    try {
      localStorage.setItem(datasetMetaKey(profileId), JSON.stringify({
        count: dataset.companies.length,
        savedAt: dataset.savedAt ?? Date.now()
      }));
    } catch (e) { /* meta best-effort */ }
    return true;
  } catch (e) {
    console.warn('restoreProfileDataset failed', e);
    return false;
  }
}
