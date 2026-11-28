---
title: API
description: 用途から公開APIの入口を選びます。
---

`@yohawing/three-mmd-loader`は、ルートと6つのサブパスで公開APIを提供しています。通常のモデル表示はルートの`ThreeMmdLoader`から始め、必要に応じて用途別のサブパスをimportしてください。

| import先 | 用途 |
| --- | --- |
| `@yohawing/three-mmd-loader` | `ThreeMmdLoader`と主要なモデル・描画ヘルパー |
| `@yohawing/three-mmd-loader/parser` | ファイル解析と構造化データ |
| `@yohawing/three-mmd-loader/runtime` | アニメーション評価と状態取得 |
| `@yohawing/three-mmd-loader/three` | ローダーとThree.jsへの同期 |
| `@yohawing/three-mmd-loader/physics` | Bulletと物理バックエンドの型 |
| `@yohawing/three-mmd-loader/webgpu` | TSLマテリアルとパイプライン |
| `@yohawing/three-mmd-loader/worker` | Worker実行と通信 |

`0.9.x`では、parser、runtime、three、physicsの各exportもルートから再exportされていますが、一部は非推奨です。`1.0.0`では該当APIをサブパスからのimportに一本化します。詳しくは[1.0.0への移行](/guides/migration-to-1-0)を参照してください。

WebGPUとWorkerは専用サブパスから読み込みます。`dist`内の個別ファイルを直接importする使い方は、公開exportと同じ互換性保証の対象外です。

## モジュール別の入口

各モジュールの使い分けは個別ページにまとめています。

- [ThreeMmdLoader](/api/loader)
- [Parser](/api/parser)
- [Runtime](/api/runtime)
- [Three.jsヘルパー](/api/three)
- [Physics](/api/physics)
- [WebGPU](/api/webgpu)
- [Worker](/api/worker)

すべての引数、戻り値、型はソースから生成される[APIリファレンス](/api/reference)を参照してください。生成リファレンスはこのサイトをビルドしたソースに対応するため、使用中のnpmバージョンと差がある場合は、パッケージ同梱の型定義を見てください。
