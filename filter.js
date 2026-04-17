// ===== Filtering Module =====
import { battles, sortDirection } from './state.js';
import { ensureRuleOption } from './utils.js';

const $filterRule = document.getElementById('filter-rule');
const $filterResult = document.getElementById('filter-result');
const $filterPeriod = document.getElementById('filter-period');
const $filterTag = document.getElementById('filter-tag');
const $statsPartySelect = document.getElementById('stats-party-select');

export { $filterRule, $filterResult, $filterPeriod, $filterTag, $statsPartySelect };

// ===== Period Filter =====
export function filterByPeriod(list) {
  const period = $filterPeriod.value;
  if (!period) return list;

  const now = new Date();
  if (period === '今月') {
    const year = now.getFullYear();
    const month = now.getMonth();
    return list.filter(b => {
      const d = new Date(b.date);
      return d.getFullYear() === year && d.getMonth() === month;
    });
  }
  return list;
}

// ===== Tag Filter Options =====
export function buildTagFilterOptions() {
  const tagSet = new Set();
  battles.forEach(b => (b.tags || []).forEach(t => tagSet.add(t)));
  const prev = $filterTag.value;
  $filterTag.innerHTML = '<option value="">全タグ</option>';
  [...tagSet].sort().forEach(tag => {
    const opt = document.createElement('option');
    opt.value = tag;
    opt.textContent = tag;
    $filterTag.appendChild(opt);
  });
  $filterTag.value = prev;
}

// ===== Filtering =====
export function getFilteredBattles() {
  let filtered = [...battles];
  const ruleFilter = $filterRule.value;
  const resultFilter = $filterResult.value;
  const tagFilter = $filterTag.value;

  if (ruleFilter) filtered = filtered.filter(b => b.rule === ruleFilter);
  if (resultFilter) filtered = filtered.filter(b => b.result === resultFilter);
  if (tagFilter) filtered = filtered.filter(b => (b.tags || []).includes(tagFilter));
  filtered = filterByPeriod(filtered);

  filtered.sort((a, b) => {
    const da = new Date(a.date);
    const db = new Date(b.date);
    const dateCmp = da - db;
    const cmp = dateCmp !== 0 ? dateCmp : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    return sortDirection === 'desc' ? -cmp : cmp;
  });

  return filtered;
}

export function getStatsFilteredBattles() {
  const pokeName = $statsPartySelect.value;
  let filtered = filterByPeriod(battles);
  if (pokeName) filtered = filtered.filter(b => (b.myParty || []).includes(pokeName));
  return filtered;
}

// ===== Filter ↔ URL Hash =====
export function saveFiltersToHash() {
  const params = new URLSearchParams();
  if ($filterRule.value) params.set('rule', $filterRule.value);
  if ($filterResult.value) params.set('result', $filterResult.value);
  if ($filterPeriod.value) params.set('period', $filterPeriod.value);
  if ($filterTag.value) params.set('tag', $filterTag.value);
  const hash = params.toString();
  history.replaceState(null, '', hash ? '#' + hash : location.pathname + location.search);
}

export function restoreFiltersFromHash() {
  if (!location.hash) return;
  const params = new URLSearchParams(location.hash.slice(1));
  if (params.has('rule')) { ensureRuleOption($filterRule, params.get('rule')); $filterRule.value = params.get('rule'); }
  if (params.has('result')) $filterResult.value = params.get('result');
  if (params.has('period')) $filterPeriod.value = params.get('period');
  if (params.has('tag')) $filterTag.value = params.get('tag');
}
