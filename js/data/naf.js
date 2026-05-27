/**
 * NAF code → Atlas sector mapping.
 *
 * NAF (Nomenclature d'Activités Française) is the official French industry
 * classification. Codes start with 2 digits + a letter (e.g. "20.16Z"
 * = polymères). Section C (codes 10–33) covers manufacturing.
 *
 * We map each NAF prefix to one of our 11 sectors. Order matters: the longest
 * matching prefix wins, so 21.20Z (pharma) is matched before 21 (also pharma).
 */

/**
 * NAF code → Atlas sector mapping (18 sectors).
 *
 * NAF (Nomenclature d'Activités Française) is the official French industry
 * classification. Codes start with 2 digits + a letter (e.g. "20.16Z").
 * Section C (divisions 10–33) covers manufacturing.
 *
 * Order matters: the LONGEST matching prefix wins (rules are sorted by length
 * DESC below), so a specific 4-digit rule like "32.50" overrides a 2-digit "32".
 */

const NAF_RULES = [
  // ─── Agroalimentaire (division 10) ───────────
  { prefix: "10",     sector: "Agroalimentaire" },     // industries alimentaires

  // ─── Boissons (division 11) ──────────────────
  { prefix: "11",     sector: "Boissons" },            // brasseries, vins, eaux, spiritueux

  // ─── Textile & Habillement (13, 14, 15) ──────
  { prefix: "13",     sector: "Textile & Habillement" }, // filature, tissage, textiles techniques
  { prefix: "14",     sector: "Textile & Habillement" }, // confection, prêt-à-porter
  { prefix: "15",     sector: "Textile & Habillement" }, // cuir, chaussure, maroquinerie

  // ─── Papier, Bois & Emballage (16, 17, 18) ───
  { prefix: "16",     sector: "Papier, Bois & Emballage" }, // bois, scieries, panneaux
  { prefix: "17",     sector: "Papier, Bois & Emballage" }, // papier, carton
  { prefix: "18",     sector: "Papier, Bois & Emballage" }, // imprimerie, reproduction

  // ─── Énergie (19, 35) ────────────────────────
  { prefix: "19",     sector: "Énergie" },             // cokéfaction, raffinage
  { prefix: "35",     sector: "Énergie" },             // production / distribution électricité, gaz

  // ─── Chimie (division 20, sauf 20.16) ────────
  { prefix: "20",     sector: "Chimie" },              // industrie chimique
  { prefix: "20.16",  sector: "Plasturgie" },          // plastiques sous formes primaires (override)
  { prefix: "20.17",  sector: "Plasturgie" },          // caoutchouc synthétique (override)

  // ─── Pharma & Biotech (division 21) ──────────
  { prefix: "21",     sector: "Pharma & Biotech" },    // pharmacie
  { prefix: "72.11",  sector: "Pharma & Biotech" },    // R&D biotechnologies

  // ─── Plasturgie (division 22) ────────────────
  { prefix: "22",     sector: "Plasturgie" },          // caoutchouc + plastique

  // ─── Matériaux & BTP (division 23) ───────────
  { prefix: "23",     sector: "Matériaux & BTP" },     // verre, céramique, ciment, béton

  // ─── Métallurgie (division 24) ───────────────
  { prefix: "24",     sector: "Métallurgie" },         // métallurgie de base (sidérurgie, fonderie)

  // ─── Mécanique : produits métalliques (25) + machines (28) + réparation (33) ─
  { prefix: "25",     sector: "Mécanique" },           // produits métalliques (structures, outillage)
  { prefix: "25.40",  sector: "Défense" },             // armement, munitions (override 25)
  { prefix: "28",     sector: "Mécanique" },           // machines et équipements n.c.a.
  { prefix: "33",     sector: "Mécanique" },           // réparation et installation de machines
  { prefix: "33.16",  sector: "Aéronautique" },        // réparation d'aéronefs (override 33)

  // ─── Microélectronique (26.11, 26.12, 26.20) ─
  { prefix: "26.11",  sector: "Microélectronique" },   // composants électroniques
  { prefix: "26.12",  sector: "Microélectronique" },   // cartes électroniques assemblées
  { prefix: "26.20",  sector: "Microélectronique" },   // ordinateurs, équipements périphériques

  // ─── Dispositifs médicaux (32.50, 26.60) ─────
  { prefix: "32.50",  sector: "Dispositifs médicaux" },// matériel médico-chirurgical et dentaire
  { prefix: "26.60",  sector: "Dispositifs médicaux" },// équipements d'irradiation, électromédicaux (IRM, dialyse...)

  // ─── Électronique & instruments (reste de 26) ─
  { prefix: "26",     sector: "Électronique & instruments" }, // instruments de mesure, optique, horlogerie
  { prefix: "26.30",  sector: "Électronique & instruments" }, // équipements de communication
  { prefix: "26.40",  sector: "Électronique & instruments" }, // électronique grand public
  { prefix: "26.51",  sector: "Électronique & instruments" }, // instruments de mesure, navigation
  { prefix: "26.70",  sector: "Électronique & instruments" }, // matériel optique et photographique

  // ─── Équipements électriques (division 27) ───
  { prefix: "27",     sector: "Équipements électriques" }, // moteurs, transformateurs, batteries, câbles, appareillage

  // ─── Automobile (division 29) ────────────────
  { prefix: "29",     sector: "Automobile" },          // construction automobile + équipementiers

  // ─── Autres matériels de transport (division 30) ─
  { prefix: "30.30",  sector: "Aéronautique" },        // construction aéronautique et spatiale
  { prefix: "30.40",  sector: "Défense" },             // véhicules militaires de combat
  { prefix: "30.20",  sector: "Mécanique" },           // matériel ferroviaire roulant
  { prefix: "30.11",  sector: "Mécanique" },           // construction navale (civile)
  { prefix: "30.12",  sector: "Mécanique" },           // construction de bateaux de plaisance

  // ─── Autres industries manufacturières (division 32, sauf 32.50) ─
  { prefix: "32",     sector: "Mécanique" },           // bijouterie, instruments de musique, jouets, sport (catch-all)
  { prefix: "31",     sector: "Mécanique" },           // meubles

  // ─── Négoce & Distribution (division 46 — commerce de gros interentreprises) ─
  { prefix: "46",     sector: "Négoce & Distribution" }, // grossistes : machines-outils, équipements, matériaux...
  { prefix: "45",     sector: "Négoce & Distribution" }, // commerce / réparation auto (gros)
  { prefix: "47",     sector: "Négoce & Distribution" }  // commerce de détail (si recherché explicitement)
];

// Sort by prefix length DESC so the longest (most specific) match wins
const SORTED_RULES = [...NAF_RULES].sort((a, b) => b.prefix.length - a.prefix.length);

/**
 * Map an NAF code to one of the Atlas sectors.
 * @param {string} naf — e.g. "21.20Z", "32.50A", "26.60Z"
 * @returns {string} sector key, or "Mécanique" as a safe default
 */
export function nafToSector(naf) {
  if (!naf) return "Mécanique";
  const clean = naf.replace(/\s/g, "");
  for (const rule of SORTED_RULES) {
    if (clean.startsWith(rule.prefix)) return rule.sector;
  }
  return "Mécanique";
}

/**
 * Returns the NAF section letter for filtering.
 * The API expects this on `section_activite_principale`.
 * @returns {string} "C" — Industrie manufacturière
 */
export const INDUSTRY_SECTION = "C";

/** Tranche d'effectif codes (INSEE) for "more than 10 employees". */
export const EFFECTIF_TRANCHES_PME_PLUS = "11,12,21,22,31,32,41,42,51,52,53";

/** All non-zero employee tranches (TPE+). */
export const EFFECTIF_TRANCHES_ALL = "01,02,03,11,12,21,22,31,32,41,42,51,52,53";

/** Decode INSEE effectif tranche to a human-readable size category. */
export function trancheToSize(tranche) {
  const n = parseInt(tranche, 10);
  if (isNaN(n) || n === 0) return "—";
  if (n <= 3)  return "TPE";       // <10 salariés
  if (n <= 22) return "PME";       // 10–199
  if (n <= 32) return "ETI";       // 200–499 (étendu jusqu'à ~5000)
  if (n <= 42) return "ETI";       // 500–1999
  return "GE";                     // 2000+
}

/** Returns approx employee count midpoint for a tranche (for sorting/stats). */
export function trancheToApproxEmployees(tranche) {
  const map = {
    "00": 0, "01": 1, "02": 4, "03": 7, "11": 14, "12": 30,
    "21": 75, "22": 150, "31": 225, "32": 375, "41": 750,
    "42": 1500, "51": 3500, "52": 7500, "53": 15000
  };
  return map[tranche] ?? 0;
}
