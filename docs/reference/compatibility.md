---
title: 互換性
description: パッケージのバージョン範囲と描画経路の条件です。
---

パッケージの依存範囲と、実際に使う描画経路を分けて確認します。このページは現在のリポジトリの設定に基づきます。

## Three.js

`peerDependencies`は`>=0.176.0 <1.0.0`、開発依存の基準は`0.184.0`です。インストール可能な範囲内でも、TSLやシェーダーの変更によって動作が変わることがあります。アプリケーションではロックファイルを保存し、更新時にモデル、透過、影、モーフを再確認します。

## 描画経路

| 経路 | 構成 | 確認する点 |
| --- | --- | --- |
| 通常のWebGL | `three`と`WebGLRenderer` | ブラウザーのWebGL対応、モデルのテクスチャと影 |
| TSL / WebGPU | `three/webgpu`と`WebGPURenderer` | WebGPUの利用可否、GPUの制限、TSL APIの互換性 |
| TSL / WebGL | 低水準のTSL材質APIを使う独自構成 | `createMmdTslPipeline()`は対応せず、ネイティブWebGPUを要求 |

TSLのボーン数上限はデバイスのuniform buffer制限に依存します。通常WebGLのボーンテクスチャとは異なります。超過したモデルは[通常描画](/getting-started/first-model)へ切り替えます。

ブラウザーで使うJS・WASMはHTTPで配信します。WebGPUや共有メモリはブラウザーのセキュリティー条件にも依存するため、実際の配信先で機能検出と初期化結果を確認します。SSRではモデル表示とブラウザー用Bulletの初期化をクライアント側へ置きます。

## 描画以外の範囲

[Parser](/api/parser)には描画を必要としないAPIがあります。物理の導入とWorkerの配信は、それぞれ[物理](/guides/physics)と[Worker](/api/worker)を参照してください。CIのNode.jsテスト成功だけで、全ブラウザー・GPUの描画互換性が確認されたことにはなりません。
