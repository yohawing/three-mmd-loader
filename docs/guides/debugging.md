---
title: デバッグ
description: 読み込み、ポーズ、描画の順に原因を絞ります。
---

同じモデルと同じ時刻で、設定を一つずつ変えて比較します。表示だけで原因を決めず、読み込みとアニメーション評価を先に確認します。

## 読み込みを確認する

作成済みの`model`から診断情報を取得できます。

```ts
console.log(model.source, model.diagnostics.core);
console.table(model.diagnostics.textures);
console.table(model.diagnostics.materials);
```

URLへの応答が`200`でも、本文が開発サーバーのHTMLなら読み込みには失敗します。ネットワークパネルでモデル、WASM、テクスチャの応答内容も確認します。`onCoreFallback`をローダーに渡すと、パーサーのフォールバック理由を取得できます。

## ポーズを比較する

物理とIKを外した状態から比較します。

```ts
model.update(1, { physics: false, ik: false });
console.log(model.runtime.frameState());
console.log(model.runtime.debugState());
```

次にIKを戻し、その後に物理を戻します。`debugState()`はVMD補間、付与変形、IK、物理の段階を調べるためのAPIです。通常再生の毎フレームで大量にログへ出すと計測結果が変わるため、停止中に取得します。Workerでは厳密な時刻の確認に`await model.updateAsync(1)`を使います。

## 描画を比較する

モデルが画面内にあるか、ライトが当たっているか、`model.root`を追加したか確認します。その後、輪郭線、影、透過判定の設定を一つずつ変えます。TSLだけで起きる場合は、通常の`WebGLRenderer`でも同じアセットを確認します。

再現報告にはライブラリとThree.jsのバージョン、ブラウザー、GPU、描画経路、発生時刻、変更した設定を添えます。症状から探す場合は[トラブルシューティング](/reference/troubleshooting)を参照してください。
