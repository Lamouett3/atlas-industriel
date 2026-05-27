/**
 * Dashboard view — overview of the user's CRM data.
 *
 * Sections:
 *   1. Stats cards (favorites, by status, with notes/contacts)
 *   2. Status board — Kanban-style columns by status, with company chips
 *   3. Favorites list
 *   4. Contacts directory (flat list across all companies)
 *
 * The whole view is read-only; clicking any company opens its detail modal
 * for editing.
 */
import { state, subscribe } from '../state.js';
import { getAllCompanies } from '../data/repository.js';
import { sectorColor } from '../data/sectors.js';
import {
  getStats, getEntry, getAllTrackedIds, getFavoriteIds,
  STATUSES, STATUS_KEYS, subscribeCRM
} from '../data/crm.js';
import { getActiveProfile, subscribeProfiles } from '../data/profile.js';
import { showCompanyModal } from '../ui/modal.js';
import { onThemeChange } from '../ui/theme.js';

let viewEl;
let activeTab = 'overview';   // 'overview' | 'board' | 'favorites' | 'contacts'

export function initDashboard() {
  viewEl = document.querySelector('.view[data-view="dashboard"]');
  if (!viewEl) return;

  // Re-render on data changes
  subscribeCRM(() => render());
  subscribeProfiles((change) => {
    if (change === 'switch' || change === 'signOut' || change === 'reload') render();
  });
  subscribe((_, change) => {
    if (change === 'view' && state.view === 'dashboard') render();
    if (change?.startsWith?.('repo:')) render();
  });
  onThemeChange(() => render());

  render();
}

function render() {
  if (!viewEl) return;

  const profile = getActiveProfile();
  if (!profile) {
    viewEl.innerHTML = '<div class="dashboard-wrap"><div class="empty"><h4>Aucun profil actif</h4></div></div>';
    return;
  }

  const stats = getStats();
  const trackedIds = getAllTrackedIds();
  const totalCompanies = getAllCompanies().length;

  viewEl.innerHTML = `
    <div class="dashboard-wrap">

      <header class="dashboard-head">
        <div>
          <h2>Tableau de bord</h2>
          <p class="muted">Profil : <strong style="color:${profile.color}">${esc(profile.name)}</strong>
            · ${stats.tracked} entreprise${stats.tracked > 1 ? 's' : ''} suivie${stats.tracked > 1 ? 's' : ''}
            sur ${totalCompanies.toLocaleString('fr-FR')} chargée${totalCompanies > 1 ? 's' : ''}.</p>
        </div>
        <nav class="dashboard-tabs" role="tablist">
          <button class="dashboard-tab ${activeTab==='overview'?'active':''}"  data-tab="overview"  role="tab">Aperçu</button>
          <button class="dashboard-tab ${activeTab==='board'?'active':''}"     data-tab="board"     role="tab">Pipeline</button>
          <button class="dashboard-tab ${activeTab==='favorites'?'active':''}" data-tab="favorites" role="tab">★ Favoris <span class="tab-count">${stats.favorites}</span></button>
          <button class="dashboard-tab ${activeTab==='contacts'?'active':''}"  data-tab="contacts"  role="tab">Contacts</button>
        </nav>
      </header>

      <div class="dashboard-body">
        ${
          activeTab === 'overview'  ? renderOverview(stats, trackedIds) :
          activeTab === 'board'     ? renderBoard(trackedIds) :
          activeTab === 'favorites' ? renderFavorites() :
          activeTab === 'contacts'  ? renderContacts(trackedIds) :
          ''
        }
      </div>

    </div>
  `;

  viewEl.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      render();
    });
  });

  // Wire company chip clicks (delegation on the wrap)
  viewEl.querySelector('.dashboard-wrap')?.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-company-id]');
    if (chip) showCompanyModal(chip.dataset.companyId);
  });
}

// ============================================================
//  Overview tab — big stat cards
// ============================================================

function renderOverview(stats, trackedIds) {
  return `
    <div class="dash-stats">
      <div class="dash-stat">
        <div class="dash-stat-num">${stats.favorites}</div>
        <div class="dash-stat-lbl">Favoris</div>
      </div>
      ${STATUS_KEYS.filter(k => k !== 'none').map(k => {
        const s = STATUSES[k];
        return `
          <div class="dash-stat" style="--accent-pill:${s.color}">
            <div class="dash-stat-num" style="color:${s.color}">${stats.byStatus[k]}</div>
            <div class="dash-stat-lbl">${s.label}</div>
          </div>
        `;
      }).join('')}
      <div class="dash-stat">
        <div class="dash-stat-num">${stats.withContacts}</div>
        <div class="dash-stat-lbl">Avec contacts</div>
      </div>
      <div class="dash-stat">
        <div class="dash-stat-num">${stats.withNotes}</div>
        <div class="dash-stat-lbl">Avec notes</div>
      </div>
    </div>

    <div class="dash-section">
      <h3>Activité récente</h3>
      ${renderRecent(trackedIds)}
    </div>
  `;
}

function renderRecent(trackedIds) {
  const all = getAllCompanies();
  const byId = new Map(all.map(c => [String(c.id), c]));
  const items = trackedIds
    .map(id => ({ id, c: byId.get(id), e: getEntry(id) }))
    .filter(x => x.c)
    .sort((a, b) => (b.e.updatedAt ?? 0) - (a.e.updatedAt ?? 0))
    .slice(0, 12);

  if (items.length === 0) {
    return '<div class="empty-mini">Aucune activité. Ajoutez une entreprise en favori ou changez son statut pour la voir apparaître ici.</div>';
  }

  return `
    <div class="dash-recent">
      ${items.map(({ id, c, e }) => {
        const s = STATUSES[e.status] ?? STATUSES.none;
        return `
          <button class="dash-recent-item" data-company-id="${esc(id)}">
            <span class="status-dot" style="background:${s.color}"></span>
            <span class="dash-recent-name">${e.favorite ? '★ ' : ''}${esc(c.name)}</span>
            <span class="dash-recent-meta">${esc(c.city)} · ${c.dept}</span>
            <span class="dash-recent-when">${formatRelative(e.updatedAt)}</span>
          </button>
        `;
      }).join('')}
    </div>
  `;
}

// ============================================================
//  Board (Kanban) tab
// ============================================================

function renderBoard(trackedIds) {
  const all = getAllCompanies();
  const byId = new Map(all.map(c => [String(c.id), c]));

  // Group tracked entries by status (skip 'none')
  const buckets = {};
  STATUS_KEYS.forEach(k => buckets[k] = []);
  trackedIds.forEach(id => {
    const c = byId.get(id);
    const e = getEntry(id);
    if (!c) return;
    buckets[e.status].push({ c, e });
  });
  // Sort each bucket alphabetically
  Object.values(buckets).forEach(arr =>
    arr.sort((a, b) => (a.c.name ?? '').localeCompare(b.c.name ?? '', 'fr'))
  );

  // Display only meaningful columns (exclude 'none' from board)
  const cols = STATUS_KEYS.filter(k => k !== 'none');

  if (trackedIds.length === 0) {
    return `<div class="empty-mini">
      Aucune entreprise suivie pour l'instant. Ouvrez une fiche depuis la carte ou la liste,
      puis attribuez-lui un statut (Prospect, Contact établi, Client, Refus).
    </div>`;
  }

  return `
    <div class="dash-board">
      ${cols.map(k => {
        const s = STATUSES[k];
        const list = buckets[k];
        return `
          <div class="dash-col" style="--col-color:${s.color}">
            <div class="dash-col-head">
              <span class="status-dot" style="background:${s.color}"></span>
              <strong>${s.label}</strong>
              <span class="dash-col-count">${list.length}</span>
            </div>
            <div class="dash-col-body">
              ${list.length === 0
                ? '<div class="dash-col-empty">—</div>'
                : list.map(({ c, e }) => renderCompanyChip(c, e)).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderCompanyChip(c, e) {
  const sectorC = sectorColor(c.sector);
  return `
    <button class="dash-chip" data-company-id="${esc(c.id)}" style="--sector-color:${sectorC}">
      <div class="dash-chip-head">
        <span class="dash-chip-name">${e.favorite ? '★ ' : ''}${esc(c.name)}</span>
      </div>
      <div class="dash-chip-meta">
        <span>${esc(c.city)}</span>
        <span>·</span>
        <span style="color:${sectorC}">${esc(c.sector)}</span>
      </div>
      ${e.notes ? `<div class="dash-chip-note">${esc(truncate(e.notes, 80))}</div>` : ''}
      ${e.contacts.length ? `<div class="dash-chip-contacts">${e.contacts.length} contact${e.contacts.length > 1 ? 's' : ''}</div>` : ''}
    </button>
  `;
}

// ============================================================
//  Favorites tab
// ============================================================

function renderFavorites() {
  const all = getAllCompanies();
  const byId = new Map(all.map(c => [String(c.id), c]));
  const ids = getFavoriteIds();

  if (ids.length === 0) {
    return '<div class="empty-mini">Aucun favori. Cliquez sur l\'étoile dans une fiche pour en ajouter.</div>';
  }

  const items = ids
    .map(id => ({ c: byId.get(id), e: getEntry(id) }))
    .filter(x => x.c)
    .sort((a, b) => (a.c.name ?? '').localeCompare(b.c.name ?? '', 'fr'));

  return `
    <div class="dash-fav-grid">
      ${items.map(({ c, e }) => renderCompanyChip(c, e)).join('')}
    </div>
  `;
}

// ============================================================
//  Contacts tab — flat list across all tracked companies
// ============================================================

function renderContacts(trackedIds) {
  const all = getAllCompanies();
  const byId = new Map(all.map(c => [String(c.id), c]));

  const flat = [];
  trackedIds.forEach(id => {
    const c = byId.get(id);
    if (!c) return;
    const e = getEntry(id);
    e.contacts.forEach(ct => flat.push({ contact: ct, company: c }));
  });

  if (flat.length === 0) {
    return '<div class="empty-mini">Aucun contact. Ouvrez une fiche entreprise et cliquez sur « + Ajouter » dans la section Contacts.</div>';
  }

  flat.sort((a, b) => (a.contact.name ?? '').localeCompare(b.contact.name ?? '', 'fr'));

  return `
    <div class="dash-contacts">
      <table>
        <thead>
          <tr>
            <th>Contact</th>
            <th>Fonction</th>
            <th>Coordonnées</th>
            <th>Entreprise</th>
          </tr>
        </thead>
        <tbody>
          ${flat.map(({ contact, company }) => `
            <tr data-company-id="${esc(company.id)}" style="cursor:pointer">
              <td><strong>${esc(contact.name) || '—'}</strong>${contact.note ? `<div class="muted">${esc(truncate(contact.note, 60))}</div>` : ''}</td>
              <td class="muted">${esc(contact.role) || '—'}</td>
              <td>
                ${contact.email ? `<a class="crm-link" href="mailto:${esc(contact.email)}" onclick="event.stopPropagation()">✉ ${esc(contact.email)}</a>` : ''}
                ${contact.phone ? `<a class="crm-link" href="tel:${esc(contact.phone)}" onclick="event.stopPropagation()">☎ ${esc(contact.phone)}</a>` : ''}
              </td>
              <td>
                <strong>${esc(company.name)}</strong>
                <div class="muted">${esc(company.city)} · ${company.dept}</div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ============================================================
//  Helpers
// ============================================================

function formatRelative(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60_000)    return 'à l\'instant';
  if (diff < 3600_000)  return `il y a ${Math.floor(diff/60_000)} min`;
  if (diff < 86400_000) return `il y a ${Math.floor(diff/3600_000)} h`;
  if (diff < 604800_000) return `il y a ${Math.floor(diff/86400_000)} j`;
  return new Date(ts).toLocaleDateString('fr-FR');
}

function truncate(s, n) {
  if (s == null) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function esc(s) {
  if (s == null) return '';
  return String(s)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
