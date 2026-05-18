# @yohawing/three-mmd-loader

A TypeScript library for loading and playing back MMD models and motions on Three.js.

Japanese: [README.ja.md](./README.ja.md) / Roadmap: [ROADMAP.md](./ROADMAP.md)

## Demo

<!-- TODO: replace with YouTube link -->
[![Demo video](demo-thumbnail.png)](https://www.youtube.com/)

## Compatibility Matrix

### Formats

| Format | Parse | Runtime apply |
| --- | --- | --- |
| PMX (model) | ✅ | ✅ |
| PMD (model) | ✅ | ✅ |
| VMD (motion) | ✅ | ✅ (linear interpolation) |
| VPD (pose) | ✅ | ✅ |
| PMM (project) | ❌ | ❌ |
| .x / .vac (accessory) | ❌ | ❌ |

### Features

| Feature | Status |
| --- | --- |
| SkinnedMesh / materials / textures | ✅ |
| Toon / sphere textures | ✅ |
| Bone / morph animation | ✅ |
| VMD Bezier interpolation | ⚠️ Parsed / applied as linear |
| CCD IK (model-defined chains) | ✅ |
| IK link-local / parent-local clamp | ⚠️ Foundational only |
| Append transform | ⚠️ Metadata wired / evaluation order in progress |
| Physics (Ammo backend) | ✅ Isolated behind boundary |
| Physics (disabled fallback) | ✅ |
| Camera motion application | ❌ |
| Three.js visual regression gates | ❌ Not built yet |

## Verified Assets

Loading and playback verified on the following assets:

- PMD models: 5
- PMX models: 5
- VMD motions: 15
- Unit-test fixtures: 7 PMX / 3 VMD

## Out Of Scope (Initial Release)

- Non-Three.js renderer adapters
- Cross-renderer visual equivalence claims
- Optimized custom model / motion formats
- WebGPU renderer path
- A separately published physics package
- PMM project loading
- Native-equivalent MMD physics behavior

## Acknowledgements

This project was developed with reference to:

- [Babylon-MMD](https://github.com/noname0310/babylon-mmd)
- [nanoem](https://github.com/hkrn/nanoem)

---

## Install

```powershell
npm install @yohawing/three-mmd-loader three
```

`three` is a peer dependency.

Publish readiness note: the package is still private in this workspace. The
version and final `private: true` removal remain release decisions.

## Package Boundaries

```text
@yohawing/three-mmd-loader
@yohawing/three-mmd-loader/parser
@yohawing/three-mmd-loader/runtime
@yohawing/three-mmd-loader/three
@yohawing/three-mmd-loader/physics
```

- `parser`: PMX, PMD, VMD, and VPD binary/text parsing.
- `runtime`: Three.js animation playback, frame state, append transform metadata
  handling, and CCD IK evaluation.
- `three`: `ThreeMmdLoader`, Three.js geometry/skeleton/material helpers,
  texture helpers, and animation clip generation.
- `physics`: `MmdPhysicsBackend`, disabled fallback backend, validation/debug
  helpers, and optional Ammo backend implementation.

## Visual Regression Renderer

`npm run render:visual` writes deterministic material case PNGs to
`test-results/visual/cases/`. The renderer uses a 512x512 canvas with
`pixelRatio=1`, an orthographic camera, fixed ambient and directional lights,
fixed background, `NoToneMapping`, and `SRGBColorSpace`. It does not load
external assets or `MMD_VIEWER_DATA_ROOT`.

## Usage - Model Loading

```ts
import { ThreeMmdLoader } from "@yohawing/three-mmd-loader";

const loader = new ThreeMmdLoader();
const { mesh } = await loader.loadModel(source); // Uint8Array | ArrayBuffer | File
scene.add(mesh);
```

## Usage - Animation

```ts
const { animation, clip } = await loader.loadAnimation(vmdSource);

// Or pass a model to receive a clip resolved against the model bones.
const { clip } = await loader.loadAnimation(vmdSource, model);
model.runtime?.setAnimation(clip, model.mesh);

// Per frame.
model.runtime?.evaluate(deltaSeconds);
```

## Usage - Pose (VPD)

```ts
const { pose } = await loader.loadPose(vpdSource);
const { clip } = await loader.loadPoseAnimation(vpdSource, "myPose", model);
```

## Usage - Physics

Physics is exposed behind the `MmdPhysicsBackend` boundary. The disabled backend
is the predictable no-simulation fallback, while the Ammo backend is available
for callers that opt into Ammo.js.

```ts
import {
  createAmmoMmdPhysicsBackend,
  createDisabledMmdPhysicsBackend
} from "@yohawing/three-mmd-loader/physics";

// No simulation fallback.
const disabledPhysicsBackend = createDisabledMmdPhysicsBackend();

// Ammo.js backend.
const Ammo = await import("ammo.js").then((m) => m.default ?? m);
const physicsBackend = createAmmoMmdPhysicsBackend(Ammo);
```
