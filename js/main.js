/**
 * Atlas Industriel · entry point.
 *
 * Cartographie interactive des entreprises industrielles françaises.
 * Données : API recherche-entreprises.api.gouv.fr (DINUM — Sirene + RNE).
 *
 * Architecture : ES modules, sans bundler. Leaflet (carte), D3 (mind map).
 * Persistance : localStorage, par profil local.
 */
import { initTheme }       from './ui/theme.js';
import { initAuthGate }    from './ui/authGate.js';
import { initProfileMenu } from './ui/profileMenu.js';
import { initCRM }         from './data/crm.js';
import { initHeader }      from './ui/header.js';
import { initSidebar }     from './ui/sidebar.js';
import { initModal }       from './ui/modal.js';
import { initEditModal }   from './ui/editModal.js';
import { initRefresh }     from './ui/refresh.js';
import { initMap }         from './views/map.js';
import { initList }        from './views/list.js';
import { initMindmap }     from './views/mindmap.js';
import { initDashboard }   from './views/dashboard.js';
import { applyFilters }    from './filters.js';
import { initRepo, loadDatasetFromProfile, getSavedDatasetInfo } from './data/repository.js';
import { getActiveProfileId, subscribeProfiles } from './data/profile.js';

function checkDeps() {
  const missing = [];
  if (typeof L === 'undefined') missing.push('Leaflet');
  if (typeof d3 === 'undefined') missing.push('D3');
  if (missing.length) {
    document.body.innerHTML = `
      <div style="padding:40px;font-family:monospace;color:#FF7B6B">
        <h2>Erreur de chargement</h2>
        <p>Bibliothèques manquantes : ${missing.join(', ')}.</p>
        <pre style="background:#11161F;padding:12px;border-radius:6px">
python3 -m http.server 8000
# puis ouvrez http://localhost:8000
        </pre>
      </div>`;
    return false;
  }
  return true;
}

async function init() {
  if (!checkDeps()) return;

  // 1. Theme — synchronous to avoid FOUC
  initTheme();

  // 2. Profile gate FIRST — blocks the app until a profile is active
  initAuthGate();
  initProfileMenu();

  // 3. CRM — depends on the active profile (auto-reloads on profile switch)
  initCRM();

  // 4. Repository — caches & curated data (async: loads cache from IndexedDB)
  await initRepo();

  // 5. UI shell
  initHeader();
  initSidebar();
  initModal();
  initEditModal();
  initRefresh();

  // 6. Views
  initMap();
  initList();
  initMindmap();
  initDashboard();

  // 7. Initial filter pass
  applyFilters('init');

  // 8. Per-profile dataset: reload the dataset saved on the active account
  //    (so the user doesn't have to re-run a search every session).
  let lastProfileId = getActiveProfileId();
  if (lastProfileId) {
    const info = getSavedDatasetInfo(lastProfileId);
    if (info.exists) {
      await loadDatasetFromProfile(lastProfileId);
      applyFilters('filter');
    }
  }
  // When the user signs into a different profile, swap in that profile's dataset
  subscribeProfiles(() => {
    const current = getActiveProfileId();
    if (current && current !== lastProfileId) {
      lastProfileId = current;
      const info = getSavedDatasetInfo(current);
      if (info.exists) {
        loadDatasetFromProfile(current).then(() => applyFilters('filter'));
      }
    } else if (!current) {
      lastProfileId = null;
    }
  });

  console.log('%c Atlas Industriel ready ', 'background:#4FD1C5;color:#0A0E1A;padding:2px 6px;border-radius:3px;font-weight:600');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
