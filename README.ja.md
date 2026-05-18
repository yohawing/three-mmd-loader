# @yohawing/three-mmd-loader

Three.js で MMD モデルとモーションをロード・再生するための TypeScript ライブラリです。

English: [README.md](./README.md) / Roadmap: [ROADMAP.md](./ROADMAP.md)

## Demo

<!-- TODO: YouTube リンク差し替え -->
[![Demo video](demo-thumbnail.png)](https://www.youtube.com/)

## Compatibility Matrix

### フォーマット

| フォーマット | 解析 | ランタイム適用 |
| --- | --- | --- |
| PMX (モデル) | ✅ | ✅ |
| PMD (モデル) | ✅ | ✅ |
| VMD (モーション) | ✅ | ✅ (線形補間) |
| VPD (ポーズ) | ✅ | ✅ |
| PMM (プロジェクト) | ❌ | ❌ |
| .x / .vac (アクセサリ) | ❌ | ❌ |

### 機能

| 機能 | 状態 |
| --- | --- |
| SkinnedMesh / マテリアル / テクスチャ | ✅ |
| トゥーン / スフィアテクスチャ | ✅ |
| ボーン / モーフアニメーション | ✅ |
| VMD Bezier 補間 | ⚠️ パース済 / 適用は線形 |
| CCD IK (モデル定義 chain) | ✅ |
| IK link-local / parent-local clamp | ⚠️ 基礎実装のみ |
| 付与変形 (append transform) | ⚠️ メタデータ配線済 / 評価順序は進行中 |
| 物理 (Ammo backend) | ✅ 境界の裏で隔離 |
| 物理 (disabled fallback) | ✅ |
| カメラモーション適用 | ❌ |
| Three.js 視覚回帰ゲート | ❌ 未構築 |

## 動作確認

以下のアセットで読み込みと再生を確認しています:

- PMD モデル: 5 種類
- PMX モデル: 5 種類
- VMD モーション: 15 種類
- ユニットテスト fixture: PMX 7 / VMD 3

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
- [nanoem](https://github.com/hkrn/nanoem)

---

## インストール

```powershell
npm install @yohawing/three-mmd-loader three
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

## Visual Regression Renderer

`npm run render:visual` は deterministic な material case PNG を
`test-results/visual/current/` に出力し、`npm run render:visual:baseline` は
同じ manifest case を `test-results/visual/baseline/` に出力します。case は
`scripts/visual-regression/cases.manifest.json` に列挙され、単体では
`node scripts/visual-regression/render-cases.mjs --case <id>` で描画できます。
初期 baseline は regression detection 用であり、MMD/MMM/nanoem との視覚一致の
証明ではありません。renderer は 512x512 canvas、`pixelRatio=1`、
orthographic camera、固定 ambient / directional light、固定背景、
`NoToneMapping`、`SRGBColorSpace` を使います。外部 asset や
`MMD_VIEWER_DATA_ROOT` は読み込みません。

`npm run visual:report` は `baseline` と `current` を比較し、
`test-results/visual/diff/` に heatmap PNG、`test-results/visual/report.json`
に case ごとの `mean`、`p95`、`max`、threshold、pass/fail を含む
machine-readable report を出力します。threshold は manifest に置き、初期 CI
reporting 用に意図的に緩めています。

ユーザー所有の PMX/VMD asset に対する local/manual チェックでは、
リポジトリ外のディレクトリを `MMD_VIEWER_DATA_ROOT` に設定し、
`scripts/visual-regression/real-models.manifest.json` のローカルコピーへ
その root からの相対パスを記述します。`npm run render:visual:real-models`
は `test-results/visual/real-models/current/` に current PNG を出力し、
baseline 用 script は `test-results/visual/real-models/baseline/` に出力します。
`MMD_VIEWER_DATA_ROOT` 未設定時は skip message を表示して正常終了します。
real-model の出力と asset は local-only で、通常 CI の必須条件ではありません。

同じ real-model manifest から rest-pose の quaternion snapshot も取得できます:
`npm run snapshot:real-models:rest-pose:baseline`、
`npm run snapshot:real-models:rest-pose`、続いて
`npm run compare:real-models:rest-pose` を実行します。case には `watchBones`
を指定でき、未指定時は `センター`、`腰`、`下半身`、`上半身` を監視します。

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
