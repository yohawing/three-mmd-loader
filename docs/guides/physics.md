---
title: 物理
description: Bulletをモデルへ接続し、髪や衣装を動かします。
---

髪やスカートを揺らすには、物理エンジンのBulletをモデルに接続します。ローダーは既定では物理演算を行わないため、このページの設定が必要です。

このページのコード例は、[最初のモデルを表示する](/getting-started/first-model)で作成した`scene`を使い、`new ThreeMmdLoader()`の初期化部分を物理バックエンド付きの設定へ置き換える構成です。

## Bulletを接続する

モデルを読み込む前にBulletバックエンドを作成し、`runtime`オプションでローダーへ渡します。ブラウザー上で次のコードを実行してください。

```ts
import { ThreeMmdLoader } from "@yohawing/three-mmd-loader";
import {
  createCustomBulletMmdPhysicsBackend,
  loadCustomBulletMmdModule
} from "@yohawing/three-mmd-loader/physics";

const bullet = await loadCustomBulletMmdModule();
const physicsBackend = createCustomBulletMmdPhysicsBackend(bullet);
const loader = new ThreeMmdLoader({
  runtime: { physics: "external", physicsBackend }
});
const model = await loader.loadModel("/models/character/model.pmx");
const { animation } = await loader.loadAnimation("/motions/dance.vmd");
model.setAnimation(animation);
scene.add(model.root);
```

バックエンドは物理ワールドの状態を持つため、モデルごとに作成してください。既定の内部ステップは`1 / 60`秒、最大サブステップ数は`5`です。変更する場合は、バックエンド生成時に`fixedTimeStep`と`maxSubSteps`を指定します。

## モデルを更新する

通常のレンダーループで`model.update(seconds)`を呼び、その後にシーンを描画してください。ランタイムがアニメーションと物理をまとめて進めるため、バックエンドの`step()`を重ねて呼ぶ必要はありません。

物理の結果は直前の状態に左右されるため、大きく離れた時刻へシークした結果が先頭から通しで再生した結果と一致しない点に注意してください。画像を比較したり動画に書き出したりするときは、開始状態、時間刻み、助走時間をそろえてください。

ポーズ崩れの原因を切り分けるときは、`model.update(seconds, { physics: false })`で物理だけを止められます。剛体が定義されていないモデルでは、物理を有効にしても揺れは追加されません。PMXのソフトボディはシミュレーション対象外です。

## JSとWASMを配信する

既定のローダーは自身のモジュールを基準に`mmd/mmd_bullet.js`を読み込みます。バンドラーがファイルをコピーしない場合は、次の手順で配置してURLを指定してください。

1. パッケージ内の`dist/physics/mmd/`にある`mmd_bullet.js`と`mmd_bullet.wasm`を同じ公開ディレクトリへコピーします。
2. `loadCustomBulletMmdModule({ scriptUrl: "/mmd/mmd_bullet.js" })`のようにURLを指定します。

このローダーは`document`と`window`に依存するため、Workerの中では動きません。Workerで物理を使う方法は、[Worker API](/api/worker)の`externalPhysics`を参照してください。

読み込みに失敗するときは、開発者ツールで`mmd_bullet.wasm`の応答を見てください。HTMLのエラーページが返っている場合は、配置先のURLが間違っています。

## 診断と終了処理

`physicsBackend.diagnostics()`で警告やエラーを取得できます。モデルを[パフォーマンスと破棄](/guides/performance-and-disposal)の手順で解放した後は、自分で作成した`physicsBackend.dispose()`も呼び、外部バックエンドのワールドを解放してください。
