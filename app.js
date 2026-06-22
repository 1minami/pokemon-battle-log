// ===== Main Entry Point =====
import { battles, setShowToastFn } from './state.js';
import { showToast, ensureRuleOption } from './utils.js';
import { $filterRule, restoreFiltersFromHash, buildTagFilterOptions, buildTournamentFilterOptions } from './filter.js';
import { renderTable } from './render.js';
import { initPicker } from './picker.js';
import { initEvents } from './events.js';
import { POKEMON_BY_SLUG, getSpriteUrl } from './pokemon-data.js';

// Inject showToast into state module (avoids circular dep)
setShowToastFn(showToast);

// Fallback handler for broken Pokemon sprites (DLC2 / custom megas)
const POKEAPI = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img.tagName !== 'IMG') return;
  const src = img.src;
  if (!src.includes('/sprites/') && !src.includes('/PokeAPI/')) return;

  const stage = parseInt(img.dataset.sf || '0');
  const slug = img.dataset.ss || src.match(/gen5\/(.+)\.png/)?.[1];
  if (!slug) return;
  img.dataset.ss = slug;

  const lookupSlug = slug.replace(/-mega[xy]?$/, '');
  const p = POKEMON_BY_SLUG[lookupSlug] || POKEMON_BY_SLUG[slug];

  if (stage === 0) {
    if (lookupSlug !== slug) {
      img.dataset.sf = '1';
      img.src = getSpriteUrl(lookupSlug);
      return;
    }
  }

  if (stage <= 1 && p) {
    img.dataset.sf = '2';
    img.src = `${POKEAPI}/other/showdown/${p.dex}.gif`;
    return;
  }

  if (stage <= 2 && p) {
    img.dataset.sf = '3';
    img.src = `${POKEAPI}/${p.dex}.png`;
    return;
  }

  if (stage <= 3) {
    img.dataset.sf = '4';
    img.src = getSpriteUrl('substitute');
  }
}, true);

// Init picker event handlers
initPicker();

// Init all event listeners
initEvents();

// Ensure legacy rule values from existing records stay visible in filter dropdown
battles.forEach(b => ensureRuleOption($filterRule, b.rule));
buildTagFilterOptions();
buildTournamentFilterOptions();
restoreFiltersFromHash();
renderTable();

// Register Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
