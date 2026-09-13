---
title: three-mmd-loader
description: Three.js で MMD モデルとモーションを読み込み・再生するための TypeScript ライブラリ。
---

Three.js 上で MMD モデルとモーションを読み込み・再生するための、TypeScript-first のライブラリです。

## このライブラリでできること

PMX / PMD モデル、VMD モーション、VPD ポーズを Three.js のシーンへ読み込み、MMD 固有の変形・マテリアル・物理を扱えます。

## はじめる

最短でモデルを表示してから、アニメーション、アセット、描画設定へ進みます。

- [クイックスタート](/getting-started)
- [実装ガイド](/guides)
- [対応形式](/reference/formats)
- [デモサイト](https://three.mmd.yohawing.com/)

```ts
import { ThreeMmdLoader } from "@yohawing/three-mmd-loader";

const loader = new ThreeMmdLoader();
const model = await loader.loadModel("model.pmx");
scene.add(model.root);
```

## API と詳細情報

パッケージごとの公開 API、制約、よくある問題を確認できます。

- [API の概要](/api)
- [トラブルシューティング](/reference/troubleshooting)
- [開発ガイド](/DEVELOPMENT)
