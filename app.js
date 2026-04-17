// ===== Main Entry Point =====
import { battles, setShowToastFn } from './state.js';
import { showToast, ensureRuleOption } from './utils.js';
import { $filterRule, restoreFiltersFromHash, buildTagFilterOptions } from './filter.js';
import { renderTable } from './render.js';
import { initPicker } from './picker.js';
import { initEvents } from './events.js';

// Inject showToast into state module (avoids circular dep)
setShowToastFn(showToast);

// Init picker event handlers
initPicker();

// Init all event listeners
initEvents();

// Ensure legacy rule values from existing records stay visible in filter dropdown
battles.forEach(b => ensureRuleOption($filterRule, b.rule));
buildTagFilterOptions();
restoreFiltersFromHash();
renderTable();

// Register Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
