# @yohawing/three-mmd-loader

A library for loading and playing back MMD models and motions on Three.js.

日本語: [docs/README.ja.md](./docs/README.ja.md)

![three-mmd-loader viewer screenshot](./docs/assets/screenshots.png)

Live demo: [three.mmd.yohawing.com](https://three.mmd.yohawing.com/)

Screenshot assets: model [Tda式初音ミク V4X by Tda](https://3d.nicovideo.jp/works/td30681),
motion [ラビットホール by mobiusP](https://www.nicovideo.jp/watch/sm42576784).

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
| .emm / .emd (effect project) | ❌ | ❌ |
| .fx (MME effect) | ❌ | ❌ |

### Features

| Feature | Status |
| --- | --- |
| WASM Parser | ✅ PMX / PMD / VMD with TypeScript fallback |
| BDEF1/2/4 skinning | ✅ |
| SDEF skinning | ⚠️ Shader path exists; verify parity |
| QDEF skinning | ❌ Dual Quaternion Skinning not implemented |
| Append transform | ✅ PMX layer order |
| IK link-local / parent-local clamp | ⚠️ Single-axis fixed; multi-axis partial |
| VMD Camera | ✅ Runtime sampling + Three.js helper, perspective/orthographic switch |
| VMD Light | ⚠️ Parsed; runtime/application parity needs verification |
| Self Shadow | ❌ Not implemented |
| Physics (Ammo backend) | ✅ Uses Ammo.js |
| Soft Body | ⚠️ PMX data parsed; runtime simulation not implemented |

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

## Usage - Model Loading

```ts
import { ThreeMmdLoader } from "@yohawing/three-mmd-loader";

const loader = new ThreeMmdLoader();
const model = await loader.loadModel(source); // Uint8Array | ArrayBuffer | File | string (URL/path resolved via fetch)
scene.add(model.object);

const remoteModel = await loader.loadModel("/models/example.pmx");
scene.add(remoteModel.object);
```

`loadModel(...)` also returns `textureDiagnostics: TextureLoadDiagnostic[]`.
Texture folder resolution failures and related recoverable texture issues are
reported there with `level: "warning"`.

`model.object` is the scene-ready root that contains the base mesh plus any
generated outline and render-order proxy meshes. Pass `{ outlines: false }` to
skip those proxies.

## Usage - Animation

```ts
const model = await loader.loadModel(modelSource);
const { animation } = await loader.loadAnimation(vmdSource);
model.runtime?.setAnimation(animation, model.mesh);

// Per frame.
model.runtime?.tick(currentSeconds, model.mesh);
```

## Usage - Camera Motion

```ts
import {
  applyMmdCameraStateToThreeCamera,
  sampleMmdCameraTrackInto
} from "@yohawing/three-mmd-loader";

const { animation } = await loader.loadAnimation(cameraVmdSource);
const mmdFrameRate = 30; // Use 60 for MMD 60 FPS mode.
const quantizeToMmdFrame = true; // Set false for unbounded/fractional-frame playback.
const cameraStateScratch = {
  distance: 0,
  position: [0, 0, 0] as [number, number, number],
  rotation: [0, 0, 0] as [number, number, number],
  fov: 1,
  perspective: true
};

// Per frame, using the selected MMD frame timeline.
const frame = currentSeconds * mmdFrameRate;
const cameraState = sampleMmdCameraTrackInto(
  animation.cameraFrames,
  quantizeToMmdFrame ? Math.floor(frame + 1e-6) : frame,
  cameraStateScratch
);
if (cameraState) {
  applyMmdCameraStateToThreeCamera(camera, cameraState);
}
```

`applyMmdCameraStateToThreeCamera(...)` converts MMD camera coordinates for
Three.js, including the MMD camera rotation convention, camera distance, roll,
FOV, and perspective/orthographic frames. The example viewer exposes the same
playback controls through URL query parameters:

- `?mmdFrameRate=60` evaluates the MMD frame timeline at 60 FPS.
- `?mmdFrameQuantize=false` keeps fractional frames for unbounded playback.
- With no query parameters, the viewer defaults to 30 FPS and quantized MMD
  frame playback.

## Usage - Pose (VPD)

```ts
const { pose } = await loader.loadPose(vpdSource);
const { animation } = await loader.loadPoseAnimation(vpdSource, "myPose");
model.runtime?.setAnimation(animation, model.mesh);
```

## Usage - Physics

Physics is abstracted behind `MmdPhysicsBackend` so the physics library can be
swapped. The current implementation uses Ammo.js (Bullet Physics).

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

## Development

Development notes for tests, scripts, and fixtures are in
[docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md). The release checklist is in
[docs/RELEASE.md](./docs/RELEASE.md).
