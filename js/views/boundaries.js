/**
 * Geographic boundaries — fetches and displays region / department outlines
 * on the Leaflet map.
 *
 * Source: France GeoJSON published on github.com/gregoiredavid/france-geojson
 * (CC0 license, derived from IGN ADMIN-EXPRESS — official French boundaries).
 * Files are served via jsDelivr CDN.
 *
 * Strategy:
 *   - Lazy-load: fetch only the layers needed (regions or specific depts)
 *   - Cache in memory + localStorage for repeat sessions
 *   - Render only the boundaries matching the user's active filters
 */
import { sectorColor } from '../data/sectors.js';

const REGIONS_URL = 'https://cdn.jsdelivr.net/gh/gregoiredavid/france-geojson@v2.1.1/regions.geojson';
const DEPTS_URL   = 'https://cdn.jsdelivr.net/gh/gregoiredavid/france-geojson@v2.1.1/departements.geojson';

const LS_KEY_REGIONS = 'atlas.boundaries.regions.v1';
const LS_KEY_DEPTS   = 'atlas.boundaries.depts.v1';

let regionsData = null;
let deptsData = null;
let inFlight = { regions: null, depts: null };

/** Load regions GeoJSON (cached). */
async function loadRegions() {
  if (regionsData) return regionsData;
  if (inFlight.regions) return inFlight.regions;

  // Try localStorage first
  try {
    const cached = localStorage.getItem(LS_KEY_REGIONS);
    if (cached) {
      regionsData = JSON.parse(cached);
      return regionsData;
    }
  } catch (e) { /* corrupt cache, ignore */ }

  inFlight.regions = (async () => {
    const res = await fetch(REGIONS_URL);
    if (!res.ok) throw new Error(`Régions: HTTP ${res.status}`);
    const data = await res.json();
    regionsData = data;
    try { localStorage.setItem(LS_KEY_REGIONS, JSON.stringify(data)); }
    catch (e) { /* quota — fine, in-memory cache still works */ }
    inFlight.regions = null;
    return data;
  })();
  return inFlight.regions;
}

/** Load departments GeoJSON (cached). */
async function loadDepts() {
  if (deptsData) return deptsData;
  if (inFlight.depts) return inFlight.depts;

  try {
    const cached = localStorage.getItem(LS_KEY_DEPTS);
    if (cached) {
      deptsData = JSON.parse(cached);
      return deptsData;
    }
  } catch (e) { /* ignore */ }

  inFlight.depts = (async () => {
    const res = await fetch(DEPTS_URL);
    if (!res.ok) throw new Error(`Départements: HTTP ${res.status}`);
    const data = await res.json();
    deptsData = data;
    try { localStorage.setItem(LS_KEY_DEPTS, JSON.stringify(data)); }
    catch (e) { /* ignore */ }
    inFlight.depts = null;
    return data;
  })();
  return inFlight.depts;
}

/**
 * Renders the active region/dept boundaries on the given map.
 * Replaces any previously drawn boundaries.
 *
 * @param {L.Map} map
 * @param {L.LayerGroup} layerGroup    — dedicated group for SELECTED boundaries
 * @param {Set<string>} activeRegions  — INSEE region codes
 * @param {Set<string>} activeDepts    — INSEE dept codes
 * @param {object} [opts]
 * @param {boolean} [opts.fit]         — fit map bounds to drawn shapes
 */
export async function renderBoundaries(map, layerGroup, activeRegions, activeDepts, opts = {}) {
  layerGroup.clearLayers();

  const hasRegions = activeRegions.size > 0;
  const hasDepts = activeDepts.size > 0;
  if (!hasRegions && !hasDepts) return;

  let regionsGeo, deptsGeo;
  try {
    [regionsGeo, deptsGeo] = await Promise.all([
      hasRegions ? loadRegions() : Promise.resolve(null),
      hasDepts   ? loadDepts()   : Promise.resolve(null)
    ]);
  } catch (e) {
    console.warn('Boundaries load failed:', e.message);
    return;
  }

  const allBounds = [];

  // Region polygons (selected)
  if (regionsGeo) {
    regionsGeo.features.forEach(feat => {
      const code = feat.properties.code;
      if (!activeRegions.has(code)) return;
      const layer = L.geoJSON(feat, { style: regionStyle });
      layer.bindTooltip(feat.properties.nom, {
        sticky: true,
        className: 'boundary-tooltip',
        direction: 'center'
      });
      layer.addTo(layerGroup);
      allBounds.push(layer.getBounds());
    });
  }

  // Department polygons (selected)
  if (deptsGeo) {
    deptsGeo.features.forEach(feat => {
      const code = feat.properties.code;
      if (!activeDepts.has(code)) return;
      const layer = L.geoJSON(feat, { style: deptStyle });
      layer.bindTooltip(`${feat.properties.code} · ${feat.properties.nom}`, {
        sticky: true,
        className: 'boundary-tooltip',
        direction: 'center'
      });
      layer.addTo(layerGroup);
      allBounds.push(layer.getBounds());
    });
  }

  // Optionally fit bounds — only on explicit request, never on every filter
  // change (would feel jumpy)
  if (opts.fit && allBounds.length > 0) {
    const merged = allBounds.reduce((acc, b) => acc.extend(b), allBounds[0].clone());
    map.flyToBounds(merged, { padding: [40, 40], duration: 0.6, maxZoom: 11 });
  }
}

/**
 * Renders ALL region outlines as a faint, always-on reference layer so the
 * user can orient themselves on the map even before selecting anything.
 * Drawn once into a dedicated layer group; safe to call repeatedly.
 *
 * @param {L.LayerGroup} refLayer — dedicated group for the reference grid
 * @param {object} [opts]
 * @param {boolean} [opts.depts]  — also draw department outlines (denser)
 */
export async function renderReferenceGrid(refLayer, opts = {}) {
  refLayer.clearLayers();
  const pane = opts.pane || undefined;
  try {
    const regionsGeo = await loadRegions();
    if (regionsGeo) {
      L.geoJSON(regionsGeo, {
        style: regionRefStyle,
        interactive: false,           // pure visual reference, no clicks/tooltips
        pane
      }).addTo(refLayer);
    }
    if (opts.depts) {
      const deptsGeo = await loadDepts();
      if (deptsGeo) {
        L.geoJSON(deptsGeo, {
          style: deptRefStyle,
          interactive: false,
          pane
        }).addTo(refLayer);
      }
    }
  } catch (e) {
    console.warn('Reference grid load failed:', e.message);
  }
}

/** Faint style for the always-on region reference outlines. */
function regionRefStyle() {
  const line = readVar('--boundary-ref') || 'rgba(120,130,150,0.45)';
  return {
    color: line,
    weight: 1.1,
    opacity: 0.7,
    fill: false,
    dashArray: null
  };
}

/** Even fainter style for the always-on department reference outlines. */
function deptRefStyle() {
  const line = readVar('--boundary-ref-dept') || 'rgba(120,130,150,0.22)';
  return {
    color: line,
    weight: 0.6,
    opacity: 0.55,
    fill: false,
    dashArray: '2 3'
  };
}

/** Style for region polygons — bolder accent. */
function regionStyle() {
  const accent = readVar('--accent') || '#4FD1C5';
  return {
    color: accent,
    weight: 2.2,
    opacity: 0.85,
    fillColor: accent,
    fillOpacity: 0.07,
    dashArray: null
  };
}

/** Style for department polygons — finer, dashed. */
function deptStyle() {
  const accent2 = readVar('--accent-2') || '#FFB347';
  return {
    color: accent2,
    weight: 1.5,
    opacity: 0.85,
    fillColor: accent2,
    fillOpacity: 0.06,
    dashArray: '4 3'
  };
}

function readVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Pre-warm the cache (optional) — call when the app is idle. */
export function preloadBoundaries() {
  // Fire and forget, swallow errors
  loadRegions().catch(() => {});
  loadDepts().catch(() => {});
}
