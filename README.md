# @yohawing/three-mmd-loader

Intended Three.js MMD loader/runtime release package.

This package is the TypeScript-first release target for standard MMD model and
animation assets in Three.js. The initial release is scoped to parser, runtime,
Three.js adapter, and planned optional physics backend boundaries inside one
package.

> Migration note: this package is still being populated from the workspace. The
> current release-repo implementation contains the package shell, metadata and
> section-inventory parsers, renderer-neutral VPD pose parsing, a minimal runtime
> facade, a minimal CCD IK solver, a disabled physics backend boundary, a minimal
> Three.js loader facade, and adapter-local Three.js helper functions. Full PMX /
> PMD model loading and full VMD / VPD motion loading through `ThreeMmdLoader`
> are release goals, not complete in this directory yet.

## Planned Install

```powershell
pnpm add @yohawing/three-mmd-loader three
```

`three` is a peer dependency.

Publish readiness note: the package is still private in this workspace. The
version and final `private: true` removal remain release decisions.

## Current Package Boundaries

```text
@yohawing/three-mmd-loader
@yohawing/three-mmd-loader/parser
@yohawing/three-mmd-loader/runtime
@yohawing/three-mmd-loader/three
@yohawing/three-mmd-loader/physics
```

Current and planned responsibilities:

- `parser`: currently PMX, PMD, VMD, and VPD metadata / inventory parsing plus
  renderer-neutral VPD pose parsing. Full model and motion parse output remains
  follow-up work.
- `runtime`: currently a frame-state facade and clean CCD IK foothold. Full MMD
  animation evaluation for bones, morphs, append transforms, IK integration,
  camera, light, and physics state remains follow-up work.
- `three`: currently loader facade validation plus adapter-local geometry,
  skeleton, texture, and matrix helpers. Full Three.js loader integration for
  materials, morph targets, runtime sync, camera, and light remains follow-up
  work.
- `physics`: currently interface, disabled backend, debug/context helpers, and
  legacy contract bridge helpers. Ammo/Bullet support is a planned internal
  optional backend, not present in this package slice and not a separate package.

## Current API Slice

The release repo currently exposes format detection, binary helpers, metadata
inventory parsers, a minimal runtime facade, a CCD IK solver boundary, a
disabled physics backend, and a minimal Three.js loader facade:

```ts
import {
  BinaryReader,
  detectModelFormat,
  parsePmdMetadata,
  parsePmxMetadata,
  parseVmdMetadata,
  parseVpdMetadata
} from "@yohawing/three-mmd-loader/parser";

const bytes = new Uint8Array(await file.arrayBuffer());
const format = detectModelFormat(bytes);
const reader = new BinaryReader(bytes);

if (format === "pmx") {
  const metadata = parsePmxMetadata(bytes);
  console.log(metadata.name, metadata.counts);
}
```

VPD pose data is available as renderer-neutral parser output:

```ts
import { parseVpdPose } from "@yohawing/three-mmd-loader/parser";

const vpdBytes = new Uint8Array(await vpdFile.arrayBuffer());
const pose = parseVpdPose(vpdBytes);
console.log(pose.modelFile, pose.bonePoses.length);
```

`DefaultMmdRuntime`, `CcdIkSolver`, `DisabledMmdPhysicsBackend`, and
`ThreeMmdLoader` are present as migration facades. `ThreeMmdLoader` load methods
currently throw explicit not-implemented errors until model, animation,
material, and runtime sync slices are migrated.

The Three.js facade also exposes adapter-local helpers:

- `isModelSource(...)` and `readModelSourceBytes(...)`.
- `createThreeBufferGeometry(...)` for geometry buffers, skinning attributes,
  SDEF attributes, material groups, and morph attributes.
- `createThreeSkeleton(...)` for adapter-local skeleton data.
- Texture path and toon-reference utilities.
- `mmdWorldMatrixToThree(...)` for column-major runtime matrix conversion.

These helpers are tested directly, but they are not yet wired into
`ThreeMmdLoader`. `readModelSourceBytes(...)` currently supports `Uint8Array`,
`ArrayBuffer`, and browser `File` values without copying `Uint8Array` or
`ArrayBuffer` contents. String sources are accepted by `ThreeMmdLoader`
validation but are not read yet; URL and file-path resolution policy is still a
deferred loader decision.

## Current Status

The current release-repo implementation is an early migration slice, not a full
loader yet:

- Parser support is limited to format detection, binary helpers, and PMX / PMD /
  VMD / VPD metadata and section-count inventory parsing, plus renderer-neutral
  VPD pose parsing through `parseVpdPose(...)`.
- `DefaultMmdRuntime` provides the first clean runtime facade and frame-state
  boundary.
- `CcdIkSolver` provides a simple finite CCD foothold. Full MMD IK chain
  behavior, PMX link limits, and local-axis handling remain follow-up work.
- Three.js geometry, skeleton, texture-path, and runtime-matrix helpers are
  available as adapter-local migration utilities. They are not full loader
  integration yet.
- `ThreeMmdLoader` is a public facade only. Model, animation, material, and
  runtime-sync `load` paths are not implemented and throw explicit errors.
- Physics currently exposes only `MmdPhysicsBackend` plus the disabled backend
  implementation. Ammo/Bullet support is still a release goal, not present in
  this package slice.

## Limitations

Release-facing wording should avoid claiming these as complete:

- Full PMX / PMD model loading and full VMD / VPD motion loading in this
  `three-mmd-loader` directory.
- Three.js geometry, skeleton, material, texture, morph target, camera/light, and
  runtime sync through `ThreeMmdLoader`. Some adapter-local helper functions
  exist, but the public loader path does not consume them yet.
- Full SDEF behavior or native-equivalent IK.
- Default material, shadow, toon, or outline appearance beyond future Three.js
  visual regression baselines owned by this package.
- Native-equivalent physics behavior or a concrete Ammo/Bullet backend in the
  current package slice.
- Viewer/player UI polish.

Out of scope for the initial release:

- Non-Three.js renderer adapters.
- Cross-renderer visual equivalence claims.
- Optimized custom model or motion formats.
- WebGPU renderer path.
- A separate published physics package.

## Evidence

Release confidence is tracked with:

- `runtime numeric evidence` for runtime state comparisons.
- Planned release-owned Three.js screenshot regression checks for baselines
  owned by this package.
- `smoke regression evidence` for viewer load, nonblank rendering, and finite
  diagnostics.
- `fixture inventory evidence` for asset presence and classification.

## Acknowledgements

This project was developed with reference to Babylon-MMD, nanoem, and Saba.
