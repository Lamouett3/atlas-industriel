/**
 * CRM — favorites, status tags, contacts, notes — scoped to the active profile.
 *
 * Storage: localStorage key `atlas.profile.<profileId>.crm`, structured as:
 *   {
 *     entries: {
 *       [companyId]: {
 *         favorite: boolean,
 *         status:   'none'|'client'|'prospect'|'contacted'|'refused',
 *         notes:    string,
 *         contacts: [{id, name, role, email, phone, note}],
 *         updatedAt: number
 *       }
 *     }
 *   }
 *
 * "companyId" is whatever the company.id is — SIREN for API entries, integer
 * for curated, custom_xxx for user-created. Stable enough for our needs.
 */
import { getActiveProfileId, subscribeProfiles } from './profile.js';

const listeners = new Set();

let cache = null;
let cacheProfileId = null;

/** Status definitions — the source of truth for status colors and labels. */
export const STATUSES = {
  none:       { label: 'Aucun statut',     color: '#94A3B8', short: '—' },
  prospect:   { label: 'Prospect',         color: '#FFD23F', short: 'P' },
  contacted:  { label: 'Contact établi',   color: '#7AAFFF', short: '✉' },
  client:     { label: 'Client actif',     color: '#6EE7B7', short: '✓' },
  refused:    { label: 'Refus',            color: '#FF7B6B', short: '✕' }
};

export const STATUS_KEYS = ['none', 'prospect', 'contacted', 'client', 'refused'];

// ============================================================
//  Init
// ============================================================

export function initCRM() {
  loadCache();
  // When the active profile changes, reload the cache
  subscribeProfiles((change) => {
    if (change === 'switch' || change === 'signOut' || change === 'delete') {
      loadCache();
      emit('reload');
    }
  });
}

function loadCache() {
  cacheProfileId = getActiveProfileId();
  if (!cacheProfileId) {
    cache = { entries: {} };
    return;
  }
  try {
    const raw = localStorage.getItem(`atlas.profile.${cacheProfileId}.crm`);
    cache = raw ? JSON.parse(raw) : { entries: {} };
    if (!cache.entries) cache.entries = {};
  } catch (e) {
    console.warn('CRM load failed:', e);
    cache = { entries: {} };
  }
}

function persist() {
  if (!cacheProfileId) return;
  try {
    localStorage.setItem(
      `atlas.profile.${cacheProfileId}.crm`,
      JSON.stringify(cache)
    );
  } catch (e) {
    console.warn('CRM persist failed:', e);
  }
}

function emit(change) { listeners.forEach(fn => fn(change)); }

export function subscribeCRM(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ============================================================
//  Lookups
// ============================================================

/** Returns the entry for a company (always returns a defaulted object). */
export function getEntry(companyId) {
  const id = String(companyId);
  return cache?.entries[id] ?? defaultEntry();
}

function defaultEntry() {
  return {
    favorite: false,
    status: 'none',
    notes: '',
    contacts: [],
    updatedAt: 0
  };
}

/** Get all favorited company ids. */
export function getFavoriteIds() {
  if (!cache) return [];
  return Object.entries(cache.entries)
    .filter(([, e]) => e.favorite)
    .map(([id]) => id);
}

/** Get all entries with any non-default content (favorited, tagged, noted, contacted). */
export function getAllTrackedIds() {
  if (!cache) return [];
  return Object.entries(cache.entries)
    .filter(([, e]) => isTracked(e))
    .map(([id]) => id);
}

function isTracked(e) {
  if (!e) return false;
  if (e.favorite) return true;
  if (e.status && e.status !== 'none') return true;
  if (e.notes && e.notes.trim().length) return true;
  if (e.contacts && e.contacts.length) return true;
  return false;
}

/** Aggregate counts for the dashboard (by status, total favorites, etc). */
export function getStats() {
  const stats = {
    favorites: 0,
    byStatus: { none: 0, prospect: 0, contacted: 0, client: 0, refused: 0 },
    withNotes: 0,
    withContacts: 0,
    tracked: 0
  };
  if (!cache) return stats;
  for (const e of Object.values(cache.entries)) {
    if (e.favorite) stats.favorites++;
    if (e.status && stats.byStatus[e.status] != null) stats.byStatus[e.status]++;
    if (e.notes?.trim().length) stats.withNotes++;
    if (e.contacts?.length) stats.withContacts++;
    if (isTracked(e)) stats.tracked++;
  }
  return stats;
}

// ============================================================
//  Mutations — favorites & status
// ============================================================

/** Make sure an entry exists for companyId; returns the mutable entry. */
function getOrCreate(companyId) {
  const id = String(companyId);
  if (!cache.entries[id]) cache.entries[id] = defaultEntry();
  return cache.entries[id];
}

export function toggleFavorite(companyId) {
  if (!cacheProfileId) throw new Error('Aucun profil actif');
  const e = getOrCreate(companyId);
  e.favorite = !e.favorite;
  e.updatedAt = Date.now();
  persist();
  emit('favorite');
  return e.favorite;
}

export function setStatus(companyId, status) {
  if (!cacheProfileId) throw new Error('Aucun profil actif');
  if (!STATUSES[status]) throw new Error('Statut inconnu');
  const e = getOrCreate(companyId);
  e.status = status;
  e.updatedAt = Date.now();
  persist();
  emit('status');
  return e.status;
}

export function setNotes(companyId, notes) {
  if (!cacheProfileId) throw new Error('Aucun profil actif');
  const e = getOrCreate(companyId);
  e.notes = String(notes ?? '');
  e.updatedAt = Date.now();
  persist();
  emit('notes');
  return e.notes;
}

// ============================================================
//  Mutations — contacts
// ============================================================

/** Append a contact to the entry. Returns the new contact. */
export function addContact(companyId, contact) {
  if (!cacheProfileId) throw new Error('Aucun profil actif');
  const e = getOrCreate(companyId);
  const newContact = {
    id: 'ct_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    name:  (contact.name ?? '').trim(),
    role:  (contact.role ?? '').trim(),
    email: (contact.email ?? '').trim(),
    phone: (contact.phone ?? '').trim(),
    note:  (contact.note ?? '').trim()
  };
  e.contacts.push(newContact);
  e.updatedAt = Date.now();
  persist();
  emit('contact');
  return newContact;
}

export function updateContact(companyId, contactId, patch) {
  if (!cacheProfileId) throw new Error('Aucun profil actif');
  const e = getOrCreate(companyId);
  const idx = e.contacts.findIndex(c => c.id === contactId);
  if (idx < 0) return;
  e.contacts[idx] = { ...e.contacts[idx], ...patch };
  e.updatedAt = Date.now();
  persist();
  emit('contact');
}

export function removeContact(companyId, contactId) {
  if (!cacheProfileId) throw new Error('Aucun profil actif');
  const e = getOrCreate(companyId);
  e.contacts = e.contacts.filter(c => c.id !== contactId);
  e.updatedAt = Date.now();
  persist();
  emit('contact');
}

// ============================================================
//  Bulk reset
// ============================================================

export function clearAll() {
  if (!cacheProfileId) return;
  cache = { entries: {} };
  persist();
  emit('reset');
}
