// ===== Events Module =====
import {
  battles, formState, deleteTargetId, sortDirection, setSortDirection, statsDirty,
  editingPartyIdx, loadPresets, savePresetsData
} from './state.js';
import { showToast } from './utils.js';
import { $filterRule, $filterResult, $filterPeriod, $filterTag, $statsPartySelect, saveFiltersToHash } from './filter.js';
import { renderTable, $tableBody, $mobileCards, mobileQuery, isStatsTabActive, setRenderAllStats } from './render.js';
import { renderAllStats, renderTrendChart, renderRateTrendChart, setMatchupOppMode } from './stats.js';
import { renderPickerSlots, closePokemonGrid, updateDependentSelections, $pokemonGridOverlay, $pickerMyParty, $selectMySelect } from './picker.js';
import {
  openModal, closeModal, openDeleteConfirm, closeDeleteConfirm,
  saveBattle, editBattle, toggleBookmark, confirmDelete, deleteBattle,
  exportCSV, exportJSON, handleImportFile, closeImportConfirm, doImportReplace, doImportAppend,
  openNewBattleModal, openNewBattleWithParty,
  renderPresetOptions, renderPartiesTab, openPartyModal, closePartyModal, addSelectionPatternRow,
  $modalOverlay, $deleteOverlay, $importOverlay, $form, $formId, $formDate,
  $formRule, $formRate, $formNotes,
  $formIntent, $formWinLossReason, $formPlayFlow, $formImprovement,
  $jsonFileInput, $presetSelect,
  $partyModalOverlay, $partyForm, $partyFormName, $partyFormNotes
} from './modal.js';
// Wire up lazy reference: render.js needs renderAllStats from stats.js
setRenderAllStats(renderAllStats);

export function initEvents() {
  // ===== Header Buttons =====
  document.getElementById('btn-add').addEventListener('click', openNewBattleModal);
  document.getElementById('fab-add').addEventListener('click', openNewBattleModal);

  // ===== Modal Close =====
  // 入力内容を誤って失わないよう、オーバーレイ外クリックでは閉じない。
  // 閉じる導線は ×ボタン / キャンセル / Esc の3つ
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('btn-cancel').addEventListener('click', closeModal);

  // ===== Delete Confirm =====
  document.getElementById('delete-close').addEventListener('click', closeDeleteConfirm);
  document.getElementById('delete-cancel').addEventListener('click', closeDeleteConfirm);
  document.getElementById('delete-confirm').addEventListener('click', () => {
    if (deleteTargetId) deleteBattle(deleteTargetId);
    closeDeleteConfirm();
  });
  $deleteOverlay.addEventListener('click', (e) => {
    if (e.target === $deleteOverlay) closeDeleteConfirm();
  });

  // ===== Export/Import =====
  document.getElementById('btn-export').addEventListener('click', exportCSV);
  document.getElementById('btn-json-export').addEventListener('click', exportJSON);
  document.getElementById('btn-json-import').addEventListener('click', () => $jsonFileInput.click());

  $jsonFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleImportFile(file);
  });

  document.getElementById('import-replace').addEventListener('click', doImportReplace);
  document.getElementById('import-append').addEventListener('click', doImportAppend);
  document.getElementById('import-cancel').addEventListener('click', closeImportConfirm);
  document.getElementById('import-close').addEventListener('click', closeImportConfirm);
  $importOverlay.addEventListener('click', (e) => {
    if (e.target === $importOverlay) closeImportConfirm();
  });

  // ===== Preset Buttons =====
  document.getElementById('btn-preset-load').addEventListener('click', () => {
    const idx = $presetSelect.value;
    if (idx === '') { showToast('プリセットを選択してください', 'info'); return; }
    const presets = loadPresets();
    const preset = presets[parseInt(idx)];
    if (preset) {
      formState.myParty = [...preset.party];
      formState.myPartyItems = { ...(preset.items || {}) };
      formState.mySelect = [];
      renderPickerSlots($pickerMyParty, 'myParty', 8);
      updateDependentSelections('myParty');
      showToast(`「${preset.name}」を読み込みました`, 'success');
    }
  });

  document.getElementById('btn-preset-save').addEventListener('click', () => {
    if (formState.myParty.length === 0) { showToast('パーティが空です', 'info'); return; }
    const name = prompt('プリセット名を入力してください:');
    if (!name || !name.trim()) return;
    const presets = loadPresets();
    presets.push({ name: name.trim(), party: [...formState.myParty], items: { ...formState.myPartyItems } });
    savePresetsData(presets);
    renderPresetOptions();
    renderPartiesTab();
    showToast(`「${name.trim()}」を保存しました`, 'success');
  });

  document.getElementById('btn-preset-delete').addEventListener('click', () => {
    const idx = $presetSelect.value;
    if (idx === '') { showToast('削除するプリセットを選択してください', 'info'); return; }
    const presets = loadPresets();
    const preset = presets[parseInt(idx)];
    if (preset && confirm(`「${preset.name}」を削除しますか？`)) {
      presets.splice(parseInt(idx), 1);
      savePresetsData(presets);
      renderPresetOptions();
      renderPartiesTab();
      showToast('プリセットを削除しました', 'success');
    }
  });

  // ===== Table Event Delegation =====
  $tableBody.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const row = btn.closest('tr[data-id]');
    if (!row) return;
    const id = row.dataset.id;
    const action = btn.dataset.action;
    if (action === 'bookmark') toggleBookmark(id);
    else if (action === 'edit') editBattle(id);
    else if (action === 'delete') confirmDelete(id);
  });

  // ===== Mobile Cards Event Delegation =====
  $mobileCards.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const card = btn.closest('.battle-card[data-id]');
    if (!card) return;
    const id = card.dataset.id;
    const action = btn.dataset.action;
    if (action === 'bookmark') toggleBookmark(id);
    else if (action === 'edit') editBattle(id);
    else if (action === 'delete') confirmDelete(id);
  });

  // ===== Sort Toggle =====
  document.querySelector('[data-sort="date"]').addEventListener('click', () => {
    setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
    document.querySelector('[data-sort="date"] .sort-icon').textContent = sortDirection === 'desc' ? '↓' : '↑';
    renderTable();
  });

  // ===== Rate Quick-Adjust =====
  document.querySelectorAll('.rate-adj-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const delta = parseInt(btn.dataset.delta, 10);
      const current = parseInt($formRate.value, 10);
      const base = Number.isNaN(current) ? 0 : current;
      $formRate.value = base + delta;
    });
  });
  $formRate.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1 : -1;
    const current = parseInt($formRate.value, 10);
    const base = Number.isNaN(current) ? 0 : current;
    $formRate.value = base + delta;
  }, { passive: false });

  // ===== Filters =====
  function onFilterChange() {
    saveFiltersToHash();
    renderTable();
  }
  $filterRule.addEventListener('change', onFilterChange);
  $filterResult.addEventListener('change', onFilterChange);
  $filterPeriod.addEventListener('change', onFilterChange);
  $filterTag.addEventListener('change', onFilterChange);

  // ===== Form Submit =====
  $form.addEventListener('submit', (e) => {
    e.preventDefault();

    if (formState.mySelect.length < 3) {
      showToast('自分の選出を3体以上選択してください', 'error');
      return;
    }

    const rateRaw = $formRate.value.trim();
    if (rateRaw === '') {
      showToast('レートを入力してください（レート差から勝敗を判定します）', 'error');
      $formRate.focus();
      return;
    }
    const rateNum = parseInt(rateRaw, 10);
    if (Number.isNaN(rateNum)) {
      showToast('レートは整数で入力してください', 'error');
      $formRate.focus();
      return;
    }

    const data = {
      id: $formId.value || null,
      date: $formDate.value,
      rule: $formRule.value,
      rate: rateNum,
      myParty: [...formState.myParty],
      mySelect: [...formState.mySelect],
      oppParty: [...formState.oppParty],
      oppSelect: [...formState.oppSelect],
      myPartyItems: { ...formState.myPartyItems },
      oppPartyItems: { ...formState.oppPartyItems },
      tags: [...formState.tags],
      intent: $formIntent.value.trim(),
      winLossReason: $formWinLossReason.value.trim(),
      playFlow: $formPlayFlow.value.trim(),
      improvement: $formImprovement.value.trim(),
      notes: $formNotes.value.trim()
    };

    saveBattle(data);
    closeModal();
  });

  // ===== Keyboard Shortcuts =====
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if ($pokemonGridOverlay.classList.contains('active')) {
        closePokemonGrid();
      } else if ($importOverlay.classList.contains('active')) {
        closeImportConfirm();
      } else if ($deleteOverlay.classList.contains('active')) {
        closeDeleteConfirm();
      } else if ($partyModalOverlay.classList.contains('active')) {
        closePartyModal();
      } else if ($modalOverlay.classList.contains('active')) {
        closeModal();
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      openNewBattleModal();
    }
  });

  // ===== Tab Navigation =====
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      if (btn.dataset.tab === 'parties') renderPartiesTab();
      if (btn.dataset.tab === 'stats' && statsDirty) renderAllStats();
    });
  });

  // My sub-tabs
  document.querySelectorAll('#my-sub-tabs .sub-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#my-sub-tabs .sub-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.my-tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('my-tab-' + btn.dataset.myTab).classList.add('active');
    });
  });

  // Opponent sub-tabs
  document.querySelectorAll('#opp-sub-tabs .sub-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#opp-sub-tabs .sub-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.opp-tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('opp-tab-' + btn.dataset.oppTab).classList.add('active');
    });
  });

  // Matchup matrix sub-tabs (相手パーティ / 相手選出)
  document.querySelectorAll('#matchup-sub-tabs .sub-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      setMatchupOppMode(btn.dataset.matchupMode);
    });
  });

  // ===== Stats Party Filter =====
  $statsPartySelect.addEventListener('change', () => {
    renderAllStats();
  });

  // ===== Resize =====
  let lastMobileState = mobileQuery.matches;
  window.addEventListener('resize', () => {
    if (isStatsTabActive()) {
      renderTrendChart();
      renderRateTrendChart();
    }
    const nowMobile = mobileQuery.matches;
    if (nowMobile !== lastMobileState) {
      lastMobileState = nowMobile;
      renderTable();
    }
  });

  // ===== Menu Dropdown =====
  const $menuToggle = document.getElementById('menu-toggle');
  const $menuDropdown = document.getElementById('menu-dropdown');

  $menuToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    $menuDropdown.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (!$menuDropdown.contains(e.target) && e.target !== $menuToggle) {
      $menuDropdown.classList.remove('open');
    }
  });

  $menuDropdown.addEventListener('click', () => {
    $menuDropdown.classList.remove('open');
  });

  // ===== Party Tab Events =====
  const $partiesGrid = document.getElementById('parties-grid');
  $partiesGrid.addEventListener('click', (e) => {
    const card = e.target.closest('.party-card');
    if (!card) return;
    const idx = parseInt(card.dataset.partyIdx);
    const presets = loadPresets();
    const preset = presets[idx];
    if (!preset) return;

    const action = e.target.closest('[data-action]');
    if (!action) return;

    switch (action.dataset.action) {
      case 'record-party':
        openNewBattleWithParty(preset);
        break;
      case 'edit-party':
        openPartyModal(idx);
        break;
      case 'delete-party':
        if (confirm(`「${preset.name}」を削除しますか？`)) {
          presets.splice(idx, 1);
          savePresetsData(presets);
          renderPartiesTab();
          renderPresetOptions();
          showToast('パーティを削除しました', 'success');
        }
        break;
    }
  });

  document.getElementById('btn-add-party').addEventListener('click', () => {
    openPartyModal(-1);
  });

  document.getElementById('btn-add-selection-pattern').addEventListener('click', () => {
    addSelectionPatternRow();
  });

  // ===== Party Form Submit =====
  $partyForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $partyFormName.value.trim();
    if (!name) { showToast('パーティ名を入力してください', 'error'); return; }
    if (formState.myParty.length === 0) { showToast('ポケモンを1体以上追加してください', 'error'); return; }

    const notes = $partyFormNotes.value.trim();
    const selectionPatterns = formState.selectionPatterns
      .map(p => ({ vs: (p.vs || '').trim(), picks: [...p.picks] }))
      .filter(p => p.vs || p.picks.length > 0);
    const presets = loadPresets();
    if (editingPartyIdx >= 0 && editingPartyIdx < presets.length) {
      presets[editingPartyIdx].name = name;
      presets[editingPartyIdx].party = [...formState.myParty];
      presets[editingPartyIdx].items = { ...formState.myPartyItems };
      presets[editingPartyIdx].notes = notes;
      presets[editingPartyIdx].selectionPatterns = selectionPatterns;
      showToast(`「${name}」を更新しました`, 'success');
    } else {
      presets.push({ name, party: [...formState.myParty], items: { ...formState.myPartyItems }, notes, selectionPatterns });
      showToast(`「${name}」を保存しました`, 'success');
    }
    savePresetsData(presets);
    renderPartiesTab();
    renderPresetOptions();
    closePartyModal();
  });

  document.getElementById('party-modal-close').addEventListener('click', closePartyModal);
  document.getElementById('party-form-cancel').addEventListener('click', closePartyModal);
  // パーティモーダルも同様にオーバーレイ外クリックでは閉じない
}

