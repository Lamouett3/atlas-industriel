/**
 * Detail modal — full company card with CRM controls:
 *   - Favorite toggle
 *   - Status selector (none / prospect / contacted / client / refused)
 *   - Notes (free-form, autosaved)
 *   - Contacts list (add/edit/remove)
 *   - Locate / edit / delete actions
 */
import { getAllCompanies, removeCompany } from '../data/repository.js';
import { sectorColor } from '../data/sectors.js';
import { setSelected, setView } from '../filters.js';
import { showEditModal } from './editModal.js';
import { showToast } from './toast.js';
import {
  getEntry, toggleFavorite, setStatus, setNotes,
  addContact, updateContact, removeContact,
  STATUSES, STATUS_KEYS, subscribeCRM
} from '../data/crm.js';

let backdrop, content;
let currentCompanyId = null;

export function initModal() {
  backdrop = document.getElementById('modal-backdrop');
  content = document.getElementById('modal-content');

  backdrop.addEventListener('click', e => {
    if (e.target === backdrop) hideModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && backdrop.classList.contains('open')) hideModal();
  });

  // Refresh modal if CRM changes from elsewhere — but NOT when the user is
  // typing in the notes field, otherwise the textarea is destroyed mid-typing
  // and the user loses focus / cursor position.
  subscribeCRM((change) => {
    if (!backdrop.classList.contains('open') || currentCompanyId == null) return;
    if (change === 'notes') return;   // user is typing — leave the DOM alone
    renderModal(currentCompanyId);
  });
}

export function showCompanyModal(id) {
  const all = getAllCompanies();
  const c = all.find(x => x.id === id || String(x.id) === String(id));
  if (!c) return;

  currentCompanyId = c.id;
  renderModal(c.id);
  backdrop.classList.add('open');
}

export function hideModal() {
  backdrop.classList.remove('open');
  currentCompanyId = null;
}

function renderModal(id) {
  const all = getAllCompanies();
  const c = all.find(x => x.id === id || String(x.id) === String(id));
  if (!c) return;
  const color = sectorColor(c.sector);
  const entry = getEntry(c.id);
  const status = STATUSES[entry.status] ?? STATUSES.none;

  content.innerHTML = `
    <button class="close" aria-label="Fermer">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
    <div class="modal-header">
      <div class="tags-row">
        <span class="sector-tag" style="color:${color}">${c.sector}</span>
        ${sourceBadge(c.source)}
        ${c.isHeadquarters === false ? '<span class="estab-tag secondary">site secondaire</span>' : (c.isHeadquarters === true ? '<span class="estab-tag head">siège</span>' : '')}
        ${c._edited ? '<span class="edited-tag">modifiée</span>' : ''}
        <span class="status-pill" data-status="${entry.status}" style="--pill-color:${status.color}" title="${status.label}">
          <span class="status-dot"></span>${status.label}
        </span>
      </div>
      <h2>
        ${esc(c.name)}
        <button class="fav-btn ${entry.favorite ? 'active' : ''}" data-action="favorite" title="${entry.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}">
          <svg viewBox="0 0 24 24" fill="${entry.favorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        </button>
      </h2>
      <div class="location">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        ${esc(c.city)} · Dept. ${c.dept}${c.lat ? ` · ${(+c.lat).toFixed(3)}°N, ${(+c.lng).toFixed(3)}°E` : ''}
      </div>
    </div>

    <div class="modal-body">
      <p class="desc">${esc(c.desc) || '<em style="color:var(--text-mute)">Aucune description</em>'}</p>

      <div class="info-grid">
        <div class="info-cell">
          <div class="l">Salariés (estim.)</div>
          <div class="v mono">${c.employees ? Number(c.employees).toLocaleString('fr-FR') : '—'}</div>
        </div>
        <div class="info-cell">
          <div class="l">Taille</div>
          <div class="v">${c.size ?? '—'}</div>
        </div>
        <div class="info-cell">
          <div class="l">Secteur</div>
          <div class="v tag" style="--card-color:${color}">${c.sector}</div>
        </div>
        <div class="info-cell">
          <div class="l">Code NAF</div>
          <div class="v mono">${c.naf ? esc(c.naf) : '—'}</div>
        </div>
        <div class="info-cell">
          <div class="l">${c.siren ? 'SIREN' : 'Identifiant'}</div>
          <div class="v mono">${c.siren ?? String(c.id).slice(0, 12)}</div>
        </div>
      </div>

      <!-- ===== STATUS PICKER ===== -->
      <div class="crm-section">
        <h4 class="crm-section-title">Statut commercial</h4>
        <div class="status-picker">
          ${STATUS_KEYS.map(k => {
            const s = STATUSES[k];
            const active = entry.status === k;
            return `
              <button class="status-chip ${active ? 'active' : ''}" data-status="${k}" style="--pill-color:${s.color}">
                <span class="status-dot"></span>
                <span>${s.label}</span>
              </button>
            `;
          }).join('')}
        </div>
      </div>

      <!-- ===== NOTES ===== -->
      <div class="crm-section">
        <h4 class="crm-section-title">Notes <span class="crm-saved-hint" id="notes-hint"></span></h4>
        <textarea
          class="crm-notes"
          id="crm-notes"
          placeholder="Notez ici tout ce qui peut être utile : projets en cours, dernier échange, opportunités…"
          rows="3"
        >${esc(entry.notes)}</textarea>
      </div>

      <!-- ===== CONTACTS ===== -->
      <div class="crm-section">
        <h4 class="crm-section-title">
          Contacts <span class="muted">(${entry.contacts.length})</span>
          <button class="crm-add-btn" data-action="add-contact" title="Ajouter un contact">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" width="12" height="12"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Ajouter
          </button>
        </h4>
        <div class="crm-contacts">
          ${entry.contacts.length === 0
            ? '<div class="crm-empty">Aucun contact pour cette entreprise.</div>'
            : entry.contacts.map(ct => renderContact(ct)).join('')
          }
        </div>
      </div>
    </div>

    <div class="modal-footer">
      <button class="btn" data-action="edit">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Modifier
      </button>
      <button class="btn btn-danger" data-action="delete">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/></svg>
        Supprimer
      </button>
      <div style="flex:1"></div>
      <button class="btn" data-action="close">Fermer</button>
      <button class="btn btn-accent" data-action="map">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        Localiser
      </button>
    </div>
  `;

  wireInteractions(c);
}

function renderContact(ct) {
  return `
    <div class="crm-contact" data-contact-id="${escAttr(ct.id)}">
      <div class="crm-contact-head">
        <strong>${esc(ct.name) || '<em style="color:var(--text-mute)">Sans nom</em>'}</strong>
        ${ct.role ? `<span class="muted">${esc(ct.role)}</span>` : ''}
        <button class="crm-mini-btn" data-action="edit-contact" data-id="${escAttr(ct.id)}" title="Modifier">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="crm-mini-btn crm-danger" data-action="remove-contact" data-id="${escAttr(ct.id)}" title="Supprimer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/></svg>
        </button>
      </div>
      <div class="crm-contact-body">
        ${ct.email ? `<a href="mailto:${escAttr(ct.email)}" class="crm-link">✉ ${esc(ct.email)}</a>` : ''}
        ${ct.phone ? `<a href="tel:${escAttr(ct.phone)}" class="crm-link">☎ ${esc(ct.phone)}</a>` : ''}
        ${ct.note ? `<div class="crm-note">${esc(ct.note)}</div>` : ''}
      </div>
    </div>
  `;
}

function wireInteractions(c) {
  // Close
  content.querySelector('.close').addEventListener('click', hideModal);
  content.querySelector('[data-action="close"]').addEventListener('click', hideModal);

  // Edit / delete company
  content.querySelector('[data-action="edit"]').addEventListener('click', () => {
    hideModal();
    showEditModal(c);
  });
  content.querySelector('[data-action="delete"]').addEventListener('click', () => {
    if (confirm(`Supprimer "${c.name}" ?`)) {
      removeCompany(c.id);
      showToast(`Supprimée : ${c.name}`, 'success');
      hideModal();
    }
  });

  // Locate on map
  content.querySelector('[data-action="map"]').addEventListener('click', () => {
    hideModal();
    setView('map');
    document.querySelectorAll('.view').forEach(el => {
      el.classList.toggle('active', el.dataset.view === 'map');
    });
    setTimeout(() => setSelected(c.id), 100);
  });

  // Favorite
  content.querySelector('[data-action="favorite"]').addEventListener('click', () => {
    const isNowFav = toggleFavorite(c.id);
    showToast(isNowFav ? '★ Ajoutée aux favoris' : 'Retirée des favoris', 'info', 1800);
    renderModal(c.id);
  });

  // Status picker
  content.querySelectorAll('[data-status]').forEach(btn => {
    btn.addEventListener('click', () => {
      setStatus(c.id, btn.dataset.status);
      renderModal(c.id);
    });
  });

  // Notes — debounced autosave
  const notesEl = content.querySelector('#crm-notes');
  const hintEl = content.querySelector('#notes-hint');
  let notesTimer;
  notesEl?.addEventListener('input', () => {
    clearTimeout(notesTimer);
    if (hintEl) hintEl.textContent = '…';
    notesTimer = setTimeout(() => {
      setNotes(c.id, notesEl.value);
      if (hintEl) {
        hintEl.textContent = 'enregistré';
        setTimeout(() => { hintEl.textContent = ''; }, 1500);
      }
    }, 400);
  });

  // Contact actions
  content.querySelector('[data-action="add-contact"]').addEventListener('click', () => {
    openContactDialog(c.id);
  });
  content.querySelectorAll('[data-action="edit-contact"]').forEach(btn => {
    btn.addEventListener('click', () => openContactDialog(c.id, btn.dataset.id));
  });
  content.querySelectorAll('[data-action="remove-contact"]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('Supprimer ce contact ?')) {
        removeContact(c.id, btn.dataset.id);
        renderModal(c.id);
        showToast('Contact supprimé', 'success', 1800);
      }
    });
  });
}

// ============================================================
//  Contact dialog (inline mini-form)
// ============================================================

function openContactDialog(companyId, existingId = null) {
  const entry = getEntry(companyId);
  const existing = existingId ? entry.contacts.find(c => c.id === existingId) : null;

  const overlay = document.createElement('div');
  overlay.className = 'crm-overlay';
  overlay.innerHTML = `
    <div class="crm-overlay-card">
      <button type="button" class="crm-overlay-close" data-cancel aria-label="Fermer">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <h3>${existing ? 'Modifier le contact' : 'Nouveau contact'}</h3>
      <form class="crm-overlay-form" id="contact-form">
        <label><span>Nom</span><input name="name" value="${escAttr(existing?.name ?? '')}" placeholder="Prénom Nom" /></label>
        <label><span>Fonction</span><input name="role" value="${escAttr(existing?.role ?? '')}" placeholder="Ex: Directeur achats" /></label>
        <label><span>Email</span><input name="email" type="email" value="${escAttr(existing?.email ?? '')}" placeholder="nom@domaine.fr" /></label>
        <label><span>Téléphone</span><input name="phone" type="tel" value="${escAttr(existing?.phone ?? '')}" placeholder="+33 …" /></label>
        <label><span>Note</span><textarea name="note" rows="2" placeholder="Date du dernier contact, points abordés…">${esc(existing?.note ?? '')}</textarea></label>
        <div class="crm-overlay-footer">
          <button type="button" class="btn" data-cancel>Annuler</button>
          <button type="submit" class="btn btn-accent">${existing ? 'Enregistrer' : 'Ajouter'}</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));

  const cleanup = () => {
    overlay.classList.remove('open');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => overlay.remove(), 200);
  };

  // Esc closes the contact dialog (handled at document level so it works even if
  // focus is inside an input field)
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      cleanup();
    }
  };
  document.addEventListener('keydown', onKey);

  // Click on backdrop closes
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) cleanup();
  });

  // Both the X button and the Annuler button use [data-cancel]
  overlay.querySelectorAll('[data-cancel]').forEach(btn => {
    btn.addEventListener('click', cleanup);
  });

  overlay.querySelector('#contact-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    if (existing) {
      updateContact(companyId, existingId, data);
      showToast('Contact mis à jour', 'success', 1800);
    } else {
      addContact(companyId, data);
      showToast('Contact ajouté', 'success', 1800);
    }
    cleanup();
    renderModal(companyId);
  });

  setTimeout(() => overlay.querySelector('input[name="name"]')?.focus(), 80);
}

// ============================================================
//  Helpers
// ============================================================

function sourceBadge(source) {
  switch (source) {
    case 'curated': return '<span class="source-tag curated">curée</span>';
    case 'api':     return '<span class="source-tag api">API gouv.fr</span>';
    case 'custom':  return '<span class="source-tag custom">personnelle</span>';
    default:        return '';
  }
}

function esc(s) {
  if (s == null) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

/** Escape for use inside an HTML attribute (also escapes quotes). */
function escAttr(s) {
  return esc(s).replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
