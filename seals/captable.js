// Cap-table globe seal variant (?seal=captable).
//
// A company's core is a globe cut into lunes ("gores"), one per shareholder. Share classes are
// latitude bands (ORD in the north, PREF / B in the south). Because a spherical zone's area is
// proportional to its height (Archimedes' hat-box theorem), band heights are set from each class's
// share of the issued capital, and lune widths from class_percent. So every cell's surface area is
// proportional to that holder's share of the whole company: the globe is a true-area 3D pie.
//
// Everything on the surface is drawn procedurally in one fragment shader (engraved hatching with
// screen-space level of detail, so lines stay engraving-fine at any zoom). Only the lettering
// comes from a small equirectangular canvas. Each band rotates independently so that its largest
// lune faces its owner, and a dotted tether carries every incoming shareholding from the arrow head
// main.js draws onto the owner's own lune.
//
// Non-companies get simpler globes: persons are whole (undivided) stippled spheres, trusts are banded
// by role (trustee / appointor / beneficiary ...), unresolved organisations are terra incognita.

const TAU = Math.PI * 2;
const MAXC = 24;               // max cells (lunes x bands) per globe
const MAXB = 4;                // max latitude bands
const CORE = 0.66;             // globe radius as a fraction of the seal radius R
const CAP = 0.085;              // polar cap angular radius (rad): hides the meridian convergence
const TILT = 23.44 * Math.PI / 180;     // axial tilt: the obliquity of the ecliptic
const MIN_LUNE = 8 * Math.PI / 180;     // tiny stakes are widened to this and marked as exaggerated
const FORMER_LUNE = 5 * Math.PI / 180;  // ghost lune for former holders
const NAME_FONT = (px) => `${px}px "IM Fell English SC", "IM Fell English", Georgia, serif`;
const NUM_FONT = (px) => `italic 600 ${px}px "Cormorant Garamond", Georgia, serif`;
const GLYPH_FONT = (px) => `italic ${px}px "IM Fell English", Georgia, serif`;

// Pattern ids understood by the shader.
const P = { BLANK: 0, PAR: 1, DIAG: 2, ANTI: 3, MER: 4, CROSS: 5, DENSE: 6, STIP: 7, STIP2: 8, WAVE: 9, WAVE2: 10 };
const FAMILY = {
  company: [P.DIAG, P.PAR, P.ANTI, P.MER, P.CROSS, P.DENSE],
  trust: [P.DIAG, P.PAR, P.ANTI, P.MER, P.CROSS, P.DENSE],
  person: [P.STIP, P.STIP2],
  unresolved: [P.WAVE, P.WAVE2],
};
// Wall styles (left/right edge of a cell).
const WALL = { SOLID: 0, DASH: 1, DOT: 2, NONE: 3 };
// Cell colour selectors.
const COL = { HATCH: 0, BLUE: 1, OCHRE: 2 };

const CLASS_ORDER = ['ORD', 'A', 'B', 'C', 'D', 'PREF'];
const TRUST_ROLE_ORDER = ['Trustee', 'Settlor', 'Appointor', 'Protector', 'Guardian', 'Unit Holder', 'Member', 'Beneficiary'];
const TRUST_ROLE_PLURAL = { Trustee: 'TRUSTEE', Settlor: 'SETTLOR', Appointor: 'APPOINTORS', Protector: 'PROTECTOR', Guardian: 'GUARDIAN',
  'Unit Holder': 'UNIT HOLDERS', Member: 'MEMBERS', Beneficiary: 'BENEFICIARIES' };

const fmtPct = (p) => (p == null || isNaN(p) ? '' : `${+(+p).toFixed(2)}%`);
const fmtInt = (x) => Math.round(x).toLocaleString('en-AU');
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const wrap = (a) => ((a % TAU) + TAU) % TAU;
const angDiff = (a, b) => { const d = wrap(a - b); return d > Math.PI ? d - TAU : d; };
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

const STOP = /^(pty|ltd|limited|proprietary|inc|llc|plc|co|company|the|of|and|&)$/i;
const words = (s) => String(s || '').replace(/[(),.]/g, ' ').split(/\s+/).filter((w) => w && !STOP.test(w));
function initials(n) {
  if (n.kind === 'person' && n.raw) return `${(n.raw.first_name || '')[0] || ''}${(n.raw.last_name || '')[0] || ''}`.toUpperCase() || '?';
  return words(n.name).map((w) => w[0]).join('').toUpperCase().slice(0, 4) || '?';
}
function shortName(n) {
  if (n.kind === 'person' && n.raw) return `${(n.raw.first_name || '')[0] || ''}. ${n.raw.last_name || ''}`.toUpperCase();
  return words(n.name).join(' ').toUpperCase();
}
const familyOf = (kind) => FAMILY[kind] || FAMILY.company;

// Spherical zone with area fraction w starting at polar angle c0 (z measured along +Y).
const zoneEnd = (c0, w) => Math.acos(clamp(Math.cos(c0) - 2 * w, -1, 1));
// Polar angle that splits a zone [c0, c1] into two equal areas.
const zoneMid = (c0, c1) => Math.acos((Math.cos(c0) + Math.cos(c1)) / 2);

// ------------------------------------------------------------------ register -> spec
// spec = { kind, bands: [{ c0, c1, weight, ribbon[], cells[], offset }], grat?, glyphs? }
// cell = { band, share, angle, l0, l1, pattern, colour, left, right, former, unknown, partly, exaggerated,
//          edge, owner, name, init, pct, pctNum, joint, others?, members? }

function makeBands(weights) {
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let c0 = 0;
  return weights.map((w, i) => {
    const c1 = i === weights.length - 1 ? Math.PI : zoneEnd(c0, w / total);
    const b = { c0, c1, weight: w / total, cells: [], ribbon: [] };
    c0 = c1;
    return b;
  });
}

// Distribute 2*PI across a band's cells: true proportions, but tiny stakes are widened to MIN_LUNE
// (taken pro rata from the others) and former holders get a fixed ghost sliver.
function assignAngles(cells) {
  const ghosts = cells.filter((c) => c.former);
  const live = cells.filter((c) => !c.former);
  const avail = TAU - ghosts.length * FORMER_LUNE;
  ghosts.forEach((c) => { c.angle = FORMER_LUNE; });
  const sum = live.reduce((a, c) => a + c.share, 0) || 1;
  live.forEach((c) => { c.angle = (c.share / sum) * avail; c.exaggerated = false; });
  if (live.length > 1) {
    for (let it = 0; it < 6; it++) {
      const small = live.filter((c) => c.angle < MIN_LUNE - 1e-9);
      if (!small.length) break;
      const big = live.filter((c) => c.angle >= MIN_LUNE - 1e-9 && !small.includes(c));
      const need = small.reduce((a, c) => a + (MIN_LUNE - c.angle), 0);
      const pool = big.reduce((a, c) => a + c.angle, 0);
      if (pool <= need) break;
      small.forEach((c) => { c.angle = MIN_LUNE; c.exaggerated = true; });
      big.forEach((c) => { c.angle -= need * (c.angle / pool); });
    }
  }
  if (cells.length === 1) cells[0].angle = TAU;
}

// Each owner gets a signature hatch that it keeps on every globe it holds a stake in, so one owner's
// stakes can be followed around the graph. Ranked by how many live holdings the owner has.
const signatures = new WeakMap();
function signatureOf(graph, owner) {
  let sig = signatures.get(graph);
  if (!sig) {
    sig = new Map();
    const count = new Map();
    for (const e of graph.edges) if (e.kind === 'share' && !e.ceased) count.set(e.a, (count.get(e.a) || 0) + 1);
    const byFam = new Map();
    [...count.keys()].sort((a, b) => count.get(b) - count.get(a) || a.key.localeCompare(b.key)).forEach((o) => {
      const fam = familyOf(o.kind);
      const k = byFam.get(fam) || 0;
      byFam.set(fam, k + 1);
      sig.set(o, k);
    });
    signatures.set(graph, sig);
  }
  return sig.get(owner) || 0;
}

function companySpec(n, graph) {
  const inc = n.edges.filter((e) => e.kind === 'share' && e.b === n);
  if (!inc.length) {
    const bands = makeBands([1]);
    const cell = { band: 0, share: 1, pattern: P.BLANK, colour: COL.HATCH, unknown: true, name: '?', init: '?', pct: '' };
    bands[0].cells.push(cell);
    bands[0].ribbon.push({ text: 'NO SHAREHOLDERS OF RECORD', at: 'equator' });
    return { kind: 'empty', bands, glyphs: '?' };
  }
  const classes = new Map();
  for (const e of inc) {
    const hs = e.raw.holdings && e.raw.holdings.length ? e.raw.holdings : [{ share_class: 'ORD', class_percent: e.percent }];
    hs.forEach((h) => {
      const cls = String(h.share_class || 'ORD').toUpperCase();
      if (!classes.has(cls)) classes.set(cls, { cls, items: [], est: [] });
      const C = classes.get(cls);
      let pct = Number(h.class_percent);
      if (!isFinite(pct)) pct = hs.length === 1 ? e.percent : 0;
      const amount = Number(h.amount) || 0;
      C.items.push({ edge: e, owner: e.a, pct: e.ceased ? 0 : pct, amount, former: e.ceased, joint: !!e.raw.joint_holding,
        nb: e.raw.beneficially_owned === false, partly: h.fully_paid === false, single: hs.length === 1 });
      if (!e.ceased && amount > 0 && pct > 0) C.est.push(amount / (pct / 100));
    });
  }
  const list = [...classes.values()].sort((a, b) => {
    const ia = CLASS_ORDER.indexOf(a.cls), ib = CLASS_ORDER.indexOf(b.cls);
    return (ia < 0 ? 4.5 : ia) - (ib < 0 ? 4.5 : ib) || a.cls.localeCompare(b.cls);
  });
  list.forEach((C) => { C.total = C.est.length ? median(C.est) : null; });
  // Band weights: issued shares per class when amounts are known; otherwise the summed overall
  // percentages of the class's holders; otherwise equal.
  let weights;
  if (list.every((C) => C.total)) weights = list.map((C) => C.total);
  else {
    weights = list.map((C) => C.items.filter((i) => !i.former && i.single).reduce((a, i) => a + i.edge.percent, 0));
    if (weights.some((w) => !(w > 0))) weights = list.map(() => 1);
  }
  const wsum = weights.reduce((a, b) => a + b, 0);
  weights = weights.map((w) => Math.max(w / wsum, 0.08)); // keep thin classes visible
  const grand = list.every((C) => C.total) ? list.reduce((a, C) => a + C.total, 0) : null;
  const bands = makeBands(weights.slice(0, MAXB));

  list.slice(0, MAXB).forEach((C, b) => {
    const band = bands[b];
    // Joint holders of the same parcel (same class, same amount) become one bound group.
    const jointKey = (i) => (i.joint && !i.former ? `${C.cls}|${i.amount || i.pct}` : null);
    const live = C.items.filter((i) => !i.former).sort((x, y) => y.pct - x.pct);
    for (const i of [...live, ...C.items.filter((x) => x.former)]) {
      const overall = i.single ? i.edge.percent : grand && i.amount ? (i.amount / grand) * 100 : null;
      band.cells.push({ band: b, share: i.pct, edge: i.edge, owner: i.owner, former: i.former, partly: i.partly, nb: i.nb,
        joint: jointKey(i), name: shortName(i.owner), init: initials(i.owner),
        pct: i.former ? 'former' : fmtPct(overall ?? i.pct), pctNum: i.former ? 0 : overall ?? i.pct });
    }
    const sum = live.reduce((a, i) => a + i.pct, 0);
    if (sum < 99.5) band.cells.push({ band: b, share: 100 - sum, unknown: true, name: 'UNRECORDED', init: '?', pct: fmtPct(100 - sum) });
    const ribbon = [C.cls];
    if (C.total) ribbon.push(`${fmtInt(C.total)} SHARES`);
    if (list.length > 1) ribbon.push(`${fmtPct(band.weight * 100)} OF ISSUED`);
    if (C.items.some((i) => !i.former && i.partly)) ribbon.push('PARTLY PAID');
    band.ribbon.push({ text: ribbon.join(' · ') });
  });

  // Pattern family by owner kind (lines: companies, stipple: persons, waves: unresolved); the owner's
  // signature picks the member, bumped along if a neighbour in the same band already uses it.
  for (const band of bands) {
    const used = new Set();
    band.cells.filter((c) => !c.former && !c.unknown).sort((a, b) => b.share - a.share).forEach((c) => {
      const fam = familyOf(c.owner.kind);
      let k = signatureOf(graph, c.owner);
      for (let i = 0; i < fam.length && used.has(fam[k % fam.length]); i++) k++;
      c.pattern = fam[k % fam.length];
      used.add(c.pattern);
      c.colour = c.nb ? COL.BLUE : COL.HATCH;
    });
    band.cells.forEach((c) => { if (c.former || c.unknown) { c.pattern = P.BLANK; c.colour = COL.HATCH; } });
  }
  return { kind: 'company', bands };
}

function trustSpec(n) {
  const inc = n.edges.filter((e) => e.kind === 'trust' && e.b === n);
  const groups = new Map();
  for (const e of inc) {
    const role = e.trustee ? 'Trustee' : (e.raw.role || 'Party');
    if (!groups.has(role)) groups.set(role, []);
    groups.get(role).push(e);
  }
  const roles = [...groups.keys()].sort((a, b) => {
    const ia = TRUST_ROLE_ORDER.indexOf(a), ib = TRUST_ROLE_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  }).slice(0, MAXB);
  if (!roles.length) {
    const bands = makeBands([1]);
    bands[0].cells.push({ band: 0, share: 1, pattern: P.BLANK, colour: COL.HATCH, unknown: true, name: '?', init: '?', pct: '' });
    bands[0].ribbon.push({ text: 'NO PARTIES OF RECORD', at: 'equator' });
    return { kind: 'trust', bands };
  }
  // Role zones: area grows gently with the number of parties.
  const bands = makeBands(roles.map((r) => Math.sqrt(groups.get(r).length)));
  roles.forEach((role, b) => {
    const band = bands[b];
    const trustee = role === 'Trustee';
    groups.get(role).forEach((e, k) => {
      band.cells.push({ band: b, share: 1, edge: e, owner: e.a, former: e.ceased, name: shortName(e.a), init: initials(e.a),
        pct: e.ceased ? 'former' : '',
        pattern: e.ceased ? P.BLANK : trustee ? P.PAR : role === 'Beneficiary' || role === 'Member' || role === 'Unit Holder' ? (k % 2 ? P.STIP2 : P.STIP) : (k % 2 ? P.ANTI : P.DIAG),
        colour: trustee ? COL.BLUE : COL.OCHRE, dotted: true });
    });
    band.ribbon.push({ text: TRUST_ROLE_PLURAL[role] || role.toUpperCase() });
  });
  return { kind: 'trust', bands };
}

function personSpec(n) {
  const ubo = n.ubo;
  const bands = makeBands(ubo ? [1, 1] : [1]);
  bands.forEach((b, i) => b.cells.push({ band: i, share: 1, pattern: P.STIP, colour: COL.HATCH }));
  if (ubo) {
    bands[0].ribbon.push({ text: `U.B.O.${n.raw && n.raw.ubo_ownership != null ? ` · ${fmtPct(n.raw.ubo_ownership)}` : ''}` });
    bands[1].ribbon.push({ text: 'ULTIMATE BENEFICIAL OWNER' });
  }
  return { kind: 'person', bands, grat: [5, Math.PI / 6, 1, 0.55], glyphs: initials(n) };
}

function unresolvedSpec(n) {
  const bands = makeBands([1]);
  bands[0].cells.push({ band: 0, share: 1, pattern: P.WAVE, colour: COL.HATCH });
  bands[0].ribbon.push({ text: 'REGISTER UNKNOWN', at: 'equator' });
  return { kind: 'unresolved', bands, grat: [6, Math.PI / 6, 2, 0.6], glyphs: '?' };
}

// The shader holds MAXC cells. Past that, former ghosts go first, then the smallest live holders of the
// busiest band are folded into one "others" lune (which keeps all of their tethers).
function capCells(spec) {
  const total = () => spec.bands.reduce((a, b) => a + b.cells.length, 0);
  for (const b of spec.bands) if (total() > MAXC) b.cells = b.cells.filter((c) => !c.former);
  while (total() > MAXC) {
    const b = spec.bands.reduce((m, x) => (x.cells.length > m.cells.length ? x : m));
    const live = b.cells.filter((c) => !c.unknown && !c.others).sort((x, y) => x.share - y.share);
    if (live.length < 2) break;
    let o = b.cells.find((c) => c.others);
    if (!o) {
      o = { band: live[0].band, share: 0, others: true, members: [], pattern: P.STIP2, colour: COL.HATCH, pctNum: 0 };
      b.cells.push(o);
    }
    const c = live[0];
    b.cells.splice(b.cells.indexOf(c), 1);
    o.share += c.share;
    o.pctNum += c.pctNum || 0;
    o.members.push(c);
    o.name = `${o.members.length} OTHERS`;
    o.init = `+${o.members.length}`;
    o.pct = o.pctNum ? fmtPct(o.pctNum) : '';
  }
}

// Order cells around each band, assign l0/l1, and set wall styles so both sides of a wall agree.
function layoutBand(band, order) {
  let l = 0;
  for (const c of order) { c.l0 = l; l += c.angle; c.l1 = l; }
  if (order.length) order[order.length - 1].l1 = TAU;
  band.cells = order;
  const N = order.length;
  order.forEach((c, i) => {
    if (N === 1) { c.left = c.right = WALL.NONE; return; }
    const prev = order[(i - 1 + N) % N], next = order[(i + 1) % N];
    const style = (a, b) => (a.joint && a.joint === b.joint ? WALL.DOT
      : a.former || b.former || a.unknown || b.unknown ? WALL.DASH
        : a.dotted || b.dotted ? WALL.DOT : WALL.SOLID);
    c.left = style(prev, c);
    c.right = style(c, next);
  });
}

// ------------------------------------------------------------------ shader
const VERT = /* glsl */`
varying vec3 vObj;
varying vec3 vViewPos;
varying vec3 vViewN;
#include <fog_pars_vertex>
void main() {
  vObj = position;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mvPosition.xyz;
  vViewN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */`
#define PI 3.141592653589793
#define TAU 6.283185307179586
#define MAXC ${MAXC}
#define MAXB ${MAXB}
uniform vec3 uFill, uInk, uHatch, uSoft, uBlue, uOchre;
uniform float uAlpha, uR, uS0, uAstral, uHatchAlpha, uCap;
uniform vec4 uBands[MAXB];
uniform int uNB;
uniform vec4 uCellA[MAXC];   // l0, l1, pattern, flags
uniform vec4 uCellB[MAXC];   // band, colour, -, -
uniform int uNC;
uniform vec4 uGrat;          // meridians, parallel step, style (0 none, 1 solid, 2 dashed), strength
uniform sampler2D uLabels;
uniform vec3 uLight;
varying vec3 vObj;
varying vec3 vViewPos;
varying vec3 vViewN;
#include <fog_pars_fragment>

// Periodic AA line: f in periods, fw = periods per pixel, w = width in px. Fades to mean tone when too fine.
float hl(float f, float fw, float w) {
  fw = max(fw, 1e-6);
  float d = abs(fract(f + 0.5) - 0.5) / fw;
  float c = clamp(w * 0.5 - d + 0.5, 0.0, 1.0);
  return mix(c, clamp(w * fw, 0.0, 1.0), smoothstep(0.2, 0.5, fw));
}
// Single AA line at distance d px.
float el(float d, float w) { return clamp(w * 0.5 - abs(d) + 0.5, 0.0, 1.0); }

vec2 gX, gY;   // screen derivatives (x,y) of the equatorial lon coordinate X and meridional coordinate Y (world units)
float XX, YY;  // the coordinates themselves
float fwc(float a, float b) { return abs(a * gX.x + b * gY.x) + abs(a * gX.y + b * gY.y); }

// Lines of constant v = a*X + b*Y, spaced k*S0 * 2^level. The level comes from this pattern's own screen
// derivative, so converging lines (near the poles) drop out two-to-one instead of greying over.
float lod(float v, float fw, float w, float k) {
  float s0 = uS0 * k;
  float lv = clamp(log2(4.0 * fw / s0), -3.0, 12.0);
  float i0 = floor(lv), t = lv - i0;
  float S1 = s0 * exp2(i0), S2 = 2.0 * S1;
  return max(hl(v / S2, fw / S2, w), hl(v / S1, fw / S1, w) * (1.0 - t));
}
float lodAB(float a, float b, float w, float k) { return lod(a * XX + b * YY, fwc(a, b), w, k); }

float stip(float L, float Y, float S, float sinT, float pw, float rad) {
  float row = floor(Y / S);
  float tr = (row + 0.5) * S / uR;
  float cnt = max(1.0, floor(TAU * uR * sin(tr) / S));
  float u = L / TAU * cnt + mod(row, 2.0) * 0.5;
  float du = (fract(u) - 0.5) * TAU * uR * sinT / cnt;
  float dv = (fract(Y / S) - 0.5) * S;
  float d = length(vec2(du, dv)) / pw;
  float rp = rad * S / pw;
  float c = clamp(rp - d + 0.5, 0.0, 1.0);
  return mix(c, clamp(3.14159 * rad * rad, 0.0, 1.0), smoothstep(0.6, 0.25, rp));
}

// Line patterns (LOD handled per pattern).
float linePat(int p) {
  if (p == 1) return lodAB(0.0, 1.0, 1.05, 1.0);
  if (p == 2) return lodAB(1.0, 1.0, 1.05, 1.0);
  if (p == 3) return lodAB(1.0, -1.0, 1.05, 1.0);
  if (p == 4) return lodAB(1.0, 0.0, 1.0, 1.0);
  if (p == 5) return max(lodAB(1.0, 1.0, 1.0, 1.0), lodAB(1.0, -1.0, 1.0, 1.0));
  if (p == 6) return lodAB(0.0, 1.0, 1.2, 0.5);
  if (p == 9 || p == 10) {
    float k = p == 9 ? 1.0 : 0.6;
    float a = 0.3 * uS0 * k, lam = 0.85 * uS0 * k;
    float v = YY + a * sin(XX / lam);
    float fw = fwc(0.0, 1.0) + fwc(1.0, 0.0) * a / lam;
    return lod(v, fw, 1.0, k);
  }
  return 0.0;
}
// Stipple patterns (LOD from pixel footprint).
float stipPat(int p, float L, float S, float sinT, float pw) {
  if (p == 7) return stip(L, YY, S * 0.7, sinT, pw, 0.2);
  if (p == 8) return stip(L, YY, S * 0.5, sinT, pw, 0.27);
  return 0.0;
}

void main() {
  vec3 n = normalize(vObj);
  vec3 dnx = dFdx(n), dny = dFdy(n);
  float pw = uR * max(length(dnx), length(dny));          // world units per pixel
  float s2 = max(n.x * n.x + n.z * n.z, 1e-8);
  float sinT = sqrt(s2);
  float theta = acos(clamp(n.y, -1.0, 1.0));
  float lon = atan(n.z, n.x);
  vec2 dLon = vec2(n.x * dnx.z - n.z * dnx.x, n.x * dny.z - n.z * dny.x) / s2;
  vec2 dTh = -vec2(dnx.y, dny.y) / sinT;
  float fwL = abs(dLon.x) + abs(dLon.y);
  float fwT = abs(dTh.x) + abs(dTh.y);
  gX = dLon * uR; gY = dTh * uR;

  // band
  int b = 0;
  for (int i = 0; i < MAXB; i++) { if (i >= uNB) break; if (theta >= uBands[i].x) b = i; }
  vec4 B = uBands[0];
  for (int i = 0; i < MAXB; i++) { if (i == b) B = uBands[i]; }
  float L = mod(lon - B.z, TAU);

  // cell
  vec4 CA = vec4(0.0, TAU, 0.0, 15.0), CB = vec4(0.0);
  for (int i = 0; i < MAXC; i++) {
    if (i >= uNC) break;
    if (int(uCellB[i].x + 0.5) == b && L >= uCellA[i].x && L < uCellA[i].y) { CA = uCellA[i]; CB = uCellB[i]; }
  }
  float flags = CA.w;
  float wl = mod(flags, 4.0), wr = mod(floor(flags / 4.0), 4.0);
  float former = mod(floor(flags / 16.0), 2.0);
  float unknown = mod(floor(flags / 32.0), 2.0);
  float partly = mod(floor(flags / 64.0), 2.0);
  float exagg = mod(floor(flags / 128.0), 2.0);

  float X = (L - CA.x) * uR;
  float Y = theta * uR;
  XX = X; YY = Y;
  float inCap = step(theta, uCap) + step(PI - uCap, theta);

  // ---- hatching, with level of detail so line spacing stays ~4-9 px at any zoom
  float lv = clamp(log2(4.0 * pw / uS0), -3.0, 9.0);
  float i0 = floor(lv), t = lv - i0;
  float S1 = uS0 * exp2(i0), S2 = S1 * 2.0;
  int p = int(CA.z + 0.5);
  float hatch;
  if (p == 7 || p == 8) hatch = mix(stipPat(p, L, S1, sinT, pw), stipPat(p, L, S2, sinT, pw), t);
  else hatch = linePat(p);
  if (partly > 0.5) hatch *= smoothstep(0.2, 0.3, fract((X - Y * 0.5) / (S2 * 2.4)));
  hatch *= (1.0 - inCap);

  // ---- light: engraver's shadow (cross-hatch crescent) on parchment, dimming on astral
  vec3 N = normalize(vViewN);
  vec3 V = normalize(-vViewPos);
  float ndl = dot(N, uLight);
  float ndv = max(dot(N, V), 0.0);
  float sh = smoothstep(0.05, -0.7, ndl);
  vec3 sd = normalize(vec3(0.62, -0.78, 0.1));
  float sf = dot(n, sd) * uR;
  float sfw = (abs(dot(dnx, sd)) + abs(dot(dny, sd))) * uR;
  float shadeLines = max(hl(sf / S2, sfw / S2, 1.0), hl(sf / S1, sfw / S1, 1.0) * (1.0 - t));
  float lightK = mix(1.0 - 0.45 * smoothstep(0.55, 0.95, ndl), 0.35 + 0.65 * smoothstep(-0.7, 0.7, ndl), uAstral);

  // ---- walls between lunes
  float wallInk = 0.0;
  float dl = (L - CA.x) / max(fwL, 1e-6), dr = (CA.y - L) / max(fwL, 1e-6);
  float dash = step(0.45, fract(Y / (uS0 * 2.2)));
  float dots = hl(Y / (uS0 * 1.1), fwT * uR / (uS0 * 1.1), 2.2);
  float wallW = 1.6;
  float ws = wl < 0.5 ? 1.0 : wl < 1.5 ? dash * 0.8 : wl < 2.5 ? dots : 0.0;
  wallInk = max(wallInk, el(dl, wallW) * ws);
  ws = wr < 0.5 ? 1.0 : wr < 1.5 ? dash * 0.8 : wr < 2.5 ? dots : 0.0;
  wallInk = max(wallInk, el(dr, wallW) * ws);
  // Tiny stakes drawn wider than true get inset hairlines inside their walls (a "magnified" sliver).
  if (exagg > 0.5) { float ins = min(4.5, (dl + dr) * 0.2); wallInk = max(wallInk, max(el(dl - ins, 0.85), el(dr - ins, 0.85)) * 0.85); }
  wallInk *= (1.0 - inCap);

  // ---- band boundaries: thick rule with a hairline inside each band (an engraved "tropic")
  float gapT = uS0 * 1.15 / uR;
  float rule = 0.0;
  if (B.x > 0.001) { rule = max(rule, el((theta - B.x) / fwT, 1.7)); rule = max(rule, el((theta - B.x - gapT) / fwT, 0.9)); }
  if (B.y < PI - 0.001) { rule = max(rule, el((B.y - theta) / fwT, 1.7)); rule = max(rule, el((B.y - theta - gapT) / fwT, 0.9)); }
  float bandClear = smoothstep(gapT * 0.9, gapT * 1.6, min(theta - B.x + (B.x < 0.001 ? 9.0 : 0.0), B.y - theta + (B.y > PI - 0.001 ? 9.0 : 0.0)));
  hatch *= bandClear;
  wallInk *= mix(0.0, 1.0, step(gapT * 0.5, min(theta - B.x + (B.x < 0.001 ? 9.0 : 0.0), B.y - theta + (B.y > PI - 0.001 ? 9.0 : 0.0))));

  // ---- graticule (persons / unresolved)
  float grat = 0.0;
  if (uGrat.z > 0.5) {
    float gm = hl(L / (TAU / uGrat.x), fwL / (TAU / uGrat.x), 1.0);
    float gp = hl(theta / uGrat.y, fwT / uGrat.y, 1.0);
    grat = max(gm, gp) * uGrat.w;
    if (uGrat.z > 1.5) grat *= step(0.5, fract((gm > gp ? Y : X * sinT) / (uS0 * 1.6)));
    grat *= (1.0 - inCap);
  }

  // ---- polar caps: ring and pin
  float capInk = el((theta - uCap) / fwT, 1.3) + el((PI - uCap - theta) / fwT, 1.3);
  capInk = max(capInk, clamp((uCap * 0.3 - min(theta, PI - theta)) / fwT + 0.5, 0.0, 1.0));

  // ---- outline
  float fwv = fwidth(ndv);
  float rim = clamp(2.1 - ndv / max(fwv, 1e-6), 0.0, 1.0);

  // ---- lettering
  // u runs against longitude so lettering reads correctly from outside the globe
  vec2 uv = vec2(1.0 - L / TAU, 1.0 - theta / PI);
  vec4 tx = textureGrad(uLabels, uv, vec2(-dLon.x / TAU, -dTh.x / PI), vec2(-dLon.y / TAU, -dTh.y / PI));
  float knock = clamp(tx.b * 1.4, 0.0, 1.0);

  // ---- compose
  vec3 hatchCol = CB.y < 0.5 ? uHatch : CB.y < 1.5 ? uBlue : uOchre;
  vec3 fill = uFill;
  fill = mix(fill, uSoft, sh * 0.10 * (1.0 - uAstral));
  vec3 col = fill;
  float hc = hatch * uHatchAlpha * lightK * (1.0 - former * 0.7) * (1.0 - knock) * (CB.y > 0.5 ? 0.78 : 1.0);
  col = mix(col, hatchCol, hc);
  float shc = shadeLines * sh * 0.55 * (1.0 - uAstral) * (1.0 - knock) * (1.0 - inCap);
  col = mix(col, uSoft, shc);
  col = mix(col, uSoft, grat * (1.0 - knock));
  float lines = max(max(wallInk * (1.0 - former * 0.45), rule), capInk) * mix(1.0, 0.85, uAstral);
  col = mix(col, uInk, clamp(lines, 0.0, 1.0) * (1.0 - knock * 0.85));
  col = mix(col, uSoft, tx.g);
  col = mix(col, uInk, tx.r);
  col = mix(col, uInk, rim);
  col += uInk * pow(1.0 - ndv, 3.0) * 0.18 * uAstral;
  gl_FragColor = vec4(col, uAlpha);
  #include <fog_fragment>
}`;

// ------------------------------------------------------------------ build
export function build(n, api) {
  const { THREE } = api;
  const R = api.R;
  const r = R * CORE;
  const role = api.role;

  const spec = n.kind === 'company' ? companySpec(n, api.graph) : n.kind === 'trust' ? trustSpec(n) : n.kind === 'person' ? personSpec(n) : unresolvedSpec(n);
  capCells(spec);
  for (const band of spec.bands) { assignAngles(band.cells); layoutBand(band, band.cells); }
  const allCells = () => spec.bands.flatMap((b) => b.cells);

  const object = new THREE.Group();
  const qTilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -TILT);
  const qTiltInv = qTilt.clone().invert();
  object.userData.captable = spec; // inspection handle (n.seal.core.group.children[0].userData)

  // ---- lettering canvas (equirectangular: x = band-local longitude, y = polar angle)
  const W = n.isTarget ? 2048 : n.kind === 'company' || n.kind === 'trust' ? 1024 : 512;
  const H = W / 2;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = Math.min(8, api.renderer.capabilities.getMaxAnisotropy());
  const kpx = H / (Math.PI * r); // texels per world unit along a meridian

  function text(str, L, th, px, font, channel, halo = true) {
    const sx = 1 / Math.max(Math.sin(th), 0.25);
    ctx.font = font(px);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const dx of [-W, 0, W]) {
      ctx.save();
      ctx.translate((1 - L / TAU) * W + dx, (th / Math.PI) * H);
      ctx.scale(sx, 1);
      if (halo) { ctx.lineJoin = 'round'; ctx.lineWidth = px * 0.34; ctx.strokeStyle = '#0000ff'; ctx.strokeText(str, 0, 0); }
      ctx.fillStyle = channel;
      ctx.fillText(str, 0, 0);
      ctx.restore();
    }
  }
  const measure = (str, px, font) => { ctx.font = font(px); return ctx.measureText(str).width; };
  const INK = '#ff0000', SOFT = '#00ff00', FAINT = '#008000';

  // Ribbon text repeated around a latitude circle.
  function ribbon(str, th, px, channel, maxReps = 3) {
    const unit = `${str}   ✦   `;
    const sx = 1 / Math.max(Math.sin(th), 0.25);
    const w = measure(unit, px, NAME_FONT) * sx;
    const reps = clamp(Math.floor(W / w), 1, maxReps);
    for (let k = 0; k < reps; k++) text(str, ((k + 0.5) / reps) * TAU, th, px, NAME_FONT, channel);
  }

  const labelH = r * (n.kind === 'person' ? 0.2 : 0.13);  // world units
  const ribbonH = r * 0.062;
  const gapW = r / 26 * 1.15;

  function bandLabelTheta(band) {
    if (band.c0 < 0.01 && band.c1 > Math.PI - 0.01) return 1.18;
    let th = zoneMid(band.c0, band.c1);
    if (band.c0 < 0.01) th = Math.min(th, 1.2);
    const pad = (gapW + ribbonH * 1.6 + labelH * 1.2) / r;
    return clamp(th, band.c0 + Math.max(CAP + labelH * 1.2 / r, pad * (band.c0 > 0.01 ? 1 : 0)), band.c1 - (band.c1 < Math.PI - 0.01 ? pad : CAP + labelH / r));
  }

  function drawLabels() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    const namePx = labelH * kpx;
    for (const band of spec.bands) {
      const th = bandLabelTheta(band);
      const sinT = Math.max(Math.sin(th), 0.25);
      const twoLine = (band.c1 - band.c0) * r > labelH * 3.2;
      // Ribbons along the band boundaries (or the equator for single-band globes).
      const rpx = ribbonH * kpx;
      for (const rb of band.ribbon) {
        let rt;
        if (rb.at === 'equator' || spec.bands.length === 1) rt = n.kind === 'person' ? Math.PI / 2 + (gapW + ribbonH) / r : 2.05;
        else if (band.c1 < Math.PI - 0.01) rt = band.c1 - (gapW * 1.6 + ribbonH * 0.7) / r;
        else rt = band.c0 + (gapW * 1.6 + ribbonH * 0.7) / r;
        ribbon(rb.text, rt, rpx, SOFT, spec.kind === 'trust' ? 2 : 3);
      }
      if (spec.kind === 'person' || spec.kind === 'unresolved' || spec.kind === 'empty') continue;
      for (const c of band.cells) {
        // Wide lunes repeat their label so it can be read from any side.
        const span = c.l1 - c.l0;
        const reps = span > TAU * 0.9 ? 3 : span > 3.4 ? 2 : 1;
        const avail = ((span / reps) / TAU) * W * 0.84; // texels at the label latitude (after stretch)
        const fits = (s, px, font) => measure(s, px, font) / sinT <= avail;
        const color = c.former ? FAINT : INK;
        let name = null, px = namePx;
        if ((c.l1 - c.l0) > 0.9 && fits(c.name, px, NAME_FONT)) name = c.name;
        else if (fits(c.init, px, NAME_FONT)) name = c.init;
        else {
          const k = avail / (measure(c.init, px, NAME_FONT) / sinT);
          if (k > 0.55) { name = c.init; px *= k; }
        }
        const pct = c.pct;
        const pctPx = px * 0.95;
        for (let k = 0; k < reps; k++) {
          const lc = c.l0 + ((k + 0.5) / reps) * span;
          if (twoLine) {
            if (name) text(name, lc, th - (labelH * 0.5) / r, px, NAME_FONT, color);
            if (pct && fits(pct, pctPx, NUM_FONT)) text(pct, lc, th + (labelH * 0.62) / r, pctPx, NUM_FONT, c.former ? FAINT : INK);
          } else if (name) {
            const both = pct ? `${name} ${pct}` : name;
            text(fits(both, px, NAME_FONT) ? both : name, lc, th, px, NAME_FONT, color);
          }
        }
      }
      // Joint holdings: a small "jt" knot over the shared (dotted) seam.
      const cells = band.cells;
      cells.forEach((c, i) => {
        const nx = cells[(i + 1) % cells.length];
        if (cells.length > 1 && c.joint && c.joint === nx.joint) {
          const seam = c.l1 % TAU;
          const tj = th + (labelH * (twoLine ? 1.75 : 1.1)) / r;
          text('jt', seam, tj, namePx * 0.8, NUM_FONT, INK);
        }
      });
    }
    // Glyphs for persons / unresolved / empty registers, three times around.
    if (spec.glyphs) {
      const big = spec.kind === 'person' ? r * 0.3 : r * 0.42;
      for (let k = 0; k < 3; k++) {
        const L = ((k + 0.5) / 3) * TAU;
        if (spec.kind === 'person') text(spec.glyphs, L, 1.12, big * kpx, NAME_FONT, INK);
        else text(spec.glyphs, L, 1.28, big * kpx, GLYPH_FONT, INK);
      }
    }
    tex.needsUpdate = true;
  }

  // ---- material
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uFill: { value: new THREE.Color() }, uInk: { value: new THREE.Color() }, uHatch: { value: new THREE.Color() },
    uSoft: { value: new THREE.Color() }, uBlue: { value: new THREE.Color() }, uOchre: { value: new THREE.Color() },
    uAlpha: { value: 1 }, uR: { value: r }, uS0: { value: r / 26 }, uAstral: { value: 0 }, uHatchAlpha: { value: 0.9 }, uCap: { value: CAP },
    uBands: { value: Array.from({ length: MAXB }, () => new THREE.Vector4()) }, uNB: { value: 1 },
    uCellA: { value: Array.from({ length: MAXC }, () => new THREE.Vector4()) },
    uCellB: { value: Array.from({ length: MAXC }, () => new THREE.Vector4()) }, uNC: { value: 0 },
    uGrat: { value: new THREE.Vector4(...(spec.grat || [0, 0, 0, 0])) },
    uLabels: { value: null },
    uLight: { value: new THREE.Vector3(-0.5, 0.62, 0.6).normalize() },
  }]);
  uniforms.uLabels.value = tex;
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: true, fog: true });
  const seg = n.isTarget ? [128, 96] : [72, 48];
  const globe = new THREE.Mesh(new THREE.SphereGeometry(1, seg[0], seg[1]), mat);
  globe.scale.setScalar(r);
  globe.renderOrder = -1; // draw before other transparent things so it occludes what lies behind it
  // Globes lean like a terrestrial globe on its stand (north pole tipped away from the home camera by
  // the obliquity of the ecliptic), which shows the southern share classes as well as the northern.
  const tiltGroup = new THREE.Group();
  tiltGroup.quaternion.copy(qTilt);
  tiltGroup.add(globe);
  object.add(tiltGroup);

  function pushCells() {
    const cells = allCells().slice(0, MAXC);
    uniforms.uNC.value = cells.length;
    cells.forEach((c, i) => {
      const flags = c.left + c.right * 4 + (c.former ? 16 : 0) + (c.unknown ? 32 : 0) + (c.partly ? 64 : 0) + (c.exaggerated ? 128 : 0);
      uniforms.uCellA.value[i].set(c.l0, c.l1 + (c.l1 >= TAU - 1e-6 ? 1e-3 : 0), c.pattern || 0, flags);
      uniforms.uCellB.value[i].set(c.band, c.colour || 0, 0, 0);
    });
    uniforms.uNB.value = spec.bands.length;
    spec.bands.forEach((b, i) => uniforms.uBands.value[i].set(b.c0, b.c1, b.offset || 0, 0));
  }

  // ---- polar axis with small finials
  const lineMat = (base, roleName = role) => api.reg(api.themedMat(roleName, new THREE.LineBasicMaterial({ transparent: true, depthWrite: false })), base);
  {
    const a = r * 1.13, f = r * 0.05;
    const pts = [0, -a, 0, 0, a, 0, -f, a, 0, f, a, 0, -f, -a, 0, f, -a, 0];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    tiltGroup.add(new THREE.LineSegments(g, lineMat(0.75)));
  }

  // ---- tethers: carry each incoming relationship from main.js's arrow head onto the owner's cell
  const edgeRole = (e) => (e.a.flagged || e.b.flagged ? 'red' : e.kind === 'trust' ? (e.trustee ? 'blue' : 'ochre') : 'ink');
  const dotTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 13, 0, TAU); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 5; g.beginPath(); g.arc(32, 32, 26, 0, TAU); g.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const TSEG = 40;
  const tethers = [];
  for (const band of spec.bands) {
    for (const c of band.cells) for (const edge of c.others ? c.members.map((m) => m.edge) : [c.edge]) {
      if (!edge || c.former) continue;
      const prior = tethers.find((t) => t.edge === edge);
      if (prior) { // multi-class holder: tether to its largest cell only
        if (c.angle * (band.c1 - band.c0) > prior.cell.angle * (spec.bands[prior.cell.band].c1 - spec.bands[prior.cell.band].c0)) prior.cell = c;
        continue;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((TSEG + 1) * 3), 3));
      const m = api.reg(api.themedMat(edgeRole(edge), new THREE.LineDashedMaterial({ dashSize: 0.08 + r * 0.014, gapSize: 0.06 + r * 0.01, transparent: true, depthWrite: false })), 1);
      const line = new THREE.Line(g, m);
      line.frustumCulled = false;
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
      const pm = api.reg(api.themedMat(edgeRole(edge), new THREE.PointsMaterial({ map: dotTex, size: 0.28 + r * 0.05, transparent: true, depthWrite: false, alphaTest: 0.05 })), 0.95);
      const pin = new THREE.Points(pg, pm);
      pin.frustumCulled = false;
      object.add(line, pin);
      tethers.push({ edge, cell: c, line, pin });
    }
  }

  const _t = new THREE.Vector3(), _tan = new THREE.Vector3(), _a = new THREE.Vector3(), _p = new THREE.Vector3(), _d = new THREE.Vector3();
  const sph = (th, lon, out) => out.set(Math.sin(th) * Math.cos(lon), Math.cos(th), Math.sin(th) * Math.sin(lon));
  function tipLocal(e, out) {
    const v = e.vis;
    if (!v || !v.curve) return null;
    v.curve.getPoint(v.t1, out);
    v.curve.getTangent(v.t1, _tan);
    out.addScaledVector(_tan, 0.55).sub(n.pos);
    const sc = object.parent ? object.parent.scale.x || 1 : 1;
    return out.divideScalar(sc);
  }
  // World azimuth (atan2(z, x)) of where an edge arrives.
  function arrivalAz(e) {
    if (!tipLocal(e, _t)) return null;
    _t.applyQuaternion(qTiltInv);
    if (Math.hypot(_t.x, _t.z) < 1e-4) return null;
    return Math.atan2(_t.z, _t.x);
  }

  // ---- orientation: order cells by where their owners are, then turn each band so its largest
  // holder's lune faces that holder.
  let sig = '';
  function reorder(force) {
    let changed = false;
    for (const band of spec.bands) {
      const cells = band.cells;
      if (!cells.some((c) => c.edge)) continue;
      const az = new Map();
      for (const c of cells) if (c.edge) { const a = arrivalAz(c.edge); if (a != null) az.set(c, a); }
      if (!az.size) continue;
      const lead = cells.filter((c) => c.edge && !c.former && az.has(c)).sort((a, b) => b.angle - a.angle)[0];
      // Joint groups share one (circular-mean) azimuth so they stay adjacent.
      const key = (c) => c.joint || c;
      const groupAz = new Map();
      for (const c of cells) {
        if (!az.has(c)) continue;
        const k = key(c);
        const g = groupAz.get(k) || [0, 0];
        g[0] += Math.cos(az.get(c)); g[1] += Math.sin(az.get(c));
        groupAz.set(k, g);
      }
      const leadAz = lead ? az.get(lead) : 0;
      const sortAz = (c) => {
        const g = groupAz.get(key(c));
        const a = g ? Math.atan2(g[1], g[0]) : leadAz + Math.PI; // unknown remainder sits opposite the lead
        return wrap(a - leadAz + Math.PI); // start the circle opposite the lead so it never splits
      };
      const order = [...cells].sort((a, b) => sortAz(a) - sortAz(b) || (a.edge && b.edge ? a.edge.id - b.edge.id : 0));
      const s = order.map((c) => cells.indexOf(c)).join(',');
      if (s !== cells.map((_, i) => i).join(',') || force) { layoutBand(band, order); changed = true; }
      if (lead) band.offsetT = az.get(lead) - (lead.l0 + lead.l1) / 2;
    }
    const nsig = allCells().map((c) => `${c.band}:${c.l0.toFixed(3)}`).join('|');
    if (changed || nsig !== sig || force) { sig = nsig; pushCells(); drawLabels(); }
  }

  function updateTethers(alpha) {
    for (const t of tethers) {
      const e = t.edge;
      const show = alpha > 0.02 && e.vis && e.vis.line.visible;
      t.line.visible = t.pin.visible = !!show;
      if (!show || !tipLocal(e, _t)) continue;
      const band = spec.bands[t.cell.band];
      const off = band.offset || 0;
      const c = t.cell;
      _d.copy(_t).normalize().applyQuaternion(qTiltInv);
      let th = Math.acos(clamp(_d.y, -1, 1));
      let L = wrap(Math.atan2(_d.z, _d.x) - off);
      const mT = Math.min(0.16, (band.c1 - band.c0) * 0.3);
      th = clamp(th, band.c0 + mT + (band.c0 < 0.01 ? CAP : 0), band.c1 - mT - (band.c1 > Math.PI - 0.01 ? CAP : 0));
      if (c.l1 - c.l0 < TAU - 1e-3) {
        const mL = Math.min(0.08, (c.l1 - c.l0) * 0.3);
        const a0 = c.l0 + mL, a1 = c.l1 - mL;
        if (!(L >= a0 && L <= a1)) L = Math.abs(angDiff(L, a0)) < Math.abs(angDiff(L, a1)) ? a0 : a1;
      }
      sph(th, L + off, _a).applyQuaternion(qTilt);
      const rA = r * 1.015, rT = _t.length();
      _d.copy(_t).divideScalar(rT);
      const omega = Math.acos(clamp(_d.dot(_a), -1, 1));
      const arr = t.line.geometry.attributes.position.array;
      for (let i = 0; i <= TSEG; i++) {
        const u = i / TSEG;
        if (omega < 1e-4 || omega > Math.PI - 1e-3) _p.copy(_d).lerp(_a, u).normalize();
        else {
          const s = Math.sin(omega);
          _p.copy(_d).multiplyScalar(Math.sin((1 - u) * omega) / s).addScaledVector(_a, Math.sin(u * omega) / s);
        }
        const k = 1 - Math.min(1, u / 0.55);
        _p.multiplyScalar(rA + (rT - rA) * k * k * (3 - 2 * k));
        arr[i * 3] = _p.x; arr[i * 3 + 1] = _p.y; arr[i * 3 + 2] = _p.z;
      }
      t.line.geometry.attributes.position.needsUpdate = true;
      t.line.computeLineDistances();
      const pa = t.pin.geometry.attributes.position.array;
      pa[0] = _a.x * rA; pa[1] = _a.y * rA; pa[2] = _a.z * rA;
      t.pin.geometry.attributes.position.needsUpdate = true;
    }
  }

  // ---- theme
  let lastTheme = null;
  function applyTheme() {
    const th = api.theme();
    if (th === lastTheme) return;
    lastTheme = th;
    const astral = api.themeName() === 'astral';
    const ink = role === 'red' ? th.red : th.ink;
    uniforms.uInk.value.setHex(ink);
    uniforms.uHatch.value.setHex(role === 'red' ? th.red : th.soft);
    uniforms.uSoft.value.setHex(role === 'red' ? th.red : th.soft);
    uniforms.uBlue.value.setHex(role === 'red' ? th.red : th.blue);
    uniforms.uOchre.value.setHex(role === 'red' ? th.red : th.ochre);
    const fill = new THREE.Color().setHex(th.bg);
    if (astral) fill.lerp(new THREE.Color().setHex(ink), 0.035);
    else fill.lerp(new THREE.Color(0xffffff), 0.28);
    uniforms.uFill.value.copy(fill);
    uniforms.uAstral.value = astral ? 1 : 0;
    uniforms.uHatchAlpha.value = astral ? 0.5 : 0.88;
  }

  // initial layout (re-ordered once live positions exist)
  pushCells();
  drawLabels();

  let acc = 0, first = true;
  return {
    object,
    update(dt, time, alpha) {
      applyTheme();
      uniforms.uAlpha.value = alpha;
      mat.depthWrite = alpha > 0.55;
      acc += dt;
      if (first || acc > 0.4) { reorder(first); acc = 0; first = false; }
      let moved = false;
      for (const band of spec.bands) {
        if (band.offsetT == null) continue;
        if (band.offset == null) band.offset = band.offsetT;
        const d = angDiff(band.offsetT, band.offset);
        if (Math.abs(d) > 1e-4) { band.offset += d * Math.min(1, dt * 3); moved = true; }
      }
      if (moved) spec.bands.forEach((b, i) => uniforms.uBands.value[i].z = b.offset || 0);
      updateTethers(alpha);
    },
  };
}
