---
title: アニメーション、カメラ、ライト
description: 再生位置を管理し、VMDのカメラとライトを描画へ反映します。
---

再生・一時停止やシーク、ポーズの切り替え、VMDのカメラとライトの反映を組み込むには、アプリケーション側で再生時刻を管理します。`model.update(seconds)`にはモーション先頭からの絶対秒を渡し、既定のMMDフレームレートは30です。

一時停止中は同じ再生位置を保持し、再開時に停止時間が加算されないよう時計を管理してください。このページのコード例は、[最初のモデルを表示する](/getting-started/first-model)で作成した`scene`、`camera`、`light`、`renderer`、`loader`、`model`を使う前提です。

## モーションとポーズを切り替える

新しいVMDを読み込むには`loader.loadAnimation()`を使います。返されたアニメーションを`model.setAnimation(animation)`へ渡すと、現在のモーションが置き換わります。

先頭から再生したい場合は、アプリケーション側の時計も0へ戻してください。`setAnimation()`はモーションの追加合成ではありません。

VPDファイルを静止ポーズとして適用する例です。

```ts
const poseAnimation = await loader.loadPoseAnimation("/poses/stand.vpd");
model.setAnimation(poseAnimation);
model.update(0);
```

## カメラとライトを反映する

設定したアニメーションにカメラやライトのキーが含まれる場合は、モデル更新後のランタイムから状態を取得します。次のコードは、[最初のアニメーションを再生する](/getting-started/first-animation)のレンダーループを置き換える例です。

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

VMDの平行投影を反映するには`orthographicCamera`を渡し、ヘルパーが返したカメラで描画してください。ライトの方向は`light.target`との関係で決まるため、`light.target`もシーンへ追加します。MMDとThree.jsの座標系変換はヘルパーが担当します。

## カメラ用VMDが別ファイルにある場合

カメラ用の別VMDを`model.setAnimation()`へ渡すと、再生中のモデルモーションが上書きされます。別ファイルのカメラ・ライトを評価するには、次の手順でサンプラーを使ってください。

1. カメラ用またはライト用のVMDを`loader.loadAnimation()`で読み込みます。
2. カメラには`loader.createCameraTrackSampler(animation)`、ライトには`loader.createLightTrackSampler(animation)`を呼びます。WASMとTypeScriptの実装はローダーが選びます。
3. 書き込み先として再利用する状態オブジェクトをループの外で用意します。
4. モデルを秒単位で更新した後、同じ再生位置をVMDのフレーム番号（既定は`seconds * 30`）へ換算し、`sampler.sampleInto(frame, target)`を呼びます。
5. 状態が返ったフレームだけ、前項のヘルパーでカメラやライトへ反映します。`undefined`が返ったフレームは適用をスキップします。
6. 再生を終えたら`sampler.dispose()`で解放します。

サンプラーの詳しい挙動は、[ThreeMmdLoader](/api/loader)を参照してください。

Worker使用中に指定時刻の適用完了を待つ場合は、`await model.updateAsync(seconds)`を使います。詳しくは[Worker API](/api/worker)を参照してください。
