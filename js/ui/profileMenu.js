/**
 * Profile menu — avatar button in the header with a dropdown:
 *   - Current profile name
 *   - Export profile
 *   - Switch profile (signs out, returns to gate)
 */
import { getActiveProfile, subscribeProfiles, exportProfile } from '../data/profile.js';
import {
  saveDatasetToProfile,
  getSavedDatasetInfo,
  clearSavedDataset,
  getProfileDatasetForExport,
  clearApiCache,
  getStats
} from '../data/repository.js';
import { applyFilters } from '../filters.js';
import { requestSignOut } from './authGate.js';
import { showToast } from './toast.js';

let btnEl, menuEl;

export function initProfileMenu() {
  btnEl = document.getElementById('profile-btn');
  menuEl = document.getElementById('profile-menu');
  if (!btnEl) return;

  btnEl.addEventListener('click', (e) => {
    e.stopPropagation();
    menuEl.classList.toggle('open');
    if (menuEl.classList.contains('open')) renderMenu();
  });

  document.addEventListener('click', (e) => {
    if (!menuEl?.classList.contains('open')) return;
    if (menuEl.contains(e.target) || btnEl.contains(e.target)) return;
    menuEl.classList.remove('open');
  });

  subscribeProfiles(() => renderAvatar());
  renderAvatar();
}

function renderAvatar() {
  if (!btnEl) return;
  const p = getActiveProfile();
  if (!p) {
    btnEl.style.display = 'none';
    return;
  }
  btnEl.style.display = 'grid';
  btnEl.style.background = p.color;
  btnEl.title = p.name;
  btnEl.setAttribute('aria-label', `Profil : ${p.name}`);
  btnEl.textContent = initials(p.name);
}

function renderMenu() {
  const p = getActiveProfile();
  if (!p || !menuEl) return;

  const stats = getStats();
  const loadedCount = stats.api ?? 0;
  const saved = getSavedDatasetInfo(p.id);

  const savedLine = saved.exists
    ? `${saved.count} entreprise${saved.count > 1 ? 's' : ''} sauvegardée${saved.count > 1 ? 's' : ''}${saved.savedAt ? ' · ' + formatWhen(saved.savedAt) : ''}`
    : 'Aucune donnée sauvegardée';

  menuEl.innerHTML = `
    <div class="profile-menu-head">
      <div class="profile-menu-avatar" style="background:${escapeAttr(p.color)}">${escapeHtml(initials(p.name))}</div>
      <div>
        <div class="profile-menu-name">${escapeHtml(p.name)}</div>
        <div class="profile-menu-sub">${p.pin ? '🔒 Profil verrouillé' : 'Profil local'}</div>
      </div>
    </div>

    <div class="profile-menu-section">
      <div class="profile-menu-section-label">Données du compte</div>
      <div class="profile-menu-data-status">
        <span class="data-dot ${loadedCount > 0 ? 'on' : ''}"></span>
        <span>${loadedCount > 0 ? `${loadedCount.toLocaleString('fr-FR')} entreprise${loadedCount > 1 ? 's' : ''} chargée${loadedCount > 1 ? 's' : ''}` : 'Aucune entreprise chargée'}</span>
      </div>
      <div class="profile-menu-data-status">
        <span class="data-dot ${saved.exists ? 'on' : ''}"></span>
        <span>${savedLine}</span>
      </div>
      <button class="profile-menu-item" data-action="save-data" ${loadedCount === 0 ? 'disabled' : ''}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
        Sauvegarder ${loadedCount > 0 ? loadedCount + ' résultat' + (loadedCount > 1 ? 's' : '') : 'les données'} sur mon compte
      </button>
      ${loadedCount > 0 ? `
      <button class="profile-menu-item subtle" data-action="clear-loaded">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
        Vider les entreprises chargées
      </button>` : ''}
      ${saved.exists ? `
      <button class="profile-menu-item subtle" data-action="clear-data">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        Effacer les données sauvegardées
      </button>` : ''}
    </div>

    <button class="profile-menu-item" data-action="export">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      Exporter mon profil ${saved.exists ? '+ données' : ''}
    </button>
    <div class="profile-menu-hint">${saved.exists
      ? `Inclut le CRM et ${saved.count} entreprise${saved.count > 1 ? 's' : ''} sauvegardée${saved.count > 1 ? 's' : ''}.`
      : 'Inclut le CRM. Sauvegardez des résultats pour les ajouter.'}</div>
    <button class="profile-menu-item" data-action="signout">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      Changer de profil
    </button>
  `;

  // Save dataset onto the account
  const saveBtn = menuEl.querySelector('[data-action="save-data"]');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      const res = await saveDatasetToProfile(p.id);
      if (res.ok) {
        showToast(`✓ ${res.count} entreprise${res.count > 1 ? 's' : ''} sauvegardée${res.count > 1 ? 's' : ''} sur votre compte`, 'success');
      } else {
        showToast(res.error || 'Échec de la sauvegarde', 'error');
      }
      renderMenu(); // refresh the status line
    });
  }

  // Clear the loaded API dataset (start fresh)
  const clearLoadedBtn = menuEl.querySelector('[data-action="clear-loaded"]');
  if (clearLoadedBtn) {
    clearLoadedBtn.addEventListener('click', async () => {
      if (confirm('Vider toutes les entreprises actuellement chargées ? Cela ne touche pas aux données sauvegardées sur votre compte.')) {
        await clearApiCache();
        applyFilters('clear');
        showToast('Entreprises chargées vidées', 'success');
        renderMenu();
      }
    });
  }

  // Clear saved dataset
  const clearBtn = menuEl.querySelector('[data-action="clear-data"]');
  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      if (confirm('Effacer les données sauvegardées sur ce compte ? Les résultats actuellement affichés ne sont pas supprimés.')) {
        await clearSavedDataset(p.id);
        showToast('Données sauvegardées effacées', 'success');
        renderMenu();
      }
    });
  }

  menuEl.querySelector('[data-action="export"]').addEventListener('click', async () => {
    try {
      const ds = await getProfileDatasetForExport(p.id);
      const bundle = exportProfile(p.id, ds);
      downloadJson(`atlas-profil-${slugify(p.name)}.json`, bundle);
      const n = ds?.companies?.length || 0;
      showToast(n > 0 ? `Profil exporté avec ${n} entreprise${n > 1 ? 's' : ''}` : 'Profil exporté', 'success');
    } catch (e) {
      showToast(e.message, 'error');
    }
    menuEl.classList.remove('open');
  });
  menuEl.querySelector('[data-action="signout"]').addEventListener('click', () => {
    menuEl.classList.remove('open');
    requestSignOut();
  });
}

/** Human-friendly "saved X ago" label. */
function formatWhen(ts) {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `il y a ${d} j`;
  return new Date(ts).toLocaleDateString('fr-FR');
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 200);
}

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map(p => p[0]?.toUpperCase()).join('') || '?';
}

function slugify(s) {
  return String(s).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'profil';
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
function escapeAttr(s) {
  return escapeHtml(s).replaceAll('"', '&quot;');
}
