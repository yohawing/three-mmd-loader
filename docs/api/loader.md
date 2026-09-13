---
title: ThreeMmdLoader
description: モデル、モーション、ポーズを読み込みます。
---

`ThreeMmdLoader`はURLやバイト列からThree.jsで使えるモデルを作ります。ルートまたは`/three`からimportできます。

## 読み込みメソッド

| メソッド | 戻り値 | 用途 |
| --- | --- | --- |
| `loadModel(source, options?)` | `Promise<ThreeMmdModel>` | PMX・PMDを読み込み、シーン用の`root`とランタイムを作成 |
| `loadAnimation(source)` | `Promise<ThreeMmdAnimation>` | VMDを読み込み、`animation`を取得 |
| `loadPose(source)` | `Promise<ThreeMmdPose>` | VPDの解析結果を`pose`として取得 |
| `loadPoseAnimation(source, name?)` | `Promise<ThreeMmdAnimation>` | VPDをモデルへ設定できるアニメーションに変換 |

`source`は`string`、`File`、`ArrayBuffer`、`Uint8Array`です。読み込み失敗はPromiseの拒否として扱います。`loadModel()`のURL取得には`signal`を指定できます。テクスチャなどの診断は返された`model.diagnostics`にまとまっています。

## 設定を置く場所

ローダーのコンストラクターには`textureMap`、`textureResolver`、`runtime`、`runtimeFactory`、`core`、`fetch`、`performance`などを渡します。個別の`loadModel()`には`outline`、`materialRenderOrder`、`morphSplit`、`morphAttributes`、`frustumCulled`などを渡します。

輪郭線、描画順プロキシ、モーフ分割、モーフ属性は既定で有効です。TSL経路では個別に推測して設定せず、パイプラインが返す読み込み設定を使います。

## 読み込み後のモデル

`model.root`をシーンへ追加し、`model.setAnimation(animation)`と`model.update(seconds)`で再生します。更新結果は後続更新で再利用されるため、保持する場合は`model.runtime.frameState()`でスナップショットを取得します。

カメラ専用VMDなどを別に評価する場合は`createCameraTrack(animation)`と`createLightTrack(animation)`を使えます。返り値はWASMトラックまたは`undefined`です。トラックの`sample()`は秒ではなくフレームを受け取ります。通常は`/runtime`の`sampleMmdAnimWasmCameraTrackInto()`と`sampleMmdAnimWasmLightTrackInto()`で状態へ変換します。不要になったトラックは`free?.()`で解放します。

[ThreeMmdLoaderの全メソッド](/api/reference/three/classes/ThreeMmdLoader) / [モデルの型](/api/reference/three/interfaces/ThreeMmdModel) / [読み込み設定](/api/reference/three/interfaces/ThreeMmdLoaderOptions)
