// ===== Filtering Module =====
import { battles, sortDirection, RULE_SEASONS, loadTournaments } from './state.js';
import { ensureRuleOption, buildResultMap } from './utils.js';

const $filterRule = document.getElementById('filter-rule');
const $filterSeason = document.getElementById('filter-season');
const $filterTournament = document.getElementById('filter-tournament');
const $filterResult = document.getElementById('filter-result');
const $filterPeriod = document.getElementById('filter-period');
const $filterTag = document.getElementById('filter-tag');
const $statsPartySelect = document.getElementById('stats-party-select');

export { $filterRule, $filterSeason, $filterTournament, $filterResult, $filterPeriod, $filterTag, $statsPartySelect };

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

// Build tournament filter options. Filters by current rule/season selection.
export function buildTournamentFilterOptions() {
  if (!$filterTournament) return;
  const rule = $filterRule ? $filterRule.value : '';
  const season = $filterSeason ? $filterSeason.value : '';
  const all = loadTournaments();
  const visible = all.filter(t => (!rule || t.rule === rule) && (!season || t.season === season));
  const prev = $filterTournament.value;
  $filterTournament.innerHTML = '<option value="">全大会</option>';
  visible.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name;
    $filterTournament.appendChild(opt);
  });
  if (prev && visible.some(t => t.id === prev)) {
    $filterTournament.value = prev;
  } else {
    $filterTournament.value = '';
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

// ===== Tag Filter Options =====
export function buildTagFilterOptions() {
  if (!$filterTag) return;
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
  const seasonFilter = $filterSeason ? $filterSeason.value : '';
  const tournamentFilter = $filterTournament ? $filterTournament.value : '';
  const resultFilter = $filterResult.value;
  const tagFilter = $filterTag ? $filterTag.value : '';

  if (ruleFilter) filtered = filtered.filter(b => b.rule === ruleFilter);
  if (seasonFilter) filtered = filtered.filter(b => b.season === seasonFilter);
  if (tournamentFilter) filtered = filtered.filter(b => b.tournament === tournamentFilter);
  if (resultFilter) {
    const map = buildResultMap(battles);
    filtered = filtered.filter(b => (map[b.id] && map[b.id].result) === resultFilter);
  }
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
  let filtered = getFilteredBattles();
  const pokeName = $statsPartySelect.value;
  if (pokeName) filtered = filtered.filter(b => (b.myParty || []).includes(pokeName));
  return filtered;
}

// ===== Filter ↔ URL Hash =====
export function saveFiltersToHash() {
  const params = new URLSearchParams();
  if ($filterRule.value) params.set('rule', $filterRule.value);
  if ($filterSeason && $filterSeason.value) params.set('season', $filterSeason.value);
  if ($filterTournament && $filterTournament.value) params.set('tournament', $filterTournament.value);
  if ($filterResult.value) params.set('result', $filterResult.value);
  if ($filterPeriod.value) params.set('period', $filterPeriod.value);
  if ($filterTag && $filterTag.value) params.set('tag', $filterTag.value);
  const hash = params.toString();
  history.replaceState(null, '', hash ? '#' + hash : location.pathname + location.search);
}

export function restoreFiltersFromHash() {
  if (!location.hash) return;
  const params = new URLSearchParams(location.hash.slice(1));
  if (params.has('rule')) { ensureRuleOption($filterRule, params.get('rule')); $filterRule.value = params.get('rule'); }
  if (params.has('season') && $filterSeason) $filterSeason.value = params.get('season');
  if (params.has('tournament') && $filterTournament) $filterTournament.value = params.get('tournament');
  if (params.has('result')) $filterResult.value = params.get('result');
  if (params.has('period')) $filterPeriod.value = params.get('period');
  if (params.has('tag') && $filterTag) $filterTag.value = params.get('tag');
}
