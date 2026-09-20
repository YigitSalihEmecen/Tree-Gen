# TreeGen

Procedural 3D tree generation in the browser. Every vertex, every bark texture, every leaf
and every patch of moss is computed from a seed and a parameter set — there is not a single
image or model file behind any of it. Export the result as **GLB**, **OBJ** or **STL**.

```bash
git clone git@github.com:YigitSalihEmecen/Tree-Gen.git
cd Tree-Gen
npm start          # → http://localhost:8787
```

That is `python3 -m http.server`. There is no build step and no bundler — three.js loads
from a CDN through an import map. Any static server will do.

---

## What's in it

- **16 species presets**, from a quaking aspen to a saguaro cactus. Four of them are the
  parameter sets published in Weber & Penn's 1995 paper; the rest are hand-tuned in the same
  model.
- **Two generators.** A recursive parametric model, and a space-colonization model that grows
  a crown by competing for space. Any species can be switched between them.
- **~60 live controls** — trunk taper and flare, per-level branching, crown envelope,
  foliage, bark and epiphytes — all regenerating as you drag.
- **31 leaf shapes** with five venation patterns, **12 bark styles**, four seasons, two themes.
- **Moss, lichen and bracket fungi** — six moss forms and four fungus forms, placed by where
  they would actually take hold rather than scattered.
- **Experimental forms** (off by default): trunks that run horizontally for a stretch before
  elbowing back toward the light, throw sharp kinks, dive, or corkscrew.
- **Randomise** rolls an entirely new tree — growth habit, structure, foliage, bark, epiphytes.
- The URL always carries the tree you are looking at. Copy it to share the exact same tree.

## Controls

| Panel | What it does |
|---|---|
| **Species** | 16 presets. Picking one replaces everything below. |
| **Form** | Model, seed, height, crown shape, bare trunk, recursion levels, detail budget, experimental forms. |
| **Trunk** | Thickness, taper mode, root flare, cross-section lobes, curve and S-curve, splits. |
| **Branches** | Per level: count, relative length, down angle and spread, spiral angle, curve, splits, taper. |
| **Crown shaping** | Vertical attraction and the pruning envelope. |
| **Foliage** | Season, leaf shape, count, size, width, light-facing, colours. |
| **Moss & fungus** | Form, coverage, how high it climbs, which compass side is damp, size, colours. |
| **Bark** | Style, relief, markings, three colours. |

**Exports:** GLB (geometry plus the generated textures — opens in Blender, Unity, Unreal),
OBJ, STL for printing, PNG of the viewport, JSON of the parameter set.

## How it works

**Structure.** The parametric model treats a tree as a recursion of *stems*. Each stem is a
chain of segments rotated by a curvature angle; stems split into clones along their length
and spawn children whose length follows a crown-shape function. Radii come from a length
ratio raised to a falloff power, tapered by one of four continuously blended modes — cylinder,
cone, spherical tip, or periodic, which is what gives cacti their segmented stems. A flare
equation swells the root buttress and an optional envelope prunes the crown to a silhouette.
The space-colonization model instead seeds the crown with attraction points and lets buds
compete for them, which produces the asymmetric canopies pure recursion cannot.

**Mesh.** Branch centrelines are smoothed with a Catmull–Rom spline and swept as generalized
cylinders using parallel-transport frames, so the cross-section never twists. Every stem is a
closed solid, wound outward, planted flat on the ground, and welded to its parent with a
swelling branch collar. Leaves are real polygons — cupped across their width and arched along
their length — merged into one buffer, so a 30,000-leaf canopy is a single draw call.

**Texture.** Bark is tileable anisotropic value-noise fBm drawn to a canvas and turned into
colour, a Sobel-derived normal map and a roughness map. Leaf venation is drawn. The sky is a
gradient run through a prefiltered environment map so the PBR materials have something to
reflect.

**Epiphytes.** Moss wants the shaded side of a trunk, its lower stretch, the upper surfaces of
near-horizontal limbs and thick wood over twigs; bracket fungi want vertical wood, sideways
faces and the lower trunk, and they stack in short vertical flights. Every candidate site is
scored, the best ones are used first, and flat forms are bent around the branch before being
placed.

## Layout

```
index.html        shell, import map, about dialog
styles.css        two themes, custom controls, responsive
src/tree.js       both generators — pure JS, no DOM, no three.js
src/species.js    16 parameter sets, palettes, the random-tree roller
src/geometry.js   skeleton → BufferGeometry
src/materials.js  canvas-drawn bark, leaf and sky textures
src/growth.js     moss, lichen and fungus forms + scored placement
src/app.js        viewport, controls, exporters
test/             node test suites
```

`src/tree.js` has no three.js dependency, which is why the generator can be tested headlessly.

```bash
npm install        # only needed for the tests
npm test           # 24 checks
```

They cover determinism, finite geometry, the envelope maths, outward winding, watertightness,
flat ground contact, triangle and branch budgets, all 16 species, all 31 leaf shapes, all 10
epiphyte forms, and 120 randomly rolled trees.

## Known limits

- `nCurveV < 0` (helical stems, for some palms and vines) is not implemented.
- Wind is a vertex-shader approximation and is not written into the shadow pass.
- Stems are welded visually, not topologically: a tree is a union of overlapping closed
  solids rather than one manifold shell. That renders and slices correctly, but a boolean
  union would be needed to make it a single continuous surface.
- Branch and leaf counts are capped and thinned evenly per level, so a dense parameter set
  degrades instead of truncating half the crown. Raise **Detail** to push past the defaults.

---

## Credits

Created by **Yigit Salih Emecen**. Built with [three.js](https://threejs.org). MIT licensed.

## References

The two models implemented here, and the work they draw on:

1. **Jason Weber and Joseph Penn.** "Creation and Rendering of Realistic Trees."
   *SIGGRAPH '95*, pp. 119–128.
   [ACM DL](https://dl.acm.org/doi/10.1145/218380.218427) ·
   [PDF](https://courses.cs.duke.edu/cps124/fall01/resources/p119-weber.pdf)
   — the parametric model, its shape functions, taper modes, flare, lobing and pruning
   envelope, and the four transcribed species presets.

2. **Adam Runions, Brendan Lane and Przemyslaw Prusinkiewicz.** "Modeling Trees with a Space
   Colonization Algorithm." *Eurographics Workshop on Natural Phenomena*, 2007.
   [PDF](https://algorithmicbotany.org/papers/colonization.egwnp2007.large.pdf)
   — the competitive crown-filling model.

3. **Aristid Lindenmayer.** "Mathematical models for cellular interaction in development."
   *Journal of Theoretical Biology* 18(3), 1968 — the original L-system.

4. **Przemyslaw Prusinkiewicz and Aristid Lindenmayer.** *The Algorithmic Beauty of Plants.*
   Springer, 1990. [Free online](http://algorithmicbotany.org/papers/#abop)

5. **Masaki Aono and Tosiyasu L. Kunii.** "Botanical Tree Image Generation."
   *IEEE Computer Graphics and Applications* 4(5), 1984 — branching and divergence angles,
   and the Schimper–Braun law behind the 137.5° phyllotactic spiral used here.

6. **Philippe de Reffye, Claude Edelin, Jean Françon, Marc Jaeger and Claude Puech.** "Plant
   models faithful to botanical structure and development." *SIGGRAPH '88*, pp. 151–158.

7. **Leonardo da Vinci's rule** and **Murray's law** — the pipe-model exponent that sets how
   branch radius divides at a fork, used by the space-colonization model.
