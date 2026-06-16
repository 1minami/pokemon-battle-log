// ===== State Module =====
import { MEGA_BASE } from './pokemon-data.js';

export const STORAGE_KEY = 'pokemon-battle-log';
export const PRESETS_KEY = 'pokemon-party-presets';
export const TOURNAMENTS_KEY = 'pokemon-tournaments';
export const LOCAL_UPDATED_KEY = 'pokemon-local-updated-at';

const localUpdateListeners = [];
export function addLocalUpdateListener(fn) {
  if (typeof fn === 'function') localUpdateListeners.push(fn);
}

export function markLocalUpdated() {
  localStorage.setItem(LOCAL_UPDATED_KEY, new Date().toISOString());
  for (const fn of localUpdateListeners) {
    try { fn(); } catch (e) { console.error('localUpdateListener error:', e); }
  }
}

// ===== Mega Normalization =====
export function normalizeMegaName(name) {
  return (name && MEGA_BASE[name]) ? MEGA_BASE[name] : name;
}

export function normalizeMegaArray(arr) {
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

export function normalizeMegaItemsDict(items) {
  if (!items || typeof items !== 'object') return items;
  const out = {};
  for (const [name, val] of Object.entries(items)) {
    const base = normalizeMegaName(name);
    if (!(base in out)) out[base] = val;
  }
  return out;
}

export function normalizeMegaInBattle(b) {
  if (!b || typeof b !== 'object') return b;
  if (Array.isArray(b.myParty))   b.myParty   = normalizeMegaArray(b.myParty);
  if (Array.isArray(b.oppParty))  b.oppParty  = normalizeMegaArray(b.oppParty);
  if (Array.isArray(b.mySelect))  b.mySelect  = normalizeMegaArray(b.mySelect);
  if (Array.isArray(b.oppSelect)) b.oppSelect = normalizeMegaArray(b.oppSelect);
  if (b.myPartyItems)  b.myPartyItems  = normalizeMegaItemsDict(b.myPartyItems);
  if (b.oppPartyItems) b.oppPartyItems = normalizeMegaItemsDict(b.oppPartyItems);
  if (b.oppPokemonMemos) b.oppPokemonMemos = normalizeMegaItemsDict(b.oppPokemonMemos);
  return b;
}

export function normalizeMegaInPreset(p) {
  if (!p || typeof p !== 'object') return p;
  if (Array.isArray(p.party)) p.party = normalizeMegaArray(p.party);
  if (p.items) p.items = normalizeMegaItemsDict(p.items);
  return p;
}

// ===== Rule → Season options =====
export const RULE_SEASONS = {
  'レギュレーションM-A': ['M-1', 'M-2'],
};
export function defaultSeasonForRule(rule) {
  const list = RULE_SEASONS[rule];
  return (list && list.length > 0) ? list[0] : '';
}

// ===== Storage =====
export function loadBattles() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    return raw.map(b => {
      const norm = normalizeMegaInBattle(b);
      // migration: if season missing, assign default (M-1 for M-A)
      if (norm && typeof norm === 'object' && !norm.season) {
        norm.season = defaultSeasonForRule(norm.rule);
      }
      if (norm && typeof norm === 'object' && !('tournament' in norm)) {
        norm.tournament = '';
      }
      // migration: merge playFlow + improvement → playFlowImprovement
      if (norm && typeof norm === 'object' && !('playFlowImprovement' in norm)) {
        const parts = [norm.playFlow, norm.improvement].filter(s => s && s.trim());
        norm.playFlowImprovement = parts.join('\n');
      }
      return norm;
    });
  } catch {
    return [];
  }
}

export function saveBattlesData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    markLocalUpdated();
  } catch (e) {
    showToastFn('保存に失敗しました。ストレージ容量が不足している可能性があります。', 'error');
    console.error('localStorage save failed:', e);
  }
}

export function loadPresets() {
  try {
    const raw = JSON.parse(localStorage.getItem(PRESETS_KEY)) || [];
    return raw.map(normalizeMegaInPreset);
  } catch {
    return [];
  }
}

export function savePresetsData(data) {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(data));
    markLocalUpdated();
  } catch (e) {
    showToastFn('プリセットの保存に失敗しました', 'error');
  }
}

export function loadTournaments() {
  try {
    const raw = JSON.parse(localStorage.getItem(TOURNAMENTS_KEY)) || [];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function saveTournamentsData(data) {
  try {
    localStorage.setItem(TOURNAMENTS_KEY, JSON.stringify(data));
    markLocalUpdated();
  } catch (e) {
    showToastFn('大会データの保存に失敗しました', 'error');
  }
}

// showToast is injected to avoid circular dependency with utils.js
let showToastFn = () => {};
export function setShowToastFn(fn) { showToastFn = fn; }

// ===== Mutable State =====
export let battles = loadBattles();
export function setBattles(v) { battles = v; }

export let tournaments = loadTournaments();
export function setTournaments(v) { tournaments = v; }
export function reloadTournaments() { tournaments = loadTournaments(); }

export let deleteTargetId = null;
export function setDeleteTargetId(v) { deleteTargetId = v; }

export let sortDirection = 'desc';
export function setSortDirection(v) { sortDirection = v; }

export let statsDirty = true;
export function setStatsDirty(v) { statsDirty = v; }

export let editingPartyIdx = null;
export function setEditingPartyIdx(v) { editingPartyIdx = v; }

export const formState = {
  myParty: [],
  mySelect: [],
  oppParty: [],
  oppSelect: [],
  myPartyItems: {},
  oppPartyItems: {},
  oppPokemonMemos: {},
  selectionPatterns: [],
  myPartyDetails: {},
  candidates: [],
  candidateMemos: {},
};

export function resetFormState() {
  formState.myParty = [];
  formState.mySelect = [];
  formState.oppParty = [];
  formState.oppSelect = [];
  formState.myPartyItems = {};
  formState.oppPartyItems = {};
  formState.oppPokemonMemos = {};
  formState.selectionPatterns = [];
  formState.myPartyDetails = {};
  formState.candidates = [];
  formState.candidateMemos = {};
}

// Picker callback for non-formState targets (e.g., selection pattern picks)
export let pickerOnSelect = null;
export function setPickerOnSelect(fn) { pickerOnSelect = fn; }


// Picker state
export let pickerTarget = null;
export function setPickerTarget(v) { pickerTarget = v; }

export let pickerMax = 6;
export function setPickerMax(v) { pickerMax = v; }

// Drag state
export const dragState = { field: null, fromIdx: -1 };
