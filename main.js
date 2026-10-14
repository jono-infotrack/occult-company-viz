// Codex of Ownership: an "occult diagram" rendering of a company ownership graph.
// No build step: three.js + addons come from the CDN importmap in index.html.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ---------------------------------------------------------------- constants
const TIER_H = 21;          // vertical distance between ownership tiers
const PANEL_W = 410;        // ledger panel width (keep in sync with CSS)
const RING_FONT = '"IM Fell English SC", "IM Fell English", Georgia, serif';
const LABEL_FONT = '"Cormorant Garamond", Georgia, serif';

const THEMES = {
  parchment: {
    bg: 0xf3eddf, ink: 0x2b2118, soft: 0x6b5a45, red: 0xa3281c, blue: 0x2f5578, ochre: 0x9a6a1f,
    fogNear: 0.6, fogFar: 2.1, bloom: false, ground: 0.13, webAlpha: 1, blending: THREE.NormalBlending,
  },
  astral: {
    bg: 0x0b0a1f, ink: 0xf2cf7a, soft: 0xb59a5a, red: 0xff5a45, blue: 0x8fb8ff, ochre: 0xffa860,
    fogNear: 0.6, fogFar: 2.4, bloom: true, ground: 0.16, webAlpha: 0.7, blending: THREE.AdditiveBlending,
  },
};

// ---------------------------------------------------------------- data
async function loadData() {
  const forceScratch = new URLSearchParams(location.search).has('scratch');
  if (!forceScratch && window.ENTITY_DATA) return { data: window.ENTITY_DATA, source: 'data.js' };
  if (!window.SCRATCH_ENTITY_DATA) {
    await new Promise((res) => {
      const s = document.createElement('script');
      s.src = './scratch-data.js';
      s.onload = s.onerror = res;
      document.head.appendChild(s);
    });
  }
  return window.SCRATCH_ENTITY_DATA ? { data: window.SCRATCH_ENTITY_DATA, source: 'scratch-data.js' } : null;
}

const personName = (p) => [p.first_name, p.last_name].filter(Boolean).join(' ');

function buildGraph(D) {
  const nodes = new Map();
  const add = (key, kind, name, raw) => {
    if (!key || nodes.has(key)) return;
    nodes.set(key, {
      key, kind, name: name || key, raw, edges: [], tier: null,
      pos: new THREE.Vector3(), vel: new THREE.Vector3(),
      flagged: !!raw.flagged, ubo: !!raw.is_ubo,
    });
  };
  (D.companies || []).forEach((c) => add(c.key, 'company', c.name, c));
  (D.persons || []).forEach((p) => add(p.key, 'person', personName(p), p));
  (D.trusts || []).forEach((t) => add(t.key, 'trust', t.name, t));
  (D.unresolved || []).forEach((u) => add(u.key, 'unresolved', u.name, u));
  // Tolerate edges that reference unknown keys: draw them as unresolved orgs.
  const ensure = (k) => { if (k && !nodes.has(k)) add(k, 'unresolved', k.replace(/^[a-z]+:/i, ''), { key: k }); };

  const edges = [];
  for (const s of D.shareholdings || []) {
    ensure(s.owner_key); ensure(s.owned_key);
    edges.push({ kind: 'share', from: s.owner_key, to: s.owned_key, raw: s,
      ceased: !!s.former, percent: Number(s.percent) || 0 });
  }
  for (const o of D.officeholders || []) {
    ensure(o.person_key); ensure(o.company_key);
    edges.push({ kind: 'officer', from: o.person_key, to: o.company_key, raw: o, ceased: !!o.ceased });
  }
  for (const t of D.trust_relationships || []) {
    ensure(t.party_key); ensure(t.trust_key);
    edges.push({ kind: 'trust', from: t.party_key, to: t.trust_key, raw: t, ceased: !!t.ceased,
      trustee: /trustee/i.test(t.role || '') });
  }
  const valid = edges.filter((e) => e.from !== e.to && nodes.has(e.from) && nodes.has(e.to));
  valid.forEach((e, i) => {
    e.id = i; e.a = nodes.get(e.from); e.b = nodes.get(e.to);
    e.a.edges.push(e); e.b.edges.push(e);
  });
  let target = D.target && nodes.has(D.target) ? D.target : [...nodes.values()].find((n) => n.kind === 'company')?.key;
  const t = nodes.get(target);
  if (t) t.isTarget = true;
  return { nodes, edges: valid, target };
}

// Ownership depth: target = 0, owners negative (up), subsidiaries positive (down).
function computeTiers(graph) {
  const { nodes, edges, target } = graph;
  const tier = (n) => n.tier;
  nodes.get(target).tier = 0;
  // rule: tier(b) = tier(a) + d
  const shareRules = edges.filter((e) => e.kind === 'share').map((e) => [e.a, e.b, 1]);
  const otherRules = edges.filter((e) => e.kind !== 'share').map((e) => {
    if (e.kind === 'officer') return [e.a, e.b, 1];            // person sits above company
    return [e.a, e.b, e.trustee ? 0 : 1];                      // trustee level with trust; appointors etc. above
  });
  const pass = (rules) => {
    let changed = false;
    for (const [a, b, d] of rules) {
      if (tier(a) != null && tier(b) == null) { b.tier = a.tier + d; changed = true; }
      else if (tier(b) != null && tier(a) == null) { a.tier = b.tier - d; changed = true; }
    }
    return changed;
  };
  for (let guard = 0; guard < 200; guard++) {
    while (pass(shareRules));
    if (!pass(otherRules)) break;
  }
  for (const n of nodes.values()) if (n.tier == null) n.tier = n.kind === 'person' ? -1 : 0;
  // Ultimate beneficial owners float to the very top.
  const minTier = Math.min(...[...nodes.values()].map((n) => n.tier));
  for (const n of nodes.values()) if (n.ubo) n.tier = minTier;
}

// ---------------------------------------------------------------- formatting
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(s) {
  if (!s) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}` : String(s);
}
const year = (s) => (s ? String(s).slice(0, 4) : '');
const fmtACN = (acn) => (acn ? String(acn).replace(/^(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3') : '');
const fmtABN = (abn) => (abn ? String(abn).replace(/^(\d{2})(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3 $4') : '');
const fmtPct = (p) => (p == null || isNaN(p) ? '' : `${+(+p).toFixed(2)}%`);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const trustRoleLabel = (role = '') => role.toLowerCase() || 'party';
const OFFICER_ABBR = { 'Director': 'dir', 'Secretary': 'sec', 'Alternate Director': 'alt dir', 'Director and Secretary': 'dir · sec' };
const shareClasses = (s) => [...new Set((s.holdings || []).map((h) => h.share_class).filter(Boolean))].join('+');

function edgeLabel(e) {
  let t;
  if (e.kind === 'share') t = `${fmtPct(e.percent)} ${shareClasses(e.raw)}`.trim() + (e.raw.joint_holding ? ' jt' : '');
  else if (e.kind === 'officer') t = OFFICER_ABBR[e.raw.role] || (e.raw.role || 'officer').toLowerCase();
  else t = trustRoleLabel(e.raw.role);
  return e.ceased ? `former ${t}` : t;
}

function ringTextFor(n) {
  const r = n.raw;
  const sep = '  ·  ';
  if (n.kind === 'company') {
    return [n.name.toUpperCase(), r.acn && `ACN ${fmtACN(r.acn)}`, r.company_type, r.status && String(r.status).toUpperCase(),
      r.registration_date && `REG. ${year(r.registration_date)}`, r.state, n.flagged && 'FLAGGED'].filter(Boolean).join(sep);
  }
  if (n.kind === 'person') {
    return [n.name.toUpperCase(), r.birth_date && `B. ${year(r.birth_date)}`, r.birth_place,
      n.ubo && `U.B.O. ${fmtPct(r.ubo_ownership)}`].filter(Boolean).join(sep);
  }
  if (n.kind === 'trust') {
    return [n.name.toUpperCase(), r.trust_type && `${r.trust_type} trust`.toUpperCase(), r.established_date && `EST. ${year(r.established_date)}`,
      r.jurisdiction].filter(Boolean).join(sep);
  }
  return `${n.name.toUpperCase()}${sep}UNRESOLVED ORGANISATION`;
}

// ---------------------------------------------------------------- canvas drawing (white ink; tinted by material colour)
function circle(ctx, r, lw = 1, dash = null) {
  ctx.beginPath();
  ctx.setLineDash(dash || []);
  ctx.lineWidth = lw;
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
}
function dot(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
function hollow(ctx, x, y, r, lw) {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  dot(ctx, x, y, r + lw);
  ctx.restore();
  ctx.beginPath(); ctx.lineWidth = lw; ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
}
function ticks(ctx, r0, r1, count, every, lw) {
  ctx.lineWidth = lw;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const rr = i % every === 0 ? r1 - (r0 - r1) * 0.9 : r1;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    ctx.stroke();
  }
}
// Text set around a circle, repeated to fill the full circumference.
function ringText(ctx, text, r, fontPx) {
  const C = Math.PI * 2 * r;
  let size = fontPx;
  const unit = `${text}   ✦   `;
  ctx.font = `${size}px ${RING_FONT}`;
  while (ctx.measureText(unit).width > C * 0.97 && size > 5) { size *= 0.93; ctx.font = `${size}px ${RING_FONT}`; }
  const reps = Math.max(1, Math.floor(C / ctx.measureText(unit).width));
  const chars = [...unit.repeat(reps)];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const extra = (C - widths.reduce((a, b) => a + b, 0)) / chars.length;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let theta = 0;
  chars.forEach((c, i) => {
    ctx.save();
    ctx.rotate(theta + widths[i] / 2 / r);
    ctx.translate(0, -r);
    ctx.fillText(c, 0, 0);
    ctx.restore();
    theta += (widths[i] + extra) / r;
  });
}

function drawSealCanvas(n, interior = true) {
  const S = n.isTarget ? 1536 : n.kind === 'company' || n.kind === 'trust' ? 768 : 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const R = S / 2 * 0.985;
  ctx.translate(S / 2, S / 2);
  ctx.strokeStyle = ctx.fillStyle = '#fff';
  const u = R / 256; // line width unit
  const text = ringTextFor(n);

  if (n.kind === 'company') {
    circle(ctx, R, 3 * u);
    circle(ctx, R * 0.955, 1 * u);
    for (let i = 0; i < 72; i++) { const a = i / 72 * Math.PI * 2; dot(ctx, Math.cos(a) * R * 0.9775, Math.sin(a) * R * 0.9775, (i % 6 ? 0.9 : 1.8) * u); }
    ringText(ctx, text, R * 0.885, R * 0.072);
    circle(ctx, R * 0.815, 1.4 * u);
    ticks(ctx, R * 0.815, R * 0.79, 120, 10, 0.8 * u);
    circle(ctx, R * 0.775, 0.8 * u);
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; hollow(ctx, Math.cos(a) * R * 0.815, Math.sin(a) * R * 0.815, R * 0.03, 1.1 * u); }
    if (interior) {
      if (n.isTarget) { circle(ctx, R * 0.62, 0.6 * u, [2 * u, 4 * u]); circle(ctx, R * 0.36, 0.6 * u); }
      circle(ctx, R * 0.17, 1.4 * u);
      circle(ctx, R * 0.14, 0.6 * u);
      dot(ctx, 0, 0, 2.5 * u);
    }
  } else if (n.kind === 'person') {
    circle(ctx, R, 2.6 * u);
    ringText(ctx, text, R * 0.88, R * 0.1);
    circle(ctx, R * 0.775, 1.4 * u);
    if (n.ubo) { circle(ctx, R * 0.75, 0.6 * u); }
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 - Math.PI / 2; hollow(ctx, Math.cos(a) * R * 0.775, Math.sin(a) * R * 0.775, R * 0.045, 1.2 * u); }
    if (interior) circle(ctx, R * 0.15, 1.2 * u);
  } else if (n.kind === 'trust') {
    circle(ctx, R, 1.4 * u, [6 * u, 5 * u]);
    circle(ctx, R * 0.94, 1.6 * u);
    circle(ctx, R * 0.915, 0.8 * u);
    ringText(ctx, text, R * 0.845, R * 0.08);
    circle(ctx, R * 0.775, 1.4 * u);
    circle(ctx, R * 0.75, 0.8 * u);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 - Math.PI / 2; dot(ctx, Math.cos(a) * R * 0.97, Math.sin(a) * R * 0.97, 3 * u); }
    if (interior) circle(ctx, R * 0.2, 1.2 * u);
  } else {
    circle(ctx, R * 0.97, 1.6 * u, [9 * u, 7 * u]);
    ringText(ctx, text, R * 0.86, R * 0.085);
    circle(ctx, R * 0.76, 1 * u, [3 * u, 5 * u]);
    if (interior) {
      ctx.font = `italic ${R * 0.62}px "IM Fell English", Georgia, serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('?', 0, R * 0.04);
      for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + Math.PI / 2; dot(ctx, Math.cos(a) * R * 0.42, Math.sin(a) * R * 0.42, 3 * u); }
    }
  }
  return cv;
}

function makeTextCanvas(text, px, italic = true, letter = 0) {
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d');
  const font = `${italic ? 'italic ' : ''}500 ${px}px ${LABEL_FONT}`;
  ctx.font = font;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${letter}px`;
  const w = Math.ceil(ctx.measureText(text).width + px * 0.6 + letter * text.length);
  cv.width = w; cv.height = Math.ceil(px * 1.5);
  ctx.font = font;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${letter}px`;
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, cv.width / 2, cv.height / 2);
  return cv;
}

function canvasTexture(cv, renderer) {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

// ---------------------------------------------------------------- star polygon geometry
// {n/k}: chords from point i to point i+k on a circle. Works for compound stars (e.g. {6/2}).
function starChords(n, k, r, phase = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a0 = phase + (i / n) * Math.PI * 2, a1 = phase + (((i + k) % n) / n) * Math.PI * 2;
    pts.push(Math.cos(a0) * r, Math.sin(a0) * r, 0, Math.cos(a1) * r, Math.sin(a1) * r, 0);
  }
  return pts;
}
function hypotrochoid(R, r, d, scale, steps = 1600) {
  const pts = [];
  const g = (a, b) => (b ? g(b, a % b) : a);
  const turns = r / g(R, r);
  const max = R - r + d;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2 * turns;
    pts.push(((R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t)) / max * scale,
      ((R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t)) / max * scale, 0);
  }
  return pts;
}

// ---------------------------------------------------------------- app
const loaded = await loadData();
if (!loaded) {
  document.getElementById('notice').style.display = 'flex';
  throw new Error('No ENTITY_DATA or scratch-data.js available');
}
const DATA = loaded.data;
const graph = buildGraph(DATA);
computeTiers(graph);

// Fonts must be ready before we paint canvases.
try {
  await Promise.race([
    Promise.all([document.fonts.load(`40px ${RING_FONT}`), document.fonts.load(`italic 500 40px ${LABEL_FONT}`),
      document.fonts.load('italic 40px "IM Fell English"')]),
    new Promise((r) => setTimeout(r, 3000)),
  ]);
} catch { /* fall back to Georgia */ }

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xffffff, 70, 260);
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.5, 2000);
camera.position.set(0, 30, 140);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.35;
controls.minDistance = 12;
controls.maxDistance = 420;
let autoRotate = true;
controls.addEventListener('start', () => { setAutoRotate(false); fly = null; });

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 }));
composer.setPixelRatio(Math.min(devicePixelRatio, 2));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.6, 0.5, 0.14);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// Theme-aware material registry: every material declares an ink "role".
const themed = new Set();
let theme = THEMES.parchment;
let themeName = 'parchment';
function themedMat(role, mat) {
  mat.userData.role = role;
  themed.add(mat);
  // Materials made after start-up (seal swaps, lazily built cores) join the current theme straight away.
  if (mat.color) mat.color.setHex(theme[role]);
  mat.blending = theme.blending;
  return mat;
}

// Free the GPU resources under `root` (geometries, materials and their textures, including shader
// uniforms) and drop its materials from the theme registry and from `mats` (a seal's fade registry).
function disposeObject(root, mats = null) {
  const gone = new Set();
  root.traverse((o) => {
    o.geometry?.dispose();
    for (const m of [o.material].flat()) if (m) gone.add(m);
  });
  for (const m of gone) {
    for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
    for (const u of Object.values(m.uniforms || {})) if (u?.value?.isTexture) u.value.dispose();
    m.dispose();
    themed.delete(m);
  }
  if (mats) for (let i = mats.length - 1; i >= 0; i--) if (gone.has(mats[i].m)) mats.splice(i, 1);
  root.removeFromParent();
}

let hovered = null, selected = null, showCeased = true;

// ---------------------------------------------------------------- seals
// Seal variant: ?seal=<name>, or the Seal toolbar button, loads ./seals/<name>.js, which replaces the
// flat star webs with a 3D core. See seals/README.md for the module contract.
const SEAL_MODES = [
  { name: null, label: 'Flat' },
  { name: 'armillary', label: 'Armillary' },
  { name: 'stringart', label: 'String-art' },
  { name: 'captable', label: 'Cap-table' },
  { name: 'hybrid', label: 'Hybrid' },
];
async function loadSealVariant(name) {
  if (!name || !/^[a-z0-9-]+$/.test(name)) return null;
  try {
    const mod = await import(`./seals/${name}.js`);
    if (typeof mod.build === 'function') return mod;
    console.error(`seal variant "${name}" has no build() export`);
  } catch (err) { console.error(`seal variant "${name}" failed to load`, err); }
  return null;
}
let sealVariantName = new URLSearchParams(location.search).get('seal');
let sealVariant = await loadSealVariant(sealVariantName);
if (!sealVariant) sealVariantName = null;
const sealRoot = new THREE.Group();
const edgeRoot = new THREE.Group();
scene.add(edgeRoot, sealRoot);
const hitMeshes = [];

function radiusFor(n) {
  if (n.isTarget) return 9;
  const deg = n.edges.length;
  if (n.kind === 'company') return 3.8 + Math.min(deg, 10) * 0.25;
  if (n.kind === 'person') return n.ubo ? 3 : 2.5;
  if (n.kind === 'trust') return 3.6;
  return 2.9;
}

function webLayers(n) {
  const R = n.R;
  const deg = n.edges.length;
  if (n.kind === 'company') {
    if (n.isTarget) {
      const N = 54;
      return [
        { pts: starChords(N, 23, R * 0.755), a: 0.42, speed: 0.05 },
        { pts: starChords(36, 13, R * 0.6, 0.1), a: 0.5, speed: -0.09 },
        { pts: hypotrochoid(13, 5, 5, R * 0.34), a: 0.55, speed: 0.14, line: true },
        { pts: starChords(N, 1, R * 0.755), a: 0.8, speed: 0.05 },
        { pts: starChords(9, 4, R * 0.14), a: 0.9, speed: -0.25 },
      ];
    }
    const N = Math.max(7, Math.min(29, 7 + deg * 2)) | 1; // odd => single-stroke stars
    const k = Math.floor(N * 0.4);
    const m = Math.max(5, Math.round(N * 0.6)) | 1;
    return [
      { pts: starChords(N, k, R * 0.76), a: 0.6, speed: 0.07 },
      { pts: starChords(N, 1, R * 0.76), a: 0.7, speed: 0.07 },
      { pts: starChords(m, Math.floor(m / 2) - 1 || 1, R * 0.46, 0.2), a: 0.6, speed: -0.13 },
    ];
  }
  if (n.kind === 'person') {
    const layers = [
      { pts: starChords(5, 2, R * 0.775, -Math.PI / 2), a: 0.95, speed: 0.06 },
      { pts: starChords(5, 2, R * 0.29, Math.PI / 2), a: 0.7, speed: -0.15 },
    ];
    if (n.ubo) layers.push({ pts: starChords(10, 3, R * 0.6, -Math.PI / 2), a: 0.45, speed: -0.04 });
    return layers;
  }
  if (n.kind === 'trust') {
    const t = (n.raw.trust_type || '').toLowerCase();
    const inner = t === 'unit' ? starChords(4, 1, R * 0.45, Math.PI / 4) : t === 'smsf' ? starChords(8, 3, R * 0.45) : t === 'bare' ? starChords(3, 1, R * 0.4, Math.PI / 2) : starChords(12, 5, R * 0.46);
    return [
      { pts: starChords(6, 2, R * 0.75, -Math.PI / 2), a: 0.95, speed: 0.05 },
      { pts: inner, a: 0.55, speed: -0.12 },
      { pts: starChords(3, 1, R * 0.2, Math.PI / 2), a: 0.8, speed: 0.2 },
    ];
  }
  return [{ pts: starChords(7, 3, R * 0.6), a: 0.25, speed: 0.05 }];
}

// Builds (or, on a seal-mode swap, rebuilds) n's seal. The previous seal's fade, hover scale and
// spin carry over so a swap is seamless.
function buildSeal(n) {
  const prev = n.seal;
  n.R = radiusFor(n);
  const role = n.flagged ? 'red' : 'ink';
  const group = new THREE.Group();     // positioned; billboarded toward camera
  group.position.copy(n.pos);
  const mats = [];
  // base: a number (line materials also take the theme's webAlpha) or { parchment, astral } (used
  // as given). gain: optional { value } that also multiplies the opacity, read every frame.
  const reg = (m, base, gain = null) => { mats.push({ m, base, gain }); return m; };

  const ringMat = reg(themedMat(role, new THREE.MeshBasicMaterial({ map: canvasTexture(drawSealCanvas(n, !sealVariant), renderer), transparent: true, depthWrite: false })), 1);
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(n.R * 2, n.R * 2), ringMat);
  ring.userData.node = n;
  hitMeshes.push(ring);
  group.add(ring);

  const webs = (sealVariant ? [] : webLayers(n)).map((L) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(L.pts, 3));
    const mat = reg(themedMat(role, new THREE.LineBasicMaterial({ transparent: true, depthWrite: false })), L.a);
    const obj = L.line ? new THREE.Line(geo, mat) : new THREE.LineSegments(geo, mat);
    obj.position.z = 0.01;
    group.add(obj);
    return { obj, speed: L.speed };
  });

  // Small engraved caption beneath the seal (readable at distance; ring text holds the detail).
  const capPx = n.isTarget ? 64 : 44;
  const capCv = makeTextCanvas(n.name, capPx, n.kind !== 'company', n.kind === 'company' ? 1 : 0);
  const capH = n.isTarget ? 2.1 : n.kind === 'person' ? 1.05 : 1.15;
  const capMat = reg(themedMat(role, new THREE.MeshBasicMaterial({ map: canvasTexture(capCv, renderer), transparent: true, depthWrite: false })), 0.95);
  const caption = new THREE.Mesh(new THREE.PlaneGeometry(capH * capCv.width / capCv.height, capH), capMat);
  caption.position.y = -n.R - capH * 0.55;
  group.add(caption);

  sealRoot.add(group);

  // Variant core: lives in its own group so it is NOT billboarded (it is genuinely 3D).
  let core = null;
  if (sealVariant) {
    const coreGroup = new THREE.Group();
    coreGroup.position.copy(n.pos);
    const built = sealVariant.build(n, {
      THREE, graph, role, R: n.R, renderer, camera,
      reg, themedMat, canvasTexture, makeTextCanvas, starChords, hypotrochoid,
      theme: () => theme, themeName: () => themeName,
      hovered: () => hovered, selected: () => selected,
      approach: (e, out) => edgeApproach(e, n, out),
      dispose: (obj) => disposeObject(obj, mats),
    });
    coreGroup.add(built.object);
    sealRoot.add(coreGroup);
    core = { group: coreGroup, update: built.update || null, anchor: built.anchor || null, dispose: built.dispose || null };
  }
  n.seal = { group, ring, webs, mats, core, state: { hovered: false, selected: false },
    alpha: prev?.alpha ?? 1, alphaT: prev?.alphaT ?? 1, scale: prev?.scale ?? 1, scaleT: prev?.scaleT ?? 1,
    phase: prev?.phase ?? Math.random() * 10,
    spin: prev?.spin ?? (Math.random() < 0.5 ? -1 : 1) * (n.isTarget ? 0.02 : 0.035 + Math.random() * 0.03) };
  if (prev) ring.rotation.z = prev.ring.rotation.z;
  group.scale.setScalar(n.seal.scale);
  core?.group.scale.setScalar(n.seal.scale);
}
for (const n of graph.nodes.values()) buildSeal(n);

function disposeSeal(n) {
  const s = n.seal;
  if (s.core) { s.core.dispose?.(); disposeObject(s.core.group); }
  disposeObject(s.group);
  hitMeshes.splice(hitMeshes.indexOf(s.ring), 1);
}

// Swap every seal to the current variant in place: camera, selection, theme and toggles are untouched.
function rebuildSeals() {
  for (const n of graph.nodes.values()) { disposeSeal(n); buildSeal(n); }
  refreshAnchored();
  for (const e of graph.edges) updateEdgeGeometry(e);
  refreshFocus();
}

let sealSeq = 0;
async function setSealMode(name) {
  const seq = ++sealSeq;
  const mod = await loadSealVariant(name);
  if (seq !== sealSeq) return false;     // superseded by a later click
  sealVariant = mod;
  sealVariantName = mod ? name : null;
  rebuildSeals();
  showSealMode();
  const url = new URL(location.href);
  if (sealVariantName) url.searchParams.set('seal', sealVariantName); else url.searchParams.delete('seal');
  history.replaceState(history.state, '', url);
  return true;
}
const sealLabel = (name) => SEAL_MODES.find((m) => m.name === name)?.label || name || 'Flat';
function showSealMode(name = sealVariantName) { document.querySelector('#seal-toggle .state').textContent = sealLabel(name); }
let sealRequested = sealVariantName;
document.getElementById('seal-toggle').addEventListener('click', () => {
  const i = SEAL_MODES.findIndex((m) => m.name === sealRequested);
  sealRequested = SEAL_MODES[(i + 1) % SEAL_MODES.length].name;
  showSealMode(sealRequested);
  setSealMode(sealRequested);
});
showSealMode();

// Selection halo: a dashed ring that orbits the selected seal.
const halo = (() => {
  const g = new THREE.BufferGeometry().setFromPoints(new THREE.EllipseCurve(0, 0, 1, 1).getPoints(128));
  const m = themedMat('red', new THREE.LineDashedMaterial({ dashSize: 0.06, gapSize: 0.05, transparent: true, opacity: 0.9, depthWrite: false }));
  const loop = new THREE.LineLoop(g, m);
  loop.computeLineDistances();
  const g2 = new THREE.BufferGeometry().setFromPoints(new THREE.EllipseCurve(0, 0, 1.06, 1.06).getPoints(128));
  const loop2 = new THREE.LineLoop(g2, themedMat('red', new THREE.LineBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false })));
  const grp = new THREE.Group();
  grp.add(loop, loop2);
  grp.visible = false;
  scene.add(grp);
  return grp;
})();

// ---------------------------------------------------------------- edges
const dotTex = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  return canvasTexture(cv, renderer);
})();

const SEG = 48;
const pairCount = new Map();
function edgeRole(e) {
  if (e.a.flagged || e.b.flagged) return 'red';
  if (e.kind === 'trust') return e.trustee ? 'blue' : 'ochre';
  return 'ink';
}
function buildEdge(e) {
  const role = edgeRole(e);
  const pairKey = [e.from, e.to].sort().join('|');
  e.pairIndex = pairCount.get(pairKey) || 0;
  pairCount.set(pairKey, e.pairIndex + 1);
  const dashed = e.ceased || e.kind === 'officer';
  const base = e.ceased ? 0.28 : e.kind === 'share' ? 0.85 : e.kind === 'trust' ? 0.8 : 0.5;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEG + 1) * 3), 3));
  const mat = themedMat(role, dashed
    ? new THREE.LineDashedMaterial({ dashSize: e.ceased ? 0.35 : 0.9, gapSize: e.ceased ? 0.7 : 0.55, transparent: true, depthWrite: false })
    : new THREE.LineBasicMaterial({ transparent: true, depthWrite: false }));
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  edgeRoot.add(line);
  const mats = [{ m: mat, base }];

  let arrow = null;
  if (e.kind === 'share') {
    const am = themedMat(role, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
    arrow = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.1, 10), am);
    edgeRoot.add(arrow);
    mats.push({ m: am, base: e.ceased ? 0.3 : 0.9 });
  }

  const cv = makeTextCanvas(edgeLabel(e), 40, true);
  const lm = themedMat(role === 'ink' ? 'soft' : role, new THREE.SpriteMaterial({ map: canvasTexture(cv, renderer), transparent: true, depthWrite: false }));
  const label = new THREE.Sprite(lm);
  const lh = e.kind === 'share' ? 1.3 : 1.05;
  label.scale.set(lh * cv.width / cv.height, lh, 1);
  edgeRoot.add(label);
  mats.push({ m: lm, base: e.ceased ? 0.45 : 0.95 });

  // Ink particles flow owner -> owned on live shareholdings.
  let particles = null;
  if (e.kind === 'share' && !e.ceased) {
    const count = 2 + Math.round(e.percent / 12);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const pm = themedMat(role, new THREE.PointsMaterial({ size: 0.4 + e.percent / 220, map: dotTex, transparent: true, depthWrite: false, alphaTest: 0.01 }));
    const pts = new THREE.Points(pg, pm);
    pts.frustumCulled = false;
    edgeRoot.add(pts);
    mats.push({ m: pm, base: 0.95 });
    particles = { pts, count, speed: 2.5 + e.percent * 0.09, offset: Math.random() };
  }

  e.vis = { line, arrow, label, particles, mats, dashed, alpha: 1, alphaT: 1,
    curve: new THREE.QuadraticBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()), t0: 0, t1: 1 };
}
graph.edges.forEach(buildEdge);

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), Y = new THREE.Vector3(0, 1, 0);
const _ancA = new THREE.Vector3(), _ancB = new THREE.Vector3();

// Unit vector (world axes) from n's centre towards where edge e comes in from: the curve's control
// point, which depends only on the two node centres (so anchoring an end never feeds back into it).
function edgeApproach(e, n, out) {
  if (!e.vis || (e.a !== n && e.b !== n)) return false;
  out.subVectors(e.vis.curve.v1, n.pos);
  const l = out.length();
  if (l < 1e-6) return false;
  out.divideScalar(l);
  return true;
}
// A variant core may land an edge end on a point of its own (seals/README.md, anchor()).
function coreAnchor(n, e, out) {
  const c = n.seal.core;
  if (!c?.anchor || !c.anchor(e, out)) return false;
  out.multiplyScalar(n.seal.scale).add(n.pos);
  return true;
}
// Edges with an anchor-capable end are re-laid every frame (cores turn after the layout settles).
let anchoredEdges = [];
function refreshAnchored() { anchoredEdges = graph.edges.filter((e) => e.a.seal.core?.anchor || e.b.seal.core?.anchor); }
refreshAnchored();

function updateEdgeGeometry(e) {
  const { curve } = e.vis;
  const A = e.a.pos, B = e.b.pos;
  const dir = _v.subVectors(B, A);
  const len = Math.max(dir.length(), 0.001);
  // Bend sideways, alternating per parallel edge between the same pair.
  const side = _w.crossVectors(dir, UP);
  if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
  side.normalize();
  const i = e.pairIndex;
  const bend = (0.1 + 0.12 * Math.ceil(i / 2)) * (i % 2 ? -1 : 1) * len;
  curve.v1.copy(A).add(B).multiplyScalar(0.5).addScaledVector(side, bend).addScaledVector(UP, len * 0.04);
  layEdge(e, coreAnchor(e.a, e, _ancA) && _ancA, coreAnchor(e.b, e, _ancB) && _ancB);
}
// Ends: anchor points (world) or false, meaning the node centre, trimmed to just outside its seal.
function layEdge(e, ancA, ancB) {
  const { curve, line } = e.vis;
  curve.v0.copy(ancA || e.a.pos);
  curve.v2.copy(ancB || e.b.pos);
  e.vis.anchored = !!(ancA || ancB);
  curve.needsUpdate = true; // Curve caches its arc lengths; the end points have moved
  const L = curve.getLength();
  // An anchored share edge stops so that its arrow's tip (0.55 beyond its centre) touches the anchor.
  const endB = ancB ? (e.kind === 'share' ? 0.6 : 0.1) : e.b.R * 1.04 + (e.kind === 'share' ? 0.4 : 0);
  const t0 = Math.min(0.45, (ancA ? 0.1 : e.a.R * 1.04) / L), t1 = Math.max(0.55, 1 - endB / L);
  e.vis.t0 = t0; e.vis.t1 = t1;
  const arr = line.geometry.attributes.position.array;
  for (let s = 0; s <= SEG; s++) {
    curve.getPoint(t0 + (t1 - t0) * (s / SEG), _v);
    arr[s * 3] = _v.x; arr[s * 3 + 1] = _v.y; arr[s * 3 + 2] = _v.z;
  }
  line.geometry.attributes.position.needsUpdate = true;
  line.geometry.computeBoundingSphere();
  if (e.vis.dashed) line.computeLineDistances();
  if (e.vis.arrow) {
    curve.getPoint(t1, e.vis.arrow.position);
    curve.getTangent(t1, _v);
    e.vis.arrow.quaternion.setFromUnitVectors(Y, _v);
  }
  curve.getPoint(0.5, e.vis.label.position);
  e.vis.label.position.y += 0.55;
}

// ---------------------------------------------------------------- ground, orbits, stars
const decor = new THREE.Group();
scene.add(decor);
const ZODIAC = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'].map((g) => g + '︎');
const PLANETS = ['☉', '☽', '☿', '♀', '♂', '♃', '♄'].map((g) => g + '︎');
function drawGroundCanvas() {
  const S = 2048, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d');
  c.translate(S / 2, S / 2);
  c.strokeStyle = c.fillStyle = '#fff';
  const R = S / 2 * 0.99;
  [1, 0.97, 0.86, 0.84, 0.7, 0.52, 0.5, 0.33, 0.18].forEach((f, i) => circle(c, R * f, i % 3 === 0 ? 2.4 : 1.2));
  ticks(c, R * 0.97, R * 0.945, 360, 10, 1);
  c.font = `${R * 0.065}px Georgia, "Segoe UI Symbol", "Noto Sans Symbols", serif`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    c.save(); c.rotate(a + Math.PI / 12); c.fillText(ZODIAC[i], 0, -R * 0.905); c.restore();
    c.beginPath(); c.lineWidth = 1.2;
    c.moveTo(Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5); c.lineTo(Math.cos(a) * R * 0.97, Math.sin(a) * R * 0.97); c.stroke();
  }
  c.font = `${R * 0.05}px Georgia, "Segoe UI Symbol", "Noto Sans Symbols", serif`;
  PLANETS.forEach((p, i) => { const a = (i / 7) * Math.PI * 2; c.fillText(p, Math.cos(a) * R * 0.61, Math.sin(a) * R * 0.61); });
  c.lineWidth = 1;
  [[12, 5, 0.84], [7, 3, 0.5], [6, 2, 0.33]].forEach(([n, k, f]) => {
    const p = starChords(n, k, R * f);
    c.beginPath();
    for (let i = 0; i < p.length; i += 6) { c.moveTo(p[i], p[i + 1]); c.lineTo(p[i + 3], p[i + 4]); }
    c.stroke();
  });
  return cv;
}
const groundMat = themedMat('ink', new THREE.MeshBasicMaterial({ map: canvasTexture(drawGroundCanvas(), renderer), transparent: true, depthWrite: false, opacity: 0.13 }));
const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), groundMat);
ground.rotation.x = -Math.PI / 2;
decor.add(ground);

// One faint orbital ring per tier, plus the axis mundi through the target.
const tiers = [...new Set([...graph.nodes.values()].map((n) => n.tier))].sort((a, b) => a - b);
const tierRings = tiers.map((t) => {
  const g = new THREE.BufferGeometry().setFromPoints(new THREE.EllipseCurve(0, 0, 1, 1).getPoints(160).map((p) => new THREE.Vector3(p.x, 0, p.y)));
  const m = themedMat('soft', new THREE.LineDashedMaterial({ dashSize: 0.012, gapSize: 0.018, transparent: true, opacity: 0.22, depthWrite: false }));
  const loop = new THREE.LineLoop(g, m);
  loop.computeLineDistances();
  loop.userData.tier = t;
  decor.add(loop);
  return loop;
});
const axisMat = themedMat('soft', new THREE.LineDashedMaterial({ dashSize: 1.2, gapSize: 1.6, transparent: true, opacity: 0.25, depthWrite: false }));
const axis = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0)]), axisMat);
decor.add(axis);

const stars = (() => {
  const N = 1800, arr = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    _v.randomDirection().multiplyScalar(500 + Math.random() * 300);
    arr.set([_v.x, _v.y, _v.z], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const p = new THREE.Points(g, themedMat('ink', new THREE.PointsMaterial({ size: 1.6, map: dotTex, transparent: true, opacity: 0.6, fog: false, depthWrite: false })));
  scene.add(p);
  return p;
})();

// ---------------------------------------------------------------- force layout (3D, y-biased by tier)
const nodeList = [...graph.nodes.values()];
(function initPositions() {
  const byTier = new Map();
  nodeList.forEach((n) => { if (!byTier.has(n.tier)) byTier.set(n.tier, []); byTier.get(n.tier).push(n); });
  for (const [t, list] of byTier) {
    const r = list.length === 1 ? 0 : 6 + list.length * 2.5;
    list.forEach((n, i) => {
      const a = (i / list.length) * Math.PI * 2 + t * 0.7;
      n.pos.set(Math.cos(a) * r, -t * TIER_H, Math.sin(a) * r);
    });
  }
})();
let simAlpha = 1;
function simTick() {
  const k = simAlpha;
  for (let i = 0; i < nodeList.length; i++) {
    const a = nodeList[i];
    for (let j = i + 1; j < nodeList.length; j++) {
      const b = nodeList[j];
      _v.subVectors(a.pos, b.pos);
      let d2 = _v.lengthSq();
      if (d2 < 0.01) { _v.set(Math.random() - 0.5, 0, Math.random() - 0.5); d2 = 0.01; }
      const reach = (a.R + b.R + 4);
      const f = (reach * reach * 2.8) / d2 / Math.sqrt(d2);
      _v.multiplyScalar(f * k);
      a.vel.add(_v); b.vel.sub(_v);
    }
  }
  for (const e of graph.edges) {
    _v.subVectors(e.b.pos, e.a.pos);
    const d = Math.max(_v.length(), 0.01);
    const rest = 8 + e.a.R + e.b.R;
    const s = ((d - rest) / d) * (e.ceased ? 0.012 : 0.03) * k;
    _v.y *= 0.3; // tiers own the vertical axis
    e.a.vel.addScaledVector(_v, s); e.b.vel.addScaledVector(_v, -s);
  }
  for (const n of nodeList) {
    n.vel.y += (-n.tier * TIER_H - n.pos.y) * 0.08;
    n.vel.x -= n.pos.x * 0.007 * k; n.vel.z -= n.pos.z * 0.007 * k;
    n.vel.multiplyScalar(0.62);
    n.pos.add(n.vel);
    if (n.isTarget) { n.pos.x = 0; n.pos.z = 0; }
  }
  simAlpha = Math.max(0, simAlpha * 0.985);
}
for (let i = 0; i < 40; i++) simTick();

function layoutBounds() {
  let r = 0, minY = Infinity, maxY = -Infinity;
  for (const n of nodeList) { r = Math.max(r, Math.hypot(n.pos.x, n.pos.z) + n.R); minY = Math.min(minY, n.pos.y - n.R); maxY = Math.max(maxY, n.pos.y + n.R); }
  return { r, minY, maxY };
}
function updateLayoutVisuals() {
  for (const n of nodeList) {
    n.seal.group.position.copy(n.pos);
    if (n.seal.core) n.seal.core.group.position.copy(n.pos);
  }
  for (const e of graph.edges) updateEdgeGeometry(e);
  const b = layoutBounds();
  const gy = b.minY - 10;
  ground.position.y = gy;
  ground.scale.setScalar(Math.max(140, b.r * 3));
  for (const ring of tierRings) {
    const list = nodeList.filter((n) => n.tier === ring.userData.tier);
    const rr = Math.max(...list.map((n) => Math.hypot(n.pos.x, n.pos.z) + n.R)) + 4;
    ring.position.y = -ring.userData.tier * TIER_H;
    ring.scale.setScalar(Math.max(rr, 8));
  }
  axis.geometry.attributes.position.setY(0, b.maxY + 8);
  axis.geometry.attributes.position.setY(1, gy);
  axis.geometry.attributes.position.needsUpdate = true;
  axis.computeLineDistances();
}
updateLayoutVisuals();

// ---------------------------------------------------------------- framing / camera flight
let fly = null;
function homeView() {
  const b = settledBounds();
  const h = b.maxY - b.minY + 6;
  const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const aspect = innerWidth / innerHeight;
  const dist = (Math.max(b.r / (tv * aspect), (h / 2) / tv) + b.r * 0.35) * 1.18;
  const cy = (b.maxY + b.minY) / 2;
  return { pos: new THREE.Vector3(0, cy + dist * 0.2, dist), target: new THREE.Vector3(0, cy, 0) };
}
// Predicted bounds of the settled layout (run a hidden copy of the sim) so the intro shot frames correctly.
function settledBounds() {
  const snapshot = nodeList.map((n) => [n.pos.clone(), n.vel.clone()]);
  const a0 = simAlpha;
  for (let i = 0; i < 300 && simAlpha > 0.002; i++) simTick();
  const b = layoutBounds();
  nodeList.forEach((n, i) => { n.pos.copy(snapshot[i][0]); n.vel.copy(snapshot[i][1]); });
  simAlpha = a0;
  return b;
}
const HOME = homeView();
camera.position.copy(HOME.pos).multiplyScalar(1.5);
controls.target.copy(HOME.target);
flyTo(HOME.pos, HOME.target, 3.2);

function flyTo(pos, target, dur = 1.5) {
  fly = { t: 0, dur, p0: camera.position.clone(), p1: pos.clone(), c0: controls.target.clone(), c1: target.clone() };
}
function flyToNode(n) {
  const dir = _v.subVectors(camera.position, controls.target).normalize();
  const dist = n.R * (n.isTarget ? 7 : 9) + 24;
  flyTo(n.pos.clone().addScaledVector(dir, dist).add(new THREE.Vector3(0, n.R * 0.6, 0)), n.pos.clone(), 1.6);
}
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// ---------------------------------------------------------------- focus / hover / selection
const edgeVisible = (e) => showCeased || !e.ceased;
function refreshFocus() {
  const focus = hovered || selected;
  const near = new Set();
  const live = new Set();
  for (const e of graph.edges) {
    const vis = edgeVisible(e);
    e.vis.line.visible = e.vis.label.visible = vis;
    if (e.vis.arrow) e.vis.arrow.visible = vis;
    if (e.vis.particles) e.vis.particles.pts.visible = vis;
    if (vis) { live.add(e.a); live.add(e.b); }
    if (focus && vis && (e.a === focus || e.b === focus)) { near.add(e.a); near.add(e.b); }
  }
  for (const n of nodeList) {
    const s = n.seal;
    if (focus) s.alphaT = n === focus || near.has(n) ? 1 : 0.12;
    else s.alphaT = live.has(n) || n.edges.length === 0 ? 1 : 0.35;
    s.scaleT = n === hovered ? 1.12 : 1;
  }
  for (const e of graph.edges) e.vis.alphaT = !focus ? 1 : e.a === focus || e.b === focus ? 1.25 : 0.06;
  renderer.domElement.style.cursor = hovered ? 'pointer' : 'grab';
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const tooltip = document.getElementById('tooltip');
function pick(ev) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  for (const hit of raycaster.intersectObjects(hitMeshes, false)) {
    const n = hit.object.userData.node;
    if (n.seal.alpha < 0.3 && n !== selected) continue;
    if (hit.point.distanceTo(n.seal.group.position) <= n.R * n.seal.scale) return n;
  }
  return null;
}
renderer.domElement.addEventListener('pointermove', (ev) => {
  const n = pick(ev);
  if (n !== hovered) { hovered = n; refreshFocus(); }
  if (n) {
    tooltip.textContent = `${n.name}${n.kind === 'company' && n.raw.acn ? ` · ACN ${fmtACN(n.raw.acn)}` : ''}`;
    tooltip.style.left = `${ev.clientX + 16}px`; tooltip.style.top = `${ev.clientY + 14}px`;
    tooltip.style.opacity = 1;
  } else tooltip.style.opacity = 0;
});
let downAt = null;
renderer.domElement.addEventListener('pointerdown', (ev) => { downAt = [ev.clientX, ev.clientY]; });
renderer.domElement.addEventListener('pointerup', (ev) => {
  if (!downAt || Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) > 5) return;
  const n = pick(ev);
  if (n) select(n); else if (selected) deselect();
});

function select(n) {
  selected = n;
  setAutoRotate(false);
  halo.visible = true;
  halo.userData.node = n;
  flyToNode(n);
  renderPanel(n);
  document.body.classList.add('panel-open');
  refreshFocus();
}
function deselect() {
  selected = null;
  halo.visible = false;
  document.body.classList.remove('panel-open');
  refreshFocus();
}

// ---------------------------------------------------------------- ledger panel
const panelBody = document.getElementById('panel-body');
const link = (n) => `<a data-key="${esc(n.key)}">${esc(n.name)}</a>`;
const KIND_LABEL = { company: 'Company', person: 'Natural Person', trust: 'Trust', unresolved: 'Unresolved Organisation' };
function section(title, rows, empty) {
  return `<h4>${title}<span class="n">${rows.length || ''}</span></h4>` +
    (rows.length ? `<table>${rows.join('')}</table>` : `<div class="empty">${empty}</div>`);
}
function holdingRow(e, other) {
  const s = e.raw;
  const cls = (s.holdings || []).map((h) => `${h.share_class}${h.class_percent != null ? ` ${fmtPct(h.class_percent)}` : ''}`).join(', ');
  const notes = [s.joint_holding && 'joint', s.beneficially_owned === false && 'non-beneficial', e.ceased && 'former']
    .filter(Boolean).join(', ');
  return `<tr class="${e.ceased ? 'ceased' : ''}"><td>${link(other)}${notes ? ` <span class="note">(${notes})</span>` : ''}</td>` +
    `<td class="cls">${esc(cls)}</td><td class="num">${fmtPct(e.percent)}</td></tr>`;
}
function renderPanel(n) {
  const r = n.raw;
  const fields = [];
  const f = (k, v) => { if (v != null && v !== '' && !(Array.isArray(v) && !v.length)) fields.push(`<dt>${k}</dt><dd>${esc(Array.isArray(v) ? v.join('; ') : v)}</dd>`); };
  if (n.kind === 'company') {
    f('ACN', fmtACN(r.acn)); f('ABN', fmtABN(r.abn)); f('Type', r.company_type);
    f('Status', [r.status, r.status_since && `since ${fmtDate(r.status_since)}`].filter(Boolean).join(', '));
    f('Registered', fmtDate(r.registration_date)); f('Jurisdiction', [r.state, r.country].filter(Boolean).join(', '));
    f('Former names', r.previous_names);
  } else if (n.kind === 'person') {
    f('Born', [fmtDate(r.birth_date), r.birth_place].filter(Boolean).join(', '));
    if (n.ubo) f('Beneficial owner', `${fmtPct(r.ubo_ownership)} ultimate`);
  } else if (n.kind === 'trust') {
    f('Trust type', r.trust_type); f('Established', fmtDate(r.established_date)); f('Jurisdiction', r.jurisdiction);
  } else {
    f('Status', 'Not matched to a register');
  }
  f('Key', n.key);

  const inc = (kind, dir) => n.edges.filter((e) => e.kind === kind && (dir === 'in' ? e.b === n : e.a === n))
    .sort((a, b) => (a.ceased - b.ceased) || ((b.percent || 0) - (a.percent || 0)));
  const owners = inc('share', 'in').map((e) => holdingRow(e, e.a));
  const owns = inc('share', 'out').map((e) => holdingRow(e, e.b));
  const offices = (n.kind === 'person' ? inc('officer', 'out') : inc('officer', 'in')).map((e) => {
    const o = e.raw, other = n.kind === 'person' ? e.b : e.a;
    const when = o.ceased ? `${year(o.appointed)}–${year(o.ceased)}` : `since ${year(o.appointed)}`;
    return `<tr class="${e.ceased ? 'ceased' : ''}"><td>${link(other)}</td><td class="cls">${esc(OFFICER_ABBR[o.role] || o.role || '')}</td><td class="num note">${when}</td></tr>`;
  });
  const trustRows = (n.kind === 'trust' ? inc('trust', 'in') : inc('trust', 'out')).map((e) => {
    const t = e.raw, other = n.kind === 'trust' ? e.a : e.b;
    const when = t.ceased ? `${year(t.appointed)}–${year(t.ceased)}` : `since ${year(t.appointed)}`;
    return `<tr class="${e.ceased ? 'ceased' : ''}"><td>${link(other)}</td><td class="cls">${esc(trustRoleLabel(t.role))}</td><td class="num note">${when}</td></tr>`;
  });

  panelBody.innerHTML = `
    <div class="kind">${KIND_LABEL[n.kind]}${n.isTarget ? ' · Subject of Inquiry' : ''}</div>
    <h2 class="${n.flagged ? 'flagged' : ''}">${esc(n.name)}</h2>
    ${n.flagged ? '<div class="flag">Flagged for attention</div>' : ''}
    <dl>${fields.join('')}</dl>
    ${section('Owners', owners, 'No recorded shareholders.')}
    ${section('Holdings', owns, 'Holds no recorded shares.')}
    ${section(n.kind === 'person' ? 'Offices Held' : 'Officers', offices, n.kind === 'person' ? 'Holds no recorded offices.' : 'No recorded officeholders.')}
    ${section(n.kind === 'trust' ? 'Parties to the Trust' : 'Trust Roles', trustRows, 'None recorded.')}`;
}
panelBody.addEventListener('click', (ev) => {
  const a = ev.target.closest('a[data-key]');
  if (a) select(graph.nodes.get(a.dataset.key));
});
document.getElementById('panel-close').addEventListener('click', deselect);
addEventListener('keydown', (ev) => { if (ev.key === 'Escape') deselect(); });

// ---------------------------------------------------------------- controls
function setAutoRotate(on) {
  autoRotate = on;
  controls.autoRotate = on;
  document.querySelector('#rotate-toggle .state').textContent = on ? 'on' : 'off';
}
function applyTheme(name) {
  theme = THEMES[name];
  document.body.classList.toggle('astral', name === 'astral');
  document.querySelector('#theme-toggle .state').textContent = name === 'astral' ? 'Astral' : 'Parchment';
  scene.background = new THREE.Color(theme.bg);
  scene.fog.color.setHex(theme.bg);
  for (const m of themed) {
    m.color.setHex(theme[m.userData.role]);
    m.blending = theme.blending;
    m.needsUpdate = true;
  }
  groundMat.opacity = theme.ground;
  bloom.enabled = theme.bloom;
  stars.visible = name === 'astral';
  themeName = name;
}
document.getElementById('theme-toggle').addEventListener('click', () => applyTheme(themeName === 'astral' ? 'parchment' : 'astral'));
document.getElementById('ceased-toggle').addEventListener('click', () => {
  showCeased = !showCeased;
  document.querySelector('#ceased-toggle .state').textContent = showCeased ? 'shown' : 'hidden';
  refreshFocus();
});
document.getElementById('rotate-toggle').addEventListener('click', () => setAutoRotate(!autoRotate));
document.getElementById('reset-view').addEventListener('click', () => { deselect(); const h = homeView(); flyTo(h.pos, h.target, 1.8); });

// Title block
const tgt = graph.nodes.get(graph.target);
document.getElementById('subtitle').textContent = `concerning ${tgt.name}${tgt.raw.acn ? `, A.C.N. ${fmtACN(tgt.raw.acn)}` : ''}`;
const counts = { company: 0, person: 0, trust: 0, unresolved: 0 };
nodeList.forEach((n) => counts[n.kind]++);
document.getElementById('meta').textContent =
  `${counts.company} companies · ${counts.person} persons · ${counts.trust} trusts · ${counts.unresolved} unresolved · ${graph.edges.length} relations` +
  (loaded.source !== 'data.js' ? ' · (scratch data)' : '');

// ---------------------------------------------------------------- resize & loop
let viewShift = 0;
function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  bloom.setSize(innerWidth, innerHeight);
  applyViewShift();
}
function applyViewShift() {
  if (viewShift < 0.5) { camera.aspect = innerWidth / innerHeight; camera.clearViewOffset(); return; }
  // Shift the projection centre left so the selected seal is centred in the area not covered by the panel.
  camera.aspect = (innerWidth + viewShift) / innerHeight;
  camera.setViewOffset(innerWidth + viewShift, innerHeight, viewShift, 0, innerWidth, innerHeight);
}
addEventListener('resize', resize);

const clock = new THREE.Clock();
const _q = new THREE.Quaternion(), _e = new THREE.Euler();
function animate() {
  const rawDt = Math.min(clock.getDelta(), 0.5);
  const dt = Math.min(rawDt, 0.05);
  const time = clock.elapsedTime;

  const simmed = simAlpha > 0.002;
  if (simmed) {
    const steps = Math.max(1, Math.min(8, Math.round(rawDt * 60)));
    for (let i = 0; i < steps; i++) simTick();
    updateLayoutVisuals();
  }

  if (fly) {
    fly.t = Math.min(1, fly.t + rawDt / fly.dur);
    const k = ease(fly.t);
    camera.position.lerpVectors(fly.p0, fly.p1, k);
    controls.target.lerpVectors(fly.c0, fly.c1, k);
    if (fly.t >= 1) fly = null;
  }
  const shiftT = selected && innerWidth > 900 ? PANEL_W : 0;
  if (Math.abs(viewShift - shiftT) > 0.5) { viewShift += (shiftT - viewShift) * Math.min(1, dt * 5); applyViewShift(); }
  controls.update();
  // Fog tracks viewing distance so depth cueing works at any zoom.
  const camDist = camera.position.distanceTo(controls.target);
  scene.fog.near = camDist * theme.fogNear;
  scene.fog.far = camDist * theme.fogFar;

  // Seals: face the camera with a slow astrolabe wobble; ring and webs counter-rotate.
  const fade = Math.min(1, dt * 7);
  for (const n of nodeList) {
    const s = n.seal;
    _e.set(Math.sin(time * 0.31 + s.phase) * 0.16, Math.cos(time * 0.23 + s.phase) * 0.2, 0);
    s.group.quaternion.copy(camera.quaternion).multiply(_q.setFromEuler(_e));
    s.ring.rotation.z += s.spin * dt;
    for (const w of s.webs) w.obj.rotation.z += w.speed * dt;
    s.alpha += (s.alphaT - s.alpha) * fade;
    s.scale += (s.scaleT - s.scale) * fade;
    s.group.scale.setScalar(s.scale);
    if (s.core) {
      s.core.group.scale.setScalar(s.scale);
      s.state.hovered = n === hovered; s.state.selected = n === selected;
      s.core.update?.(dt, time, s.alpha, s.state);
    }
    for (const { m, base, gain } of s.mats) {
      const b = typeof base === 'number' ? base * (m.isLineBasicMaterial ? theme.webAlpha : 1) : base[themeName] ?? 1;
      m.opacity = b * s.alpha * (gain ? gain.value : 1);
    }
  }
  // Anchored edge ends follow their cores (the layout pass above already re-laid every edge while it runs).
  if (!simmed) {
    for (const e of anchoredEdges) {
      const a = coreAnchor(e.a, e, _ancA), b = coreAnchor(e.b, e, _ancB);
      if (a || b || e.vis.anchored) layEdge(e, a && _ancA, b && _ancB);
    }
  }
  for (const e of graph.edges) {
    const v = e.vis;
    v.alpha += (v.alphaT - v.alpha) * fade;
    for (const { m, base } of v.mats) m.opacity = Math.min(1, base * v.alpha);
    if (v.particles && v.particles.pts.visible) {
      const p = v.particles, arr = p.pts.geometry.attributes.position.array;
      const L = v.curve.getLength() * (v.t1 - v.t0);
      for (let i = 0; i < p.count; i++) {
        const u = (i / p.count + p.offset + (time * p.speed) / L) % 1;
        v.curve.getPoint(v.t0 + (v.t1 - v.t0) * u, _v);
        arr[i * 3] = _v.x; arr[i * 3 + 1] = _v.y; arr[i * 3 + 2] = _v.z;
      }
      p.pts.geometry.attributes.position.needsUpdate = true;
    }
  }
  if (halo.visible) {
    const n = halo.userData.node;
    halo.position.copy(n.seal.group.position);
    halo.quaternion.copy(camera.quaternion);
    halo.scale.setScalar(n.R * 1.16 * n.seal.scale);
    halo.rotation.z = 0;
    halo.children[0].rotateZ(dt * 0.25);
  }
  ground.rotation.z += dt * 0.006;

  composer.render();
  requestAnimationFrame(animate);
}

applyTheme('parchment');
refreshFocus();
animate();

// Hooks for headless verification / debugging.
window.__viz = {
  data: DATA, graph, camera,
  selectByKey: (k) => graph.nodes.has(k) && select(graph.nodes.get(k)),
  selectedKey: () => selected?.key ?? null,
  setTheme: applyTheme,
  setSeal: (name) => { sealRequested = name || null; return setSealMode(sealRequested); },
  seal: () => sealVariantName,
  memory: () => ({ ...renderer.info.memory, programs: renderer.info.programs?.length ?? 0, themed: themed.size,
    regMats: nodeList.reduce((a, n) => a + n.seal.mats.length, 0), hitMeshes: hitMeshes.length, sealRoot: sealRoot.children.length }),
  screenPosOf: (k) => {
    const n = graph.nodes.get(k);
    if (!n) return null;
    _v.copy(n.seal.group.position).project(camera);
    const rect = renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (_v.x + 1) / 2 * rect.width, y: rect.top + (1 - _v.y) / 2 * rect.height };
  },
};
