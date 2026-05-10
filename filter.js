// ===== Filtering Module =====
import { battles, sortDirection, RULE_SEASONS } from './state.js';
import { ensureRuleOption, buildResultMap } from './utils.js';

const $filterRule = document.getElementById('filter-rule');
const $filterSeason = document.getElementById('filter-season');
const $filterResult = document.getElementById('filter-result');
const $filterPeriod = document.getElementById('filter-period');
const $statsPartySelect = document.getElementById('stats-party-select');

export { $filterRule, $filterSeason, $filterResult, $filterPeriod, $statsPartySelect };

// Build season filter options from union of RULE_SEASONS values + values seen in records.
export function buildSeasonFilterOptions() {
  if (!$filterSeason) return;
  const seen = new Set();
  Object.values(RULE_SEASONS).forEach(arr => arr.forEach(s => seen.add(s)));
  battles.forEach(b => { if (b.season) seen.add(b.season); });
  const prev = $filterSeason.value;
  $filterSeason.innerHTML = '<option value="">全シーズン</option>';
  [...seen].sort().forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    $filterSeason.appendChild(opt);
  });
  // Restore previous value only if still in the new option set; else fall back to "" (全シーズン).
  if (prev && seen.has(prev)) {
    $filterSeason.value = prev;
  } else {
    $filterSeason.value = '';
  }
}

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
  if (period === '今週') {
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const dow = today.getDay();
    const offsetToMonday = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(today);
    monday.setDate(today.getDate() + offsetToMonday);
    const nextMonday = new Date(monday);
    nextMonday.setDate(monday.getDate() + 7);
    return list.filter(b => {
      const d = new Date(b.date);
      return d >= monday && d < nextMonday;
    });
  }
  return list;
}

// ===== Filtering =====
export function getFilteredBattles() {
  let filtered = [...battles];
  const ruleFilter = $filterRule.value;
  const seasonFilter = $filterSeason ? $filterSeason.value : '';
  const resultFilter = $filterResult.value;

  if (ruleFilter) filtered = filtered.filter(b => b.rule === ruleFilter);
  if (seasonFilter) filtered = filtered.filter(b => b.season === seasonFilter);
  if (resultFilter) {
    const map = buildResultMap(battles);
    filtered = filtered.filter(b => (map[b.id] && map[b.id].result) === resultFilter);
  }
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
  if ($filterSeason && $filterSeason.value) params.set('season', $filterSeason.value);
  if ($filterResult.value) params.set('result', $filterResult.value);
  if ($filterPeriod.value) params.set('period', $filterPeriod.value);
  const hash = params.toString();
  history.replaceState(null, '', hash ? '#' + hash : location.pathname + location.search);
}

export function restoreFiltersFromHash() {
  if (!location.hash) return;
  const params = new URLSearchParams(location.hash.slice(1));
  if (params.has('rule')) { ensureRuleOption($filterRule, params.get('rule')); $filterRule.value = params.get('rule'); }
  if (params.has('season') && $filterSeason) $filterSeason.value = params.get('season');
  if (params.has('result')) $filterResult.value = params.get('result');
  if (params.has('period')) $filterPeriod.value = params.get('period');
}
