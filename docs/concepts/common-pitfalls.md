---
title: よくある間違い
description: three-mmd-loaderでつまずきやすい実装と正しい書き方を対比します。
---

three-mmd-loaderを使うときにつまずきやすい書き方（❌）と、正しい書き方（✅）を対比してまとめます。画面の症状から原因を探したい場合は、[トラブルシューティング](/reference/troubleshooting)を参照してください。

このページのコード例では、作成済みの`scene`、`camera`、`renderer`、`loader`、`model`、再生開始時刻の`startedAt`、再生位置の秒数`seconds`、およびTSL用の`pipeline`がある前提で要所だけを示します。

## `model.mesh`をシーンに追加する

`model.root`には本体メッシュのほか、描画順プロキシや輪郭線（エッジ）プロキシが入っています。`model.mesh`だけを追加すると、モデルが表示されなかったり輪郭線が欠けたりします。

❌ `model.mesh`を直接追加する：

```ts
scene.add(model.mesh);
```

✅ `model.root`を追加する：

```ts
scene.add(model.root);
```

## `update()`に差分秒を渡す

`model.update()`が受け取るのはモーション先頭からの絶対秒です。前フレームからの差分秒を渡すと、モーションが0秒付近で足踏みして進みません。

❌ 差分秒を渡す：

```ts
let previous = performance.now();

renderer.setAnimationLoop(() => {
  const now = performance.now();
  model.update((now - previous) / 1000);
  previous = now;
  renderer.render(scene, camera);
});
```

✅ 先頭からの絶対秒を渡す：

```ts
const startedAt = performance.now();

renderer.setAnimationLoop(() => {
  model.update((performance.now() - startedAt) / 1000);
  renderer.render(scene, camera);
});
```

## カメラ用VMDを`setAnimation()`へ渡す

`model.setAnimation()`はモデルのモーションを置き換えます。別ファイルのカメラ用VMDを渡すと、踊っていたキャラクターのモーションが消えてしまいます。

❌ カメラ用VMDでモデルモーションを上書きする：

```ts
const cameraVmd = await loader.loadAnimation("/motions/camera.vmd");
model.setAnimation(cameraVmd.animation);
```

✅ サンプラーで別トラックとして評価する：

```ts
import {
  applyMmdCameraStateToThreeCamera,
  type MmdCameraState
} from "@yohawing/three-mmd-loader";

const cameraVmd = await loader.loadAnimation("/motions/camera.vmd");
const cameraSampler = loader.createCameraTrackSampler(cameraVmd.animation);
const cameraTarget: MmdCameraState = {
  distance: 0,
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  fov: 30,
  perspective: true
};

const sampled = cameraSampler.sampleInto(seconds * 30, cameraTarget);
if (sampled) {
  applyMmdCameraStateToThreeCamera(camera, sampled, { aspect: camera.aspect });
}
```

使い終えたら`cameraSampler.dispose()`で解放します。手順の詳細は[アニメーション、カメラ、ライト](/guides/animation-camera-light)を参照してください。

## レンダーループ内でオブジェクトを作り直す

毎フレーム`loadModel()`を呼んだり、ヘルパーへ渡すオプションオブジェクトや状態オブジェクトを新しく確保し続けたりすると、処理落ちやメモリ増加の原因になります。

❌ 毎フレーム新しいオブジェクトを作る：

```ts
renderer.setAnimationLoop(() => {
  model.update((performance.now() - startedAt) / 1000);
  const state = model.runtime.cameraState();
  const activeCamera = state
    ? applyMmdCameraStateToThreeCamera(camera, state, {
        aspect: camera.aspect,
        orthographicCamera: new THREE.OrthographicCamera()
      })
    : camera;
  renderer.render(scene, activeCamera);
});
```

✅ ループの外で確保して再利用する：

```ts
const orthographicCamera = new THREE.OrthographicCamera();
const cameraOptions = { aspect: camera.aspect, orthographicCamera };

renderer.setAnimationLoop(() => {
  model.update((performance.now() - startedAt) / 1000);
  cameraOptions.aspect = camera.aspect;
  const state = model.runtime.cameraState();
  const activeCamera = state
    ? applyMmdCameraStateToThreeCamera(camera, state, cameraOptions)
    : camera;
  renderer.render(scene, activeCamera);
});
```

## Worker使用時に`update()`直後を描画して書き出す

Workerランタイムで`model.update(seconds)`を呼ぶと、応答が届く前に処理が返ります。スクリーンショットや動画書き出しで指定時刻の正確なポーズが必要な場合は、`await model.updateAsync(seconds)`で適用完了を待ってください。

❌ 適用完了を待たずに描画する：

```ts
model.update(seconds);
renderer.render(scene, camera);
```

✅ `updateAsync()`の完了を待ってから描画する：

```ts
await model.updateAsync(seconds);
renderer.render(scene, camera);
```

## WebGPU / TSLで読み込み設定を手動で指定する

TSLパイプラインでは、通常のWebGL向けプロキシメッシュやモーフ設定と重複しない読み込みオプションが必要です。個別に推測して指定せず、`pipeline.createModelLoadOptions()`を渡してください。

❌ 通常経路と同じ設定で読み込む：

```ts
const model = await loader.loadModel("/models/character/model.pmx", {
  outline: true,
  materialRenderOrder: true
});
pipeline.attach(model);
```

✅ パイプラインが返す読み込み設定を使う：

```ts
const model = await loader.loadModel(
  "/models/character/model.pmx",
  pipeline.createModelLoadOptions()
);
pipeline.attach(model);
```

## `update()`の戻り値をそのまま保存する

`model.update()`や`runtime.evaluate()`が返すフレーム状態は、毎フレームのオブジェクト生成を避けるため次回呼び出し時に再利用されます。履歴として残す場合は、`model.runtime.frameState()`でスナップショットを取得してください。

❌ 再利用されるオブジェクトをそのまま配列へ入れる：

```ts
const history = [];
history.push(model.update(0));
history.push(model.update(1));
```

✅ `frameState()`でスナップショットを取得する：

```ts
const history = [];
model.update(0);
history.push(model.runtime.frameState());
model.update(1);
history.push(model.runtime.frameState());
```
