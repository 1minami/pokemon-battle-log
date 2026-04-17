// ===== Utility Functions =====
import { POKEMON_BY_NAME } from './pokemon-data.js';

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
