# @yohawing/three-mmd-loader

Three.js 上で MMD モデルとモーションを読み込み・再生するためのライブラリです。

English: [README.md](../README.md)

![three-mmd-loader viewer screenshot](./assets/screenshots.png)

デモ: [three.mmd.yohawing.com](https://three.mmd.yohawing.com/)

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
| .x / .vac (アクセサリ) | ❌ | ❌ |
| .emm / .emd (エフェクトプロジェクト) | ❌ | ❌ |
| .fx (MME エフェクト) | ❌ | ❌ |

### 機能

| 機能 | 状態 |
| --- | --- |
| WASM Parser | ✅ PMX / PMD / VMD、TypeScript fallback あり |
| BDEF1/2/4 skinning | ✅ |
| SDEF skinning | ⚠️ shader path はあり / parity 要検証 |
| QDEF skinning | ❌ Dual Quaternion Skinning 未実装 |
| 付与変形 (append transform) | ✅ PMX layer 順 |
| IK link-local / parent-local clamp | ⚠️ 単軸固定は対応 / 複数軸は部分対応 |
| VMD Camera | ✅ Runtime sampling + Three.js helper、perspective/orthographic 切替 |
| VMD Light | ⚠️ 解析は対応 / runtime 適用の parity 要検証 |
| Self Shadow | ❌ 未実装 |
| 物理 (Ammo backend) | ✅ Ammo.jsを使用。  |
| Soft Body | ⚠️ PMX データは解析 / runtime simulation は未実装 |

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
scene.add(model.object);

const remoteModel = await loader.loadModel("/models/example.pmx");
scene.add(remoteModel.object);
```

`model.object` は scene にそのまま追加できる root で、base mesh と生成された
outline / render-order proxy mesh を含みます。proxy を生成しない場合は
`{ outlines: false }` を渡します。

## 使い方 - アニメーション

```ts
const model = await loader.loadModel(modelSource);
const { animation } = await loader.loadAnimation(vmdSource);
model.runtime?.setAnimation(animation, model.mesh);

// 毎フレーム。
model.runtime?.tick(currentSeconds, model.mesh);
```

## 使い方 - カメラモーション

```ts
import {
  applyMmdCameraStateToThreeCamera,
  sampleMmdCameraTrackInto
} from "@yohawing/three-mmd-loader";

const { animation } = await loader.loadAnimation(cameraVmdSource);
const mmdFrameRate = 30; // MMD の 60 FPS モードでは 60 を指定。
const quantizeToMmdFrame = true; // 無制限 / 小数フレーム評価では false。
const cameraStateScratch = {
  distance: 0,
  position: [0, 0, 0] as [number, number, number],
  rotation: [0, 0, 0] as [number, number, number],
  fov: 1,
  perspective: true
};

// 毎フレーム。選択した MMD フレーム時間を渡す。
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

`applyMmdCameraStateToThreeCamera(...)` は MMD カメラ座標を Three.js 用に
変換します。MMD カメラの回転規約、距離、roll、FOV、perspective /
orthographic frame の切替を含みます。example viewer では同じ再生設定を
URL query で切り替えられます。

- `?mmdFrameRate=60`: MMD フレーム時間を 60 FPS として評価。
- `?mmdFrameQuantize=false`: 小数フレームを維持して無制限再生寄りに評価。
- query なしでは 30 FPS、MMD フレームに quantize する再生が既定。

## 使い方 - ポーズ (VPD)

```ts
const { pose } = await loader.loadPose(vpdSource);
const { animation } = await loader.loadPoseAnimation(vpdSource, "myPose");
model.runtime?.setAnimation(animation, model.mesh);
```

## 使い方 - 物理

物理は `MmdPhysicsBackend` で抽象化されていて、物理ライブラリを変更可能にしてあります。
現状の実装は Ammo.js (Bullet Physics) を使用しています。

```ts
import {
  createAmmoMmdPhysicsBackend,
  createDisabledMmdPhysicsBackend
} from "@yohawing/three-mmd-loader/physics";

// シミュレーションなしの fallback。
const disabledPhysicsBackend = createDisabledMmdPhysicsBackend();

// Ammo.js backend。
const Ammo = await import("ammo.js").then((m) => m.default ?? m);
const physicsBackend = createAmmoMmdPhysicsBackend(Ammo);
```

## Development

テスト、script、fixture、release check などの開発メモは
[DEVELOPMENT.md](./DEVELOPMENT.md) にあります。
