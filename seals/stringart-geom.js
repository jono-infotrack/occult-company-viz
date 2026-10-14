// Pure geometry for the string-art seal (seals/stringart.js). Everything is built on the unit
// sphere with the pole on +y; the caller scales each shell to its radius.

const GA = Math.PI * (3 - Math.sqrt(5)); // golden angle
const PHI = (1 + Math.sqrt(5)) / 2;
const FIB = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89];

export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Accumulates thread segments plus a per-vertex alpha weight ("aw").
export class Strings {
  constructor() { this.p = []; this.w = []; }
  seg(a, b, wa = 1, wb = wa) { this.p.push(a[0], a[1], a[2], b[0], b[1], b[2]); this.w.push(wa, wb); return this; }
  // Polyline as segments; w(i) gives a per-point weight.
  poly(pts, w = () => 1) {
    for (let i = 0; i + 1 < pts.length; i++) this.seg(pts[i], pts[i + 1], w(i), w(i + 1));
    return this;
  }
  get count() { return this.w.length / 2; }
  geometry(THREE) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('aw', new THREE.Float32BufferAttribute(this.w, 1));
    return g;
  }
}

export function fibPoints(N) {
  const pts = [];
  for (let i = 0; i < N; i++) {
    const y = 1 - (2 * (i + 0.5)) / N, r = Math.sqrt(1 - y * y), t = i * GA;
    pts.push([Math.cos(t) * r, y, Math.sin(t) * r]);
  }
  return pts;
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const flat = (pts) => new Float32Array(pts.flat());

// Fibonacci-sphere weave: pin i is threaded to pin i+k for consecutive Fibonacci offsets k. Each
// offset family is k continuous spirals running pole to pole (the sunflower parastichies), and the
// families cross in opposite senses, which is the spherical analogue of an {n/k} chord web.
// Offsets default to the Fibonacci numbers nearest the pin spacing so the threads hug the surface.
export function fibWeave(N, { families = 2, offsets = null } = {}) {
  const P = fibPoints(N);
  const s = new Strings();
  let offs = offsets;
  if (!offs) {
    const want = 1.3 * Math.sqrt(N);
    let j = 0;
    FIB.forEach((f, idx) => { if (Math.abs(f - want) < Math.abs(FIB[j] - want)) j = idx; });
    offs = FIB.slice(Math.max(0, j - families + 1), j + 1);
  }
  const spacing = Math.sqrt((4 * Math.PI) / N);
  for (const k of offs) {
    for (let i = 0; i + k < N; i++) {
      // Near the poles a fixed offset makes longer chords; let those fade a little.
      const w = Math.min(1, Math.pow((1.7 * spacing) / dist(P[i], P[i + k]), 1.5));
      s.seg(P[i], P[i + k], w);
    }
  }
  return { s, pins: flat(P), offsets: offs };
}

// Rhumb line from pole to pole (constant bearing), sampled evenly in longitude.
function loxodromePts(turns, phase, dir, steps, maxLat = 1.42) {
  const ymax = Math.log(Math.tan(Math.PI / 4 + maxLat / 2)); // Mercator ordinate at maxLat
  const pts = [];
  const lats = [];
  for (let i = 0; i <= steps; i++) {
    const m = -ymax + (2 * ymax * i) / steps;
    const lat = 2 * Math.atan(Math.exp(m)) - Math.PI / 2;
    const lon = phase + dir * Math.PI * turns * (m / ymax);
    pts.push([Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)]);
    lats.push(lat);
  }
  return { pts, lats };
}

// `count` rhumb-line strands evenly spaced in longitude, tapering in alpha towards the poles
// where they converge.
export function loxodromes(count, { turns = 1, dir = 1, steps = 64, phase = 0, into = null, w = 1, plies = 1, delta = 0.018 } = {}) {
  const s = into || new Strings();
  for (let k = 0; k < count; k++) {
    const { pts, lats } = loxodromePts(turns, phase + (k / count) * Math.PI * 2, dir, steps);
    cord(s, pts, (i) => w * (1 - 0.75 * smooth(0.95, 1.42, Math.abs(lats[i]))), { plies, delta });
  }
  return s;
}

// Lay a polyline as a double-ruled cord: `plies` parallel threads offset sideways along the
// surface by +/- delta, so a strand reads bolder than a lone thread (like an engraver's double rule).
function cord(s, pts, w, { plies = 2, delta = 0.02 } = {}) {
  const n = pts.length;
  for (let p = 0; p < plies; p++) {
    const off = plies === 1 ? 0 : (p / (plies - 1) - 0.5) * 2 * delta;
    const out = pts.map((P, i) => {
      const A = pts[Math.max(0, i - 1)], B = pts[Math.min(n - 1, i + 1)];
      const T = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
      const X = [T[1] * P[2] - T[2] * P[1], T[2] * P[0] - T[0] * P[2], T[0] * P[1] - T[1] * P[0]]; // T x P
      const l = Math.hypot(...X) || 1;
      return [P[0] + (X[0] / l) * off, P[1] + (X[1] / l) * off, P[2] + (X[2] / l) * off];
    });
    s.poly(out, w);
  }
}

// Company strand shell: one rhumb-line strand per shareholder (winding one way) and one per
// holding in a subsidiary (counter-winding), each laid as a two-ply cord. Former ties are faint.
export function strandShell(owners, holdings, { turns = 0.6, steps = 72, delta = 0.02, plies = 2 } = {}) {
  const s = new Strings();
  const lay = (list, dir, phase) => list.forEach((e, k) => {
    const { pts, lats } = loxodromePts(turns, phase + (k / list.length) * Math.PI * 2, dir, steps);
    const w = e.ceased ? 0.3 : 1;
    cord(s, pts, (i) => w * (1 - 0.6 * smooth(1.0, 1.42, Math.abs(lats[i]))), { delta, plies });
  });
  lay(owners, 1, 0);
  lay(holdings, -1, Math.PI / Math.max(1, holdings.length));
  if (!owners.length && !holdings.length) { // nothing held either way: a lone equator
    const eq = [];
    for (let i = 0; i <= 72; i++) { const a = (i / 72) * Math.PI * 2; eq.push([Math.cos(a), 0, Math.sin(a)]); }
    s.poly(eq, () => 0.6);
  }
  return s;
}

// Trust basket: `rings` latitude circles of `n` pins, consecutive rings joined by both rulings of
// a hyperboloid (pin j to pins j +/- k on the next ring), and an {cn/ck} star across the polar caps.
export function bandSphere(rings, n, k, [cn, ck]) {
  const s = new Strings();
  const pins = [];
  const ring = (r) => {
    const th = (Math.PI * (r + 1)) / (rings + 1);
    const y = Math.cos(th), rr = Math.sin(th), off = (r % 2) * Math.PI / n;
    return Array.from({ length: n }, (_, j) => {
      const a = off + (j / n) * Math.PI * 2;
      return [Math.cos(a) * rr, y, Math.sin(a) * rr];
    });
  };
  const R = Array.from({ length: rings }, (_, r) => ring(r));
  R.forEach((pts) => pins.push(...pts));
  for (let r = 0; r < rings; r++) { // the hoops themselves, drawn as full circles
    const th = (Math.PI * (r + 1)) / (rings + 1), y = Math.cos(th), rr = Math.sin(th);
    const hoop = [];
    for (let i = 0; i <= 96; i++) { const a = (i / 96) * Math.PI * 2; hoop.push([Math.cos(a) * rr, y, Math.sin(a) * rr]); }
    s.poly(hoop, () => 1);
  }
  for (let r = 0; r + 1 < rings; r++) {
    for (let j = 0; j < n; j++) {
      // With staggered rings, j and j+1 straddle pin j of the ring above; shift by k for the twist.
      const sh = r % 2 ? 1 : 0;
      s.seg(R[r][j], R[r + 1][(j + k - 1 + sh + n) % n], 0.55);
      s.seg(R[r][j], R[r + 1][(j - k + sh + n) % n], 0.55);
    }
  }
  for (const r of [0, rings - 1]) { // star caps on the polar rings
    const th = (Math.PI * (r + 1)) / (rings + 1);
    const y = Math.cos(th), rr = Math.sin(th);
    for (let i = 0; i < cn; i++) {
      const a0 = (i / cn) * Math.PI * 2, a1 = (((i + ck) % cn) / cn) * Math.PI * 2;
      s.seg([Math.cos(a0) * rr, y, Math.sin(a0) * rr], [Math.cos(a1) * rr, y, Math.sin(a1) * rr], 0.8);
    }
  }
  return { s, pins: new Float32Array(pins.flat()) };
}

// Unresolved: a sparse, half-finished weave on a full set of pins. Some threads stop short.
// Returns per-pin weights so unthreaded pins can be drawn fainter.
export function brokenWeave(N, rand) {
  const P = fibPoints(N);
  const s = new Strings();
  const pinW = new Float32Array(N).fill(0.35);
  for (let i = 0; i < N; i++) {
    if (rand() < 0.4) continue;
    const j = Math.floor(rand() * N);
    if (j === i) continue;
    const a = P[i], b = P[j];
    const f = rand() < 0.45 ? 0.25 + rand() * 0.35 : 1;
    pinW[i] = 1; if (f === 1) pinW[j] = 1;
    s.seg(a, [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f], 1, f < 1 ? 0 : 1);
  }
  return { s, pins: flat(P), pinW };
}

// ---------------------------------------------------------------- star polyhedra (unit circumradius)
function edgesAtDistance(V, lo, hi) {
  const s = new Strings();
  for (let i = 0; i < V.length; i++) for (let j = i + 1; j < V.length; j++) {
    const d = dist(V[i], V[j]);
    if (d > lo && d < hi) s.seg(V[i], V[j]);
  }
  return { s, pins: flat(V) };
}
const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };

function icosahedron() {
  const V = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) V.push([0, a, b * PHI], [a, b * PHI, 0], [b * PHI, 0, a]);
  return V.map(norm);
}
function dodecahedron() {
  const V = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    for (const c of [-1, 1]) V.push([a, b, c]);
    V.push([0, a / PHI, b * PHI], [a / PHI, b * PHI, 0], [b * PHI, 0, a / PHI]);
  }
  return V.map(norm);
}

// Each solid also reports its principal symmetry axis (5-fold or 3-fold) so it can be turned to
// show its flat star (pentagram or hexagram) to the viewer.

// Small stellated dodecahedron {5/2,5}: icosahedron vertices joined to their second neighbours,
// which makes twelve interlocking pentagrams.
export function smallStellatedDodecahedron() { return { ...edgesAtDistance(icosahedron(), 1.6, 1.8), axis: norm([0, 1, PHI]) }; }

// Great stellated dodecahedron {5/2,3}: dodecahedron vertices joined at the longest
// non-antipodal distance (12 pentagrams, 30 long chords through the core).
export function greatStellatedDodecahedron() { return { ...edgesAtDistance(dodecahedron(), 1.8, 1.95), axis: norm([1, 0, PHI]) }; } // face normal

// Stella octangula: two interpenetrating tetrahedra, the solid hexagram.
export function stellaOctangula() {
  const V = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) V.push([a, b, c]);
  const s = new Strings();
  const U = V.map(norm);
  for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) {
    const same = Math.sign(V[i][0] * V[i][1] * V[i][2]) === Math.sign(V[j][0] * V[j][1] * V[j][2]);
    if (same) s.seg(U[i], U[j]);
  }
  return { s, pins: flat(U), axis: norm([1, 1, 1]) };
}
