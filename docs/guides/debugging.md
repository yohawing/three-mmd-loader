---
title: デバッグ
description: 読み込み、ポーズ、描画の順に原因を絞ります。
---

表示崩れやポーズのずれが起きたときは、読み込み、ポーズ評価、描画の順に状態を切り分けます。見た目だけで原因を決めつけず、同じモデルと同じ時刻で設定を一つずつ変えて比較してください。

このページのコード例は、読み込み済みの`model`を使う前提です。手元のアセット自体が正常に読めるかを先に確かめたい場合は、[Live demo](https://three.mmd.yohawing.com/)でフォルダーを読み込んで挙動を比べることもできます。

## 読み込みを確かめる

読み込み済みの`model`から、パーサー、テクスチャ、材質の診断情報を出力します。

```ts
console.log(model.source, model.diagnostics.core);
console.table(model.diagnostics.textures);
console.table(model.diagnostics.materials);
```

URLへの応答が`200`でも、本文が開発サーバーのHTMLエラーページなら読み込みに失敗します。開発者ツールのネットワークパネルで、モデル、WASM、テクスチャの応答内容も見てください。`onCoreFallback`をローダーへ渡すと、WASMパーサーからTypeScript実装へフォールバックした理由を取得できます。

## ポーズを比較する

まず物理とIKを外した状態で評価結果を出力します。

```ts
model.update(1, { physics: false, ik: false });
console.log(model.runtime.frameState());
console.log(model.runtime.debugState());
```

次にIKを戻し、その後に物理を戻して差分を確かめてください。`debugState()`では、VMD補間（`vmdInterpolation`）、付与変形（`appendTransform`）、IK（`ik`）、物理（`physics`）の各段階の結果を比較できます。

通常再生の毎フレームで大量にログを出力すると計測結果が変わるため、停止中に取得してください。Worker使用時に厳密な時刻の結果を見たい場合は、`await model.updateAsync(1)`を使います。

## 描画を比較する

モデルがカメラの視野内にあるか、ライトが当たっているか、`model.root`をシーンへ追加したかを順に点検してください。そのうえで、輪郭線（エッジ）、影、透過判定の設定を一つずつ変えて見比べます。

TSLだけで起きる問題なら、通常の`WebGLRenderer`でも同じアセットを描画して比較してください。

不具合を報告するときは、ライブラリとThree.jsのバージョン、ブラウザー、GPU、描画経路、発生時刻、変更した設定を添えてください。症状から対処法を探したい場合は、[トラブルシューティング](/reference/troubleshooting)を参照してください。
