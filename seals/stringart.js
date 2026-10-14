// String-art sphere seal: the 3D counterpart of the flat {n/k} chord webs.
// Pins are spread over nested spheres and joined by straight chords ("threads"), so every
// shell is a woven globe. Each kind of entity gets its own weave, and its core is the
// Kepler-Poinsot / stellated solid that corresponds to its flat star:
//   company     Fibonacci-sphere weave (density grows with connections); inner shell of rhumb-line
//               strands: one strand per shareholder (one twist) and per holding (counter-twist).
//   target      the richest: dense outer weave, counter-rotating strand shell, and a great stellated
//               dodecahedron {5/2,3} at the heart.
//   person      a cage of rhumb-line cords (one per connection, 3..8) around a small stellated
//               dodecahedron {5/2,5}, the 3D pentagram. Ultimate owners get a second, counter-wound cage.
//   trust       a hooped basket: latitude hoops (more with more parties) strung with both rulings of a
//               hyperboloid, {n/k} star caps by trust type (as in the flat seal), and a stella
//               octangula (the 3D hexagram) inside.
//   unresolved  a sparse, broken weave on faint pins that tumbles slowly.
// The star-solid cores keep their symmetry axis roughly toward the viewer (with a slow wobble) so
// they read as the flat seal's pentagram/hexagram; the woven shells are fixed in world space.
// Depth cueing: every thread fades with its depth inside its own sphere (patched LineBasicMaterial),
// so the far hemisphere reads as a faint ghost behind the near one.
import * as G from './stringart-geom.js';

const TILT = (23.44 * Math.PI) / 180; // obliquity of the ecliptic, for the astrolabe feel

// Depth-cue uniforms shared by every string-art material (values follow the theme in update()).
const CUE = {
  uSaFar: { value: 0.14 },  // alpha multiplier on the far side of a shell
  uSaPow: { value: 1.35 },  // falloff shape
  uSaGain: { value: 1 },    // global gain (lower in additive Astral to avoid blow-out)
};

function patchDepthCue(mat, lod = { value: 1 }) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, CUE, { uSaLod: lod });
    shader.vertexShader = 'attribute float aw;\nvarying float vSaDepth;\nvarying float vSaW;\n' +
      shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
        {
          // Depth of this vertex within its own sphere: 0 = far pole, 1 = near pole (view space).
          // The object is centred on the sphere and scaled to the shell radius.
          vec3 saC = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float saR = max(length(modelViewMatrix[0].xyz), 1e-5);
          // normalize() of a zero vector is NaN; guard the camera-at-centre case.
          vec3 saV = saC / max(length(saC), 1e-5);
          vSaDepth = 0.5 - 0.5 * dot(mvPosition.xyz - saC, saV) / saR;
          vSaW = aw;
        }`);
    // The clamps must be per fragment. A varying can leave the range of its vertex values: under
    // MSAA (the composer target has samples: 4) a line fragment is shaded at the pixel centre, which
    // may lie past the segment's end, so the value is extrapolated. Threads ending near a shell's far
    // pole (depth ~0) then give a slightly negative depth. GLSL pow() is undefined for a negative
    // base and returns NaN on desktop GPUs. With bloom on (Astral), UnrealBloomPass's blur mip chain
    // spreads one NaN texel into a large black rectangle. SwiftShader returns pow(|x|, y), so it hides this.
    shader.fragmentShader = 'uniform float uSaFar;\nuniform float uSaPow;\nuniform float uSaGain;\nuniform float uSaLod;\nvarying float vSaDepth;\nvarying float vSaW;\n' +
      shader.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );',
        `float saCue = mix(uSaFar, 1.0, pow(clamp(vSaDepth, 0.0, 1.0), uSaPow));
        vec4 diffuseColor = vec4( diffuse, clamp(opacity * max(vSaW, 0.0) * uSaGain * uSaLod * saCue, 0.0, 1.0) );`);
  };
  mat.customProgramCacheKey = () => 'stringart-depthcue-v2';
  return mat;
}

let dotTexture = null;
function pinTexture(api) {
  if (dotTexture) return dotTexture;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  c.fillStyle = '#fff';
  c.beginPath(); c.arc(32, 32, 26, 0, Math.PI * 2); c.fill();
  dotTexture = api.canvasTexture(cv, api.renderer);
  return dotTexture;
}

function hashKey(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ---------------------------------------------------------------- per-kind recipes
// Each shell: { s: G.Strings on the unit sphere, r: radius as a fraction of R, a: base alpha,
//               soft: use the secondary ink, spin: rad/s about the shell's pole, pins?: Float32Array,
//               lod?: alpha floor when the seal is small on screen (fine detail recedes at overview),
//               axis?: star-solid symmetry axis -> the core keeps that axis roughly toward the viewer,
//               wobbling and spinning about it, so its flat star stays legible while it reads as a solid }
function recipe(n, rand) {
  const deg = n.edges.length;
  const share = n.edges.filter((e) => e.kind === 'share');
  const owners = share.filter((e) => e.b === n);
  const holdings = share.filter((e) => e.a === n);

  if (n.kind === 'company' && n.isTarget) {
    const outer = G.fibWeave(Math.min(420, 240 + deg * 6), { families: 2 });
    return [
      { s: outer.s, pins: outer.pins, r: 0.72, a: 0.55, spin: 0.06 },
      { s: G.strandShell(owners, holdings, { turns: 0.6, delta: 0.015 }), r: 0.5, a: 0.9, spin: -0.11, lod: 0.35 },
      { ...G.greatStellatedDodecahedron(), r: 0.3, a: 0.95, spin: 0.16, pinSize: 1.4 },
    ];
  }
  if (n.kind === 'company') {
    const outer = G.fibWeave(Math.min(200, 70 + deg * 12), { families: 2 });
    return [
      { s: outer.s, pins: outer.pins, r: 0.72, a: 0.78, spin: 0.08 },
      { s: G.strandShell(owners, holdings, { turns: 0.6, plies: 1 }), r: 0.42, a: 0.85, spin: -0.15, lod: 0.35 },
    ];
  }
  if (n.kind === 'person') {
    const strands = Math.max(3, Math.min(8, deg));
    const outer = G.loxodromes(strands, { turns: 0.3, dir: 1, steps: 64, plies: 2 });
    if (n.ubo) G.loxodromes(strands, { turns: 0.3, dir: -1, steps: 64, phase: Math.PI / strands, into: outer, w: 0.8, plies: 2 });
    return [
      { s: outer, r: 0.7, a: 0.85, spin: 0.12 },
      { ...G.smallStellatedDodecahedron(), r: 0.36, a: 0.9, spin: -0.22, pinSize: 1.3 },
    ];
  }
  if (n.kind === 'trust') {
    const type = String(n.raw.trust_type || '').toLowerCase();
    const cap = type === 'unit' ? [4, 1] : type === 'smsf' ? [8, 3] : type === 'bare' ? [3, 1] : [12, 5];
    const rings = Math.max(3, Math.min(6, 2 + Math.ceil(deg / 2)));
    const outer = G.bandSphere(rings, 12, 1, cap);
    return [
      { s: outer.s, pins: outer.pins, r: 0.7, a: 0.7, spin: 0.09 },
      { ...G.stellaOctangula(), r: 0.33, a: 0.9, spin: -0.2, pinSize: 1.3 },
    ];
  }
  // unresolved
  const frag = G.brokenWeave(26, rand);
  return [{ s: frag.s, pins: frag.pins, pinW: frag.pinW, r: 0.66, a: 0.6, spin: 0.1, tumble: true }];
}

// ---------------------------------------------------------------- module entry
export function build(n, api) {
  const { THREE } = api;
  const R = api.R;
  const seed = hashKey(n.key);
  const rand = G.mulberry32(seed);
  const soft = api.role === 'red' ? 'red' : 'soft';

  const object = new THREE.Group();
  const tilt = new THREE.Group();          // fixed obliquity; the shells spin about its local pole (y)
  tilt.rotation.set(TILT, (seed % 360) * Math.PI / 180, 0, 'YXZ');
  object.add(tilt);

  const shells = recipe(n, rand).map((sh, i) => {
    const holder = new THREE.Group();       // per-shell spin
    holder.rotation.y = rand() * Math.PI * 2;
    if (sh.tumble) holder.rotation.x = rand() * Math.PI;
    (sh.axis ? object : tilt).add(holder);
    const align = sh.axis
      ? new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...sh.axis), new THREE.Vector3(0, 0, 1)) : null;

    const lod = { value: 1 };
    const mat = api.reg(api.themedMat(sh.soft ? soft : api.role,
      patchDepthCue(new THREE.LineBasicMaterial({ transparent: true, depthWrite: false }), lod)), sh.a);
    const lines = new THREE.LineSegments(sh.s.geometry(THREE), mat);
    lines.scale.setScalar(R * sh.r);
    lines.frustumCulled = false;
    lines.renderOrder = 2 + i;
    holder.add(lines);

    if (sh.pins) {
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.BufferAttribute(sh.pins, 3));
      pg.setAttribute('aw', new THREE.BufferAttribute(sh.pinW || new Float32Array(sh.pins.length / 3).fill(1), 1));
      const pm = api.reg(api.themedMat(api.role, patchDepthCue(new THREE.PointsMaterial({
        size: R * (n.isTarget ? 0.032 : 0.045) * (sh.pinSize || 1), map: pinTexture(api), transparent: true, depthWrite: false, alphaTest: 0.05,
      }))), 0.9);
      const pts = new THREE.Points(pg, pm);
      pts.scale.setScalar(R * sh.r);
      pts.frustumCulled = false;
      holder.add(pts);
    }
    return { holder, spin: sh.spin, tumble: sh.tumble, align, angle: rand() * Math.PI * 2, lod, lodFloor: sh.lod ?? 1 };
  });
  const phase = rand() * 10;
  const _q = new THREE.Quaternion(), _e = new THREE.Euler(), Z = new THREE.Vector3(0, 0, 1);

  let lastTheme = null;
  return {
    object,
    update(dt, time) {
      // Radius of the seal on screen, in CSS px: drives the level-of-detail fade of inner shells.
      const cam = api.camera;
      const px = (R * api.renderer.domElement.clientHeight) /
        (2 * Math.max(1e-3, cam.position.distanceTo(n.pos)) * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)));
      const near = Math.min(1, Math.max(0, (px - 45) / 75));
      for (const s of shells) {
        s.lod.value = s.lodFloor + (1 - s.lodFloor) * near * near * (3 - 2 * near);
        if (s.align) {
          // Face the viewer along the symmetry axis, with a slow precession that shows the solid's depth.
          s.angle += s.spin * dt;
          _e.set(Math.sin(time * 0.29 + phase) * 0.32, Math.cos(time * 0.21 + phase) * 0.4, 0);
          s.holder.quaternion.copy(api.camera.quaternion).multiply(_q.setFromEuler(_e))
            .multiply(_q.setFromAxisAngle(Z, s.angle)).multiply(s.align);
          continue;
        }
        s.holder.rotation.y += s.spin * dt;
        if (s.tumble) s.holder.rotation.x += s.spin * 0.45 * dt;
      }
      const t = api.themeName();
      if (t !== lastTheme) {
        lastTheme = t;
        const astral = t === 'astral';
        CUE.uSaFar.value = astral ? 0.1 : 0.14;
        CUE.uSaGain.value = astral ? 0.8 : 1;
      }
    },
  };
}
