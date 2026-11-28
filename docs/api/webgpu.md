---
title: WebGPU
description: TSLパイプラインと低水準のマテリアルAPIを使い分けます。
---

`@yohawing/three-mmd-loader/webgpu`は、`three/webgpu`のレンダラー向けにTSLパイプラインと低水準マテリアルAPIを提供するモジュールです。ルートexportには含まれません。

`./webgpu`は実験的なAPIであり、1.0.0以降もsemverの保証対象外です。マイナーリリースでも破壊的変更が入ることがある点に注意してください。

## パイプラインを使う

`createMmdTslPipeline()`はネイティブWebGPUを必須とし、WebGLへフォールバックしたレンダラーを拒否します。詳しい制約は[WebGPU / TSL](/guides/webgpu)を参照してください。

| API | 呼び出す時点 |
| --- | --- |
| `createMmdTslPipeline(renderer, options)` | レンダラーとライトを作成した後。非同期初期化を待つ |
| `pipeline.createModelLoadOptions()` | モデルを読み込む前 |
| `pipeline.attach(model)` | 読み込み完了後 |
| `pipeline.render(scene, camera)` | モデルの更新後、毎フレーム |
| `pipeline.detach(model)` | モデルの破棄前 |
| `pipeline.dispose()` | パイプラインの終了時 |

同じモデルを再接続すると`attach()`は`false`を返します。初回接続ではレンダラーのボーン数上限も検査されます。

セルフシャドウの切り替えには`setSelfShadowEnabled()`と`setSelfShadowMode()`を使い、接続状態の取得には`getSelfShadowDebugState()`を使えます。

## マテリアルを直接組み立てる

独自の描画構成を組む場合は、次の低水準APIを使えます。

- `createMmdTslToonMaterial()`
- `createMmdTslMaterialFromSource()`
- `replaceMmdModelMaterialsWithTsl()`

これらを直接使う場合は、材質状態の同期、モーフ計算、影、破棄も呼び出し側で組み立てる必要があります。通常はパイプラインから始めてください。

[表示例と制約](/guides/webgpu) / [WebGPUの全API](/api/reference/webgpu) / [パイプラインの型](/api/reference/webgpu/interfaces/MmdTslPipeline)
