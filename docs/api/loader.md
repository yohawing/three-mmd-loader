---
title: ThreeMmdLoader
description: モデル、モーション、ポーズを読み込みます。
---

`ThreeMmdLoader`は、URL、ファイル、またはバイト列からThree.jsで描画できるMMDモデルとアニメーションを作成するクラスです。ルートまたは`/three`からimportできます。

## 読み込みメソッド

| メソッド | 戻り値 | 用途 |
| --- | --- | --- |
| `loadModel(source, options?)` | `Promise<ThreeMmdModel>` | モデルを読み込み、`root`とランタイムを作成 |
| `loadAnimation(source)` | `Promise<ThreeMmdAnimation>` | VMDを読み込み、`animation`を取得 |
| `loadPose(source)` | `Promise<ThreeMmdPose>` | VPDの解析結果を`pose`として取得 |
| `loadPoseAnimation(source, name?)` | `Promise<ThreeMmdAnimation>` | VPDをモデルへ設定できるアニメーションに変換 |

`source`にはURL文字列、`File`、`ArrayBuffer`、`Uint8Array`を指定できます。モデルの対象形式はPMXとPMDです。

読み込みに失敗するとPromiseが拒否されます。`loadModel()`のURL取得には`signal`で中断を指定できます。テクスチャや材質の診断結果は、返された`model.diagnostics`にまとまっています。

## 設定を置く場所

オプションは共有範囲によって指定場所が分かれます。

| 指定場所 | 主なオプション | 対象 |
| --- | --- | --- |
| コンストラクター | `textureMap`、`textureResolver`、`fetch` | テクスチャとURL解決 |
| コンストラクター | `runtime`、`runtimeFactory`、`core`、`performance` | ランタイム、パーサー、計測 |
| `loadModel()` | `outline`、`materialRenderOrder` | 輪郭線（エッジ）と描画順プロキシ |
| `loadModel()` | `morphSplit`、`morphAttributes`、`frustumCulled` | モーフとカリング |

輪郭線、描画順プロキシ、モーフ分割、モーフ属性は既定で有効です。TSL経路では個別に推測して設定せず、パイプラインが返す読み込み設定を使ってください。

## 読み込み後のモデル

モデルをシーンへ表示するには`model.root`を追加してください。再生には`model.setAnimation(animation)`と`model.update(seconds)`を使います。

更新結果は後続の更新で再利用されるため、状態を保持したい場合は`model.runtime.frameState()`でスナップショットを取得してください。

## カメラ・ライト用サンプラー

カメラ専用VMDなどを別トラックとして評価する場合は、ローダーからサンプラーを作成します。

- カメラ用：`loader.createCameraTrackSampler(animation)`
- ライト用：`loader.createLightTrackSampler(animation)`

どちらもトラックが空でもサンプラーを返します。評価時は`sampleInto(frame, target)`にVMDのフレーム番号と再利用する状態オブジェクトを渡してください。

評価に成功すると更新された`target`が返ります。空トラックやWASMのサンプリング失敗時は`undefined`が返ります。

使い終えたら`dispose()`を呼んでください。`dispose()`は複数回呼んでも安全です。

[ThreeMmdLoaderの全メソッド](/api/reference/three/classes/ThreeMmdLoader) / [モデルの型](/api/reference/three/interfaces/ThreeMmdModel) / [読み込み設定](/api/reference/three/interfaces/ThreeMmdLoaderOptions)
