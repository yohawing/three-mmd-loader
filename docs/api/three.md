---
title: Three.jsヘルパー
description: モデルの同期とカメラ、ライト、描画を接続します。
---

`/three`には`ThreeMmdLoader`と、Three.jsへの接続を組み立てるヘルパーがあります。通常の再生では`model.update()`が同期まで行います。

### 読み込んだモデルの情報

`ThreeMmdLoader.loadModel()` が返す `ThreeMmdModel` では、次の読み取り専用プロパティからロード時のデータを参照できます。配列や要素は共有されるため、変更せずに利用してください。

| プロパティ | 型 | 用途 |
| --- | --- | --- |
| `model.metadata` | `Readonly<ModelMetadata>` | モデル名、コメント、診断情報の取得 |
| `model.bones` | `readonly BoneData[]` | ボーン定義の参照、`detectStandardBones` による標準ボーンの検出 |
| `model.rigidBodies` | `readonly RigidBodyData[]` | 剛体定義の参照と `.length` による件数の取得 |
| `model.joints` | `readonly JointData[]` | ジョイント定義の参照と `.length` による件数の取得 |

ローダーが `mesh.userData` に書き込む `mmd*` キーは内部実装であり、semver による互換性保証の対象外です。

### Three.js ヘルパー

| 用途 | 主なAPI |
| --- | --- |
| カメラ・ライト | `applyMmdCameraStateToThreeCamera`、`applyMmdLightStateToThreeDirectionalLight` |
| ジオメトリ・ボーン構築 | `createThreeBufferGeometry`、`createThreeSkeleton` |
| ランタイムの同期（非推奨） | `syncThreeMmdRuntimeToModel`、`syncThreeMmdRuntimeToMesh`。直接の代替はありません。`ThreeMmdModel.update` または `runtime.tick` が同期します。 |
| ファイルとテクスチャ | `findMmdModelFiles`、`createMmdTextureMapFromFiles`、`createTextureResolver` |
| 影 | `configureMmdSelfShadowDirectionalLight`、`fitMmdSelfShadowDirectionalLightToBox` |
| 終了処理 | `disposeMmdModel` |

カメラヘルパーは描画に使うカメラを返します。VMDの平行投影も扱う場合は`orthographicCamera`を渡します。ライトヘルパーはライトの色と方向を更新し、状態がない場合は変更しません。

モデルの補助メッシュを含めて同期したい場合は、基本メッシュだけを対象にせずモデル単位の同期を選びます。MMDからThree.jsへの座標変換もヘルパーが扱うため、同じ変換をアプリケーション側で重ねないようにします。

[Three.jsの全API](/api/reference/three) / [カメラとライトの例](/guides/animation-camera-light) / [破棄の例](/guides/performance-and-disposal)
