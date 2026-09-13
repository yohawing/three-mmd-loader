---
title: 最初のモデルを表示する
description: PMXまたはPMDモデルを読み込み、Three.jsのシーンに表示します。
---

`ThreeMmdLoader`でPMXまたはPMDモデルを読み込み、静止した初期ポーズを表示します。

## 前提条件

[インストール](/getting-started/installation)を済ませ、ブラウザーで実行するモジュールを用意します。既存のThree.jsアプリケーションでは、以下のシーン初期化を省き、使用中の`scene`へモデルを追加できます。

## シーンを用意する

HTMLの`body`が作成された後に実行します。カメラは標準的なMMDキャラクターの高さに合わせています。モデルの大きさが異なる場合は、位置と注視点を調整します。

```ts
import * as THREE from "three";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x30343b);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(0, 10, 35);
camera.lookAt(0, 10, 0);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(5, 15, 10);
scene.add(light, new THREE.AmbientLight(0xffffff, 0.5));

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));
```

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

モデルを表示できたら、[最初のアニメーションを再生する](/getting-started/first-animation)へ進みます。
