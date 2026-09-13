---
title: WebGPU
description: TSLパイプラインと低水準の材質APIを使い分けます。
---

`/webgpu`は`three/webgpu`のレンダラー向けAPIです。ルートexportには含まれません。`createMmdTslPipeline()`はネイティブWebGPUを必須とし、WebGLへフォールバックしたレンダラーを拒否します。

## パイプラインを使う

| API | 呼び出す時点 |
| --- | --- |
| `createMmdTslPipeline(renderer, options)` | レンダラーとライトを作成した後。非同期初期化を待つ |
| `pipeline.createModelLoadOptions()` | モデルを読み込む前 |
| `pipeline.attach(model)` | 読み込み完了後 |
| `pipeline.render(scene, camera)` | モデルの更新後、毎フレーム |
| `pipeline.detach(model)` | モデルの破棄前 |
| `pipeline.dispose()` | パイプラインの終了時 |

同じモデルを再接続した`attach()`は`false`を返します。初回接続ではレンダラーのボーン数上限も検査します。`setSelfShadowEnabled()`、`setSelfShadowMode()`で影を切り替え、`getSelfShadowDebugState()`で接続状態を確認できます。

## マテリアルを直接組み立てる

`createMmdTslToonMaterial()`、`createMmdTslMaterialFromSource()`、`replaceMmdModelMaterialsWithTsl()`は独自の描画構成向けです。直接使う場合は、材質状態の同期、モーフ計算、影、破棄も呼び出し側で組み立てます。通常はパイプラインから始めます。

[表示例と制約](/guides/webgpu) / [WebGPUの全API](/api/reference/webgpu) / [パイプラインの型](/api/reference/webgpu/interfaces/MmdTslPipeline)
