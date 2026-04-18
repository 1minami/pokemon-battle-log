// ===== Pokemon Picker Module =====
import { formState, battles, dragState, pickerTarget, setPickerTarget, pickerMax, setPickerMax, PRESET_TAGS } from './state.js';
import { escapeHtml, getPokemonSlug } from './utils.js';
import { getSpriteUrl, POKEMON_DB, MEGA_MAP, MEGA_BASE, ITEM_LIST, REGULATION_POKEMON_SET, toHiragana } from './pokemon-data.js';

const $pokemonGridOverlay = document.getElementById('pokemon-grid-overlay');
const $pokemonGrid = document.getElementById('pokemon-grid');
const $pokemonSearch = document.getElementById('pokemon-search');
const $pickerMyParty = document.getElementById('picker-my-party');
const $selectMySelect = document.getElementById('select-my-select');
const $pickerOppParty = document.getElementById('picker-opp-party');
const $selectOppSelect = document.getElementById('select-opp-select');
const $tagPicker = document.getElementById('tag-picker');
const $tagSelected = document.getElementById('tag-selected');
const $formRule = document.getElementById('form-rule');

export { $pokemonGridOverlay, $pickerMyParty, $selectMySelect, $pickerOppParty, $selectOppSelect };

// ===== Item Ordering =====
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
export function renderPickerSlots(container, field, max) {
  const selected = formState[field];
  const itemsFieldMap = { myParty: 'myPartyItems', oppParty: 'oppPartyItems' };
  const itemsField = itemsFieldMap[field];
  container.innerHTML = '';

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

    const itemSelect = slot.querySelector('.slot-item');
    if (itemSelect) {
      itemSelect.addEventListener('change', () => {
        if (itemSelect.value) formState[itemsField][name] = itemSelect.value;
        else delete formState[itemsField][name];
      });
      itemSelect.addEventListener('mousedown', (e) => e.stopPropagation());
      itemSelect.addEventListener('pointerdown', (e) => e.stopPropagation());
    }

    slot.querySelector('.slot-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      formState[field].splice(idx, 1);
      renderPickerSlots(container, field, max);
      updateDependentSelections(field);
    });

    slot.addEventListener('dragstart', (e) => {
      dragState.field = field;
      dragState.fromIdx = idx;
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

// ===== Select From Party =====
function findSelectedForm(baseName, fieldArr) {
  const megas = MEGA_MAP[baseName] || [];
  const allForms = [baseName, ...megas];
  return allForms.find(f => fieldArr.includes(f)) || null;
}

export function renderSelectFromParty(container, field, sourceField, max) {
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

    if (megas.length > 0 && isSelected) {
      const isMega = selectedForm !== baseName;
      html += `<span class="mega-badge${isMega ? ' active' : ''}" title="メガ進化切替">M</span>`;
    }

    icon.innerHTML = html;

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

          const itemsField = sourceField === 'myParty' ? 'myPartyItems' : 'oppPartyItems';
          const wasMega = currentIdx !== 0;
          const isMega = nextIdx !== 0;
          if (!wasMega && isMega) {
            formState[itemsField][baseName] = 'メガストーン';
          } else if (wasMega && !isMega && formState[itemsField][baseName] === 'メガストーン') {
            delete formState[itemsField][baseName];
          }
          const partyContainer = sourceField === 'myParty' ? $pickerMyParty : $pickerOppParty;
          renderPickerSlots(partyContainer, sourceField, sourceField === 'myParty' ? 8 : 6);

          renderSelectFromParty(container, field, sourceField, max);
        });
      }
    }

    container.appendChild(icon);
  });
}

// ===== Dependent Selections =====
export function updateDependentSelections(changedField) {
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
export function openPokemonGrid(field, max) {
  setPickerTarget(field);
  setPickerMax(max);
  $pokemonSearch.value = '';
  renderPokemonGrid('');
  $pokemonGridOverlay.classList.add('active');
  setTimeout(() => $pokemonSearch.focus(), 100);
}

export function closePokemonGrid() {
  $pokemonGridOverlay.classList.remove('active');
  setPickerTarget(null);
}

function getPokemonUsageCounts() {
  const counts = {};
  battles.forEach(b => {
    (b.myParty || []).forEach(name => { counts[name] = (counts[name] || 0) + 1; });
    (b.oppParty || []).forEach(name => { counts[name] = (counts[name] || 0) + 1; });
  });
  return counts;
}

// Reference to party modal overlay, set by modal.js at init
let $partyModalOverlay = null;
let $pickerPartyEdit = null;
export function setPartyModalRefs(overlay, pickerEl) {
  $partyModalOverlay = overlay;
  $pickerPartyEdit = pickerEl;
}

export function renderPokemonGrid(query) {
  const q = query.trim().toLowerCase();
  const currentPickerTarget = pickerTarget;
  const currentPickerMax = pickerMax;
  const alreadySelected = new Set(formState[currentPickerTarget] || []);

  const currentRule = $formRule.value;
  const allowedSet = currentRule ? REGULATION_POKEMON_SET[currentRule] : null;
  let filtered = allowedSet
    ? POKEMON_DB.filter(p => allowedSet.has(p.name))
    : POKEMON_DB;

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

  $pokemonGrid.querySelectorAll('.poke-grid-item:not(.disabled)').forEach(item => {
    item.addEventListener('click', () => {
      const name = item.dataset.name;
      if (!currentPickerTarget) return;

      formState[currentPickerTarget].push(name);

      if (currentPickerTarget === 'myParty') {
        if ($partyModalOverlay && $partyModalOverlay.classList.contains('active')) {
          renderPickerSlots($pickerPartyEdit, 'myParty', 8);
        } else {
          renderPickerSlots($pickerMyParty, 'myParty', 8);
          updateDependentSelections('myParty');
        }
      } else if (currentPickerTarget === 'oppParty') {
        renderPickerSlots($pickerOppParty, 'oppParty', 6);
        updateDependentSelections('oppParty');
      }

      if (formState[currentPickerTarget].length >= currentPickerMax) {
        closePokemonGrid();
      } else {
        $pokemonSearch.value = '';
        renderPokemonGrid('');
        $pokemonSearch.focus();
      }
    });
  });
}

// ===== Tag Picker =====
export function renderTagPicker() {
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

// ===== Init =====
export function initPicker() {
  $pokemonSearch.addEventListener('input', () => {
    renderPokemonGrid($pokemonSearch.value);
  });

  $pokemonGridOverlay.addEventListener('click', (e) => {
    if (e.target === $pokemonGridOverlay) closePokemonGrid();
  });

  document.getElementById('pokemon-grid-close').addEventListener('click', closePokemonGrid);
}
