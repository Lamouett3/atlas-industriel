/**
 * Excel export — turns the currently filtered company list into a .xlsx file
 * with native Excel AutoFilter (dynamic dropdown filters on every column),
 * a frozen header row, and sensible column widths.
 *
 * Uses SheetJS (XLSX), loaded globally via CDN in index.html.
 * Everything runs client-side; no server involved.
 */
import { state } from '../state.js';
import { DEPARTMENTS, REGIONS } from './geo.js';

/** Column definitions: header label + value accessor. */
const COLUMNS = [
  { header: 'Nom',            get: c => c.name ?? '' },
  { header: 'Secteur',        get: c => c.sector ?? '' },
  { header: 'Code NAF',       get: c => c.naf ?? '' },
  { header: 'Ville',          get: c => c.city ?? '' },
  { header: 'Département',     get: c => deptLabel(c.dept) },
  { header: 'Code dépt.',     get: c => c.dept ?? '' },
  { header: 'Région',         get: c => regionLabel(c.dept) },
  { header: 'Salariés (est.)',get: c => (c.employees ?? '') === '' ? '' : Number(c.employees) },
  { header: 'Taille',         get: c => c.size ?? '' },
  { header: 'Type',           get: c => c.isHeadquarters === false ? 'Établissement secondaire' : (c.isHeadquarters === true ? 'Siège' : '') },
  { header: 'SIREN',          get: c => c.siren ?? '' },
  { header: 'SIRET',          get: c => c.siret ?? '' },
  { header: 'Latitude',       get: c => c.lat ?? '' },
  { header: 'Longitude',      get: c => c.lng ?? '' },
  { header: 'Source',         get: c => sourceLabel(c.source) },
  { header: 'Description',    get: c => c.desc ?? '' }
];

function deptLabel(code) {
  const d = DEPARTMENTS[code];
  return d ? d.name : (code ?? '');
}
function regionLabel(code) {
  const d = DEPARTMENTS[code];
  if (!d) return '';
  const r = REGIONS[d.region];
  return r?.name ?? '';
}
function sourceLabel(src) {
  switch (src) {
    case 'api':     return 'API gouv.fr';
    case 'curated': return 'Curée';
    case 'custom':  return 'Personnelle';
    default:        return src ?? '';
  }
}

/**
 * Build and trigger the download of an .xlsx of the filtered list.
 * @returns {{ok:boolean, count:number, error?:string}}
 */
export function exportFilteredToExcel() {
  if (typeof XLSX === 'undefined') {
    return { ok: false, count: 0, error: 'La bibliothèque Excel n\'est pas encore chargée. Réessayez dans un instant.' };
  }

  const rows = state.filtered ?? [];
  if (rows.length === 0) {
    return { ok: false, count: 0, error: 'Aucune entreprise à exporter (liste vide).' };
  }

  // Header + data as array-of-arrays
  const aoa = [COLUMNS.map(col => col.header)];
  for (const c of rows) {
    aoa.push(COLUMNS.map(col => col.get(c)));
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Native Excel AutoFilter over the full data range — gives dynamic dropdown
  // filters on every column header.
  const lastCol = XLSX.utils.encode_col(COLUMNS.length - 1);
  const lastRow = aoa.length;
  ws['!autofilter'] = { ref: `A1:${lastCol}${lastRow}` };

  // Freeze the header row so it stays visible while scrolling.
  ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
  ws['!panes'] = [
    { state: 'frozen', ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft' }
  ];

  // Column widths (in characters), tuned per column.
  ws['!cols'] = [
    { wch: 34 }, // Nom
    { wch: 22 }, // Secteur
    { wch: 10 }, // Code NAF
    { wch: 20 }, // Ville
    { wch: 20 }, // Département
    { wch: 9 },  // Code dépt.
    { wch: 24 }, // Région
    { wch: 13 }, // Salariés
    { wch: 8 },  // Taille
    { wch: 22 }, // Type
    { wch: 12 }, // SIREN
    { wch: 16 }, // SIRET
    { wch: 11 }, // Latitude
    { wch: 11 }, // Longitude
    { wch: 14 }, // Source
    { wch: 50 }  // Description
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Entreprises');

  // Filename with date + count
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const filename = `atlas-industriel_${rows.length}-entreprises_${stamp}.xlsx`;

  try {
    XLSX.writeFile(wb, filename, { compression: true });
    return { ok: true, count: rows.length };
  } catch (e) {
    return { ok: false, count: rows.length, error: e?.message || 'Échec de l\'export' };
  }
}
