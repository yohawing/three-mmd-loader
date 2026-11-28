---
title: Worker
description: ランタイム評価をWorkerへ移します。
---

`@yohawing/three-mmd-loader/worker`は、アニメーション評価をWeb Workerへ移すためのファクトリーとプールを提供するモジュールです。Workerから受け取ったポーズはメインスレッドのモデルへ適用され、描画自体はメインスレッドに残ります。

## ファクトリーを接続する

低レベルのポーズ操作ヘルパーとWorker通信コンポーネントは`0.9.0`で非推奨になり、`1.0.0`で公開APIから削除されます。今後は`createWorkerMmdRuntimeFactory(options)`を作り、ローダーの`runtimeFactory`へ渡してください。

作成済みの`scene`を使い、Workerランタイムでモデルとモーションを読み込む例です。配布環境では、Workerのエントリーと依存するJS・WASMをHTTPで配信しておいてください。

```ts
import { ThreeMmdLoader } from "@yohawing/three-mmd-loader";
import { createWorkerMmdRuntimeFactory } from "@yohawing/three-mmd-loader/worker";

const runtimeFactory = createWorkerMmdRuntimeFactory({
  fallback: false,
  onFallback: error => console.error(error)
});
const loader = new ThreeMmdLoader({ runtimeFactory });
const model = await loader.loadModel("/models/character/model.pmx");
await model.runtime.whenReady?.();
const { animation } = await loader.loadAnimation("/motions/dance.vmd");
model.setAnimation(animation);
scene.add(model.root);
await model.updateAsync(0);
```

初期導入時は`fallback: false`を指定すると、Workerの起動失敗をすぐに見つけられます。既定の`fallback: true`では、対応可能な場合にメインスレッドのランタイムへ自動切替されます。表示できたことだけでWorker動作と判断せず、通信状態も確かめてください。

## 通常再生と厳密な評価

通常のレンダーループでは`model.update(seconds)`を使います。Workerの応答は非同期なので、呼び出し時点で要求時刻のポーズが届いているとは限りません。

スクリーンショットや動画書き出しでは、`await model.updateAsync(seconds)`で指定時刻の適用完了を待ってから描画してください。厳密なフレーム取得は順番に実行し、同じモデルへ並行して要求しない構成にします。

## 配信と物理

既定のWorker URLはパッケージ内の`worker/entry.js`を基準に解決されます。バンドラーが依存ファイルを配置しない場合は、配布したエントリーを`workerUrl`で指定してください。エントリーだけでなく、相対import先とWASMも配信が必要です。

WorkerはHTML側のimport mapを引き継ぎません。配布済みの`dist`をそのままHTTP配信すると、Worker内の`from "three"`を解決できない場合があります。

対策として、Worker用に依存をバンドルするか、配信モジュールのimportを解決可能なURLへ変換してください。このリポジトリのViewerサーバーは`/__mmd_worker_dist__/`で後者の変換をしています。

共有メモリは`sharedMemory: "auto"`が既定です。利用条件がそろわなければ転送バッファを使います。共有メモリを必須にする場合だけ`"required"`を選び、ブラウザーの`crossOriginIsolated`が有効になっているかを確かめてください。

Worker内でBulletを使う場合は、`runtimeOptions`に`{ physics: "external" }`を、`externalPhysics`に`{ kind: "custom-bullet-mmd" }`を設定します。必要に応じて`moduleUrl`と`wasmUrl`も指定してください。メインスレッドで作ったバックエンドのオブジェクトをWorkerへ渡す方式ではありません。

モデルを`disposeMmdModel()`で破棄した後、ファクトリーも不要なら`runtimeFactory.dispose()`で所有するプールを解放します。外部から渡したプールは呼び出し側で破棄します。詳しくは[パフォーマンスと破棄](/guides/performance-and-disposal)を参照してください。

[Workerの全API](/api/reference/worker) / [ファクトリー設定](/api/reference/worker/interfaces/WorkerMmdRuntimeOptions)
