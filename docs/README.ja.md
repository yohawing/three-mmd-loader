# @yohawing/three-mmd-loader

Three.js 上で MMD モデルとモーションを読み込み・再生するためのライブラリです。

English: [README.md](../README.md)

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
| .x / .vac (アクセサリ) | ❌ | ❌ |

### 機能

| 機能 | 状態 |
| --- | --- |
| IK link-local / parent-local clamp | ⚠️ 単軸固定は対応 / 複数軸は部分対応 |
| 付与変形 (append transform) | ✅ PMX layer 順 |
| WASM Parser | ✅ PMX / PMD、TypeScript fallback あり |
| 物理 (Ammo backend) | ✅ Ammo.jsを使用。  |
| カメラモーション適用 | ❌ |
| Three.js 視覚回帰ゲート | ⚠️ script はあり / CI gate は未接続 |

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
