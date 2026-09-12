# Host rig playback

The bundled `MmdAnimRuntime` accepts retargeted poses without a VMD clip.
Host rigs support `physics: "none"` and `physics: "external"`. Bone mapping, retargeting, rest-pose
conversion and root motion remain the caller's responsibility.

```ts
import { ThreeMmdLoader, MmdAnimRuntime } from "@yohawing/three-mmd-loader";

const model = await new ThreeMmdLoader({ runtime: { physics: "none" } }).loadModel(modelUrl);
const runtime = model.runtime;
if (!(runtime instanceof MmdAnimRuntime)) {
  throw new Error("Host rigs require the mmd-anim WASM runtime");
}
runtime.setHostRig({
  drivenBoneIndices: new Uint32Array(drivenPmxBoneIndices),
  goalBoneIndices: new Uint32Array()
}, model.mesh);
runtime.setHostPose(pose);
// Each frame: overwrite pose's reusable buffers with fresh retargeted input.
runtime.tick(seconds);
```

For Physics On, pass `runtime: { physics: "external", physicsBackend }` to
the loader, using the existing `createCustomBulletMmdPhysicsBackend` backend
or a synchronous backend implementing world-matrix output. The bundled source
is pinned to mmd-anim `7bb2c12`, which adds `evaluateWithExternalPhysics` after
v0.5.0. Older WASM modules fail explicitly when configuring Physics On.

Each tick runs before-physics Append/IK, calls the backend, and applies its
world matrices inside mmd-anim's protected rig context before after-physics
evaluation. Only the final pose reaches the display skeleton. Dynamic bodies
on driven bones remain in the solver; their conflicting bone writes are
suppressed. PMX mode 2 preserves the animated local position.

Custom backends receive MMD model-space `inputWorldMatricesColumnMajor` and
local input translations/rotations. They must write complete finite matrices
to `output.worldMatricesColumnMajor`, fill `output.updatedBoneIndices`, and
return `updatedBoneCount` (or let it default to the index-array length).
Local-only output is unsupported on this route and missing matrix writes are
rejected. Seed-only updates are applied even when `simulated` is false.

The first tick, explicit seek/reset, backwards time, and re-enabling physics
reseed the solver. Forward ticks use elapsed seconds; keep advancing this clock
while reusing the same base pose for live physics during paused animation.
`tick(seconds, { physics: false })` uses pose-only evaluation. Callback failures
leave the display and frame time unchanged and force reseeding on retry; they
do not roll back the external solver's internal state. Worker host-pose
transport remains unsupported.

`pose` contains `Float32Array` buffers named `positions` (bone count × 3),
`rotations` (bone count × 4), `scales` (bone count × 3), `morphWeights`
(model morph count), and `Uint8Array` `ikEnabled` (model IK chain count).
The runtime retains these buffers by reference. Do not supply views into the
evaluator's WASM memory: boundary copies and memory growth can invalidate them.

Positions are offsets from parent-local rest positions in MMD coordinates and
units; rotations are local XYZW quaternions. Scales must be positive and uniform
per bone. Unanimated helpers receive zero offsets, identity rotations and unit
scales. Inputs precede bone morphs, Append, fixed-axis projection and IK.
Never read back the previous display skeleton as the next base pose.

Driven indices refer to PMX bone order, and the display skeleton must use that
same order. Driven bones retain post-morph FK world transforms; other bones
evaluate MMD helpers through both bone phases. Output is converted to Three.js
coordinates and applied once. No further host Append/IK pass is needed.

Ordinary FK playback uses no goals and all-zero IK flags. To opt into IK,
declare PMX controller indices in `goalBoneIndices`, then enable their chains
in `ikEnabled`. Upstream rejects chains that could overwrite protected bones
or ancestors. `tick(seconds, { ik: false })` disables every chain.

Invalid input throws before changing display output or frame time. Repeated
frames and random seeks use the same input evaluation. `resetPose()` clears
the supplied host pose and displays rest; supply a pose again before ticking.
`clearHostRig()` frees the rig and restores ordinary rest/VMD evaluation.
`setAnimation()` also exits host mode. `dispose()` frees the rig it created,
including when `ownsWasmResources` is false.

The adapter reuses frame buffers. The upstream wasm-bindgen boundary still
copies arrays and the upstream runtime has existing allocations; this is not
an end-to-end zero-allocation guarantee.

`test/integration/HostRig.test.ts` exercises the actual bundled WASM and a
Three.js skeleton, including protected FK, helper Append, handedness,
300 repeated evaluations, rejected-input recovery, callback writeback and
physics switching. `test/integration/HostRigBullet.test.ts` runs actual Bullet
WASM, checking falling bodies, protected bones, mode 2 and repeatable resets.
These tests do not provide browser/Viewer visual acceptance evidence.
