// ===== State =====
const STORAGE_KEY = 'pokemon-battle-log';

// ===== Mega Normalization =====
// メガ名 → 基本形へ正規化するヘルパ群。
// パーティ編成ではメガを扱わない方針のため、読み込み時に既存データを揃える。
// 選出（mySelect/oppSelect）も含めて全フィールドを基本形に戻す。
function normalizeMegaName(name) {
  return (name && MEGA_BASE[name]) ? MEGA_BASE[name] : name;
}

function normalizeMegaArray(arr) {
  if (!Array.isArray(arr)) return arr;
  const seen = new Set();
  const out = [];
  for (const n of arr) {
    const base = normalizeMegaName(n);
    if (!seen.has(base)) {
      seen.add(base);
      out.push(base);
    }
  }
  return out;
}

function normalizeMegaItemsDict(items) {
  if (!items || typeof items !== 'object') return items;
  const out = {};
  for (const [name, val] of Object.entries(items)) {
    const base = normalizeMegaName(name);
    // 競合時は先勝ち（既に基本形エントリがあればメガ側は捨てる）
    if (!(base in out)) out[base] = val;
  }
  return out;
}

function normalizeMegaInBattle(b) {
  if (!b || typeof b !== 'object') return b;
  if (Array.isArray(b.myParty))   b.myParty   = normalizeMegaArray(b.myParty);
  if (Array.isArray(b.oppParty))  b.oppParty  = normalizeMegaArray(b.oppParty);
  if (Array.isArray(b.mySelect))  b.mySelect  = normalizeMegaArray(b.mySelect);
  if (Array.isArray(b.oppSelect)) b.oppSelect = normalizeMegaArray(b.oppSelect);
  if (b.myPartyItems)  b.myPartyItems  = normalizeMegaItemsDict(b.myPartyItems);
  if (b.oppPartyItems) b.oppPartyItems = normalizeMegaItemsDict(b.oppPartyItems);
  return b;
}

function normalizeMegaInPreset(p) {
  if (!p || typeof p !== 'object') return p;
  if (Array.isArray(p.party)) p.party = normalizeMegaArray(p.party);
  if (p.items) p.items = normalizeMegaItemsDict(p.items);
  return p;
}

function loadBattles() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    return raw.map(normalizeMegaInBattle);
  } catch {
    return [];
  }
}

function saveBattlesData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    showToast('保存に失敗しました。ストレージ容量が不足している可能性があります。', 'error');
    console.error('localStorage save failed:', e);
  }
}

let battles = loadBattles();
let deleteTargetId = null;
let sortDirection = 'desc';
let statsDirty = true;
let editingPartyIdx = null;  // index of preset being edited in party tab

// Form state for pokemon selections
const formState = {
  myParty: [],    // array of pokemon names
  mySelect: [],
  oppParty: [],
  oppSelect: [],
  tags: [],       // array of tag strings
  myPartyItems: {},   // { pokemonName: itemName }
  oppPartyItems: {},  // { pokemonName: itemName }
};

// Preset tags for team archetypes
const PRESET_TAGS = [
  '対面構築', 'サイクル構築', '積み構築', '天候パ',
  'トリルパ', '壁構築', '受けループ', 'ギミック'
];

// Picker state
let pickerTarget = null; // which field is the grid picker targeting
let pickerMax = 6;

// ===== DOM References =====
const $tableBody = document.getElementById('table-body');
const $emptyState = document.getElementById('empty-state');
const $modalOverlay = document.getElementById('modal-overlay');
const $deleteOverlay = document.getElementById('delete-overlay');
const $pokemonGridOverlay = document.getElementById('pokemon-grid-overlay');
const $pokemonGrid = document.getElementById('pokemon-grid');
const $pokemonSearch = document.getElementById('pokemon-search');
const $form = document.getElementById('battle-form');
const $modalTitle = document.getElementById('modal-title');
const $statWins = document.getElementById('stat-wins');
const $statLosses = document.getElementById('stat-losses');
const $statRate = document.getElementById('stat-rate');
const $filterRule = document.getElementById('filter-rule');
const $filterResult = document.getElementById('filter-result');
const $filterPeriod = document.getElementById('filter-period');
const $filterTag = document.getElementById('filter-tag');
const $analyticsGrid = document.getElementById('analytics-grid');
const $oppAnalyticsGrid = document.getElementById('opp-analytics-grid');
const $oppPairGrid = document.getElementById('opp-pair-grid');
const $oppTrioGrid = document.getElementById('opp-trio-grid');
const $myPairGrid = document.getElementById('my-pair-grid');
const $myTrioGrid = document.getElementById('my-trio-grid');
const $statsPartySelect = document.getElementById('stats-party-select');
const $statsPartySummary = document.getElementById('stats-party-summary');
const $formId = document.getElementById('form-id');
const $formDate = document.getElementById('form-date');
const $formRule = document.getElementById('form-rule');
const $formResult = document.getElementById('form-result');
const $formRate = document.getElementById('form-rate');
const $formNotes = document.getElementById('form-notes');

// Picker containers
const $pickerMyParty = document.getElementById('picker-my-party');
const $selectMySelect = document.getElementById('select-my-select');
const $pickerOppParty = document.getElementById('picker-opp-party');
const $selectOppSelect = document.getElementById('select-opp-select');

// ===== Helpers =====
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function getPokemonSlug(name) {
  const p = POKEMON_BY_NAME[name];
  return p ? p.slug : null;
}

// ===== Toast Notification =====
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ===== Tag Picker =====
const $tagPicker = document.getElementById('tag-picker');
const $tagSelected = document.getElementById('tag-selected');
const $tagCustom = document.getElementById('tag-custom');

function renderTagPicker() {
  $tagPicker.innerHTML = PRESET_TAGS.map(tag => {
    const isActive = formState.tags.includes(tag);
    return `<button type="button" class="tag-preset-btn${isActive ? ' active' : ''}" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`;
  }).join('');

  $tagPicker.querySelectorAll('.tag-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.tag;
      if (formState.tags.includes(tag)) {
        formState.tags = formState.tags.filter(t => t !== tag);
      } else {
        formState.tags.push(tag);
      }
      renderTagPicker();
    });
  });

  renderSelectedTags();
}

function renderSelectedTags() {
  const customTags = formState.tags.filter(t => !PRESET_TAGS.includes(t));
  if (customTags.length === 0) {
    $tagSelected.innerHTML = '';
    return;
  }
  $tagSelected.innerHTML = customTags.map(tag =>
    `<span class="tag-badge">${escapeHtml(tag)}<button type="button" class="tag-remove" data-tag="${escapeHtml(tag)}">×</button></span>`
  ).join('');

  $tagSelected.querySelectorAll('.tag-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      formState.tags = formState.tags.filter(t => t !== btn.dataset.tag);
      renderTagPicker();
    });
  });
}

$tagCustom.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const tag = $tagCustom.value.trim();
    if (tag && !formState.tags.includes(tag)) {
      formState.tags.push(tag);
      renderTagPicker();
    }
    $tagCustom.value = '';
  }
});

// ===== Item Ordering =====
// Sort ITEM_LIST by usage count across opponent records (desc). Unused items
// keep their original order at the tail. Used only for the opponent side, so
// frequently-seen items (from the user's perspective) surface to the top.
function getOppItemUsageOrder() {
  const counts = {};
  battles.forEach(b => {
    const items = b.oppPartyItems || {};
    Object.values(items).forEach(item => {
      if (!item) return;
      counts[item] = (counts[item] || 0) + 1;
    });
  });
  return [...ITEM_LIST].sort((a, b) => {
    const ca = counts[a] || 0;
    const cb = counts[b] || 0;
    if (cb !== ca) return cb - ca;
    return ITEM_LIST.indexOf(a) - ITEM_LIST.indexOf(b);
  });
}

function getItemListForField(itemsField) {
  return itemsField === 'oppPartyItems' ? getOppItemUsageOrder() : ITEM_LIST;
}

// ===== Pokemon Picker Slots Rendering =====
let dragState = { field: null, fromIdx: -1 };

function renderPickerSlots(container, field, max) {
  const selected = formState[field];
  const itemsFieldMap = { myParty: 'myPartyItems', oppParty: 'oppPartyItems' };
  const itemsField = itemsFieldMap[field];
  container.innerHTML = '';

  // Render filled slots
  selected.forEach((name, idx) => {
    const slug = getPokemonSlug(name);
    const slot = document.createElement('div');
    slot.className = 'poke-slot filled';
    slot.draggable = true;
    slot.dataset.idx = idx;

    let itemHtml = '';
    if (itemsField) {
      const currentItem = (formState[itemsField] || {})[name] || '';
      const itemList = getItemListForField(itemsField);
      const options = itemList.map(item =>
        `<option value="${escapeHtml(item)}"${item === currentItem ? ' selected' : ''}>${escapeHtml(item)}</option>`
      ).join('');
      itemHtml = `<select class="slot-item" data-poke="${escapeHtml(name)}"><option value="">—</option>${options}</select>`;
    }

    slot.innerHTML = `
      <img src="${getSpriteUrl(slug || 'substitute')}" alt="${escapeHtml(name)}" title="${escapeHtml(name)}">
      <span class="slot-remove" data-idx="${idx}">×</span>
      ${itemHtml}
      <span class="slot-name">${escapeHtml(name)}</span>
    `;

    // Item change handler
    const itemSelect = slot.querySelector('.slot-item');
    if (itemSelect) {
      itemSelect.addEventListener('change', () => {
        if (itemSelect.value) formState[itemsField][name] = itemSelect.value;
        else delete formState[itemsField][name];
      });
      itemSelect.addEventListener('mousedown', (e) => e.stopPropagation());
      itemSelect.addEventListener('pointerdown', (e) => e.stopPropagation());
    }

    // Click remove button
    slot.querySelector('.slot-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      formState[field].splice(idx, 1);
      renderPickerSlots(container, field, max);
      updateDependentSelections(field);
    });

    // Drag & drop reorder
    slot.addEventListener('dragstart', (e) => {
      dragState = { field, fromIdx: idx };
      slot.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    slot.addEventListener('dragend', () => {
      slot.classList.remove('dragging');
      container.querySelectorAll('.poke-slot').forEach(s => s.classList.remove('drag-over'));
    });
    slot.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    slot.addEventListener('dragenter', (e) => {
      e.preventDefault();
      if (dragState.field === field && parseInt(slot.dataset.idx) !== dragState.fromIdx) {
        slot.classList.add('drag-over');
      }
    });
    slot.addEventListener('dragleave', () => {
      slot.classList.remove('drag-over');
    });
    slot.addEventListener('drop', (e) => {
      e.preventDefault();
      slot.classList.remove('drag-over');
      if (dragState.field !== field) return;
      const toIdx = parseInt(slot.dataset.idx);
      if (dragState.fromIdx === toIdx) return;
      const arr = formState[field];
      const [moved] = arr.splice(dragState.fromIdx, 1);
      arr.splice(toIdx, 0, moved);
      renderPickerSlots(container, field, max);
      updateDependentSelections(field);
    });

    container.appendChild(slot);
  });

  // Render add slot if not full
  if (selected.length < max) {
    const addSlot = document.createElement('div');
    addSlot.className = 'poke-slot';
    addSlot.innerHTML = '<span class="slot-add">＋</span>';
    addSlot.addEventListener('click', () => {
      openPokemonGrid(field, max);
    });
    container.appendChild(addSlot);
  }
}

// ===== Party Items (item selection per Pokemon) =====
function renderPartyItems(container, partyField, itemsField) {
  const party = formState[partyField];
  const items = formState[itemsField];

  if (!container || party.length === 0) {
    if (container) container.innerHTML = '';
    return;
  }

  const itemList = getItemListForField(itemsField);
  container.innerHTML = party.map(name => {
    const currentItem = items[name] || '';
    const options = itemList.map(item =>
      `<option value="${escapeHtml(item)}"${item === currentItem ? ' selected' : ''}>${escapeHtml(item)}</option>`
    ).join('');

    return `<select class="party-item-select" data-poke="${escapeHtml(name)}" title="${escapeHtml(name)}の持ち物">
      <option value="">—</option>
      ${options}
    </select>`;
  }).join('');

  container.querySelectorAll('.party-item-select').forEach(select => {
    select.addEventListener('change', () => {
      const pokeName = select.dataset.poke;
      if (select.value) {
        formState[itemsField][pokeName] = select.value;
      } else {
        delete formState[itemsField][pokeName];
      }
    });
  });
}

// ===== Select From Party (for selections) =====
function findSelectedForm(baseName, fieldArr) {
  const megas = MEGA_MAP[baseName] || [];
  const allForms = [baseName, ...megas];
  return allForms.find(f => fieldArr.includes(f)) || null;
}

function renderSelectFromParty(container, field, sourceField, max) {
  const partyList = formState[sourceField];
  container.innerHTML = '';

  if (partyList.length === 0) {
    container.innerHTML = '<span class="empty-hint">先にパーティを設定してください</span>';
    return;
  }

  partyList.forEach(baseName => {
    const megas = MEGA_MAP[baseName] || [];
    const allForms = [baseName, ...megas];
    const selectedForm = findSelectedForm(baseName, formState[field]);
    const isSelected = !!selectedForm;
    const displayName = selectedForm || baseName;
    const slug = getPokemonSlug(displayName);
    const icon = document.createElement('div');
    icon.className = 'party-icon' + (isSelected ? ' selected' : '');

    let html = `<img src="${getSpriteUrl(slug || 'substitute')}" alt="${escapeHtml(displayName)}" title="${escapeHtml(displayName)}">`;

    // Show mega toggle on selected pokemon that have mega forms
    if (megas.length > 0 && isSelected) {
      const isMega = selectedForm !== baseName;
      html += `<span class="mega-badge${isMega ? ' active' : ''}" title="メガ進化切替">M</span>`;
    }

    icon.innerHTML = html;

    // Click handler: toggle selection
    icon.addEventListener('click', (e) => {
      if (e.target.closest('.mega-badge')) return;
      if (isSelected) {
        formState[field] = formState[field].filter(n => !allForms.includes(n));
      } else {
        if (formState[field].length < max) {
          formState[field].push(baseName);
        }
      }
      renderSelectFromParty(container, field, sourceField, max);
    });

    // Mega toggle handler
    if (megas.length > 0 && isSelected) {
      const megaBtn = icon.querySelector('.mega-badge');
      if (megaBtn) {
        megaBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const currentIdx = allForms.indexOf(selectedForm);
          const nextIdx = (currentIdx + 1) % allForms.length;
          const nextForm = allForms[nextIdx];
          const idx = formState[field].indexOf(selectedForm);
          if (idx !== -1) formState[field][idx] = nextForm;
          renderSelectFromParty(container, field, sourceField, max);
        });
      }
    }

    container.appendChild(icon);
  });
}

// When party changes, sync selections
function updateDependentSelections(changedField) {
  if (changedField === 'myParty') {
    const partySet = new Set(formState.myParty);
    formState.mySelect = formState.mySelect.filter(n => partySet.has(n) || partySet.has(MEGA_BASE[n]));
    Object.keys(formState.myPartyItems).forEach(name => {
      if (!partySet.has(name)) delete formState.myPartyItems[name];
    });
    renderSelectFromParty($selectMySelect, 'mySelect', 'myParty', 4);
  }
  if (changedField === 'oppParty') {
    const partySet = new Set(formState.oppParty);
    formState.oppSelect = formState.oppSelect.filter(n => partySet.has(n) || partySet.has(MEGA_BASE[n]));
    Object.keys(formState.oppPartyItems).forEach(name => {
      if (!partySet.has(name)) delete formState.oppPartyItems[name];
    });
    renderSelectFromParty($selectOppSelect, 'oppSelect', 'oppParty', 4);
  }
}

// ===== Pokemon Grid Modal =====
function openPokemonGrid(field, max) {
  pickerTarget = field;
  pickerMax = max;
  $pokemonSearch.value = '';
  renderPokemonGrid('');
  $pokemonGridOverlay.classList.add('active');
  setTimeout(() => $pokemonSearch.focus(), 100);
}

function closePokemonGrid() {
  $pokemonGridOverlay.classList.remove('active');
  pickerTarget = null;
}

function getPokemonUsageCounts() {
  const counts = {};
  battles.forEach(b => {
    (b.myParty || []).forEach(name => { counts[name] = (counts[name] || 0) + 1; });
    (b.oppParty || []).forEach(name => { counts[name] = (counts[name] || 0) + 1; });
  });
  return counts;
}

function renderPokemonGrid(query) {
  const q = query.trim().toLowerCase();
  const alreadySelected = new Set(formState[pickerTarget] || []);

  // Filter by the currently-selected rule's regulation allowlist, if any.
  const currentRule = $formRule.value;
  const allowedSet = currentRule ? REGULATION_POKEMON_SET[currentRule] : null;
  let filtered = allowedSet
    ? POKEMON_DB.filter(p => allowedSet.has(p.name))
    : POKEMON_DB;

  // メガ進化フォームはパーティ編成のグリッドに出さない（選出ステップでのみ切替可能）。
  filtered = filtered.filter(p => !MEGA_BASE[p.name]);

  if (q) {
    const qHira = toHiragana(q);
    filtered = filtered.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.slug.toLowerCase().includes(q) ||
      p.searchHira.includes(qHira) ||
      p.searchRomaji.includes(q)
    );
  }

  // Sort by usage count (most used first)
  const usage = getPokemonUsageCounts();
  filtered.sort((a, b) => (usage[b.name] || 0) - (usage[a.name] || 0));

  $pokemonGrid.innerHTML = filtered.map(p => {
    const isDisabled = alreadySelected.has(p.name);
    return `
      <div class="poke-grid-item${isDisabled ? ' disabled' : ''}" data-name="${escapeHtml(p.name)}" data-slug="${p.slug}">
        <img src="${getSpriteUrl(p.slug)}" alt="${escapeHtml(p.name)}" loading="lazy">
        <span class="poke-grid-name">${escapeHtml(p.name)}</span>
      </div>
    `;
  }).join('');

  // Attach click handlers
  $pokemonGrid.querySelectorAll('.poke-grid-item:not(.disabled)').forEach(item => {
    item.addEventListener('click', () => {
      const name = item.dataset.name;
      if (!pickerTarget) return;

      formState[pickerTarget].push(name);

      // Re-render the corresponding picker
      if (pickerTarget === 'myParty') {
        if ($partyModalOverlay.classList.contains('active')) {
          renderPickerSlots($pickerPartyEdit, 'myParty', 6);
        } else {
          renderPickerSlots($pickerMyParty, 'myParty', 6);
          updateDependentSelections('myParty');
        }
      } else if (pickerTarget === 'oppParty') {
        renderPickerSlots($pickerOppParty, 'oppParty', 6);
        updateDependentSelections('oppParty');
      }

      // Close if reached max
      if (formState[pickerTarget].length >= pickerMax) {
        closePokemonGrid();
      } else {
        // Update grid to disable already selected, then return focus to search
        // so the user can immediately type the next Pokemon name.
        $pokemonSearch.value = '';
        renderPokemonGrid('');
        $pokemonSearch.focus();
      }
    });
  });
}

$pokemonSearch.addEventListener('input', () => {
  renderPokemonGrid($pokemonSearch.value);
});

$pokemonGridOverlay.addEventListener('click', (e) => {
  if (e.target === $pokemonGridOverlay) closePokemonGrid();
});

document.getElementById('pokemon-grid-close').addEventListener('click', closePokemonGrid);

// ===== Period Filter =====
function filterByPeriod(list) {
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
function buildTagFilterOptions() {
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
function getFilteredBattles() {
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
    // Same date → sort by id (timestamp-based) for stable order
    const cmp = dateCmp !== 0 ? dateCmp : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    return sortDirection === 'desc' ? -cmp : cmp;
  });

  return filtered;
}

// ===== Rendering Table =====
function renderPokeIconsHtml(list, highlightList, opts = {}) {
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
const $mobileCards = document.getElementById('mobile-cards');

function renderBattleCardHtml(b, idx, total) {
  const resultClass = b.result === '勝ち' ? 'win' : b.result === '負け' ? 'lose' : 'draw';
  const resultLabel = b.result === '勝ち' ? 'WIN' : b.result === '負け' ? 'LOSE' : 'DRAW';
  const rateHtml = (b.rate !== undefined && b.rate !== null && b.rate !== '')
    ? `<span class="bc-rate">${escapeHtml(String(b.rate))}</span>` : '';
  const tagsHtml = (b.tags && b.tags.length > 0)
    ? b.tags.map(t => `<span class="tag-badge">${escapeHtml(t)}</span>`).join('') : '';
  const notesHtml = b.notes ? `<div class="bc-notes" title="${escapeHtml(b.notes)}">${escapeHtml(b.notes)}</div>` : '';

  return `
  <div class="battle-card" data-id="${b.id}" style="animation-delay:${Math.min(idx * 30, 300)}ms">
    <div class="bc-header">
      <span class="bc-date">${formatDate(b.date)}</span>
      <span class="result-badge ${resultClass}">${resultLabel}</span>
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

function renderMobileCards(filtered) {
  if (!$mobileCards) return;
  if (filtered.length === 0) {
    $mobileCards.innerHTML = '';
  } else {
    $mobileCards.innerHTML = filtered.map((b, i) => renderBattleCardHtml(b, i, filtered.length)).join('');
  }
}

function renderTable() {
  const filtered = getFilteredBattles();

  if (filtered.length === 0) {
    $tableBody.innerHTML = '';
    $mobileCards.innerHTML = '';
    $emptyState.classList.add('visible');
  } else {
    $emptyState.classList.remove('visible');
    $tableBody.innerHTML = filtered.map((b, i) => {
      return `
      <tr data-id="${b.id}" style="animation-delay:${Math.min(i * 30, 300)}ms">
        <td class="cell-num">${filtered.length - i}</td>
        <td class="cell-date">${formatDate(b.date)}</td>
        <td class="cell-rule"><span class="rule-badge">${escapeHtml(b.rule || '—')}</span></td>
        <td class="cell-result">
          <span class="result-badge ${b.result === '勝ち' ? 'win' : b.result === '負け' ? 'lose' : 'draw'}">
            ${b.result === '勝ち' ? 'WIN' : b.result === '負け' ? 'LOSE' : 'DRAW'}
          </span>
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
        <td class="cell-notes" title="${escapeHtml(b.notes || '')}">${escapeHtml(b.notes || '') || '<span style="color:var(--text-muted)">—</span>'}</td>
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
    renderMobileCards(filtered);
  }

  updateStats(filtered);
  buildTagFilterOptions();
  statsDirty = true;
  if (isStatsTabActive()) renderAllStats();
}

function isStatsTabActive() {
  return document.querySelector('.tab-btn[data-tab="stats"]').classList.contains('active');
}

// ===== Trend Chart (Canvas) =====
const $trendCanvas = document.getElementById('trend-canvas');
const $trendEmpty = document.getElementById('trend-empty');

function renderTrendChart() {
  const statBattles = getStatsFilteredBattles();
  // Sort by date ascending, then by id for stable order
  const sorted = [...statBattles].sort((a, b) => {
    const da = new Date(a.date);
    const db = new Date(b.date);
    const dateCmp = da - db;
    return dateCmp !== 0 ? dateCmp : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });

  if (sorted.length < 2) {
    $trendCanvas.style.display = 'none';
    $trendEmpty.style.display = 'block';
    return;
  }
  $trendCanvas.style.display = 'block';
  $trendEmpty.style.display = 'none';

  const canvas = $trendCanvas;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = 260 * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const W = rect.width;
  const H = 260;
  const pad = { top: 24, right: 24, bottom: 36, left: 44 };
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top - pad.bottom;

  // Compute cumulative win rate
  let wins = 0;
  let total = 0;
  const points = sorted.map((b, i) => {
    if (b.result === '勝ち') wins++;
    if (b.result === '勝ち' || b.result === '負け') total++;
    const rate = total > 0 ? (wins / total) * 100 : 0;
    return { idx: i, rate, date: b.date, result: b.result };
  });

  const n = points.length;
  const xStep = chartW / Math.max(n - 1, 1);

  // Clear
  ctx.clearRect(0, 0, W, H);

  // Grid lines & Y-axis labels
  ctx.strokeStyle = 'rgba(42,45,62,0.8)';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#6b7280';
  ctx.font = '11px Inter, Noto Sans JP, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  for (let pct = 0; pct <= 100; pct += 25) {
    const y = pad.top + chartH - (pct / 100) * chartH;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(W - pad.right, y);
    ctx.stroke();
    ctx.fillText(`${pct}%`, pad.left - 8, y);
  }

  // 50% reference line (highlighted)
  const y50 = pad.top + chartH - 0.5 * chartH;
  ctx.strokeStyle = 'rgba(234,179,8,0.3)';
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(pad.left, y50);
  ctx.lineTo(W - pad.right, y50);
  ctx.stroke();
  ctx.setLineDash([]);

  // X-axis labels (show a few date labels)
  ctx.fillStyle = '#6b7280';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const labelInterval = Math.max(1, Math.floor(n / 8));
  for (let i = 0; i < n; i += labelInterval) {
    const x = pad.left + i * xStep;
    const d = new Date(points[i].date);
    ctx.fillText(`${d.getMonth() + 1}/${d.getDate()}`, x, H - pad.bottom + 8);
  }
  // Always show last label
  if ((n - 1) % labelInterval !== 0) {
    const x = pad.left + (n - 1) * xStep;
    const d = new Date(points[n - 1].date);
    ctx.fillText(`${d.getMonth() + 1}/${d.getDate()}`, x, H - pad.bottom + 8);
  }

  // Draw area fill
  const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + chartH);
  gradient.addColorStop(0, 'rgba(99,102,241,0.25)');
  gradient.addColorStop(1, 'rgba(99,102,241,0.02)');

  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top + chartH);
  points.forEach((p, i) => {
    const x = pad.left + i * xStep;
    const y = pad.top + chartH - (p.rate / 100) * chartH;
    if (i === 0) ctx.lineTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineTo(pad.left + (n - 1) * xStep, pad.top + chartH);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Draw line
  ctx.beginPath();
  ctx.strokeStyle = '#6366f1';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  points.forEach((p, i) => {
    const x = pad.left + i * xStep;
    const y = pad.top + chartH - (p.rate / 100) * chartH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Draw dots
  points.forEach((p, i) => {
    const x = pad.left + i * xStep;
    const y = pad.top + chartH - (p.rate / 100) * chartH;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = p.result === '勝ち' ? '#22c55e' : p.result === '負け' ? '#ef4444' : '#6b7280';
    ctx.fill();
  });

  // Final rate label
  const lastP = points[n - 1];
  const lastX = pad.left + (n - 1) * xStep;
  const lastY = pad.top + chartH - (lastP.rate / 100) * chartH;
  ctx.fillStyle = '#818cf8';
  ctx.font = 'bold 13px Inter, Noto Sans JP, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${Math.round(lastP.rate)}%`, lastX + 8, lastY - 4);
}

// ===== Rate Trend Chart (Canvas) =====
const $rateTrendCanvas = document.getElementById('rate-trend-canvas');
const $rateTrendEmpty = document.getElementById('rate-trend-empty');

function renderRateTrendChart() {
  if (!$rateTrendCanvas) return;
  const statBattles = getStatsFilteredBattles();
  const sorted = [...statBattles]
    .filter(b => typeof b.rate === 'number' && !Number.isNaN(b.rate))
    .sort((a, b) => {
      const da = new Date(a.date);
      const db = new Date(b.date);
      const dateCmp = da - db;
      return dateCmp !== 0 ? dateCmp : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    });

  if (sorted.length < 2) {
    $rateTrendCanvas.style.display = 'none';
    $rateTrendEmpty.style.display = 'block';
    return;
  }
  $rateTrendCanvas.style.display = 'block';
  $rateTrendEmpty.style.display = 'none';

  const canvas = $rateTrendCanvas;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = 260 * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const W = rect.width;
  const H = 260;
  const pad = { top: 24, right: 24, bottom: 36, left: 56 };
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top - pad.bottom;

  const points = sorted.map((b, i) => ({
    idx: i,
    rate: b.rate,
    date: b.date,
    result: b.result
  }));
  const n = points.length;
  const xStep = chartW / Math.max(n - 1, 1);

  const rates = points.map(p => p.rate);
  const rawMin = Math.min(...rates);
  const rawMax = Math.max(...rates);
  const range = Math.max(rawMax - rawMin, 1);
  const margin = Math.max(Math.ceil(range * 0.1), 10);
  const yMin = Math.floor((rawMin - margin) / 10) * 10;
  const yMax = Math.ceil((rawMax + margin) / 10) * 10;
  const yRange = Math.max(yMax - yMin, 1);

  ctx.clearRect(0, 0, W, H);

  // Grid lines & Y-axis labels
  ctx.strokeStyle = 'rgba(42,45,62,0.8)';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#6b7280';
  ctx.font = '11px Inter, Noto Sans JP, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  const steps = 4;
  for (let s = 0; s <= steps; s++) {
    const val = yMin + (yRange * s) / steps;
    const y = pad.top + chartH - ((val - yMin) / yRange) * chartH;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(W - pad.right, y);
    ctx.stroke();
    ctx.fillText(`${Math.round(val)}`, pad.left - 8, y);
  }

  // X-axis labels
  ctx.fillStyle = '#6b7280';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const labelInterval = Math.max(1, Math.floor(n / 8));
  for (let i = 0; i < n; i += labelInterval) {
    const x = pad.left + i * xStep;
    const d = new Date(points[i].date);
    ctx.fillText(`${d.getMonth() + 1}/${d.getDate()}`, x, H - pad.bottom + 8);
  }
  if ((n - 1) % labelInterval !== 0) {
    const x = pad.left + (n - 1) * xStep;
    const d = new Date(points[n - 1].date);
    ctx.fillText(`${d.getMonth() + 1}/${d.getDate()}`, x, H - pad.bottom + 8);
  }

  // Area fill
  const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + chartH);
  gradient.addColorStop(0, 'rgba(234,179,8,0.25)');
  gradient.addColorStop(1, 'rgba(234,179,8,0.02)');

  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top + chartH);
  points.forEach((p, i) => {
    const x = pad.left + i * xStep;
    const y = pad.top + chartH - ((p.rate - yMin) / yRange) * chartH;
    ctx.lineTo(x, y);
  });
  ctx.lineTo(pad.left + (n - 1) * xStep, pad.top + chartH);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.strokeStyle = '#eab308';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  points.forEach((p, i) => {
    const x = pad.left + i * xStep;
    const y = pad.top + chartH - ((p.rate - yMin) / yRange) * chartH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Dots colored by result
  points.forEach((p, i) => {
    const x = pad.left + i * xStep;
    const y = pad.top + chartH - ((p.rate - yMin) / yRange) * chartH;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = p.result === '勝ち' ? '#22c55e' : p.result === '負け' ? '#ef4444' : '#6b7280';
    ctx.fill();
  });

  // Final rate label
  const lastP = points[n - 1];
  const lastX = pad.left + (n - 1) * xStep;
  const lastY = pad.top + chartH - ((lastP.rate - yMin) / yRange) * chartH;
  ctx.fillStyle = '#facc15';
  ctx.font = 'bold 13px Inter, Noto Sans JP, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${lastP.rate}`, lastX + 8, lastY - 4);
}

function renderAllStats() {
  buildPartyOptions();
  updatePartySummary();
  renderTrendChart();
  renderRateTrendChart();
  renderAnalytics();
  renderMyCombos();
  renderOppAnalytics();
  renderOppCombos();
  statsDirty = false;
}

function updateStats(filtered) {
  const all = filtered || getFilteredBattles();
  const wins = all.filter(b => b.result === '勝ち').length;
  const losses = all.filter(b => b.result === '負け').length;
  const total = wins + losses;
  const rate = total > 0 ? Math.round((wins / total) * 100) : 0;

  $statWins.textContent = wins;
  $statLosses.textContent = losses;
  $statRate.textContent = total > 0 ? `${rate}%` : '—%';
}

// ===== Analytics =====
function partyKey(party) {
  return [...(party || [])].sort().join(',');
}

function getStatsFilteredBattles() {
  const pokeName = $statsPartySelect.value;
  let filtered = filterByPeriod(battles);
  if (pokeName) filtered = filtered.filter(b => (b.myParty || []).includes(pokeName));
  return filtered;
}

function buildPartyOptions() {
  const pokeMap = {};
  filterByPeriod(battles).forEach(b => {
    (b.myParty || []).forEach(poke => {
      if (!pokeMap[poke]) pokeMap[poke] = { name: poke, count: 0 };
      pokeMap[poke].count++;
    });
  });

  const sorted = Object.values(pokeMap).sort((a, b) => b.count - a.count);
  const prev = $statsPartySelect.value;
  $statsPartySelect.innerHTML = '<option value="">すべて</option>';
  sorted.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.name;
    opt.textContent = p.name + ` (${p.count}戦)`;
    $statsPartySelect.appendChild(opt);
  });
  $statsPartySelect.value = prev;
}

function updatePartySummary() {
  const filtered = getStatsFilteredBattles();
  const wins = filtered.filter(b => b.result === '勝ち').length;
  const losses = filtered.filter(b => b.result === '負け').length;
  const draws = filtered.filter(b => b.result === '引き分け').length;
  const total = wins + losses;
  const rate = total > 0 ? Math.round((wins / total) * 100) : 0;

  let html = `<span class="sp-wins">${wins}W</span><span class="sp-losses">${losses}L</span>`;
  if (draws > 0) html += `<span class="sp-draws">${draws}D</span>`;
  html += `<span class="sp-rate">${total > 0 ? rate + '%' : '—%'}</span>`;
  $statsPartySummary.innerHTML = html;
}

function renderAnalytics() {
  const statBattles = getStatsFilteredBattles();
  if (statBattles.length === 0) {
    $analyticsGrid.innerHTML = '<p style="color:var(--text-muted); grid-column: 1/-1; text-align:center; padding:24px;">対戦記録を追加すると統計が表示されます</p>';
    return;
  }

  const pokeStats = {};
  statBattles.forEach(b => {
    (b.mySelect || []).forEach(poke => {
      if (!pokeStats[poke]) pokeStats[poke] = { name: poke, wins: 0, losses: 0, total: 0 };
      pokeStats[poke].total++;
      if (b.result === '勝ち') pokeStats[poke].wins++;
      else pokeStats[poke].losses++;
    });
  });

  const sorted = Object.values(pokeStats).sort((a, b) => b.total - a.total);

  if (sorted.length === 0) {
    $analyticsGrid.innerHTML = '<p style="color:var(--text-muted); grid-column: 1/-1; text-align:center; padding:24px;">選出データを入力すると統計が表示されます</p>';
    return;
  }

  const maxTotal = sorted[0].total;

  $analyticsGrid.innerHTML = sorted.map(p => {
    const winRate = p.total > 0 ? Math.round((p.wins / p.total) * 100) : 0;
    const winWidth = maxTotal > 0 ? Math.round((p.wins / maxTotal) * 100) : 0;
    const loseWidth = maxTotal > 0 ? Math.round((p.losses / maxTotal) * 100) : 0;
    const slug = getPokemonSlug(p.name);
    return `
      <div class="poke-stat-card">
        <img class="poke-stat-sprite" src="${getSpriteUrl(slug || 'substitute')}" alt="${escapeHtml(p.name)}">
        <div class="poke-stat-info">
          <div class="poke-stat-name">${escapeHtml(p.name)} <span style="color:var(--text-muted);font-size:0.7rem;font-weight:400">${winRate}%</span></div>
          <div class="poke-stat-bars">
            <div class="poke-stat-row">
              <span class="label">W</span>
              <div class="bar-bg"><div class="bar-fill win" style="width:${winWidth}%"></div></div>
              <span class="count">${p.wins}</span>
            </div>
            <div class="poke-stat-row">
              <span class="label">L</span>
              <div class="bar-bg"><div class="bar-fill lose" style="width:${loseWidth}%"></div></div>
              <span class="count">${p.losses}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ===== My Combo Analytics (Pairs & Trios) =====
function renderMyCombos() {
  renderMyComboGrid($myPairGrid, 2);
  renderMyComboGrid($myTrioGrid, 3);
}

function renderMyComboGrid(container, size) {
  const statBattles = getStatsFilteredBattles();
  const emptyMsg = size === 2
    ? '選出データを2体以上入力すると統計が表示されます'
    : '選出データを3体以上入力すると統計が表示されます';

  if (statBattles.length === 0) {
    container.innerHTML = `<p style="color:var(--text-muted); grid-column: 1/-1; text-align:center; padding:24px;">${emptyMsg}</p>`;
    return;
  }

  const comboStats = {};
  statBattles.forEach(b => {
    const sel = b.mySelect || [];
    if (sel.length < size) return;
    const combos = getCombinations(sel, size);
    combos.forEach(combo => {
      const key = comboKey(combo);
      const names = comboDisplayNames(combo);
      if (!comboStats[key]) comboStats[key] = { names, count: 0, wins: 0, losses: 0 };
      comboStats[key].count++;
      if (b.result === '勝ち') comboStats[key].wins++;
      else comboStats[key].losses++;
    });
  });

  const sorted = Object.values(comboStats).sort((a, b) => b.count - a.count);

  if (sorted.length === 0) {
    container.innerHTML = `<p style="color:var(--text-muted); grid-column: 1/-1; text-align:center; padding:24px;">${emptyMsg}</p>`;
    return;
  }

  const maxCount = sorted[0].count;

  container.innerHTML = sorted.map(c => {
    const winRate = c.count > 0 ? Math.round((c.wins / c.count) * 100) : 0;
    const winWidth = maxCount > 0 ? Math.round((c.wins / maxCount) * 100) : 0;
    const loseWidth = maxCount > 0 ? Math.round((c.losses / maxCount) * 100) : 0;
    const sprites = c.names.map((name, i) => {
      const slug = getPokemonSlug(name);
      return `<img class="combo-sprite${i === 0 ? ' lead' : ''}" src="${getSpriteUrl(slug || 'substitute')}" alt="${escapeHtml(name)}" title="${escapeHtml(name)}">`;
    }).join('');
    return `
      <div class="poke-stat-card combo-card">
        <div class="combo-sprites">${sprites}</div>
        <div class="poke-stat-info">
          <div class="poke-stat-name">${c.names.map(n => escapeHtml(n)).join(' + ')} <span style="color:var(--text-muted);font-size:0.7rem;font-weight:400">${winRate}%</span></div>
          <div class="poke-stat-bars">
            <div class="poke-stat-row">
              <span class="label">W</span>
              <div class="bar-bg"><div class="bar-fill win" style="width:${winWidth}%"></div></div>
              <span class="count">${c.wins}</span>
            </div>
            <div class="poke-stat-row">
              <span class="label">L</span>
              <div class="bar-bg"><div class="bar-fill lose" style="width:${loseWidth}%"></div></div>
              <span class="count">${c.losses}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ===== Opponent Analytics =====
function renderOppAnalytics() {
  const statBattles = getStatsFilteredBattles();
  if (statBattles.length === 0) {
    $oppAnalyticsGrid.innerHTML = '<p style="color:var(--text-muted); grid-column: 1/-1; text-align:center; padding:24px;">対戦記録を追加すると統計が表示されます</p>';
    return;
  }

  const pokeStats = {};
  statBattles.forEach(b => {
    const isWin = b.result === '勝ち';
    const selectedSet = new Set(b.oppSelect || []);

    (b.oppParty || []).forEach(poke => {
      if (!pokeStats[poke]) pokeStats[poke] = { name: poke, encountered: 0, selected: 0, wins: 0 };
      pokeStats[poke].encountered++;
      const megaSelected = (MEGA_MAP[poke] || []).some(m => selectedSet.has(m));
      if (selectedSet.has(poke) || megaSelected) pokeStats[poke].selected++;
      if (isWin) pokeStats[poke].wins++;
    });
  });

  const sorted = Object.values(pokeStats).sort((a, b) => b.encountered - a.encountered);

  if (sorted.length === 0) {
    $oppAnalyticsGrid.innerHTML = '<p style="color:var(--text-muted); grid-column: 1/-1; text-align:center; padding:24px;">相手パーティのデータを入力すると統計が表示されます</p>';
    return;
  }

  const maxEncountered = sorted[0].encountered;

  $oppAnalyticsGrid.innerHTML = sorted.map(p => {
    const winRate = p.encountered > 0 ? Math.round((p.wins / p.encountered) * 100) : 0;
    const encWidth = maxEncountered > 0 ? Math.round((p.encountered / maxEncountered) * 100) : 0;
    const selWidth = maxEncountered > 0 ? Math.round((p.selected / maxEncountered) * 100) : 0;
    const slug = getPokemonSlug(p.name);
    return `
      <div class="poke-stat-card">
        <img class="poke-stat-sprite" src="${getSpriteUrl(slug || 'substitute')}" alt="${escapeHtml(p.name)}">
        <div class="poke-stat-info">
          <div class="poke-stat-name">${escapeHtml(p.name)} <span style="color:var(--text-muted);font-size:0.7rem;font-weight:400">勝率${winRate}%</span></div>
          <div class="poke-stat-bars">
            <div class="poke-stat-row">
              <span class="label">遭遇</span>
              <div class="bar-bg"><div class="bar-fill opp-enc" style="width:${encWidth}%"></div></div>
              <span class="count">${p.encountered}</span>
            </div>
            <div class="poke-stat-row">
              <span class="label">選出</span>
              <div class="bar-bg"><div class="bar-fill opp-sel" style="width:${selWidth}%"></div></div>
              <span class="count">${p.selected}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ===== Opponent Combo Analytics (Pairs & Trios) =====
function getCombinations(arr, size) {
  const results = [];
  function combo(start, current) {
    if (current.length === size) { results.push([...current]); return; }
    for (let i = start; i < arr.length; i++) {
      current.push(arr[i]);
      combo(i + 1, current);
      current.pop();
    }
  }
  combo(0, []);
  return results;
}

// Lead-preserving key: fix first element (lead), sort the rest
function comboKey(combo) {
  if (combo.length <= 1) return combo.join('+');
  return combo[0] + '+' + [...combo.slice(1)].sort().join('+');
}

function comboDisplayNames(combo) {
  if (combo.length <= 1) return [...combo];
  return [combo[0], ...combo.slice(1).sort()];
}

function renderOppCombos() {
  renderOppComboGrid($oppPairGrid, 2);
  renderOppComboGrid($oppTrioGrid, 3);
}

function renderOppComboGrid(container, size) {
  const statBattles = getStatsFilteredBattles();
  const emptyMsg = size === 2
    ? '相手の選出データを2体以上入力すると統計が表示されます'
    : '相手の選出データを3体以上入力すると統計が表示されます';

  if (statBattles.length === 0) {
    container.innerHTML = `<p style="color:var(--text-muted); grid-column: 1/-1; text-align:center; padding:24px;">${emptyMsg}</p>`;
    return;
  }

  const comboStats = {};
  statBattles.forEach(b => {
    const sel = b.oppSelect || [];
    if (sel.length < size) return;
    const combos = getCombinations(sel, size);
    combos.forEach(combo => {
      const key = comboKey(combo);
      const names = comboDisplayNames(combo);
      if (!comboStats[key]) comboStats[key] = { names, count: 0, wins: 0 };
      comboStats[key].count++;
      if (b.result === '勝ち') comboStats[key].wins++;
    });
  });

  const sorted = Object.values(comboStats).sort((a, b) => b.count - a.count);

  if (sorted.length === 0) {
    container.innerHTML = `<p style="color:var(--text-muted); grid-column: 1/-1; text-align:center; padding:24px;">${emptyMsg}</p>`;
    return;
  }

  const maxCount = sorted[0].count;

  container.innerHTML = sorted.map(c => {
    const winRate = c.count > 0 ? Math.round((c.wins / c.count) * 100) : 0;
    const countWidth = maxCount > 0 ? Math.round((c.count / maxCount) * 100) : 0;
    const winWidth = maxCount > 0 ? Math.round((c.wins / maxCount) * 100) : 0;
    const sprites = c.names.map((name, i) => {
      const slug = getPokemonSlug(name);
      return `<img class="combo-sprite${i === 0 ? ' lead' : ''}" src="${getSpriteUrl(slug || 'substitute')}" alt="${escapeHtml(name)}" title="${escapeHtml(name)}">`;
    }).join('');
    return `
      <div class="poke-stat-card combo-card">
        <div class="combo-sprites">${sprites}</div>
        <div class="poke-stat-info">
          <div class="poke-stat-name">${c.names.map(n => escapeHtml(n)).join(' + ')} <span style="color:var(--text-muted);font-size:0.7rem;font-weight:400">勝率${winRate}%</span></div>
          <div class="poke-stat-bars">
            <div class="poke-stat-row">
              <span class="label">遭遇</span>
              <div class="bar-bg"><div class="bar-fill opp-enc" style="width:${countWidth}%"></div></div>
              <span class="count">${c.count}</span>
            </div>
            <div class="poke-stat-row">
              <span class="label">勝ち</span>
              <div class="bar-bg"><div class="bar-fill win" style="width:${winWidth}%"></div></div>
              <span class="count">${c.wins}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ===== Modal =====
function resetFormState() {
  formState.myParty = [];
  formState.mySelect = [];
  formState.oppParty = [];
  formState.oppSelect = [];
  formState.tags = [];
  formState.myPartyItems = {};
  formState.oppPartyItems = {};
}

function openModal(editing = false) {
  $modalTitle.textContent = editing ? '対戦記録を編集' : '対戦記録を追加';
  $modalOverlay.classList.add('active');
  if (!editing) {
    $formDate.value = todayStr();
    // 直近レート自動入力（記録追加時のみ）
    let lastRate = null;
    for (let i = battles.length - 1; i >= 0; i--) {
      const r = battles[i].rate;
      if (typeof r === 'number' && !Number.isNaN(r)) { lastRate = r; break; }
    }
    $formRate.value = lastRate !== null ? lastRate : '';
  }
  renderPresetOptions();
  renderTagPicker();
  // Render pickers
  renderPickerSlots($pickerMyParty, 'myParty', 6);
  renderSelectFromParty($selectMySelect, 'mySelect', 'myParty', 4);
  renderPickerSlots($pickerOppParty, 'oppParty', 6);
  renderSelectFromParty($selectOppSelect, 'oppSelect', 'oppParty', 4);
}

function closeModal() {
  $modalOverlay.classList.remove('active');
  $form.reset();
  $formId.value = '';
  resetFormState();
}

function openDeleteConfirm() {
  $deleteOverlay.classList.add('active');
}

function closeDeleteConfirm() {
  $deleteOverlay.classList.remove('active');
  deleteTargetId = null;
}

// ===== CRUD =====
function saveBattle(data) {
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

function toggleBookmark(id) {
  const battle = battles.find(b => b.id === id);
  if (!battle) return;
  battle.bookmarked = !battle.bookmarked;
  saveBattlesData(battles);
  renderTable();
}

// Append a rule as an option to a select if it isn't already there.
// Used so legacy records (e.g., old "シングル" entries) remain editable/filterable
// even after the dropdown is restricted to current regulations.
function ensureRuleOption(selectEl, rule) {
  if (!rule) return;
  const exists = Array.from(selectEl.options).some(opt => opt.value === rule);
  if (!exists) {
    const opt = document.createElement('option');
    opt.value = rule;
    opt.textContent = rule;
    selectEl.appendChild(opt);
  }
}

function editBattle(id) {
  const battle = battles.find(b => b.id === id);
  if (!battle) return;

  $formId.value = battle.id;
  $formDate.value = battle.date || '';
  ensureRuleOption($formRule, battle.rule);
  $formRule.value = battle.rule || '';
  $formResult.value = battle.result || '';
  $formRate.value = (battle.rate !== undefined && battle.rate !== null) ? battle.rate : '';
  $formNotes.value = battle.notes || '';

  // Set form state
  formState.myParty = [...(battle.myParty || [])];
  formState.mySelect = [...(battle.mySelect || [])];
  formState.oppParty = [...(battle.oppParty || [])];
  formState.oppSelect = [...(battle.oppSelect || [])];
  formState.tags = [...(battle.tags || [])];
  formState.myPartyItems = { ...(battle.myPartyItems || {}) };
  formState.oppPartyItems = { ...(battle.oppPartyItems || {}) };

  openModal(true);
}

function confirmDelete(id) {
  deleteTargetId = id;
  openDeleteConfirm();
}

function deleteBattle(id) {
  battles = battles.filter(b => b.id !== id);
  saveBattlesData(battles);
  renderTable();
}

// ===== CSV Export =====
function exportCSV() {
  const filtered = getFilteredBattles();
  if (filtered.length === 0) return;

  const headers = ['日付', 'ルール', '結果', 'レート', '自分のパーティ', '自分の持ち物', '選出', '相手のパーティ', '相手の持ち物', '相手選出', 'お気に入り', 'タグ', 'メモ'];
  const rows = filtered.map(b => {
    const myItems = b.myPartyItems || {};
    const oppItems = b.oppPartyItems || {};
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
      (b.notes || '').replace(/"/g, '""')
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
function exportJSON() {
  const data = JSON.stringify(battles, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pokemon-battle-log-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`${battles.length}件のデータをエクスポートしました`, 'success');
}

let importData = null;
const $importOverlay = document.getElementById('import-overlay');
const $importMessage = document.getElementById('import-message');
const $jsonFileInput = document.getElementById('json-file-input');

function openImportConfirm(data) {
  importData = data;
  $importMessage.textContent = `${data.length}件の対戦記録を読み込みました。既存の${battles.length}件のデータをどうしますか？`;
  $importOverlay.classList.add('active');
}

function closeImportConfirm() {
  $importOverlay.classList.remove('active');
  importData = null;
  $jsonFileInput.value = '';
}

function handleImportFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data)) {
        showToast('無効なデータ形式です。配列形式のJSONを選択してください。', 'error');
        return;
      }
      if (data.length === 0) {
        showToast('データが空です。', 'error');
        return;
      }
      // インポート時もメガ名を基本形へ正規化する。
      openImportConfirm(data.map(normalizeMegaInBattle));
    } catch {
      showToast('JSONの解析に失敗しました。ファイルを確認してください。', 'error');
    }
  };
  reader.readAsText(file);
}

// ===== Party Presets =====
const PRESETS_KEY = 'pokemon-party-presets';
const $presetSelect = document.getElementById('preset-select');

function loadPresets() {
  try {
    const raw = JSON.parse(localStorage.getItem(PRESETS_KEY)) || [];
    return raw.map(normalizeMegaInPreset);
  } catch {
    return [];
  }
}

function savePresetsData(data) {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(data));
  } catch (e) {
    showToast('プリセットの保存に失敗しました', 'error');
  }
}

function renderPresetOptions() {
  const presets = loadPresets();
  $presetSelect.innerHTML = '<option value="">選択してください</option>';
  presets.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `${p.name} (${p.party.length}体)`;
    $presetSelect.appendChild(opt);
  });
}

// ===== Party Tab =====
const $partiesGrid = document.getElementById('parties-grid');
const $partiesEmpty = document.getElementById('parties-empty');

function getPartyStats(party) {
  const partyKey = [...party].sort().join(',');
  let wins = 0, total = 0;
  battles.forEach(b => {
    const bKey = [...(b.myParty || [])].sort().join(',');
    if (bKey === partyKey) { total++; if (b.result === '勝ち') wins++; }
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

function renderPartiesTab() {
  const presets = loadPresets();
  if (presets.length === 0) {
    $partiesGrid.innerHTML = '';
    $partiesEmpty.classList.add('visible');
  } else {
    $partiesEmpty.classList.remove('visible');
    $partiesGrid.innerHTML = presets.map((p, i) => renderPartyCard(p, i)).join('');
  }
}

function openNewBattleWithParty(preset) {
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

// ===== Party Edit Modal =====
const $partyModalOverlay = document.getElementById('party-modal-overlay');
const $partyModalTitle = document.getElementById('party-modal-title');
const $partyForm = document.getElementById('party-form');
const $partyFormName = document.getElementById('party-form-name');
const $partyFormNotes = document.getElementById('party-form-notes');
const $pickerPartyEdit = document.getElementById('picker-party-edit');

function openPartyModal(idx) {
  editingPartyIdx = idx;
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
  renderPickerSlots($pickerPartyEdit, 'myParty', 6);
}

function closePartyModal() {
  $partyModalOverlay.classList.remove('active');
  $partyForm.reset();
  editingPartyIdx = null;
  resetFormState();
}

$partyForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $partyFormName.value.trim();
  if (!name) { showToast('パーティ名を入力してください', 'error'); return; }
  if (formState.myParty.length === 0) { showToast('ポケモンを1体以上追加してください', 'error'); return; }

  const notes = $partyFormNotes.value.trim();
  const presets = loadPresets();
  if (editingPartyIdx >= 0 && editingPartyIdx < presets.length) {
    presets[editingPartyIdx].name = name;
    presets[editingPartyIdx].party = [...formState.myParty];
    presets[editingPartyIdx].items = { ...formState.myPartyItems };
    presets[editingPartyIdx].notes = notes;
    showToast(`「${name}」を更新しました`, 'success');
  } else {
    presets.push({ name, party: [...formState.myParty], items: { ...formState.myPartyItems }, notes });
    showToast(`「${name}」を保存しました`, 'success');
  }
  savePresetsData(presets);
  renderPartiesTab();
  renderPresetOptions();
  closePartyModal();
});

document.getElementById('party-modal-close').addEventListener('click', closePartyModal);
document.getElementById('party-form-cancel').addEventListener('click', closePartyModal);
$partyModalOverlay.addEventListener('click', (e) => { if (e.target === $partyModalOverlay) closePartyModal(); });

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

// ===== New Battle (pre-fill from last record) =====
function openNewBattleModal() {
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

// ===== Event Listeners =====
document.getElementById('btn-add').addEventListener('click', openNewBattleModal);
document.getElementById('fab-add').addEventListener('click', openNewBattleModal);
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('btn-cancel').addEventListener('click', closeModal);
document.getElementById('delete-close').addEventListener('click', closeDeleteConfirm);
document.getElementById('delete-cancel').addEventListener('click', closeDeleteConfirm);
document.getElementById('btn-export').addEventListener('click', exportCSV);
document.getElementById('btn-json-export').addEventListener('click', exportJSON);
document.getElementById('btn-json-import').addEventListener('click', () => $jsonFileInput.click());

$jsonFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) handleImportFile(file);
});

document.getElementById('import-replace').addEventListener('click', () => {
  if (importData) {
    battles = importData;
    saveBattlesData(battles);
    renderTable();
    showToast(`${importData.length}件のデータに上書きしました`, 'success');
  }
  closeImportConfirm();
});

document.getElementById('import-append').addEventListener('click', () => {
  if (importData) {
    importData.forEach(b => { if (!b.id) b.id = generateId(); });
    battles = [...battles, ...importData];
    saveBattlesData(battles);
    renderTable();
    showToast(`${importData.length}件のデータを追加しました`, 'success');
  }
  closeImportConfirm();
});

document.getElementById('import-cancel').addEventListener('click', closeImportConfirm);
document.getElementById('import-close').addEventListener('click', closeImportConfirm);
$importOverlay.addEventListener('click', (e) => {
  if (e.target === $importOverlay) closeImportConfirm();
});

document.getElementById('btn-preset-load').addEventListener('click', () => {
  const idx = $presetSelect.value;
  if (idx === '') { showToast('プリセットを選択してください', 'info'); return; }
  const presets = loadPresets();
  const preset = presets[parseInt(idx)];
  if (preset) {
    formState.myParty = [...preset.party];
    formState.myPartyItems = { ...(preset.items || {}) };
    formState.mySelect = [];
    renderPickerSlots($pickerMyParty, 'myParty', 6);
    updateDependentSelections('myParty');
    showToast(`「${preset.name}」を読み��みました`, 'success');
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

document.getElementById('delete-confirm').addEventListener('click', () => {
  if (deleteTargetId) deleteBattle(deleteTargetId);
  closeDeleteConfirm();
});

$modalOverlay.addEventListener('click', (e) => {
  if (e.target === $modalOverlay) closeModal();
});
$deleteOverlay.addEventListener('click', (e) => {
  if (e.target === $deleteOverlay) closeDeleteConfirm();
});

// Table event delegation (bookmark, edit, delete)
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

// Mobile cards event delegation
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

// Sort toggle
document.querySelector('[data-sort="date"]').addEventListener('click', () => {
  sortDirection = sortDirection === 'desc' ? 'asc' : 'desc';
  document.querySelector('[data-sort="date"] .sort-icon').textContent = sortDirection === 'desc' ? '↓' : '↑';
  renderTable();
});

// Rate quick-adjust buttons
document.querySelectorAll('.rate-adj-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const delta = parseInt(btn.dataset.delta, 10);
    const current = parseInt($formRate.value, 10);
    const base = Number.isNaN(current) ? 0 : current;
    $formRate.value = base + delta;
  });
});

// Filters
$filterRule.addEventListener('change', renderTable);
$filterResult.addEventListener('change', renderTable);
$filterPeriod.addEventListener('change', renderTable);
$filterTag.addEventListener('change', renderTable);

// Form submit
$form.addEventListener('submit', (e) => {
  e.preventDefault();

  if (formState.mySelect.length < 3) {
    showToast('自分の選出を3体以上選択してください', 'error');
    return;
  }

  const rateRaw = $formRate.value.trim();
  let rateNum = null;
  let rateMissing = false;
  if (rateRaw === '') {
    rateMissing = true;
  } else {
    rateNum = parseInt(rateRaw, 10);
    if (Number.isNaN(rateNum)) {
      showToast('レートは整数で入力してください', 'error');
      $formRate.focus();
      return;
    }
  }

  const data = {
    id: $formId.value || null,
    date: $formDate.value,
    rule: $formRule.value,
    result: $formResult.value,
    rate: rateNum,
    myParty: [...formState.myParty],
    mySelect: [...formState.mySelect],
    oppParty: [...formState.oppParty],
    oppSelect: [...formState.oppSelect],
    myPartyItems: { ...formState.myPartyItems },
    oppPartyItems: { ...formState.oppPartyItems },
    tags: [...formState.tags],
    notes: $formNotes.value.trim()
  };

  saveBattle(data);
  closeModal();
  if (rateMissing) {
    showToast('レート未入力で保存しました', 'warn');
  }
});

// Keyboard shortcuts
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

// Stats party filter
$statsPartySelect.addEventListener('change', () => {
  updatePartySummary();
  renderTrendChart();
  renderRateTrendChart();
  renderAnalytics();
  renderMyCombos();
  renderOppAnalytics();
  renderOppCombos();
});

// Resize handler for trend chart
window.addEventListener('resize', () => {
  if (isStatsTabActive()) {
    renderTrendChart();
    renderRateTrendChart();
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

// Close menu after clicking a menu item
$menuDropdown.addEventListener('click', () => {
  $menuDropdown.classList.remove('open');
});

// ===== Init =====
// Make sure legacy rule values from existing records stay visible in the filter dropdown.
battles.forEach(b => ensureRuleOption($filterRule, b.rule));
renderTable();
