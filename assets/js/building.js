// Perspective building rendering driven by the inputs (an original design, not a reconstruction):
//   footprint = roof area, perimeter = wall area / height, storeys = height / 3.5 m,
//   window and glazed-door sizes grow with the glazing fraction.
// A tiny SVG renderer: boxes and quads in metres -> perspective camera -> back-face culling ->
// painter's order by distance. Front facade is y = 0 (x along it), side facade is x = 0.
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs, parent) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); parent?.appendChild(n); return n; };

export function blockDims(ra, wa, h) {
  if (!(ra > 0 && wa > 0 && h > 0)) return null;
  const P = wa / h; const half = P / 2; const disc = half * half - 4 * ra;
  if (disc < 0) { const s = Math.sqrt(ra); return { a: s, b: s, consistent: false }; }
  const a = (half + Math.sqrt(disc)) / 2;
  return { a, b: ra / a, consistent: true };
}

/* ------------------------------------------------------------------ vector helpers */
const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
const norm = (p) => { const l = Math.hypot(...p); return [p[0] / l, p[1] / l, p[2] / l]; };
const SUN = norm([0.55, -0.75, 0.62]);

const MAT = {
  brick: [178, 98, 58], brickDark: [150, 78, 44], white: [236, 238, 240], panel: [226, 229, 232],
  grey: [150, 155, 160], dark: [40, 42, 46], frame: [245, 246, 247], glass: [92, 128, 158], plinth: [214, 216, 218],
};
const shade = (rgb, n, amb = 0.66) => {
  const k = n[2] < -0.5 ? 0.8 : amb + (1 - amb) * Math.max(0, dot(n, SUN));
  const under = 1;
  return `rgb(${rgb.map((c) => Math.round(Math.min(255, c * k * under))).join(',')})`;
};

export function drawBuilding(host, v) {
  host.replaceChildren();
  const [, , wa, ra, h, , ga] = v;
  const dims = blockDims(ra, wa, h);
  if (!dims) return null;
  const { a, b } = dims;
  const n = Math.max(1, Math.round(h / 3.5));                 // storeys
  const fh = h / n;                                            // floor-to-floor height
  const W = 520; const H = 460;

  /* ---------------------------------------------------------------- scene */
  const objs = [];   // {faces:[{pts, mat|fill, n, decor}], center}
  const quadN = (pts) => norm(cross(sub(pts[1], pts[0]), sub(pts[3], pts[0])));
  const box = (x0, x1, y0, y1, z0, z1, mat, opts = {}) => {
    const P = (x, y, z) => [x, y, z];
    const faces = [
      { pts: [P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1)], n: [0, -1, 0], side: 'front' },
      { pts: [P(x0, y1, z0), P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1)], n: [-1, 0, 0], side: 'left' },
      { pts: [P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)], n: [1, 0, 0], side: 'right' },
      { pts: [P(x1, y1, z0), P(x0, y1, z0), P(x0, y1, z1), P(x1, y1, z1)], n: [0, 1, 0], side: 'back' },
      { pts: [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], n: [0, 0, 1], side: 'top' },
      { pts: [P(x0, y1, z0), P(x1, y1, z0), P(x1, y0, z0), P(x0, y0, z0)], n: [0, 0, -1], side: 'bottom' },
    ].map((f) => ({ ...f, mat: (opts.mats && opts.mats[f.side]) || mat, decor: opts.decor?.[f.side] }));
    const o = { faces, center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], layer: opts.layer ?? 1, extra: opts.extra };
    objs.push(o); return o;
  };
  const quad = (pts, mat, opts = {}) => { const o = { faces: [{ pts, n: opts.n || quadN(pts), mat, glass: opts.glass, opacity: opts.opacity }], center: pts.reduce((s, p) => [s[0] + p[0] / 4, s[1] + p[1] / 4, s[2] + p[2] / 4], [0, 0, 0]), layer: opts.layer ?? 1, extra: opts.extra }; objs.push(o); return o; };

  // Massing: brick body; white panel volume on the left part of the front
  const wz = Math.min(Math.max(a * 0.3, 3.2), 7.5);           // white volume width
  const bay0 = wz + 0.8; const bay1 = Math.min(a - 1.6, bay0 + Math.max(4, Math.min(7.5, a * 0.45)));
  const brickLines = (axis) => ({ type: 'courses', axis });
  box(0, a, 0, b, 0.45, h, 'brick', { layer: 0, decor: { front: brickLines('x'), left: brickLines('y') } });
  box(-0.25, wz, -0.25, Math.min(b, 6), 0.45, h, 'panel', { layer: 0.5, decor: { front: { type: 'panels', axis: 'x' }, left: { type: 'panels', axis: 'y' } } });
  box(-0.35, a + 0.1, -0.35, b + 0.1, 0, 0.45, 'plinth', { layer: 0.4 });

  // dark floor bands on the brick
  for (let k = 1; k < n; k++) {
    const z = k * fh;
    box(wz, a + 0.02, -0.03, 0, z - 0.09, z + 0.09, 'dark', { layer: 0.6 });
    box(-0.03, 0, Math.min(b, 6), b + 0.02, z - 0.09, z + 0.09, 'dark', { layer: 0.6 });
  }

  // glazing in the balcony bay (full-height doors; height grows with glazing)
  const doorH = ga > 0 ? Math.min(fh - 0.5, 1.4 + ga * 4) : 0;
  for (let k = 0; k < n; k++) {
    const z0 = k * fh + (k === 0 ? 0.45 : 0.15);
    if (doorH > 0) {
      const segs = Math.max(2, Math.round((bay1 - bay0) / 1.6));
      for (let s = 0; s < segs; s++) {
        const x0 = bay0 + 0.2 + (s * (bay1 - bay0 - 0.4)) / segs; const x1 = x0 + (bay1 - bay0 - 0.4) / segs - 0.08;
        quad([[x0, -0.01, z0], [x1, -0.01, z0], [x1, -0.01, z0 + doorH], [x0, -0.01, z0 + doorH]], 'glass', { glass: true, layer: 0.8, n: [0, -1, 0] });
      }
    }
    // white slab edge band across the bay at each floor
    box(bay0 - 0.1, bay1 + 0.1, -0.12, 0, k * fh + fh - 0.3, k * fh + fh, 'white', { layer: 0.9 });
  }
  // cantilevered balconies on upper floors; a terrace with railing at ground level
  for (let k = 0; k < n; k++) {
    const zt = k === 0 ? 0.45 : k * fh; const depth = k === 0 ? 1.8 : 1.5;
    const x0 = bay0 - 0.2 + (k % 2) * 0.35; const x1 = bay1 + 0.2 - (k % 2) * 0.35;
    if (k > 0) {
      box(x0, x1, -depth, 0, zt - 0.32, zt, 'white', { layer: 2 });
      box(x0 + 0.15, x1 - 0.15, -depth + 0.15, -0.05, zt - 0.55, zt - 0.32, 'grey', { layer: 2 });   // soffit band
    }
    // railing: posts and rails along the front and returns
    const rail = { type: 'railing', x0, x1, y0: -depth + 0.06, z0: zt, z1: zt + 1.05 };
    quad([[x0, -depth + 0.06, zt], [x1, -depth + 0.06, zt], [x1, -depth + 0.06, zt + 1.05], [x0, -depth + 0.06, zt + 1.05]], 'glass', { glass: true, opacity: 0.18, layer: 2.5, n: [0, -1, 0], extra: rail });
  }

  // windows in the white volume (front and side), framed boxes like deep reveals
  if (ga > 0) {
    const ww = Math.min(wz * 0.55, 0.9 + ga * 3.2); const whh = Math.min(fh - 1.0, 1.0 + ga * 4.5);
    for (let k = 0; k < n; k++) {
      const z0 = k * fh + (fh - whh) / 2 + (k === 0 ? 0.25 : 0); const x0 = (wz - ww) / 2;
      box(x0 - 0.12, x0 + ww + 0.12, -0.6, -0.25, z0 - 0.12, z0 + whh + 0.12, 'frame', { layer: 1.5, mats: { front: 'frame' } });
      quad([[x0, -0.61, z0], [x0 + ww, -0.61, z0], [x0 + ww, -0.61, z0 + whh], [x0, -0.61, z0 + whh]], 'glass', { glass: true, layer: 1.6, n: [0, -1, 0] });
      // side windows on the brick facade
      const nb = Math.max(1, Math.floor((b - 6) / 3.2));
      for (let i = 0; i < nb && b > 6.5; i++) {
        const y0 = 6 + 0.8 + i * 3.2; const y1 = y0 + Math.min(2.2, 0.8 + ga * 3);
        quad([[-0.01, y1, z0], [-0.01, y0, z0], [-0.01, y0, z0 + whh], [-0.01, y1, z0 + whh]], 'glass', { glass: true, layer: 0.8, n: [-1, 0, 0] });
      }
      // side of the white volume
      const sw = Math.min(2.2, 0.8 + ga * 3);
      quad([[-0.26, 1.6 + sw, z0], [-0.26, 1.6, z0], [-0.26, 1.6, z0 + whh], [-0.26, 1.6 + sw, z0 + whh]], 'glass', { glass: true, layer: 1.6, n: [-1, 0, 0] });
    }
  }
  // brick facade windows to the right of the bay
  if (ga > 0 && a - bay1 > 2.4) {
    const ww = Math.min(a - bay1 - 1.2, 0.8 + ga * 3); const whh = Math.min(fh - 1.0, 1.0 + ga * 4.5);
    for (let k = 0; k < n; k++) {
      const z0 = k * fh + (fh - whh) / 2 + (k === 0 ? 0.25 : 0); const x0 = bay1 + (a - bay1 - ww) / 2;
      box(x0 - 0.15, x0 + ww + 0.15, -0.35, 0, z0 - 0.15, z0 + whh + 0.15, 'frame', { layer: 1.5 });
      quad([[x0, -0.36, z0], [x0 + ww, -0.36, z0], [x0 + ww, -0.36, z0 + whh], [x0, -0.36, z0 + whh]], 'glass', { glass: true, layer: 1.6, n: [0, -1, 0] });
    }
  }
  // roof: thick white overhanging canopy over the white volume and the bay, brick parapet elsewhere, brick stair core
  box(-0.6, bay1 + 0.6, -0.55, Math.min(b, 7) + 0.4, h, h + 0.55, 'white', { layer: 3 });
  if (a > bay1 + 0.6) box(bay1 + 0.6, a, 0, b, h, h + 0.7, 'brick', { layer: 2.8, decor: { front: brickLines('x') } });
  box(wz - 0.2, wz + 2.6, Math.max(1.5, b * 0.45), Math.max(3.5, b * 0.45 + 2.6), h + 0.55, h + 2.9, 'brick', { layer: 2.9, decor: { front: brickLines('x'), left: brickLines('y') } });
  box(wz - 0.35, wz + 2.75, Math.max(1.35, b * 0.45 - 0.15), Math.max(3.65, b * 0.45 + 2.75), h + 2.9, h + 3.1, 'white', { layer: 2.95 });

  /* ---------------------------------------------------------------- camera */
  const span = Math.max(a, b * 1.2, h * 2.2, 12);
  const C = [a * 0.3 - span * 0.7, -span * 1.4, 1.6];
  const T = [a * 0.48, b * 0.35, h * 0.52 + 0.8];
  const f = norm(sub(T, C)); const r = norm(cross(f, [0, 0, 1])); const u = cross(r, f);
  const proj = (p) => { const q = sub(p, C); const zc = dot(q, f); return [dot(q, r) / zc, -dot(q, u) / zc, zc]; };

  // fit the building into the frame
  const all = objs.flatMap((o) => o.faces.flatMap((fc) => fc.pts)).map(proj);
  const minX = Math.min(...all.map((p) => p[0])); const maxX = Math.max(...all.map((p) => p[0]));
  const minY = Math.min(...all.map((p) => p[1])); const maxY = Math.max(...all.map((p) => p[1]));
  const S = Math.min((W * 0.74) / (maxX - minX), (H * 0.68) / (maxY - minY));
  const ox = W * 0.52 - ((minX + maxX) / 2) * S; const oy = H * 0.86 - maxY * S;
  const scr = (p) => { const q = proj(p); return [ox + q[0] * S, oy + q[1] * S, q[2]]; };
  const pts = (arr) => arr.map((p) => scr(p).slice(0, 2).map((x) => x.toFixed(1)).join(',')).join(' ');
  const fh0 = norm([f[0], f[1], 0]); const horizon = oy + (-dot(fh0, u) / dot(fh0, f)) * S;   // eye-level line

  /* ---------------------------------------------------------------- draw */
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', class: 'bldg' }, host);
  el('title', {}, svg).textContent = `${n}-storey building, ${a.toFixed(1)} m × ${b.toFixed(1)} m in plan and ${h} m high, glazing fraction ${ga}.`;
  const d = el('defs', {}, svg);
  const lg = (id, stops, x2 = 0, y2 = 1) => { const g = el('linearGradient', { id, x1: 0, y1: 0, x2, y2 }, d); stops.forEach(([o, c, op]) => el('stop', { offset: o, 'stop-color': c, ...(op !== undefined ? { 'stop-opacity': op } : {}) }, g)); };
  lg('bv-sky', [['0', '#6f7884'], ['0.45', '#9aa3ad'], ['0.78', '#c9b9a6'], ['0.92', '#e9b98a'], ['1', '#f2cfa4']]);
  lg('bv-ground', [['0', '#5f6a55'], ['1', '#3f4a3a']]);
  lg('bv-glass', [['0', '#a9c4da'], ['0.38', '#6d93b4'], ['0.42', '#9dbcd6'], ['1', '#3c5f7e']], 1, 1);
  lg('bv-glass-s', [['0', '#7d9ab3'], ['1', '#3a556c']], 1, 1);
  const rg = el('radialGradient', { id: 'bv-leaf', cx: '40%', cy: '35%', r: '65%' }, d);
  el('stop', { offset: '0', 'stop-color': '#9cbf7a' }, rg); el('stop', { offset: '1', 'stop-color': '#4c7039' }, rg);
  const cl = el('filter', { id: 'bv-soft', x: '-20%', y: '-20%', width: '140%', height: '140%' }, d);
  el('feGaussianBlur', { stdDeviation: 6 }, cl);

  // sky with soft clouds, ground below the horizon
  const hz = Math.min(Math.max(horizon, H * 0.55), H * 0.97);
  el('rect', { x: 0, y: 0, width: W, height: H, fill: 'url(#bv-sky)' }, svg);
  const clouds = el('g', { filter: 'url(#bv-soft)', opacity: 0.55 }, svg);
  [[0.18, 0.12, 120, 26], [0.62, 0.08, 150, 22], [0.85, 0.3, 110, 20], [0.3, 0.38, 140, 16], [0.75, 0.52, 120, 14]].forEach(([cx, cy, rx, ry], i) => el('ellipse', { cx: W * cx, cy: H * cy, rx, ry, fill: i % 2 ? '#c7ccd2' : '#5f6873' }, clouds));
  el('rect', { x: 0, y: hz, width: W, height: H - hz, fill: 'url(#bv-ground)' }, svg);
  // pavement in front of the building
  const gp = (x, y) => scr([x, y, 0]);
  const pv = [gp(-6, -0.35), gp(a + 6, -0.35), gp(a + 6, -4.5), gp(-6, -4.5)].filter((p) => p[2] > 0.5);
  if (pv.length === 4) el('polygon', { points: pv.map((p) => p.slice(0, 2).join(',')).join(' '), fill: '#9a9a96' }, svg);

  // contact shadow
  el('polygon', { points: pts([[-0.6, -1, 0], [a + 0.4, -1, 0], [a + 0.4, b + 0.4, 0], [-0.6, b + 0.4, 0]]), fill: '#1f2522', opacity: 0.35 }, svg);

  const tree = (x, y, t, scale = 1) => {
    const base = scr([x, y, 0]); const top = scr([x, y, t]);
    if (base[2] < 0.5) return;
    const k = Math.abs(top[1] - base[1]) / t;   // px per metre at that depth
    el('line', { x1: base[0], y1: base[1], x2: top[0], y2: top[1] + 1.5 * k, stroke: '#4b3a2b', 'stroke-width': Math.max(1.4, 0.22 * k), 'stroke-linecap': 'round' }, svg);
    const g = el('g', {}, svg);
    [[0, -0.2, 1.7], [-1, 0.5, 1.2], [1, 0.4, 1.3], [-0.4, -1.1, 1.1], [0.6, -1, 1.0], [0, 1.1, 1.0]].forEach(([dx, dy, rr]) =>
      el('circle', { cx: top[0] + dx * k * scale, cy: top[1] + dy * k * scale, r: rr * k * scale, fill: 'url(#bv-leaf)', opacity: 0.95 }, g));
  };
  // trees behind (beside the far end)
  tree(a + 3.2, b * 0.8, Math.min(8, h + 3), 0.7);

  // painter's order: layer, then distance from the camera (far first)
  const dist = (p) => Math.hypot(...sub(p, C));
  const order = objs.map((o) => ({ o, d: dist(o.center) })).sort((p, q) => (p.o.layer - q.o.layer) || (q.d - p.d));
  for (const { o } of order) {
    for (const fc of o.faces) {
      const mid = fc.pts.reduce((s, p) => [s[0] + p[0] / fc.pts.length, s[1] + p[1] / fc.pts.length, s[2] + p[2] / fc.pts.length], [0, 0, 0]);
      if (dot(fc.n, sub(C, mid)) <= 0) continue;                     // back face
      const fill = fc.glass ? (fc.n[0] < -0.5 ? 'url(#bv-glass-s)' : 'url(#bv-glass)') : shade(MAT[fc.mat], fc.n);
      el('polygon', { points: pts(fc.pts), fill, ...(fc.opacity !== undefined ? { opacity: fc.opacity } : {}), stroke: fc.glass ? '#e9edf0' : 'rgba(30,30,30,.25)', 'stroke-width': fc.glass ? 0.8 : 0.5, 'stroke-linejoin': 'round' }, svg);
      if (fc.decor) decorate(fc, fc.decor);
    }
    if (o.extra?.type === 'railing') railing(o.extra);
  }

  function decorate(fc, dc) {
    const [p0, p1, , p3] = fc.pts;   // p0->p1 along the facade, p0->p3 vertical
    const along = sub(p1, p0); const up = sub(p3, p0); const len = Math.hypot(...along); const hgt = Math.hypot(...up);
    const at = (s, t) => [p0[0] + along[0] * s + up[0] * t, p0[1] + along[1] * s + up[1] * t, p0[2] + along[2] * s + up[2] * t];
    const g = el('g', { stroke: dc.type === 'courses' ? 'rgba(90,40,18,.35)' : 'rgba(120,125,130,.55)', 'stroke-width': 0.5 }, svg);
    if (dc.type === 'courses') {
      for (let z = 0.3; z < hgt; z += 0.3) { const [q0, q1] = [scr(at(0, z / hgt)), scr(at(1, z / hgt))]; el('line', { x1: q0[0], y1: q0[1], x2: q1[0], y2: q1[1] }, g); }
    } else {
      for (let z = 0.9; z < hgt; z += 0.9) { const [q0, q1] = [scr(at(0, z / hgt)), scr(at(1, z / hgt))]; el('line', { x1: q0[0], y1: q0[1], x2: q1[0], y2: q1[1] }, g); }
      for (let s = 1.2; s < len; s += 1.2) { const [q0, q1] = [scr(at(s / len, 0)), scr(at(s / len, 1))]; el('line', { x1: q0[0], y1: q0[1], x2: q1[0], y2: q1[1] }, g); }
    }
  }
  function railing({ x0, x1, y0, z0, z1 }) {
    const g = el('g', { stroke: '#d9dde1', 'stroke-linecap': 'round' }, svg);
    const seg = (p, q, w) => { const A = scr(p); const B = scr(q); el('line', { x1: A[0], y1: A[1], x2: B[0], y2: B[1], 'stroke-width': w }, g); };
    for (let x = x0 + 0.05; x <= x1; x += 0.12) seg([x, y0, z0], [x, y0, z1], 0.55);
    seg([x0, y0, z1], [x1, y0, z1], 2); seg([x0, y0, z0 + 0.08], [x1, y0, z0 + 0.08], 1.2);
    seg([x0, y0, z1], [x0, 0, z1], 1.6); seg([x1, y0, z1], [x1, 0, z1], 1.6);
  }

  // foreground: shrubs with flowers along the pavement, a tree at the corner
  tree(-4.2, 1.2, Math.min(7.5, h + 2), 0.65);
  const shrubs = el('g', {}, svg);
  for (let x = -2.5; x < a * 0.55; x += 0.9) {
    const p = scr([x, -2.6 - (Math.round(x * 3) % 2) * 0.25, 0.3]); if (p[2] < 0.5) continue;
    const k = S / p[2];
    el('ellipse', { cx: p[0], cy: p[1], rx: 0.5 * k, ry: 0.28 * k, fill: '#4f6f3a' }, shrubs);
    el('ellipse', { cx: p[0] - 0.15 * k, cy: p[1] - 0.1 * k, rx: 0.3 * k, ry: 0.17 * k, fill: '#6f9150' }, shrubs);
    for (let j = 0; j < 3; j++) el('circle', { cx: p[0] + (j - 1) * 0.22 * k, cy: p[1] - 0.2 * k + (j % 2) * 0.08 * k, r: Math.max(0.8, 0.06 * k), fill: j % 2 ? '#f0a03c' : '#e5672f' }, shrubs);
  }
  tree(a + 1.8, -2.6, Math.min(6.5, h + 1), 0.6);

  const t1 = el('text', { x: 14, y: 24, class: 'b-dim b-dim-light' }, svg);
  t1.textContent = `${a.toFixed(1)} × ${b.toFixed(1)} m plan · ${h} m high · ${n} storey${n === 1 ? '' : 's'}`;
  return dims;
}
