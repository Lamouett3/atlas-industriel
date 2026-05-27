/**
 * Filtering & sorting — operates on the merged company list.
 *
 * Performance notes:
 *   - Single linear pass per filter call (O(N))
 *   - String coercion for the search haystack happens only when a query exists
 *   - DEPARTMENTS lookup for region→depts is computed once per call into a Set
 *   - sort() runs only after the filter pass on the smaller filtered array
 *
 * The bottleneck on large datasets (10k+) is rarely filtering itself — it's
 * the downstream rendering. That's handled in the views.
 */
import { getAllCompanies, subscribeRepo } from './data/repository.js';
import { DEPARTMENTS } from './data/geo.js';
import { state, notify } from './state.js';

/**
 * Normalize a department code to its canonical INSEE form.
 *   "9"  → "09"
 *   "2a" → "2A"
 *   undefined → ''
 * This matters because the API sometimes returns "1" instead of "01",
 * which would break a strict Set.has() lookup.
 */
function normalizeDept(code) {
  if (code == null) return '';
  let s = String(code).trim().toUpperCase();
  if (s === '') return '';
  // Corsica special cases
  if (s === '2A' || s === '2B') return s;
  // Pad single digit to 2
  if (/^\d$/.test(s)) return '0' + s;
  return s;
}

export function applyFilters(change = 'filter') {
  const all = getAllCompanies();
  const q = state.search.toLowerCase().trim();
  const hasQuery = q.length > 0;

  // Pre-compute geographic allow-set
  const geoFilterActive = state.activeRegions.size > 0 || state.activeDepts.size > 0;
  let allowedDepts = null;
  if (geoFilterActive) {
    allowedDepts = new Set(state.activeDepts);
    if (state.activeRegions.size > 0) {
      // Iterate DEPARTMENTS once, faster than nesting region.depts loops
      for (const code in DEPARTMENTS) {
        if (state.activeRegions.has(DEPARTMENTS[code].region)) {
          allowedDepts.add(code);
        }
      }
    }
  }

  // NAF filter (free text from the sidebar). Match by prefix, dots/spaces ignored.
  const nafQ = (state.nafQuery ?? '').replace(/[.\s]/g, '').toUpperCase();
  const hasNaf = nafQ.length > 0;

  const result = [];
  for (let i = 0; i < all.length; i++) {
    const c = all[i];
    if (state.activeSectors.size > 0 && !state.activeSectors.has(c.sector)) continue;
    if (state.activeSizes.size > 0 && !state.activeSizes.has(c.size ?? 'PME')) continue;
    if (allowedDepts) {
      // Normalize dept code so "9" matches "09" etc. (API sometimes strips leading zero)
      const dept = normalizeDept(c.dept);
      if (!dept || !allowedDepts.has(dept)) continue;
    }
    if (hasNaf) {
      // Compare the company NAF (stripped of dots) against the query prefix
      const cNaf = (c.naf ?? '').replace(/[.\s]/g, '').toUpperCase();
      if (!cNaf || !cNaf.startsWith(nafQ)) continue;
    }
    if (hasQuery) {
      // Include the NAF code both as-is ("26.60Z") and stripped ("2660z")
      // so the user can search either way.
      const nafRaw = (c.naf ?? '');
      const nafStripped = nafRaw.replace(/[.\s]/g, '');
      const hay = (
        (c.name ?? '') + ' ' +
        (c.sector ?? '') + ' ' +
        (c.city ?? '') + ' ' +
        (c.dept ?? '') + ' ' +
        (c.desc ?? '') + ' ' +
        (c.siren ?? '') + ' ' +
        nafRaw + ' ' +
        nafStripped
      ).toLowerCase();
      // Also strip the query of dots so "26.60" and "2660" both work
      const qStripped = q.replace(/[.\s]/g, '');
      if (!hay.includes(q) && !hay.includes(qStripped)) continue;
    }
    result.push(c);
  }

  result.sort(sorter(state.sortBy));

  state.filtered = result;
  notify(change);
}

function sorter(by) {
  switch (by) {
    case 'employees': return (a, b) => (b.employees ?? 0) - (a.employees ?? 0);
    case 'city':      return (a, b) => (a.city ?? '').localeCompare(b.city ?? '', 'fr');
    case 'name':
    default:          return (a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'fr');
  }
}

export function toggleSector(sector) {
  if (state.activeSectors.has(sector)) state.activeSectors.delete(sector);
  else state.activeSectors.add(sector);
  applyFilters('filter');
}

/** Select every sector at once, or clear them all.
 *  @param {string[]} allKeys — full list of sector keys
 *  @param {boolean} select   — true = select all, false = clear */
export function setAllSectors(allKeys, select) {
  state.activeSectors.clear();
  if (select) {
    for (const k of allKeys) state.activeSectors.add(k);
  }
  applyFilters('filter');
}

export function toggleSize(size) {
  if (state.activeSizes.has(size)) state.activeSizes.delete(size);
  else state.activeSizes.add(size);
  applyFilters('filter');
}

export function toggleRegion(regionCode) {
  if (state.activeRegions.has(regionCode)) state.activeRegions.delete(regionCode);
  else state.activeRegions.add(regionCode);
  applyFilters('filter');
}

export function toggleDept(deptCode) {
  if (state.activeDepts.has(deptCode)) state.activeDepts.delete(deptCode);
  else state.activeDepts.add(deptCode);
  applyFilters('filter');
}

export function setSearch(value) {
  state.search = value ?? '';
  applyFilters('search');
}

/** Set the sidebar free-text NAF filter. */
export function setNafQuery(value) {
  state.nafQuery = value ?? '';
  applyFilters('filter');
}

export function setSort(value) {
  state.sortBy = value;
  applyFilters('sort');
}

export function clearAll() {
  state.search = '';
  state.activeSectors.clear();
  state.activeSizes.clear();
  state.activeRegions.clear();
  state.activeDepts.clear();
  state.nafQuery = '';
  state.sortBy = 'name';
  applyFilters('clear');
}

export function setView(view) {
  state.view = view;
  notify('view');
}

export function setSelected(id) {
  state.selected = id;
  notify('selection');
}

// Re-apply filters when repository changes
subscribeRepo((change) => {
  applyFilters('repo:' + change);
});
