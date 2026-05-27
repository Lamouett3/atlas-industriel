/**
 * Geographic data — French regions & departments.
 *
 * Source: INSEE official codes (region & department codes).
 * Ordered by region then by department code.
 */

export const REGIONS = {
  "11": { name: "Île-de-France", depts: ["75", "77", "78", "91", "92", "93", "94", "95"] },
  "24": { name: "Centre-Val de Loire", depts: ["18", "28", "36", "37", "41", "45"] },
  "27": { name: "Bourgogne-Franche-Comté", depts: ["21", "25", "39", "58", "70", "71", "89", "90"] },
  "28": { name: "Normandie", depts: ["14", "27", "50", "61", "76"] },
  "32": { name: "Hauts-de-France", depts: ["02", "59", "60", "62", "80"] },
  "44": { name: "Grand Est", depts: ["08", "10", "51", "52", "54", "55", "57", "67", "68", "88"] },
  "52": { name: "Pays de la Loire", depts: ["44", "49", "53", "72", "85"] },
  "53": { name: "Bretagne", depts: ["22", "29", "35", "56"] },
  "75": { name: "Nouvelle-Aquitaine", depts: ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"] },
  "76": { name: "Occitanie", depts: ["09", "11", "12", "30", "31", "32", "34", "46", "48", "65", "66", "81", "82"] },
  "84": { name: "Auvergne-Rhône-Alpes", depts: ["01", "03", "07", "15", "26", "38", "42", "43", "63", "69", "73", "74"] },
  "93": { name: "Provence-Alpes-Côte d'Azur", depts: ["04", "05", "06", "13", "83", "84"] },
  "94": { name: "Corse", depts: ["2A", "2B"] }
};

/** "Rhône-Alpes" historical region (subset of Auvergne-Rhône-Alpes). */
export const RHONE_ALPES_DEPTS = ["01", "07", "26", "38", "42", "69", "73", "74"];

export const DEPARTMENTS = {
  "01": { name: "Ain",                  region: "84" },
  "02": { name: "Aisne",                region: "32" },
  "03": { name: "Allier",               region: "84" },
  "04": { name: "Alpes-de-Haute-Provence", region: "93" },
  "05": { name: "Hautes-Alpes",         region: "93" },
  "06": { name: "Alpes-Maritimes",      region: "93" },
  "07": { name: "Ardèche",              region: "84" },
  "08": { name: "Ardennes",             region: "44" },
  "09": { name: "Ariège",               region: "76" },
  "10": { name: "Aube",                 region: "44" },
  "11": { name: "Aude",                 region: "76" },
  "12": { name: "Aveyron",              region: "76" },
  "13": { name: "Bouches-du-Rhône",     region: "93" },
  "14": { name: "Calvados",             region: "28" },
  "15": { name: "Cantal",               region: "84" },
  "16": { name: "Charente",             region: "75" },
  "17": { name: "Charente-Maritime",    region: "75" },
  "18": { name: "Cher",                 region: "24" },
  "19": { name: "Corrèze",              region: "75" },
  "21": { name: "Côte-d'Or",            region: "27" },
  "22": { name: "Côtes-d'Armor",        region: "53" },
  "23": { name: "Creuse",               region: "75" },
  "24": { name: "Dordogne",             region: "75" },
  "25": { name: "Doubs",                region: "27" },
  "26": { name: "Drôme",                region: "84" },
  "27": { name: "Eure",                 region: "28" },
  "28": { name: "Eure-et-Loir",         region: "24" },
  "29": { name: "Finistère",            region: "53" },
  "2A": { name: "Corse-du-Sud",         region: "94" },
  "2B": { name: "Haute-Corse",          region: "94" },
  "30": { name: "Gard",                 region: "76" },
  "31": { name: "Haute-Garonne",        region: "76" },
  "32": { name: "Gers",                 region: "76" },
  "33": { name: "Gironde",              region: "75" },
  "34": { name: "Hérault",              region: "76" },
  "35": { name: "Ille-et-Vilaine",      region: "53" },
  "36": { name: "Indre",                region: "24" },
  "37": { name: "Indre-et-Loire",       region: "24" },
  "38": { name: "Isère",                region: "84" },
  "39": { name: "Jura",                 region: "27" },
  "40": { name: "Landes",               region: "75" },
  "41": { name: "Loir-et-Cher",         region: "24" },
  "42": { name: "Loire",                region: "84" },
  "43": { name: "Haute-Loire",          region: "84" },
  "44": { name: "Loire-Atlantique",     region: "52" },
  "45": { name: "Loiret",               region: "24" },
  "46": { name: "Lot",                  region: "76" },
  "47": { name: "Lot-et-Garonne",       region: "75" },
  "48": { name: "Lozère",               region: "76" },
  "49": { name: "Maine-et-Loire",       region: "52" },
  "50": { name: "Manche",               region: "28" },
  "51": { name: "Marne",                region: "44" },
  "52": { name: "Haute-Marne",          region: "44" },
  "53": { name: "Mayenne",              region: "52" },
  "54": { name: "Meurthe-et-Moselle",   region: "44" },
  "55": { name: "Meuse",                region: "44" },
  "56": { name: "Morbihan",             region: "53" },
  "57": { name: "Moselle",              region: "44" },
  "58": { name: "Nièvre",               region: "27" },
  "59": { name: "Nord",                 region: "32" },
  "60": { name: "Oise",                 region: "32" },
  "61": { name: "Orne",                 region: "28" },
  "62": { name: "Pas-de-Calais",        region: "32" },
  "63": { name: "Puy-de-Dôme",          region: "84" },
  "64": { name: "Pyrénées-Atlantiques", region: "75" },
  "65": { name: "Hautes-Pyrénées",      region: "76" },
  "66": { name: "Pyrénées-Orientales",  region: "76" },
  "67": { name: "Bas-Rhin",             region: "44" },
  "68": { name: "Haut-Rhin",            region: "44" },
  "69": { name: "Rhône",                region: "84" },
  "70": { name: "Haute-Saône",          region: "27" },
  "71": { name: "Saône-et-Loire",       region: "27" },
  "72": { name: "Sarthe",               region: "52" },
  "73": { name: "Savoie",               region: "84" },
  "74": { name: "Haute-Savoie",         region: "84" },
  "75": { name: "Paris",                region: "11" },
  "76": { name: "Seine-Maritime",       region: "28" },
  "77": { name: "Seine-et-Marne",       region: "11" },
  "78": { name: "Yvelines",             region: "11" },
  "79": { name: "Deux-Sèvres",          region: "75" },
  "80": { name: "Somme",                region: "32" },
  "81": { name: "Tarn",                 region: "76" },
  "82": { name: "Tarn-et-Garonne",      region: "76" },
  "83": { name: "Var",                  region: "93" },
  "84": { name: "Vaucluse",             region: "93" },
  "85": { name: "Vendée",               region: "52" },
  "86": { name: "Vienne",               region: "75" },
  "87": { name: "Haute-Vienne",         region: "75" },
  "88": { name: "Vosges",               region: "44" },
  "89": { name: "Yonne",                region: "27" },
  "90": { name: "Territoire de Belfort", region: "27" },
  "91": { name: "Essonne",              region: "11" },
  "92": { name: "Hauts-de-Seine",       region: "11" },
  "93": { name: "Seine-Saint-Denis",    region: "11" },
  "94": { name: "Val-de-Marne",         region: "11" },
  "95": { name: "Val-d'Oise",           region: "11" }
};

/** Get the region name for a department code. */
export function regionOfDept(deptCode) {
  const d = DEPARTMENTS[deptCode];
  return d ? REGIONS[d.region]?.name : null;
}

/** Get all departments belonging to a region (by region code). */
export function deptsOfRegion(regionCode) {
  return REGIONS[regionCode]?.depts ?? [];
}

/** Sorted list of [code, region] for UI rendering. */
export function regionsList() {
  return Object.entries(REGIONS)
    .map(([code, r]) => ({ code, name: r.name, depts: r.depts }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

/** Sorted list of [code, department] for UI rendering. */
export function deptsList() {
  return Object.entries(DEPARTMENTS)
    .map(([code, d]) => ({ code, name: d.name, region: d.region }))
    .sort((a, b) => a.code.localeCompare(b.code));
}
