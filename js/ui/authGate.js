/**
 * Auth gate — full-screen profile selector shown when no active profile.
 *
 * Renders dynamically when:
 *   - first launch (no profile exists yet) → onboarding
 *   - user signed out → profile picker
 *   - active profile is missing/invalid → fallback picker
 */
import {
  initProfiles,
  listProfiles,
  getActiveProfile,
  createProfile,
  switchTo,
  signOut,
  deleteProfile,
  exportProfile,
  importProfile,
  PROFILE_COLOR_PALETTE,
  subscribeProfiles
} from '../data/profile.js';
import { showToast } from './toast.js';
import { restoreProfileDataset } from '../data/repository.js';

let gateEl;

export function initAuthGate() {
  initProfiles();
  ensureGate();
  syncVisibility();

  subscribeProfiles((change) => {
    syncVisibility();
    if (gateEl?.classList.contains('open')) renderGate();
  });
}

function ensureGate() {
  if (gateEl) return;
  gateEl = document.createElement('div');
  gateEl.className = 'auth-gate';
  gateEl.id = 'auth-gate';
  document.body.appendChild(gateEl);
}

function syncVisibility() {
  if (!gateEl) return;
  const active = getActiveProfile();
  if (active) {
    gateEl.classList.remove('open');
    document.body.classList.remove('locked');
    return;
  }
  document.body.classList.add('locked');
  gateEl.classList.add('open');
  renderGate();
}

function renderGate() {
  const profiles = listProfiles();
  gateEl.innerHTML = profiles.length === 0
    ? renderOnboarding()
    : renderPicker(profiles);
  wireGateInteractions();
}

// ============================================================
//  Onboarding (no profiles exist)
// ============================================================

function renderOnboarding() {
  return `
    <div class="auth-card">
      <div class="auth-header">
        <span class="auth-logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" width="24" height="24">
            <path d="M3 21h18"/><path d="M5 21V8l4-3 4 3v13"/><path d="M13 12h4l4 3v6"/>
          </svg>
        </span>
        <h2>Créer votre compte</h2>
        <p class="muted">Premier lancement — créez un compte local pour suivre vos favoris, contacts et notes commerciales. Les données restent sur ce navigateur.</p>
      </div>
      ${renderCreateForm()}
      <div class="auth-footer">
        <details class="auth-import">
          <summary>J'ai déjà un compte exporté (.json)</summary>
          <input type="file" id="auth-import-file" accept="application/json" />
        </details>
      </div>
    </div>
  `;
}

// ============================================================
//  Profile picker
// ============================================================

function renderPicker(profiles) {
  return `
    <div class="auth-card auth-card-wide">
      <div class="auth-header">
        <span class="auth-logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" width="24" height="24">
            <path d="M3 21h18"/><path d="M5 21V8l4-3 4 3v13"/><path d="M13 12h4l4 3v6"/>
          </svg>
        </span>
        <h2>Connexion</h2>
        <p class="muted">Sélectionnez votre compte pour accéder à vos données.</p>
      </div>

      <div class="auth-profile-list">
        ${profiles.map(p => `
          <div class="auth-profile" data-id="${escapeAttr(p.id)}">
            <button class="auth-profile-main" data-action="select" data-id="${escapeAttr(p.id)}">
              <span class="auth-profile-avatar" style="background:${escapeAttr(p.color)}">
                ${escapeHtml(initials(p.name))}
              </span>
              <span class="auth-profile-info">
                <span class="auth-profile-name">${escapeHtml(p.name)}</span>
                <span class="auth-profile-meta">
                  ${p.pin ? '🔒 Verrouillé' : 'Non verrouillé'}
                </span>
              </span>
            </button>
            <div class="auth-profile-actions">
              <button class="auth-mini-btn" data-action="export" data-id="${escapeAttr(p.id)}" title="Exporter">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              </button>
              <button class="auth-mini-btn auth-danger" data-action="delete" data-id="${escapeAttr(p.id)}" title="Supprimer">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/></svg>
              </button>
            </div>
          </div>
        `).join('')}
      </div>

      <details class="auth-create-toggle">
        <summary>+ Créer un nouveau compte</summary>
        ${renderCreateForm()}
      </details>

      <details class="auth-import">
        <summary>Importer un compte (.json)</summary>
        <input type="file" id="auth-import-file" accept="application/json" />
      </details>
    </div>
  `;
}

function renderCreateForm() {
  return `
    <form class="auth-form" id="auth-create-form">
      <label class="auth-field">
        <span>Nom d'utilisateur <em>*</em></span>
        <input name="name" required maxlength="40" placeholder="Ex: Jean Dupont" autocomplete="off" />
      </label>
      <label class="auth-field">
        <span>Couleur</span>
        <div class="auth-color-grid">
          ${PROFILE_COLOR_PALETTE.map((c, i) => `
            <label class="auth-color">
              <input type="radio" name="color" value="${c}" ${i === 0 ? 'checked' : ''} />
              <span style="background:${c}"></span>
            </label>
          `).join('')}
        </div>
      </label>
      <label class="auth-field">
        <span>PIN à 4 chiffres <em>(optionnel)</em></span>
        <input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" placeholder="Aucun PIN" autocomplete="new-password" />
      </label>
      <button type="submit" class="btn btn-accent" style="width:100%; margin-top:8px;">Créer mon compte et me connecter</button>
    </form>
  `;
}

// ============================================================
//  Interactions
// ============================================================

function wireGateInteractions() {
  // Create form
  const form = gateEl.querySelector('#auth-create-form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      try {
        const created = createProfile({
          name: data.name,
          color: data.color,
          pin: data.pin?.trim() || null
        });
        switchTo(created.id, data.pin?.trim() || null);
        showToast(`Profil "${created.name}" créé`, 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // Profile selection
  gateEl.querySelectorAll('[data-action="select"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const profile = listProfiles().find(p => p.id === id);
      if (!profile) return;
      if (profile.pin) {
        const pin = prompt(`PIN pour "${profile.name}" :`);
        if (!pin) return;
        try {
          switchTo(id, pin);
          showToast(`Connecté en tant que ${profile.name}`, 'success');
        } catch (err) {
          showToast(err.message, 'error');
        }
      } else {
        switchTo(id);
        showToast(`Connecté en tant que ${profile.name}`, 'success');
      }
    });
  });

  // Export
  gateEl.querySelectorAll('[data-action="export"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      try {
        const bundle = exportProfile(id);
        downloadJson(`atlas-profil-${slugify(bundle.profile.name)}.json`, bundle);
        showToast('Profil exporté', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  // Delete
  gateEl.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const profile = listProfiles().find(p => p.id === id);
      if (!profile) return;
      if (confirm(`Supprimer "${profile.name}" et toutes ses données (favoris, contacts, notes) ?\nCette action est irréversible.`)) {
        deleteProfile(id);
        showToast('Profil supprimé', 'success');
      }
    });
  });

  // Import
  const importInput = gateEl.querySelector('#auth-import-file');
  if (importInput) {
    importInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const bundle = JSON.parse(text);
        const { profile: created, dataset } = importProfile(bundle);
        let n = 0;
        if (dataset && Array.isArray(dataset.companies)) {
          n = dataset.companies.length;
          await restoreProfileDataset(created.id, dataset);
        }
        if (n > 0) {
          showToast(`Profil "${created.name}" importé avec ${n} entreprise${n > 1 ? 's' : ''}`, 'success');
        } else {
          showToast(`Profil "${created.name}" importé`, 'success');
        }
      } catch (err) {
        showToast('Import échoué : ' + err.message, 'error');
      }
      e.target.value = '';
    });
  }
}

// ============================================================
//  Helpers
// ============================================================

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
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'profil';
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
function escapeAttr(s) {
  return escapeHtml(s).replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

/** Programmatic sign-out — used by the header avatar menu. */
export function requestSignOut() {
  signOut();
  showToast('Déconnecté', 'info');
}
