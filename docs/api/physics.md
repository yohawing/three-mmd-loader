---
title: Physics
description: Bulletの導入と独自バックエンドの入口です。
---

`/physics`はBulletモジュールの読み込みと、ランタイムから呼ばれる物理バックエンドの型を公開します。

## Bulletを使う

`loadCustomBulletMmdModule()`はブラウザーでBulletのJS・WASMを初期化します。返されたモジュールを`createCustomBulletMmdPhysicsBackend()`へ渡し、ローダーの`runtime: { physics: "external", physicsBackend }`に設定します。[物理ガイド](/guides/physics)に接続例があります。

`CustomBulletMmdPhysicsBackendOptions`の`fixedTimeStep`と`maxSubSteps`で内部ステップを調整できます。診断は`diagnostics()`、接触情報は`debugContactCount()`と`debugPhysicsContacts()`で取得します。
`debugPhysicsContactsForRigidBodyRange(first, count)` は、world 内の剛体 index が A・B の少なくとも片方で `[first, first + count)` に入る接触だけを返します。

## 独自の実装を接続する

`MmdPhysicsBackend`の`step(context)`は、入力のボーン状態と剛体・ジョイント情報から更新結果を返します。`reset`、`dispose`、`diagnostics`は任意のフックです。行列は型名に示す列優先、回転はクォータニオンの`x, y, z, w`順です。独自実装では入力配列の寿命と出力対象ボーンを確認します。

`MmdDirectBufferPhysicsBackend`は再利用可能なステップバッファを供給する拡張です。ホットパスで配列を毎回作らずに接続できます。Raw WASMのポインターAPIは通常のモデル再生には不要です。

[Physicsの全API](/api/reference/physics) / [バックエンドの型](/api/reference/physics/interfaces/MmdPhysicsBackend)
