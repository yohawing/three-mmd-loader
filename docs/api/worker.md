---
title: Worker
description: ランタイム評価をWorkerへ移します。
---

Workerはアニメーション評価をメインスレッドから移し、受け取ったポーズをメインスレッドのモデルへ適用します。描画自体はメインスレッドに残ります。

## ファクトリーを接続する

Low-level pose helpers and worker transport components are deprecated in 0.9.0 and will leave the public API in 1.0.0. Pass `createWorkerMmdRuntimeFactory(options)` to `ThreeMmdLoader` as `runtimeFactory`.

`scene`は作成済みのシーンです。配布環境でWorkerのエントリーと依存JS・WASMを配信しておきます。

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

初期導入時は`fallback: false`でWorkerの起動失敗を見つけます。既定の`fallback: true`では、対応可能な場合にメインスレッドのランタイムへ切り替わります。通信状態を確認せず、表示できたことだけでWorker動作と判断しないようにします。

## 通常再生と厳密な評価

通常のレンダーループでは`model.update(seconds)`を使います。Workerの応答は非同期なので、その呼び出し時点で要求時刻のポーズが届いているとは限りません。

スクリーンショットや書き出しでは`await model.updateAsync(seconds)`で指定時刻の適用完了を待ってから描画します。厳密なフレーム取得は順番に実行し、同じモデルへ並行して要求しない構成にします。

## 配信と物理

既定のWorker URLはパッケージ内の`worker/entry.js`を基準に解決されます。バンドラーが依存ファイルを配置しない場合は、配布したエントリーを`workerUrl`で指定します。エントリーだけでなく、相対import先とWASMも必要です。

WorkerはHTML側のimport mapを引き継ぎません。配布済みの`dist`をそのままHTTP配信すると、Worker内の`from "three"`を解決できない場合があります。Worker用に依存をバンドルするか、配信モジュールのimportを解決可能なURLへ変換します。このリポジトリのViewerサーバーは`/__mmd_worker_dist__/`で後者を行っています。

共有メモリは`sharedMemory: "auto"`が既定です。利用条件が揃わなければ転送バッファを使います。共有メモリを必須にする場合だけ`"required"`を選び、ブラウザーの`crossOriginIsolated`を確認します。

Worker内のBulletには`runtimeOptions: { physics: "external" }`と`externalPhysics: { kind: "custom-bullet-mmd" }`を指定します。必要に応じて`moduleUrl`と`wasmUrl`を設定します。メインスレッドで作ったバックエンドのオブジェクトをWorkerへ渡す方式ではありません。

モデルを`disposeMmdModel()`で破棄した後、ファクトリーも不要なら`runtimeFactory.dispose()`で所有するプールを解放します。外部から渡したプールは呼び出し側で破棄します。

[Workerの全API](/api/reference/worker) / [ファクトリー設定](/api/reference/worker/interfaces/WorkerMmdRuntimeOptions)
