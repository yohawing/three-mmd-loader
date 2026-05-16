# @yohawing/three-mmd-loader

Japanese: [README.ja.md](./README.ja.md)

Roadmap: [ROADMAP.md](./ROADMAP.md)

Three.js MMD model/animation loader and runtime in one TypeScript package.
It loads standard MMD model, motion, and pose assets into Three.js-facing data
while keeping parser, runtime, adapter, and physics backend boundaries explicit.

## Planned Install

```powershell
pnpm add @yohawing/three-mmd-loader three
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

## Current Status

- Parser: PMX, PMD, VMD, and VPD parsing is implemented, including full VMD
  keyframe data.
- Runtime: VMD animation playback through `AnimationMixer`, CCD IK with model
  IK chains wired from `mesh.userData.mmdIkChains`, and append transform metadata
  wired on `bone.userData.mmdAppendTransform`.
- Three.js: `ThreeMmdLoader.loadModel`, `loadAnimation`, `loadPose`, and
  `loadPoseAnimation` are implemented.
- Physics: disabled fallback and Ammo backends are isolated behind the
  `MmdPhysicsBackend` boundary.

## Limitations

- VMD Bezier interpolation parameters are parsed and stored, but clip generation
  still uses linear interpolation.
- Full append transform evaluation order, including layer and
  `transformAfterPhysics` behavior, is still in progress.
- PMX IK link-local and parent-local clamp behavior currently has only the
  foundational implementation.
- Three.js visual regression gates with baseline screenshots are not built yet.
- Native-equivalent physics behavior is not claimed.

Out of scope for the initial release:

- Non-Three.js renderer adapters.
- Cross-renderer visual equivalence claims.
- Optimized custom model or motion formats.
- WebGPU renderer path.
- A separate published physics package.

## Acknowledgements

This project was developed with reference to Babylon-MMD, nanoem, and Saba.
