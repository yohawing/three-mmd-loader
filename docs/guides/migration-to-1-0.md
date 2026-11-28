---
title: 1.0.0への移行
description: 0.9.xで非推奨APIを見つけ、1.0.0でも使える呼び出し方に切り替えます。
---

`0.9.x`で非推奨になったAPIを洗い出し、`1.0.0`でもそのまま動く呼び出し方へ切り替えるためのガイドです。`0.9.0`は`1.0.0`で公開APIを固定するための移行リリースであり、非推奨の名前や呼び出し方も`0.9.x`の間は引き続き動作します。`1.0.0`で削除される前に順に置き換えてください。

## importと型名を変更する

TypeScript対応エディターでは、`@deprecated`の付いた名前に取り消し線が表示されます。VS Codeでは名前にポインターを合わせて移行先を見てください。非推奨の使用はTypeScript言語サービスの提案診断なので、通常の`tsc --noEmit`が成功しても該当箇所は残る点に注意してください。

| 0.9.0で非推奨になった使い方 | 移行先 |
| --- | --- |
| 各分野の関数や単独型をルートからimport | `/parser`、`/runtime`、`/three`、`/physics`からimport |
| `CameraState`、`LightState`、`SelfShadowState` | `MmdCameraState`、`MmdLightState`、`MmdSelfShadowState` |
| `Diagnostic`、`DiagnosticCategory` | `MmdDiagnostic`、`MmdDiagnosticCategory` |
| `DefaultMmdRuntimeOptions` | `MmdRuntimeOptions` |

`1.0.0`のルートには、`ThreeMmdLoader`、モデルの破棄、ファイルの分類・検索、フォルダーとテクスチャの解決が残ります。カメラ・ライト・影の再生と描画に使うヘルパー、および公開シグネチャで使う型もルートに残ります。

パーサー関数、ランタイムクラス、Three.jsの低レベル関数、物理ヘルパー、各分野の単独型は同じパッケージのサブパスへ移してください。たとえばPMXのメタデータを読むコードは、import元だけを変更します。

```diff
- import { parsePmxMetadata } from "@yohawing/three-mmd-loader";
+ import { parsePmxMetadata } from "@yohawing/three-mmd-loader/parser";
```

## モデルの読み込みと再生を変更する

| 対象 | 従来の使い方 | 0.9.0からの使い方 |
| --- | --- | --- |
| 読み込み設定 | `outlines`、`renderOrderProxies` | `outline`、`materialRenderOrder`を指定 |
| ロード結果 | `model.object`、`model.textureDiagnostics` | `model.root`、`model.diagnostics.textures`を参照 |
| モデル情報 | `mesh.userData`の内部キーを参照 | `model.metadata`、`model.bones`などを参照 |
| 同期関数 | `syncThreeMmdRuntimeToMesh`など | `model.update(seconds)`で同期まで完結 |
| ランタイムの更新 | `tick(seconds, mesh, options)` | `tick(seconds, { ...options, mesh })`へ変更 |
| リセット | `runtime.reset()` | `seek()`、`resetPose()`、`clearAnimation()`に分割 |
| カメラ・ライト | `createCameraTrack()`など | `createCameraTrackSampler()`などを使用 |

各変更の要点は次のとおりです。

- **モデル情報**：`model.metadata`、`model.bones`、`model.rigidBodies`、`model.joints`から読み取れます。`mesh.userData`の内部キーは互換性保証の対象外です。
- **更新と同期**：`syncThreeMmdRuntimeToMesh`と`syncThreeMmdRuntimeToModel`は非推奨です。通常は`model.update(seconds)`が同期まで処理します。ランタイムを直接呼ぶ場合は、次の例のように書き換えてください。
- **リセット**：再生位置の変更は`seek(seconds)`、ポーズの初期化は`resetPose()`、モーション解除は`clearAnimation()`を使い分けてください。
- **カメラとライト**：`loader.createCameraTrack()`、`loader.createLightTrack()`、WASM専用ヘルパーは非推奨です。今後は`createCameraTrackSampler()`または`createLightTrackSampler()`でサンプラーを作成します。`sampleInto(frame, target)`が状態を返したときだけ反映し、終了時に`dispose()`を呼んでください。

ランタイムの`tick()`を直接呼ぶ場合の書き換え例です。

```diff
- runtime.tick(seconds, mesh, options);
+ runtime.tick(seconds, { ...options, mesh });
```

## 低レベルAPIを置き換える

低レベルのヘルパーや専用サブパスを利用している場合は、次の内容に沿って置き換えてください。

- **Three.jsの材質・輪郭線フック**：`loadModel()`が材質、スキニング、輪郭線（エッジ）を設定します。材質を単体で作る場合は、`createThreeMmdMaterials`の後に`applyThreeMmdMaterialTextures`を呼んでください。透過判定の結果は`model.diagnostics.materials`から読めます。
- **IK・スキニング・物理の内部ヘルパー**：IKはランタイムが内部で解きます。`CcdIkSolver`と関連型、CPU参照用のスキニング関数、`MmdPhysicsEulerTuple`には直接の代替がありません。
- **WASMのDTO変換**：VMDは`loadMmdAnimWasmVmd`、VPDは`loadMmdAnimWasmVpd`で読み込んでください。
- **Workerの生成と通信**：`createWorkerMmdRuntime`や低レベルのポーズ転送・通信APIは非推奨です。`createWorkerMmdRuntimeFactory(options)`をローダーの`runtimeFactory`へ渡してください。設定型は`WorkerMmdRuntimeOptions`へ、プールスロットの解放は`lease.release()`または`lease.dispose()`へ変更します。
- **WebGPU**：`/webgpu`の`createModelLoadOptions`は非推奨です。`createMmdTslModelLoadOptions`または`pipeline.createModelLoadOptions()`へ変更してください。パイプラインの接続設定`selfShadow`は`selfShadowEnabled`へ変更します。実験的な`/webgpu`は1.xでもsemverの互換性保証の対象外です。
