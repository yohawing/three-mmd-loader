---
title: インストール
description: パッケージを追加し、モデルをHTTPで配信する準備をします。
---

ESMを扱えるブラウザー向けプロジェクトに、ライブラリとThree.jsを追加します。モデル表示にはDOMとWebGLを使うため、ブラウザー側で初期化します。

## パッケージを追加する

プロジェクトのディレクトリで実行します。

```sh
npm install @yohawing/three-mmd-loader three
```

TypeScriptの型定義はパッケージに含まれています。TypeScriptで使う場合は、プロジェクトの`three`と同じマイナーバージョンの`@types/three`を開発依存に追加してください（例：`three@0.184.x`なら`npm install -D @types/three@0.184`）。

現在の`peerDependencies`はThree.jsの`>=0.176.0 <1.0.0`です。リポジトリの開発依存は`0.184.0`を基準にしており、この範囲内の全バージョンで同じ描画結果を保証するものではありません。特にTSLを使う場合は、[互換性](/reference/compatibility)を確認します。

## アセットをHTTPで配信する

モデル、モーション、テクスチャは開発サーバーの公開ディレクトリへ配置します。HTMLを`file://`で開くと、`fetch()`やWASMの読み込みが制限されます。

このガイドでは`/models/character/model.pmx`をモデルのURLとして使います。公開ディレクトリが`public`の環境では、`public/models/character/model.pmx`に配置します。

パッケージにはランタイムとBulletのJS・WASMが含まれます。バンドラーで配布ファイルの配置を変える場合は、JSが参照するWASMも配信されることを確認します。物理の配信設定は[物理](/guides/physics)を参照してください。

## importを確認する

ブラウザーで実行するモジュールから読み込みます。

```ts
import * as THREE from "three";
import { ThreeMmdLoader } from "@yohawing/three-mmd-loader";

console.log(THREE.REVISION, new ThreeMmdLoader());
```

コンソールにThree.jsのリビジョンとローダーが表示されたら、[最初のモデルを表示する](/getting-started/first-model)へ進みます。
