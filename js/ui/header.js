/**
 * Header — search input, view switch, keyboard shortcuts.
 * Shortcuts (when not typing):
 *   /   focus search       Esc clear / blur
 *   1   map     2 list     3 mindmap
 *   t   theme   r refresh  a add
 */
import { setSearch, setView } from '../filters.js';
import { state, subscribe } from '../state.js';
import { toggleTheme } from './theme.js';
import { showEditModal } from './editModal.js';

let searchInput, switchBtns;

export function initHeader() {
  searchInput = document.getElementById('search');
  switchBtns = document.querySelectorAll('[data-view-btn]');

  let searchTimer;
  searchInput.addEventListener('input', e => {
    clearTimeout(searchTimer);
    const v = e.target.value;
    searchTimer = setTimeout(() => setSearch(v), 120);
  });

  switchBtns.forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.viewBtn));
  });

  document.addEventListener('keydown', e => {
    const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(
      document.activeElement?.tagName ?? ''
    );

    if (e.key === '/' && !isTyping) {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    } else if (e.key === 'Escape' && document.activeElement === searchInput) {
      searchInput.blur();
      if (searchInput.value) {
        searchInput.value = '';
        setSearch('');
      }
    } else if (!isTyping && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === '1') switchView('map');
      else if (e.key === '2') switchView('list');
      else if (e.key === '3') switchView('mindmap');
      else if (e.key === '4') switchView('dashboard');
      else if (e.key === 't' || e.key === 'T') toggleTheme();
      else if (e.key === 'r' || e.key === 'R') document.getElementById('refresh-btn')?.click();
      else if (e.key === 'a' || e.key === 'A') showEditModal(null);
    }
  });

  subscribe((_, change) => {
    if (change === 'view') updateActiveButton();
  });

  updateActiveButton();
}

function switchView(view) {
  if (state.view === view) return;
  setView(view);
  document.querySelectorAll('.view').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });
}

function updateActiveButton() {
  switchBtns.forEach(b => {
    b.classList.toggle('active', b.dataset.viewBtn === state.view);
  });
}
