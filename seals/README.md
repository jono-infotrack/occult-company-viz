# Seal variants

Load with `?seal=<name>` (e.g. `http://localhost:8765/?seal=armillary`). This loads `seals/<name>.js`.

When a variant is active, main.js still draws the camera-facing label ring, which holds the ring text, ticks and caption, but leaves out the flat star webs and the ring's interior marks. The variant supplies a genuinely 3D core in their place. The core is not billboarded, so it can rotate freely in world space. The empty space inside the label ring is roughly 0.75 × `R`.

## Module contract

```js
export function build(n, api) {
  // n: graph node — { key, kind: 'company'|'person'|'trust'|'unresolved', name, raw, edges[],
  //                   isTarget, flagged, ubo, tier, pos (Vector3, live), R (seal radius) }
  //    edge: { kind: 'share'|'officer'|'trust', a, b (nodes; a = owner/officer/party), percent,
  //            ceased, trustee, raw (raw.holdings[] = { share_class, amount, class_percent, fully_paid }) }
  // api: { THREE, graph, role ('ink'|'red'), R, renderer, camera,
  //        reg(mat, baseOpacity)    -> registers for hover/focus fading (set mat.transparent = true)
  //        themedMat(role, mat)     -> colour + blending follow the theme ('ink','soft','red','blue','ochre')
  //        canvasTexture, makeTextCanvas, starChords, hypotrochoid,
  //        theme()      -> current theme object (bg, ink, ... hex; webAlpha; blending)
  //        themeName()  -> 'parchment' | 'astral'   (call only from update(), not during build)
  //      }
  return {
    object,                          // THREE.Object3D, centred on the origin
    update(dt, time, alpha) {},      // optional, called every frame; alpha = current fade (0..1)
  };
}
```

Wrap a material as `api.reg(api.themedMat(api.role, mat), base)`. The main loop then sets `opacity = base × fade` every frame, and the material picks up theme colour and blending changes automatically. Custom shaders have to handle the theme themselves: read `api.theme()` inside `update()`.
