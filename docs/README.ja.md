# @yohawing/three-mmd-loader

Three.js 上で MMD モデルとモーションを読み込み・再生するためのライブラリです。

[English](../README.md) / [デモサイト](https://three.mmd.yohawing.com/)

![three-mmd-loader viewer screenshot](./assets/screenshots.png)

スクリーンショット使用アセット: モデル [Tda式初音ミク V4X by Tda](https://3d.nicovideo.jp/works/td30681)、
モーション [ラビットホール by mobiusP](https://www.nicovideo.jp/watch/sm42576784)。

## Compatibility Matrix

### フォーマット

| フォーマット | 解析 | ランタイム適用 |
| --- | --- | --- |
| PMX (モデル) | ✅ | ✅ |
| PMD (モデル) | ✅ | ✅ |
| VMD (モーション) | ✅ | ✅ |
| VPD (ポーズ) | ✅ | ✅ |
| PMM (プロジェクト) | ⚠️ parser API | ❌ |
| DirectX `.x` (アクセサリ) | ⚠️ parser API | ❌ |
| VAC (アクセサリ配置) | ⚠️ parser API | ❌ |

### 機能

| 機能 | 状態 |
| --- | --- |
| パーサー | ✅ PMX / PMD / VMD / VPD、⚠️ PMM / `.x` / `.vac` は構造化解析 API のみ |
| 変形 / スキニング | ✅ BDEF1/2/4, SDEF, QDEF |
| MMD マテリアル / Toon シェーダー | ✅ Toon、AlphaBlend 判定、描画順、自己影 |
| IK / 付与変形などのリギング | ✅ mmd-anim/WASM 経路で検証 |
| VMD カメラ / ライト | ✅ Three.js の Camera、DirectionalLight に適用 |
| 物理 | ✅ MMD 向け Bullet Physics |
| ソフトボディ | ⚠️ PMX データは解析 / ランタイムシミュレーションは未実装 |

PMX パーサー、PMM / `.x` / `.vac` の構造化解析、アニメーション処理の主要経路には
[yohawing/mmd-anim](https://github.com/yohawing/mmd-anim) を使用しています。

## Acknowledgements

以下のプロジェクトを参考に開発しました:

- [Babylon-MMD](https://github.com/noname0310/babylon-mmd)
- [saba](https://github.com/benikabocha/saba)
- [nanoem](https://github.com/hkrn/nanoem)

---

## インストール

```powershell
npm install @yohawing/three-mmd-loader three
```

## 使い方 - モデル読み込み

```ts
import { ThreeMmdLoader } from "@yohawing/three-mmd-loader";

const loader = new ThreeMmdLoader();
const model = await loader.loadModel(source); // Uint8Array | ArrayBuffer | File | string (URL/path は fetch で解決)
scene.add(model.root);
```

## 使い方 - アニメーション

```ts
import * as THREE from "three";
import { applyMmdCameraStateToThreeCamera } from "@yohawing/three-mmd-loader";

const model = await loader.loadModel(modelSource);
const { animation } = await loader.loadAnimation(vmdSource);
model.setAnimation(animation);

const perspectiveCamera = new THREE.PerspectiveCamera();

// 毎フレーム。
model.update(currentSeconds);
const cameraState = model.runtime.cameraState();
if (cameraState) {
  const activeCamera = applyMmdCameraStateToThreeCamera(perspectiveCamera, cameraState, {
    aspect: renderer.domElement.clientWidth / renderer.domElement.clientHeight
  });
  renderer.render(scene, activeCamera);
}
```

## 使い方 - 物理

物理は `MmdPhysicsBackend` で抽象化されていて、物理ライブラリを変更可能にしてあります。
標準経路は MMD 向けにビルド済みの Bullet Physics バックエンドです。

```ts
import {
  createCustomBulletMmdPhysicsBackend,
  loadCustomBulletMmdModule
} from "@yohawing/three-mmd-loader/physics";

// 標準: MMD 向け Bullet Physics バックエンド。
const mmdBullet = await loadCustomBulletMmdModule();
const directPhysicsBackend = createCustomBulletMmdPhysicsBackend(mmdBullet);
```

## Experimental - WebGPU / TSL

`@yohawing/three-mmd-loader/webgpu` は experimental な TSL 経路です。既定の
WebGL 経路は変更せず、検証済みの Three.js は開発時点の `0.184.0` です。TSL API は
Three.js 側で変わる可能性があるため、通常の読み込み・再生にはまだ既定経路を使ってください。

```ts
import {
  createMmdTslToonMaterial,
  replaceMmdModelMaterialsWithTsl
} from "@yohawing/three-mmd-loader/webgpu";

const tslMaterial = createMmdTslToonMaterial();
replaceMmdModelMaterialsWithTsl(model.mesh);
void tslMaterial;
```

主な制限: self-shadow は現行 WebGL 経路に近い近似で、GLSL 側の
`min(shadow, lightVisibility)` と完全同一ではありません。WebGPU backend は CI 必須 gate
ではなく、portable gate は `forceWebGL` を主経路にしています。generated-PMX の
baseline と native WebGPU の比較は `npm run render:visual:generated-pmx:webgpu` と
`npm run visual:report:generated-pmx:webgpu` で行えます。

## レシピ

### 統合再生ループ（モデル + VMD + カメラ + 物理）

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

// 1. 物理バックエンド。
const mmdBullet = await loadCustomBulletMmdModule();
const physics = createCustomBulletMmdPhysicsBackend(mmdBullet);

// 2. 物理を組み込んだ Loader。
const loader = new ThreeMmdLoader({
  runtime: { physics: "external", physicsBackend: physics }
});

// 3. シーン、カメラ、ライト。
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
const light = new THREE.DirectionalLight(0xffffff, 2);
light.castShadow = true;
configureMmdSelfShadowDirectionalLight(light, { mapSize: 2048, normalBias: 0.01 });
scene.add(light, light.target);

// 4. モデルと VMD を読み込む。
const model = await loader.loadModel("model.pmx");
scene.add(model.root);
const { animation } = await loader.loadAnimation("motion.vmd");
model.setAnimation(animation);

// 5. 同じ VMD からカメラ・ライトトラックを作成。
const cameraTrack = loader.createCameraTrack(animation);
const lightTrack = loader.createLightTrack(animation);

// 6. 描画ループ。
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

// 7. 終了時のクリーンアップ。
disposeMmdModel(model);
physics.dispose();
```

### ローカルファイル読み込み（File API / ドラッグ&ドロップ）

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

// <input type="file"> の例。
const input = document.querySelector<HTMLInputElement>("#file-input")!;
input.addEventListener("change", () => {
  if (input.files) handleFiles([...input.files]);
});

// ドラッグ&ドロップの例。
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

### セルフシャドウの設定

```ts
import {
  configureMmdSelfShadowDirectionalLight,
  fitMmdSelfShadowDirectionalLightToBox,
  MMD_SELF_SHADOW_LAYER
} from "@yohawing/three-mmd-loader";

const light = new THREE.DirectionalLight(0xffffff, 2);
light.castShadow = true;

// シャドウマップとレイヤーの設定。
configureMmdSelfShadowDirectionalLight(light, {
  mapSize: 2048,
  bias: -0.0005,
  normalBias: 0.01
});

// モデルのバウンディングボックスにシャドウ錐台をフィット（モデル読み込み後に呼ぶ）。
const box = new THREE.Box3().setFromObject(model.root);
fitMmdSelfShadowDirectionalLightToBox(light, box);

// セルフシャドウ対象マテリアルを持つモデルは自動的に
// MMD_SELF_SHADOW_LAYER に割り当てられる。シャドウカメラはそのレイヤーだけを描画する。
scene.add(light, light.target);
```

### モデルの破棄

```ts
import { disposeMmdModel } from "@yohawing/three-mmd-loader";

// モデル、ジオメトリ、マテリアル、テクスチャ、スケルトン、ランタイムを破棄。
disposeMmdModel(model);

// テクスチャを複数モデルで共有している場合:
disposeMmdModel(model, { textures: "none" });
```

### VPD ポーズ読み込み

```ts
const loader = new ThreeMmdLoader();
const model = await loader.loadModel("model.pmx");

// ワンショットポーズとして適用。
const { pose } = await loader.loadPose("pose.vpd");

// VPD をアニメーションに変換して setAnimation で使う。
const poseAnimation = await loader.loadPoseAnimation("pose.vpd", "idle");
model.setAnimation(poseAnimation);
model.update(0);
```

### 診断情報の確認

```ts
const model = await loader.loadModel("model.pmx");

// コア（WASM または TypeScript フォールバック）。
console.log(model.diagnostics.core);

// テクスチャ読み込みの問題（ファイル欠損、フォーマットエラー）。
for (const diag of model.diagnostics.textures) {
  console.warn(`[${diag.code}] material ${diag.materialIndex}: ${diag.path}`);
}

// マテリアルの透過判定。
for (const diag of model.diagnostics.materials) {
  console.log(diag.materialIndex, diag.finalTransparencyMode, diag.reason);
}

// 読み込みパフォーマンス（{ performance: true } で Loader を作成した場合）。
for (const measure of model.diagnostics.performance) {
  console.log(`${measure.name}: ${measure.durationMs.toFixed(1)}ms`);
}
```

## Development

[DEVELOPMENT.md](./DEVELOPMENT.md) を参照してください。
