---
title: 物理
description: Bulletをモデルへ接続し、髪や衣装を動かします。
---

ローダーの物理は既定で無効です。モデルに定義された剛体とジョイントを動かすには、Bulletバックエンドを作り、モデル読み込み前にローダーへ渡します。

## Bulletを接続する

ブラウザー上で次のコードを実行します。`scene`は[モデル表示](/getting-started/first-model)で作成したシーンです。

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

バックエンドは物理ワールドの状態を持つため、モデルごとに作成します。既定の内部ステップは`1 / 60`秒、最大サブステップ数は`5`です。必要な場合はバックエンド生成時に`fixedTimeStep`と`maxSubSteps`を指定します。

## モデルを更新する

通常のレンダーループで`model.update(seconds)`を呼び、その後に描画します。ランタイムがアニメーションと物理を処理するため、バックエンドの`step()`を重ねて呼ぶ必要はありません。

物理は過去の状態に依存します。離れた時刻へ一度に移動した結果が、先頭から順に再生した結果と同じになるとは限りません。比較画像や書き出しでは、開始状態、時間刻み、助走時間を揃えます。

切り分けには`model.update(seconds, { physics: false })`を使います。剛体が定義されていないモデルでは、物理を有効にしても揺れは追加されません。PMXのソフトボディはシミュレーション対象外です。

## JSとWASMを配信する

既定のローダーは自身のモジュールを基準に`mmd/mmd_bullet.js`を読み込みます。バンドラーがコピーしない場合は、パッケージの`dist/physics/mmd/`内にある`mmd_bullet.js`と`mmd_bullet.wasm`を同じ公開ディレクトリへコピーし、`loadCustomBulletMmdModule({ scriptUrl: "/mmd/mmd_bullet.js" })`のように指定します。

このローダーは`document`と`window`を使います。Workerでは[Worker API](/api/worker)の`externalPhysics`設定を使います。読み込み失敗時は、JSとWASMがHTMLのエラーページではなく実ファイルを返しているか確認します。

## 診断と終了処理

`physicsBackend.diagnostics()`で警告・エラーを取得できます。モデルを[破棄](/guides/performance-and-disposal)した後は、自分で作成した`physicsBackend.dispose()`も呼び、外部バックエンドのワールドを解放します。
