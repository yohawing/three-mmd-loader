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
| PMM (プロジェクト) | ❌ | ❌ |

### 機能

| 機能 | 状態 |
| --- | --- |
| パーサー | ✅ PMX / PMD / VMD / VPD |
| 変形 / スキニング | ✅ BDEF1/2/4, SDEF, QDEF |
| MMD マテリアル / Toon シェーダー | ✅ Toon、AlphaBlend 判定、描画順、自己影 |
| IK / 付与変形などのリギング | ✅ mmd-anim/WASM 経路で検証 |
| VMD カメラ / ライト | ✅ Three.js の Camera、DirectionalLight に適用 |
| 物理 | ✅ MMD 向け Bullet Physics |
| ソフトボディ | ⚠️ PMX データは解析 / ランタイムシミュレーションは未実装 |

PMX パーサーとアニメーション処理の主要経路には
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

## 使い方 - ポーズ (VPD)

```ts
const { pose } = await loader.loadPose(vpdSource);
const { animation } = await loader.loadPoseAnimation(vpdSource, "myPose");
model.setAnimation(animation);
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

## Development

[DEVELOPMENT.md](./DEVELOPMENT.md) を参照してください。
