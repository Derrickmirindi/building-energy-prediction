// Illustrative building view driven by the inputs: footprint = roof area, perimeter = wall area / height,
// height = overall height (3.5 m storeys), window size grows with the glazing fraction.
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs, parent) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); parent?.appendChild(n); return n; };

export function blockDims(ra, wa, h) {
  if (!(ra > 0 && wa > 0 && h > 0)) return null;
  const P = wa / h; const half = P / 2; const disc = half * half - 4 * ra;
  if (disc < 0) { const s = Math.sqrt(ra); return { a: s, b: s, consistent: false }; }
  const a = (half + Math.sqrt(disc)) / 2;
  return { a, b: ra / a, consistent: true };
}

function hull(pts) {
  const p = [...pts].sort((u, v) => u[0] - v[0] || u[1] - v[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = []; for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  const up = []; for (const q of p.reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

function defs(svg) {
  const d = el('defs', {}, svg);
  const lin = (id, x2, y2, stops) => { const g = el('linearGradient', { id, x1: 0, y1: 0, x2, y2 }, d); stops.forEach(([o, c]) => el('stop', { offset: o, 'stop-color': c }, g)); };
  lin('bx-sky', 0, 1, [['0', '#cfe2f7'], ['0.7', '#eef5fd'], ['1', '#f7faff']]);
  lin('bx-lit', 1, 1, [['0', '#f4efe6'], ['1', '#e3dccf']]);
  lin('bx-shade', 1, 1, [['0', '#c9c1b3'], ['1', '#b3ab9d']]);
  lin('bx-glass-l', 1, 1, [['0', '#9cc3e4'], ['0.45', '#5f8fbc'], ['0.55', '#82abd2'], ['1', '#3f6d99']]);
  lin('bx-glass-s', 1, 1, [['0', '#6d93b8'], ['0.5', '#45698f'], ['1', '#33557a']]);
  lin('bx-roof', 1, 1, [['0', '#a3a6ab'], ['1', '#86898f']]);
  const rg = el('radialGradient', { id: 'bx-tree', cx: '35%', cy: '30%', r: '70%' }, d);
  el('stop', { offset: '0', 'stop-color': '#8fbf73' }, rg); el('stop', { offset: '1', 'stop-color': '#4d7f3b' }, rg);
}

export function drawBuilding(host, v) {
  host.replaceChildren();
  const [, , wa, ra, h, , ga] = v;
  const d = blockDims(ra, wa, h);
  if (!d) return null;
  const { a, b } = d;
  const W = 480; const H = 320;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', class: 'bldg' }, host);
  const storeys = h / 3.5;
  el('title', {}, svg).textContent = `Building ${a.toFixed(1)} m × ${b.toFixed(1)} m in plan and ${h} m high, glazing fraction ${ga}.`;
  defs(svg);

  const par = 0.7; const inset = 0.3; const top = h + par;
  const cos = Math.cos(Math.PI / 6); const sin = Math.sin(Math.PI / 6);
  const rx = (x, y) => (x - y) * cos; const ry = (x, y, z) => -((x + y) * sin + z);
  // shadow cast towards the back-left by a sun from the front-right
  const sh = (x, y, z) => [x + 0.25 * z, y + 1.05 * z];
  const foot = [[0, 0], [a, 0], [a, b], [0, b]];
  const shadow = hull([...foot, ...foot.map(([x, y]) => sh(x, y, top))]).map(([x, y]) => [Math.min(x, a + 6), Math.min(y, b + 6)]);
  const trees = [[-4.2, b * 0.75, 5.2], [a * 0.88, -3.4, 4.4], [a + 3, b * 0.75, 6]];
  const person = [Math.min(a * 0.5 + 2.2, a - 0.5), -1.6];
  const lot = [[-7, -7, 0], [a + 6, -7, 0], [a + 6, b + 6, 0], [-7, b + 6, 0]];
  const pts = [...foot.flatMap(([x, y]) => [[x, y, 0], [x, y, top + 4]]), ...lot];
  const xs = pts.map(([x, y]) => rx(x, y)); const ys = pts.map(([x, y, z]) => ry(x, y, z));
  const bw = Math.max(...xs) - Math.min(...xs); const bh = Math.max(...ys) - Math.min(...ys);
  const s = Math.min(9, (W - 24) / bw, (H - 44) / bh);
  const cx = (W - bw * s) / 2 - Math.min(...xs) * s; const cy = 30 + (H - 40 - bh * s) / 2 - Math.min(...ys) * s;
  const P = (x, y, z) => [cx + rx(x, y) * s, cy + ry(x, y, z) * s];
  const pp = (arr) => arr.map((q) => P(...q).map((n) => n.toFixed(1)).join(',')).join(' ');
  const poly = (arr, attrs, parent = svg) => el('polygon', { points: pp(arr), ...attrs }, parent);

  // sky and ground
  el('rect', { x: 0, y: 0, width: W, height: H, fill: 'url(#bx-sky)' }, svg);
  poly([[-7, -7, -0.6], [a + 6, -7, -0.6], [a + 6, -7, 0], [-7, -7, 0]], { fill: '#9fb38f' });
  poly([[-7, -7, -0.6], [-7, b + 6, -0.6], [-7, b + 6, 0], [-7, -7, 0]], { fill: '#8aa07b' });
  poly(lot, { fill: '#cfe0bf', stroke: '#b5c9a4', 'stroke-width': 0.6 });
  poly([[-1.6, -1.6, 0], [a + 1.6, -1.6, 0], [a + 1.6, b + 1.6, 0], [-1.6, b + 1.6, 0]], { fill: '#e6e2da', stroke: '#cfc9bd', 'stroke-width': 0.6 });
  // path to the entrance
  const doorX = Math.max(1.2, Math.min(a / 2, a - 1.2));
  poly([[doorX - 0.9, -1.6, 0], [doorX + 0.9, -1.6, 0], [doorX + 0.9, -7, 0], [doorX - 0.9, -7, 0]], { fill: '#e6e2da' });
  // shadow
  poly(shadow.map(([x, y]) => [x, y, 0]), { fill: '#2d3b4a', opacity: 0.18 });

  const drawTree = ([x, y, t]) => {
    const base = P(x, y, 0); const topc = P(x, y, t);
    el('ellipse', { cx: base[0] - 0.6 * s, cy: base[1] - 0.2 * s, rx: 1.9 * s, ry: 0.8 * s, fill: '#2d3b4a', opacity: 0.15 }, svg);
    el('line', { x1: base[0], y1: base[1], x2: topc[0], y2: topc[1] + 1.2 * s, stroke: '#6b5440', 'stroke-width': Math.max(1.5, 0.35 * s), 'stroke-linecap': 'round' }, svg);
    el('ellipse', { cx: topc[0], cy: topc[1], rx: 1.9 * s, ry: 2.2 * s, fill: 'url(#bx-tree)' }, svg);
    el('ellipse', { cx: topc[0] - 0.5 * s, cy: topc[1] - 0.8 * s, rx: 0.9 * s, ry: 0.7 * s, fill: '#a5cf88', opacity: 0.55 }, svg);
  };
  // trees behind the building first (larger x + y = further away)
  const far = trees.filter(([x, y]) => x + y > (a + b) / 2); const near = trees.filter((t) => !far.includes(t));
  far.forEach(drawTree);

  // facades (y = 0 lit, x = 0 shaded), including the parapet
  poly([[0, 0, 0], [a, 0, 0], [a, 0, top], [0, 0, top]], { fill: 'url(#bx-lit)', stroke: '#5b5650', 'stroke-width': 0.8, 'stroke-linejoin': 'round' });
  poly([[0, 0, 0], [0, b, 0], [0, b, top], [0, 0, top]], { fill: 'url(#bx-shade)', stroke: '#5b5650', 'stroke-width': 0.8, 'stroke-linejoin': 'round' });
  // base plinth
  poly([[0, 0, 0], [a, 0, 0], [a, 0, 0.35], [0, 0, 0.35]], { fill: '#a39c90' });
  poly([[0, 0, 0], [0, b, 0], [0, b, 0.35], [0, 0, 0.35]], { fill: '#8d8678' });
  // floor slabs
  const levels = Math.max(1, Math.round(storeys));
  for (let k = 1; k * 3.5 < h - 0.01; k++) {
    const z = k * 3.5;
    poly([[0, 0, z - 0.12], [a, 0, z - 0.12], [a, 0, z + 0.12], [0, 0, z + 0.12]], { fill: '#d4cdc0' });
    poly([[0, 0, z - 0.12], [0, b, z - 0.12], [0, b, z + 0.12], [0, 0, z + 0.12]], { fill: '#a8a093' });
  }
  // parapet coping line
  el('polyline', { points: pp([[0, b, h], [0, 0, h], [a, 0, h]]), fill: 'none', stroke: '#9b9488', 'stroke-width': 0.8 }, svg);

  // windows: one per 3.5 m bay and storey; size grows with the glazing fraction
  const win = (facade, u0, u1, z0, z1) => {
    const q = facade === 'a' ? (u, z) => [u, 0, z] : (u, z) => [0, u, z];
    const um = (u0 + u1) / 2;
    poly([q(u0 - 0.08, z0 - 0.08), q(u1 + 0.08, z0 - 0.08), q(u1 + 0.08, z1 + 0.08), q(u0 - 0.08, z1 + 0.08)], { fill: '#f7f5f0' });
    poly([q(u0, z0), q(u1, z0), q(u1, z1), q(u0, z1)], { fill: facade === 'a' ? 'url(#bx-glass-l)' : 'url(#bx-glass-s)' });
    el('line', { x1: P(...q(um, z0))[0], y1: P(...q(um, z0))[1], x2: P(...q(um, z1))[0], y2: P(...q(um, z1))[1], stroke: '#f7f5f0', 'stroke-width': Math.max(0.8, 0.09 * s) }, svg);
    poly([q(u0 - 0.15, z0 - 0.15), q(u1 + 0.15, z0 - 0.15), q(u1 + 0.15, z0 - 0.02), q(u0 - 0.15, z0 - 0.02)], { fill: '#8e877b' });
  };
  if (ga > 0) {
    const winH = Math.min(2.5, 0.9 + ga * 4.2); const sill = Math.max(0.35, 2.75 - winH);
    for (const [facade, len] of [['a', a], ['b', b]]) {
      const n = Math.max(1, Math.floor(len / 3.5)); const bay = len / n;
      const ww = Math.min(bay * 0.8, bay * (0.3 + ga * 1.25));
      for (let i = 0; i < n; i++) {
        const u0 = i * bay + (bay - ww) / 2; const u1 = u0 + ww;
        for (let k = 0; k < levels; k++) {
          if (facade === 'a' && k === 0 && doorX > i * bay && doorX < (i + 1) * bay) continue;
          const z0 = k * 3.5 + sill; const z1 = Math.min(z0 + winH, (k + 1) * 3.5 - 0.3, h - 0.3);
          if (z1 - z0 > 0.4) win(facade, u0, u1, z0, z1);
        }
      }
    }
  }
  // entrance
  poly([[doorX - 0.75, 0, 0.35], [doorX + 0.75, 0, 0.35], [doorX + 0.75, 0, 2.6], [doorX - 0.75, 0, 2.6]], { fill: '#3b4a5a' });
  poly([[doorX - 0.6, 0, 0.35], [doorX + 0.6, 0, 0.35], [doorX + 0.6, 0, 2.45], [doorX - 0.6, 0, 2.45]], { fill: 'url(#bx-glass-l)', opacity: 0.85 });
  poly([[doorX - 1.1, 0, 2.75], [doorX + 1.1, 0, 2.75], [doorX + 1.1, -1.1, 2.75], [doorX - 1.1, -1.1, 2.75]], { fill: '#e9e4da', stroke: '#8e877b', 'stroke-width': 0.6 });

  // roof: parapet top, recessed membrane and the inner faces of the far parapets
  poly([[0, 0, top], [a, 0, top], [a, b, top], [0, b, top]], { fill: '#ece7dd', stroke: '#5b5650', 'stroke-width': 0.8, 'stroke-linejoin': 'round' });
  const i0 = inset; const ia = a - inset; const ib = b - inset;
  poly([[i0, i0, top - 0.05], [ia, i0, top - 0.05], [ia, ib, top - 0.05], [i0, ib, top - 0.05]], { fill: 'url(#bx-roof)' });
  poly([[i0, ib, top - 0.05], [ia, ib, top - 0.05], [ia, ib, top], [i0, ib, top]], { fill: '#b9b2a6' });
  poly([[ia, i0, top - 0.05], [ia, ib, top - 0.05], [ia, ib, top], [ia, i0, top]], { fill: '#cfc8bb' });
  // roof drainage lines for texture
  for (let t = 0.2; t < 1; t += 0.2) el('polyline', { points: pp([[i0 + (ia - i0) * t, i0, top - 0.05], [i0 + (ia - i0) * t, ib, top - 0.05]]), stroke: '#84878d', 'stroke-width': 0.4, fill: 'none' }, svg);

  // person for scale (1.75 m)
  const pf = P(person[0], person[1], 0); const ph = 1.75 * s;
  el('ellipse', { cx: pf[0] - 0.3 * s, cy: pf[1], rx: 0.45 * s, ry: 0.18 * s, fill: '#2d3b4a', opacity: 0.2 }, svg);
  el('rect', { x: pf[0] - 0.22 * s, y: pf[1] - ph * 0.82, width: 0.44 * s, height: ph * 0.6, rx: 0.15 * s, fill: '#3d5a80' }, svg);
  el('rect', { x: pf[0] - 0.18 * s, y: pf[1] - ph * 0.3, width: 0.36 * s, height: ph * 0.3, fill: '#2c3440' }, svg);
  el('circle', { cx: pf[0], cy: pf[1] - ph * 0.9, r: 0.14 * s, fill: '#c99a78' }, svg);

  near.forEach(drawTree);

  const t1 = el('text', { x: 12, y: 20, class: 'b-dim' }, svg);
  t1.textContent = `${a.toFixed(1)} × ${b.toFixed(1)} m plan · ${h} m high · ${Number.isInteger(storeys) ? storeys : storeys.toFixed(1)} storey${storeys === 1 ? '' : 's'}`;
  return d;
}
