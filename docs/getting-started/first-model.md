---
title: 最初のモデルを表示する
description: PMXまたはPMDモデルを読み込み、Three.jsのシーンに表示します。
---

`ThreeMmdLoader`でPMXまたはPMDモデルを読み込み、静止した初期ポーズを表示します。

## 前提条件

[インストール](./installation)を済ませ、Three.jsの`Scene`、カメラ、レンダラー、レンダーループを用意します。このページでは、シーンを格納した変数名を`scene`とします。

## モデルとテクスチャを配置する

モデルを開発サーバーから取得できる場所に配置します。モデルが参照するテクスチャも、モデルファイルからの相対パスを保って配置してください。

たとえば、モデルが`textures/body.png`を参照している場合は、次の構成にします。

```text
models/
└── character/
    ├── model.pmx
    └── textures/
        └── body.png
```

## モデルを読み込む

`loadModel()`にモデルのURLを渡します。読み込みが完了すると、シーンに追加できるモデルが返ります。

```ts
import { ThreeMmdLoader } from "@yohawing/three-mmd-loader";

const loader = new ThreeMmdLoader();
const model = await loader.loadModel("/models/character/model.pmx");

scene.add(model.root);
```

文字列で指定したモデルは`fetch()`で取得されます。テクスチャのURLは、モデルのURLとモデル内の相対パスから解決されます。

シーンには`model.mesh`ではなく`model.root`を追加します。`model.root`には本体のメッシュに加え、輪郭線や描画順を処理するためのメッシュも含まれます。

## 表示を確認する

既存のレンダーループでシーンを描画すると、モデルが初期ポーズで表示されます。モデルが見えない場合は、カメラの位置と向き、ライトの有無を確認します。

テクスチャが欠けている場合は、ブラウザーの開発者ツールでネットワークリクエストを確認してください。モデル内の相対パスに対応するURLが`404`になっていないかを調べます。

モデルを表示できたら、[最初のアニメーションを再生する](./first-animation)へ進みます。
