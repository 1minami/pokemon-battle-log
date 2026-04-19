// ===== Utility Functions =====
import { POKEMON_BY_NAME, MEGA_BASE } from './pokemon-data.js';

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function getPokemonSlug(name) {
  const p = POKEMON_BY_NAME[name];
  return p ? p.slug : null;
}

export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

export function ensureRuleOption(selectEl, rule) {
  if (!rule) return;
  const exists = Array.from(selectEl.options).some(opt => opt.value === rule);
  if (!exists) {
    const opt = document.createElement('option');
    opt.value = rule;
    opt.textContent = rule;
    selectEl.appendChild(opt);
  }
}

// ===== Rate-based Result Derivation =====
export function coerceRate(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

// Build a map: battleId -> { result, delta }
// result/delta are null when the battle's rate is missing or no prior rate exists
export function buildResultMap(battles) {
  const sorted = [...battles].sort((a, b) => {
    const da = new Date(a.date);
    const db = new Date(b.date);
    const dateCmp = da - db;
    return dateCmp !== 0 ? dateCmp : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
  const map = {};
  let prevRate = null;
  for (const b of sorted) {
    const rate = coerceRate(b.rate);
    let result = null, delta = null;
    if (rate !== null && prevRate !== null) {
      delta = rate - prevRate;
      if (delta > 0) result = '勝ち';
      else if (delta < 0) result = '負け';
      else result = '引き分け';
    }
    map[b.id] = { result, delta };
    if (rate !== null) prevRate = rate;
  }
  return map;
}

export function formatDelta(delta) {
  if (delta === null || delta === undefined) return '';
  if (delta === 0) return '±0';
  return delta > 0 ? `+${delta}` : `${delta}`;
}

// Key for comparing opponent parties (order-insensitive, mega-normalized)
export function partyKey(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return '';
  const normalized = arr.map(n => MEGA_BASE[n] || n);
  return [...new Set(normalized)].sort().join('|');
}
