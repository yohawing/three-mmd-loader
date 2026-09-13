---
title: パフォーマンスと破棄
description: ロード時間を測り、不要なモデルを解放します。
---

ロード、初回描画、再生中の処理を分けて測ります。モデルのファイルサイズだけでなく、ボーン数、材質数、モーフ、テクスチャ、影の設定も負荷に影響します。

## ロード時間を測る

計測を有効にしたローダーを作成します。

```ts
import { ThreeMmdLoader } from "@yohawing/three-mmd-loader";

const loader = new ThreeMmdLoader({ performance: true });
const model = await loader.loadModel("/models/character/model.pmx");
console.table(model.diagnostics.performance);
```

`performance: { onMeasure: measure => console.log(measure) }`で計測結果を受け取ることもできます。ロード計測にはGPUの初回シェーダーコンパイル時間がすべて含まれるわけではありません。ブラウザーのPerformanceパネルで初回描画と定常再生も確認します。

比較時は同じモデル、モーション、再生区間、レンダラー、画面サイズを使います。初回コンパイル後の数フレームだけでなく、繰り返し計測した値を比較します。

## モデルを破棄する

以下は作成済みの`model`と`renderer`を終了する例です。更新ループからモデルを外してから破棄します。

```ts
import { disposeMmdModel } from "@yohawing/three-mmd-loader";

renderer.setAnimationLoop(null);
disposeMmdModel(model);
```

`disposeMmdModel()`はモデルを親から外し、ジオメトリ、マテリアル、スケルトン、テクスチャと破棄可能なランタイムを解放します。テクスチャは既定で全て破棄します。別モデルと共有する場合は`{ textures: "none" }`を指定し、共有元で寿命を管理します。`"owned"`は所有情報のあるテクスチャだけを対象にします。

TSLモデルは先に`pipeline.detach(model)`を呼びます。全モデルの終了後は`pipeline.dispose()`、アプリケーション終了時は`renderer.dispose()`も呼びます。自分で作成した物理バックエンドやWorkerファクトリーは、それぞれの`dispose()`で解放します。

## 大きなモデルを扱う

まず不要な輪郭線や影を減らし、どの処理に効くか測ります。モーフ関連の読み込み設定は描画経路と組み合わせて選び、TSLでは`pipeline.createModelLoadOptions()`を使います。モデルのロード処理を毎フレーム繰り返したり、更新ループで配列やベクトルを作り続けたりしない構成にします。

CPU側の評価が支配的な場合は[Worker](/api/worker)を検討します。WorkerはGPUの描画負荷やTSLのボーン数上限を解消しません。
