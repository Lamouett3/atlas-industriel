/**
 * List view — responsive grid of company cards.
 *
 * Performance & intent:
 *   1. Empty until the user expresses intent (filter/search/refresh) —
 *      mirrors the map and mind map for consistency.
 *   2. Chunked rendering with IntersectionObserver — render the first 60
 *      cards immediately; load 60 more when the sentinel becomes visible.
 *   3. Event delegation — one listener for all card clicks/pointermoves.
 */
import { state, subscribe } from '../state.js';
import { setSort } from '../filters.js';
import { sectorColor } from '../data/sectors.js';
import { showCompanyModal } from '../ui/modal.js';
import { onThemeChange } from '../ui/theme.js';
import { exportFilteredToExcel } from '../data/export.js';
import { showToast } from '../ui/toast.js';

const CHUNK_SIZE = 60;
const SENTINEL_MARGIN = '400px';

let listEl, toolbarEl, sortSelect;
let renderedCount = 0;
let sentinel = null;
let observer = null;
let hasUserIntent = false;

export function initList() {
  listEl = document.getElementById('list-grid');
  toolbarEl = document.getElementById('list-toolbar');
  sortSelect = document.getElementById('sort-select');

  sortSelect.addEventListener('change', () => setSort(sortSelect.value));

  const exportBtn = document.getElementById('export-xlsx');
  exportBtn?.addEventListener('click', () => {
    const res = exportFilteredToExcel();
    if (res.ok) {
      showToast(`✓ ${res.count} entreprise${res.count > 1 ? 's' : ''} exportée${res.count > 1 ? 's' : ''} vers Excel`, 'success');
    } else {
      showToast(res.error || 'Échec de l\'export', 'error');
    }
  });

  // Event delegation — one listener for all cards
  listEl.addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (!card?.dataset.id) return;
    showCompanyModal(card.dataset.id);
  });
  let pmRaf = 0;
  let pmEvent = null;
  listEl.addEventListener('pointermove', (e) => {
    pmEvent = e;
    if (pmRaf) return;
    pmRaf = requestAnimationFrame(() => {
      pmRaf = 0;
      const card = pmEvent.target.closest('.card');
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${pmEvent.clientX - r.left}px`);
      card.style.setProperty('--my', `${pmEvent.clientY - r.top}px`);
    });
  });

  subscribe((_, change) => {
    if (change === 'filter' || change === 'search' || change === 'sort') {
      hasUserIntent = true;
    } else if (change === 'clear') {
      hasUserIntent = false;
    }
    if (['filter', 'search', 'sort', 'clear', 'init'].includes(change) ||
        change?.startsWith?.('repo:')) {
      render();
    }
  });

  onThemeChange(() => render());

  render();
}

function shouldRender() {
  // Strict: must have an active filter or search to show entries
  if (state.search.trim().length > 0) return true;
  if (state.activeSectors.size > 0) return true;
  if (state.activeSizes.size > 0) return true;
  if (state.activeRegions.size > 0) return true;
  if (state.activeDepts.size > 0) return true;
  if ((state.nafQuery ?? "").trim().length > 0) return true;
  return false;
}

function render() {
  // Toolbar count
  const total = state.filtered.length;
  const countEl = toolbarEl.querySelector('.count');
  countEl.innerHTML = total === 0
    ? `<strong>0</strong> entreprise`
    : `<strong>${total.toLocaleString('fr-FR')}</strong> entreprise${total > 1 ? 's' : ''}`;

  // Enable export only when there is something to export
  const exportBtn = document.getElementById('export-xlsx');
  if (exportBtn) exportBtn.disabled = total === 0;

  if (observer) {
    observer.disconnect();
    observer = null;
  }

  // Welcome / empty state — same intent rule as map and mindmap
  if (!shouldRender()) {
    listEl.innerHTML = `
      <div class="empty" style="grid-column:1/-1">
        <div class="icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>
        </div>
        <h4>Liste vide</h4>
        <p>Sélectionnez un filtre, faites une recherche, ou cliquez <strong style="color:var(--accent)">🔍 Rechercher</strong>.</p>
      </div>
    `;
    return;
  }

  if (total === 0) {
    listEl.innerHTML = `
      <div class="empty" style="grid-column:1/-1">
        <div class="icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </div>
        <h4>Aucun résultat</h4>
        <p>Essayez d'autres mots-clés ou réinitialisez les filtres.</p>
      </div>
    `;
    return;
  }

  renderedCount = 0;
  listEl.innerHTML = '';
  appendChunk();

  if (renderedCount < total) {
    setupSentinel();
  }
}

/** Append the next CHUNK_SIZE cards. */
function appendChunk() {
  const total = state.filtered.length;
  const end = Math.min(renderedCount + CHUNK_SIZE, total);
  if (end <= renderedCount) return;

  const q = state.search.trim();
  // Per-render color memo
  const colorOf = memoizedColor();

  // Build all cards as a single string then insert once (1 reflow)
  const html = [];
  for (let i = renderedCount; i < end; i++) {
    const c = state.filtered[i];
    html.push(buildCard(c, colorOf(c.sector), q));
  }
  // Re-place sentinel at the end
  if (sentinel?.parentNode === listEl) listEl.removeChild(sentinel);
  listEl.insertAdjacentHTML('beforeend', html.join(''));
  renderedCount = end;
}

/** Set up the IntersectionObserver to auto-load more cards on scroll. */
function setupSentinel() {
  if (!sentinel) {
    sentinel = document.createElement('div');
    sentinel.className = 'list-sentinel';
    sentinel.innerHTML = '<span class="dots"></span>';
  }
  listEl.appendChild(sentinel);

  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      appendChunk();
      if (renderedCount >= state.filtered.length) {
        observer.disconnect();
        sentinel.remove();
      }
    }
  }, { rootMargin: SENTINEL_MARGIN });

  observer.observe(sentinel);
}

function memoizedColor() {
  const cache = new Map();
  return (sector) => {
    let c = cache.get(sector);
    if (c == null) {
      c = sectorColor(sector);
      cache.set(sector, c);
    }
    return c;
  };
}

function buildCard(c, color, q) {
  const idShort = typeof c.id === 'string' ? c.id.slice(0, 9) : String(c.id).padStart(3, '0');
  return `
    <article class="card" style="--card-color:${color}" data-id="${escapeAttr(c.id)}">
      <div class="top">
        <h4>${highlight(c.name, q)}</h4>
        <span class="id">${idShort}</span>
      </div>
      <span class="sector-tag" style="--card-color:${color}">${c.sector}</span>
      <div class="city">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        ${highlight(c.city, q)}, ${c.dept}
      </div>
      <p class="desc">${highlight(c.desc, q)}</p>
      <div class="footer">
        <span class="emp">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
          ${c.employees ? c.employees.toLocaleString('fr-FR') : '—'}
        </span>
        <span>Voir →</span>
      </div>
    </article>
  `;
}

function highlight(text, query) {
  const safe = escapeHtml(text);
  if (!query) return safe;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  return safe.replace(regex, '<mark class="hl">$1</mark>');
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
function escapeAttr(s) {
  return escapeHtml(s).replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
