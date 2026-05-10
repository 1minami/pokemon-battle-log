// ===== Pokemon Text Parser =====
// テキスト形式のポケモン情報をパースする。
//
// 形式例:
//   リザードン @ リザードナイトX
//   特性: もうか
//   能力補正: いじっぱり
//   163(10)-149(32)-98-116-105-144(24)
//   フレアドライブ / げきりん / ニトロチャージ / ドラゴンクロー
//
// 行は以下のいずれかにマッチする想定:
// - 名前行: `名前` または `名前 @ 持ち物`
// - 特性行: `特性: xxx` (`性格`/`能力補正`等の見出しゆれは regex で吸収)
// - 性格行: `能力補正: xxx` または `性格: xxx`
// - ステータス行: `H(ev)-A(ev)-B(ev)-C(ev)-D(ev)-S(ev)` ((ev) は省略可、=0 扱い)
// - 技行: `技1 / 技2 / 技3 / 技4`

import { POKEMON_BY_NAME, MEGA_BASE } from './pokemon-data.js';

const STATS_KEYS = ['h', 'a', 'b', 'c', 'd', 's'];

function normalizeLine(line) {
  // 全角空白→半角、コロン全角→半角、前後 trim
  return line.replace(/　/g, ' ').replace(/：/g, ':').trim();
}

function parseStatsLine(line) {
  // 例: "163(10)-149(32)-98-116-105-144(24)"
  const parts = line.split(/[-－ー]/);
  if (parts.length !== 6) return null;
  const stats = {};
  const evs = {};
  for (let i = 0; i < 6; i++) {
    const m = parts[i].trim().match(/^(\d+)\s*(?:\(\s*(\d+)\s*\))?$/);
    if (!m) return null;
    stats[STATS_KEYS[i]] = parseInt(m[1], 10);
    evs[STATS_KEYS[i]] = m[2] != null ? parseInt(m[2], 10) : 0;
  }
  return { stats, evs };
}

function parseMovesLine(line) {
  return line.split(/[\/／]/).map(s => s.trim()).filter(Boolean);
}

// テキストブロックを 1体分パース。失敗時は { error: '...' } を返す。
export function parsePokemonText(text) {
  if (!text || typeof text !== 'string') return { error: '入力が空です' };

  const lines = text.split(/\r?\n/).map(normalizeLine).filter(Boolean);
  if (lines.length === 0) return { error: '入力が空です' };

  let name = null;
  let item = '';
  let ability = '';
  let nature = '';
  let stats = null;
  let evs = null;
  let moves = [];

  for (const line of lines) {
    // 名前行: 最初に @ を含む or stats/特性等にマッチしない最初の行
    if (name === null) {
      const at = line.split('@');
      name = at[0].trim();
      if (at.length >= 2) item = at.slice(1).join('@').trim();
      continue;
    }

    const mAbility = line.match(/^(?:特性|とくせい|Ability)\s*[:：]\s*(.+)$/i);
    if (mAbility) { ability = mAbility[1].trim(); continue; }

    const mNature = line.match(/^(?:性格|能力補正|Nature)\s*[:：]\s*(.+)$/i);
    if (mNature) { nature = mNature[1].trim(); continue; }

    const mItem = line.match(/^(?:持ち物|もちもの|Item)\s*[:：]\s*(.+)$/i);
    if (mItem) { item = mItem[1].trim(); continue; }

    const mMoves = line.match(/^(?:技|わざ|Moves?)\s*[:：]\s*(.+)$/i);
    if (mMoves) { moves = parseMovesLine(mMoves[1]); continue; }

    const s = parseStatsLine(line);
    if (s) { stats = s.stats; evs = s.evs; continue; }

    if (line.includes('/') || line.includes('／')) {
      const m = parseMovesLine(line);
      if (m.length > 0) { moves = m; continue; }
    }
  }

  if (!name) return { error: 'ポケモン名を読み取れません' };

  // メガ進化形 → ベース名へ正規化
  const baseName = MEGA_BASE[name] || name;
  if (!POKEMON_BY_NAME[baseName]) {
    return { error: `未知のポケモン: ${name}` };
  }

  const details = {};
  if (item) details.item = item;
  if (ability) details.ability = ability;
  if (nature) details.nature = nature;
  if (stats) details.stats = stats;
  if (evs) details.evs = evs;
  if (moves.length > 0) details.moves = moves.slice(0, 4);

  return { name: baseName, details };
}
