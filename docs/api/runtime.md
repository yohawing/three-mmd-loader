---
title: Runtime
description: 再生時刻の評価と状態取得を使い分けます。
---

`@yohawing/three-mmd-loader/runtime`は、1モデルのアニメーション、付与変形、IK、物理を評価する`MmdRuntime`と関連関数を提供するモジュールです。通常は`ThreeMmdLoader`がモデルに結び付けたランタイムを利用します。

## 時刻を評価する

| API | 動作 |
| --- | --- |
| `model.update(seconds)` | 評価してモデルを描画用に同期 |
| `runtime.evaluate(seconds)` | 描画オブジェクトを同期せず評価 |
| `runtime.tick(seconds, { mesh })` | 評価して指定オブジェクトへ同期 |
| `runtime.seek(seconds)` | 再生位置を変更 |
| `runtime.resetPose()` | ポーズをリセット |
| `runtime.clearAnimation()` | 設定したアニメーションを解除 |

時刻はモーション先頭からの絶対秒です。`{ physics: false, ik: false }`を評価オプションとして渡すと、処理段階を切り分けて評価できます。低水準APIで状態だけを変えた場合は、描画オブジェクトへの同期も忘れずに行ってください。

## 状態の寿命

`update()`や`evaluate()`が返すフレーム状態は、後続の更新で再利用されることがあります。保存や比較に使う場合は`frameState()`でスナップショットを取得してください。`cameraState()`と`lightState()`の戻り値も、長期保持する場合は必要な値をコピーします。

`debugState()`は処理段階ごとの行列とモーフを取り出す診断用メソッドです。描画ループ中の常時記録には使わず、問題のある時刻で停止して取得してください。

## カメラ・ライトの単独評価

カメラやライトを単独で評価する場合は、[ThreeMmdLoader](/api/loader)のサンプラーを使ってください。ローダーがWASMとTypeScriptの経路を自動で選びます。

生のフレーム配列を直接扱う場合は、引き続き`sampleMmdCameraTrackInto()`と`sampleMmdLightTrackInto()`を使えます。

## 実装を選ぶ

`MmdAnimRuntime`はmmd-animのWASMを使う実装、`DefaultMmdRuntime`はTypeScript側の実装です。すべてのモデルや機能で同一の結果を保証するものではありません。

独自実装を使う場合は、ローダーの`runtimeFactory(context)`から`MmdRuntime`を返します。評価をWorkerへ移す方法は、[Worker API](/api/worker)を参照してください。

[Runtimeの全API](/api/reference/runtime) / [MmdRuntime](/api/reference/runtime/interfaces/MmdRuntime) / [設定](/api/reference/runtime/interfaces/MmdRuntimeOptions)
