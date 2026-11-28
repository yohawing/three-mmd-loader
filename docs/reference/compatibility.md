---
title: 互換性
description: パッケージのバージョン範囲と描画経路の条件です。
---

パッケージが対応するThree.jsのバージョン範囲と、描画経路・実行環境ごとの動作条件をまとめています。

## Three.js

`peerDependencies`の範囲は`>=0.176.0 <1.0.0`で、リポジトリの開発依存は`0.184.0`を基準にしています。

インストール可能な範囲内でも、Three.js側のTSLやシェーダー変更によって動作が変わることがあります。アプリケーションではロックファイルを保存し、バージョン更新時にモデル、透過、影、モーフの表示を再検証してください。

## 描画経路

| 経路 | 構成 | 動作条件・注意点 |
| --- | --- | --- |
| 通常のWebGL | `three`と`WebGLRenderer` | ブラウザーのWebGL対応、モデルのテクスチャと影設定 |
| TSL / WebGPU | `three/webgpu`と`WebGPURenderer` | ネイティブWebGPUの利用可否、GPUのバッファ制限、TSL APIの互換性 |
| TSL / WebGL | 低水準のTSLマテリアルAPIを使う独自構成 | `createMmdTslPipeline()`は非対応で、ネイティブWebGPUを要求 |

TSLのボーン数上限はデバイスのuniform buffer制限に依存し、通常のWebGL経路で使われるボーンテクスチャとは仕組みが異なります。上限を超えたモデルは通常の`WebGLRenderer`経路へ切り替えてください。詳しくは[WebGPU / TSL](/guides/webgpu)を参照してください。

ブラウザーで使うJS・WASMはHTTPで配信してください。WebGPUや共有メモリはブラウザーのセキュリティー条件（HTTPSや`crossOriginIsolated`など）にも依存するため、実際の配信先で機能検出と初期化結果を確かめます。SSR環境では、モデル表示とブラウザー用Bulletの初期化をクライアント側へ置いてください。

## 描画以外の範囲

[Parser](/api/parser)には描画を必要としないAPIがあります。物理の導入とWorkerの配信条件は、それぞれ[物理](/guides/physics)と[Worker API](/api/worker)を参照してください。CIのNode.jsテストが成功しても、すべてのブラウザーとGPUでの描画互換性が確認されたことにはなりません。
