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
| SkinnedMesh / マテリアル / テクスチャ | ✅ |
| トゥーン / スフィアテクスチャ | ✅ |
| ボーン / モーフアニメーション | ✅ |
| VMD Bezier 補間 | ✅ |
| CCD IK (モデル定義 chain) | ✅ |
| IK link-local / parent-local clamp | ⚠️ 単軸固定は対応 / 複数軸は部分対応 |
| 付与変形 (append transform) | ✅ PMX layer 順 |
| 物理 (Ammo backend) | ✅ 境界の裏で隔離 |
| 物理 (disabled fallback) | ✅ |
| カメラモーション適用 | ❌ |
| Three.js 視覚回帰ゲート | ⚠️ script はあり / CI gate は未接続 |

## 動作確認

読み込みと再生は、コミット済み fixture と local/manual チェックで確認しています。
コミット済みの release evidence は現在以下です:

- ユニットテスト fixture: PMX 7 / VMD 3

追加のユーザー所有 PMD、PMX、VMD asset は local smoke check に使っていますが、
それらの asset と screenshot は package には含めていません。

## 対象外（初期リリース）

- Three.js 以外の renderer adapter
- cross-renderer visual equivalence の主張
- 最適化された独自 model / motion フォーマット
- WebGPU renderer path
- 別個に公開される physics パッケージ
- PMM プロジェクトの読み込み
- ネイティブ MMD と完全に同等な物理挙動

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

## パッケージ境界

```text
@yohawing/three-mmd-loader
@yohawing/three-mmd-loader/parser
@yohawing/three-mmd-loader/runtime
@yohawing/three-mmd-loader/three
@yohawing/three-mmd-loader/physics
```

- `parser`: PMX、PMD、VMD、VPD のバイナリ / テキスト解析。
- `runtime`: Three.js アニメーション再生、フレーム状態、付与変形処理、
  CCD IK 評価。
- `three`: `ThreeMmdLoader`、Three.js geometry / skeleton / material
  ヘルパー、texture ヘルパー、MMD animation 読み込み。
- `physics`: `MmdPhysicsBackend`、disabled fallback backend、validation /
  debug ヘルパー、任意の Ammo backend 実装。

## 使い方 - モデル読み込み

```ts
import { ThreeMmdLoader } from "@yohawing/three-mmd-loader";

const loader = new ThreeMmdLoader();
const model = await loader.loadModel(source); // Uint8Array | ArrayBuffer | File | string (URL/path は fetch で解決)
scene.add(model.mesh, ...model.renderOrderMeshes, ...model.outlineMeshes);

const remoteModel = await loader.loadModel("/models/example.pmx");
scene.add(remoteModel.mesh, ...remoteModel.renderOrderMeshes, ...remoteModel.outlineMeshes);
```

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

物理は `MmdPhysicsBackend` 境界の背後に公開されています。disabled backend は
シミュレーションを行わない予測可能な fallback で、Ammo backend は Ammo.js
を明示的に使う呼び出し側向けに提供されています。

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
