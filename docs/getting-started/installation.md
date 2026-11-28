---
title: インストール
description: パッケージを追加し、モデルをHTTPで配信する準備をします。
---

このページでは、プロジェクトへthree-mmd-loaderとThree.jsを追加し、モデルやWASMをHTTPで配信できる状態まで進めます。

## 前提条件

- WebGLに対応したブラウザー
- Node.jsと、ESMを扱えるバンドラーまたは開発サーバー（Viteなど）
- モデルやテクスチャをHTTPで配信できる環境

モデル表示にはDOMとWebGLを使うため、描画とローダーの初期化はブラウザー側で行ってください。

## パッケージを追加する

プロジェクトのディレクトリで、本体と`three`をインストールしてください。

```sh
npm install @yohawing/three-mmd-loader three
```

TypeScriptの型定義はパッケージに含まれています。TypeScriptで使う場合は、プロジェクトの`three`と同じマイナーバージョンの`@types/three`を開発依存に追加してください。たとえば`three@0.184.x`なら`npm install -D @types/three@0.184`を実行します。

現在の`peerDependencies`はThree.jsの`>=0.176.0 <1.0.0`で、リポジトリの開発依存は`0.184.0`を基準にしています。範囲内のすべてのバージョンで同じ描画結果を保証しません。とくにTSLを使う場合は、[互換性](/reference/compatibility)を参照してください。

## アセットをHTTPで配信する

モデル、モーション、テクスチャは開発サーバーの公開ディレクトリへ配置してください。HTMLを`file://`で開くと、`fetch()`やWASMの読み込みがブラウザーに制限されます。

以降のページでは、モデルのURLとして`/models/character/model.pmx`を使います。公開ディレクトリが`public`の環境では、`public/models/character/model.pmx`に配置してください。

パッケージにはランタイムとBulletのJS・WASMが含まれます。バンドラーで配布ファイルの配置を変える場合は、JSが参照するWASMも配信されるように設定します。物理アセットの配信設定は、[物理](/guides/physics)を参照してください。

## importを確かめる

ブラウザーで実行するモジュールから読み込み、ローダーを生成できることを確かめてください。

```ts
import * as THREE from "three";
import { ThreeMmdLoader } from "@yohawing/three-mmd-loader";

console.log(THREE.REVISION, new ThreeMmdLoader());
```

コンソールにThree.jsのリビジョンと`ThreeMmdLoader`のインスタンスが出力されれば導入は完了です。次は[試すアセットを用意する](/getting-started/prepare-assets)へ進んでください。
