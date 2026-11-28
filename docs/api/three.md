---
title: Three.jsヘルパー
description: モデルの同期とカメラ、ライト、描画を接続します。
---

`@yohawing/three-mmd-loader/three`は、モデル情報の参照、マテリアルの単体作成、カメラ・ライト・影の反映など、Three.jsとの接続を担うモジュールです。通常の再生では`model.update()`が描画オブジェクトの同期まで処理します。

## 読み込んだモデルの情報

`ThreeMmdLoader.loadModel()`が返す`ThreeMmdModel`では、次の読み取り専用プロパティからロード時のデータを参照できます。配列や要素は内部で共有されるため、変更せずに読み取ってください。

| プロパティ | 型 | 用途 |
| --- | --- | --- |
| `model.metadata` | `Readonly<ModelMetadata>` | モデル名、コメント、診断情報の取得 |
| `model.bones` | `readonly BoneData[]` | ボーン定義の参照、標準ボーンの検出 |
| `model.rigidBodies` | `readonly RigidBodyData[]` | 剛体定義の参照と件数取得 |
| `model.joints` | `readonly JointData[]` | ジョイント定義の参照と件数取得 |

標準ボーンの検出には`/parser`の`detectStandardBones()`を、剛体やジョイントの件数取得には各配列の`.length`を使えます。ローダーが`mesh.userData`に書き込む`mmd*`キーは内部実装であり、semverによる互換性保証の対象外です。

## ローダーを使わずにMMD用マテリアルを作る

テストなどでマテリアルを単体作成するには、解析済みの材質配列`mmdMaterials`（`MaterialInfo[]`）を`/three`の次の2関数へ順に渡します。

```ts
const materials = createThreeMmdMaterials(mmdMaterials);
await applyThreeMmdMaterialTextures(materials, mmdMaterials);
```

1行目で各マテリアルにMMDのメタデータが付きます。2行目でテクスチャの有無にかかわらず、材質係数がシェーダーへ適用されます。

## Three.jsヘルパー一覧

| 用途 | 主なAPI |
| --- | --- |
| カメラの反映 | `applyMmdCameraStateToThreeCamera` |
| ライトの反映 | `applyMmdLightStateToThreeDirectionalLight` |
| ジオメトリ・ボーン構築 | `createThreeBufferGeometry`、`createThreeSkeleton` |
| ファイル検索 | `findMmdModelFiles` |
| テクスチャ解決 | `createMmdTextureMapFromFiles`、`createTextureResolver` |
| 影ライト設定 | `configureMmdSelfShadowDirectionalLight` |
| 影範囲の調整 | `fitMmdSelfShadowDirectionalLightToBox` |
| 終了処理 | `disposeMmdModel` |

`syncThreeMmdRuntimeToModel`と`syncThreeMmdRuntimeToMesh`は`0.9.0`で非推奨になりました。直接の代替はなく、`ThreeMmdModel.update()`または`runtime.tick()`が同期まで処理します。

カメラヘルパーは描画に使うカメラを返します。VMDの平行投影も扱う場合は`orthographicCamera`を渡してください。ライトヘルパーはライトの色と方向を更新し、状態がない場合は変更しません。

プロキシメッシュを含めて同期するには、基本メッシュ単体ではなくモデル単位で更新してください。MMDからThree.jsへの座標変換もヘルパーが担当するため、同じ変換をアプリケーション側で重ねないでください。

[Three.jsの全API](/api/reference/three) / [カメラとライトの例](/guides/animation-camera-light) / [破棄の例](/guides/performance-and-disposal)
