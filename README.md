# @yohawing/three-mmd-loader

A TypeScript-first ESM library for loading and playing back MMD models and
motions on Three.js. It ships JavaScript runtime files with TypeScript
declarations.

Japanese: [docs/README.ja.md](./docs/README.ja.md) / Development: [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md)

## Compatibility Matrix

### Formats

| Format | Parse | Runtime apply |
| --- | --- | --- |
| PMX (model) | ✅ | ✅ |
| PMD (model) | ✅ | ✅ |
| VMD (motion) | ✅ | ✅ |
| VPD (pose) | ✅ | ✅ |
| PMM (project) | ❌ | ❌ |
| .x / .vac (accessory) | ❌ | ❌ |

### Features

| Feature | Status |
| --- | --- |
| SkinnedMesh / materials / textures | ✅ |
| Toon / sphere textures | ✅ |
| Bone / morph animation | ✅ |
| VMD Bezier interpolation | ✅ |
| CCD IK (model-defined chains) | ✅ |
| IK link-local / parent-local clamp | ⚠️ Single-axis fixed; multi-axis partial |
| Append transform | ✅ PMX layer order |
| Physics (Ammo backend) | ✅ Isolated behind boundary |
| Physics (disabled fallback) | ✅ |
| Camera motion application | ❌ |
| Three.js visual regression gates | ⚠️ Scripts exist; CI gates not wired |

## Verified Assets

Loading and playback are covered by committed fixtures and local manual
checks. The committed release evidence currently includes:

- Unit-test fixtures: 7 PMX / 3 VMD

Additional user-owned PMD, PMX, and VMD assets are used for local smoke checks,
but those assets and screenshots are not distributed with the package.

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
- [saba](https://github.com/benikabocha/saba)
- [nanoem](https://github.com/hkrn/nanoem)

---

## Install

```powershell
npm install @yohawing/three-mmd-loader three
```

`three` is a peer dependency.

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
  texture helpers, and MMD animation loading.
- `physics`: `MmdPhysicsBackend`, disabled fallback backend, validation/debug
  helpers, and optional Ammo backend implementation.

## Usage - Model Loading

```ts
import { ThreeMmdLoader } from "@yohawing/three-mmd-loader";

const loader = new ThreeMmdLoader();
const { mesh, runtime } = await loader.loadModel(source); // Uint8Array | ArrayBuffer | File | string (URL/path resolved via fetch)
scene.add(mesh);

const { mesh: remoteMesh } = await loader.loadModel("/models/example.pmx");
scene.add(remoteMesh);
```

`loadModel(...)` also returns `textureDiagnostics: TextureLoadDiagnostic[]`.
Texture folder resolution failures and related recoverable texture issues are
reported there with `level: "warning"`.

## Loader Options

`new ThreeMmdLoader({ runtime })` passes `DefaultMmdRuntimeOptions` overrides
such as `frameRate`, `physics`, and `physicsBackend` into the created runtime.
Texture resolution can use `textureMap?: Record<string, string | URL | Blob>`
for drag-and-drop folders or preloaded blobs, or `textureResolver?.resolve(path,
modelUrl)` for dynamic lookup. `textureLoader?: ThreeMmdTextureLoader` accepts a
Three.js `TextureLoader`-compatible object for tests or custom decoders.
`geometryAwareAlpha?: boolean` defaults to `false` and enables heavier UV-based
alpha scanning. `ThreeMmdLoader` keeps a per-loader texture cache internally;
the lower-level material helpers accept `textureCache` when cache sharing is
needed outside the loader.

## Usage - Animation

```ts
const model = await loader.loadModel(modelSource);
const { animation } = await loader.loadAnimation(vmdSource);
model.runtime?.setAnimation(animation, model.mesh);

// Per frame.
model.runtime?.tick(currentSeconds, model.mesh);
```

## Usage - Pose (VPD)

```ts
const { pose } = await loader.loadPose(vpdSource);
const { animation } = await loader.loadPoseAnimation(vpdSource, "myPose");
model.runtime?.setAnimation(animation, model.mesh);
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
