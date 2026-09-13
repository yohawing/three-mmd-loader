---
title: Three.jsヘルパー
description: モデルの同期とカメラ、ライト、描画を接続します。
---

`/three`には`ThreeMmdLoader`と、Three.jsへの接続を組み立てるヘルパーがあります。通常の再生では`model.update()`が同期まで行います。

| 用途 | 主なAPI |
| --- | --- |
| カメラ・ライト | `applyMmdCameraStateToThreeCamera`、`applyMmdLightStateToThreeDirectionalLight` |
| ジオメトリ・ボーン構築 | `createThreeBufferGeometry`、`createThreeSkeleton` |
| ランタイムの同期 | `syncThreeMmdRuntimeToModel`、`syncThreeMmdRuntimeToMesh` |
| ファイルとテクスチャ | `findMmdModelFiles`、`createMmdTextureMapFromFiles`、`createTextureResolver` |
| 影 | `configureMmdSelfShadowDirectionalLight`、`fitMmdSelfShadowDirectionalLightToBox` |
| 終了処理 | `disposeMmdModel` |

カメラヘルパーは描画に使うカメラを返します。VMDの平行投影も扱う場合は`orthographicCamera`を渡します。ライトヘルパーはライトの色と方向を更新し、状態がない場合は変更しません。

モデルの補助メッシュを含めて同期したい場合は、基本メッシュだけを対象にせずモデル単位の同期を選びます。MMDからThree.jsへの座標変換もヘルパーが扱うため、同じ変換をアプリケーション側で重ねないようにします。

[Three.jsの全API](/api/reference/three) / [カメラとライトの例](/guides/animation-camera-light) / [破棄の例](/guides/performance-and-disposal)
