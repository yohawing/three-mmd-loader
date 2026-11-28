---
title: Physics
description: Bulletの導入と独自バックエンドの入口です。
---

`@yohawing/three-mmd-loader/physics`は、Bulletモジュールの読み込み関数と、ランタイムから呼ばれる物理バックエンドの型を提供するモジュールです。

## Bulletを使う

`loadCustomBulletMmdModule()`は、ブラウザーでBulletのJS・WASMを初期化します。返されたモジュールを`createCustomBulletMmdPhysicsBackend()`へ渡してバックエンドを作成してください。

作成したバックエンドは、ローダーの`runtime`オプションへ`{ physics: "external", physicsBackend }`として渡します。接続例は[物理](/guides/physics)を参照してください。

内部ステップは`CustomBulletMmdPhysicsBackendOptions`の`fixedTimeStep`と`maxSubSteps`で調整できます。既定値はそれぞれ`1 / 60`と`5`です。

デバッグ用には次のメソッドを用意しています。

| メソッド | 用途 |
| --- | --- |
| `diagnostics()` | バックエンドの警告やエラーを取得 |
| `debugContactCount()` | 現在の接触点数を取得 |
| `debugPhysicsContacts()` | すべての接触情報を取得 |
| `debugPhysicsContactsForRigidBodyRange()` | 指定範囲の剛体を含む接触だけを取得 |

`debugPhysicsContactsForRigidBodyRange()`には、開始インデックス（`firstRigidBodyIndex`）と件数（`rigidBodyCount`）を渡します。ワールド内の剛体A・Bの少なくとも片方が指定範囲に入る接触だけを返します。

## 独自の実装を接続する

`MmdPhysicsBackend`の`step(context)`は、入力のボーン状態と剛体・ジョイント情報から更新結果を返します。`reset`、`dispose`、`diagnostics`は任意のフックです。

行列は型名に示す列優先、回転はクォータニオンの`x, y, z, w`順で扱います。`step(context)`へ渡されるコンテキストは呼び出し間で再利用されるため、独自実装では入力配列の寿命と出力対象ボーンに注意してください。

`MmdDirectBufferPhysicsBackend`は再利用可能なステップバッファを供給する拡張です。ホットパスで配列を毎回確保せずに接続できます。Raw WASMのポインターAPIは通常のモデル再生には不要です。

[Physicsの全API](/api/reference/physics) / [バックエンドの型](/api/reference/physics/interfaces/MmdPhysicsBackend)
