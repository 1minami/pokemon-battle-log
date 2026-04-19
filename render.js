// ===== Rendering Module =====
import { battles, statsDirty, setStatsDirty } from './state.js';
import { formatDate, escapeHtml, getPokemonSlug, buildResultMap, formatDelta } from './utils.js';
import { getFilteredBattles, buildTagFilterOptions } from './filter.js';
import { getSpriteUrl, MEGA_BASE } from './pokemon-data.js';

const $tableBody = document.getElementById('table-body');
const $emptyState = document.getElementById('empty-state');
const $mobileCards = document.getElementById('mobile-cards');
const $statWins = document.getElementById('stat-wins');
const $statLosses = document.getElementById('stat-losses');
const $statRate = document.getElementById('stat-rate');
const mobileQuery = window.matchMedia('(max-width: 768px)');

export { $tableBody, $mobileCards, mobileQuery };

// Lazy reference to renderAllStats (set by stats.js to avoid circular import)
let _renderAllStats = null;
export function setRenderAllStats(fn) { _renderAllStats = fn; }

// ===== Memo (subdivided) Rendering =====
const MEMO_FIELDS = [
  { key: 'intent', label: '選出意図' },
  { key: 'winLossReason', label: '勝因・敗因' },
  { key: 'playFlow', label: '立ち回り' },
  { key: 'improvement', label: '改善点' },
  { key: 'notes', label: '旧メモ' }
];

function buildMemoEntries(b) {
  return MEMO_FIELDS
    .map(f => ({ label: f.label, value: (b[f.key] || '').trim() }))
    .filter(e => e.value);
}

function formatMemoHtml(b) {
  const entries = buildMemoEntries(b);
  if (entries.length === 0) return '';
  return entries.map(e =>
    `<div class="memo-line"><span class="memo-label">${escapeHtml(e.label)}:</span> ${escapeHtml(e.value)}</div>`
  ).join('');
}

function formatMemoPlain(b) {
  return buildMemoEntries(b).map(e => `${e.label}: ${e.value}`).join('\n');
}

// ===== Pokemon Icon Rendering =====
export function renderPokeIconsHtml(list, highlightList, opts = {}) {
  if (!list || list.length === 0) return '<span style="color:var(--text-muted)">—</span>';
  const highlightSet = new Set(highlightList || []);
  const items = opts.items || {};
  const rowCls = opts.grid3 ? 'poke-icon-row poke-icon-row-3col' : 'poke-icon-row';
  return `<div class="${rowCls}">` +
    list.map(name => {
      const slug = getPokemonSlug(name);
      const isHighlight = highlightSet.has(name);
      const item = items[name] || items[MEGA_BASE[name]] || '';
      return `<div class="poke-icon-cell${isHighlight ? ' highlight' : ''}${item ? ' has-item' : ''}">
        <img src="${getSpriteUrl(slug || 'substitute')}" alt="${escapeHtml(name)}" loading="lazy">
        <span class="poke-tooltip">${escapeHtml(name)}${item ? '<br>@' + escapeHtml(item) : ''}</span>
        ${item ? `<span class="poke-item-tag">${escapeHtml(item)}</span>` : ''}
      </div>`;
    }).join('') +
    '</div>';
}

// ===== Mobile Cards =====
function renderBattleCardHtml(b, idx, total, resultInfo) {
  const info = resultInfo || {};
  const result = info.result;
  const delta = info.delta;
  const resultClass = result === '勝ち' ? 'win' : result === '負け' ? 'lose' : result === '引き分け' ? 'draw' : 'none';
  const resultLabel = result === '勝ち' ? 'W' : result === '負け' ? 'L' : result === '引き分け' ? 'D' : '—';
  const deltaStr = (delta !== null && delta !== undefined) ? ` ${formatDelta(delta)}` : '';
  const rateHtml = (b.rate !== undefined && b.rate !== null && b.rate !== '')
    ? `<span class="bc-rate">${escapeHtml(String(b.rate))}</span>` : '';
  const tagsHtml = (b.tags && b.tags.length > 0)
    ? b.tags.map(t => `<span class="tag-badge">${escapeHtml(t)}</span>`).join('') : '';
  const memoInner = formatMemoHtml(b);
  const notesHtml = memoInner ? `<div class="bc-notes" title="${escapeHtml(formatMemoPlain(b))}">${memoInner}</div>` : '';

  return `
  <div class="battle-card" data-id="${b.id}" style="animation-delay:${Math.min(idx * 30, 300)}ms">
    <div class="bc-header">
      <span class="bc-date">${formatDate(b.date)}</span>
      <span class="result-badge ${resultClass}">${resultLabel}${deltaStr}</span>
      ${rateHtml}
      <span class="bc-rule"><span class="rule-badge">${escapeHtml(b.rule || '—')}</span></span>
      <div class="bc-actions">
        <button class="btn-bookmark${b.bookmarked ? ' active' : ''}" data-action="bookmark" title="お気に入り">★</button>
        <button class="btn-icon edit" title="編集" data-action="edit">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="btn-icon delete" title="削除" data-action="delete">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>
    </div>
    <div class="bc-body">
      <div class="bc-side">
        <div class="bc-side-label">自分</div>
        <div class="bc-party">${renderPokeIconsHtml(b.myParty, b.mySelect, { items: b.myPartyItems })}</div>
        ${(b.mySelect && b.mySelect.length) ? `<div class="bc-select"><div class="bc-side-label">選出</div>${renderPokeIconsHtml(b.mySelect)}</div>` : ''}
      </div>
      <div class="bc-side">
        <div class="bc-side-label">相手</div>
        <div class="bc-party">${renderPokeIconsHtml(b.oppParty, b.oppSelect, { items: b.oppPartyItems })}</div>
        ${(b.oppSelect && b.oppSelect.length) ? `<div class="bc-select"><div class="bc-side-label">選出</div>${renderPokeIconsHtml(b.oppSelect)}</div>` : ''}
      </div>
    </div>
    ${(tagsHtml || notesHtml) ? `<div class="bc-footer">${tagsHtml}${notesHtml}</div>` : ''}
  </div>`;
}

function renderMobileCards(filtered, resultMap) {
  if (!$mobileCards) return;
  if (filtered.length === 0) {
    $mobileCards.innerHTML = '';
  } else {
    $mobileCards.innerHTML = filtered.map((b, i) => renderBattleCardHtml(b, i, filtered.length, resultMap[b.id])).join('');
  }
}

// ===== Main Table Rendering =====
export function renderTable() {
  const filtered = getFilteredBattles();
  const resultMap = buildResultMap(battles);

  if (filtered.length === 0) {
    $tableBody.innerHTML = '';
    $mobileCards.innerHTML = '';
    $emptyState.classList.add('visible');
  } else {
    $emptyState.classList.remove('visible');
    const isMobile = mobileQuery.matches;
    if (isMobile) {
      $tableBody.innerHTML = '';
      renderMobileCards(filtered, resultMap);
    } else {
      $mobileCards.innerHTML = '';
      $tableBody.innerHTML = filtered.map((b, i) => {
        const info = resultMap[b.id] || {};
        const result = info.result;
        const delta = info.delta;
        const cls = result === '勝ち' ? 'win' : result === '負け' ? 'lose' : result === '引き分け' ? 'draw' : 'none';
        const label = result === '勝ち' ? 'W' : result === '負け' ? 'L' : result === '引き分け' ? 'D' : '—';
        const deltaStr = (delta !== null && delta !== undefined) ? ` ${formatDelta(delta)}` : '';
        return `
        <tr data-id="${b.id}" style="animation-delay:${Math.min(i * 30, 300)}ms">
          <td class="cell-num">${filtered.length - i}</td>
          <td class="cell-date">${formatDate(b.date)}</td>
          <td class="cell-rule"><span class="rule-badge">${escapeHtml(b.rule || '—')}</span></td>
          <td class="cell-result">
            <span class="result-badge ${cls}">${label}${deltaStr}</span>
          </td>
          <td class="cell-rate">${(b.rate !== undefined && b.rate !== null && b.rate !== '') ? escapeHtml(String(b.rate)) : '<span style="color:var(--text-muted)">—</span>'}</td>
          <td>${renderPokeIconsHtml(b.myParty, b.mySelect, { grid3: true, items: b.myPartyItems })}</td>
          <td>${renderPokeIconsHtml(b.mySelect)}</td>
          <td>${renderPokeIconsHtml(b.oppParty, b.oppSelect, { grid3: true, items: b.oppPartyItems })}</td>
          <td>${renderPokeIconsHtml(b.oppSelect)}</td>
          <td class="cell-bookmark">
            <button class="btn-bookmark${b.bookmarked ? ' active' : ''}" data-action="bookmark" title="お気に入り">★</button>
          </td>
          <td class="cell-tags">${(b.tags && b.tags.length > 0) ? b.tags.map(t => `<span class="tag-badge">${escapeHtml(t)}</span>`).join('') : '<span style="color:var(--text-muted)">—</span>'}</td>
          <td class="cell-notes" title="${escapeHtml(formatMemoPlain(b))}">${formatMemoHtml(b) || '<span style="color:var(--text-muted)">—</span>'}</td>
          <td>
            <div class="cell-actions">
              <button class="btn-icon edit" title="編集" data-action="edit">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <button class="btn-icon delete" title="削除" data-action="delete">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
            </div>
          </td>
        </tr>
      `}).join('');
    }
  }

  updateStats(filtered, resultMap);
  buildTagFilterOptions();
  setStatsDirty(true);
  if (isStatsTabActive() && _renderAllStats) _renderAllStats();
}

export function isStatsTabActive() {
  return document.querySelector('.tab-btn[data-tab="stats"]').classList.contains('active');
}

export function updateStats(filtered, resultMap) {
  const all = filtered || getFilteredBattles();
  const map = resultMap || buildResultMap(battles);
  let wins = 0, losses = 0;
  for (const b of all) {
    const r = (map[b.id] || {}).result;
    if (r === '勝ち') wins++;
    else if (r === '負け') losses++;
  }
  const total = wins + losses;
  const rate = total > 0 ? Math.round((wins / total) * 100) : 0;

  $statWins.textContent = wins;
  $statLosses.textContent = losses;
  $statRate.textContent = total > 0 ? `${rate}%` : '—%';
}
