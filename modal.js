// ===== Modal & CRUD Module =====
import {
  battles, setBattles, formState, resetFormState, saveBattlesData,
  deleteTargetId, setDeleteTargetId, editingPartyIdx, setEditingPartyIdx,
  loadPresets, savePresetsData, normalizeMegaInBattle, normalizeMegaInPreset,
  RULE_SEASONS, defaultSeasonForRule,
  loadTournaments, saveTournamentsData, tournaments, setTournaments
} from './state.js';
import { generateId, escapeHtml, getPokemonSlug, showToast, todayStr, ensureRuleOption, buildResultMap, formatDelta, formatDate, getLastRateForGroup, getLastSeasonForRule } from './utils.js';
import { renderTable, renderPokeIconsHtml } from './render.js';
import { renderPickerSlots, renderSelectFromParty, updateDependentSelections, setPartyModalRefs, setOnOppPartyChange, setOnPartyEditMyPartyChange,
  $pickerMyParty, $selectMySelect, $pickerOppParty, $selectOppSelect } from './picker.js';
import { getSpriteUrl, MEGA_BASE } from './pokemon-data.js';
import {
  DETAIL_COLUMNS, filterByRange, buildDetailRows,
  aggregatePokeStats, aggregateCombos, aggregateMatchup, aggregatePeriodSummary
} from './export-data.js';

// ===== DOM References =====
const $modalOverlay = document.getElementById('modal-overlay');
const $deleteOverlay = document.getElementById('delete-overlay');
const $importOverlay = document.getElementById('import-overlay');
const $form = document.getElementById('battle-form');
const $formId = document.getElementById('form-id');
const $formDate = document.getElementById('form-date');
const $formRule = document.getElementById('form-rule');
const $formSeason = document.getElementById('form-season');
const $formTournament = document.getElementById('form-tournament');
const $formRate = document.getElementById('form-rate');
const $formNotes = document.getElementById('form-notes');
const $formIntent = document.getElementById('form-intent');
const $formWinLossReason = document.getElementById('form-win-loss-reason');
const $formPlayFlow = document.getElementById('form-play-flow');
const $formImprovement = document.getElementById('form-improvement');
const $legacyNotesBlock = document.getElementById('legacy-notes-block');
const $modalTitle = document.getElementById('modal-title');
const $importMessage = document.getElementById('import-message');
const $jsonFileInput = document.getElementById('json-file-input');
const $presetSelect = document.getElementById('preset-select');
const $sidePanelContent = document.getElementById('side-panel-content');

// Party tab DOM
const $partiesGrid = document.getElementById('parties-grid');
const $partiesEmpty = document.getElementById('parties-empty');
const $partyModalOverlay = document.getElementById('party-modal-overlay');
const $partyModalTitle = document.getElementById('party-modal-title');
const $partyForm = document.getElementById('party-form');
const $partyFormName = document.getElementById('party-form-name');
const $partyFormNotes = document.getElementById('party-form-notes');
const $pickerPartyEdit = document.getElementById('picker-party-edit');
const $selectionPatternList = document.getElementById('selection-pattern-list');
const $btnAddSelectionPattern = document.getElementById('btn-add-selection-pattern');
const SELECTION_PATTERN_MAX_ROWS = 3;
const SELECTION_PATTERN_PICKS = 3;

export {
  $modalOverlay, $deleteOverlay, $importOverlay, $form, $formId, $formDate, $formRule,
  $formSeason, $formTournament, $formRate, $formNotes, $formIntent, $formWinLossReason, $formPlayFlow,
  $formImprovement, $jsonFileInput, $presetSelect,
  $partyModalOverlay, $partyForm, $partyFormName, $partyFormNotes
};

// Rebuild season options from current rule. Always include blank as first option.
// keepValue: try to preserve current selection if still valid; otherwise default.
export function rebuildSeasonOptions(keepValue = null) {
  const rule = $formRule.value;
  const seasons = RULE_SEASONS[rule] || [];
  const opts = ['<option value="">—</option>']
    .concat(seasons.map(s => `<option value="${s}">${s}</option>`));
  $formSeason.innerHTML = opts.join('');
  if (keepValue !== null && keepValue !== undefined) {
    if (keepValue === '' || seasons.includes(keepValue)) {
      $formSeason.value = keepValue;
      return;
    }
  }
  // default for new entry: first season if rule has any
  $formSeason.value = seasons.length > 0 ? seasons[0] : '';
}

// Apply tournament's fixed party preset to form. Locks party picker UI.
// If editing (formId set), only refresh lock state — don't overwrite existing values.
export function applyTournamentParty(tournamentId, { overwrite = false } = {}) {
  const $picker = document.getElementById('picker-my-party');
  const $items = document.getElementById('items-my-party');
  const setLocked = (locked) => {
    [$picker, $items].forEach(el => {
      if (!el) return;
      el.classList.toggle('locked', locked);
    });
  };
  if (!tournamentId) {
    setLocked(false);
    return;
  }
  const all = loadTournaments();
  const t = all.find(x => x.id === tournamentId);
  if (!t || !t.partyPresetName) {
    setLocked(false);
    return;
  }
  const presets = loadPresets();
  const preset = presets.find(p => p.name === t.partyPresetName);
  if (!preset) {
    setLocked(false);
    showToast(`大会「${t.name}」の固定パーティ「${t.partyPresetName}」が見つかりません`, 'warn');
    return;
  }
  if (overwrite) {
    formState.myParty = [...(preset.party || [])];
    formState.myPartyItems = { ...(preset.items || {}) };
    formState.mySelect = (formState.mySelect || []).filter(n => formState.myParty.includes(n));
    renderPickerSlots($pickerMyParty, 'myParty', 8);
    renderSelectFromParty($selectMySelect, 'mySelect', 'myParty', 4);
  }
  setLocked(true);
}

// Rebuild tournament options for the currently selected (rule, season).
// keepValue: tournament id to preserve if still valid.
export function rebuildTournamentOptions(keepValue = null) {
  if (!$formTournament) return;
  const rule = $formRule.value;
  const season = $formSeason.value;
  const all = loadTournaments();
  const matches = all.filter(t => (!rule || t.rule === rule) && (!season || t.season === season));
  const opts = ['<option value="">— 大会なし —</option>']
    .concat(matches.map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`));
  $formTournament.innerHTML = opts.join('');
  if (keepValue && matches.some(t => t.id === keepValue)) {
    $formTournament.value = keepValue;
  } else {
    $formTournament.value = '';
  }
}

// Register side panel refresh callback for opp party changes
setOnOppPartyChange(() => renderSidePanel());

// Wire up the party modal refs to picker module
setPartyModalRefs($partyModalOverlay, $pickerPartyEdit);

// When myParty changes inside party-edit modal, refresh selection patterns and prune missing picks
setOnPartyEditMyPartyChange(() => {
  const partySet = new Set(formState.myParty);
  formState.selectionPatterns.forEach(row => {
    row.picks = row.picks.filter(name => partySet.has(name));
  });
  renderSelectionPatterns();
});

// ===== Import State =====
let importData = null;
let importPresets = null;
let importTournaments = null;

// ===== Preset UI =====
export function renderPresetOptions() {
  const presets = loadPresets();
  $presetSelect.innerHTML = '<option value="">選択してください</option>';
  presets.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `${p.name} (${p.party.length}体)`;
    $presetSelect.appendChild(opt);
  });
}

// ===== Battle Modal =====
export function openModal(editing = false) {
  $modalTitle.textContent = editing ? '対戦記録を編集' : '対戦記録を追加';
  $modalOverlay.classList.add('active');
  if (!editing) {
    $formDate.value = todayStr();
  }
  // rebuild season options based on current rule, preserve current value if compatible
  rebuildSeasonOptions($formSeason.value);
  rebuildTournamentOptions($formTournament ? $formTournament.value : null);
  renderPresetOptions();
  renderPickerSlots($pickerMyParty, 'myParty', 8);
  renderSelectFromParty($selectMySelect, 'mySelect', 'myParty', 4);
  renderPickerSlots($pickerOppParty, 'oppParty', 6);
  renderSelectFromParty($selectOppSelect, 'oppSelect', 'oppParty', 4);
  // Apply tournament fixed party lock state (no overwrite — editBattle/duplicate already set values)
  applyTournamentParty($formTournament ? $formTournament.value : '', { overwrite: false });
  renderSidePanel();
}

// ===== Side Panel: Past battles vs similar matchup (both sides) =====
const SIDE_OVERLAP_THRESHOLD = 4;

function countOverlap(arr, currentSet) {
  let n = 0;
  const seen = new Set();
  (arr || []).map(x => MEGA_BASE[x] || x).forEach(name => {
    if (!seen.has(name) && currentSet.has(name)) { n++; seen.add(name); }
  });
  return n;
}

export function renderSidePanel() {
  if (!$sidePanelContent) return;
  const hasOpp = formState.oppParty && formState.oppParty.length > 0;
  const hasMy = formState.myParty && formState.myParty.length > 0;
  if (!hasOpp && !hasMy) {
    $sidePanelContent.innerHTML = '<p class="side-panel-hint">自分と相手のパーティを入力すると似た構成同士の過去対戦が表示されます</p>';
    return;
  }
  if (!hasOpp || !hasMy) {
    $sidePanelContent.innerHTML = `<p class="side-panel-hint">${hasOpp ? '自分' : '相手'}のパーティも入力すると過去対戦が表示されます（両方で${SIDE_OVERLAP_THRESHOLD}体以上一致する対戦を抽出）</p>`;
    return;
  }

  const oppSet = new Set(formState.oppParty.map(n => MEGA_BASE[n] || n));
  const mySet = new Set(formState.myParty.map(n => MEGA_BASE[n] || n));
  const editingId = $formId.value || null;

  const matched = battles
    .filter(b => b.id !== editingId)
    .map(b => ({
      b,
      oppOverlap: countOverlap(b.oppParty, oppSet),
      myOverlap: countOverlap(b.myParty, mySet)
    }))
    .filter(x => x.oppOverlap >= SIDE_OVERLAP_THRESHOLD && x.myOverlap >= SIDE_OVERLAP_THRESHOLD);

  if (matched.length === 0) {
    $sidePanelContent.innerHTML = `<p class="side-panel-hint">自分と相手の両方で${SIDE_OVERLAP_THRESHOLD}体以上一致する過去対戦はありません</p>`;
    return;
  }
  const resultMap = buildResultMap(battles);
  let wins = 0, losses = 0, draws = 0;
  matched.forEach(({ b }) => {
    const r = (resultMap[b.id] || {}).result;
    if (r === '勝ち') wins++;
    else if (r === '負け') losses++;
    else if (r === '引き分け') draws++;
  });
  const decided = wins + losses;
  const rate = decided > 0 ? Math.round((wins / decided) * 100) : null;

  matched.sort((x, y) => {
    const sumY = y.myOverlap + y.oppOverlap;
    const sumX = x.myOverlap + x.oppOverlap;
    if (sumY !== sumX) return sumY - sumX;
    const da = new Date(x.b.date), db = new Date(y.b.date);
    const c = db - da;
    return c !== 0 ? c : (x.b.id < y.b.id ? 1 : -1);
  });

  const summaryHtml = `<div class="side-panel-summary">
    <span class="sps-wins">${wins}W</span>
    <span class="sps-losses">${losses}L</span>
    ${draws > 0 ? `<span class="sps-draws">${draws}D</span>` : ''}
    ${rate !== null ? `<span class="sps-rate">${rate}%</span>` : ''}
    <span class="sps-total">/ ${matched.length}戦 (自他${SIDE_OVERLAP_THRESHOLD}体以上一致)</span>
  </div>`;

  const overlapClass = (n) => n >= 6 ? 'full' : n >= 5 ? 'high' : 'mid';

  const itemsHtml = matched.map(({ b, oppOverlap, myOverlap }) => {
    const info = resultMap[b.id] || {};
    const r = info.result;
    const delta = info.delta;
    const cls = r === '勝ち' ? 'win' : r === '負け' ? 'lose' : r === '引き分け' ? 'draw' : 'none';
    const label = r === '勝ち' ? 'W' : r === '負け' ? 'L' : r === '引き分け' ? 'D' : '—';
    const deltaStr = (delta !== null && delta !== undefined) ? ` ${formatDelta(delta)}` : '';
    const rateStr = (b.rate !== undefined && b.rate !== null && b.rate !== '') ? escapeHtml(String(b.rate)) : '—';
    const myPartyHtml = (b.myParty && b.myParty.length)
      ? renderPokeIconsHtml(b.myParty, b.mySelect) : '';
    const oppPartyHtml = (b.oppParty && b.oppParty.length)
      ? renderPokeIconsHtml(b.oppParty, b.oppSelect) : '';
    const mySelectHtml = (b.mySelect && b.mySelect.length)
      ? renderPokeIconsHtml(b.mySelect) : '<span class="side-panel-muted">選出なし</span>';
    const oppSelectHtml = (b.oppSelect && b.oppSelect.length)
      ? renderPokeIconsHtml(b.oppSelect) : '';
    return `<div class="side-panel-item">
      <div class="spi-header">
        <span class="spi-date">${formatDate(b.date)}</span>
        <span class="result-badge ${cls}">${label}${deltaStr}</span>
        <span class="spi-overlap ${overlapClass(myOverlap)}" title="自分のパーティ一致">自${myOverlap}</span>
        <span class="spi-overlap ${overlapClass(oppOverlap)}" title="相手のパーティ一致">相${oppOverlap}</span>
        <span class="spi-rate">${rateStr}</span>
      </div>
      <div class="spi-body">
        ${myPartyHtml ? `<div class="spi-row"><span class="spi-label">自分</span>${myPartyHtml}</div>` : ''}
        ${oppPartyHtml ? `<div class="spi-row"><span class="spi-label">相手</span>${oppPartyHtml}</div>` : ''}
        <div class="spi-row"><span class="spi-label">自選出</span>${mySelectHtml}</div>
        ${oppSelectHtml ? `<div class="spi-row"><span class="spi-label">相手選出</span>${oppSelectHtml}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  $sidePanelContent.innerHTML = summaryHtml + itemsHtml;
}

export function closeModal() {
  $modalOverlay.classList.remove('active');
  $form.reset();
  $formId.value = '';
  $formNotes.value = '';
  $legacyNotesBlock.style.display = 'none';
  resetFormState();
}

export function openDeleteConfirm() {
  $deleteOverlay.classList.add('active');
}

export function closeDeleteConfirm() {
  $deleteOverlay.classList.remove('active');
  setDeleteTargetId(null);
}

// ===== CRUD =====
export function saveBattle(data) {
  if (data.id) {
    const idx = battles.findIndex(b => b.id === data.id);
    if (idx !== -1) battles[idx] = { ...battles[idx], ...data };
  } else {
    data.id = generateId();
    battles.push(data);
  }
  saveBattlesData(battles);
  renderTable();
}

export function toggleBookmark(id) {
  const battle = battles.find(b => b.id === id);
  if (!battle) return;
  battle.bookmarked = !battle.bookmarked;
  saveBattlesData(battles);
  renderTable();
}

export function editBattle(id) {
  const battle = battles.find(b => b.id === id);
  if (!battle) return;

  $formId.value = battle.id;
  $formDate.value = battle.date || '';
  ensureRuleOption($formRule, battle.rule);
  $formRule.value = battle.rule || '';
  $formSeason.value = battle.season || '';
  rebuildTournamentOptions(battle.tournament || '');
  if ($formTournament) $formTournament.value = battle.tournament || '';
  $formRate.value = (battle.rate !== undefined && battle.rate !== null) ? battle.rate : '';
  $formIntent.value = battle.intent || '';
  $formWinLossReason.value = battle.winLossReason || '';
  $formPlayFlow.value = battle.playFlow || '';
  $formImprovement.value = battle.improvement || '';
  if (battle.notes) {
    $formNotes.value = battle.notes;
    $legacyNotesBlock.style.display = '';
  } else {
    $formNotes.value = '';
    $legacyNotesBlock.style.display = 'none';
  }

  formState.myParty = [...(battle.myParty || [])];
  formState.mySelect = [...(battle.mySelect || [])];
  formState.oppParty = [...(battle.oppParty || [])];
  formState.oppSelect = [...(battle.oppSelect || [])];
  formState.myPartyItems = { ...(battle.myPartyItems || {}) };
  formState.oppPartyItems = { ...(battle.oppPartyItems || {}) };

  openModal(true);
}

export function duplicateBattle(id) {
  const battle = battles.find(b => b.id === id);
  if (!battle) return;

  $formId.value = '';
  $formDate.value = todayStr();
  ensureRuleOption($formRule, battle.rule);
  $formRule.value = battle.rule || '';
  $formSeason.value = battle.season || '';
  rebuildTournamentOptions(battle.tournament || '');
  if ($formTournament) $formTournament.value = battle.tournament || '';
  $formRate.value = '';
  $formIntent.value = '';
  $formWinLossReason.value = '';
  $formPlayFlow.value = '';
  $formImprovement.value = '';
  $formNotes.value = '';
  $legacyNotesBlock.style.display = 'none';

  formState.myParty = [...(battle.myParty || [])];
  formState.mySelect = [...(battle.mySelect || [])];
  formState.oppParty = [...(battle.oppParty || [])];
  formState.oppSelect = [...(battle.oppSelect || [])];
  formState.myPartyItems = { ...(battle.myPartyItems || {}) };
  formState.oppPartyItems = { ...(battle.oppPartyItems || {}) };

  openModal(false);
  prefillRateForCurrentGroup();
}

export function confirmDelete(id) {
  setDeleteTargetId(id);
  openDeleteConfirm();
}

export function deleteBattle(id) {
  setBattles(battles.filter(b => b.id !== id));
  saveBattlesData(battles);
  renderTable();
}

// ===== CSV Export =====
const EXPORT_COLUMNS_KEY = 'pokemon-export-columns';
const EXPORT_TYPE_LABELS = { detail: '\u660E\u7D30', poke: '\u30DD\u30B1\u5225', combo: '\u30B3\u30F3\u30DC\u5225', matchup: '\u76F8\u6027', summary: '\u671F\u9593\u30B5\u30DE\u30EA' };

const $exportOverlay = document.getElementById('export-overlay');

function loadSelectedColumns() {
  try {
    const raw = JSON.parse(localStorage.getItem(EXPORT_COLUMNS_KEY));
    if (Array.isArray(raw) && raw.length > 0) {
      // \u65E2\u5B58\u30AD\u30FC\u306E\u307F\u63A1\u7528\uFF08\u5217\u5B9A\u7FA9\u304C\u5909\u308F\u3063\u3066\u3082\u7834\u7DBB\u3057\u306A\u3044\uFF09
      const valid = new Set(DETAIL_COLUMNS.map(c => c.key));
      const filtered = raw.filter(k => valid.has(k));
      if (filtered.length > 0) return filtered;
    }
  } catch {}
  return DETAIL_COLUMNS.map(c => c.key); // \u30C7\u30D5\u30A9\u30EB\u30C8\u5168ON
}

function saveSelectedColumns(keys) {
  try { localStorage.setItem(EXPORT_COLUMNS_KEY, JSON.stringify(keys)); } catch {}
}

function buildExportRangeOptions() {
  const $rule = document.getElementById('export-rule');
  const $season = document.getElementById('export-season');
  const $tournament = document.getElementById('export-tournament');
  const prevRule = $rule.value;
  const prevSeason = $season.value;
  const prevTournament = $tournament ? $tournament.value : '';
  const rules = [...new Set(battles.map(b => b.rule).filter(Boolean))].sort();
  const seasons = [...new Set(battles.map(b => b.season).filter(Boolean))].sort();
  $rule.innerHTML = '<option value="">\u5168\u30EB\u30FC\u30EB</option>' + rules.map(r => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('');
  $season.innerHTML = '<option value="">\u5168\u30B7\u30FC\u30BA\u30F3</option>' + seasons.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  $rule.value = rules.includes(prevRule) ? prevRule : '';
  $season.value = seasons.includes(prevSeason) ? prevSeason : '';
  if ($tournament) {
    const allT = loadTournaments();
    $tournament.innerHTML = '<option value="">\u5168\u5927\u4F1A</option>' +
      allT.map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`).join('');
    $tournament.value = allT.some(t => t.id === prevTournament) ? prevTournament : '';
  }
}

function renderExportColumns() {
  const $cols = document.getElementById('export-columns');
  const selected = new Set(loadSelectedColumns());
  $cols.innerHTML = DETAIL_COLUMNS.map(c =>
    `<label><input type="checkbox" value="${c.key}"${selected.has(c.key) ? ' checked' : ''}> ${escapeHtml(c.label)}</label>`
  ).join('');
}

function updateExportTypeView() {
  const type = document.querySelector('input[name="export-type"]:checked')?.value || 'detail';
  document.getElementById('export-columns-block').style.display = type === 'detail' ? '' : 'none';
}

export function openExportModal() {
  buildExportRangeOptions();
  renderExportColumns();
  document.getElementById('export-date-from').value = '';
  document.getElementById('export-date-to').value = '';
  updateExportTypeView();
  $exportOverlay.classList.add('active');
}

export function closeExportModal() {
  $exportOverlay.classList.remove('active');
}

export { updateExportTypeView };

function getSelectedColumnKeys() {
  return Array.from(document.querySelectorAll('#export-columns input[type="checkbox"]:checked')).map(el => el.value);
}

function toCSV(headers, rows) {
  const bom = '\uFEFF';
  const esc = (c) => `"${String(c ?? '').replace(/"/g, '""')}"`;
  return bom + [headers, ...rows].map(r => r.map(esc).join(',')).join('\n');
}

function downloadCSV(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function runExport() {
  const type = document.querySelector('input[name="export-type"]:checked')?.value || 'detail';
  const dateFrom = document.getElementById('export-date-from').value;
  const dateTo = document.getElementById('export-date-to').value;
  if (dateFrom && dateTo && dateFrom > dateTo) {
    showToast('\u958B\u59CB\u65E5\u304C\u7D42\u4E86\u65E5\u3088\u308A\u5F8C\u306B\u306A\u3063\u3066\u3044\u307E\u3059', 'error');
    return;
  }
  const range = {
    rule: document.getElementById('export-rule').value,
    season: document.getElementById('export-season').value,
    tournament: document.getElementById('export-tournament') ? document.getElementById('export-tournament').value : '',
    dateFrom,
    dateTo,
  };
  const scoped = filterByRange(battles, range);
  if (scoped.length === 0) {
    showToast('\u5BFE\u8C61\u306E\u5BFE\u6226\u8A18\u9332\u304C\u3042\u308A\u307E\u305B\u3093', 'info');
    return;
  }

  let result;
  if (type === 'detail') {
    const keys = getSelectedColumnKeys();
    if (keys.length === 0) {
      showToast('\u51FA\u529B\u3059\u308B\u5217\u30921\u3064\u4EE5\u4E0A\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044', 'error');
      return;
    }
    saveSelectedColumns(keys);
    result = buildDetailRows(scoped, battles, keys, formatDelta);
  } else if (type === 'poke') {
    result = aggregatePokeStats(scoped, battles);
  } else if (type === 'combo') {
    result = aggregateCombos(scoped, battles);
  } else if (type === 'matchup') {
    result = aggregateMatchup(scoped, battles);
  } else {
    result = aggregatePeriodSummary(scoped, battles);
  }

  if (!result.rows || result.rows.length === 0) {
    showToast('\u51FA\u529B\u3067\u304D\u308B\u30C7\u30FC\u30BF\u304C\u3042\u308A\u307E\u305B\u3093', 'info');
    return;
  }

  const csv = toCSV(result.headers, result.rows);
  downloadCSV(`pokemon-battle-log-${EXPORT_TYPE_LABELS[type]}-${todayStr()}.csv`, csv);
  closeExportModal();
  showToast('CSV\u3092\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u3057\u307E\u3057\u305F', 'success');
}

// ===== JSON Export/Import =====
export function exportJSON() {
  const presets = loadPresets();
  const tournamentsList = loadTournaments();
  const data = JSON.stringify({ battles, presets, tournaments: tournamentsList }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pokemon-battle-log-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`${battles.length}件の記録 + ${presets.length}件のパーティをエクスポートしました`, 'success');
}

export function openImportConfirm(battlesData, presetsData, tournamentsData) {
  importData = battlesData;
  importPresets = presetsData;
  importTournaments = tournamentsData || null;
  const parts = [`${battlesData.length}件の記録`];
  if (presetsData && presetsData.length > 0) parts.push(`${presetsData.length}件のパーティ`);
  if (tournamentsData && tournamentsData.length > 0) parts.push(`${tournamentsData.length}件の大会`);
  $importMessage.textContent = `${parts.join(' + ')}を読み込みました。既存の${battles.length}件のデータをどうしますか？`;
  $importOverlay.classList.add('active');
}

export function closeImportConfirm() {
  $importOverlay.classList.remove('active');
  importData = null;
  importPresets = null;
  importTournaments = null;
  $jsonFileInput.value = '';
}

function applyImportPresets() {
  if (importPresets && importPresets.length > 0) {
    savePresetsData(importPresets);
    renderPresetOptions();
    renderPartiesTab();
  }
  if (importTournaments && importTournaments.length > 0) {
    saveTournamentsData(importTournaments);
    setTournaments(importTournaments);
  }
}

export function doImportReplace() {
  if (importData) {
    setBattles(importData);
    saveBattlesData(battles);
    applyImportPresets();
    renderTable();
    showToast(`${importData.length}件のデータに上書きしました`, 'success');
  }
  closeImportConfirm();
}

export function doImportAppend() {
  if (importData) {
    importData.forEach(b => { if (!b.id) b.id = generateId(); });
    setBattles([...battles, ...importData]);
    saveBattlesData(battles);
    applyImportPresets();
    renderTable();
    showToast(`${importData.length}件のデータを追加しました`, 'success');
  }
  closeImportConfirm();
}

function validateBattle(b) {
  if (!b || typeof b !== 'object') return false;
  if (typeof b.date !== 'string' || !b.date) return false;
  return true;
}

export function handleImportFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      let battlesData, presetsData = null, tournamentsData = null;
      if (parsed && !Array.isArray(parsed) && Array.isArray(parsed.battles)) {
        battlesData = parsed.battles;
        presetsData = Array.isArray(parsed.presets) ? parsed.presets.map(normalizeMegaInPreset) : null;
        tournamentsData = Array.isArray(parsed.tournaments) ? parsed.tournaments : null;
      } else if (Array.isArray(parsed)) {
        battlesData = parsed;
      } else {
        showToast('無効なデータ形式です。', 'error');
        return;
      }
      const valid = battlesData.filter(validateBattle);
      const skipped = battlesData.length - valid.length;
      if (valid.length === 0 && (!presetsData || presetsData.length === 0)) {
        showToast(skipped > 0 ? `${skipped}件が不正データのためスキップされました。` : 'データが空です。', 'error');
        return;
      }
      if (skipped > 0) {
        showToast(`${skipped}件の不正データをスキップしました`, 'warn');
      }
      valid.forEach(b => { if (!b.id) b.id = generateId(); });
      openImportConfirm(valid.map(normalizeMegaInBattle), presetsData, tournamentsData);
    } catch {
      showToast('JSONの解析に失敗しました。ファイルを確認してください。', 'error');
    }
  };
  reader.readAsText(file);
}

// Prefill rate from last record in the same (rule, season) group.
// Only applies in new-battle mode (form-id empty).
export function prefillRateForCurrentGroup() {
  if ($formId.value) return;
  const tournament = $formTournament ? $formTournament.value : '';
  const rate = getLastRateForGroup(battles, $formRule.value, $formSeason.value, tournament);
  $formRate.value = rate !== null ? rate : 1500;
}

// ===== New Battle (pre-fill from last record) =====
export function openNewBattleModal() {
  resetFormState();
  if (battles.length > 0) {
    const last = battles[battles.length - 1];
    if (last.rule) ensureRuleOption($formRule, last.rule);
    formState.myParty = [...(last.myParty || [])];
    formState.myPartyItems = { ...(last.myPartyItems || {}) };
  }
  openModal();
  if (battles.length > 0 && battles[battles.length - 1].rule) {
    const lastRule = battles[battles.length - 1].rule;
    $formRule.value = lastRule;
    rebuildSeasonOptions(getLastSeasonForRule(battles, lastRule));
    rebuildTournamentOptions(null);
  }
  prefillRateForCurrentGroup();
}

export function openNewBattleWithParty(preset) {
  resetFormState();
  formState.myParty = [...preset.party];
  formState.myPartyItems = { ...(preset.items || {}) };
  openModal();
  if (battles.length > 0 && battles[battles.length - 1].rule) {
    const lastRule = battles[battles.length - 1].rule;
    ensureRuleOption($formRule, lastRule);
    $formRule.value = lastRule;
    rebuildSeasonOptions(getLastSeasonForRule(battles, lastRule));
    rebuildTournamentOptions(null);
  }
  prefillRateForCurrentGroup();
}

// ===== Tournament Management =====
const $tournamentOverlay = document.getElementById('tournament-overlay');
const $tournamentList = document.getElementById('tournament-list');
const $tournamentListSection = document.getElementById('tournament-list-section');
const $tournamentFormSection = document.getElementById('tournament-form-section');
const $tournamentForm = document.getElementById('tournament-form');
const $tournamentFormId = document.getElementById('tournament-form-id');
const $tournamentFormName = document.getElementById('tournament-form-name');
const $tournamentFormRule = document.getElementById('tournament-form-rule');
const $tournamentFormSeason = document.getElementById('tournament-form-season');
const $tournamentFormStart = document.getElementById('tournament-form-start');
const $tournamentFormEnd = document.getElementById('tournament-form-end');
const $tournamentFormPreset = document.getElementById('tournament-form-preset');

function rebuildTournamentFormPresetOptions(keepValue = null) {
  if (!$tournamentFormPreset) return;
  const presets = loadPresets();
  const opts = ['<option value="">— 未指定 —</option>']
    .concat(presets.map(p => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)} (${(p.party || []).length}体)</option>`));
  $tournamentFormPreset.innerHTML = opts.join('');
  if (keepValue && presets.some(p => p.name === keepValue)) {
    $tournamentFormPreset.value = keepValue;
  } else {
    $tournamentFormPreset.value = '';
  }
}

export function openTournamentModal() {
  $tournamentOverlay.classList.add('active');
  rebuildTournamentFormPresetOptions($tournamentFormPreset ? $tournamentFormPreset.value : null);
  showTournamentList();
}

export function closeTournamentModal() {
  $tournamentOverlay.classList.remove('active');
  showTournamentList();
}

function showTournamentList() {
  $tournamentListSection.style.display = '';
  $tournamentFormSection.style.display = 'none';
  renderTournamentList();
}

function showTournamentForm() {
  $tournamentListSection.style.display = 'none';
  $tournamentFormSection.style.display = '';
}

export function rebuildTournamentFormSeasonOptions(keepValue = null) {
  const rule = $tournamentFormRule.value;
  const seasons = RULE_SEASONS[rule] || [];
  const opts = ['<option value="">—</option>']
    .concat(seasons.map(s => `<option value="${s}">${s}</option>`));
  $tournamentFormSeason.innerHTML = opts.join('');
  if (keepValue && (keepValue === '' || seasons.includes(keepValue))) {
    $tournamentFormSeason.value = keepValue;
  } else {
    $tournamentFormSeason.value = seasons.length > 0 ? seasons[0] : '';
  }
}

export function renderTournamentList() {
  const all = loadTournaments();
  if (all.length === 0) {
    $tournamentList.innerHTML = '<p class="empty-desc" style="padding:16px;color:var(--text-muted)">大会がまだ登録されていません。「＋ 新規作成」から追加してください。</p>';
    return;
  }
  const counts = {};
  battles.forEach(b => {
    if (b.tournament) counts[b.tournament] = (counts[b.tournament] || 0) + 1;
  });
  const rows = all.map(t => {
    const period = (t.startDate || t.endDate)
      ? `${t.startDate || '?'} 〜 ${t.endDate || '?'}`
      : '—';
    const c = counts[t.id] || 0;
    return `<tr data-tid="${escapeHtml(t.id)}">
      <td>${escapeHtml(t.name)}</td>
      <td>${escapeHtml((t.rule || '').replace(/^レギュレーション/, ''))}</td>
      <td>${escapeHtml(t.season || '')}</td>
      <td>${escapeHtml(period)}</td>
      <td>${escapeHtml(t.partyPresetName || '—')}</td>
      <td>${c}件</td>
      <td>
        <button class="btn-icon edit" data-action="edit-tournament" title="編集">✎</button>
        <button class="btn-icon delete" data-action="delete-tournament" title="削除">🗑</button>
      </td>
    </tr>`;
  }).join('');
  $tournamentList.innerHTML = `<table class="tournament-list-table">
    <thead><tr><th>名前</th><th>ルール</th><th>シーズン</th><th>期間</th><th>固定パーティ</th><th>戦数</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

export function openTournamentForm(id = null) {
  if (id) {
    const all = loadTournaments();
    const t = all.find(x => x.id === id);
    if (!t) return;
    $tournamentFormId.value = t.id;
    $tournamentFormName.value = t.name || '';
    $tournamentFormRule.value = t.rule || '';
    rebuildTournamentFormSeasonOptions(t.season || '');
    $tournamentFormStart.value = t.startDate || '';
    $tournamentFormEnd.value = t.endDate || '';
    rebuildTournamentFormPresetOptions(t.partyPresetName || '');
  } else {
    $tournamentFormId.value = '';
    $tournamentFormName.value = '';
    $tournamentFormRule.value = '';
    rebuildTournamentFormSeasonOptions('');
    $tournamentFormStart.value = '';
    $tournamentFormEnd.value = '';
    rebuildTournamentFormPresetOptions('');
  }
  showTournamentForm();
}

export function cancelTournamentForm() {
  showTournamentList();
}

export function saveTournamentFromForm() {
  const name = $tournamentFormName.value.trim();
  if (!name) { showToast('大会名を入力してください', 'error'); return false; }
  const rule = $tournamentFormRule.value;
  if (!rule) { showToast('ルールを選択してください', 'error'); return false; }
  const season = $tournamentFormSeason.value;
  if (!season) { showToast('シーズンを選択してください', 'error'); return false; }
  const startDate = $tournamentFormStart.value || '';
  const endDate = $tournamentFormEnd.value || '';
  const partyPresetName = $tournamentFormPreset ? ($tournamentFormPreset.value || '') : '';
  if (startDate && endDate && startDate > endDate) {
    showToast('開始日が終了日より後になっています', 'error');
    return false;
  }
  const all = loadTournaments();
  const id = $tournamentFormId.value;
  if (id) {
    const idx = all.findIndex(t => t.id === id);
    if (idx !== -1) {
      all[idx] = { ...all[idx], name, rule, season, startDate, endDate, partyPresetName };
    }
  } else {
    all.push({
      id: generateId(),
      name, rule, season, startDate, endDate, partyPresetName,
      createdAt: new Date().toISOString()
    });
  }
  saveTournamentsData(all);
  setTournaments(all);
  showToast(id ? '大会を更新しました' : '大会を作成しました', 'success');
  showTournamentList();
  return true;
}

export function deleteTournamentById(id) {
  const all = loadTournaments();
  const t = all.find(x => x.id === id);
  if (!t) return;
  const linkedCount = battles.filter(b => b.tournament === id).length;
  const msg = linkedCount > 0
    ? `「${t.name}」を削除しますか？\n紐付く${linkedCount}件のバトルは大会未紐付に戻ります。`
    : `「${t.name}」を削除しますか？`;
  if (!confirm(msg)) return;
  const next = all.filter(x => x.id !== id);
  saveTournamentsData(next);
  setTournaments(next);
  if (linkedCount > 0) {
    battles.forEach(b => { if (b.tournament === id) b.tournament = ''; });
    saveBattlesData(battles);
  }
  showToast('大会を削除しました', 'success');
  renderTournamentList();
  renderTable();
}

// ===== Party Tab =====
const PARTY_OVERLAP_THRESHOLD = 6;

function normalizePokeName(n) { return MEGA_BASE[n] || n; }

function getPartyStats(party) {
  const presetSet = new Set((party || []).map(normalizePokeName));
  const resultMap = buildResultMap(battles);
  let wins = 0, total = 0;
  battles.forEach(b => {
    const battleSet = new Set((b.myParty || []).map(normalizePokeName));
    let overlap = 0;
    presetSet.forEach(p => { if (battleSet.has(p)) overlap++; });
    if (overlap >= PARTY_OVERLAP_THRESHOLD) {
      const r = (resultMap[b.id] || {}).result;
      if (r === '勝ち' || r === '負け') {
        total++;
        if (r === '勝ち') wins++;
      }
    }
  });
  return { wins, total };
}

const PARTY_VIEW_KEY = 'pokemon-party-view-mode';
function getPartyViewMode() {
  return localStorage.getItem(PARTY_VIEW_KEY) === 'detail' ? 'detail' : 'simple';
}
export function setPartyViewMode(mode) {
  localStorage.setItem(PARTY_VIEW_KEY, mode === 'detail' ? 'detail' : 'simple');
}

export function partyToText(preset) {
  const party = preset.party || [];
  return party.map(name => {
    const det = (preset.details || {})[name] || {};
    const item = det.item || (preset.items || {})[name] || '';
    const lines = [item ? `${name} @ ${item}` : name];
    if (det.ability) lines.push(`特性: ${det.ability}`);
    if (det.nature) lines.push(`能力補正: ${det.nature}`);
    if (det.stats) {
      const s = det.stats;
      const evs = det.evs || {};
      const fmt = k => (evs[k] ? `${s[k]}(${evs[k]})` : `${s[k]}`);
      lines.push(['h','a','b','c','d','s'].map(fmt).join('-'));
    }
    if (Array.isArray(det.moves) && det.moves.length > 0) {
      lines.push(det.moves.filter(Boolean).join(' / '));
    }
    return lines.join('\n');
  }).join('\n\n');
}

function renderPartyCard(preset, idx) {
  const stats = getPartyStats(preset.party);
  const rate = stats.total > 0 ? Math.round(stats.wins / stats.total * 100) : null;
  const mode = getPartyViewMode();

  const pokemonHtml = (preset.party || []).map(name => {
    const slug = getPokemonSlug(name);
    const item = (preset.items || {})[name] || '';
    const det = (preset.details || {})[name] || {};
    const itemDisplay = det.item || item;

    if (mode === 'simple') {
      return `<div class="poke-cell">
        <img src="${getSpriteUrl(slug || 'substitute')}" alt="${escapeHtml(name)}" loading="lazy">
        <span class="poke-tooltip">${escapeHtml(name)}${itemDisplay ? '<br>@' + escapeHtml(itemDisplay) : ''}</span>
      </div>`;
    }

    const ability = det.ability || '';
    const nature = det.nature || '';
    const evs = det.evs;
    const stats2 = det.stats;
    const moves = Array.isArray(det.moves) ? det.moves : [];
    const evText = evs ? `H${evs.h} A${evs.a} B${evs.b} C${evs.c} D${evs.d} S${evs.s}` : '';
    const statText = stats2 ? `${stats2.h}-${stats2.a}-${stats2.b}-${stats2.c}-${stats2.d}-${stats2.s}` : '';
    const movesHtml = [0, 1, 2, 3].map(i =>
      `<div class="pd-move">${moves[i] ? escapeHtml(moves[i]) : '&nbsp;'}</div>`
    ).join('');
    return `<div class="poke-cell-v">
      <div class="pd-head">
        <img src="${getSpriteUrl(slug || 'substitute')}" alt="${escapeHtml(name)}" loading="lazy">
        <div class="pd-name">${escapeHtml(name)}</div>
      </div>
      <div class="pd-row pd-item">${itemDisplay ? '@' + escapeHtml(itemDisplay) : '&nbsp;'}</div>
      <div class="pd-row"><span class="pd-label">特性</span> <span>${ability ? escapeHtml(ability) : '—'}</span></div>
      <div class="pd-row"><span class="pd-label">性格</span> <span>${nature ? escapeHtml(nature) : '—'}</span></div>
      <div class="pd-row pd-mono">${evText ? escapeHtml(evText) : '&nbsp;'}</div>
      <div class="pd-row pd-mono">${statText ? escapeHtml(statText) : '&nbsp;'}</div>
      <div class="pd-moves">${movesHtml}</div>
    </div>`;
  }).join('');

  return `<div class="party-card" data-party-idx="${idx}">
    <div class="party-card-header">
      <span class="party-card-name">${escapeHtml(preset.name)}</span>
      <div class="party-card-actions">
        ${mode === 'detail' ? `<button class="btn-icon" title="テキストコピー" data-action="copy-party-text">📋</button>` : ''}
        <button class="btn-icon edit" title="編集" data-action="edit-party">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="btn-icon delete" title="削除" data-action="delete-party">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>
    </div>
    <div class="party-card-pokemon ${mode === 'simple' ? 'is-simple' : 'is-detail'}">${pokemonHtml}</div>
    ${mode === 'detail' && preset.notes ? `<div class="party-card-notes" title="${escapeHtml(preset.notes)}">${escapeHtml(preset.notes)}</div>` : ''}
    ${stats.total > 0 ? `<div class="party-card-stats">${stats.wins}W ${stats.total - stats.wins}L${rate !== null ? ` (${rate}%)` : ''} / ${stats.total}戦</div>` : ''}
    <div class="party-card-footer">
      <button class="btn btn-primary btn-sm" data-action="record-party" title="この構成で記録">${mode === 'simple' ? '＋ 記録' : 'この構成で記録'}</button>
    </div>
  </div>`;
}

export function renderPartiesTab() {
  const presets = loadPresets();
  const mode = getPartyViewMode();
  $partiesGrid.classList.toggle('simple-view', mode === 'simple');
  $partiesGrid.classList.toggle('detail-view', mode === 'detail');
  if (presets.length === 0) {
    $partiesGrid.innerHTML = '';
    $partiesEmpty.classList.add('visible');
  } else {
    $partiesEmpty.classList.remove('visible');
    $partiesGrid.innerHTML = presets.map((p, i) => renderPartyCard(p, i)).join('');
  }
}

// ===== Party Edit Modal =====
export function openPartyModal(idx) {
  setEditingPartyIdx(idx);
  resetFormState();
  if (idx >= 0) {
    const presets = loadPresets();
    const preset = presets[idx];
    $partyModalTitle.textContent = 'パーティ編集';
    $partyFormName.value = preset.name;
    $partyFormNotes.value = preset.notes || '';
    formState.myParty = [...preset.party];
    formState.myPartyItems = { ...(preset.items || {}) };
    formState.myPartyDetails = JSON.parse(JSON.stringify(preset.details || {}));
    formState.selectionPatterns = (preset.selectionPatterns || []).map(p => ({
      vs: p.vs || '',
      picks: Array.isArray(p.picks) ? [...p.picks] : []
    }));
  } else {
    $partyModalTitle.textContent = 'パーティ追加';
    $partyFormName.value = '';
    $partyFormNotes.value = '';
  }
  $partyModalOverlay.classList.add('active');
  renderPickerSlots($pickerPartyEdit, 'myParty', 8, { expanded: true });
  renderSelectionPatterns();
}

// ===== Selection Patterns =====
export function renderSelectionPatterns() {
  $selectionPatternList.innerHTML = '';
  formState.selectionPatterns.forEach((row, rowIdx) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'selection-pattern-row';

    const vsInput = document.createElement('input');
    vsInput.type = 'text';
    vsInput.className = 'selection-pattern-vs';
    vsInput.placeholder = 'vs 相手構成（自由記述）';
    vsInput.value = row.vs;
    vsInput.addEventListener('input', () => {
      formState.selectionPatterns[rowIdx].vs = vsInput.value;
    });

    const picksEl = document.createElement('div');
    picksEl.className = 'selection-pattern-picks';
    if (formState.myParty.length === 0) {
      picksEl.innerHTML = '<span class="empty-hint">先にポケモンを追加してください</span>';
    } else {
      formState.myParty.forEach(name => {
        const slug = getPokemonSlug(name);
        const isSelected = row.picks.includes(name);
        const icon = document.createElement('div');
        icon.className = 'party-icon' + (isSelected ? ' selected' : '');
        icon.innerHTML = `<img src="${getSpriteUrl(slug || 'substitute')}" alt="${escapeHtml(name)}" title="${escapeHtml(name)}">`;
        icon.addEventListener('click', () => {
          const picks = formState.selectionPatterns[rowIdx].picks;
          if (isSelected) {
            const i = picks.indexOf(name);
            if (i !== -1) picks.splice(i, 1);
          } else {
            if (picks.length >= SELECTION_PATTERN_PICKS) return;
            picks.push(name);
          }
          renderSelectionPatterns();
        });
        picksEl.appendChild(icon);
      });
    }

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn-icon delete selection-pattern-remove';
    removeBtn.title = '行を削除';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => {
      formState.selectionPatterns.splice(rowIdx, 1);
      renderSelectionPatterns();
    });

    rowEl.appendChild(vsInput);
    rowEl.appendChild(picksEl);
    rowEl.appendChild(removeBtn);
    $selectionPatternList.appendChild(rowEl);
  });

  $btnAddSelectionPattern.disabled = formState.selectionPatterns.length >= SELECTION_PATTERN_MAX_ROWS;
}

export function addSelectionPatternRow() {
  if (formState.selectionPatterns.length >= SELECTION_PATTERN_MAX_ROWS) return;
  formState.selectionPatterns.push({ vs: '', picks: [] });
  renderSelectionPatterns();
}

export function closePartyModal() {
  $partyModalOverlay.classList.remove('active');
  $partyForm.reset();
  setEditingPartyIdx(null);
  resetFormState();
}

