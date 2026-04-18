// ===== Modal & CRUD Module =====
import {
  battles, setBattles, formState, resetFormState, saveBattlesData,
  deleteTargetId, setDeleteTargetId, editingPartyIdx, setEditingPartyIdx,
  loadPresets, savePresetsData, normalizeMegaInBattle, normalizeMegaInPreset
} from './state.js';
import { generateId, escapeHtml, getPokemonSlug, showToast, todayStr, ensureRuleOption } from './utils.js';
import { renderTable, renderPokeIconsHtml } from './render.js';
import { getFilteredBattles } from './filter.js';
import { renderPickerSlots, renderSelectFromParty, renderTagPicker, updateDependentSelections, setPartyModalRefs,
  $pickerMyParty, $selectMySelect, $pickerOppParty, $selectOppSelect } from './picker.js';
import { getSpriteUrl } from './pokemon-data.js';

// ===== DOM References =====
const $modalOverlay = document.getElementById('modal-overlay');
const $deleteOverlay = document.getElementById('delete-overlay');
const $importOverlay = document.getElementById('import-overlay');
const $form = document.getElementById('battle-form');
const $formId = document.getElementById('form-id');
const $formDate = document.getElementById('form-date');
const $formRule = document.getElementById('form-rule');
const $formResult = document.getElementById('form-result');
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
  $formResult, $formRate, $formNotes, $formIntent, $formWinLossReason, $formPlayFlow,
  $formImprovement, $jsonFileInput, $presetSelect,
  $partyModalOverlay, $partyForm, $partyFormName, $partyFormNotes
};

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
  $formResult.value = battle.result || '';
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

  const headers = ['日付', 'ルール', '結果', 'レート', '自分のパーティ', '自分の持ち物', '選出', '相手のパーティ', '相手の持ち物', '相手選出', 'お気に入り', 'タグ', '選出意図', '勝因・敗因', '立ち回り・分岐点', '改善点・TODO', '旧メモ'];
  const rows = filtered.map(b => {
    const myItems = b.myPartyItems || {};
    const oppItems = b.oppPartyItems || {};
    const esc = (s) => (s || '').replace(/"/g, '""');
    return [
      b.date || '',
      b.rule || '',
      b.result || '',
      (b.rate !== undefined && b.rate !== null && b.rate !== '') ? String(b.rate) : '',
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
  if (!['勝ち', '負け', '引き分け'].includes(b.result)) return false;
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
function getPartyStats(party) {
  const pk = [...party].sort().join(',');
  let wins = 0, total = 0;
  battles.forEach(b => {
    const bKey = [...(b.myParty || [])].sort().join(',');
    if (bKey === pk) { total++; if (b.result === '勝ち') wins++; }
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

