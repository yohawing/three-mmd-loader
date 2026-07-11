# @yohawing/three-mmd-loader

A library for loading and playing back MMD models and motions on Three.js.

[日本語](./docs/README.ja.md) / [Live demo](https://three.mmd.yohawing.com/)

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
| PMM (project) | ⚠️ parser API | ❌ |
| DirectX `.x` (accessory) | ⚠️ parser API | ❌ |
| VAC (accessory placement) | ⚠️ parser API | ❌ |

### Features

| Feature | Status |
| --- | --- |
| Parser | ✅ PMX / PMD / VMD / VPD; ⚠️ PMM / `.x` / `.vac` expose structured parsing APIs only |
| Deform / skinning | ✅ BDEF1/2/4, SDEF, QDEF |
| MMD material / toon shader | ✅ Toon textures, alpha blending decisions, render ordering, and self shadow |
| IK / append-transform rigging | ✅ Verified through the mmd-anim/WASM-backed path |
| VMD Camera / Light | ✅ Applies to Three.js Camera and DirectionalLight |
| Physics | ✅ MMD-focused Bullet Physics. |
| Soft Body | ⚠️ PMX data parsed; runtime simulation not implemented |

The main PMX parser, structured PMM / `.x` / `.vac` parsing, and animation path are backed by
[yohawing/mmd-anim](https://github.com/yohawing/mmd-anim).

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

## Usage - Parsing PMM / `.x` / `.vac`

PMM and accessory formats are exposed as parser APIs only. Resolving asset
paths, building Three.js geometry and materials, loading textures, applying
`.vac` attachments, and reconstructing or playing a PMM scene are application
responsibilities. The viewer does not provide loaders for these formats.

```ts
import {
  initCore,
  parseAccessory,
  parsePmmDocument
} from "@yohawing/three-mmd-loader/parser";

const core = await initCore();

const project = parsePmmDocument(pmmBytes, core);
const accessory = parseAccessory(xBytes, core, "stage.x");
const placement = parseAccessory(vacBytes, core, "stage.vac");
```

These parsing surfaces are currently experimental while their real-asset
corpus is expanded. They do not promise complete MMD or MikuMikuMoving
compatibility. Check `diagnostics` and optional fields before consuming the
result.

## Usage - Model Loading

```ts
import { ThreeMmdLoader } from "@yohawing/three-mmd-loader";

const loader = new ThreeMmdLoader();
const model = await loader.loadModel(source); // Uint8Array | ArrayBuffer | File | string (URL/path resolved via fetch)
scene.add(model.root);
```

## Usage - Animation

```ts
import * as THREE from "three";
import { applyMmdCameraStateToThreeCamera } from "@yohawing/three-mmd-loader";

const model = await loader.loadModel(modelSource);
const { animation } = await loader.loadAnimation(vmdSource);
model.setAnimation(animation);

const perspectiveCamera = new THREE.PerspectiveCamera();

// Per frame.
model.update(currentSeconds);
const cameraState = model.runtime.cameraState();
if (cameraState) {
  const activeCamera = applyMmdCameraStateToThreeCamera(perspectiveCamera, cameraState, {
    aspect: renderer.domElement.clientWidth / renderer.domElement.clientHeight
  });
  renderer.render(scene, activeCamera);
}
```

`applyMmdCameraStateToThreeCamera(...)` converts MMD camera coordinates for
Three.js and returns the active camera.

## Usage - Physics

Physics is abstracted behind `MmdPhysicsBackend` so the physics library can be
swapped. The default path is the MMD-focused prebuilt Bullet Physics backend.

```ts
import {
  createCustomBulletMmdPhysicsBackend,
  loadCustomBulletMmdModule
} from "@yohawing/three-mmd-loader/physics";

// Default: MMD-focused Bullet Physics backend.
const mmdBullet = await loadCustomBulletMmdModule();
const directPhysicsBackend = createCustomBulletMmdPhysicsBackend(mmdBullet);
```

## Development

Development notes are in [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md).
