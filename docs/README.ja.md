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
| MMD マテリアル / Toon シェーダー | ✅ Toon、AlphaBlend判定、描画順、セルフ影、TSL(WebGPU/WebGL)対応 |
| IK / 付与変形などのリギング | ✅ mmd-anim/WASM 経路で検証 |
| VMD カメラ / ライト | ✅ Three.js の Camera、DirectionalLight に適用 |
| 物理 | ✅ MMD 向け Bullet Physics |
| ソフトボディ | ⚠️ PMX データは解析 / ランタイムシミュレーションは実装予定なし |

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

`@yohawing/three-mmd-loader/webgpu` は実験的な TSL 経路です。通常の WebGL
経路は変更しません。Three.js 側の TSL API は変化が大きいため、対応する Three.js
バージョンを固定し、通常の利用では既定経路を優先してください。

`createMmdTslPipeline` がモデル変換、sparse morph、TSL マテリアル、専用セルフ影
パスのライフサイクルをまとめます。renderer / scene / camera / light の生成と、毎フレームの
`model.update()` はアプリケーション側の責務です。

```ts
import * as THREE from "three/webgpu";
import { ThreeMmdLoader } from "@yohawing/three-mmd-loader";
import { createMmdTslPipeline } from "@yohawing/three-mmd-loader/webgpu";

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 1000);
const renderer = new THREE.WebGPURenderer({ antialias: true });
const clock = new THREE.Clock();

const light = new THREE.DirectionalLight(0xffffff, 2);
light.castShadow = true;
scene.add(light, light.target);

const pipeline = await createMmdTslPipeline(renderer, {
  light,
  selfShadowEnabled: true
});

const loader = new ThreeMmdLoader();
const model = await loader.loadModel("model.pmx", pipeline.createModelLoadOptions());
scene.add(model.root);
pipeline.attach(model);

renderer.setAnimationLoop(() => {
  model.update(clock.getElapsedTime());
  pipeline.render(scene, camera);
});
```

セルフ影を受けるモデルは、`attach()` 前に pipeline の `light` を指定してください。
`setSelfShadowEnabled()` と `setSelfShadowMode()` は UI の切り替えに、`detach()` と
`dispose()` はモデルまたは renderer の破棄時に使います。`pipeline.render()` は標準
shadow map を一時的に無効化して、専用セルフ影との二重適用を防ぎます。

`replaceMmdModelMaterialsWithTsl` などの低レベル export は高度な用途向けに維持しています。
通常は pipeline API を使い、独自のマテリアル構成や検証用途でのみ直接利用してください。

native WebGPU は必須 CI gate ではありません。portable な確認は `forceWebGL` を主経路にし、
native WebGPU の比較は `npm run render:visual:generated-pmx:webgpu` と
`npm run visual:report:generated-pmx:webgpu` を使います。

## Development

[DEVELOPMENT.md](./DEVELOPMENT.md) を参照してください。
