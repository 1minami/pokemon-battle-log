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

// PokeAPI home sprite IDs for custom megas (Pokemon Champions originals)
const MEGA_POKEAPI_ID = {
  'clefable-mega': 10278, 'victreebel-mega': 10279, 'starmie-mega': 10280,
  'dragonite-mega': 10281, 'meganium-mega': 10282, 'feraligatr-mega': 10283,
  'skarmory-mega': 10284, 'froslass-mega': 10285, 'emboar-mega': 10286,
  'excadrill-mega': 10287, 'scolipede-mega': 10288, 'scrafty-mega': 10289,
  'eelektross-mega': 10290, 'chandelure-mega': 10291, 'chesnaught-mega': 10292,
  'delphox-mega': 10293, 'greninja-mega': 10294, 'pyroar-mega': 10295,
  'floette-mega': 10296, 'malamar-mega': 10297, 'barbaracle-mega': 10298,
  'dragalge-mega': 10299, 'hawlucha-mega': 10300, 'drampa-mega': 10302,
  'falinks-mega': 10303, 'raichu-megax': 10304, 'raichu-megay': 10305,
  'chimecho-mega': 10306, 'staraptor-mega': 10308, 'golurk-mega': 10313,
  'meowstic-mega': 10314, 'crabominable-mega': 10315, 'scovillain-mega': 10320,
  'glimmora-mega': 10321,
};

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

  const megaId = MEGA_POKEAPI_ID[slug];
  const baseSlug = slug.replace(/-mega[xy]?$/, '');
  const p = POKEMON_BY_SLUG[baseSlug] || POKEMON_BY_SLUG[slug];

  // Stage 0: try PokeAPI home sprite for custom megas
  if (stage === 0 && megaId) {
    img.dataset.sf = '1';
    img.src = `${POKEAPI}/other/home/${megaId}.png`;
    return;
  }

  // Stage 1: try base form gen5 sprite for megas
  if (stage <= 1 && baseSlug !== slug) {
    img.dataset.sf = '2';
    img.src = getSpriteUrl(baseSlug);
    return;
  }

  // Stage 2: PokeAPI Showdown GIF by dex
  if (stage <= 2 && p) {
    img.dataset.sf = '3';
    img.src = `${POKEAPI}/other/showdown/${p.dex}.gif`;
    return;
  }

  // Stage 3: PokeAPI PNG by dex
  if (stage <= 3 && p) {
    img.dataset.sf = '4';
    img.src = `${POKEAPI}/${p.dex}.png`;
    return;
  }

  // Stage 4: substitute
  if (stage <= 4) {
    img.dataset.sf = '5';
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
