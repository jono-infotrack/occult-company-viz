# Seal variants

Load a variant with `?seal=<name>` (e.g. `http://localhost:8765/?seal=armillary`), which loads `seals/<name>.js`. The **Seal** toolbar button cycles Flat → Armillary → String-art → Cap-table → Hybrid in place, without a reload. Camera, selection, theme and the other toggles are kept, and the URL's `seal` parameter is updated (`history.replaceState`), so the address bar is always a working deep link. Any other `seal=<name>` still loads `seals/<name>.js`, and the next click goes to Flat.

When a variant is active, main.js still draws the camera-facing label ring, which holds the ring text, ticks and caption, but leaves out the flat star webs and the ring's interior marks. The variant supplies a genuinely 3D core in their place. The core is not billboarded, so it can rotate freely in world space. The empty space inside the label ring is roughly 0.75 × `R`.

| Variant | What the core shows |
| --- | --- |
| `armillary` | Armillary sphere: the polar rod points at the controlling party and its finial marks a majority; one ring per owner. |
| `stringart` | Woven thread spheres with a star-polyhedron heart. Reads best at overview. |
| `captable` | True-area cap-table globe: one lune per shareholder, share classes as latitude bands. Ownership edges land on their owner's lune. |
| `hybrid` | String-art everywhere, plus the armillary rod and finial on companies with a controller. A selected company's weave gives way to its cap-table globe, turned so its largest lune faces the camera. |

## Module contract

```js
export function build(n, api) {
  // n: graph node — { key, kind: 'company'|'person'|'trust'|'unresolved', name, raw, edges[],
  //                   isTarget, flagged, ubo, tier, pos (Vector3, live), R (seal radius) }
  //    edge: { kind: 'share'|'officer'|'trust', a, b (nodes; a = owner/officer/party), percent,
  //            ceased, trustee, raw (raw.holdings[] = { share_class, amount, class_percent, fully_paid }) }
  // api: { THREE, graph, role ('ink'|'red'), R, renderer, camera,
  //        reg(mat, base, gain?)  -> registers for hover/focus fading (set mat.transparent = true); see below
  //        themedMat(role, mat)   -> colour + blending follow the theme ('ink','soft','red','blue','ochre')
  //        canvasTexture, makeTextCanvas, starChords, hypotrochoid,
  //        theme()      -> current theme object (bg, ink, ... hex; webAlpha; blending)
  //        themeName()  -> 'parchment' | 'astral'
  //        hovered(), selected() -> the hovered / selected graph node, or null
  //        approach(e, out) -> unit Vector3 (world axes) from n's centre towards where edge e (touching n)
  //                            comes in from; false if unknown. Depends only on node positions.
  //        dispose(object3D) -> frees geometries, materials and textures under it, unregisters its
  //                             materials (reg and themedMat), and removes it from its parent
  //      }
  return {
    object,                                  // THREE.Object3D, centred on the origin
    update(dt, time, alpha, state) {},       // optional, called every frame; alpha = current fade (0..1);
                                             //   state = { hovered, selected } booleans for this node
    anchor(e, out) {},                       // optional: land edge e here (see below)
    dispose() {},                            // optional: free anything not under `object`
  };
}
```

### Materials and opacity

Wrap a material as `api.reg(api.themedMat(api.role, mat), base)`. Every frame main.js sets `mat.opacity = base × fade × gain`, and `themedMat` keeps colour and blending in step with the theme (including for materials made after start-up).

- `base` is a number, or a per-theme object such as `{ parchment: 0.8, astral: 0.45 }`. A number is multiplied by the theme's `webAlpha` (0.7 in Astral) on `LineBasicMaterial`s, as the flat webs are. A per-theme object is used exactly as given, so faint lines can be set to different strengths on parchment and under Astral's additive bloom.
- `gain` is an optional `{ value }` (like a uniform) that also multiplies the opacity. It lets a variant fade one part of its core independently, e.g. a crossfade. hybrid.js passes its parts a wrapped `api` whose `reg` adds a gain.

Custom shaders have to handle the theme themselves: read `api.theme()` inside `update()`. In any shader, clamp the bases of `pow`/`sqrt`/`log` and guard `normalize` of a possibly zero vector. Real GPUs return NaN there, bloom (Astral) smears a NaN into a black block, and headless SwiftShader hides it.

### Edge anchors

By default an edge ends just outside the seal's label ring. If the core returns `anchor(e, out)`, main.js asks it, every frame, for every edge with an end at `n`. To land that end on the core, write the point into `out` as an offset from `n.pos` in world axes and seal units (as `R`; main.js applies the hover scale) and return `true`. Return `false` to keep the default. The edge is then drawn all the way to that point, with a shareholding's arrow tip touching it. Use `api.approach(e, …)` for the direction the edge comes from (it never feeds back from the anchor). captable.js lands each live shareholding and trust role on its holder's cell. hybrid.js slides edges from the default point onto the cell while its globe fades in.

### Lifecycle

`build` is called once per node when the mode is entered, and again on every swap back to it. On leaving, main.js calls `dispose()` (if given), then disposes of everything under `object` and unregisters its materials. Module-level caches shared across seals (e.g. armillary's geometry cache, string-art's pin texture) are disposed of too and re-uploaded by three.js on next use, so they need no special handling. A core that builds parts lazily should free them with `api.dispose(part)`, as hybrid.js does with its cap-table globe on deselection.

### Shared internals

hybrid.js composes the other three variants rather than copying them:

- `armillary.js` exports `controlOf(n)` (owners, controllers, majority), `armMaterials(api, n, r)` (the back-half-fading material factory `M` and its uniforms `U`), and `controlRod(api, n, ctl, M, { r, tip, tail, collars })`, which returns `{ frame, aim(dt, time) }`.
- `captable.js` exports `buildGlobe(n, api, { face: 'owners' | 'camera', axis })`.
- `stringart.js` is used through its ordinary `build`.
