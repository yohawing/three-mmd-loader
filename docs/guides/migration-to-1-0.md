---
title: 1.0.0への移行
description: 0.9.xで非推奨APIを見つけ、1.0.0でも使える呼び出し方に切り替えます。
---

0.9.0は、1.0.0で公開APIを固定するための非推奨化リリースです。非推奨の名前や呼び出し方は0.9.xの間も動作します。1.0.0で削除される前に、次の表に沿って置き換えてください。

## importと型名を変更する

TypeScript対応エディタでは、`@deprecated`の付いた名前に取り消し線が表示されます。VS Codeでは名前にポインターを合わせて移行先を確認できます。非推奨の使用はTypeScript言語サービスの提案診断なので、通常の`tsc --noEmit`が成功しても該当箇所は残り得ます。

| 0.9.0で非推奨になった使い方 | 移行先 |
| --- | --- |
| パーサー関数、ランタイムクラス、Three.jsの低レベル関数、物理ヘルパーや各分野の単独の型をルートからimport | 引き続き公開される名前は、それぞれ同じパッケージの`/parser`、`/runtime`、`/three`、`/physics`からimportします。 |
| `CameraState`、`LightState`、`SelfShadowState` | `MmdCameraState`、`MmdLightState`、`MmdSelfShadowState` |
| `Diagnostic`、`DiagnosticCategory`、`DefaultMmdRuntimeOptions` | `MmdDiagnostic`、`MmdDiagnosticCategory`、`MmdRuntimeOptions` |

ルートには`ThreeMmdLoader`、モデルの破棄、ファイルの分類・検索、フォルダーやテクスチャの解決、カメラ・ライト・影の再生と描画に使うヘルパー、および公開シグネチャで使う型が残ります。例えば、PMXのメタデータを読むコードはimport元だけ変更します。

```diff
- import { parsePmxMetadata } from "@yohawing/three-mmd-loader";
+ import { parsePmxMetadata } from "@yohawing/three-mmd-loader/parser";
```

## モデルの読み込みと再生を変更する

| 対象 | 従来の使い方 | 0.9.0からの使い方 |
| --- | --- | --- |
| 読み込み設定 | `outlines`、`renderOrderProxies` | `outline`、`materialRenderOrder`を指定します。 |
| ロード結果 | `model.object`、`model.textureDiagnostics` | `model.root`、`model.diagnostics.textures`を参照します。 |
| モデル情報 | `mesh.userData`の内部キーを参照 | `model.metadata`、`model.bones`、`model.rigidBodies`、`model.joints`で読み取れます。内部キーは互換性保証の対象外です。 |
| 更新と同期 | `tick(seconds, mesh, options)`、`syncThreeMmdRuntimeToMesh`、`syncThreeMmdRuntimeToModel` | 通常は`model.update(seconds)`で同期まで行います。ランタイムを直接使う場合は下の例のようにメッシュを渡します。 |
| リセット | `runtime.reset()` | 再生位置を変えるには`seek(seconds)`、ポーズを戻すには`resetPose()`、モーションを解除するには`clearAnimation()`を使います。 |
| カメラとライト | `loader.createCameraTrack()`、`loader.createLightTrack()`、WASM専用の生成・評価ヘルパー | ローダーの`createCameraTrackSampler(animation)`、`createLightTrackSampler(animation)`で作成します。`sampleInto(frame, target)`が状態を返したときだけ反映し、終了時に`dispose()`を呼びます。 |

```diff
- runtime.tick(seconds, mesh, options);
+ runtime.tick(seconds, { ...options, mesh });
```

## 低レベルAPIを置き換える

| 対象 | 移行方法 |
| --- | --- |
| Three.jsの材質・輪郭線フック | `loadModel()`が材質、スキニング、輪郭線を設定します。材質を単体で作る場合は`createThreeMmdMaterials`と`applyThreeMmdMaterialTextures`を使います。透過判定の結果は`model.diagnostics.materials`で確認できます。 |
| IK・スキニング・物理の内部ヘルパー | IKはランタイムが解きます。`CcdIkSolver`と関連型、CPU参照用のスキニング関数、`MmdPhysicsEulerTuple`には直接の代替がありません。 |
| WASMのDTO変換 | VMDとVPDはそれぞれ`loadMmdAnimWasmVmd`と`loadMmdAnimWasmVpd`で読み込みます。 |
| Workerの生成と通信 | `createWorkerMmdRuntime`や低レベルのポーズ転送・通信APIを直接使っている場合は、`createWorkerMmdRuntimeFactory(options)`をローダーの`runtimeFactory`に渡します。設定型は`WorkerMmdRuntimeOptions`、プールから借りたスロットの解放は`lease.release()`または`lease.dispose()`に変更します。 |
| WebGPU | `/webgpu`の単独関数`createModelLoadOptions`は`createMmdTslModelLoadOptions`へ、パイプラインの接続設定`selfShadow`は`selfShadowEnabled`へ変更します。`pipeline.createModelLoadOptions()`も使えます。実験的な`/webgpu`は1.xでもsemverの互換性保証の対象外です。 |
