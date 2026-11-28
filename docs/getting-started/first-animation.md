---
title: 最初のアニメーションを再生する
description: VMDモーションをモデルへ設定し、レンダーループで再生します。
---

このページでは、前のページで表示したモデルへVMDモーションを設定し、ボーンとモーフのアニメーションを再生できるところまで進めます。

## 前提条件

[最初のモデルを表示する](/getting-started/first-model)を完了し、`scene`、`camera`、`renderer`、`loader`、`model`を作成しておいてください。再生するVMDファイルは開発サーバーの公開ディレクトリへ置き、ここでは`/motions/dance.vmd`から読み込みます。

## VMDを読み込む

`loadAnimation()`にVMDのURLを渡し、返されたアニメーションをモデルへ設定します。

```ts
const { animation } = await loader.loadAnimation("/motions/dance.vmd");

model.setAnimation(animation);
```

VMDのボーン名とモーフ名は、モデル内の名前と対応付けられます。別のモデル向けに作られたVMDでは、名前が一致しない一部の動きが反映されないことがあります。詳しくは[MMDの仕組み](/concepts/how-mmd-works)を参照してください。

## レンダーループでモデルを更新する

再生開始時刻を保存し、そこからの経過秒数を`model.update()`へ渡してシーンを描画します。

```ts
const startedAt = performance.now();

renderer.setAnimationLoop(() => {
  model.update((performance.now() - startedAt) / 1000);
  renderer.render(scene, camera);
});
```

`model.update()`の引数は前フレームからの差分ではなく、モーション先頭からの絶対秒です。前のページで作成したレンダーループをこのコードで置き換えてください。レンダーループを二つ登録する必要はありません。

## 再生を確かめる

モデルのボーンやモーフが時間に合わせて動けば、VMDの設定は完了です。動かない場合は、VMDがカメラ専用ではなくモデル用のモーションを含んでいるかと、モデルのボーン名に対応しているかを確かめてください。

## 完成形のコード

[最初のモデルを表示する](/getting-started/first-model)の`src/main.ts`にアニメーション再生を組み込んだ完成形です。`index.html`は前のページと同じものを使います。

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

const { animation } = await loader.loadAnimation("/motions/dance.vmd");
model.setAnimation(animation);

const startedAt = performance.now();
renderer.setAnimationLoop(() => {
  model.update((performance.now() - startedAt) / 1000);
  renderer.render(scene, camera);
});
```

## 次に読むページ

ここまでの基礎を押さえたら、目的に合わせて次のページへ進んでください。

- 髪やスカートを物理演算で揺らす：[物理](/guides/physics)
- ユーザーが選択したフォルダーからモデルを読み込む：[アセットとテクスチャ](/guides/assets-and-textures)
- VMDのカメラやライト、静止ポーズ（VPD）を扱う：[アニメーション、カメラ、ライト](/guides/animation-camera-light)
- 評価順や`model.root`の構造、よくあるつまずきを知る：[MMDの仕組み](/concepts/how-mmd-works)、[よくある間違い](/concepts/common-pitfalls)
