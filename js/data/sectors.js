/**
 * Sectors definition.
 *
 * Colors are NOT hard-coded here — they live in `css/tokens.css` as CSS
 * variables (`--sec-*`). Each theme defines its own palette.
 *
 * `sectorColor()` resolves the variable from the active theme, with a
 * memoization cache: getComputedStyle() is relatively expensive when called
 * thousands of times during a render. The cache is invalidated whenever the
 * theme changes (via invalidateColorCache()).
 */

export const SECTORS = {
  "Chimie":                  { label: "Chimie",                  varName: "--sec-chimie" },
  "Pharma & Biotech":        { label: "Pharma & Biotech",        varName: "--sec-pharma" },
  "Dispositifs médicaux":    { label: "Dispositifs médicaux",    varName: "--sec-medical" },
  "Microélectronique":       { label: "Microélectronique",       varName: "--sec-micro" },
  "Électronique & instruments": { label: "Électronique & instruments", varName: "--sec-electro" },
  "Équipements électriques": { label: "Équipements électriques", varName: "--sec-elec" },
  "Métallurgie":             { label: "Métallurgie",             varName: "--sec-metal" },
  "Mécanique":               { label: "Mécanique",               varName: "--sec-meca" },
  "Automobile":              { label: "Automobile",              varName: "--sec-auto" },
  "Aéronautique":            { label: "Aéronautique",            varName: "--sec-aero" },
  "Énergie":                 { label: "Énergie",                 varName: "--sec-energie" },
  "Plasturgie":              { label: "Plasturgie",              varName: "--sec-plast" },
  "Matériaux & BTP":         { label: "Matériaux & BTP",         varName: "--sec-materiaux" },
  "Papier, Bois & Emballage":{ label: "Papier, Bois & Emballage",varName: "--sec-papier" },
  "Agroalimentaire":         { label: "Agroalimentaire",         varName: "--sec-agro" },
  "Boissons":                { label: "Boissons",                varName: "--sec-boissons" },
  "Textile & Habillement":   { label: "Textile & Habillement",   varName: "--sec-textile" },
  "Négoce & Distribution":   { label: "Négoce & Distribution",   varName: "--sec-negoce" },
  "Défense":                 { label: "Défense",                 varName: "--sec-defense" }
};

const colorCache = new Map();

/**
 * Returns the resolved hex color for a sector under the current theme.
 * Memoized — clear with invalidateColorCache() when the theme changes.
 *
 * @param {string} name — sector key
 * @returns {string} resolved color (e.g. "#FF7B6B")
 */
export function sectorColor(name) {
  let cached = colorCache.get(name);
  if (cached !== undefined) return cached;

  const def = SECTORS[name];
  const varName = def?.varName ?? "--sec-defense";
  const v = getComputedStyle(document.documentElement)
              .getPropertyValue(varName)
              .trim();
  const resolved = v || "#94A3B8";
  colorCache.set(name, resolved);
  return resolved;
}

/** Drop the memoization cache. Call when the theme changes. */
export function invalidateColorCache() {
  colorCache.clear();
}
