/**
 * Map view — Leaflet with French IGN tiles, theme-aware, with optional
 * marker clustering for performance on large datasets.
 *
 * Render policy:
 *   - The map starts EMPTY (no markers) on first load.
 *   - Markers are drawn only when the user expresses an intent:
 *       • a search query is typed
 *       • at least one sector / size / region / dept filter is active
 *       • a refresh has just completed
 *   - This avoids dumping 50,000 pins on the map by default,
 *     which would freeze the browser.
 */
import { state, subscribe } from '../state.js';
import { sectorColor } from '../data/sectors.js';
import { showCompanyModal } from '../ui/modal.js';
import { onThemeChange, getTheme } from '../ui/theme.js';
import { renderBoundaries, renderReferenceGrid, preloadBoundaries } from './boundaries.js';
import { getLastFetch } from '../data/repository.js';

let map;
let baseTileLayer, labelTileLayer;
let markersLayer;
let boundariesLayer;
let referenceLayer;
let usingClusters = false;
let hasUserIntent = false;            // true once the user filters/searches/refreshes
let prevGeoSignature = '';            // serialized regions+depts to detect changes
const markersById = new Map();

/** Above this count, switch to MarkerCluster for performance & readability. */
const CLUSTER_THRESHOLD = 500;
/** Hard cap to protect the browser even when the user wants to "see everything". */
const RENDER_HARD_CAP = 5000;

const TILES = {
  // CartoDB Voyager — vibrant, colorful, Google-Maps-like aesthetic, French labels in France.
  // Free for non-commercial use; based on OpenStreetMap data.
  // Subdomains a/b/c/d are load-balanced.
  dark: {
    base:   'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png',
    labels: null,
    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> · © <a href="https://carto.com/attributions" target="_blank">CARTO</a>',
    invert: false,
    subdomains: 'abcd'
  },
  light: {
    base:   'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    labels: null,
    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> · © <a href="https://carto.com/attributions" target="_blank">CARTO</a>',
    invert: false,
    subdomains: 'abcd'
  }
};

export function initMap() {
  map = L.map('map', {
    center: [46.5, 2.5],          // center of France
    zoom: 6,
    zoomControl: true,
    minZoom: 5,
    maxZoom: 19,
    preferCanvas: true,
    zoomAnimation: true,
    fadeAnimation: true
  });

  applyTileLayers(getTheme());

  // Reference grid pane — below the selected-boundaries pane, above tiles
  map.createPane('refgrid');
  map.getPane('refgrid').style.zIndex = 405;
  referenceLayer = L.layerGroup([], { pane: 'refgrid' }).addTo(map);

  // Boundaries pane goes below markers but above tiles
  map.createPane('boundaries');
  map.getPane('boundaries').style.zIndex = 410;
  boundariesLayer = L.layerGroup().addTo(map);

  // Draw the always-on reference outlines (all regions) so the user can orient
  // themselves immediately. Departments are added too for finer reference.
  renderReferenceGrid(referenceLayer, { depts: true, pane: 'refgrid' });

  // Don't initialize markers layer yet — empty map by default
  updateMarkersLayer(0);

  // If the user already had a refresh in a previous session, treat that as intent
  if (getLastFetch()) hasUserIntent = false; // still requires explicit interaction this session

  subscribe((_, change) => {
    // Promote 'intent' only on actual filter/search actions.
    // A refresh alone does NOT show pins — user must explicitly filter first,
    // to avoid dumping thousands of pins across France by default.
    if (change === 'filter' || change === 'search' || change === 'sort') {
      hasUserIntent = true;
    } else if (change === 'clear') {
      hasUserIntent = false; // back to empty
    }

    if (['filter', 'search', 'sort', 'clear'].includes(change) ||
        change === 'init' || change?.startsWith?.('repo:')) {
      renderMarkers();
      // Decide whether to fit-to-bounds: only when geo selection *grew*
      const sig = geoSignature();
      const grew = signatureGrew(prevGeoSignature, sig);
      const cleared = isGeoEmpty(sig) && !isGeoEmpty(prevGeoSignature);
      renderActiveBoundaries({ fit: grew });
      if (cleared) {
        // User unchecked the last region/dept → return to a wide France view
        map.flyTo([46.5, 2.5], 6, { duration: 0.6 });
      }
      prevGeoSignature = sig;
    } else if (change === 'view' && state.view === 'map') {
      setTimeout(() => map.invalidateSize(), 50);
    } else if (change === 'selection' && state.selected != null) {
      focusCompany(state.selected);
    }
  });

  onThemeChange(theme => {
    applyTileLayers(theme);
    renderMarkers();
    renderActiveBoundaries();
    if (referenceLayer) renderReferenceGrid(referenceLayer, { depts: true, pane: 'refgrid' });
  });

  // Initial paint — empty state
  renderMarkers();
  renderActiveBoundaries();
  showInitialOverlay();

  // Prefetch boundaries when the browser is idle
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => preloadBoundaries(), { timeout: 4000 });
  }
}

/** Returns true if the current state warrants drawing markers.
 *  Strict policy: must have at least one filter active. A bare "refresh just
 *  happened" no longer triggers a full-France render. */
function shouldRenderMarkers() {
  if (state.search.trim().length > 0) return true;
  if (state.activeSectors.size > 0) return true;
  if (state.activeSizes.size > 0) return true;
  if (state.activeRegions.size > 0) return true;
  if (state.activeDepts.size > 0) return true;
  if ((state.nafQuery ?? "").trim().length > 0) return true;
  return false;
}

/** Show / hide the welcome overlay over the map. */
function showInitialOverlay() {
  toggleOverlay(true);
}
function hideInitialOverlay() {
  toggleOverlay(false);
}
function toggleOverlay(show) {
  let overlay = document.getElementById('map-overlay');
  if (!overlay && show) {
    overlay = document.createElement('div');
    overlay.id = 'map-overlay';
    overlay.className = 'map-overlay';
    overlay.innerHTML = `
      <div class="map-overlay-card">
        <div class="map-overlay-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.553 2.776A1 1 0 0021 18.882V8.118a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/>
          </svg>
        </div>
        <h3>Sélectionnez une zone</h3>
        <p>Choisissez une <strong>région</strong> ou un <strong>département</strong> dans la colonne de gauche pour afficher les entreprises de cette zone. Vous pouvez aussi utiliser la recherche ou les filtres de secteur / taille.</p>
        <p class="map-overlay-sub">Pensez à cliquer <strong>🔍 Rechercher</strong> d'abord si aucune donnée n'est encore chargée.</p>
        <div class="map-overlay-tips">
          <span><kbd>R</kbd> Rechercher</span>
          <span><kbd>/</kbd> Recherche</span>
        </div>
      </div>
    `;
    document.querySelector('.view[data-view="map"]')?.appendChild(overlay);
  }
  if (overlay) overlay.classList.toggle('visible', show);
}

function applyTileLayers(theme) {
  const t = TILES[theme] ?? TILES.dark;
  if (baseTileLayer) map.removeLayer(baseTileLayer);
  if (labelTileLayer) map.removeLayer(labelTileLayer);

  const tileOpts = {
    attribution: t.attribution,
    maxZoom: 19,
    keepBuffer: 4
  };
  if (t.subdomains) tileOpts.subdomains = t.subdomains;

  baseTileLayer = L.tileLayer(t.base, tileOpts).addTo(map);

  if (t.labels) {
    const labelOpts = { pane: 'overlayPane', maxZoom: 19 };
    if (t.subdomains) labelOpts.subdomains = t.subdomains;
    labelTileLayer = L.tileLayer(t.labels, labelOpts).addTo(map);
  } else {
    labelTileLayer = null;
  }

  const mapEl = document.getElementById('map');
  if (mapEl) mapEl.classList.toggle('invert-tiles', !!t.invert);
}

/**
 * Switches between simple LayerGroup and MarkerClusterGroup based on the
 * current dataset size. Only rebuilds the layer if the mode actually changes.
 */
function updateMarkersLayer(count) {
  const wantClusters =
    count >= CLUSTER_THRESHOLD &&
    typeof L.markerClusterGroup === 'function';

  if (markersLayer && wantClusters === usingClusters) return;

  if (markersLayer) map.removeLayer(markersLayer);

  if (wantClusters) {
    markersLayer = L.markerClusterGroup({
      chunkedLoading: true,                    // ⚡ batch insertion in chunks
      chunkInterval: 80,
      chunkDelay: 16,
      removeOutsideVisibleBounds: true,        // ⚡ DOM only for visible pins
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      maxClusterRadius: 60,
      iconCreateFunction: createClusterIcon
    });
  } else {
    markersLayer = L.layerGroup();
  }

  markersLayer.addTo(map);
  usingClusters = wantClusters;
}

function createClusterIcon(cluster) {
  const count = cluster.getChildCount();
  let size = 'small';
  if (count >= 100) size = 'large';
  else if (count >= 25) size = 'medium';
  return L.divIcon({
    html: `<div class="cluster-icon cluster-${size}"><span>${count}</span></div>`,
    className: '',
    iconSize: L.point(40, 40)
  });
}

/**
 * Render markers from state.filtered.
 *  - Skips entirely when there's no user intent (welcome overlay shown)
 *  - Caps at RENDER_HARD_CAP to protect the browser
 *  - Per-render sectorColor() memoization
 */
function renderMarkers() {
  if (!map) return;

  // Empty state — no intent, show overlay, no markers
  if (!shouldRenderMarkers()) {
    if (markersLayer) markersLayer.clearLayers();
    markersById.clear();
    showInitialOverlay();
    updateCapBanner(0, 0);
    return;
  }
  hideInitialOverlay();

  // Apply hard cap — keep cap-banner visible if reached
  const total = state.filtered.length;
  const capped = total > RENDER_HARD_CAP;
  const toRender = capped ? state.filtered.slice(0, RENDER_HARD_CAP) : state.filtered;

  updateMarkersLayer(toRender.length);
  markersLayer.clearLayers();
  markersById.clear();

  const colorCache = new Map();
  const memoColor = (sector) => {
    let c = colorCache.get(sector);
    if (c == null) {
      c = sectorColor(sector);
      colorCache.set(sector, c);
    }
    return c;
  };

  const newMarkers = [];
  for (const c of toRender) {
    const color = memoColor(c.sector);
    const icon = L.divIcon({
      className: '',
      html: `<div class="pin" style="--pin-color:${color}"><span class="ping"></span><span class="dot"></span></div>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
      popupAnchor: [0, -10]
    });
    const marker = L.marker([c.lat, c.lng], { icon, riseOnHover: true });
    marker.bindPopup(buildPopupHtml(c, color), { className: 'popup-wrap', maxWidth: 280 });
    marker.on('popupopen', () => {
      const moreBtn = document.querySelector('.popup .more');
      if (moreBtn) {
        moreBtn.addEventListener('click', () => {
          map.closePopup();
          showCompanyModal(c.id);
        });
      }
    });
    newMarkers.push(marker);
    markersById.set(c.id, marker);
  }

  if (usingClusters && typeof markersLayer.addLayers === 'function') {
    markersLayer.addLayers(newMarkers);
  } else {
    newMarkers.forEach(m => markersLayer.addLayer(m));
  }

  updateCapBanner(toRender.length, total);
}

/** Show a small banner when the hard cap is hit, suggesting the user filter further. */
function updateCapBanner(shown, total) {
  let banner = document.getElementById('map-cap-banner');
  const capped = total > shown && total > 0;

  if (capped) {
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'map-cap-banner';
      banner.className = 'map-cap-banner';
      document.querySelector('.view[data-view="map"]')?.appendChild(banner);
    }
    banner.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
      <span><strong>${shown.toLocaleString('fr-FR')}</strong> affichés sur <strong>${total.toLocaleString('fr-FR')}</strong> · Affinez vos filtres pour tout voir</span>
    `;
  } else if (banner) {
    banner.remove();
  }
}

/** Render region/dept polygons matching the active filters. */
function renderActiveBoundaries(opts = {}) {
  if (!map || !boundariesLayer) return;
  renderBoundaries(map, boundariesLayer, state.activeRegions, state.activeDepts, opts);
}

/** A stable string representing the current geographic selection. */
function geoSignature() {
  const r = [...state.activeRegions].sort().join(',');
  const d = [...state.activeDepts].sort().join(',');
  return `r:${r}|d:${d}`;
}

/** True if the new signature added items vs the previous one (selection grew). */
function signatureGrew(prev, next) {
  if (!next || next === 'r:|d:') return false;          // nothing selected
  if (prev === next) return false;                       // no change
  if (!prev || prev === 'r:|d:') return true;            // first selection
  // Count items
  const count = sig => sig.replace(/r:|d:|\|/g, '').split(',').filter(Boolean).length;
  return count(next) > count(prev);
}

/** True if the geo selection is empty. */
function isGeoEmpty(sig) {
  return !sig || sig === 'r:|d:';
}

/** Pan + zoom to a specific company and open its popup. */
export function focusCompany(id) {
  const marker = markersById.get(id);
  if (!marker) return;
  const latlng = marker.getLatLng();
  map.flyTo(latlng, Math.max(map.getZoom(), 11), { duration: 0.8 });
  setTimeout(() => marker.openPopup(), 600);
}

function buildPopupHtml(c, color) {
  return `
    <div class="popup">
      <span class="sector-mini" style="background:${color}">${c.sector}</span>
      <h4>${escapeHtml(c.name)}</h4>
      <div class="meta">${escapeHtml(c.city)} · Dept. ${c.dept}</div>
      <div class="desc">${escapeHtml(truncate(c.desc, 130))}</div>
      <button class="more">Voir la fiche →</button>
    </div>
  `;
}

function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
