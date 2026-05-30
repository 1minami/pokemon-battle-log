// ===== Events Module =====
import {
  battles, formState, deleteTargetId, sortDirection, setSortDirection, statsDirty,
  editingPartyIdx, loadPresets, savePresetsData
} from './state.js';
import { showToast, getLastSeasonForRule } from './utils.js';
import { parsePokemonText } from './parser.js';
import { $filterRule, $filterSeason, $filterTournament, $filterResult, $filterPeriod, $filterTag, $statsPartySelect, saveFiltersToHash, buildTournamentFilterOptions } from './filter.js';
import { renderTable, $tableBody, $mobileCards, mobileQuery, isStatsTabActive, setRenderAllStats } from './render.js';
import { renderAllStats, renderTrendChart, renderRateTrendChart, setMatchupOppMode } from './stats.js';
import { renderPickerSlots, closePokemonGrid, updateDependentSelections, $pokemonGridOverlay, $pickerMyParty, $selectMySelect } from './picker.js';
import {
  openModal, closeModal, openDeleteConfirm, closeDeleteConfirm,
  saveBattle, editBattle, duplicateBattle, toggleBookmark, confirmDelete, deleteBattle,
  openExportModal, closeExportModal, runExport, updateExportTypeView,
  exportJSON, handleImportFile, closeImportConfirm, doImportReplace, doImportAppend,
  openNewBattleModal, openNewBattleWithParty,
  renderPresetOptions, renderPartiesTab, openPartyModal, closePartyModal, addSelectionPatternRow,
  setPartyViewMode,
  openTournamentModal, closeTournamentModal, openTournamentForm, cancelTournamentForm,
  saveTournamentFromForm, deleteTournamentById, renderTournamentList,
  rebuildTournamentFormSeasonOptions, rebuildTournamentOptions, applyTournamentParty,
  $modalOverlay, $deleteOverlay, $importOverlay, $form, $formId, $formDate,
  $formRule, $formSeason, $formTournament, $formRate, $formNotes,
  rebuildSeasonOptions, prefillRateForCurrentGroup,
  $formIntent, $formWinLossReason, $formPlayFlow, $formImprovement,
  $jsonFileInput, $presetSelect,
  $partyModalOverlay, $partyForm, $partyFormName, $partyFormNotes
} from './modal.js';
// Wire up lazy reference: render.js needs renderAllStats from stats.js
setRenderAllStats(renderAllStats);

export function initEvents() {
  // ===== Header Buttons =====
  document.getElementById('btn-add').addEventListener('click', openNewBattleModal);

  $formRule.addEventListener('change', () => {
    const keep = $formId.value ? null : getLastSeasonForRule(battles, $formRule.value);
    rebuildSeasonOptions(keep);
    rebuildTournamentOptions(null);
    prefillRateForCurrentGroup();
  });
  $formSeason.addEventListener('change', () => {
    rebuildTournamentOptions(null);
    prefillRateForCurrentGroup();
  });
  if ($formTournament) {
    $formTournament.addEventListener('change', () => {
      applyTournamentParty($formTournament.value, { overwrite: true });
      prefillRateForCurrentGroup();
    });
  }
  document.getElementById('fab-add').addEventListener('click', () => {
    const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
    if (activeTab === 'parties') openPartyModal(-1);
    else openNewBattleModal();
  });

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

  // ===== Tournament Management =====
  document.getElementById('btn-tournament-manage').addEventListener('click', openTournamentModal);
  document.getElementById('tournament-close').addEventListener('click', closeTournamentModal);
  document.getElementById('btn-tournament-new').addEventListener('click', () => openTournamentForm(null));
  document.getElementById('tournament-form-cancel').addEventListener('click', cancelTournamentForm);
  document.getElementById('tournament-form-rule').addEventListener('change', () => {
    rebuildTournamentFormSeasonOptions(null);
  });
  document.getElementById('tournament-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (saveTournamentFromForm()) {
      // refresh dependents
      buildTournamentFilterOptions();
      renderTable();
    }
  });
  document.getElementById('tournament-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const row = btn.closest('tr[data-tid]');
    if (!row) return;
    const id = row.dataset.tid;
    if (btn.dataset.action === 'edit-tournament') openTournamentForm(id);
    else if (btn.dataset.action === 'delete-tournament') {
      deleteTournamentById(id);
      buildTournamentFilterOptions();
    }
  });
  const $tournamentOverlay = document.getElementById('tournament-overlay');
  $tournamentOverlay.addEventListener('click', (e) => {
    if (e.target === $tournamentOverlay) closeTournamentModal();
  });

  // ===== Export/Import =====
  document.getElementById('btn-export').addEventListener('click', openExportModal);
  document.getElementById('btn-json-export').addEventListener('click', exportJSON);
  document.getElementById('btn-json-import').addEventListener('click', () => $jsonFileInput.click());

  // ===== CSV Export Modal =====
  document.getElementById('export-close').addEventListener('click', closeExportModal);
  document.getElementById('export-cancel').addEventListener('click', closeExportModal);
  document.getElementById('export-download').addEventListener('click', runExport);
  document.getElementById('export-type-group').addEventListener('change', updateExportTypeView);
  const $exportOverlay = document.getElementById('export-overlay');
  $exportOverlay.addEventListener('click', (e) => {
    if (e.target === $exportOverlay) closeExportModal();
  });

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

  document.getElementById('btn-preset-last').addEventListener('click', () => {
    if (battles.length === 0) { showToast('過去の対戦がありません', 'info'); return; }
    const sorted = [...battles].sort((a, b) => {
      const da = new Date(a.date), db = new Date(b.date);
      const cmp = db - da;
      return cmp !== 0 ? cmp : (a.id < b.id ? 1 : -1);
    });
    const last = sorted[0];
    formState.myParty = [...(last.myParty || [])];
    formState.myPartyItems = { ...(last.myPartyItems || {}) };
    formState.mySelect = [];
    renderPickerSlots($pickerMyParty, 'myParty', 8);
    updateDependentSelections('myParty');
    showToast('直前のパーティを読み込みました', 'success');
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
    else if (action === 'duplicate') duplicateBattle(id);
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
    else if (action === 'duplicate') duplicateBattle(id);
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
  function toHalfWidthNumber(s) {
    return String(s)
      .replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
      .replace(/[−ー―‐]/g, '-');
  }
  $formRate.addEventListener('input', () => {
    const v = $formRate.value;
    const half = toHalfWidthNumber(v);
    if (v !== half) $formRate.value = half;
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
  function onRuleOrSeasonChange() {
    buildTournamentFilterOptions();
    onFilterChange();
  }
  $filterRule.addEventListener('change', onRuleOrSeasonChange);
  if ($filterSeason) $filterSeason.addEventListener('change', onRuleOrSeasonChange);
  if ($filterTournament) $filterTournament.addEventListener('change', onFilterChange);
  $filterResult.addEventListener('change', onFilterChange);
  $filterPeriod.addEventListener('change', onFilterChange);
  if ($filterTag) $filterTag.addEventListener('change', onFilterChange);

  // ===== Form Submit =====
  $form.addEventListener('submit', (e) => {
    e.preventDefault();

    if (!$formRule.value) {
      showToast('ルールを選択してください', 'error');
      $formRule.focus();
      return;
    }
    if (!$formSeason.value) {
      showToast('シーズンを選択してください', 'error');
      $formSeason.focus();
      return;
    }
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
      season: $formSeason.value || '',
      tournament: $formTournament ? ($formTournament.value || '') : '',
      rate: rateNum,
      myParty: [...formState.myParty],
      mySelect: [...formState.mySelect],
      oppParty: [...formState.oppParty],
      oppSelect: [...formState.oppSelect],
      myPartyItems: { ...formState.myPartyItems },
      oppPartyItems: { ...formState.oppPartyItems },
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
      } else if (document.getElementById('tournament-overlay').classList.contains('active')) {
        closeTournamentModal();
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
      document.getElementById('fab-add').classList.toggle('fab-party', btn.dataset.tab === 'parties');
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
      case 'copy-party-text':
        try {
          const text = partyToText(preset);
          navigator.clipboard.writeText(text).then(
            () => showToast('テキストをコピーしました', 'success'),
            () => showToast('コピーに失敗しました', 'error')
          );
        } catch (e) {
          showToast('コピーに失敗しました', 'error');
        }
        break;
    }
  });

  document.getElementById('btn-add-party').addEventListener('click', () => {
    openPartyModal(-1);
  });

  // ===== Party Drag & Drop Reorder (Pointer Events) =====
  initPartyDragReorder($partiesGrid);

  // Party view toggle (simple/detail)
  const $partyViewToggle = document.getElementById('party-view-toggle');
  if ($partyViewToggle) {
    const initMode = localStorage.getItem('pokemon-party-view-mode') === 'detail' ? 'detail' : 'simple';
    $partyViewToggle.querySelectorAll('.pvt-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.view === initMode);
      b.addEventListener('click', () => {
        const mode = b.dataset.view;
        setPartyViewMode(mode);
        $partyViewToggle.querySelectorAll('.pvt-btn').forEach(x =>
          x.classList.toggle('active', x.dataset.view === mode)
        );
        renderPartiesTab();
      });
    });
  }

  document.getElementById('btn-add-selection-pattern').addEventListener('click', () => {
    addSelectionPatternRow();
  });

  // ===== Party Text Import =====
  const $partyTextOverlay = document.getElementById('party-text-overlay');
  const $partyTextInput = document.getElementById('party-text-input');
  const $partyTextError = document.getElementById('party-text-error');
  const closePartyTextModal = () => {
    $partyTextOverlay.classList.remove('active');
    $partyTextInput.value = '';
    $partyTextError.style.display = 'none';
    $partyTextError.textContent = '';
  };
  document.getElementById('btn-party-text-import').addEventListener('click', () => {
    $partyTextError.style.display = 'none';
    $partyTextOverlay.classList.add('active');
    setTimeout(() => $partyTextInput.focus(), 50);
  });
  document.getElementById('party-text-close').addEventListener('click', closePartyTextModal);
  document.getElementById('party-text-cancel').addEventListener('click', closePartyTextModal);
  document.getElementById('party-text-add').addEventListener('click', () => {
    const result = parsePokemonText($partyTextInput.value);
    if (result.error) {
      $partyTextError.textContent = result.error;
      $partyTextError.style.display = 'block';
      return;
    }
    if (formState.myParty.length >= 8) {
      $partyTextError.textContent = 'パーティ上限（8体）に達しています';
      $partyTextError.style.display = 'block';
      return;
    }
    if (formState.myParty.includes(result.name)) {
      $partyTextError.textContent = `「${result.name}」は既に追加済みです`;
      $partyTextError.style.display = 'block';
      return;
    }
    formState.myParty.push(result.name);
    formState.myPartyDetails[result.name] = result.details;
    if (result.details.item) {
      const isMegaStone = /ナイト[XY]?$|ナイト$/.test(result.details.item);
      formState.myPartyItems[result.name] = isMegaStone ? 'メガストーン' : result.details.item;
    }
    renderPickerSlots(document.getElementById('picker-party-edit'), 'myParty', 8, { expanded: true });
    closePartyTextModal();
    if (Array.isArray(result.warnings) && result.warnings.length > 0) {
      showToast(`「${result.name}」追加: ${result.warnings.join(' / ')}`, 'info');
    } else {
      showToast(`「${result.name}」を追加しました`, 'success');
    }
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
    const partySet = new Set(formState.myParty);
    const details = {};
    for (const [k, v] of Object.entries(formState.myPartyDetails || {})) {
      if (partySet.has(k)) details[k] = v;
    }
    const presets = loadPresets();
    if (editingPartyIdx >= 0 && editingPartyIdx < presets.length) {
      presets[editingPartyIdx].name = name;
      presets[editingPartyIdx].party = [...formState.myParty];
      presets[editingPartyIdx].items = { ...formState.myPartyItems };
      presets[editingPartyIdx].details = details;
      presets[editingPartyIdx].notes = notes;
      presets[editingPartyIdx].selectionPatterns = selectionPatterns;
      showToast(`「${name}」を更新しました`, 'success');
    } else {
      presets.push({ name, party: [...formState.myParty], items: { ...formState.myPartyItems }, details, notes, selectionPatterns });
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

function initPartyDragReorder(grid) {
  let dragging = null;
  let fromIdx = -1;
  let toIdx = -1;
  let placeBefore = true;
  let pointerId = null;

  const clearMarkers = () => {
    grid.querySelectorAll('.party-card.drop-before, .party-card.drop-after')
      .forEach(c => c.classList.remove('drop-before', 'drop-after'));
  };

  const onPointerMove = (e) => {
    if (!dragging) return;
    const cards = [...grid.querySelectorAll('.party-card')].filter(c => c !== dragging);
    clearMarkers();
    if (!cards.length) return;
    let target = null;
    let before = true;
    let minDist = Infinity;
    for (const c of cards) {
      const r = c.getBoundingClientRect();
      const mid = r.top + r.height / 2;
      const d = Math.abs(e.clientY - mid);
      if (d < minDist) {
        minDist = d;
        target = c;
        before = e.clientY < mid;
      }
    }
    if (target) {
      target.classList.add(before ? 'drop-before' : 'drop-after');
      toIdx = parseInt(target.dataset.partyIdx);
      placeBefore = before;
    }
  };

  const finish = (commit) => {
    if (!dragging) return;
    try { dragging.releasePointerCapture(pointerId); } catch {}
    dragging.classList.remove('dragging');
    clearMarkers();
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerCancel);
    if (commit && fromIdx >= 0 && toIdx >= 0) {
      const presets = loadPresets();
      let insertAt = placeBefore ? toIdx : toIdx + 1;
      if (fromIdx < insertAt) insertAt--;
      if (insertAt !== fromIdx) {
        const [moved] = presets.splice(fromIdx, 1);
        presets.splice(insertAt, 0, moved);
        savePresetsData(presets);
        renderPartiesTab();
        renderPresetOptions();
      }
    }
    dragging = null; fromIdx = -1; toIdx = -1; pointerId = null;
  };

  const onPointerUp = () => finish(true);
  const onPointerCancel = () => finish(false);

  grid.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('[data-action="drag-party"]');
    if (!handle) return;
    const card = handle.closest('.party-card');
    if (!card) return;
    e.preventDefault();
    dragging = card;
    fromIdx = parseInt(card.dataset.partyIdx);
    toIdx = fromIdx;
    placeBefore = true;
    pointerId = e.pointerId;
    card.classList.add('dragging');
    try { card.setPointerCapture(pointerId); } catch {}
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerCancel);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dragging) finish(false);
  });
}

