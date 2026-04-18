// ===== Statistics Module =====
import { battles, setStatsDirty } from './state.js';
import { escapeHtml, getPokemonSlug } from './utils.js';
import { getStatsFilteredBattles, filterByPeriod } from './filter.js';
import { getSpriteUrl, MEGA_MAP, MEGA_BASE } from './pokemon-data.js';

const $trendCanvas = document.getElementById('trend-canvas');
const $trendEmpty = document.getElementById('trend-empty');
const $rateTrendCanvas = document.getElementById('rate-trend-canvas');
const $rateTrendEmpty = document.getElementById('rate-trend-empty');
const $analyticsGrid = document.getElementById('analytics-grid');
const $oppAnalyticsGrid = document.getElementById('opp-analytics-grid');
const $myPairGrid = document.getElementById('my-pair-grid');
const $myTrioGrid = document.getElementById('my-trio-grid');
const $oppPairGrid = document.getElementById('opp-pair-grid');
const $oppTrioGrid = document.getElementById('opp-trio-grid');
const $statsPartySelect = document.getElementById('stats-party-select');
const $statsPartySummary = document.getElementById('stats-party-summary');

// ===== Trend Chart (Canvas) =====
export function renderTrendChart() {
  const statBattles = getStatsFilteredBattles();
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

  ctx.clearRect(0, 0, W, H);

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

  const y50 = pad.top + chartH - 0.5 * chartH;
  ctx.strokeStyle = 'rgba(234,179,8,0.3)';
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(pad.left, y50);
  ctx.lineTo(W - pad.right, y50);
  ctx.stroke();
  ctx.setLineDash([]);

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

  const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + chartH);
  gradient.addColorStop(0, 'rgba(99,102,241,0.25)');
  gradient.addColorStop(1, 'rgba(99,102,241,0.02)');

  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top + chartH);
  points.forEach((p, i) => {
    const x = pad.left + i * xStep;
    const y = pad.top + chartH - (p.rate / 100) * chartH;
    ctx.lineTo(x, y);
  });
  ctx.lineTo(pad.left + (n - 1) * xStep, pad.top + chartH);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

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

  points.forEach((p, i) => {
    const x = pad.left + i * xStep;
    const y = pad.top + chartH - (p.rate / 100) * chartH;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = p.result === '勝ち' ? '#22c55e' : p.result === '負け' ? '#ef4444' : '#6b7280';
    ctx.fill();
  });

  const lastP = points[n - 1];
  const lastX = pad.left + (n - 1) * xStep;
  const lastY = pad.top + chartH - (lastP.rate / 100) * chartH;
  ctx.fillStyle = '#818cf8';
  ctx.font = 'bold 13px Inter, Noto Sans JP, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${Math.round(lastP.rate)}%`, lastX + 8, lastY - 4);
}

// ===== Rate Trend Chart =====
export function renderRateTrendChart() {
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

  const points = sorted.map((b, i) => ({ idx: i, rate: b.rate, date: b.date, result: b.result }));
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

  const gradient2 = ctx.createLinearGradient(0, pad.top, 0, pad.top + chartH);
  gradient2.addColorStop(0, 'rgba(234,179,8,0.25)');
  gradient2.addColorStop(1, 'rgba(234,179,8,0.02)');

  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top + chartH);
  points.forEach((p, i) => {
    const x = pad.left + i * xStep;
    const y = pad.top + chartH - ((p.rate - yMin) / yRange) * chartH;
    ctx.lineTo(x, y);
  });
  ctx.lineTo(pad.left + (n - 1) * xStep, pad.top + chartH);
  ctx.closePath();
  ctx.fillStyle = gradient2;
  ctx.fill();

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

  points.forEach((p, i) => {
    const x = pad.left + i * xStep;
    const y = pad.top + chartH - ((p.rate - yMin) / yRange) * chartH;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = p.result === '勝ち' ? '#22c55e' : p.result === '負け' ? '#ef4444' : '#6b7280';
    ctx.fill();
  });

  const lastP = points[n - 1];
  const lastX = pad.left + (n - 1) * xStep;
  const lastY = pad.top + chartH - ((lastP.rate - yMin) / yRange) * chartH;
  ctx.fillStyle = '#facc15';
  ctx.font = 'bold 13px Inter, Noto Sans JP, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${lastP.rate}`, lastX + 8, lastY - 4);
}

// ===== Analytics =====
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

export function updatePartySummary() {
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

// ===== Combo Analytics =====
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

function comboKey(combo) {
  if (combo.length <= 1) return combo.join('+');
  return combo[0] + '+' + [...combo.slice(1)].sort().join('+');
}

function comboDisplayNames(combo) {
  if (combo.length <= 1) return [...combo];
  return [combo[0], ...combo.slice(1).sort()];
}

function renderMyComboGrid(container, size, kind) {
  const statBattles = getStatsFilteredBattles();
  const emptyMsg = size === 2
    ? '選出データを2体以上入力すると統計が表示されます'
    : '選出データを3体以上入力すると統計が表示されます';

  if (statBattles.length === 0) {
    container.innerHTML = `<p style="color:var(--text-muted); grid-column: 1/-1; text-align:center; padding:24px;">${emptyMsg}</p>`;
    comboDrillSel[kind] = null;
    renderComboDrill(kind);
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
    comboDrillSel[kind] = null;
    renderComboDrill(kind);
    return;
  }

  const maxCount = sorted[0].count;
  const selKey = comboDrillSel[kind] ? comboDrillSel[kind].key : null;
  if (selKey && !comboStats[selKey]) comboDrillSel[kind] = null;

  container.innerHTML = sorted.map(c => {
    const key = comboKey(c.names);
    const winRate = c.count > 0 ? Math.round((c.wins / c.count) * 100) : 0;
    const winWidth = maxCount > 0 ? Math.round((c.wins / maxCount) * 100) : 0;
    const loseWidth = maxCount > 0 ? Math.round((c.losses / maxCount) * 100) : 0;
    const isSelected = key === selKey;
    const sprites = c.names.map((name, i) => {
      const slug = getPokemonSlug(name);
      return `<img class="combo-sprite${i === 0 ? ' lead' : ''}" src="${getSpriteUrl(slug || 'substitute')}" alt="${escapeHtml(name)}" title="${escapeHtml(name)}">`;
    }).join('');
    return `
      <div class="poke-stat-card combo-card${isSelected ? ' selected' : ''}" data-combo-key="${escapeHtml(key)}">
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

  attachComboGridClicks(container, kind, comboStats);
  renderComboDrill(kind);
}

function renderMyCombos() {
  renderMyComboGrid($myPairGrid, 2, 'my-pair');
  renderMyComboGrid($myTrioGrid, 3, 'my-trio');
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

function renderOppComboGrid(container, size, kind) {
  const statBattles = getStatsFilteredBattles();
  const emptyMsg = size === 2
    ? '相手の選出データを2体以上入力すると統計が表示されます'
    : '相手の選出データを3体以上入力すると統計が表示されます';

  if (statBattles.length === 0) {
    container.innerHTML = `<p style="color:var(--text-muted); grid-column: 1/-1; text-align:center; padding:24px;">${emptyMsg}</p>`;
    comboDrillSel[kind] = null;
    renderComboDrill(kind);
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
    comboDrillSel[kind] = null;
    renderComboDrill(kind);
    return;
  }

  const maxCount = sorted[0].count;
  const selKey = comboDrillSel[kind] ? comboDrillSel[kind].key : null;
  if (selKey && !comboStats[selKey]) comboDrillSel[kind] = null;

  container.innerHTML = sorted.map(c => {
    const key = comboKey(c.names);
    const winRate = c.count > 0 ? Math.round((c.wins / c.count) * 100) : 0;
    const countWidth = maxCount > 0 ? Math.round((c.count / maxCount) * 100) : 0;
    const winWidth = maxCount > 0 ? Math.round((c.wins / maxCount) * 100) : 0;
    const isSelected = key === selKey;
    const sprites = c.names.map((name, i) => {
      const slug = getPokemonSlug(name);
      return `<img class="combo-sprite${i === 0 ? ' lead' : ''}" src="${getSpriteUrl(slug || 'substitute')}" alt="${escapeHtml(name)}" title="${escapeHtml(name)}">`;
    }).join('');
    return `
      <div class="poke-stat-card combo-card${isSelected ? ' selected' : ''}" data-combo-key="${escapeHtml(key)}">
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

  attachComboGridClicks(container, kind, comboStats);
  renderComboDrill(kind);
}

function renderOppCombos() {
  renderOppComboGrid($oppPairGrid, 2, 'opp-pair');
  renderOppComboGrid($oppTrioGrid, 3, 'opp-trio');
}

// ===== Combo Drill (click pair/trio card → list matching battles) =====
const comboDrillSel = { 'my-pair': null, 'my-trio': null, 'opp-pair': null, 'opp-trio': null };

function attachComboGridClicks(container, kind, comboStats) {
  container.querySelectorAll('.combo-card[data-combo-key]').forEach(card => {
    card.addEventListener('click', () => {
      const key = card.dataset.comboKey;
      const current = comboDrillSel[kind];
      if (current && current.key === key) {
        comboDrillSel[kind] = null;
      } else {
        const entry = comboStats[key];
        if (!entry) return;
        comboDrillSel[kind] = { key, names: entry.names };
      }
      // Re-render just this kind
      if (kind === 'my-pair') renderMyComboGrid($myPairGrid, 2, 'my-pair');
      else if (kind === 'my-trio') renderMyComboGrid($myTrioGrid, 3, 'my-trio');
      else if (kind === 'opp-pair') renderOppComboGrid($oppPairGrid, 2, 'opp-pair');
      else if (kind === 'opp-trio') renderOppComboGrid($oppTrioGrid, 3, 'opp-trio');
    });
  });
}

function battleMatchesCombo(selectArr, names) {
  const leadIdx = selectArr.indexOf(names[0]);
  if (leadIdx === -1) return false;
  for (let i = 1; i < names.length; i++) {
    const idx = selectArr.indexOf(names[i]);
    if (idx === -1 || idx <= leadIdx) return false;
  }
  return true;
}

function renderComboDrill(kind) {
  const $drill = document.getElementById(`${kind}-drill`);
  if (!$drill) return;
  const sel = comboDrillSel[kind];
  if (!sel) { $drill.innerHTML = ''; return; }

  const side = kind.startsWith('my-') ? 'my' : 'opp';
  const statBattles = getStatsFilteredBattles();
  const matched = statBattles.filter(b => {
    const arr = side === 'my' ? (b.mySelect || []) : (b.oppSelect || []);
    return battleMatchesCombo(arr, sel.names);
  });

  const sorted = matched.slice().sort((a, b) => {
    const da = new Date(a.date), db = new Date(b.date);
    return db - da;
  });

  const wins = sorted.filter(b => b.result === '勝ち').length;
  const losses = sorted.filter(b => b.result === '負け').length;
  const decided = wins + losses;
  const rate = decided > 0 ? Math.round((wins / decided) * 100) : 0;
  const titleLabel = sel.names.map(n => escapeHtml(n)).join(' + ');

  const items = sorted.map(b => {
    const mySel = b.mySelect || [];
    const oppSel = b.oppSelect || [];
    const myIcons = mySel.map(n => {
      const s = getPokemonSlug(n) || 'substitute';
      return `<img src="${getSpriteUrl(s)}" alt="${escapeHtml(n)}" title="${escapeHtml(n)}">`;
    }).join('');
    const oppIcons = oppSel.map(n => {
      const s = getPokemonSlug(n) || 'substitute';
      return `<img src="${getSpriteUrl(s)}" alt="${escapeHtml(n)}" title="${escapeHtml(n)}">`;
    }).join('');
    const resultClass = b.result === '勝ち' ? 'win' : b.result === '負け' ? 'lose' : '';
    const resultLabel = b.result === '勝ち' ? 'W' : b.result === '負け' ? 'L' : 'D';
    const rateStr = (b.rate !== undefined && b.rate !== null && b.rate !== '') ? `${escapeHtml(String(b.rate))}` : '—';
    return `
      <div class="matchup-drill-item">
        <span class="mdi-date">${escapeHtml(b.date || '')}</span>
        <span class="mdi-result ${resultClass}">${resultLabel}</span>
        <span class="mdi-rate">${rateStr}</span>
        <span class="mdi-my"><span class="mdi-label">自分選出</span><span class="mdi-pokes">${myIcons}</span></span>
        <span class="mdi-opp"><span class="mdi-label">相手選出</span><span class="mdi-pokes">${oppIcons}</span></span>
      </div>
    `;
  }).join('');

  $drill.innerHTML = `
    <div class="matchup-drill-panel">
      <div class="matchup-drill-header">
        <div class="matchup-drill-title">
          ${titleLabel}
          <span class="mdh-stat">${wins}W ${losses}L (${rate}%) / ${sorted.length}戦</span>
        </div>
        <button type="button" class="matchup-drill-close" data-combo-drill-close="${kind}">閉じる</button>
      </div>
      <div class="matchup-drill-list">${items || '<p style="color:var(--text-muted)">該当なし</p>'}</div>
    </div>
  `;

  $drill.querySelector(`[data-combo-drill-close="${kind}"]`).addEventListener('click', () => {
    comboDrillSel[kind] = null;
    if (kind === 'my-pair') renderMyComboGrid($myPairGrid, 2, 'my-pair');
    else if (kind === 'my-trio') renderMyComboGrid($myTrioGrid, 3, 'my-trio');
    else if (kind === 'opp-pair') renderOppComboGrid($oppPairGrid, 2, 'opp-pair');
    else if (kind === 'opp-trio') renderOppComboGrid($oppTrioGrid, 3, 'opp-trio');
  });
}

// ===== Matchup Matrix (Heatmap) =====
let matchupOppMode = 'oppParty'; // 'oppParty' | 'oppSelect'
let matchupDrillSel = null; // { my, opp } | null

export function setMatchupOppMode(mode) {
  if (mode !== 'oppParty' && mode !== 'oppSelect') return;
  matchupOppMode = mode;
  matchupDrillSel = null;
  renderMatchupMatrix();
}

export function renderMatchupMatrix() {
  const $container = document.getElementById('matchup-grid');
  if (!$container) return;

  const $axisLabel = document.getElementById('matchup-axis-label');
  if ($axisLabel) $axisLabel.textContent = matchupOppMode === 'oppSelect' ? '相手選出' : '相手パーティ';
  document.querySelectorAll('#matchup-sub-tabs .sub-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.matchupMode === matchupOppMode);
  });

  const statBattles = getStatsFilteredBattles();
  if (statBattles.length === 0) {
    $container.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:24px;">対戦記録を追加するとマトリクスが表示されます</p>';
    renderMatchupDrill();
    return;
  }

  // Collect matchup data: my selected X vs opponent axis Y
  const matchups = {}; // "myPoke|oppPoke" -> { wins, total }
  const myPokeSet = new Set();
  const oppPokeSet = new Set();

  statBattles.forEach(b => {
    if (b.result !== '勝ち' && b.result !== '負け') return;
    const isWin = b.result === '勝ち';
    const mySelect = (b.mySelect || []).map(n => MEGA_BASE[n] || n);
    const oppAxisRaw = matchupOppMode === 'oppSelect' ? (b.oppSelect || []) : (b.oppParty || []);
    const oppAxis = oppAxisRaw.map(n => MEGA_BASE[n] || n);

    mySelect.forEach(my => {
      myPokeSet.add(my);
      oppAxis.forEach(opp => {
        oppPokeSet.add(opp);
        const key = `${my}|${opp}`;
        if (!matchups[key]) matchups[key] = { wins: 0, total: 0 };
        matchups[key].total++;
        if (isWin) matchups[key].wins++;
      });
    });
  });

  // Filter: only show pairs with >= 2 battles
  const MIN_BATTLES = 2;
  const validOpp = new Set();
  const validMy = new Set();
  for (const [key, data] of Object.entries(matchups)) {
    if (data.total >= MIN_BATTLES) {
      const [my, opp] = key.split('|');
      validMy.add(my);
      validOpp.add(opp);
    }
  }

  if (validMy.size === 0 || validOpp.size === 0) {
    $container.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:24px;">十分なデータがありません（各組み合わせ2戦以上必要）</p>';
    renderMatchupDrill();
    return;
  }

  // Sort by total encounters desc
  const myPokeList = [...validMy].sort((a, b) => {
    const aTotal = [...validOpp].reduce((sum, opp) => sum + ((matchups[`${a}|${opp}`] || {}).total || 0), 0);
    const bTotal = [...validOpp].reduce((sum, opp) => sum + ((matchups[`${b}|${opp}`] || {}).total || 0), 0);
    return bTotal - aTotal;
  });
  const oppPokeList = [...validOpp].sort((a, b) => {
    const aTotal = [...validMy].reduce((sum, my) => sum + ((matchups[`${my}|${a}`] || {}).total || 0), 0);
    const bTotal = [...validMy].reduce((sum, my) => sum + ((matchups[`${my}|${b}`] || {}).total || 0), 0);
    return bTotal - aTotal;
  });

  // Build HTML table
  let html = '<div class="matchup-scroll"><table class="matchup-table"><thead><tr><th></th>';
  oppPokeList.forEach(opp => {
    const slug = getPokemonSlug(opp);
    html += `<th class="matchup-col-header"><img src="${getSpriteUrl(slug || 'substitute')}" alt="${escapeHtml(opp)}" title="${escapeHtml(opp)}"></th>`;
  });
  html += '</tr></thead><tbody>';

  myPokeList.forEach(my => {
    const slug = getPokemonSlug(my);
    html += `<tr><td class="matchup-row-header"><img src="${getSpriteUrl(slug || 'substitute')}" alt="${escapeHtml(my)}"><span>${escapeHtml(my)}</span></td>`;
    oppPokeList.forEach(opp => {
      const key = `${my}|${opp}`;
      const data = matchups[key];
      if (!data || data.total < MIN_BATTLES) {
        html += '<td class="matchup-cell empty">—</td>';
      } else {
        const rate = Math.round((data.wins / data.total) * 100);
        const colorClass = rate >= 60 ? 'high' : rate >= 40 ? 'mid' : 'low';
        const isSelected = matchupDrillSel && matchupDrillSel.my === my && matchupDrillSel.opp === opp;
        html += `<td class="matchup-cell ${colorClass}${isSelected ? ' selected' : ''}" data-my="${escapeHtml(my)}" data-opp="${escapeHtml(opp)}" title="vs ${escapeHtml(opp)}: ${data.wins}W ${data.total - data.wins}L (${rate}%)">${rate}%</td>`;
      }
    });
    html += '</tr>';
  });

  html += '</tbody></table></div>';
  $container.innerHTML = html;

  $container.querySelectorAll('.matchup-cell:not(.empty)').forEach(cell => {
    cell.addEventListener('click', () => {
      const my = cell.dataset.my;
      const opp = cell.dataset.opp;
      if (matchupDrillSel && matchupDrillSel.my === my && matchupDrillSel.opp === opp) {
        matchupDrillSel = null;
      } else {
        matchupDrillSel = { my, opp };
      }
      renderMatchupMatrix();
    });
  });

  renderMatchupDrill();
}

function renderMatchupDrill() {
  const $drill = document.getElementById('matchup-drill');
  if (!$drill) return;
  if (!matchupDrillSel) { $drill.innerHTML = ''; return; }

  const { my, opp } = matchupDrillSel;
  const statBattles = getStatsFilteredBattles();
  const matched = statBattles.filter(b => {
    if (b.result !== '勝ち' && b.result !== '負け') return false;
    const mySelect = (b.mySelect || []).map(n => MEGA_BASE[n] || n);
    const oppAxis = (matchupOppMode === 'oppSelect' ? (b.oppSelect || []) : (b.oppParty || [])).map(n => MEGA_BASE[n] || n);
    return mySelect.includes(my) && oppAxis.includes(opp);
  });

  const sorted = matched.slice().sort((a, b) => {
    const da = new Date(a.date), db = new Date(b.date);
    return db - da;
  });

  const wins = sorted.filter(b => b.result === '勝ち').length;
  const losses = sorted.length - wins;
  const rate = sorted.length > 0 ? Math.round((wins / sorted.length) * 100) : 0;
  const axisName = matchupOppMode === 'oppSelect' ? '相手選出' : '相手パーティ';

  const items = sorted.map(b => {
    const mySel = (b.mySelect || []).map(n => MEGA_BASE[n] || n);
    const oppAx = (matchupOppMode === 'oppSelect' ? (b.oppSelect || []) : (b.oppParty || [])).map(n => MEGA_BASE[n] || n);
    const myIcons = mySel.map(n => {
      const s = getPokemonSlug(n) || 'substitute';
      return `<img src="${getSpriteUrl(s)}" alt="${escapeHtml(n)}" title="${escapeHtml(n)}">`;
    }).join('');
    const oppIcons = oppAx.map(n => {
      const s = getPokemonSlug(n) || 'substitute';
      return `<img src="${getSpriteUrl(s)}" alt="${escapeHtml(n)}" title="${escapeHtml(n)}">`;
    }).join('');
    const resultClass = b.result === '勝ち' ? 'win' : 'lose';
    const resultLabel = b.result === '勝ち' ? 'W' : 'L';
    const rateStr = (b.rate !== undefined && b.rate !== null && b.rate !== '') ? `${escapeHtml(String(b.rate))}` : '—';
    return `
      <div class="matchup-drill-item">
        <span class="mdi-date">${escapeHtml(b.date || '')}</span>
        <span class="mdi-result ${resultClass}">${resultLabel}</span>
        <span class="mdi-rate">${rateStr}</span>
        <span class="mdi-my"><span class="mdi-label">選出</span><span class="mdi-pokes">${myIcons}</span></span>
        <span class="mdi-opp"><span class="mdi-label">${escapeHtml(axisName)}</span><span class="mdi-pokes">${oppIcons}</span></span>
      </div>
    `;
  }).join('');

  $drill.innerHTML = `
    <div class="matchup-drill-panel">
      <div class="matchup-drill-header">
        <div class="matchup-drill-title">
          ${escapeHtml(my)}<span class="mdh-vs">×</span>${escapeHtml(opp)}
          <span class="mdh-stat">${wins}W ${losses}L (${rate}%) / ${sorted.length}戦</span>
        </div>
        <button type="button" class="matchup-drill-close" id="matchup-drill-close">閉じる</button>
      </div>
      <div class="matchup-drill-list">${items || '<p style="color:var(--text-muted)">該当なし</p>'}</div>
    </div>
  `;

  document.getElementById('matchup-drill-close').addEventListener('click', () => {
    matchupDrillSel = null;
    renderMatchupMatrix();
  });
}

// ===== Render All Stats =====
export function renderAllStats() {
  buildPartyOptions();
  updatePartySummary();
  renderTrendChart();
  renderRateTrendChart();
  renderAnalytics();
  renderMyCombos();
  renderOppAnalytics();
  renderOppCombos();
  renderMatchupMatrix();
  setStatsDirty(false);
}
