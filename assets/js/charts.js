// Small dependency-free SVG charts. Every chart has a data-table alternative built by the caller.
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
};
export const COLORS = { heating: '#c4472f', cooling: '#2e6e9e' };

function niceTicks(lo, hi, n = 5) {
  if (lo === hi) { lo -= 1; hi += 1; }
  const span = hi - lo; const step0 = span / n;
  const mag = 10 ** Math.floor(Math.log10(step0)); const err = step0 / mag;
  const step = (err >= 7 ? 10 : err >= 3 ? 5 : err >= 1.5 ? 2 : 1) * mag;
  const t0 = Math.floor(lo / step) * step; const t1 = Math.ceil(hi / step) * step;
  const ticks = []; for (let t = t0; t <= t1 + step / 2; t += step) ticks.push(+t.toFixed(10));
  return { ticks, lo: t0, hi: t1 };
}
const fmtTick = (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? (+v.toFixed(1)).toString() : (+v.toFixed(3)).toString());

function tooltip(host) {
  let t = host.querySelector('.chart-tip');
  if (!t) { t = document.createElement('div'); t.className = 'chart-tip'; t.hidden = true; t.setAttribute('aria-hidden', 'true'); host.appendChild(t); }
  return {
    show(html, x, y) { t.innerHTML = html; t.hidden = false; const w = host.clientWidth; t.style.left = Math.min(Math.max(x, 70), w - 70) + 'px'; t.style.top = y + 'px'; },
    hide() { t.hidden = true; },
  };
}

/**
 * Single-series response chart.
 * opts: {xLabel, yLabel, color, categorical, points:[{x, y, label, clipped}], best:index|null, current:x|null, clipLines:[lo,hi]}
 */
export function lineChart(host, opts) {
  host.querySelector('svg')?.remove();
  const W = Math.max(host.clientWidth || 600, 280); const H = 240;
  const m = { l: 52, r: 16, t: 14, b: 44 };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': opts.ariaLabel || '' });
  host.prepend(svg);
  const pts = opts.points;
  if (!pts.length) return;
  const ys = pts.map((p) => p.y);
  const yt = niceTicks(Math.min(...ys), Math.max(...ys), 4);
  const iw = W - m.l - m.r; const ih = H - m.t - m.b;
  let xs, xpos;
  if (opts.categorical) {
    xs = pts.map((p) => p.x);
    const band = iw / xs.length;
    xpos = (x) => m.l + band * (xs.indexOf(x) + 0.5);
  } else {
    const xmin = Math.min(...pts.map((p) => p.x)); const xmax = Math.max(...pts.map((p) => p.x));
    const span = xmax - xmin || 1;
    xpos = (x) => m.l + ((x - xmin) / span) * iw;
    xs = niceTicks(xmin, xmax, 5).ticks.filter((t) => t >= xmin - 1e-9 && t <= xmax + 1e-9);
  }
  const ypos = (y) => m.t + ih - ((y - yt.lo) / (yt.hi - yt.lo)) * ih;
  const g = el('g', { class: 'axis' }, svg);
  yt.ticks.forEach((t) => {
    el('line', { x1: m.l, x2: W - m.r, y1: ypos(t), y2: ypos(t), class: 'grid' }, g);
    const tx = el('text', { x: m.l - 8, y: ypos(t) + 4, 'text-anchor': 'end' }, g); tx.textContent = fmtTick(t);
  });
  xs.forEach((t) => { const tx = el('text', { x: xpos(t), y: H - m.b + 18, 'text-anchor': 'middle' }, g); tx.textContent = opts.categorical ? String(t) : fmtTick(t); });
  const xl = el('text', { x: m.l + iw / 2, y: H - 6, 'text-anchor': 'middle', class: 'axis-title' }, g); xl.textContent = opts.xLabel;
  const yl = el('text', { x: 12, y: m.t + ih / 2, transform: `rotate(-90 12 ${m.t + ih / 2})`, 'text-anchor': 'middle', class: 'axis-title' }, g); yl.textContent = opts.yLabel;
  if (opts.current !== null && opts.current !== undefined && (opts.categorical ? xs.includes(opts.current) : true)) {
    const cx = xpos(opts.current);
    if (cx >= m.l - 1 && cx <= W - m.r + 1) el('line', { x1: cx, x2: cx, y1: m.t, y2: m.t + ih, class: 'current-line' }, svg);
  }
  if (!opts.categorical && pts.length > 1) {
    el('path', { d: pts.map((p, i) => `${i ? 'L' : 'M'}${xpos(p.x).toFixed(1)},${ypos(p.y).toFixed(1)}`).join(''), fill: 'none', stroke: opts.color, 'stroke-width': 2, 'stroke-linejoin': 'round' }, svg);
  }
  pts.forEach((p, i) => {
    const r = opts.categorical ? 5 : (pts.length > 60 ? 0 : 3.5);
    if (r) el('circle', { cx: xpos(p.x), cy: ypos(p.y), r, fill: p.clipped ? '#fff' : opts.color, stroke: opts.color, 'stroke-width': 2, class: 'pt' }, svg);
    if (i === opts.best) {
      el('circle', { cx: xpos(p.x), cy: ypos(p.y), r: 8, fill: 'none', stroke: '#1d1d1f', 'stroke-width': 1.5 }, svg);
      const bx = xpos(p.x); const anchor = bx < m.l + 50 ? 'start' : bx > W - m.r - 50 ? 'end' : 'middle';
      const by = ypos(p.y) - 13 < m.t + 8 ? ypos(p.y) + 22 : ypos(p.y) - 13;
      const lab = el('text', { x: bx + (anchor === 'start' ? 10 : anchor === 'end' ? -10 : 0), y: by, 'text-anchor': anchor, class: 'best-label' }, svg); lab.textContent = 'lowest tested';
    }
  });
  // hover layer
  const tip = tooltip(host);
  const hit = el('rect', { x: m.l, y: m.t, width: iw, height: ih, fill: 'transparent' }, svg);
  const cross = el('line', { y1: m.t, y2: m.t + ih, class: 'crosshair', visibility: 'hidden' }, svg);
  hit.addEventListener('pointermove', (e) => {
    const r = svg.getBoundingClientRect(); const sx = (e.clientX - r.left) * (W / r.width);
    let bi = 0; let bd = Infinity;
    pts.forEach((p, i) => { const d = Math.abs(xpos(p.x) - sx); if (d < bd) { bd = d; bi = i; } });
    const p = pts[bi];
    cross.setAttribute('x1', xpos(p.x)); cross.setAttribute('x2', xpos(p.x)); cross.setAttribute('visibility', 'visible');
    tip.show(`<strong>${p.label}</strong><br>${opts.yShort}: ${p.y.toFixed(2)}${p.clipped ? ' (clipped)' : ''}`, (xpos(p.x) / W) * r.width, (ypos(p.y) / H) * r.height - 12);
  });
  hit.addEventListener('pointerleave', () => { tip.hide(); cross.setAttribute('visibility', 'hidden'); });
}

/** Sequential single-hue ramp: light -> dark. */
function ramp(hex, t) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const light = [247, 245, 240];
  const mix = c.map((v, i) => Math.round(light[i] + (v - light[i]) * (0.12 + 0.88 * t)));
  return `rgb(${mix.join(',')})`;
}

/**
 * Heatmap. opts: {xs, ys, xLabel, yLabel, values: (xi, yi) -> {v, clipped}, color, yShort, best:{xi,yi}}
 */
export function heatmap(host, opts) {
  host.querySelector('svg')?.remove();
  host.querySelector('.hm-legend')?.remove();
  const W = Math.max(host.clientWidth || 600, 280);
  const m = { l: 64, r: 12, t: 10, b: 44 };
  const nx = opts.xs.length; const ny = opts.ys.length;
  const cw = (W - m.l - m.r) / nx; const ch = Math.max(Math.min(cw, 28), 10);
  const H = m.t + ch * ny + m.b;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': opts.ariaLabel || '' });
  host.prepend(svg);
  let lo = Infinity; let hi = -Infinity;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) { const v = opts.values(i, j).v; lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const span = hi - lo || 1;
  const tip = tooltip(host);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const c = opts.values(i, j);
      const x = m.l + i * cw; const y = m.t + (ny - 1 - j) * ch;
      const rect = el('rect', { x: x + 1, y: y + 1, width: Math.max(cw - 2, 1), height: Math.max(ch - 2, 1), fill: ramp(opts.color, (c.v - lo) / span), rx: 2 }, svg);
      if (c.clipped) el('line', { x1: x + 3, y1: y + ch - 3, x2: x + cw - 3, y2: y + 3, stroke: '#1d1d1f', 'stroke-width': 1 }, svg);
      rect.addEventListener('pointerenter', () => {
        const r = svg.getBoundingClientRect();
        tip.show(`${opts.xLabel}: ${opts.xs[i]}<br>${opts.yLabel}: ${opts.ys[j]}<br><strong>${opts.yShort}: ${c.v.toFixed(2)}</strong>${c.clipped ? ' (clipped)' : ''}`, ((x + cw / 2) / W) * r.width, ((y) / H) * r.height - 6);
      });
      rect.addEventListener('pointerleave', () => tip.hide());
    }
  }
  if (opts.best) {
    const x = m.l + opts.best.xi * cw; const y = m.t + (ny - 1 - opts.best.yi) * ch;
    el('rect', { x: x + 0.5, y: y + 0.5, width: cw - 1, height: ch - 1, fill: 'none', stroke: '#1d1d1f', 'stroke-width': 2, rx: 2 }, svg);
  }
  const g = el('g', { class: 'axis' }, svg);
  const everyX = Math.ceil(nx / Math.max(2, Math.floor((W - m.l) / 46)));
  opts.xs.forEach((v, i) => { if (i % everyX === 0 || i === nx - 1) { const t = el('text', { x: m.l + (i + 0.5) * cw, y: m.t + ny * ch + 16, 'text-anchor': 'middle' }, g); t.textContent = String(v); } });
  const everyY = Math.ceil(ny / Math.max(2, Math.floor((ny * ch) / 16)));
  opts.ys.forEach((v, j) => { if (j % everyY === 0 || j === ny - 1) { const t = el('text', { x: m.l - 6, y: m.t + (ny - 1 - j) * ch + ch / 2 + 4, 'text-anchor': 'end' }, g); t.textContent = String(v); } });
  const xl = el('text', { x: m.l + (W - m.l - m.r) / 2, y: H - 6, 'text-anchor': 'middle', class: 'axis-title' }, g); xl.textContent = opts.xLabel;
  const yl = el('text', { x: 12, y: m.t + (ny * ch) / 2, transform: `rotate(-90 12 ${m.t + (ny * ch) / 2})`, 'text-anchor': 'middle', class: 'axis-title' }, g); yl.textContent = opts.yLabel;
  const leg = document.createElement('div');
  leg.className = 'hm-legend';
  leg.innerHTML = `<span>${lo.toFixed(2)}</span><span class="hm-bar" style="--c0:${ramp(opts.color, 0)};--c1:${ramp(opts.color, 1)}"></span><span>${hi.toFixed(2)}</span><span class="muted">${opts.yShort}${opts.anyClipped ? ' · diagonal stroke = clipped output' : ''}</span>`;
  host.appendChild(leg);
}
