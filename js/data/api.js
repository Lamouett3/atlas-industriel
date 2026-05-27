/**
 * API client — recherche-entreprises.api.gouv.fr
 *
 * Public, free, no auth. CORS-friendly. Maintained by DINUM.
 * Sources: SIRENE (INSEE) + RNE (INPI), updated daily.
 *
 * Architecture for "no limit" deep fetching:
 *   - Each fetch is parameterized by a list of departments
 *   - For each department, we paginate through results
 *   - The API caps a single query at 10,000 results — we go deeper by
 *     segmenting the search by NAF division (10..33) when needed
 *   - Hard ceiling per dept is now configurable (default: unlimited until empty)
 */
import {
  nafToSector,
  INDUSTRY_SECTION,
  EFFECTIF_TRANCHES_PME_PLUS,
  trancheToSize,
  trancheToApproxEmployees
} from './naf.js';

const BASE_URL = 'https://recherche-entreprises.api.gouv.fr/search';
const PAGE_SIZE = 25;            // max enforced by the API
const HARD_PAGE_LIMIT = 400;     // safety: 400 pages × 25 = 10,000 — API ceiling
const PAUSE_MS = 150;            // ~6.6 req/s — stays under the API's 7 req/s limit

/** Manufacturing NAF divisions — used for segmenting deep queries. */
const MANUFACTURING_DIVISIONS = [
  '10', '11', '12', '13', '14', '15', '16', '17', '18',
  '19', '20', '21', '22', '23', '24', '25', '26', '27',
  '28', '29', '30', '31', '32', '33'
];

/**
 * Fetch industrial establishments for a list of departments.
 *
 * @param {object} opts
 * @param {string[]} opts.departements      — INSEE codes (required)
 * @param {boolean}  [opts.includeTPE]      — include <10 employees (default true)
 * @param {number}   [opts.maxPerDept]      — soft cap; null = no limit
 * @param {boolean}  [opts.deepMode]        — segment by NAF division to bypass 10k cap
 * @param {AbortSignal} [opts.signal]
 * @param {(p: ProgressInfo) => void} [opts.onProgress]
 * @returns {Promise<{companies: Company[], errors: string[]}>}
 */
export async function fetchIndustrialCompanies(opts = {}) {
  const {
    departements,
    includeTPE = true,
    maxPerDept = null,
    deepMode = false,
    nafFilter = '',
    includeSecondary = false,
    signal,
    onProgress
  } = opts;

  if (!departements?.length) {
    return { companies: [], errors: ['Aucun département sélectionné'] };
  }

  const seen = new Map();
  const errors = [];
  let done = 0;

  for (const dept of departements) {
    if (signal?.aborted) break;
    onProgress?.({
      phase: 'dept',
      dept,
      done,
      total: departements.length,
      collected: seen.size
    });

    try {
      let results;
      if (deepMode) {
        results = await fetchDeptDeep(dept, { includeTPE, maxPerDept, nafFilter, includeSecondary, signal, onProgress });
      } else {
        results = await fetchDept(dept, { includeTPE, maxPerDept, nafFilter, includeSecondary, signal, onProgress });
      }
      results.forEach(c => {
        // Dedupe on `id` (siret-based) so HQ and secondary sites are kept distinct
        if (c?.id && !seen.has(c.id)) seen.set(c.id, c);
      });
    } catch (e) {
      if (e.name === 'AbortError') break;
      errors.push(`Département ${dept}: ${e.message}`);
    }

    done++;
    onProgress?.({
      phase: 'dept',
      dept,
      done,
      total: departements.length,
      collected: seen.size
    });
  }

  return { companies: Array.from(seen.values()), errors };
}

/** Fetch a department in standard mode (single query, paginated). */
async function fetchDept(dept, { includeTPE, maxPerDept, nafFilter, includeSecondary, signal, onProgress }) {
  const params = new URLSearchParams({
    departement: dept,
    page: '1',
    per_page: String(PAGE_SIZE),
    etat_administratif: 'A'
  });
  if (nafFilter) {
    // Official API parameter is `activite_principale` (NAF/APE code).
    // Accepts a full code ("46.62Z") or comma-separated list.
    params.set('activite_principale', normalizeNaf(nafFilter));
  } else {
    // Default: whole manufacturing section C
    params.set('section_activite_principale', INDUSTRY_SECTION);
  }
  if (!includeTPE) {
    params.set('tranche_effectif_salarie', EFFECTIF_TRANCHES_PME_PLUS);
  }
  if (includeSecondary) {
    // Ask the API to return more matching establishments (1..100, default 10)
    params.set('limite_matching_etablissements', '100');
  }

  return paginate(params, { dept, maxPerDept, includeSecondary, signal, onProgress });
}

/** Normalize a NAF prefix to the API's expected dotted form when possible.
 *  The API expects codes like "26.60Z". We pass the user's prefix as-is if it
 *  already contains a dot; otherwise we try to insert one after 2 digits. */
function normalizeNaf(naf) {
  const s = naf.trim().toUpperCase().replace(/\s/g, '');
  if (s.includes('.')) return s;
  if (/^\d{2}\d/.test(s)) {
    // e.g. "2660" → "26.60", "2660Z" → "26.60Z"
    return s.slice(0, 2) + '.' + s.slice(2);
  }
  return s; // "26" or "10" → division-level, passed as-is
}

/**
 * Deep mode — splits the query by NAF division (10..33) so each sub-query
 * stays under the API's 10,000-result ceiling. Used for dense departments
 * (Île-de-France, etc.) when the user really wants everything.
 */
async function fetchDeptDeep(dept, { includeTPE, maxPerDept, nafFilter, includeSecondary, signal, onProgress }) {
  const all = [];
  const seenIds = new Set();

  // If a NAF filter is set, restrict the segmentation to matching divisions only.
  // e.g. nafFilter "26.60" → only segment division "26".
  let divisions = MANUFACTURING_DIVISIONS;
  if (nafFilter) {
    const div = normalizeNaf(nafFilter).slice(0, 2);
    divisions = MANUFACTURING_DIVISIONS.filter(d => d === div);
    if (divisions.length === 0) divisions = [div]; // allow divisions outside section C
  }

  for (const division of divisions) {
    if (signal?.aborted) break;
    if (maxPerDept != null && all.length >= maxPerDept) break;

    // When a precise NAF filter is given, use it directly; otherwise use the
    // division code (2 digits). The API matches partial codes as a prefix.
    const nafCode = nafFilter ? normalizeNaf(nafFilter) : division;

    const params = new URLSearchParams({
      activite_principale: nafCode,
      departement: dept,
      page: '1',
      per_page: String(PAGE_SIZE),
      etat_administratif: 'A'
    });
    if (!includeTPE) {
      params.set('tranche_effectif_salarie', EFFECTIF_TRANCHES_PME_PLUS);
    }
    if (includeSecondary) {
      params.set('limite_matching_etablissements', '100');
    }

    onProgress?.({
      phase: 'deep',
      dept,
      division,
      collected: all.length
    });

    try {
      const subResults = await paginate(params, {
        dept,
        maxPerDept: maxPerDept != null ? maxPerDept - all.length : null,
        includeSecondary,
        signal,
        onProgress
      });
      subResults.forEach(c => {
        if (c?.id && !seenIds.has(c.id)) {
          seenIds.add(c.id);
          all.push(c);
        }
      });
    } catch (e) {
      // Continue with other divisions even if one fails
      if (e.name === 'AbortError') throw e;
      console.warn(`Deep fetch ${dept} div ${division}:`, e.message);
    }
  }

  return all;
}

/**
 * Paginate through API results. Stops when:
 *   - API returns fewer than PAGE_SIZE items (last page)
 *   - we've collected `maxPerDept` (if set)
 *   - we hit HARD_PAGE_LIMIT (~10k results, API's hard ceiling)
 */
async function paginate(baseParams, { dept, maxPerDept, includeSecondary, signal, onProgress }) {
  const collected = [];
  let page = 1;

  while (page <= HARD_PAGE_LIMIT) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    baseParams.set('page', String(page));
    const url = `${BASE_URL}?${baseParams.toString()}`;

    let res;
    try {
      res = await fetch(url, { signal });
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      // Network error — wait and retry once
      await sleep(500);
      res = await fetch(url, { signal });
    }

    if (!res.ok) {
      // 429 too many requests — back off
      if (res.status === 429) {
        await sleep(2000);
        continue;
      }
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    const items = data.results ?? [];
    if (items.length === 0) break;

    items.forEach(item => {
      const companies = normalizeAll(item, dept, includeSecondary);
      for (const c of companies) collected.push(c);
    });

    // Periodic progress emission for long fetches
    if (page % 4 === 0) {
      onProgress?.({
        phase: 'page',
        dept,
        page,
        collected: collected.length
      });
    }

    if (maxPerDept != null && collected.length >= maxPerDept) {
      return collected.slice(0, maxPerDept);
    }
    if (items.length < PAGE_SIZE) break;

    page++;
    await sleep(PAUSE_MS);
  }

  return collected;
}

/** Convert an API record to an ARRAY of internal Company shapes.
 *  Always includes the head office (siège). If includeSecondary is true, also
 *  includes each matching secondary establishment as its own map point.
 *  @returns {Array} list of company objects (may be empty if no geocoded site)
 */
function normalizeAll(item, dept, includeSecondary = false) {
  const out = [];
  const siege = item.siege ?? null;

  // Common (unit-level) fields shared by all establishments of this company
  const naf = item.activite_principale ?? siege?.activite_principale ?? '';
  const sector = nafToSector(naf);
  const tranche = item.tranche_effectif_salarie ?? '';
  const size = trancheToSize(tranche);
  const employees = trancheToApproxEmployees(tranche);
  const baseName = (item.nom_complet || item.nom_raison_sociale || 'Sans nom').trim();

  // Build a company object from a given establishment record
  const fromEst = (est, isHead) => {
    if (!est) return null;
    let lat = null, lng = null;
    if (est.latitude != null && est.longitude != null) {
      lat = parseFloat(est.latitude);
      lng = parseFloat(est.longitude);
    }
    if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return null;

    const estDept = deptFromEst(est) || dept;
    const estNaf = est.activite_principale ?? naf;
    const estSector = nafToSector(estNaf) || sector;
    const city = (est.libelle_commune || est.commune || '').trim();
    const suffix = isHead ? '' : ' — site secondaire';

    return {
      id: est.siret || (item.siren + (isHead ? '' : '-2nd')),
      siren: item.siren,
      siret: est.siret,
      name: baseName + suffix,
      isHeadquarters: isHead,
      sector: estSector,
      city,
      dept: estDept,
      lat,
      lng,
      employees,
      size,
      naf: estNaf,
      desc: buildDesc(item, est, estSector) + (isHead ? '' : ' Établissement secondaire.'),
      source: 'api',
      createdAt: item.date_creation,
      fetchedAt: Date.now()
    };
  };

  // 1) Always include the head office
  const headObj = fromEst(siege, true);
  if (headObj) out.push(headObj);

  // 2) Optionally include matching secondary establishments
  if (includeSecondary && Array.isArray(item.matching_etablissements)) {
    const siegeSiret = siege?.siret;
    for (const est of item.matching_etablissements) {
      if (!est) continue;
      if (est.siret && est.siret === siegeSiret) continue;  // skip the head (already added)
      const obj = fromEst(est, false);
      if (obj) out.push(obj);
    }
  }

  return out;
}

/** Derive a 2-char department code from an establishment record. */
function deptFromEst(est) {
  if (!est) return '';
  // Prefer an explicit department field if present
  if (est.departement) {
    const d = String(est.departement).trim().toUpperCase();
    if (d) return d;
  }
  // Otherwise derive from postal code or INSEE commune code
  const cp = String(est.code_postal ?? est.commune ?? '').trim();
  if (/^\d{5}$/.test(cp)) {
    const two = cp.slice(0, 2);
    if (two === '20') {
      // Corsica: 200xx/201xx → 2A, 202xx+ → 2B (approximation)
      return parseInt(cp.slice(2), 10) >= 200 ? '2B' : '2A';
    }
    if (two === '97' || two === '98') return cp.slice(0, 3); // DOM-TOM
    return two;
  }
  return '';
}

function buildDesc(item, head, sector) {
  const bits = [];
  if (head.activite_principale_libelle) {
    bits.push(head.activite_principale_libelle);
  } else if (item.libelle_section_activite_principale) {
    bits.push(item.libelle_section_activite_principale);
  } else {
    bits.push(`Établissement industriel — ${sector}`);
  }
  if (item.date_creation) {
    bits.push(`Créée en ${item.date_creation.slice(0, 4)}`);
  }
  return bits.join('. ') + '.';
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
