# @yohawing/three-mmd-loader

Three.js 向け MMD ローダー / ランタイムのリリース予定パッケージです。

Roadmap: [ROADMAP.md](./ROADMAP.md)

このパッケージは、標準的な MMD モデルとアニメーションアセットを
Three.js で扱うための TypeScript-first なリリース対象です。初期リリース
では、パーサー、ランタイム、Three.js アダプター、将来的な任意の物理
バックエンド境界を、1 つのパッケージ内に収める方針です。

> 移行メモ: このパッケージはまだワークスペースから移植中です。現在の
> リリースリポジトリには、パッケージの外枠、メタデータ / セクション
> インベントリパーサー、PMX / PMD モデルパーサー、レンダラー非依存の VPD
> ポーズ解析、最小限のランタイム facade、最小限の CCD IK ソルバー、
> Three.js モデル読み込み path、Three.js アダプター内のヘルパー関数、
> 任意の Ammo 物理バックエンド境界が含まれています。`ThreeMmdLoader` による
> 完全な VMD / VPD モーション読み込みはリリース目標であり、この
> ディレクトリではまだ完了していません。

## インストール予定

```powershell
pnpm add @yohawing/three-mmd-loader three
```

`three` は peer dependency です。

公開準備メモ: このパッケージはまだワークスペース内で private です。
バージョンと最終的な `private: true` の削除は、リリース時の判断として
残っています。

## 現在のパッケージ境界

```text
@yohawing/three-mmd-loader
@yohawing/three-mmd-loader/parser
@yohawing/three-mmd-loader/runtime
@yohawing/three-mmd-loader/three
@yohawing/three-mmd-loader/physics
```

現在および予定している責務:

- `parser`: 現在は PMX、PMD、VMD、VPD のメタデータ / インベントリ解析、
  PMX / PMD モデル解析、レンダラー非依存の VPD ポーズ解析に対応して
  います。完全なモーション解析出力は今後の作業です。
- `runtime`: 現在はフレーム状態 facade と、整理された CCD IK の足場を提供
  しています。ボーン、モーフ、付与変形、IK 統合、カメラ、ライト、物理
  状態を含む完全な MMD アニメーション評価は今後の作業です。
- `three`: 現在は model source 読み込み、PMX / PMD モデルの
  `THREE.SkinnedMesh` への組み立て、material / texture ヘルパー、
  アダプター内の geometry、skeleton、texture、matrix ヘルパーを提供して
  います。motion、runtime sync、camera、light を含む完全な Three.js
  ローダー統合は今後の作業です。
- `physics`: 現在は interface、disabled backend、debug / context ヘルパー、
  legacy contract bridge ヘルパー、任意の Ammo backend 実装を提供して
  います。物理機能はこのパッケージ内に留め、別パッケージとしては公開
  しません。

## 現在の API 範囲

現在のリリースリポジトリでは、フォーマット検出、バイナリヘルパー、
メタデータインベントリパーサー、PMX / PMD モデルパーサー、最小限の
ランタイム facade、CCD IK ソルバー境界、disabled / Ammo 物理バックエンド、
Three.js モデルローダー facade を公開しています。

```ts
import {
  BinaryReader,
  detectModelFormat,
  parsePmdMetadata,
  parsePmxMetadata,
  parseVmdMetadata,
  parseVpdMetadata
} from "@yohawing/three-mmd-loader/parser";

const bytes = new Uint8Array(await file.arrayBuffer());
const format = detectModelFormat(bytes);
const reader = new BinaryReader(bytes);

if (format === "pmx") {
  const metadata = parsePmxMetadata(bytes);
  console.log(metadata.name, metadata.counts);
}
```

VPD ポーズデータは、レンダラー非依存のパーサー出力として利用できます。

```ts
import { parseVpdPose } from "@yohawing/three-mmd-loader/parser";

const vpdBytes = new Uint8Array(await vpdFile.arrayBuffer());
const pose = parseVpdPose(vpdBytes);
console.log(pose.modelFile, pose.bonePoses.length);
```

`DefaultMmdRuntime`、`CcdIkSolver`、`DisabledMmdPhysicsBackend`、
`AmmoMmdPhysicsBackend`、`ThreeMmdLoader` は移行用 facade として存在します。
`ThreeMmdLoader.loadModel(...)` は現在、PMX / PMD data を
`THREE.SkinnedMesh` に読み込み、texture diagnostics を返します。motion と
pose の load 系メソッドは、animation と runtime sync の移植が完了するまで、
明示的な not implemented error を投げます。

Three.js facade では、アダプター内ヘルパーも公開しています。

- `isModelSource(...)` と `readModelSourceBytes(...)`
- geometry buffer、skinning attribute、SDEF attribute、material group、
  morph attribute 用の `createThreeBufferGeometry(...)`
- アダプター内 skeleton data 用の `createThreeSkeleton(...)`
- テクスチャパスと toon 参照のユーティリティ
- column-major のランタイム matrix 変換用 `mmdWorldMatrixToThree(...)`

これらのヘルパーは直接テストされており、model assembly は
`ThreeMmdLoader.loadModel(...)` に接続されています。
`readModelSourceBytes(...)` は現在、`Uint8Array`、`ArrayBuffer`、ブラウザー
の `File` に対応しており、`Uint8Array` と `ArrayBuffer` の内容はコピー
しません。文字列 source は `ThreeMmdLoader` の検証では受け付けますが、
まだ読み込みません。URL とファイルパスの解決方針は、ローダー側の今後の
判断として残っています。

## 現在の状態

現在のリリースリポジトリ実装は、初期の移行スライスであり、完全な
ローダーではありません。

- Parser support は、フォーマット検出、バイナリヘルパー、PMX / PMD /
  VMD / VPD のメタデータとセクション数インベントリ解析、PMX / PMD モデル
  解析、さらに `parseVpdPose(...)` によるレンダラー非依存の VPD ポーズ解析
  に対応しています。
- `DefaultMmdRuntime` は、最初の整理されたランタイム facade とフレーム状態
  境界を提供します。
- `CcdIkSolver` は、単純で有限な CCD の足場を提供します。完全な MMD IK
  chain behavior、PMX link limit、local-axis handling は今後の作業です。
- Three.js の geometry、skeleton、material、texture-path、runtime-matrix
  ヘルパーは、アダプター内の移行ユーティリティとして利用できます。
- `ThreeMmdLoader.loadModel(...)` は PMX / PMD model source に接続済みです。
  animation、pose、runtime-sync の `load` path は未実装で、明示的なエラーを
  投げます。
- Physics は現在、`MmdPhysicsBackend`、disabled backend、任意の Ammo backend
  実装を公開しています。

## 制限事項

リリース向けの説明では、以下を完成済みとして扱わないでください。

- この `three-mmd-loader` ディレクトリ内での、完全な VMD / VPD モーション
  読み込み。
- `ThreeMmdLoader` 経由の完全な Three.js morph target animation、
  camera / light、runtime sync。
- 完全な SDEF behavior または native-equivalent IK。
- このパッケージが管理する将来の Three.js visual regression baseline を
  超える、default material、shadow、toon、outline appearance。
- native-equivalent physics behavior。
- viewer / player UI の仕上げ。

初期リリースの対象外:

- Three.js 以外の renderer adapter。
- cross-renderer visual equivalence の主張。
- 最適化された独自の model / motion format。
- WebGPU renderer path。
- 別個に公開される physics package。

## Evidence

リリース信頼性は以下で追跡します。

- ランタイム状態比較のための `runtime numeric evidence`
- このパッケージが管理する baseline 向けに予定している Three.js screenshot
  regression check
- viewer load、nonblank rendering、finite diagnostics のための
  `smoke regression evidence`
- asset presence と classification のための `fixture inventory evidence`

## Acknowledgements

このプロジェクトは Babylon-MMD、nanoem、Saba を参考にして開発されています。
