// Hybrid seal (?seal=hybrid): progressive detail, composed from the other three variants.
//
//   Overview   every entity is its string-art sphere (seals/stringart.js), the weave that reads best
//              at a distance. Companies with a controlling shareholder add the armillary's polar rod
//              (seals/armillary.js) as a glanceable "who controls this": the rod points at the
//              controller, and its finial is a solid ball for a majority, an open ring for a plurality
//              or joint control.
//   Selected   a selected company's weave swells and dissolves while its cap-table globe
//              (seals/captable.js) grows in its place, turned so its largest lune faces the camera.
//              Incoming ownership edges slide onto their owners' lunes. The globe and its lettering
//              texture are built on selection, and disposed of once it has faded out after deselection.
import * as stringart from './stringart.js';
import { controlOf, armMaterials, controlRod } from './armillary.js';
import { buildGlobe } from './captable.js';

const FADE = 0.7;            // seconds for the weave <-> globe crossfade
const WEAVE_R = 0.72;        // string-art outer shell, as a fraction of R
const smooth = (t) => t * t * (3 - 2 * t);

export function build(n, api) {
  const { THREE } = api;
  const R = api.R;
  const object = new THREE.Group();
  // Wraps api.reg so a part's materials also take a fade of their own.
  const withGain = (gain) => ({ ...api, reg: (m, base) => api.reg(m, base, gain) });

  // ---- weave (all entities)
  const weaveGain = { value: 1 };
  const weave = stringart.build(n, withGain(weaveGain));
  object.add(weave.object);

  // ---- controller rod (companies with a controlling party)
  let rod = null;
  if (n.kind === 'company') {
    const ctl = controlOf(n);
    if (ctl.controllers.length) {
      const r = R * WEAVE_R;
      const { M, U } = armMaterials(api, n, r);
      rod = { ...controlRod(api, n, ctl, M, { r, tip: R * 0.84, tail: R * 0.78 }), U };
      object.add(rod.frame);
    }
  }

  // ---- cap-table globe (selected companies only; built lazily)
  const globeGain = { value: 0 };
  const globeHolder = new THREE.Group();
  object.add(globeHolder);
  let globe = null, show = 0;
  const dropGlobe = () => { api.dispose(globe.object); globe = null; };

  const _d = new THREE.Vector3();
  return {
    object,
    update(dt, time, alpha, state) {
      const want = n.kind === 'company' && !!state?.selected;
      if (want && !globe) {
        globe = buildGlobe(n, withGain(globeGain), { face: 'camera', axis: false });
        globeHolder.add(globe.object);
      }
      show = want ? Math.min(1, show + dt / FADE) : Math.max(0, show - dt / FADE);
      const k = smooth(show);

      weaveGain.value = 1 - k;
      weave.object.visible = k < 0.999;
      weave.object.scale.setScalar(1 + 0.2 * k);
      weave.update(dt, time, alpha, state);

      if (rod) { rod.U.centre.value.copy(n.pos); rod.aim(dt, time); }

      if (globe) {
        globeGain.value = k;
        globeHolder.scale.setScalar(0.55 + 0.45 * k);
        globe.update(dt, time, alpha * k, state);
        if (!want && show === 0) dropGlobe();
      }
    },
    // While the globe shows, incoming edges land on its lunes, sliding there from the point where
    // main.js would otherwise end them (just outside the label ring).
    anchor(e, out) {
      if (!globe || show === 0 || !globe.anchor(e, out)) return false;
      out.multiplyScalar(globeHolder.scale.x);
      const k = smooth(show);
      if (k < 1 && api.approach(e, _d)) out.lerp(_d.multiplyScalar(R * 1.04), 1 - k);
      return true;
    },
    dispose() { if (globe) dropGlobe(); },
  };
}
