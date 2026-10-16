// Schematic illustration: an equivalent rectangular block. Not a reconstruction of the building.
// Footprint area = roof area; perimeter = wall area / height; height = overall height.
// The dataset buildings are assemblies of 3.5 m cubes, so their real plans can differ.
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs, parent) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); parent?.appendChild(n); return n; };

export function blockDims(ra, wa, h) {
  const P = wa / h; const half = P / 2; const disc = half * half - 4 * ra;
  if (!(ra > 0 && wa > 0 && h > 0)) return null;
  if (disc < 0) { const s = Math.sqrt(ra); return { a: s, b: s, consistent: false }; }
  const a = (half + Math.sqrt(disc)) / 2; const b = ra / a;
  return { a, b, consistent: true };
}

export function drawBuilding(host, v) {
  host.replaceChildren();
  const [, , wa, ra, h, , ga] = v;
  const d = blockDims(ra, wa, h);
  if (!d) return null;
  const W = 320; const H = 230;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', class: 'bldg' }, host);
  const title = el('title', {}, svg);
  const storeys = h / 3.5;
  title.textContent = `Schematic block ${d.a.toFixed(1)} m × ${d.b.toFixed(1)} m in plan, ${h} m high (${Number.isInteger(storeys) ? storeys : storeys.toFixed(2)} × 3.5 m), glazing fraction ${ga}.`;
  // Isometric projection. Fixed scale (so changes are comparable) unless the block would not fit;
  // the drawing is centred in the frame either way.
  const cos = Math.cos(Math.PI / 6); const sin = Math.sin(Math.PI / 6);
  const rawX = (x, y) => (x - y) * cos; const rawY = (x, y, z) => -((x + y) * sin + z);
  const xs = [rawX(0, 0), rawX(d.a, 0), rawX(0, d.b), rawX(d.a, d.b)];
  const ys = [rawY(0, 0, 0), rawY(d.a, d.b, 0), rawY(0, 0, h), rawY(d.a, d.b, h), rawY(d.a, 0, h), rawY(0, d.b, h)];
  const bw = Math.max(...xs) - Math.min(...xs); const bh = Math.max(...ys) - Math.min(...ys);
  const s = Math.min(6, (W - 40) / bw, (H - 64) / bh);
  const cx = (W - bw * s) / 2 - Math.min(...xs) * s; const cy = 40 + (H - 52 - bh * s) / 2 - Math.min(...ys) * s;
  const P = (x, y, z) => [cx + rawX(x, y) * s, cy + rawY(x, y, z) * s].map((n) => n.toFixed(1)).join(',');
  const poly = (pts, cls) => el('polygon', { points: pts.join(' '), class: cls }, svg);
  // ground shadow
  poly([P(0, 0, 0), P(d.a, 0, 0), P(d.a, d.b, 0), P(0, d.b, 0)], 'b-ground');
  // two visible facades + roof
  poly([P(0, 0, 0), P(d.a, 0, 0), P(d.a, 0, h), P(0, 0, h)], 'b-wall b-wall-a');
  poly([P(0, 0, 0), P(0, d.b, 0), P(0, d.b, h), P(0, 0, h)], 'b-wall b-wall-b');
  poly([P(0, 0, h), P(d.a, 0, h), P(d.a, d.b, h), P(0, d.b, h)], 'b-roof');
  // storey lines
  for (let z = 3.5; z < h - 0.01; z += 3.5) {
    el('polyline', { points: [P(0, d.b, z), P(0, 0, z), P(d.a, 0, z)].join(' '), class: 'b-floor' }, svg);
  }
  // glazing band per storey: height proportional to glazing fraction (drawn uniformly; direction not shown)
  if (ga > 0) {
    const levels = Math.max(1, Math.round(storeys));
    const band = Math.min(2.6, 0.6 + ga * 5);
    for (let k = 0; k < levels; k++) {
      const z0 = Math.min(k * 3.5 + 1.0, h - 0.3); const z1 = Math.min(z0 + band, (k + 1) * 3.5 - 0.3, h - 0.2);
      if (z1 <= z0) continue;
      const nA = Math.max(1, Math.floor(d.a / 3.5)); const nB = Math.max(1, Math.floor(d.b / 3.5));
      for (let i = 0; i < nA; i++) { const x0 = (i + 0.2) * (d.a / nA); const x1 = (i + 0.8) * (d.a / nA); poly([P(x0, 0, z0), P(x1, 0, z0), P(x1, 0, z1), P(x0, 0, z1)], 'b-glass'); }
      for (let i = 0; i < nB; i++) { const y0 = (i + 0.2) * (d.b / nB); const y1 = (i + 0.8) * (d.b / nB); poly([P(0, y0, z0), P(0, y1, z0), P(0, y1, z1), P(0, y0, z1)], 'b-glass'); }
    }
  }
  const t1 = el('text', { x: 8, y: 16, class: 'b-dim' }, svg); t1.textContent = `${d.a.toFixed(1)} × ${d.b.toFixed(1)} m plan · ${h} m high`;
  if (!d.consistent) { const t2 = el('text', { x: 8, y: 32, class: 'b-warn' }, svg); t2.textContent = 'Areas inconsistent with a rectangle: drawn as a square'; }
  return d;
}
