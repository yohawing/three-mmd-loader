# @yohawing/three-mmd-loader

A library for loading and playing back MMD models and motions on Three.js.

Japanese: [docs/README.ja.md](./docs/README.ja.md)

![three-mmd-loader viewer screenshot](./docs/assets/screenshots.png)

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

### Features

| Feature | Status |
| --- | --- |
| IK link-local / parent-local clamp | ⚠️ Single-axis fixed; multi-axis partial |
| Append transform | ✅ PMX layer order |
| WASM Parser | ✅ PMX / PMD with TypeScript fallback |
| Physics (Ammo backend) | ✅ Uses Ammo.js |
| Camera motion application | ❌ |
| Three.js visual regression gates | ⚠️ Scripts exist; CI gates not wired |

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
