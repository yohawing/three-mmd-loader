---
title: パフォーマンスと破棄
description: ロード時間を測り、不要なモデルを解放します。
---

モデル切り替え時のメモリ増加を防いだり、読み込みや再生のボトルネックを見つけたりするには、計測とリソース破棄を組み合わせて設計します。負荷にはファイルサイズだけでなく、ボーン数、材質数、モーフ、テクスチャ、影の設定も影響します。

破棄のコード例は、[最初のモデルを表示する](/getting-started/first-model)で作成した`renderer`と`model`を使う前提です。

## ロード時間を測る

計測を有効にしたローダーでモデルを読み込むと、`model.diagnostics.performance`へ各段階の所要時間が記録されます。

```ts
import { ThreeMmdLoader } from "@yohawing/three-mmd-loader";

const loader = new ThreeMmdLoader({ performance: true });
const model = await loader.loadModel("/models/character/model.pmx");
console.table(model.diagnostics.performance);
```

`performance: { onMeasure: measure => console.log(measure) }`を指定すると、各計測が完了するたびに結果を受け取れます。ロード計測にはGPUの初回シェーダーコンパイル時間がすべて含まれるわけではないため、初回描画と定常再生はブラウザーのPerformanceパネルで測ってください。

設定変更の前後を比べるときは、同じモデル、モーション、再生区間、レンダラー、画面サイズを使います。初回コンパイル直後の数フレームだけでなく、定常状態で繰り返し計測してください。

## モデルを破棄する

モデルが不要になったら、更新ループから外してから`disposeMmdModel()`で解放します。

```ts
import { disposeMmdModel } from "@yohawing/three-mmd-loader";

renderer.setAnimationLoop(null);
disposeMmdModel(model);
```

`disposeMmdModel()`はモデルを親から外し、ジオメトリ、マテリアル、スケルトン、テクスチャ、破棄可能なランタイムを解放します。

テクスチャの解放範囲は第2引数の`textures`オプションで選べます。

- `"all"`（既定）：すべてのテクスチャを破棄します。
- `"owned"`：ローダーが所有権を持つテクスチャだけを破棄します。
- `"none"`：テクスチャを破棄しません。別モデルと共有する場合はこちらを指定し、共有元で寿命を管理してください。

## 破棄の責任分担

`disposeMmdModel()`が解放する範囲と、呼び出し側で解放するリソースの分担は次のとおりです。

| リソース | 作成元 | 解放方法 | 補足 |
| --- | --- | --- | --- |
| `ThreeMmdModel`（メッシュ、ジオメトリ、マテリアル、スケルトン、組み込みランタイム） | `loader.loadModel()` | `disposeMmdModel(model)` | 親（`scene`）からの削除と、破棄可能なランタイムの`dispose()`も実行 |
| モデルが参照するテクスチャ | ローダーまたは呼び出し側 | `disposeMmdModel(model, { textures })` | `"none"`または外部作成テクスチャの`"owned"`指定時は呼び出し側で破棄 |
| 物理バックエンド（`CustomBulletMmdPhysicsBackend`など） | 呼び出し側 | `physicsBackend.dispose()` | `disposeMmdModel()`は解放しないため、モデル破棄後に実行 |
| カメラ・ライト用サンプラー | `loader.createCameraTrackSampler()`など | `sampler.dispose()` | 複数回呼んでも安全 |
| `WorkerMmdRuntimeFactory` | `createWorkerMmdRuntimeFactory()` | `runtimeFactory.dispose()` | ファクトリー所有のプールを解放。外部から渡した`MmdRuntimeWorkerPool`は渡した側で`dispose()`を実行 |
| TSLパイプラインへのモデル接続 | `pipeline.attach(model)` | `pipeline.detach(model)`の後に`disposeMmdModel(model)` | 先に`detach()`してからモデルを破棄 |
| `MmdTslPipeline`本体 | `createMmdTslPipeline()` | `pipeline.dispose()` | レンダーループ停止後、全モデル破棄後に実行 |
| `WebGLRenderer` / `WebGPURenderer` | 呼び出し側 | `renderer.dispose()` | アプリケーション終了時に実行 |

## 大きなモデルを扱う

負荷を下げるには、まず不要な輪郭線（エッジ）や影を減らし、どの処理が効くかを計測してください。モーフ関連の読み込み設定は描画経路に合わせて選び、TSLでは`pipeline.createModelLoadOptions()`を使います。

モデルのロードを毎フレーム繰り返したり、更新ループ内で配列やベクトルを作り続けたりしない構成にします。具体的なアンチパターンは、[よくある間違い](/concepts/common-pitfalls)を参照してください。

CPU側のポーズ評価がボトルネックになっている場合は、[Worker API](/api/worker)で評価を別スレッドへ移せます。ただし、WorkerはGPUの描画負荷やTSLのボーン数上限を解消しません。
