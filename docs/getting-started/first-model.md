---
title: 最初のモデルを表示する
description: PMXまたはPMDモデルを読み込み、Three.jsのシーンに表示します。
---

このページでは、PMXまたはPMDのモデルをThree.jsのシーンに表示するところまで進めます。モーションはまだ付けず、モデルが初期ポーズで立っている状態を目指します。

## 前提条件

[インストール](/getting-started/installation)と[試すアセットを用意する](/getting-started/prepare-assets)を済ませ、ブラウザーで実行するモジュールを用意してください。既存のThree.jsアプリケーションがある場合は、次のシーン初期化を省き、使用中の`scene`へモデルを追加できます。

## シーンを用意する

カメラ、ライト、レンダラー、リサイズ処理とレンダーループを初期化します。HTMLの`body`が構築された後に実行してください。

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

カメラは標準的なMMDキャラクターの高さに合わせています。モデルの大きさが大きく異なる場合は、カメラの位置と注視点を調整してください。

## モデルとテクスチャを配置する

モデルファイルは、開発サーバーが配信するディレクトリに置いてください。テクスチャは、モデルファイルから見た相対パスを変えずに一緒に置きます。

たとえば、モデルが`textures/body.png`を参照している場合は次の構成にします。

```text
models/
└── character/
    ├── model.pmx
    └── textures/
        └── body.png
```

## モデルを読み込む

`loadModel()`にモデルのURLを渡すと、Three.jsのシーンに追加できるモデルが返ります。

```ts
import { ThreeMmdLoader } from "@yohawing/three-mmd-loader";

const loader = new ThreeMmdLoader();
const model = await loader.loadModel("/models/character/model.pmx");

scene.add(model.root);
```

文字列で指定したモデルは`fetch()`で取得され、テクスチャのURLはモデルのURLとモデル内の相対パスから解決されます。

シーンに追加するのは`model.mesh`ではなく`model.root`です。`model.root`には本体のメッシュに加え、輪郭線（エッジ）や描画順を扱うプロキシメッシュも含まれます。詳しくは[MMDの仕組み](/concepts/how-mmd-works)を参照してください。

## 表示を確かめる

ページを開くと、モデルが初期ポーズで表示されます。何も映らない場合は、カメラがモデルの方を向いているか、シーンにライトを追加したかを確かめてください。ライトがないと、モデルは真っ黒になります。

テクスチャが欠けている場合は、ブラウザーの開発者ツールでネットワークパネルを開いてください。モデル内の相対パスに対応するURLが`404`になっていないかを調べます。パス解決の規則や対処は、[アセットとテクスチャ](/guides/assets-and-textures)を参照してください。

## 完成形のコード

ここまでの手順をまとめた最小ファイル構成です。Viteなどの開発サーバーでそのまま動かせます。

`index.html`：

```html
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>three-mmd-loader first model</title>
    <style>
      body { margin: 0; overflow: hidden; }
    </style>
  </head>
  <body>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/main.ts`：

```ts
import * as THREE from "three";
import { ThreeMmdLoader } from "@yohawing/three-mmd-loader";

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

const loader = new ThreeMmdLoader();
const model = await loader.loadModel("/models/character/model.pmx");
scene.add(model.root);

renderer.setAnimationLoop(() => {
  renderer.render(scene, camera);
});
```

次は、このモデルにモーションを付けましょう。[最初のアニメーションを再生する](/getting-started/first-animation)へ進んでください。
