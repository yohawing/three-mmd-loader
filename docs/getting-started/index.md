---
title: はじめに
description: モデル表示からVMDの再生までを順番に進めます。
---

このセクションでは、パッケージの導入からPMX・PMDモデルの表示、VMDモーションの再生までを順番に進めます。JavaScriptのモジュールと`async` / `await`の基本を前提としています。

1. [インストール](/getting-started/installation)：パッケージを追加し、アセットをHTTPで配信する準備を整えます。
2. [試すアセットを用意する](/getting-started/prepare-assets)：動作確認用のモデルとモーションを準備し、サーバーに置いてよいアセットの条件と配置方法を押さえます。
3. [最初のモデルを表示する](/getting-started/first-model)：カメラとライトを用意し、PMXまたはPMDモデルを初期ポーズで表示します。
4. [最初のアニメーションを再生する](/getting-started/first-animation)：VMDを読み込み、レンダーループで再生位置を更新します。

コードを書く前に手元のアセットで動作を試したい場合は、[Live demo](https://three.mmd.yohawing.com/)も利用できます。

このセクションでは物理演算を有効にせず、ボーンとモーフの再生までを扱います。髪や衣装を物理で動かす方法は、[物理](/guides/physics)を参照してください。
