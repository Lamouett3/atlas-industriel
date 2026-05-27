/**
 * Refresh UI — interaction flow:
 *   1. User clicks "Rafraîchir" → panel opens with options:
 *        - geographic scope (region / dept multi-select)
 *        - include TPE
 *        - max per dept (or no limit)
 *        - deep mode (NAF segmentation, for very large depts)
 *   2. User clicks "Lancer" → fetch begins, panel switches to loading mode.
 *   3. Progress bar updates in real-time, with running total.
 *   4. Toast on completion.
 */
import {
  refreshFromAPI,
  cancelRefresh,
  isLoading,
  getLastFetch,
  subscribeRepo
} from '../data/repository.js';
import { regionsList, deptsList, REGIONS } from '../data/geo.js';
import { showToast } from './toast.js';

const LS_KEY_OPTS = 'atlas.refresh.opts.v2';

let btn, statusEl, panel;

const opts = {
  scope: 'france',          // 'region:CODE' | 'depts:LIST' | 'france'
  selectedRegion: '84',     // default region preselect (still kept for the dropdown UI)
  selectedDepts: [],        // user-defined, empty by default
  includeTPE: true,
  maxPerDept: null,
  deepMode: false,
  nafFilter: '',            // optional NAF prefix, e.g. "26.60" — empty = all manufacturing
  includeSecondary: false   // also include matching secondary establishments
};

export function initRefresh() {
  btn = document.getElementById('refresh-btn');
  statusEl = document.getElementById('refresh-status');
  panel = document.getElementById('refresh-panel');
  if (!btn) return;

  loadOpts();
  buildPanel();

  // Header button — toggles the panel
  btn.addEventListener('click', () => {
    if (isLoading()) return;
    panel?.classList.toggle('open');
  });

  // Click outside the panel closes it (only when idle)
  document.addEventListener('click', (e) => {
    if (!panel?.classList.contains('open')) return;
    if (panel.classList.contains('loading')) return;
    if (panel.contains(e.target)) return;
    if (btn.contains(e.target)) return;
    panel.classList.remove('open');
  });

  // Repo events
  subscribeRepo((change) => {
    if (change === 'refresh:start') {
      panel?.classList.add('open', 'loading');
      btn.classList.add('loading');
    }
    if (change === 'refresh:progress') updateProgress();
    if (change === 'refresh:done' || change === 'refresh:error') {
      btn.classList.remove('loading');
      panel?.classList.remove('loading');
      setTimeout(() => panel?.classList.remove('open'), 1200);
    }
  });

  updateLastFetchLabel();
}

function loadOpts() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY_OPTS) ?? '{}');
    Object.assign(opts, saved);
    if (!Array.isArray(opts.selectedDepts)) opts.selectedDepts = [];
    // Migrate older 'rhone-alpes' scope to 'france' (the new default)
    if (opts.scope === 'rhone-alpes') opts.scope = 'france';
  } catch (e) { /* ignore */ }
}

function persistOpts() {
  try { localStorage.setItem(LS_KEY_OPTS, JSON.stringify(opts)); }
  catch (e) { /* ignore */ }
}

function buildPanel() {
  const inner = document.getElementById('refresh-panel-content');
  if (!inner) return;

  inner.innerHTML = `
    <div class="refresh-opts">
      <!-- Scope -->
      <div class="opt-group">
        <div class="opt-label">Périmètre géographique</div>
        <div class="scope-tabs">
          <button class="scope-tab" data-scope="france">France</button>
          <button class="scope-tab" data-scope="region">Région</button>
          <button class="scope-tab" data-scope="depts">Départements</button>
        </div>

        <!-- Region selector -->
        <div class="scope-body" data-body="region" hidden>
          <select id="region-select">
            ${regionsList().map(r =>
              `<option value="${r.code}">${escapeHtml(r.name)}</option>`
            ).join('')}
          </select>
        </div>

        <!-- Depts multi-select -->
        <div class="scope-body" data-body="depts" hidden>
          <div class="depts-grid" id="depts-grid">
            ${deptsList().map(d => `
              <label class="dept-chip">
                <input type="checkbox" value="${d.code}" />
                <span>${d.code}</span>
              </label>
            `).join('')}
          </div>
          <div class="depts-actions">
            <button class="btn-mini" data-action="all">Tout cocher</button>
            <button class="btn-mini" data-action="none">Tout décocher</button>
          </div>
        </div>

        <div class="scope-summary" id="scope-summary"></div>
      </div>

      <!-- Other options -->
      <div class="opt-group">
        <div class="opt-label">Options</div>
        <label class="refresh-opt">
          <span><input type="checkbox" id="opt-tpe" /> Inclure les TPE <em>(&lt;10 salariés)</em></span>
        </label>
        <label class="refresh-opt">
          <span>Limite par département</span>
          <select id="opt-limit">
            <option value="80">80 (rapide)</option>
            <option value="200">200</option>
            <option value="500">500</option>
            <option value="1000">1000</option>
            <option value="">Aucune (jusqu'à la fin)</option>
          </select>
        </label>
        <label class="refresh-opt">
          <span><input type="checkbox" id="opt-deep" /> Mode profond <em>(segmentation NAF)</em></span>
        </label>
        <label class="refresh-opt">
          <span><input type="checkbox" id="opt-secondary" /> Inclure les établissements secondaires <em>(sites en plus du siège)</em></span>
        </label>
      </div>

      <!-- NAF filter -->
      <div class="opt-group">
        <div class="opt-label">Filtre par code NAF <span class="opt-label-hint">(optionnel)</span></div>
        <input type="text" id="opt-naf" class="naf-input" placeholder="Ex : 26.60, 32.50, 21…" autocomplete="off" />
        <div class="naf-hint" id="naf-hint">Laissez vide pour toute l'industrie manufacturière. Sinon, indiquez un préfixe NAF (ex : <code>26.60</code> = électromédical, <code>10</code> = agroalimentaire, <code>46.62</code> = négoce de machines-outils).</div>
      </div>

      <button id="refresh-go" class="btn btn-accent" style="width:100%; margin-top:4px">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        Lancer la recherche
      </button>
    </div>

    <div class="refresh-progress">
      <div class="progress-bar"><div class="progress-fill"></div></div>
      <div class="progress-label">Préparation…</div>
      <div class="progress-running" id="progress-running"></div>
      <button class="btn btn-ghost" id="refresh-cancel" style="margin-top:12px; width:100%">Annuler</button>
    </div>
  `;

  // Wire up scope tabs
  inner.querySelectorAll('.scope-tab').forEach(t => {
    t.addEventListener('click', () => {
      opts.scope = t.dataset.scope;
      updateScopeUI();
      persistOpts();
    });
  });

  // Region select
  const regionSelect = inner.querySelector('#region-select');
  regionSelect.value = opts.selectedRegion;
  regionSelect.addEventListener('change', () => {
    opts.selectedRegion = regionSelect.value;
    updateScopeSummary();
    persistOpts();
  });

  // Depts grid
  const deptsGrid = inner.querySelector('#depts-grid');
  deptsGrid.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.checked = opts.selectedDepts.includes(cb.value);
    cb.addEventListener('change', () => {
      const code = cb.value;
      if (cb.checked && !opts.selectedDepts.includes(code)) {
        opts.selectedDepts.push(code);
      } else if (!cb.checked) {
        opts.selectedDepts = opts.selectedDepts.filter(d => d !== code);
      }
      updateScopeSummary();
      persistOpts();
    });
  });

  inner.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'all') {
        opts.selectedDepts = deptsList().map(d => d.code);
      } else if (action === 'none') {
        opts.selectedDepts = [];
      }
      // sync checkboxes
      deptsGrid.querySelectorAll('input').forEach(cb => {
        cb.checked = opts.selectedDepts.includes(cb.value);
      });
      updateScopeSummary();
      persistOpts();
    });
  });

  // Other opts
  const tpe = inner.querySelector('#opt-tpe');
  tpe.checked = opts.includeTPE;
  tpe.addEventListener('change', () => {
    opts.includeTPE = tpe.checked;
    persistOpts();
  });

  const limit = inner.querySelector('#opt-limit');
  limit.value = opts.maxPerDept == null ? '' : String(opts.maxPerDept);
  limit.addEventListener('change', () => {
    opts.maxPerDept = limit.value === '' ? null : parseInt(limit.value, 10);
    persistOpts();
  });

  const deep = inner.querySelector('#opt-deep');
  deep.checked = opts.deepMode;
  deep.addEventListener('change', () => {
    opts.deepMode = deep.checked;
    persistOpts();
  });

  const secondary = inner.querySelector('#opt-secondary');
  if (secondary) {
    secondary.checked = opts.includeSecondary;
    secondary.addEventListener('change', () => {
      opts.includeSecondary = secondary.checked;
      persistOpts();
    });
  }

  const naf = inner.querySelector('#opt-naf');
  if (naf) {
    naf.value = opts.nafFilter || '';
    naf.addEventListener('input', () => {
      opts.nafFilter = naf.value.trim();
      persistOpts();
    });
  }

  // Action buttons
  inner.querySelector('#refresh-go').addEventListener('click', startFetch);
  inner.querySelector('#refresh-cancel').addEventListener('click', () => {
    cancelRefresh();
    panel?.classList.remove('open');
  });

  updateScopeUI();
}

function updateScopeUI() {
  panel.querySelectorAll('.scope-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.scope === opts.scope);
  });
  panel.querySelectorAll('.scope-body').forEach(b => {
    const want =
      (opts.scope === 'region' && b.dataset.body === 'region') ||
      (opts.scope === 'depts'  && b.dataset.body === 'depts');
    b.hidden = !want;
  });
  updateScopeSummary();
}

function updateScopeSummary() {
  const el = document.getElementById('scope-summary');
  if (!el) return;
  const list = resolveDepts();
  el.textContent = `→ ${list.length} département${list.length > 1 ? 's' : ''} sélectionné${list.length > 1 ? 's' : ''}`;
}

function resolveDepts() {
  switch (opts.scope) {
    case 'region':      return REGIONS[opts.selectedRegion]?.depts ?? [];
    case 'depts':       return [...opts.selectedDepts];
    case 'france':      return deptsList().map(d => d.code);
    default:            return deptsList().map(d => d.code);
  }
}

async function startFetch() {
  if (isLoading()) return;
  const departements = resolveDepts();
  if (departements.length === 0) {
    showToast('Sélectionnez au moins un département', 'warn');
    return;
  }

  // Confirm if very large scope
  const isHuge = departements.length > 30 || opts.maxPerDept == null || opts.deepMode;
  if (isHuge) {
    const message =
      `Vous allez interroger ${departements.length} département(s)` +
      `${opts.maxPerDept == null ? ' sans limite' : ''}` +
      `${opts.deepMode ? ' en mode profond' : ''}.\n\n` +
      `Cela peut prendre plusieurs minutes et générer beaucoup de données. Continuer ?`;
    if (!confirm(message)) return;
  }

  // Validate NAF filter format if provided (digits, optional dot, optional letter)
  const nafFilter = (opts.nafFilter || '').trim();
  if (nafFilter && !/^\d{1,2}(\.?\d{0,2})?[A-Za-z]?$/.test(nafFilter)) {
    showToast('Code NAF invalide. Exemples : 26, 26.60, 32.50A', 'warn');
    return;
  }

  try {
    updateLastFetchLabel('Connexion à l\'API…');
    const { added, total, errors } = await refreshFromAPI({
      departements,
      maxPerDept: opts.maxPerDept,
      includeTPE: opts.includeTPE,
      deepMode: opts.deepMode,
      nafFilter,
      includeSecondary: opts.includeSecondary
    });
    updateLastFetchLabel();
    const sizeNote = opts.includeTPE ? '(toutes tailles)' : '(>10 salariés)';
    const nafNote = nafFilter ? ` · NAF ${nafFilter}` : '';
    if (errors.length > 0) {
      showToast(`Recherche avec ${errors.length} avertissement(s) — ${total} entreprises ${sizeNote}${nafNote}`, 'warn');
    } else {
      showToast(`✓ ${total} entreprises trouvées ${sizeNote}${nafNote}`, 'success');
    }
    // Gently remind the user they can persist these results to their account
    if (total > 0) {
      setTimeout(() => {
        showToast('💾 Astuce : sauvegardez ces résultats via votre avatar (en haut à droite) pour les retrouver à la prochaine connexion.', 'info', 6000);
      }, 1200);
    }
  } catch (e) {
    updateLastFetchLabel();
    showToast(`Échec : ${e.message}`, 'error');
  }
}

function updateProgress() {
  if (!panel) return;
  import('../data/repository.js').then(({ getLoadingProgress }) => {
    const p = getLoadingProgress();
    if (!p) return;

    const fill = panel.querySelector('.progress-fill');
    const labelEl = panel.querySelector('.progress-label');
    const runningEl = panel.querySelector('#progress-running');

    const pct = Math.round((p.done / p.total) * 100);
    if (fill) fill.style.width = pct + '%';

    if (labelEl) {
      if (p.phase === 'deep') {
        labelEl.textContent = `Dept ${p.dept} · NAF ${p.division}`;
      } else if (p.phase === 'page') {
        labelEl.textContent = `Dept ${p.dept} · page ${p.page}`;
      } else if (p.dept) {
        labelEl.textContent = `Département ${p.dept} · ${p.done}/${p.total}`;
      } else {
        labelEl.textContent = 'Préparation…';
      }
    }
    if (runningEl) {
      runningEl.textContent = p.collected != null
        ? `${p.collected} entreprises trouvées`
        : '';
    }
  });
}

function updateLastFetchLabel(override) {
  if (!statusEl) return;
  if (override) {
    statusEl.textContent = override;
    return;
  }
  const ts = getLastFetch();
  if (!ts) {
    statusEl.textContent = 'Données : entrées curées';
    return;
  }
  const date = new Date(ts);
  const diff = Date.now() - ts;
  let when;
  if (diff < 60_000) when = 'à l\'instant';
  else if (diff < 3600_000) when = `il y a ${Math.floor(diff / 60_000)} min`;
  else if (diff < 86400_000) when = `il y a ${Math.floor(diff / 3600_000)} h`;
  else when = date.toLocaleDateString('fr-FR');
  statusEl.textContent = `Mis à jour ${when}`;
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = String(s ?? '');
  return d.innerHTML;
}
