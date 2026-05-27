/**
 * Edit / create modal for companies.
 * Used when the user clicks "+ Ajouter une entreprise" or "Modifier" in the
 * detail modal.
 */
import { SECTORS } from '../data/sectors.js';
import {
  addCustomCompany,
  updateCompany,
  removeCompany
} from '../data/repository.js';
import { showToast } from './toast.js';

let backdrop, content;

export function initEditModal() {
  backdrop = document.getElementById('edit-backdrop');
  content = document.getElementById('edit-content');
  if (!backdrop) return;

  backdrop.addEventListener('click', e => {
    if (e.target === backdrop) hideEdit();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && backdrop.classList.contains('open')) hideEdit();
  });
}

/**
 * Open the edit modal.
 * @param {Company|null} company — existing company to edit, or null for create
 */
export function showEditModal(company = null) {
  const isEdit = !!company;
  const c = company ?? {
    name: '', sector: 'Mécanique', city: '', dept: '69',
    lat: 45.764, lng: 4.835, employees: 0, size: 'PME', desc: ''
  };

  content.innerHTML = `
    <div class="edit-header">
      <h2>${isEdit ? 'Modifier l\'entreprise' : 'Nouvelle entreprise'}</h2>
      <button class="close" aria-label="Fermer">×</button>
    </div>
    <form class="edit-form" id="edit-form">
      <div class="row">
        <label>
          <span>Nom <em>*</em></span>
          <input name="name" required value="${esc(c.name)}" placeholder="Ex: Mon Entreprise SAS" />
        </label>
      </div>

      <div class="row two">
        <label>
          <span>Secteur</span>
          <select name="sector">
            ${Object.keys(SECTORS).map(s => `
              <option value="${esc(s)}" ${s === c.sector ? 'selected' : ''}>${esc(s)}</option>
            `).join('')}
          </select>
        </label>
        <label>
          <span>Taille</span>
          <select name="size">
            ${['TPE','PME','ETI','GE'].map(s => `
              <option value="${s}" ${s === (c.size ?? 'PME') ? 'selected' : ''}>${s}</option>
            `).join('')}
          </select>
        </label>
      </div>

      <div class="row two">
        <label>
          <span>Ville</span>
          <input name="city" value="${esc(c.city)}" placeholder="Ex: Lyon" />
        </label>
        <label>
          <span>Département</span>
          <input name="dept" value="${esc(c.dept)}" maxlength="3" placeholder="69" />
        </label>
      </div>

      <div class="row two">
        <label>
          <span>Latitude</span>
          <input name="lat" type="number" step="0.0001" value="${c.lat}" />
        </label>
        <label>
          <span>Longitude</span>
          <input name="lng" type="number" step="0.0001" value="${c.lng}" />
        </label>
      </div>

      <div class="row">
        <label>
          <span>Salariés (estimation)</span>
          <input name="employees" type="number" min="0" value="${c.employees ?? 0}" />
        </label>
      </div>

      <div class="row">
        <label>
          <span>Description</span>
          <textarea name="desc" rows="3" placeholder="Activité, spécialité, contexte…">${esc(c.desc)}</textarea>
        </label>
      </div>

      <div class="edit-footer">
        ${isEdit ? `<button type="button" class="btn btn-danger" data-action="delete">Supprimer</button>` : ''}
        <div style="flex:1"></div>
        <button type="button" class="btn" data-action="cancel">Annuler</button>
        <button type="submit" class="btn btn-accent">${isEdit ? 'Enregistrer' : 'Créer'}</button>
      </div>
    </form>
  `;

  // Wire actions
  content.querySelector('.close').addEventListener('click', hideEdit);
  content.querySelector('[data-action="cancel"]').addEventListener('click', hideEdit);

  if (isEdit) {
    content.querySelector('[data-action="delete"]').addEventListener('click', () => {
      if (confirm(`Supprimer "${c.name}" ?\n(Les entreprises créées par vous sont supprimées définitivement. Les autres sont masquées et peuvent être restaurées.)`)) {
        removeCompany(c.id);
        showToast(`Supprimée : ${c.name}`, 'success');
        hideEdit();
      }
    });
  }

  content.querySelector('#edit-form').addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());

    if (isEdit) {
      updateCompany(c.id, {
        name: data.name,
        sector: data.sector,
        size: data.size,
        city: data.city,
        dept: data.dept,
        lat: parseFloat(data.lat),
        lng: parseFloat(data.lng),
        employees: parseInt(data.employees, 10) || 0,
        desc: data.desc
      });
      showToast(`Modifiée : ${data.name}`, 'success');
    } else {
      addCustomCompany(data);
      showToast(`Ajoutée : ${data.name}`, 'success');
    }
    hideEdit();
  });

  backdrop.classList.add('open');
  setTimeout(() => content.querySelector('input[name="name"]')?.focus(), 100);
}

export function hideEdit() {
  backdrop.classList.remove('open');
}

function esc(s) {
  if (s == null) return '';
  return String(s)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
