---
title: 最初のアニメーションを再生する
description: VMDモーションをモデルへ設定し、レンダーループで再生します。
---

VMDモーションを前ページで表示したモデルへ設定し、ボーンとモーフのアニメーションを再生します。

## 前提条件

[最初のモデルを表示する](./first-model)を完了し、`loader`と`model`を作成しておきます。再生するVMDファイルは、開発サーバーから取得できる場所に配置します。このページでは`/motions/dance.vmd`から読み込みます。

## VMDを読み込む

`loadAnimation()`にVMDのURLを渡し、返されたアニメーションをモデルへ設定します。

```ts
const { animation } = await loader.loadAnimation("/motions/dance.vmd");

model.setAnimation(animation);
```

VMDのボーン名とモーフ名は、モデル内の名前と対応付けられます。別のモデル向けに作成されたVMDでは、一部の動きが反映されないことがあります。

## レンダーループでモデルを更新する

Three.jsの`Clock`で、再生開始からの経過秒数を取得します。モデルを更新してからシーンを描画してください。

```ts
const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
  model.update(clock.getElapsedTime());
  renderer.render(scene, camera);
});
```

前ページですでにレンダーループを作成している場合は、その中に`model.update()`を追加します。レンダーループを二つ作る必要はありません。

## 再生を確認する

モデルのボーンやモーフが時間に合わせて動けば、VMDの設定は完了です。モデルが動かない場合は、VMDにモデル用のモーションが含まれていることと、モデルのボーン名に対応していることを確認します。

VMDのカメラやライトも再生する場合は、[アニメーション、カメラ、ライト](../guides/animation-camera-light)へ進みます。
