(() => {
const $ = id => document.getElementById(id);
const PRESETS = {
  // Same bag as index.html (js/vtmg.js): a marble paying Nx returns the stake times N, so its net result is (N − 1)R.
  tharp:    [{r:-1,n:65},{r:0,n:15},{r:1,n:7},{r:2,n:6},{r:4,n:3},{r:9,n:2},{r:19,n:2}],
  tail:     [{r:-1,n:60},{r:-5,n:10},{r:2,n:20},{r:10,n:10}],
  disaster: [{r:1,n:75},{r:-1,n:20},{r:-8,n:5}],
  twoone:   [{r:2,n:50},{r:-1,n:50}],
  negative: [{r:-1,n:55},{r:-3,n:5},{r:1,n:30},{r:3,n:10}],
};
const S = { bag: PRESETS.tharp.map(o => ({...o})), seed: 20261010 };

// ---------- helpers ----------
function rng(seed){ let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// Marble colours from css/vtmg.css, keyed by net R (index.html payout minus 1).
const THARP_COLORS = { '-1': '#0f0f0f', '0': '#5cabff', '1': '#00ca00', '2': '#fff200', '4': 'silver', '9': 'gold', '19': 'pink' };
function marbleColor(r){
  if (THARP_COLORS[String(r)]) return THARP_COLORS[String(r)];
  if (r < 0) { const m = Math.min(1, Math.abs(r) / 8); return `hsl(${10 - m*8} ${62 + m*18}% ${60 - m*24}%)`; }
  if (r === 0) return 'hsl(222 8% 62%)';
  const m = Math.min(1, r / 10); return `hsl(${148 + m*70} ${48 + m*22}% ${50 - m*10}%)`;
}
const fmtR = r => (r > 0 ? '+' : '') + (Number.isInteger(r) ? r : r.toFixed(2)) + 'R';
function fmt$(v){ const a = Math.abs(v), s = v < 0 ? '−$' : '$';
  if (a >= 1e9) return s + (a/1e9).toFixed(2) + 'B';
  if (a >= 1e6) return s + (a/1e6).toFixed(2) + 'M';
  if (a >= 1e4) return s + (a/1e3).toFixed(1) + 'k';
  return s + Math.round(a).toLocaleString('en-US'); }
const pct = (v, d=1) => (v*100).toFixed(d) + '%';
function quantile(sorted, q){ if (!sorted.length) return 0; const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); }
function cssv(n){ return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function num(id, def, min, max){ let v = parseFloat($(id).value); if (!isFinite(v)) v = def; return Math.min(max, Math.max(min, v)); }

function settings(){
  return { risk: num('riskNum', 1, 0.01, 100) / 100, model: $('model').value,
    draws: Math.round(num('draws', 100, 1, 1000)), runs: Math.round(num('runs', 1000, 10, 5000)),
    start: num('start', 100000, 1, 1e12), ruin: num('ruin', 50, 1, 100) / 100 };
}
function validBag(){ return S.bag.filter(o => isFinite(o.r) && o.n > 0); }

// ---------- bag stats ----------
function bagStats(){
  const b = validBag(); const N = b.reduce((s,o) => s + o.n, 0);
  if (!N) return null;
  const E = b.reduce((s,o) => s + o.r*o.n, 0) / N;
  const v = b.reduce((s,o) => s + o.n*(o.r - E)**2, 0) / N, sd = Math.sqrt(v);
  const win = b.filter(o => o.r > 0).reduce((s,o) => s + o.n, 0) / N;
  const minR = Math.min(...b.map(o => o.r));
  let kelly = 0;
  if (E > 0 && minR < 0) {
    const fmax = 1 / Math.abs(minR); let best = -Infinity;
    for (let i = 1; i < 4000; i++) { const f = fmax * i / 4000; let g = 0;
      for (const o of b) g += o.n / N * Math.log(1 + f*o.r);
      if (g > best) { best = g; kelly = f; } }
  } else if (E > 0) kelly = Infinity;
  return { N, E, sd, win, minR, kelly };
}

// ---------- simulation ----------
let D = null, Dkey = '';
function draws(st){
  const b = validBag(); const key = JSON.stringify([b, st.runs, st.draws, S.seed]);
  if (key === Dkey) return D;
  const flat = []; b.forEach(o => { for (let i = 0; i < o.n; i++) flat.push(o.r); });
  const g = rng(S.seed); D = new Float32Array(st.runs * st.draws);
  for (let i = 0; i < D.length; i++) D[i] = flat[Math.floor(g() * flat.length)];
  Dkey = key; return D;
}
function simulate(st, f, full){
  const { runs, draws: n, start, model } = st, ruinLvl = start * (1 - st.ruin);
  const finals = new Float64Array(runs), mdd = new Float64Array(runs); let ruined = 0;
  const M = full ? new Float64Array(runs * (n + 1)) : null;
  for (let p = 0; p < runs; p++) {
    let eq = start, peak = start, dd = 0, dead = false; const o = p * n;
    if (M) M[p*(n+1)] = start;
    for (let k = 0; k < n; k++) {
      if (!dead) {
        eq += (model === 'pct' ? eq : start) * f * D[o + k];
        if (eq < 0) eq = 0;
        if (eq > peak) peak = eq;
        const d = (peak - eq) / peak; if (d > dd) dd = d;
        if (eq <= ruinLvl) dead = true;
      }
      if (M) M[p*(n+1) + k + 1] = eq;
    }
    finals[p] = eq; mdd[p] = dd; if (dead) ruined++;
  }
  return { finals, mdd, ruined, M };
}

// ---------- canvas ----------
function prep(cv, h){
  const w = cv.parentElement.clientWidth, dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.height = h + 'px';
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  ctx.font = '11px ' + cssv('--mono'); return { ctx, w, h };
}
function logTicks(lo, hi){ const t = []; for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) for (const m of [1, 2, 5]) { const v = m * 10**e; if (v >= lo && v <= hi) t.push(v); } return t; }
function thin(t, max){ if (t.length <= max) return t; const step = Math.ceil(t.length / max); return t.filter((_, i) => i % step === 0); }

let last = null;
function drawFan(){
  if (!last) return; const { st, sim } = last; const { runs, draws: n, start } = st, M = sim.M;
  const { ctx, w, h } = prep($('fan'), 280); const P = { l: 56, r: 12, t: 10, b: 26 };
  const ink = cssv('--ink'), muted = cssv('--muted'), line = cssv('--line'), acc = cssv('--accent'), soft = cssv('--accent-soft');
  const q = { p10: [], p25: [], p50: [], p75: [], p90: [] }; const col = new Float64Array(runs);
  for (let k = 0; k <= n; k++) { for (let p = 0; p < runs; p++) col[p] = M[p*(n+1)+k]; col.sort();
    q.p10.push(quantile(col,.1)); q.p25.push(quantile(col,.25)); q.p50.push(quantile(col,.5)); q.p75.push(quantile(col,.75)); q.p90.push(quantile(col,.9)); }
  let hi = Math.max(start * 1.2, ...q.p90) * 1.15; let lo = Math.min(start * 0.8, ...q.p10.filter(v => v > 0));
  lo = Math.max(lo * 0.85, start * 0.01, 1);
  const X = k => P.l + (w - P.l - P.r) * k / n;
  const Y = v => { v = Math.max(v, lo); return P.t + (h - P.t - P.b) * (1 - (Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))); };
  ctx.strokeStyle = line; ctx.fillStyle = muted; ctx.lineWidth = 1; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const t of thin(logTicks(lo, hi), 7)) { const y = Math.round(Y(t)) + .5; ctx.beginPath(); ctx.moveTo(P.l, y); ctx.lineTo(w - P.r, y); ctx.stroke(); ctx.fillText(fmt$(t), P.l - 6, y); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const xs = [0, Math.round(n/4), Math.round(n/2), Math.round(3*n/4), n].filter((v,i,a) => a.indexOf(v) === i);
  for (const k of xs) ctx.fillText(k === 0 ? 'draw 0' : String(k), X(k), h - P.b + 8);
  const band = (a, b, alpha) => { ctx.beginPath(); a.forEach((v,k) => k ? ctx.lineTo(X(k), Y(v)) : ctx.moveTo(X(k), Y(v)));
    for (let k = n; k >= 0; k--) ctx.lineTo(X(k), Y(b[k])); ctx.closePath(); ctx.globalAlpha = alpha; ctx.fillStyle = acc; ctx.fill(); ctx.globalAlpha = 1; };
  ctx.fillStyle = soft; band(q.p10, q.p90, .14); band(q.p25, q.p75, .2);
  ctx.strokeStyle = muted; ctx.globalAlpha = .28; ctx.lineWidth = 1;
  for (let p = 0; p < Math.min(runs, 24); p++) { ctx.beginPath(); for (let k = 0; k <= n; k++) { const x = X(k), y = Y(M[p*(n+1)+k]); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); }
  ctx.globalAlpha = 1;
  ctx.setLineDash([4, 4]); ctx.strokeStyle = ink; ctx.globalAlpha = .5; ctx.beginPath(); ctx.moveTo(P.l, Y(start)); ctx.lineTo(w - P.r, Y(start)); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  if (st.ruin < 1) { const rl = start*(1-st.ruin); if (rl > lo) { ctx.strokeStyle = cssv('--loss'); ctx.globalAlpha = .6; ctx.setLineDash([2,3]); ctx.beginPath(); ctx.moveTo(P.l, Y(rl)); ctx.lineTo(w-P.r, Y(rl)); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.fillStyle = cssv('--loss'); ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText('ruin', P.l + 4, Y(rl) - 2); } }
  ctx.strokeStyle = acc; ctx.lineWidth = 2.25; ctx.beginPath(); q.p50.forEach((v,k) => k ? ctx.lineTo(X(k), Y(v)) : ctx.moveTo(X(k), Y(v))); ctx.stroke();
  ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(X(n), Y(q.p50[n]), 3.5, 0, Math.PI*2); ctx.fill();
}

let sweepData = null;
function runSweep(st, stats){
  const maxR = Math.min(30, Math.max(8, stats && isFinite(stats.kelly) && stats.kelly > 0 ? stats.kelly * 250 : 10, st.risk * 100 * 1.4));
  const step = maxR > 15 ? 0.5 : 0.25; const xs = [], med = [], ruin = [];
  for (let r = step; r <= maxR + 1e-9; r += step) { const s = simulate(st, r/100, false); const f = Array.from(s.finals).sort((a,b) => a-b);
    xs.push(r); med.push(quantile(f, .5)); ruin.push(s.ruined / st.runs); }
  sweepData = { xs, med, ruin, maxR, st, stats };
}
function drawSweep(){
  if (!sweepData) return; const { xs, med, ruin, maxR, st, stats } = sweepData;
  const { ctx, w, h } = prep($('sweep'), 300); const P = { l: 56, r: 12, t: 10, b: 26 }, gap = 26;
  const muted = cssv('--muted'), line = cssv('--line'), acc = cssv('--accent'), win = cssv('--win'), loss = cssv('--loss'), ink = cssv('--ink');
  const H1 = (h - P.t - P.b - gap) * 0.62, top2 = P.t + H1 + gap, H2 = h - P.b - top2;
  const X = r => P.l + (w - P.l - P.r) * r / maxR;
  let lo = Math.max(Math.min(...med.filter(v => v > 0), st.start) * 0.8, st.start * 0.01, 1), hi = Math.max(...med, st.start) * 1.2;
  const Y1 = v => P.t + H1 * (1 - (Math.log(Math.max(v, lo)) - Math.log(lo)) / (Math.log(hi) - Math.log(lo)));
  const Y2 = v => top2 + H2 * (1 - v);
  ctx.lineWidth = 1; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const t of thin(logTicks(lo, hi), 5)) { const y = Math.round(Y1(t)) + .5; ctx.strokeStyle = line; ctx.beginPath(); ctx.moveTo(P.l, y); ctx.lineTo(w-P.r, y); ctx.stroke(); ctx.fillStyle = muted; ctx.fillText(fmt$(t), P.l - 6, y); }
  for (const t of [0, .5, 1]) { const y = Math.round(Y2(t)) + .5; ctx.strokeStyle = line; ctx.beginPath(); ctx.moveTo(P.l, y); ctx.lineTo(w-P.r, y); ctx.stroke(); ctx.fillStyle = muted; ctx.fillText((t*100) + '%', P.l - 6, y); }
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = muted;
  ctx.fillText('Median ending equity', P.l + 4, P.t + 2); ctx.fillText('Chance of ruin', P.l + 4, top2 + 2);
  ctx.textAlign = 'center'; const tstep = maxR > 20 ? 5 : maxR > 10 ? 2 : 1;
  for (let r = 0; r <= maxR + 1e-9; r += tstep) ctx.fillText(r + '%', X(r), h - P.b + 8);
  ctx.strokeStyle = ink; ctx.globalAlpha = .45; ctx.setLineDash([4,4]); ctx.beginPath(); ctx.moveTo(P.l, Y1(st.start)); ctx.lineTo(w-P.r, Y1(st.start)); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  ctx.strokeStyle = acc; ctx.lineWidth = 2.25; ctx.beginPath(); xs.forEach((r,i) => i ? ctx.lineTo(X(r), Y1(med[i])) : ctx.moveTo(X(r), Y1(med[i]))); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(X(xs[0]), Y2(0)); xs.forEach((r,i) => ctx.lineTo(X(r), Y2(ruin[i]))); ctx.lineTo(X(xs[xs.length-1]), Y2(0)); ctx.closePath();
  ctx.globalAlpha = .18; ctx.fillStyle = loss; ctx.fill(); ctx.globalAlpha = 1;
  ctx.strokeStyle = loss; ctx.lineWidth = 2; ctx.beginPath(); xs.forEach((r,i) => i ? ctx.lineTo(X(r), Y2(ruin[i])) : ctx.moveTo(X(r), Y2(ruin[i]))); ctx.stroke();
  const vline = (r, c, dash) => { if (r > maxR) return; const x = Math.round(X(r)) + .5; ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(x, P.t); ctx.lineTo(x, h - P.b); ctx.stroke(); ctx.setLineDash([]); };
  if (stats && isFinite(stats.kelly) && stats.kelly > 0) vline(stats.kelly * 100, win, [5, 4]);
  vline(st.risk * 100, acc, []);
  let bi = 0; med.forEach((v,i) => { if (v > med[bi]) bi = i; });
  ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(X(xs[bi]), Y1(med[bi]), 3.5, 0, Math.PI*2); ctx.fill();
  const firstRuin = xs.find((r,i) => ruin[i] >= .5);
  $('sweepNote').textContent = (stats && stats.E <= 0)
    ? `This bag loses ${Math.abs(stats.E).toFixed(2)}R per draw on average. No bet size makes a negative-expectancy bag profitable; smaller bets only lose more slowly.`
    : `Median ending equity peaks near ${xs[bi]}% risk per draw (${fmt$(med[bi])}) in this sample. ` +
      (firstRuin ? `At ${firstRuin}% and above, at least half the players are ruined.` : `Ruin stays below 50% across the range shown.`);
}

// ---------- render ----------
// Once the bag is edited by hand it no longer matches a preset.
function markCustom(){ $('preset').value = 'custom'; }
function renderBagRows(){
  const box = $('bagRows'); box.innerHTML = '';
  S.bag.forEach((o, i) => {
    const row = document.createElement('div'); row.className = 'bag-row';
    row.innerHTML = `<span class="marble" style="--c:${marbleColor(o.r)}"></span>
      <input type="number" step="0.5" id="r${i}" value="${o.r}" aria-label="R-multiple, row ${i+1}">
      <input type="number" step="1" min="0" id="n${i}" value="${o.n}" aria-label="Number of marbles, row ${i+1}">
      <span class="pct num" id="s${i}"></span>
      <button class="icon" type="button" aria-label="Remove row ${i+1}" title="Remove">✕</button>`;
    const [sw, ri, ni, , del] = row.children;
    ri.addEventListener('input', () => { markCustom(); o.r = parseFloat(ri.value); sw.style.setProperty('--c', marbleColor(isFinite(o.r) ? o.r : 0)); changed(); });
    ni.addEventListener('input', () => { markCustom(); o.n = Math.max(0, Math.round(parseFloat(ni.value) || 0)); changed(); });
    del.addEventListener('click', () => { markCustom(); S.bag.splice(i, 1); renderBagRows(); changed(); });
    box.appendChild(row);
  });
}
function renderBagInfo(stats){
  const N = stats ? stats.N : 0;
  S.bag.forEach((o, i) => { const el = $('s' + i); if (el) el.textContent = N && o.n > 0 ? pct(o.n / N, 0) : '–'; });
  const strip = $('strip'); strip.innerHTML = '';
  [...validBag()].sort((a,b) => a.r - b.r).forEach(o => { const m = document.createElement('span'); m.className = 'marble'; m.style.setProperty('--c', marbleColor(o.r)); m.title = `${o.n} × ${fmtR(o.r)}`; strip.appendChild(m); });
  const viz = $('bagviz'); viz.innerHTML = '';
  if (stats) { const scale = Math.min(1, 120 / N);
    [...validBag()].sort((a,b) => a.r - b.r).forEach(o => { const k = Math.max(1, Math.round(o.n * scale)); for (let j = 0; j < k; j++) { const m = document.createElement('span'); m.className = 'marble sm'; m.style.setProperty('--c', marbleColor(o.r)); viz.appendChild(m); } }); }
  if (!stats) { ['fE','fSQN','fWin','fKelly'].forEach(id => $(id).textContent = '–'); $('bagNote').textContent = 'Add at least one marble to play.'; return; }
  $('fE').textContent = fmtR(+stats.E.toFixed(3)); $('fE').className = 'v ' + (stats.E > 0 ? 'good' : stats.E < 0 ? 'bad' : '');
  const st = settings(); const sqn = stats.sd ? stats.E / stats.sd * Math.sqrt(Math.min(st.draws, 100)) : 0;
  $('fSQN').textContent = sqn.toFixed(2);
  $('fWin').textContent = pct(stats.win, 0);
  $('fKelly').textContent = stats.E <= 0 ? 'none' : isFinite(stats.kelly) ? pct(stats.kelly, 1) : 'unbounded';
  $('bagNote').textContent = `${N} marbles. SQN uses ${Math.min(st.draws, 100)} draws. Growth-optimal risk is the bet size that maximises long-run compound growth for this bag; betting more than that adds risk and lowers growth.`;
}

let timer = 0;
function changed(){ clearTimeout(timer); timer = setTimeout(run, 120); }
function run(){
  const stats = bagStats(); renderBagInfo(stats); resetPlay();
  if (!stats) { last = null; sweepData = null; return; }
  const st = settings(); draws(st);
  const sim = simulate(st, st.risk, true); last = { st, sim };
  const f = Array.from(sim.finals).sort((a,b) => a-b), dd = Array.from(sim.mdd).sort((a,b) => a-b);
  const med = quantile(f, .5);
  $('tMed').textContent = fmt$(med); $('tMed').className = 'v ' + (med >= st.start ? 'good' : 'bad');
  $('tMedS').textContent = (med >= st.start ? '+' : '') + pct(med / st.start - 1, 0) + ' vs start';
  $('tProfit').textContent = pct(f.filter(v => v > st.start).length / st.runs, 0);
  $('tRuin').textContent = pct(sim.ruined / st.runs, 1); $('tRuin').className = 'v ' + (sim.ruined / st.runs > .05 ? 'bad' : '');
  $('tRuinS').textContent = `lost ${pct(st.ruin, 0)} or more`;
  $('tDD').textContent = pct(quantile(dd, .5), 0);
  $('pctl').innerHTML = [['Worst', 0], ['10th pct', .1], ['25th', .25], ['75th', .75], ['90th', .9], ['Best', 1]].map(([l, q]) => `<span>${l} <b>${fmt$(quantile(f, q))}</b></span>`).join('');
  $('resSub').textContent = `${st.runs.toLocaleString()} players · ${st.draws} draws · ${(st.risk*100).toFixed(2).replace(/\.?0+$/,'')}% risk · ${st.model === 'pct' ? 'percent of equity' : 'fixed amount'}`;
  drawFan(); runSweep(st, stats); drawSweep();
}

// ---------- play by hand ----------
const play = { eq: 0, n: 0, sumR: 0 };
function resetPlay(){
  const st = settings(); play.eq = st.start; play.n = 0; play.sumR = 0;
  $('pEq').textContent = fmt$(play.eq); $('pEq').className = 'v'; $('pN').textContent = '0 · 0.0R';
  $('tray').innerHTML = ''; $('logBody').innerHTML = ''; $('bigR').textContent = '—'; $('bigR').style.color = '';
  $('bigPL').textContent = 'Draw to begin'; $('bigMarble').style.setProperty('--c', cssv('--line'));
}
function drawOne(){
  const b = validBag(); const N = b.reduce((s,o) => s + o.n, 0); if (!N) return;
  const st = settings(); if (play.eq <= 0) return;
  let x = Math.random() * N, r = b[0].r; for (const o of b) { if (x < o.n) { r = o.r; break; } x -= o.n; }
  const risked = (st.model === 'pct' ? play.eq : st.start) * st.risk; const pl = Math.max(risked * r, -play.eq);
  play.eq += pl; play.n++; play.sumR += r;
  const big = $('bigMarble'); big.classList.remove('anim'); void big.offsetWidth; big.classList.add('anim'); big.style.setProperty('--c', marbleColor(r));
  $('bigR').textContent = fmtR(r); $('bigR').style.color = r >= 0 ? cssv('--win') : cssv('--loss');
  $('bigPL').textContent = `${pl >= 0 ? '+' : ''}${fmt$(pl)} on ${fmt$(risked)} risked`;
  $('pEq').textContent = fmt$(play.eq); $('pEq').className = 'v ' + (play.eq >= st.start ? 'good' : 'bad');
  $('pN').textContent = `${play.n} · ${play.sumR >= 0 ? '+' : ''}${play.sumR.toFixed(1)}R`;
  const m = document.createElement('span'); m.className = 'marble sm'; m.style.setProperty('--c', marbleColor(r)); m.title = fmtR(r); $('tray').appendChild(m);
  const tr = document.createElement('tr'); tr.innerHTML = `<td>${play.n}</td><td class="${r >= 0 ? 'good' : 'bad'}">${fmtR(r)}</td><td>${fmt$(risked)}</td><td class="${pl >= 0 ? 'good' : 'bad'}">${pl >= 0 ? '+' : ''}${fmt$(pl)}</td><td>${fmt$(play.eq)}</td>`;
  const body = $('logBody'); body.prepend(tr); while (body.children.length > 10) body.lastChild.remove();
  if (play.eq <= 0) $('bigPL').textContent = 'Account wiped out. Start over to play again.';
}

// ---------- wiring ----------
$('riskRange').addEventListener('input', e => { $('riskNum').value = e.target.value; changed(); });
$('riskNum').addEventListener('input', e => { const v = parseFloat(e.target.value); if (isFinite(v)) $('riskRange').value = Math.min(25, Math.max(.25, v)); changed(); });
['model', 'draws', 'runs', 'start', 'ruin'].forEach(id => $(id).addEventListener('input', changed));
$('addRow').addEventListener('click', () => { markCustom(); S.bag.push({ r: 1, n: 10 }); renderBagRows(); changed(); });
$('preset').addEventListener('change', e => { const p = PRESETS[e.target.value]; if (p) { S.bag = p.map(o => ({...o})); renderBagRows(); run(); } });
$('reroll').addEventListener('click', () => { S.seed = (Math.random() * 2**31) | 0; run(); });
$('draw1').addEventListener('click', drawOne);
$('draw10').addEventListener('click', () => { for (let i = 0; i < 10; i++) drawOne(); });
$('playReset').addEventListener('click', resetPlay);
let rz = 0; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { drawFan(); drawSweep(); }, 100); });
const redraw = () => { drawFan(); drawSweep(); };
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redraw); } catch (e) {}
new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
if (document.fonts && document.fonts.ready) document.fonts.ready.then(redraw);

renderBagRows(); run();
})();
