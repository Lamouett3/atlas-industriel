/**
 * Application state — single observable store.
 */
import { getAllCompanies } from './data/repository.js';

const listeners = new Set();

export const state = {
  view: 'map',
  search: '',
  activeSectors: new Set(),
  activeSizes: new Set(),
  activeRegions: new Set(),     // INSEE region codes
  activeDepts: new Set(),       // INSEE dept codes
  nafQuery: '',                 // free-text NAF code filter (sidebar)
  sortBy: 'name',
  filtered: getAllCompanies(),
  selected: null
};

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notify(change = 'unknown') {
  listeners.forEach(fn => fn(state, change));
}
