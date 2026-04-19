// ===== Modal & CRUD Module =====
import {
  battles, setBattles, formState, resetFormState, saveBattlesData,
  deleteTargetId, setDeleteTargetId, editingPartyIdx, setEditingPartyIdx,
  loadPresets, savePresetsData, normalizeMegaInBattle, normalizeMegaInPreset
} from './state.js';
import { generateId, escapeHtml, getPokemonSlug, showToast, todayStr, ensureRuleOption, buildResultMap, formatDelta, formatDate } from './utils.js';
import { renderTable, renderPokeIconsHtml } from './render.js';
import { getFilteredBattles } from './filter.js';
import { renderPickerSlots, renderSelectFromParty, renderTagPicker, updateDependentSelections, setPartyModalRefs, setOnOppPartyChange,
  $pickerMyParty, $selectMySelect, $pickerOppParty, $selectOppSelect } from './picker.js';
import { getSpriteUrl, MEGA_BASE } from './pokemon-data.js';

// ===== DOM References =====
const $modalOverlay = document.getElementById('modal-overlay');
const $deleteOverlay = document.getElementById('delete-overlay');
const $importOverlay = document.getElementById('import-overlay');
const $form = document.getElementById('battle-form');
const $formId = document.getElementById('form-id');
const $formDate = document.getElementById('form-date');
const $formRule = document.getElementById('form-rule');
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

export {
  $modalOverlay, $deleteOverlay, $importOverlay, $form, $formId, $formDate, $formRule,
  $formRate, $formNotes, $formIntent, $formWinLossReason, $formPlayFlow,
  $formImprovement, $jsonFileInput, $presetSelect,
  $partyModalOverlay, $partyForm, $partyFormName, $partyFormNotes
};

// Register side panel refresh callback for opp party changes
setOnOppPartyChange(() => renderSidePanel());

// Wire up the party modal refs to picker module
setPartyModalRefs($partyModalOverlay, $pickerPartyEdit);

// ===== Import State =====
let importData = null;
let importPresets = null;

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
    let lastRate = null;
    for (let i = battles.length - 1; i >= 0; i--) {
      const r = battles[i].rate;
      if (typeof r === 'number' && !Number.isNaN(r)) { lastRate = r; break; }
    }
    $formRate.value = lastRate !== null ? lastRate : '';
  }
  renderPresetOptions();
  renderTagPicker();
  renderPickerSlots($pickerMyParty, 'myParty', 8);
  renderSelectFromParty($selectMySelect, 'mySelect', 'myParty', 4);
  renderPickerSlots($pickerOppParty, 'oppParty', 6);
  renderSelectFromParty($selectOppSelect, 'oppSelect', 'oppParty', 4);
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
  formState.tags = [...(battle.tags || [])];
  formState.myPartyItems = { ...(battle.myPartyItems || {}) };
  formState.oppPartyItems = { ...(battle.oppPartyItems || {}) };

  openModal(true);
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
export function exportCSV() {
  const filtered = getFilteredBattles();
  if (filtered.length === 0) return;

  const resultMap = buildResultMap(battles);
  const headers = ['日付', 'ルール', '結果', 'レート', 'レート差', '自分のパーティ', '自分の持ち物', '選出', '相手のパーティ', '相手の持ち物', '相手選出', 'お気に入り', 'タグ', '選出意図', '勝因・敗因', '立ち回り・分岐点', '改善点・TODO', '旧メモ'];
  const rows = filtered.map(b => {
    const myItems = b.myPartyItems || {};
    const oppItems = b.oppPartyItems || {};
    const esc = (s) => (s || '').replace(/"/g, '""');
    const info = resultMap[b.id] || {};
    const deltaVal = info.delta;
    return [
      b.date || '',
      b.rule || '',
      info.result || '',
      (b.rate !== undefined && b.rate !== null && b.rate !== '') ? String(b.rate) : '',
      (deltaVal !== null && deltaVal !== undefined) ? formatDelta(deltaVal) : '',
      (b.myParty || []).join('/'),
      (b.myParty || []).map(p => myItems[p] || '').join('/'),
      (b.mySelect || []).join('/'),
      (b.oppParty || []).join('/'),
      (b.oppParty || []).map(p => oppItems[p] || '').join('/'),
      (b.oppSelect || []).join('/'),
      b.bookmarked ? '★' : '',
      (b.tags || []).join('/'),
      esc(b.intent),
      esc(b.winLossReason),
      esc(b.playFlow),
      esc(b.improvement),
      esc(b.notes)
    ];
  });

  const bom = '\uFEFF';
  const csv = bom + [headers, ...rows].map(r =>
    r.map(c => `"${c}"`).join(',')
  ).join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pokemon-battle-log-${todayStr()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ===== JSON Export/Import =====
export function exportJSON() {
  const presets = loadPresets();
  const data = JSON.stringify({ battles, presets }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pokemon-battle-log-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`${battles.length}件の記録 + ${presets.length}件のパーティをエクスポートしました`, 'success');
}

export function openImportConfirm(battlesData, presetsData) {
  importData = battlesData;
  importPresets = presetsData;
  const parts = [`${battlesData.length}件の記録`];
  if (presetsData && presetsData.length > 0) parts.push(`${presetsData.length}件のパーティ`);
  $importMessage.textContent = `${parts.join(' + ')}を読み込みました。既存の${battles.length}件のデータをどうしますか？`;
  $importOverlay.classList.add('active');
}

export function closeImportConfirm() {
  $importOverlay.classList.remove('active');
  importData = null;
  importPresets = null;
  $jsonFileInput.value = '';
}

function applyImportPresets() {
  if (importPresets && importPresets.length > 0) {
    savePresetsData(importPresets);
    renderPresetOptions();
    renderPartiesTab();
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
      let battlesData, presetsData = null;
      if (parsed && !Array.isArray(parsed) && Array.isArray(parsed.battles)) {
        battlesData = parsed.battles;
        presetsData = Array.isArray(parsed.presets) ? parsed.presets.map(normalizeMegaInPreset) : null;
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
      openImportConfirm(valid.map(normalizeMegaInBattle), presetsData);
    } catch {
      showToast('JSONの解析に失敗しました。ファイルを確認してください。', 'error');
    }
  };
  reader.readAsText(file);
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
    $formRule.value = battles[battles.length - 1].rule;
  }
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
  }
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

function renderPartyCard(preset, idx) {
  const stats = getPartyStats(preset.party);
  const rate = stats.total > 0 ? Math.round(stats.wins / stats.total * 100) : null;

  const pokemonHtml = (preset.party || []).map(name => {
    const slug = getPokemonSlug(name);
    const item = (preset.items || {})[name] || '';
    return `<div class="poke-cell">
      <img src="${getSpriteUrl(slug || 'substitute')}" alt="${escapeHtml(name)}" loading="lazy">
      <span class="poke-tooltip">${escapeHtml(name)}${item ? '<br>@' + escapeHtml(item) : ''}</span>
      ${item ? `<span class="poke-card-item">${escapeHtml(item)}</span>` : ''}
    </div>`;
  }).join('');

  return `<div class="party-card" data-party-idx="${idx}">
    <div class="party-card-header">
      <span class="party-card-name">${escapeHtml(preset.name)}</span>
      <div class="party-card-actions">
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
    <div class="party-card-pokemon">${pokemonHtml}</div>
    ${preset.notes ? `<div class="party-card-notes" title="${escapeHtml(preset.notes)}">${escapeHtml(preset.notes)}</div>` : ''}
    ${stats.total > 0 ? `<div class="party-card-stats">${stats.wins}W ${stats.total - stats.wins}L${rate !== null ? ` (${rate}%)` : ''} / ${stats.total}戦</div>` : ''}
    <div class="party-card-footer">
      <button class="btn btn-primary btn-sm" data-action="record-party">この構成で記録</button>
    </div>
  </div>`;
}

export function renderPartiesTab() {
  const presets = loadPresets();
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
  } else {
    $partyModalTitle.textContent = 'パーティ追加';
    $partyFormName.value = '';
    $partyFormNotes.value = '';
  }
  $partyModalOverlay.classList.add('active');
  renderPickerSlots($pickerPartyEdit, 'myParty', 8);
}

export function closePartyModal() {
  $partyModalOverlay.classList.remove('active');
  $partyForm.reset();
  setEditingPartyIdx(null);
  resetFormState();
}

