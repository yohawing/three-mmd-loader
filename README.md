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
| PMM (project) | ❌ | ❌ |

### Features

| Feature | Status |
| --- | --- |
| Parser | ✅ PMX / PMD / VMD / VPD |
| Deform / skinning | ✅ BDEF1/2/4, SDEF, QDEF |
| MMD material / toon shader | ✅ Toon textures, alpha blending decisions, render ordering, and self shadow |
| IK / append-transform rigging | ✅ Verified through the mmd-anim/WASM-backed path |
| VMD Camera / Light | ✅ Applies to Three.js Camera and DirectionalLight |
| Physics | ✅ MMD-focused Bullet Physics. |
| Soft Body | ⚠️ PMX data parsed; runtime simulation not implemented |

The main PMX parser and animation path are backed by
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

## Experimental - WebGPU / TSL

`@yohawing/three-mmd-loader/webgpu` is the experimental TSL path. It does not
change the default WebGL path, and the verified Three.js version is `0.184.0` at
development time. The Three.js TSL API can still change, so keep using the
default path for normal loading and playback.

```ts
import {
  createMmdTslToonMaterial,
  replaceMmdModelMaterialsWithTsl
} from "@yohawing/three-mmd-loader/webgpu";

const tslMaterial = createMmdTslToonMaterial();
replaceMmdModelMaterialsWithTsl(model.mesh);
void tslMaterial;
```

Main limitations: self-shadow is an approximation close to the current WebGL
path, not a byte-for-byte match for the GLSL-side `min(shadow, lightVisibility)`.
The WebGPU backend is not a required CI gate; the portable gate primarily uses
`forceWebGL`. See `examples/webgpu-poc/README.md` for the PoC and verification
flow.

## Recipes

### Full Playback Loop (Model + VMD + Camera + Physics)

```ts
import * as THREE from "three";
import {
  ThreeMmdLoader,
  applyMmdCameraStateToThreeCamera,
  applyMmdLightStateToThreeDirectionalLight,
  configureMmdSelfShadowDirectionalLight,
  disposeMmdModel
} from "@yohawing/three-mmd-loader";
import {
  createCustomBulletMmdPhysicsBackend,
  loadCustomBulletMmdModule
} from "@yohawing/three-mmd-loader/physics";

// 1. Physics backend.
const mmdBullet = await loadCustomBulletMmdModule();
const physics = createCustomBulletMmdPhysicsBackend(mmdBullet);

// 2. Loader with physics wired in.
const loader = new ThreeMmdLoader({
  runtime: { physics: "external", physicsBackend: physics }
});

// 3. Scene, camera, light.
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
const light = new THREE.DirectionalLight(0xffffff, 2);
light.castShadow = true;
configureMmdSelfShadowDirectionalLight(light, { mapSize: 2048, normalBias: 0.01 });
scene.add(light, light.target);

// 4. Load model and VMD.
const model = await loader.loadModel("model.pmx");
scene.add(model.root);
const { animation } = await loader.loadAnimation("motion.vmd");
model.setAnimation(animation);

// 5. Camera and light tracks from the same VMD.
const cameraTrack = loader.createCameraTrack(animation);
const lightTrack = loader.createLightTrack(animation);

// 6. Render loop.
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.shadowMap.enabled = true;

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const seconds = clock.getElapsedTime();
  model.update(seconds, { physics: true });

  const cameraState = model.runtime.cameraState();
  if (cameraState) {
    applyMmdCameraStateToThreeCamera(camera, cameraState, {
      aspect: renderer.domElement.clientWidth / renderer.domElement.clientHeight
    });
  }
  const lightState = model.runtime.lightState();
  if (lightState) {
    applyMmdLightStateToThreeDirectionalLight(light, lightState);
  }

  renderer.render(scene, camera);
});

// 7. Cleanup when done.
disposeMmdModel(model);
physics.dispose();
```

### Local File Loading (File API / Drag-and-Drop)

```ts
import {
  ThreeMmdLoader,
  findMmdModelFiles,
  findMmdMotionFiles,
  createMmdTextureMapFromFiles
} from "@yohawing/three-mmd-loader";

async function handleFiles(files: File[]) {
  const modelFiles = findMmdModelFiles(files);
  const motionFiles = findMmdMotionFiles(files);
  if (modelFiles.length === 0) return;

  const modelFile = modelFiles[0];
  const textureMap = createMmdTextureMapFromFiles(files, modelFile);

  const loader = new ThreeMmdLoader({ textureMap });
  const model = await loader.loadModel(modelFile);
  scene.add(model.root);

  if (motionFiles.length > 0) {
    const { animation } = await loader.loadAnimation(motionFiles[0]);
    model.setAnimation(animation);
  }
}

// <input type="file"> example.
const input = document.querySelector<HTMLInputElement>("#file-input")!;
input.addEventListener("change", () => {
  if (input.files) handleFiles([...input.files]);
});

// Drag-and-drop example.
document.addEventListener("drop", async (event) => {
  event.preventDefault();
  if (!event.dataTransfer) return;
  const entries = [...event.dataTransfer.items]
    .map((item) => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => entry != null);
  const files = await collectFilesFromEntries(entries);
  handleFiles(files);
});
```

### Self-Shadow Setup

```ts
import {
  configureMmdSelfShadowDirectionalLight,
  fitMmdSelfShadowDirectionalLightToBox,
  MMD_SELF_SHADOW_LAYER
} from "@yohawing/three-mmd-loader";

const light = new THREE.DirectionalLight(0xffffff, 2);
light.castShadow = true;

// Configure shadow map and layer.
configureMmdSelfShadowDirectionalLight(light, {
  mapSize: 2048,
  bias: -0.0005,
  normalBias: 0.01
});

// Fit shadow frustum to the model's bounding box (call after model load).
const box = new THREE.Box3().setFromObject(model.root);
fitMmdSelfShadowDirectionalLightToBox(light, box);

// Models with self-shadow materials are automatically assigned
// to MMD_SELF_SHADOW_LAYER. The shadow camera only renders that layer.
scene.add(light, light.target);
```

### Model Disposal

```ts
import { disposeMmdModel } from "@yohawing/three-mmd-loader";

// Dispose model, its geometry, materials, textures, skeleton, and runtime.
disposeMmdModel(model);

// When textures are shared between models:
disposeMmdModel(model, { textures: "none" });
```

### VPD Pose Loading

```ts
const loader = new ThreeMmdLoader();
const model = await loader.loadModel("model.pmx");

// Apply as a one-shot pose.
const { pose } = await loader.loadPose("pose.vpd");

// Or convert a VPD into an animation so it can be used with setAnimation.
const poseAnimation = await loader.loadPoseAnimation("pose.vpd", "idle");
model.setAnimation(poseAnimation);
model.update(0);
```

### Diagnostics Inspection

```ts
const model = await loader.loadModel("model.pmx");

// Core (WASM or TypeScript fallback).
console.log(model.diagnostics.core);

// Texture load issues (missing files, format errors).
for (const diag of model.diagnostics.textures) {
  console.warn(`[${diag.code}] material ${diag.materialIndex}: ${diag.path}`);
}

// Material transparency decisions.
for (const diag of model.diagnostics.materials) {
  console.log(diag.materialIndex, diag.finalTransparencyMode, diag.reason);
}

// Load performance (when loader was created with { performance: true }).
for (const measure of model.diagnostics.performance) {
  console.log(`${measure.name}: ${measure.durationMs.toFixed(1)}ms`);
}
```

## Development

Development notes are in [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md).
