---
title: Runtime
description: 再生時刻の評価と状態取得を使い分けます。
---

`MmdRuntime`は1モデルのアニメーション、IK、付与変形、物理を評価します。通常は`ThreeMmdLoader`がモデルに結び付けたランタイムを使います。

## 時刻を評価する

| API | 動作 |
| --- | --- |
| `model.update(seconds)` | 評価してモデルを描画用に同期 |
| `runtime.evaluate(seconds)` | 描画オブジェクトを同期せず評価 |
| `runtime.tick(seconds, { mesh })` | 評価して指定オブジェクトへ同期 |
| `runtime.seek(seconds)` | 再生位置を変更 |
| `runtime.resetPose()` | ポーズをリセット |
| `runtime.clearAnimation()` | 設定したアニメーションを解除 |

時刻は絶対秒です。`{ physics: false, ik: false }`を評価オプションとして渡し、処理を切り分けられます。低水準APIで状態だけを変えた場合は、描画への同期も必要です。

## 状態の寿命

`update()`や`evaluate()`が返す`MmdFrameState`は、後続更新で再利用されることがあります。保存や比較には`frameState()`を使います。`cameraState()`と`lightState()`の戻り値も、長期保持する場合は必要な値をコピーします。

`debugState()`は処理段階ごとの行列とモーフを確認する診断用です。描画ループ中の常時記録には使わず、問題のある時刻で取得します。

## 実装を選ぶ

`MmdAnimRuntime`はmmd-animのWASMを使い、`DefaultMmdRuntime`はTypeScript側の実装です。全てのモデルや機能で同一の結果を保証するものではありません。独自実装を使う場合は、ローダーの`runtimeFactory(context)`から`MmdRuntime`を返します。Workerへの移行は[Worker API](/api/worker)を参照してください。

[Runtimeの全API](/api/reference/runtime) / [MmdRuntime](/api/reference/runtime/interfaces/MmdRuntime) / [設定](/api/reference/runtime/interfaces/DefaultMmdRuntimeOptions)
