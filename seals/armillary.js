// Armillary-sphere seal core.
//
// Each entity is drawn as a small armillary sphere: nested great-circle rings,
// each turning on its own pivot, around a polyhedral core.
//
// What it encodes
//   Polar axis (rod)   points at the controlling party: the largest live shareholder
//                      (a trust's trustee). Ties point at the bisector of the tied owners.
//                      Natural persons answer to nobody, so their axis stands vertical.
//   Finial at the pole solid ball = majority (> 50 %), open ring = largest but not a
//                      majority, or joint control.
//   Owner rings        one ring per live shareholder (per party, for trusts), nested largest
//                      outermost, each pivoting on the line towards that owner with a bead at
//                      the pivot. The solid arc starts at the bead and runs for the owner's
//                      stake: a majority arc wraps past the small bead at the far pole.
//                      Trust rings are blue for trustees (full arc: legal title) and ochre
//                      hairlines for other parties, matching the edge colours.
//   Equator            graduated band at right angles to the axis, studded with one hollow
//                      mark per current officeholder (5 for persons, 6 for trusts, as in 2D).
//   Core               company: stellated dodecahedron, spikier the more it owns.
//                      target: great stellated form around a counter-turning inner star.
//                      trust: stella octangula (a 3D hexagram). Unit adds a cube, SMSF an
//                      octahedron, bare is a single tetrahedron.
//                      person: pentagonal bipyramid with a pentagram girdle.
//                      unresolved: stippled sphere, dashed rings, no axis, tumbling.
//   Flagged            drawn in red (api.role), and the axis nutates: the sphere is out of true.
//   Rear halves of every ring are drawn faint (engraver's convention), which resolves the
//   front/back ambiguity of wire spheres.

const PHI = (1 + Math.sqrt(5)) / 2;
const ZODIAC = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'].map((g) => g + '︎');
const cache = new Map();
const cached = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };

// ---------------------------------------------------------------- deterministic randomness
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- back-half fade (shared program)
// Fragments farther from the camera than the sphere's centre are drawn faint.
function armBackFade(shader) {
  const U = this.userData.armU;
  shader.uniforms.uArmCentre = U.centre;
  shader.uniforms.uArmR = U.radius;
  shader.uniforms.uArmBack = U.back;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nuniform vec3 uArmCentre;\nuniform float uArmR;\nuniform float uArmBack;\nvarying float vArmFade;')
    .replace('#include <project_vertex>', `#include <project_vertex>
  {
    vec4 armC = viewMatrix * vec4(uArmCentre, 1.0);
    vArmFade = mix(1.0, uArmBack, smoothstep(-0.25 * uArmR, 0.45 * uArmR, armC.z - mvPosition.z));
  }`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vArmFade;')
    .replace('#include <opaque_fragment>', 'diffuseColor.a *= vArmFade;\n#include <opaque_fragment>');
}

// ---------------------------------------------------------------- polyhedra (unit circumradius)
const norm = ([x, y, z]) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function icosaVerts() {
  const v = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) v.push([0, a, b * PHI], [a, b * PHI, 0], [b * PHI, 0, a]);
  return v.map(norm);
}
function dodecaVerts() {
  const q = 1 / PHI, v = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    for (const c of [-1, 1]) v.push([a, b, c]);
    v.push([0, a * q, b * PHI], [a * q, b * PHI, 0], [b * PHI, 0, a * q]);
  }
  return v.map(norm);
}
// Pairs of vertices in the rank-th distance class (0 = nearest neighbours = polyhedron edges).
function edgesByRank(verts, rank) {
  const ds = [];
  for (let i = 0; i < verts.length; i++) for (let j = i + 1; j < verts.length; j++) ds.push(dist3(verts[i], verts[j]));
  const classes = [...new Set(ds.map((d) => d.toFixed(4)))].map(Number).sort((a, b) => a - b);
  const want = classes[rank];
  const out = [];
  for (let i = 0; i < verts.length; i++) for (let j = i + 1; j < verts.length; j++) {
    if (Math.abs(dist3(verts[i], verts[j]) - want) < 1e-3) out.push([verts[i], verts[j]]);
  }
  return out;
}
const nearest = (dir, verts, k) => [...verts].sort((a, b) => dot3(b, dir) - dot3(a, dir)).slice(0, k);
const scaleV = (v, s) => [v[0] * s, v[1] * s, v[2] * s];
function segGeo(THREE, pairs) {
  const arr = [];
  for (const [a, b] of pairs) arr.push(...a, ...b);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  return g;
}
// Stellation as explicit spikes: apex over each face, joined to that face's k vertices.
function spikes(apexDirs, baseVerts, k, baseR, apexR) {
  const out = [];
  for (const a of apexDirs) for (const v of nearest(a, baseVerts, k)) out.push([scaleV(a, apexR), scaleV(v, baseR)]);
  return out;
}

// ---------------------------------------------------------------- canvases (white ink; tinted by material colour)
function canvas(S) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d');
  c.translate(S / 2, S / 2);
  c.strokeStyle = c.fillStyle = '#fff';
  return { cv, c };
}
function circ(c, r, lw) { c.beginPath(); c.lineWidth = lw; c.arc(0, 0, r, 0, Math.PI * 2); c.stroke(); }

// Equator: graduated band with hollow studs.
function drawDial(S, marks) {
  const { cv, c } = canvas(S);
  const Ro = S / 2 * 0.985, Ri = Ro * 0.86, u = S / 256, bw = Ro - Ri;
  circ(c, Ro, 1.6 * u);
  circ(c, Ri, 1.1 * u);
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2 - Math.PI / 2;
    const len = i % 18 === 0 ? 0.55 : i % 6 === 0 ? 0.36 : 0.2;
    c.beginPath(); c.lineWidth = (i % 18 === 0 ? 1.2 : 0.7) * u;
    c.moveTo(Math.cos(a) * Ri, Math.sin(a) * Ri);
    c.lineTo(Math.cos(a) * (Ri + bw * len), Math.sin(a) * (Ri + bw * len));
    c.stroke();
  }
  for (let i = 0; i < marks; i++) {
    const a = (i / marks) * Math.PI * 2 - Math.PI / 2, rm = Ri + bw * 0.5;
    const x = Math.cos(a) * rm, y = Math.sin(a) * rm, rr = bw * 0.36;
    c.save(); c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.arc(x, y, rr + 1.4 * u, 0, Math.PI * 2); c.fill(); c.restore();
    c.beginPath(); c.lineWidth = 1.2 * u; c.arc(x, y, rr, 0, Math.PI * 2); c.stroke();
  }
  return cv;
}
// Ecliptic band engraved with the zodiac (target only).
function drawZodiac(S) {
  const { cv, c } = canvas(S);
  const Ro = S / 2 * 0.985, Ri = Ro * 0.85, u = S / 256, bw = Ro - Ri;
  circ(c, Ro, 1.4 * u); circ(c, Ri, 1.0 * u);
  c.font = `${bw * 0.68}px Georgia, "Segoe UI Symbol", "Noto Sans Symbols", "DejaVu Sans", serif`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    c.beginPath(); c.lineWidth = 0.9 * u;
    c.moveTo(Math.cos(a) * Ri, Math.sin(a) * Ri); c.lineTo(Math.cos(a) * Ro, Math.sin(a) * Ro); c.stroke();
    for (let j = 1; j < 6; j++) {
      const b = a + (j / 6) * (Math.PI / 6);
      c.beginPath(); c.lineWidth = 0.6 * u;
      c.moveTo(Math.cos(b) * Ri, Math.sin(b) * Ri); c.lineTo(Math.cos(b) * (Ri + bw * 0.14), Math.sin(b) * (Ri + bw * 0.14)); c.stroke();
    }
    c.save(); c.rotate(a + Math.PI / 12 + Math.PI / 2); c.fillText(ZODIAC[i], 0, -(Ri + bw * 0.55)); c.restore();
  }
  return cv;
}
function drawDot(S) {
  const { cv, c } = canvas(S);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.55, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(-S / 2, -S / 2, S, S);
  return cv;
}

// ---------------------------------------------------------------- graph reading
function liveOwners(n) {
  return n.edges
    .filter((e) => e.kind === 'share' && e.b === n && !e.ceased && e.percent > 0 && e.a !== n)
    .map((e) => ({ node: e.a, pct: e.percent, role: 'ink' }))
    .sort((a, b) => b.pct - a.pct);
}
// Trust parties, one per distinct party; trustees first.
function trustParties(n) {
  const by = new Map();
  for (const e of n.edges) {
    if (e.kind !== 'trust' || e.b !== n || e.ceased) continue;
    const p = by.get(e.a) || { node: e.a, pct: 0, trustee: false };
    p.trustee = p.trustee || e.trustee;
    by.set(e.a, p);
  }
  return [...by.values()]
    .map((p) => ({ ...p, pct: p.trustee ? 70 : 30, role: p.trustee ? 'blue' : 'ochre' }))
    .sort((a, b) => b.trustee - a.trustee);
}
const holdingsCount = (n) => n.edges.filter((e) => e.kind === 'share' && e.a === n && !e.ceased).length;

// ---------------------------------------------------------------- build
export function build(n, api) {
  const { THREE } = api;
  const R = api.R;
  const r = R * 0.62;                   // sphere radius; label ring interior is ~0.75 R
  const rand = rng(hashStr(n.key));
  const flagged = !!n.flagged;
  const roleOf = (role) => (flagged ? 'red' : role);
  const astral = () => api.themeName() === 'astral';

  const root = new THREE.Group();
  const U = { centre: { value: new THREE.Vector3() }, radius: { value: r }, back: { value: 0.26 } };
  // Opacity is managed here rather than through api.reg, so each element can carry its own
  // Astral weight (additive blending + bloom would otherwise blow out the stacked rings).
  // Colour and blending still follow the theme via api.themedMat.
  const mats = [];
  const M = (Ctor, role, base, opts = {}, astralK = 0.75) => {
    const m = new Ctor({ transparent: true, depthWrite: false, ...opts });
    m.userData.armU = U;
    m.onBeforeCompile = armBackFade;
    api.themedMat(roleOf(role), m);
    mats.push({ m, base, astralK: astralK * (n.isTarget ? 0.75 : 1) });   // the target stacks many rings; keep its bloom in check
    return m;
  };

  const unitCircle = cached('circle', () => {
    const pts = [];
    for (let i = 0; i < 160; i++) { const a = (i / 160) * Math.PI * 2; pts.push(Math.cos(a), Math.sin(a), 0); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  });
  // Flat band in the XY plane; an arc starts at +Y (the pivot) and runs anticlockwise.
  const bandGeo = (inner, arc = 1) => cached(`band:${inner.toFixed(3)}:${arc.toFixed(4)}`,
    () => new THREE.RingGeometry(inner, 1, Math.max(6, Math.round(128 * arc)), 1, Math.PI / 2, Math.PI * 2 * arc));
  const ball = cached('ball', () => new THREE.SphereGeometry(1, 14, 10));
  const torus = cached('torus', () => new THREE.TorusGeometry(1, 0.22, 6, 24));
  const dotTex = cached('dotTex', () => api.canvasTexture(drawDot(32), api.renderer));

  // A ring: hairline loop at the outer edge (always visible, even edge-on) + optional flat band
  // covering `arc` of the circumference.
  function ring(radius, role, bandFrac, lineA, bandA, { dashed = false, arc = 1 } = {}) {
    const g = new THREE.Group();
    const loop = dashed
      ? new THREE.LineLoop(unitCircle, M(THREE.LineDashedMaterial, role, lineA, { dashSize: 0.09, gapSize: 0.07 }))
      : new THREE.LineLoop(unitCircle, M(THREE.LineBasicMaterial, role, lineA));
    if (dashed) loop.computeLineDistances();
    loop.scale.setScalar(radius);
    g.add(loop);
    if (bandFrac > 0 && arc > 0.002) {
      const band = new THREE.Mesh(bandGeo(1 - bandFrac, Math.min(1, arc)), M(THREE.MeshBasicMaterial, role, bandA, { side: THREE.DoubleSide }, 0.4));
      band.scale.setScalar(radius);
      g.add(band);
    }
    return g;
  }
  function texDisc(cv, radius, role, base, astralK = 0.55) {
    const m = M(THREE.MeshBasicMaterial, role, base, { map: api.canvasTexture(cv, api.renderer), side: THREE.DoubleSide }, astralK);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), m);
    return mesh;
  }

  // ---- who controls this entity?
  const isTrust = n.kind === 'trust', isPerson = n.kind === 'person', isUnresolved = n.kind === 'unresolved';
  const owners = isTrust ? trustParties(n) : isPerson || isUnresolved ? [] : liveOwners(n);
  let controllers = [], ctrlPct = 0;
  if (isTrust) {
    controllers = owners.filter((o) => o.node && owners[0].trustee && o.trustee).slice(0, 3);
    ctrlPct = controllers.length ? 100 : 0;
  } else if (owners.length) {
    ctrlPct = owners[0].pct;
    controllers = owners.filter((o) => Math.abs(o.pct - ctrlPct) < 0.01);
  }
  const majority = isTrust ? controllers.length === 1 : controllers.length === 1 && ctrlPct > 50;

  // ---- polar frame: local +Y is the polar axis
  const axisFrame = new THREE.Group();
  root.add(axisFrame);

  const spinners = [];   // { obj, speed } rotating about their local Y
  const sign = () => (rand() < 0.5 ? -1 : 1);

  if (!isUnresolved) {
    // Rod through the poles, with a finial at the controlling end.
    const tip = r * 1.18, tail = r * 1.06;
    const rodLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -tail, 0), new THREE.Vector3(0, tip, 0)]),
      M(THREE.LineBasicMaterial, 'ink', 0.95));
    axisFrame.add(rodLine);
    const rodR = Math.max(0.03, R * 0.014);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(rodR, rodR, tip + tail, 6, 1, true), M(THREE.MeshBasicMaterial, 'ink', 0.9));
    rod.position.y = (tip - tail) / 2;
    axisFrame.add(rod);

    const fr = Math.max(0.17, R * 0.072);
    const showFinial = !isPerson || n.ubo;
    if (showFinial) {
      if (majority || isPerson) {
        const k = new THREE.Mesh(ball, M(THREE.MeshBasicMaterial, 'ink', 1, {}, 0.9));
        k.scale.setScalar(fr);
        k.position.y = tip;
        axisFrame.add(k);
      } else if (controllers.length) {
        const k = new THREE.Mesh(torus, M(THREE.MeshBasicMaterial, 'ink', 1, {}, 0.9));
        k.scale.setScalar(fr * 1.05);
        k.rotation.x = Math.PI / 2;
        k.position.y = tip;
        axisFrame.add(k);
      }
    }
    // Small collar where the rod leaves the sphere at each pole.
    for (const y of [r * 1.0, -r * 1.0]) {
      const c = new THREE.Mesh(torus, M(THREE.MeshBasicMaterial, 'ink', 0.8, {}, 0.6));
      c.scale.setScalar(rodR * 2.4);
      c.rotation.x = Math.PI / 2;
      c.position.y = y;
      axisFrame.add(c);
    }

    // Equator (turns slowly about the polar axis), one stud per current officeholder.
    const S = n.isTarget ? 1024 : n.kind === 'company' ? 512 : 256;
    const officers = n.edges.filter((e) => e.kind === 'officer' && e.b === n && !e.ceased).length;
    const marks = isPerson ? 5 : isTrust ? 6 : Math.min(12, officers);
    const dial = texDisc(drawDial(S, marks), r, 'ink', 0.8);
    dial.rotation.x = -Math.PI / 2;
    const dialSpin = new THREE.Group();
    dialSpin.add(dial);
    const dialEdge = new THREE.LineLoop(unitCircle, M(THREE.LineBasicMaterial, 'ink', 0.9));
    dialEdge.scale.setScalar(r);
    dialEdge.rotation.x = -Math.PI / 2;
    dialSpin.add(dialEdge);
    axisFrame.add(dialSpin);
    spinners.push({ obj: dialSpin, speed: (n.isTarget ? 0.05 : 0.09) * sign() });

    // Ecliptic: zodiac band on the target, a plain tilted ring on beneficial owners.
    if (n.isTarget || n.ubo) {
      const ecl = new THREE.Group();
      const tilt = new THREE.Group();
      tilt.rotation.x = THREE.MathUtils.degToRad(23.44);
      ecl.add(tilt);
      if (n.isTarget) {
        const z = texDisc(drawZodiac(1024), r * 0.965, 'ink', 0.85, 0.5);
        z.rotation.x = -Math.PI / 2;
        tilt.add(z);
        const e = new THREE.LineLoop(unitCircle, M(THREE.LineBasicMaterial, 'ink', 0.7));
        e.scale.setScalar(r * 0.965); e.rotation.x = -Math.PI / 2;
        tilt.add(e);
      } else {
        const e = ring(r * 0.86, 'ink', 0.05, 0.75, 0.55);
        e.rotation.x = -Math.PI / 2;
        tilt.add(e);
      }
      axisFrame.add(ecl);
      spinners.push({ obj: ecl, speed: -0.13 * sign() });
    }

    // A person has no owners, so carries a single plain meridian on its own vertical axis.
    if (isPerson || owners.length === 0) {
      const mer = new THREE.Group();
      mer.add(ring(r * 0.93, 'ink', 0.05, 0.85, 0.6));
      axisFrame.add(mer);
      spinners.push({ obj: mer, speed: 0.22 * sign() });
    }
  }

  // ---- owner rings: one per live owner / trust party, pivoting on the line towards it
  const pivots = [];
  if (!isUnresolved && owners.length) {
    const count = owners.length;
    const step = Math.min(0.09, 0.44 / Math.max(1, count - 1));
    owners.forEach((o, i) => {
      const radius = r * (0.93 - i * step);
      const pivot = new THREE.Group();
      const spin = new THREE.Group();
      const share = Math.min(1, o.pct / 100);
      // Stake arc: shareholders by percent; a trustee holds the whole (legal title); other trust
      // parties have no recorded share, so are a bare hairline.
      const arc = isTrust ? (o.trustee ? 1 : 0) : share;
      spin.add(ring(radius, o.role, 0.095, 0.55 + 0.35 * share, 0.85, { arc }));
      spin.rotation.y = rand() * Math.PI * 2;
      pivot.add(spin);
      // Bead at the pivot facing the owner; a smaller one at the far pole marks the 50 % point.
      const beadR = Math.max(0.07, R * (0.02 + 0.028 * Math.sqrt(share)));
      const bead = new THREE.Mesh(ball, M(THREE.MeshBasicMaterial, o.role, 0.95, {}, 0.8));
      bead.scale.setScalar(beadR);
      bead.position.y = radius;
      pivot.add(bead);
      if (arc > 0 && arc < 1) {
        const anti = new THREE.Mesh(ball, M(THREE.MeshBasicMaterial, o.role, 0.6, {}, 0.6));
        anti.scale.setScalar(Math.max(0.05, R * 0.014));
        anti.position.y = -radius;
        pivot.add(anti);
      }
      root.add(pivot);
      const isCtrl = controllers.length === 1 && controllers[0] === o;
      pivots.push({ pivot, owner: o.node, isCtrl });
      spinners.push({ obj: spin, speed: (0.16 + rand() * 0.22) * sign() });
    });
  }

  // ---- unresolved: dashed rings tumbling on arbitrary axes, no pole
  const tumblers = [];
  if (isUnresolved) {
    for (let i = 0; i < 3; i++) {
      const pivot = new THREE.Group();
      pivot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize());
      const spin = new THREE.Group();
      spin.add(ring(r * (0.95 - i * 0.1), 'ink', 0, 0.85, 0, { dashed: true }));
      spin.rotation.y = rand() * Math.PI * 2;
      pivot.add(spin);
      root.add(pivot);
      spinners.push({ obj: spin, speed: (0.2 + rand() * 0.25) * sign() });
    }
    tumblers.push({ axis: new THREE.Vector3(rand() - 0.5, 1, rand() - 0.5).normalize(), speed: 0.12 });
  }

  // ---- core
  const core = new THREE.Group();
  const coreSpin = [];
  const lines = (pairs, role, base, scale = 1) => {
    const ls = new THREE.LineSegments(segGeo(THREE, pairs), M(THREE.LineBasicMaterial, role, base, {}, 0.5));
    ls.scale.setScalar(scale);
    return ls;
  };
  const ico = cached('ico', icosaVerts), dod = cached('dod', dodecaVerts);
  if (n.kind === 'company' && n.isTarget) {
    // Great stellated form: icosahedron with 20 triangular spikes, around a counter-turning small star.
    const outer = new THREE.Group();
    outer.add(lines(cached('ico-edges', () => edgesByRank(ico, 0)), 'ink', 0.55, r * 0.22));
    outer.add(lines(cached('gsd-spikes', () => spikes(dod, ico, 3, 1, 2.05)), 'ink', 0.9, r * 0.22));
    const inner = new THREE.Group();
    inner.add(lines(cached('dod-edges', () => edgesByRank(dod, 0)), 'ink', 0.5, r * 0.085));
    inner.add(lines(cached('ssd-spikes-2', () => spikes(ico, dod, 5, 1, 2.0)), 'ink', 0.85, r * 0.085));
    core.add(outer, inner);
    coreSpin.push({ obj: outer, speed: 0.12 }, { obj: inner, speed: -0.35 });
    const c = new THREE.Mesh(ball, M(THREE.MeshBasicMaterial, 'ink', 1, {}, 0.9));
    c.scale.setScalar(R * 0.018);
    core.add(c);
  } else if (n.kind === 'company') {
    // Stellated dodecahedron; spikes lengthen with the number of holdings it owns.
    const h = Math.min(4, holdingsCount(n));
    const apex = 1.25 + 0.3 * h;
    const s = r * 0.2;
    core.add(lines(cached('dod-edges', () => edgesByRank(dod, 0)), 'ink', 0.55, s));
    core.add(lines(cached(`ssd-spikes-${apex}`, () => spikes(ico, dod, 5, 1, apex)), 'ink', 0.9, s));
    coreSpin.push({ obj: core, speed: 0.25 * sign() });
  } else if (isTrust) {
    const s = r * 0.42;
    const cube = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) cube.push(norm([x, y, z]));
    const tA = cube.filter((v) => v[0] * v[1] * v[2] > 0), tB = cube.filter((v) => v[0] * v[1] * v[2] < 0);
    const allPairs = (vs) => { const o = []; for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) o.push([vs[i], vs[j]]); return o; };
    const type = (n.raw.trust_type || '').toLowerCase();
    core.add(lines(allPairs(tA), 'ink', 0.9, s));
    if (type !== 'bare') core.add(lines(allPairs(tB), 'ink', 0.9, s));
    if (type === 'unit') core.add(lines(edgesByRank(cube, 0), 'ink', 0.45, s));
    if (type === 'smsf') {
      const oct = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((v) => scaleV(v, 1 / Math.sqrt(3)));
      core.add(lines(edgesByRank(oct, 0), 'ink', 0.55, s));
    }
    // Orient a three-fold axis along the pole so the star reads as a hexagram from above.
    core.quaternion.setFromUnitVectors(new THREE.Vector3(1, 1, 1).normalize(), new THREE.Vector3(0, 1, 0));
    const holder = new THREE.Group();
    holder.add(core);
    coreSpin.push({ obj: holder, speed: 0.2 * sign() });
  } else if (isPerson) {
    // Pentagonal bipyramid with a pentagram girdle.
    const h = r * 0.42, rp = r * 0.3, P = [];
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; P.push([Math.cos(a) * rp, 0, Math.sin(a) * rp]); }
    const pairs = [];
    for (let i = 0; i < 5; i++) {
      pairs.push([P[i], P[(i + 1) % 5]], [P[i], [0, h, 0]], [P[i], [0, -h, 0]]);
    }
    const star = [];
    for (let i = 0; i < 5; i++) star.push([P[i], P[(i + 2) % 5]]);
    core.add(lines(pairs, 'ink', 0.8), lines(star, 'ink', 0.95));
    coreSpin.push({ obj: core, speed: 0.3 * sign() });
  } else {
    // Unresolved: a stippled sphere, the shape of something not yet identified.
    const N = 90, pts = [];
    for (let i = 0; i < N; i++) {
      const y = 1 - (i + 0.5) / N * 2, rad = Math.sqrt(1 - y * y), th = i * Math.PI * (3 - Math.sqrt(5));
      pts.push(Math.cos(th) * rad * r * 0.45, y * r * 0.45, Math.sin(th) * rad * r * 0.45);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const p = new THREE.Points(g, M(THREE.PointsMaterial, 'ink', 0.9, { size: Math.max(0.12, R * 0.06), map: dotTex, alphaTest: 0.02 }));
    core.add(p);
    coreSpin.push({ obj: core, speed: 0.15 });
  }
  if (isTrust) axisFrame.add(coreSpin[0].obj);
  else if (isUnresolved) root.add(core);
  else axisFrame.add(core);

  // ---- per-frame
  const Y = new THREE.Vector3(0, 1, 0);
  const _d = new THREE.Vector3(), _t = new THREE.Vector3(), _q = new THREE.Quaternion(), _w = new THREE.Quaternion();
  let first = true;
  const towards = (list, out) => {
    out.set(0, 0, 0);
    for (const o of list) {
      _t.subVectors(o.node.pos, n.pos);
      const l = _t.length();
      if (l > 1e-4) out.addScaledVector(_t, 1 / l);
    }
    if (out.lengthSq() < 1e-8) out.copy(Y);
    return out.normalize();
  };

  function update(dt, time, alpha) {
    U.centre.value.copy(n.pos);
    const k = first ? 1 : 1 - Math.exp(-dt * 3);

    if (!isUnresolved) {
      if (controllers.length) towards(controllers, _d); else _d.copy(Y);
      _q.setFromUnitVectors(Y, _d);
      if (flagged) {
        // Nutation: the pole wanders on a small cone around its true direction.
        _t.set(Math.cos(time * 0.9), 0, Math.sin(time * 0.9));
        _q.multiply(_w.setFromAxisAngle(_t, 0.24));
      }
      axisFrame.quaternion.slerp(_q, k);
      for (const p of pivots) {
        if (p.isCtrl) p.pivot.quaternion.copy(axisFrame.quaternion);
        else {
          towards([{ node: p.owner }], _d);
          _q.setFromUnitVectors(Y, _d);
          p.pivot.quaternion.slerp(_q, k);
        }
      }
    } else {
      for (const t of tumblers) root.quaternion.multiply(_w.setFromAxisAngle(t.axis, t.speed * dt));
    }
    for (const s of spinners) s.obj.rotation.y += s.speed * dt;
    for (const s of coreSpin) s.obj.rotation.y += s.speed * dt;

    const kA = astral();
    for (const e of mats) e.m.opacity = e.base * alpha * (kA ? e.astralK : 1);
    first = false;
  }

  return { object: root, update };
}
