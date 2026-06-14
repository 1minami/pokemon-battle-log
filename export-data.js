// ===== Export Data Module =====
// CSV エクスポート用の純粋な集計関数群。
// stats.js の集計ロジックを流用するが、DOM 描画と分離し、画面表示の MIN_BATTLES 閾値は適用しない。
import { buildResultMap, normalizePoke, getLastRateForGroup } from './utils.js';
import { loadTournaments } from './state.js';

function tournamentNameOf(id) {
  if (!id) return '';
  const all = loadTournaments();
  const t = all.find(x => x.id === id);
  return t ? t.name : '';
}

// ===== 対戦明細の列定義 =====
// key: 内部識別子（localStorage 永続化に使用） / label: CSVヘッダ / value: (b, ctx) => 文字列
export const DETAIL_COLUMNS = [
  { key: 'date',      label: '日付',          value: (b) => b.date || '' },
  { key: 'rule',      label: 'ルール',        value: (b) => b.rule || '' },
  { key: 'season',    label: 'シーズン',      value: (b) => b.season || '' },
  { key: 'tournament', label: '大会',          value: (b) => tournamentNameOf(b.tournament) },
  { key: 'result',    label: '結果',          value: (b, ctx) => ctx.info.result || '' },
  { key: 'rate',      label: 'レート',        value: (b) => (b.rate !== undefined && b.rate !== null && b.rate !== '') ? String(b.rate) : '' },
  { key: 'delta',     label: 'レート差',      value: (b, ctx) => (ctx.info.delta !== null && ctx.info.delta !== undefined) ? ctx.formatDelta(ctx.info.delta) : '' },
  { key: 'myParty',   label: '自分のパーティ', value: (b) => (b.myParty || []).join('/') },
  { key: 'myItems',   label: '自分の持ち物',   value: (b) => (b.myParty || []).map(p => (b.myPartyItems || {})[p] || '').join('/') },
  { key: 'mySelect',  label: '選出',          value: (b) => (b.mySelect || []).join('/') },
  { key: 'oppParty',  label: '相手のパーティ', value: (b) => (b.oppParty || []).join('/') },
  { key: 'oppItems',  label: '相手の持ち物',   value: (b) => (b.oppParty || []).map(p => (b.oppPartyItems || {})[p] || '').join('/') },
  { key: 'oppSelect', label: '相手選出',      value: (b) => (b.oppSelect || []).join('/') },
  { key: 'bookmark',  label: 'お気に入り',     value: (b) => b.bookmarked ? '★' : '' },
  { key: 'tags',      label: 'タグ',          value: (b) => (b.tags || []).join('/') },
  { key: 'intent',    label: '選出意図',      value: (b) => b.intent || '' },
  { key: 'winLoss',   label: '勝因・敗因',     value: (b) => b.winLossReason || '' },
  { key: 'playFlow',  label: '立ち回り・分岐点', value: (b) => b.playFlow || '' },
  { key: 'improve',   label: '改善点・TODO',   value: (b) => b.improvement || '' },
  { key: 'notes',     label: '旧メモ',        value: (b) => b.notes || '' },
];

// ===== 範囲フィルタ =====
// rule/season は完全一致（'' は無条件）。dateFrom/dateTo は 'YYYY-MM-DD' 文字列比較（両端含む）。
// 日付指定がある場合、date 空の対戦は除外。
export function filterByRange(list, { rule = '', season = '', tournament = '', dateFrom = '', dateTo = '' } = {}) {
  return list.filter(b => {
    if (rule && b.rule !== rule) return false;
    if (season && b.season !== season) return false;
    if (tournament && b.tournament !== tournament) return false;
    if (dateFrom || dateTo) {
      if (!b.date) return false;
      if (dateFrom && b.date < dateFrom) return false;
      if (dateTo && b.date > dateTo) return false;
    }
    return true;
  });
}

// ===== 対戦明細 =====
// allBattles: レート差・結果の算出に全件が必要（buildResultMap はグループ内の前レートを参照するため）
export function buildDetailRows(list, allBattles, selectedKeys, formatDelta) {
  const cols = DETAIL_COLUMNS.filter(c => selectedKeys.includes(c.key));
  const resultMap = buildResultMap(allBattles);
  const headers = cols.map(c => c.label);
  const rows = list.map(b => {
    const ctx = { info: resultMap[b.id] || {}, formatDelta };
    return cols.map(c => c.value(b, ctx));
  });
  return { headers, rows };
}

// ===== ポケ別勝率（自分選出基準、勝敗確定のみ） =====
export function aggregatePokeStats(list, allBattles) {
  const resultMap = buildResultMap(allBattles);
  const stats = {};
  list.forEach(b => {
    const r = (resultMap[b.id] || {}).result;
    if (r !== '勝ち' && r !== '負け') return;
    const seen = new Set();
    (b.mySelect || []).forEach(poke => {
      const name = normalizePoke(poke);
      if (seen.has(name)) return;
      seen.add(name);
      if (!stats[name]) stats[name] = { name, wins: 0, losses: 0, total: 0 };
      stats[name].total++;
      if (r === '勝ち') stats[name].wins++; else stats[name].losses++;
    });
  });
  const sorted = Object.values(stats).sort((a, b) => b.total - a.total);
  const headers = ['ポケモン', '選出回数', '勝ち', '負け', '勝率%'];
  const rows = sorted.map(s => [s.name, s.total, s.wins, s.losses, winPct(s.wins, s.losses)]);
  return { headers, rows };
}

// ===== コンボ別勝率（自分/相手 × ペア/トリオ、勝敗確定のみ、閾値なし） =====
function getCombinations(arr, size) {
  const results = [];
  (function combo(start, current) {
    if (current.length === size) { results.push([...current]); return; }
    for (let i = start; i < arr.length; i++) { current.push(arr[i]); combo(i + 1, current); current.pop(); }
  })(0, []);
  return results;
}

function comboStatsFor(list, allBattles, side, size) {
  const resultMap = buildResultMap(allBattles);
  const stats = {};
  list.forEach(b => {
    const r = (resultMap[b.id] || {}).result;
    if (r !== '勝ち' && r !== '負け') return;
    const selRaw = (side === 'my' ? (b.mySelect || []) : (b.oppSelect || [])).map(normalizePoke);
    const sel = [];
    const seen = new Set();
    selRaw.forEach(n => { if (!seen.has(n)) { seen.add(n); sel.push(n); } });
    if (sel.length < size) return;
    getCombinations(sel, size).forEach(combo => {
      const names = [...combo].sort();
      const key = names.join('+');
      if (!stats[key]) stats[key] = { names, count: 0, wins: 0, losses: 0 };
      stats[key].count++;
      if (r === '勝ち') stats[key].wins++; else stats[key].losses++;
    });
  });
  return Object.values(stats).sort((a, b) => b.count - a.count);
}

export function aggregateCombos(list, allBattles) {
  const headers = ['種別', '組み合わせ', '試行数', '勝ち', '負け', '勝率%'];
  const sections = [
    ['自分ペア', 'my', 2], ['自分トリオ', 'my', 3],
    ['相手ペア', 'opp', 2], ['相手トリオ', 'opp', 3],
  ];
  const rows = [];
  sections.forEach(([label, side, size]) => {
    comboStatsFor(list, allBattles, side, size).forEach(c => {
      rows.push([label, c.names.join('+'), c.count, c.wins, c.losses, winPct(c.wins, c.losses)]);
    });
  });
  return { headers, rows };
}

// ===== 相性マトリクス（自分選出 × 相手パーティ、ロング形式、勝敗確定のみ、閾値なし） =====
export function aggregateMatchup(list, allBattles) {
  const resultMap = buildResultMap(allBattles);
  const matchups = {}; // "my|opp" -> { my, opp, wins, losses, total }
  list.forEach(b => {
    const r = (resultMap[b.id] || {}).result;
    if (r !== '勝ち' && r !== '負け') return;
    const isWin = r === '勝ち';
    const mySelect = [...new Set((b.mySelect || []).map(normalizePoke))];
    const oppAxis = [...new Set((b.oppParty || []).map(normalizePoke))];
    mySelect.forEach(my => {
      oppAxis.forEach(opp => {
        const key = `${my}|${opp}`;
        if (!matchups[key]) matchups[key] = { my, opp, wins: 0, losses: 0, total: 0 };
        matchups[key].total++;
        if (isWin) matchups[key].wins++; else matchups[key].losses++;
      });
    });
  });
  const sorted = Object.values(matchups).sort((a, b) => b.total - a.total);
  const headers = ['自分ポケモン', '相手ポケモン', '試行数', '勝ち', '負け', '勝率%', '補正勝率%'];
  const rows = sorted.map(m => [m.my, m.opp, m.total, m.wins, m.losses, winPct(m.wins, m.losses), Math.round(((m.wins + 2) / (m.total + 4)) * 100)]);
  return { headers, rows };
}

// ===== 期間サマリ（ルール×シーズン別） =====
export function aggregatePeriodSummary(list, allBattles) {
  const resultMap = buildResultMap(allBattles);
  const groups = {}; // "rule|season|tournament" -> { rule, season, tournament, total, wins, losses, draws }
  list.forEach(b => {
    const key = `${b.rule || ''}|${b.season || ''}|${b.tournament || ''}`;
    if (!groups[key]) groups[key] = { rule: b.rule || '', season: b.season || '', tournament: b.tournament || '', total: 0, wins: 0, losses: 0, draws: 0 };
    const g = groups[key];
    g.total++;
    const r = (resultMap[b.id] || {}).result;
    if (r === '勝ち') g.wins++;
    else if (r === '負け') g.losses++;
    else if (r === '引き分け') g.draws++;
  });
  const sorted = Object.values(groups).sort((a, b) => {
    if (a.rule !== b.rule) return a.rule < b.rule ? -1 : 1;
    if (a.season !== b.season) return a.season < b.season ? -1 : 1;
    return a.tournament < b.tournament ? -1 : a.tournament > b.tournament ? 1 : 0;
  });
  const headers = ['ルール', 'シーズン', '大会', '総戦数', '勝ち', '負け', '引分', '勝率%', '最終レート'];
  const rows = sorted.map(g => {
    const lastRate = getLastRateForGroup(allBattles, g.rule, g.season, g.tournament);
    return [g.rule, g.season, tournamentNameOf(g.tournament), g.total, g.wins, g.losses, g.draws, winPct(g.wins, g.losses), lastRate !== null && lastRate !== undefined ? String(lastRate) : ''];
  });
  return { headers, rows };
}

function winPct(wins, losses) {
  const decided = wins + losses;
  return decided > 0 ? Math.round((wins / decided) * 100) : 0;
}
