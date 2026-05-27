/**
 * Sidebar — live stats + region/dept filter + size filter + sector filter +
 * add-company button.
 *
 * Counts everywhere are computed against the full merged repository (curated
 * + API + custom), so the user sees how their selections narrow things down.
 */
import { getAllCompanies } from '../data/repository.js';
import { SECTORS, sectorColor } from '../data/sectors.js';
import { DEPARTMENTS, REGIONS, regionsList, deptsList } from '../data/geo.js';
import { state, subscribe } from '../state.js';
import { toggleSector, toggleSize, toggleRegion, toggleDept, clearAll, setAllSectors, setNafQuery } from '../filters.js';
import { onThemeChange } from './theme.js';
import { showEditModal } from './editModal.js';

const SIZES = [
  { key: 'TPE', label: 'TPE', hint: '<10' },
  { key: 'PME', label: 'PME', hint: '10–249' },
  { key: 'ETI', label: 'ETI', hint: '250–4999' },
  { key: 'GE',  label: 'GE',  hint: '5000+' }
];

let filtersEl, sizesEl, regionsEl, deptsEl, clearBtn, addBtn, nafFilterEl;

export function initSidebar() {
  filtersEl = document.getElementById('filters');
  sizesEl   = document.getElementById('sizes');
  regionsEl = document.getElementById('regions');
  deptsEl   = document.getElementById('depts');
  clearBtn  = document.getElementById('clear-filters');
  addBtn    = document.getElementById('add-company');
  nafFilterEl = document.getElementById('naf-filter');

  clearBtn.addEventListener('click', () => {
    clearAll();
    document.getElementById('search').value = '';
    if (nafFilterEl) nafFilterEl.value = '';
  });

  addBtn?.addEventListener('click', () => showEditModal(null));

  // Free-text NAF filter (debounced so typing stays smooth)
  if (nafFilterEl) {
    const clearNafBtn = document.getElementById('naf-filter-clear');
    let nafTimer = null;
    const applyNaf = () => {
      const v = nafFilterEl.value;
      nafFilterEl.parentElement?.classList.toggle('has-value', v.trim().length > 0);
      setNafQuery(v);
    };
    nafFilterEl.addEventListener('input', () => {
      clearTimeout(nafTimer);
      nafTimer = setTimeout(applyNaf, 250);
    });
    clearNafBtn?.addEventListener('click', () => {
      nafFilterEl.value = '';
      applyNaf();
      nafFilterEl.focus();
    });
  }

  renderSizes();
  renderFilters();
  renderRegions();
  renderDepts();
  updateStats();

  subscribe((_, change) => {
    if (change.startsWith?.('repo:') || change === 'init') {
      invalidateCounts();           // ⚡ refresh derived counts only when repo mutates
      renderFilters();
      renderSizes();
      renderRegions();
      renderDepts();
    }
    if (['filter', 'search', 'sort', 'clear', 'init'].includes(change) ||
        change.startsWith?.('repo:')) {
      updateStats();
      updateAllStates();
      // Re-render the sectors list so the "Tous les secteurs" master button
      // reflects the current selection (label + active state).
      if (change === 'filter' || change === 'clear') renderFilters();
    }
  });

  onThemeChange(() => refreshSwatches());
}

// ====== Cached counts — recomputed only when repo changes ======
let cachedAll = null;
let cachedCounts = null;

function ensureCounts() {
  const all = getAllCompanies();
  if (cachedAll === all && cachedCounts) return cachedCounts;

  const counts = {
    sectors: {},
    sizes: {},
    regions: {},
    depts: {}
  };
  for (let i = 0; i < all.length; i++) {
    const c = all[i];
    counts.sectors[c.sector] = (counts.sectors[c.sector] || 0) + 1;
    const s = c.size ?? 'PME';
    counts.sizes[s] = (counts.sizes[s] || 0) + 1;
    const dept = DEPARTMENTS[c.dept];
    if (dept) counts.regions[dept.region] = (counts.regions[dept.region] || 0) + 1;
    counts.depts[c.dept] = (counts.depts[c.dept] || 0) + 1;
  }
  cachedAll = all;
  cachedCounts = counts;
  return counts;
}

function invalidateCounts() {
  cachedAll = null;
  cachedCounts = null;
}

// ====== SECTORS ======
function renderFilters() {
  const counts = ensureCounts().sectors;
  const allKeys = Object.keys(SECTORS);
  const total = state.activeSectors.size;
  const allSelected = total === allKeys.length && total > 0;

  // "Tous les secteurs" master toggle at the top of the list
  const masterBtn = `
    <button class="filter-item filter-all ${allSelected ? 'active' : ''}" data-sector-all type="button">
      <span class="swatch swatch-all"></span>
      <span class="name">${allSelected ? 'Tout désélectionner' : 'Tous les secteurs'}</span>
      <span class="count">${allKeys.length}</span>
    </button>`;

  const items = Object.entries(SECTORS)
    .sort(([, a], [, b]) => a.label.localeCompare(b.label, 'fr'))
    .map(([key, info]) => `
      <button class="filter-item ${state.activeSectors.has(key) ? 'active' : ''}" data-sector="${key}" type="button">
        <span class="swatch" style="background:${sectorColor(key)}"></span>
        <span class="name">${info.label}</span>
        <span class="count">${counts[key] || 0}</span>
      </button>
    `).join('');

  filtersEl.innerHTML = masterBtn + items;

  // Master toggle
  filtersEl.querySelector('[data-sector-all]')?.addEventListener('click', () => {
    setAllSectors(allKeys, !allSelected);
  });

  // Individual sectors
  filtersEl.querySelectorAll('.filter-item[data-sector]').forEach(btn => {
    btn.addEventListener('click', () => toggleSector(btn.dataset.sector));
  });
}

// ====== SIZES ======
function renderSizes() {
  if (!sizesEl) return;
  const counts = ensureCounts().sizes;

  sizesEl.innerHTML = SIZES.map(s => `
    <button class="size-chip" data-size="${s.key}" type="button" title="${s.hint} salariés">
      <span class="size-key">${s.label}</span>
      <span class="size-count">${counts[s.key] || 0}</span>
    </button>
  `).join('');

  sizesEl.querySelectorAll('.size-chip').forEach(btn => {
    btn.addEventListener('click', () => toggleSize(btn.dataset.size));
  });
}

// ====== REGIONS ======
function renderRegions() {
  if (!regionsEl) return;
  const counts = ensureCounts().regions;

  // Show ALL regions (not just those with data) so the user can always select
  // a region — counts will read 0 if no companies are loaded for it.
  const all = regionsList();

  regionsEl.innerHTML = all.map(r => {
    const count = counts[r.code] || 0;
    return `
      <button class="filter-item compact ${count === 0 ? 'is-zero' : ''}" data-region="${r.code}" type="button">
        <span class="name">${r.name}</span>
        <span class="count">${count}</span>
      </button>
    `;
  }).join('');

  regionsEl.querySelectorAll('[data-region]').forEach(btn => {
    btn.addEventListener('click', () => toggleRegion(btn.dataset.region));
  });
}

// ====== DEPARTMENTS ======
function renderDepts() {
  if (!deptsEl) return;
  const counts = ensureCounts().depts;

  // Show ALL departments of France (sorted by code), even those with 0 entries
  const all = deptsList();   // sorted by code

  deptsEl.innerHTML = all.map(d => {
    const count = counts[d.code] || 0;
    return `
      <button class="dept-pill ${count === 0 ? 'is-zero' : ''}" data-dept="${d.code}" type="button" title="${escapeHtml(d.name)}">
        <span class="dept-code">${d.code}</span>
        <span class="dept-name">${escapeHtml(d.name)}</span>
        <span class="dept-count">${count}</span>
      </button>
    `;
  }).join('');

  deptsEl.querySelectorAll('[data-dept]').forEach(btn => {
    btn.addEventListener('click', () => toggleDept(btn.dataset.dept));
  });
}

// ====== STATE SYNC ======
function updateAllStates() {
  filtersEl?.querySelectorAll('.filter-item[data-sector]').forEach(btn => {
    btn.classList.toggle('active', state.activeSectors.has(btn.dataset.sector));
  });
  sizesEl?.querySelectorAll('.size-chip').forEach(btn => {
    btn.classList.toggle('active', state.activeSizes.has(btn.dataset.size));
  });
  regionsEl?.querySelectorAll('[data-region]').forEach(btn => {
    btn.classList.toggle('active', state.activeRegions.has(btn.dataset.region));
  });
  deptsEl?.querySelectorAll('[data-dept]').forEach(btn => {
    btn.classList.toggle('active', state.activeDepts.has(btn.dataset.dept));
  });
}

function refreshSwatches() {
  filtersEl?.querySelectorAll('.filter-item').forEach(btn => {
    const sw = btn.querySelector('.swatch');
    if (sw && btn.dataset.sector) sw.style.background = sectorColor(btn.dataset.sector);
  });
}

function updateStats() {
  const f = state.filtered;
  const sectors = new Set(f.map(c => c.sector));
  const cities = new Set(f.map(c => c.city).filter(Boolean));
  const totalEmp = f.reduce((s, c) => s + (c.employees || 0), 0);

  setText('stat-total', f.length);
  setText('stat-sectors', sectors.size);
  setText('stat-cities', cities.size);
  setText('stat-emp', (totalEmp / 1000).toFixed(1));

  const mapBtn = document.querySelector('[data-view-btn="map"] .num');
  if (mapBtn) mapBtn.textContent = f.length;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = String(s ?? '');
  return d.innerHTML;
}
