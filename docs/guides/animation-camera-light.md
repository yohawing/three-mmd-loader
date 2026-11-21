---
title: アニメーション、カメラ、ライト
description: 再生位置を管理し、VMDのカメラとライトを描画へ反映します。
---

`model.update(seconds)`へモーション先頭からの秒数を渡します。停止中は同じ再生位置を保持し、再開時に停止時間を加算しないよう、アプリケーション側で時計を管理します。既定のMMDフレームレートは30です。

## モーションとポーズを切り替える

新しいVMDを`loader.loadAnimation()`で読み込み、`model.setAnimation(animation)`で置き換えます。先頭から再生する場合はアプリケーション側の時計も戻します。`setAnimation()`はモーションの追加合成ではありません。

VPDは静止ポーズとして設定できます。ここでは導入ガイドの`loader`と`model`を使います。

```ts
const poseAnimation = await loader.loadPoseAnimation("/poses/stand.vpd");
model.setAnimation(poseAnimation);
model.update(0);
```

## カメラとライトを反映する

設定したアニメーションにカメラ・ライトのキーがある場合は、モデル更新後のランタイムから状態を取得します。以下は[導入ガイド](/getting-started/first-animation)のレンダーループを置き換える例です。`THREE`、`scene`、`camera`、`light`、`renderer`を引き続き使います。

```ts
import {
  applyMmdCameraStateToThreeCamera,
  applyMmdLightStateToThreeDirectionalLight
} from "@yohawing/three-mmd-loader";

const orthographicCamera = new THREE.OrthographicCamera();
const cameraOptions = { aspect: camera.aspect, orthographicCamera };
scene.add(light.target);
const startedAt = performance.now();

renderer.setAnimationLoop(() => {
  model.update((performance.now() - startedAt) / 1000);
  cameraOptions.aspect = camera.aspect;
  const cameraState = model.runtime.cameraState();
  const activeCamera = cameraState
    ? applyMmdCameraStateToThreeCamera(camera, cameraState, cameraOptions)
    : camera;
  applyMmdLightStateToThreeDirectionalLight(light, model.runtime.lightState());
  renderer.render(scene, activeCamera);
});
```

VMDの平行投影を反映するには`orthographicCamera`を渡し、ヘルパーが返したカメラで描画します。ライトの方向は`light.target`との関係で決まるため、ターゲットもシーンに追加します。座標系の変換はヘルパーが行います。

## カメラ用VMDが別ファイルにある場合

カメラ用VMDをモデルへ設定すると、再生中のモデルモーションを置き換えてしまいます。別のVMDを`loadAnimation()`で読み込み、カメラには`loader.createCameraTrackSampler(animation)`、ライトには`loader.createLightTrackSampler(animation)`を使います。ローダーがWASMとTypeScriptの実装を内部で選びます。

再生前にサンプラーと書き込み先の状態を用意します。モデルを秒単位で更新したら、同じ再生位置をVMDのフレーム番号に換算して`sampler.sampleInto(frame, target)`へ渡します。成功時は更新済みの`target`が返るので、上の例と同じヘルパーで反映できます。空トラックや評価失敗で`undefined`が返ったフレームは適用をスキップします。再生を終えたら`sampler.dispose()`で解放します。[ローダーAPI](/api/loader)

Worker使用中に指定時刻の適用完了を待つ必要がある場合は、通常更新の代わりに`await model.updateAsync(seconds)`を使います。詳細は[Worker API](/api/worker)を参照してください。
