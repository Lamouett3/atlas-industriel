/**
 * Mind map view — D3 horizontal tree, paginated and searchable.
 *
 * Strategies for navigability with large datasets:
 *
 *   1. PAGINATION — when a sector has more than PAGE_SIZE companies, only
 *      the first PAGE_SIZE are shown as direct children; the rest live behind
 *      a "Voir N de plus" pseudo-node that expands the next page on click.
 *
 *   2. LOCAL SEARCH — a search box in the top-left filters companies inside
 *      the mind map view, in addition to the global search.
 *
 *   3. ADAPTIVE LAYOUT — node spacing scales with total node count: airy
 *      when few nodes, tight when many. Prevents the tree from becoming an
 *      unreadable wall.
 *
 *   4. ALWAYS COLLAPSED START — only root + sector level are expanded by
 *      default; companies are revealed on demand.
 *
 *   5. EMPTY STATE — like the map, the mind map is empty until the user
 *      acts (filters, searches, refreshes).
 */
import { state, subscribe } from '../state.js';
import { sectorColor } from '../data/sectors.js';
import { showCompanyModal } from '../ui/modal.js';
import { onThemeChange } from '../ui/theme.js';

const PAGE_SIZE = 25;

let svg, g, zoom, treeLayout, root;
let containerW = 0, containerH = 0;
let localQuery = '';
let hasUserIntent = false;

export function initMindmap() {
  svg = d3.select('#mindmap');
  g = svg.append('g');

  zoom = d3.zoom()
    .scaleExtent([0.15, 2.5])     // wider zoom-out for big trees
    .on('zoom', e => g.attr('transform', e.transform));
  svg.call(zoom).on('dblclick.zoom', null);

  // Mount controls
  document.getElementById('mm-zoom-in')?.addEventListener('click',
    () => svg.transition().duration(220).call(zoom.scaleBy, 1.3));
  document.getElementById('mm-zoom-out')?.addEventListener('click',
    () => svg.transition().duration(220).call(zoom.scaleBy, 1 / 1.3));
  document.getElementById('mm-reset')?.addEventListener('click', resetView);
  document.getElementById('mm-expand')?.addEventListener('click', expandAll);
  document.getElementById('mm-collapse')?.addEventListener('click', collapseAll);

  const localSearch = document.getElementById('mm-search');
  if (localSearch) {
    let t;
    localSearch.addEventListener('input', e => {
      clearTimeout(t);
      const v = e.target.value;
      t = setTimeout(() => {
        localQuery = v.trim().toLowerCase();
        render();
      }, 150);
    });
  }

  subscribe((_, change) => {
    if (change === 'filter' || change === 'search' || change === 'sort') {
      hasUserIntent = true;
    } else if (change === 'clear') {
      hasUserIntent = false;
    }
    if (['filter', 'search', 'sort', 'clear'].includes(change) ||
        change?.startsWith?.('repo:')) {
      render();
    } else if (change === 'view' && state.view === 'mindmap') {
      setTimeout(() => render(), 50);
    }
  });

  onThemeChange(() => render());
  render();
}

/** Empty / overlay state. Strict: needs at least one filter or a local search. */
function shouldRenderTree() {
  if (localQuery) return true;
  if (state.search.trim().length > 0) return true;
  if (state.activeSectors.size > 0) return true;
  if (state.activeSizes.size > 0) return true;
  if (state.activeRegions.size > 0) return true;
  if (state.activeDepts.size > 0) return true;
  if ((state.nafQuery ?? "").trim().length > 0) return true;
  return false;
}

/** Build the hierarchical data with sector grouping + pagination. */
function buildData() {
  const sectorMap = {};
  // Filter by local query
  const filtered = localQuery
    ? state.filtered.filter(c => {
        const hay = (
          (c.name ?? '') + ' ' +
          (c.sector ?? '') + ' ' +
          (c.city ?? '')
        ).toLowerCase();
        return hay.includes(localQuery);
      })
    : state.filtered;

  filtered.forEach(c => {
    if (!sectorMap[c.sector]) sectorMap[c.sector] = [];
    sectorMap[c.sector].push(c);
  });

  return {
    name: 'Industrie',
    type: 'root',
    children: Object.keys(sectorMap)
      .sort()
      .map(sec => {
        const list = sectorMap[sec].sort((a, b) =>
          (a.name ?? '').localeCompare(b.name ?? '', 'fr')
        );
        return {
          name: sec,
          type: 'sector',
          color: sectorColor(sec),
          totalCount: list.length,
          // Paginated children — first page + "more" node if needed
          children: paginate(sec, list, 0)
        };
      })
  };
}

/** Returns an array of children: first PAGE_SIZE companies, plus a
 *  "Voir +N" node if more remain. */
function paginate(sectorName, list, offset) {
  const slice = list.slice(offset, offset + PAGE_SIZE);
  const nodes = slice.map(c => ({
    name: c.name,
    type: 'company',
    color: sectorColor(sectorName),
    company: c
  }));
  const remaining = list.length - (offset + PAGE_SIZE);
  if (remaining > 0) {
    nodes.push({
      name: `+ ${remaining} autre${remaining > 1 ? 's' : ''}`,
      type: 'more',
      color: sectorColor(sectorName),
      _moreContext: { sectorName, list, nextOffset: offset + PAGE_SIZE }
    });
  }
  return nodes;
}

function render() {
  const node = svg.node();
  if (!node) return;
  containerW = node.clientWidth;
  containerH = node.clientHeight;

  // Empty state handling
  if (!shouldRenderTree()) {
    g.selectAll('*').remove();
    showOverlay(true);
    updateMmStats(0, 0);
    return;
  }
  showOverlay(false);

  const data = buildData();
  const totalShown = countCompanies(data);
  const totalAvailable = state.filtered.length;
  updateMmStats(totalShown, totalAvailable);

  if (!data.children?.length) {
    g.selectAll('*').remove();
    g.append('text')
      .attr('class', 'mm-label')
      .attr('text-anchor', 'middle')
      .attr('x', containerW / 2).attr('y', containerH / 2)
      .style('fill', 'var(--text-mute)')
      .text('Aucun résultat');
    return;
  }

  root = d3.hierarchy(data);
  root.x0 = containerH / 2;
  root.y0 = 0;

  // Adaptive node size — looser for small trees, tighter for large
  const nodeCount = root.descendants().length;
  const verticalSpacing = nodeCount > 600 ? 22
                       : nodeCount > 200 ? 26
                       : nodeCount > 60  ? 32
                       : 38;
  treeLayout = d3.tree().nodeSize([verticalSpacing, 240]);

  // Initially collapse companies (depth >= 2)
  root.descendants().forEach(d => {
    if (d.depth >= 2 && d.children) {
      d._children = d.children;
      d.children = null;
    }
  });

  update(root);
  setTimeout(resetView, 80);
}

function countCompanies(data) {
  let count = 0;
  function walk(n) {
    if (n.type === 'company') count++;
    n.children?.forEach(walk);
  }
  walk(data);
  return count;
}

function update(source) {
  treeLayout(root);
  const nodes = root.descendants();
  const links = root.links();

  // ===== LINKS =====
  const link = g.selectAll('.mm-link').data(links, d => nodeKey(d.target));
  const linkEnter = link.enter().append('path')
    .attr('class', 'mm-link')
    .attr('d', () => {
      const o = { x: source.x0 ?? source.x, y: source.y0 ?? source.y };
      return diagonal(o, o);
    });
  link.merge(linkEnter)
    .transition().duration(380).ease(d3.easeCubicInOut)
    .attr('d', d => diagonal(d.source, d.target));
  link.exit()
    .transition().duration(280)
    .attr('d', () => {
      const o = { x: source.x, y: source.y };
      return diagonal(o, o);
    })
    .style('opacity', 0)
    .remove();

  // ===== NODES =====
  const node = g.selectAll('.mm-node').data(nodes, d => nodeKey(d));

  const nodeEnter = node.enter().append('g')
    .attr('class', d => 'mm-node mm-node-' + d.data.type)
    .attr('transform', () => `translate(${source.y0 ?? source.y},${source.x0 ?? source.x})`)
    .style('opacity', 0)
    .on('click', onNodeClick);

  // Root pill
  nodeEnter.filter(d => d.data.type === 'root').append('rect')
    .attr('x', -90).attr('y', -16)
    .attr('width', 180).attr('height', 32)
    .attr('rx', 16)
    .attr('fill', 'url(#rootGradient)')
    .attr('stroke', 'var(--accent)')
    .attr('stroke-width', 1);

  // Sector pill — wider to fit the count
  nodeEnter.filter(d => d.data.type === 'sector').append('rect')
    .attr('x', -100).attr('y', -14)
    .attr('width', 200).attr('height', 28)
    .attr('rx', 14)
    .attr('fill', d => d.data.color)
    .attr('stroke', d => d.data.color)
    .attr('stroke-width', 1)
    .style('filter', d => `drop-shadow(0 2px 8px ${d.data.color}55)`);

  // Company chip
  nodeEnter.filter(d => d.data.type === 'company').append('rect')
    .attr('x', -100).attr('y', -10)
    .attr('width', 200).attr('height', 20)
    .attr('rx', 5)
    .attr('fill', 'var(--bg-2)')
    .attr('stroke', d => d.data.color)
    .attr('stroke-width', 1);

  // "Voir +N" node — distinct dashed style
  nodeEnter.filter(d => d.data.type === 'more').append('rect')
    .attr('x', -85).attr('y', -10)
    .attr('width', 170).attr('height', 20)
    .attr('rx', 5)
    .attr('fill', 'transparent')
    .attr('stroke', d => d.data.color)
    .attr('stroke-width', 1.4)
    .attr('stroke-dasharray', '4 3');

  // Labels
  nodeEnter.append('text')
    .attr('class', d => 'mm-label ' + d.data.type)
    .attr('text-anchor', 'middle')
    .attr('dy', '0.32em')
    .text(d => labelFor(d));

  // Sector toggle (+/−) and child count
  const sectorEnter = nodeEnter.filter(d => d.data.type === 'sector');
  sectorEnter.append('text')
    .attr('class', 'mm-toggle')
    .attr('x', 86).attr('y', 0)
    .attr('dy', '0.32em')
    .attr('text-anchor', 'middle')
    .attr('fill', 'var(--bg-0)')
    .text(d => d._children ? '+' : (d.children ? '−' : ''));

  // Update toggles for existing
  node.merge(nodeEnter).select('.mm-toggle')
    .text(d => d._children ? '+' : (d.children ? '−' : ''));

  // Position transitions
  const nodeUpdate = node.merge(nodeEnter);
  nodeUpdate.transition().duration(380).ease(d3.easeCubicInOut)
    .attr('transform', d => `translate(${d.y},${d.x})`)
    .style('opacity', 1);

  // Re-update labels (in case data changed but DOM persists)
  nodeUpdate.select('text.mm-label').text(d => labelFor(d));

  node.exit()
    .transition().duration(280)
    .attr('transform', () => `translate(${source.y},${source.x})`)
    .style('opacity', 0)
    .remove();

  root.each(d => { d.x0 = d.x; d.y0 = d.y; });
  ensureGradient();
}

function labelFor(d) {
  if (d.data.type === 'sector') {
    return truncate(`${d.data.name} (${d.data.totalCount})`, 26);
  }
  return truncate(d.data.name, 26);
}

function ensureGradient() {
  if (svg.select('#rootGradient').size()) return;
  const defs = svg.append('defs');
  const grad = defs.append('linearGradient')
    .attr('id', 'rootGradient').attr('x1', '0').attr('x2', '1');
  grad.append('stop').attr('offset', '0').attr('stop-color', 'var(--accent)');
  grad.append('stop').attr('offset', '1').attr('stop-color', 'var(--accent-2)');
}

function onNodeClick(event, d) {
  if (d.data.type === 'company') {
    showCompanyModal(d.data.company.id);
    return;
  }
  if (d.data.type === 'more') {
    expandMore(d);
    return;
  }
  if (d.data.type === 'sector') {
    if (d.children) {
      d._children = d.children;
      d.children = null;
    } else if (d._children) {
      d.children = d._children;
      d._children = null;
    }
    update(d);
  }
}

/** Replace a "+ N more" node with the next page of companies. */
function expandMore(moreNode) {
  const ctx = moreNode.data._moreContext;
  if (!ctx) return;

  // Find the parent sector node
  const parent = moreNode.parent;
  if (!parent) return;

  // Build next page of children data
  const nextPage = paginate(ctx.sectorName, ctx.list, ctx.nextOffset);

  // Append nextPage to the parent's data.children, replacing the old "more" node
  const oldChildren = parent.data.children;
  const idx = oldChildren.findIndex(n => n === moreNode.data);
  if (idx >= 0) {
    oldChildren.splice(idx, 1, ...nextPage);
  }

  // Re-hierarchy from root to apply changes
  root = d3.hierarchy(root.data);
  // Restore collapse state — mark all sectors as expanded (since user is browsing)
  // Actually, we need to be careful: re-hierarchizing loses _children. So we
  // re-apply: companies stay flat (no children), sectors show children if user
  // had them open. Easier: just expand the current path.
  root.descendants().forEach(n => {
    if (n.depth >= 3 && n.children) {
      n._children = n.children;
      n.children = null;
    }
  });
  update(root);
}

function expandAll() {
  if (!root) return;
  // Guard: if the tree is huge, ask before expanding everything
  const totalCompanies = state.filtered.length;
  if (totalCompanies > 200) {
    const ok = confirm(
      `Le résultat contient ${totalCompanies} entreprises. ` +
      `Tout déplier peut ralentir l'affichage. Continuer ?`
    );
    if (!ok) return;
  }
  root.descendants().forEach(d => {
    if (d._children) {
      d.children = d._children;
      d._children = null;
    }
  });
  update(root);
  setTimeout(resetView, 200);
}

function collapseAll() {
  if (!root) return;
  root.descendants().forEach(d => {
    if (d.depth >= 2 && d.children) {
      d._children = d.children;
      d.children = null;
    }
  });
  update(root);
  setTimeout(resetView, 200);
}

function resetView() {
  if (!root || !containerH) return;
  const nodes = root.descendants();
  const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const treeW = (yMax - yMin) + 320;
  const treeH = (xMax - xMin) + 80;
  const scale = Math.min(containerW / treeW, containerH / treeH, 1);
  const tx = (containerW - treeW * scale) / 2 - yMin * scale + 110;
  const ty = (containerH - treeH * scale) / 2 - xMin * scale + 40;
  svg.transition().duration(500).call(
    zoom.transform,
    d3.zoomIdentity.translate(tx, ty).scale(scale)
  );
}

function diagonal(s, t) {
  return `M ${s.y} ${s.x}
          C ${(s.y + t.y) / 2} ${s.x},
            ${(s.y + t.y) / 2} ${t.x},
            ${t.y} ${t.x}`;
}

function nodeKey(d) {
  return d.depth + ':' + (d.data.name ?? '') + ':' + (d.parent?.data.name ?? '');
}

function truncate(s, n) {
  if (s == null) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

/** Toggle the empty-state overlay. */
function showOverlay(show) {
  let el = document.getElementById('mm-overlay');
  if (!el && show) {
    el = document.createElement('div');
    el.id = 'mm-overlay';
    el.className = 'mm-overlay';
    el.innerHTML = `
      <div class="map-overlay-card">
        <div class="map-overlay-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="3"/><circle cx="4" cy="6" r="2"/><circle cx="4" cy="18" r="2"/><circle cx="20" cy="6" r="2"/><circle cx="20" cy="18" r="2"/><path d="M9 12L6 7M9 12L6 17M15 12L18 7M15 12L18 17"/></svg>
        </div>
        <h3>Mind map vide</h3>
        <p>Sélectionnez un filtre, faites une recherche, ou cliquez <strong>🔍 Rechercher</strong> pour générer la mind map.</p>
      </div>
    `;
    document.querySelector('.mindmap-view')?.appendChild(el);
  }
  if (el) el.classList.toggle('visible', show);
}

/** Update the small stats label in the help panel. */
function updateMmStats(shown, total) {
  const el = document.getElementById('mm-stats');
  if (!el) return;
  if (shown === 0 && total === 0) { el.textContent = ''; return; }
  if (shown === total) {
    el.innerHTML = `<strong>${total.toLocaleString('fr-FR')}</strong> entrepr.`;
  } else {
    el.innerHTML = `<strong>${shown.toLocaleString('fr-FR')}</strong> sur ${total.toLocaleString('fr-FR')}`;
  }
}
