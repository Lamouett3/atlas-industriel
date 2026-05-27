/**
 * Companies dataset — curated seed entries.
 *
 * This list is intentionally EMPTY: the app starts with a clean base and is
 * populated entirely by the user's own searches via the gouv.fr API
 * (and any companies they add manually).
 *
 * To ship pre-loaded companies again, append objects with this shape:
 *   { id, name, sector, city, dept, lat, lng, employees, desc }
 * They will appear automatically in all views.
 */
export const COMPANIES = [];

COMPANIES.forEach(c => {
  if (!c.source) c.source = 'curated';
});
