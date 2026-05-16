# @yohawing/three-mmd-loader

English: [README.md](./README.md)

Roadmap: [ROADMAP.md](./ROADMAP.md)

Three.js 向け MMD モデル / アニメーションローダーとランタイムを 1 つに
まとめた TypeScript パッケージです。標準的な MMD モデル、モーション、
ポーズアセットを Three.js 向けのデータへ読み込みつつ、パーサー、
ランタイム、アダプター、物理バックエンドの境界を明確に保ちます。

## インストール予定

```powershell
pnpm add @yohawing/three-mmd-loader three
```

`three` は peer dependency です。

公開準備メモ: このパッケージはまだワークスペース内で private です。
バージョンと最終的な `private: true` の削除は、リリース時の判断として
残っています。

## パッケージ境界

```text
@yohawing/three-mmd-loader
@yohawing/three-mmd-loader/parser
@yohawing/three-mmd-loader/runtime
@yohawing/three-mmd-loader/three
@yohawing/three-mmd-loader/physics
```

- `parser`: PMX、PMD、VMD、VPD のバイナリ / テキスト解析。
- `runtime`: Three.js アニメーション再生、フレーム状態、付与変形メタデータ
  処理、CCD IK 評価。
- `three`: `ThreeMmdLoader`、Three.js geometry / skeleton / material
  ヘルパー、texture ヘルパー、animation clip 生成。
- `physics`: `MmdPhysicsBackend`、disabled fallback backend、validation /
  debug ヘルパー、任意の Ammo backend 実装。

## 使い方 - モデル読み込み

```ts
import { ThreeMmdLoader } from "@yohawing/three-mmd-loader";

const loader = new ThreeMmdLoader();
const { mesh } = await loader.loadModel(source); // Uint8Array | ArrayBuffer | File
scene.add(mesh);
```

## 使い方 - アニメーション

```ts
const { animation, clip } = await loader.loadAnimation(vmdSource);

// または model を渡して、model の bones に解決された clip を得る。
const { clip } = await loader.loadAnimation(vmdSource, model);
model.runtime?.setAnimation(clip, model.mesh);

// 毎フレーム。
model.runtime?.evaluate(deltaSeconds);
```

## 使い方 - ポーズ (VPD)

```ts
const { pose } = await loader.loadPose(vpdSource);
const { clip } = await loader.loadPoseAnimation(vpdSource, "myPose", model);
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

## 現在の状態

- Parser: PMX、PMD、VMD、VPD の解析が実装済みです。VMD の全キーフレーム
  データも含みます。
- Runtime: `AnimationMixer` による VMD アニメーション再生、
  `mesh.userData.mmdIkChains` から配線されたモデル IK chain を使う CCD IK、
  `bone.userData.mmdAppendTransform` 上の付与変形メタデータ配線が実装済みです。
- Three.js: `ThreeMmdLoader.loadModel`、`loadAnimation`、`loadPose`、
  `loadPoseAnimation` は実装済みです。
- Physics: disabled fallback と Ammo backend は `MmdPhysicsBackend` 境界の背後に
  隔離されています。

## 制限事項

- VMD Bezier 補間パラメータは parse して保持していますが、clip 生成ではまだ
  線形補間を使っています。
- layer と `transformAfterPhysics` を含む付与変形の完全な評価順序は進行中です。
- PMX IK link-local / parent-local clamp は基礎実装のみです。
- baseline screenshot を使う Three.js visual regression gate は未構築です。
- native-equivalent physics behavior は主張していません。

初期リリースの対象外:

- Three.js 以外の renderer adapter。
- cross-renderer visual equivalence の主張。
- 最適化された独自の model / motion format。
- WebGPU renderer path。
- 別個に公開される physics package。

## Acknowledgements

このプロジェクトは Babylon-MMD、nanoem、Saba を参考にして開発されています。
