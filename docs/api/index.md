---
title: API
description: 用途から公開APIの入口を選びます。
---

通常のモデル表示はルートの`ThreeMmdLoader`から始めます。必要に応じて用途別のサブパスを使います。

| import先 | 用途 |
| --- | --- |
| `@yohawing/three-mmd-loader` | parser、runtime、three、physicsの再export |
| `@yohawing/three-mmd-loader/parser` | ファイル解析と構造化データ |
| `@yohawing/three-mmd-loader/runtime` | アニメーション評価と状態取得 |
| `@yohawing/three-mmd-loader/three` | ローダーとThree.jsへの同期 |
| `@yohawing/three-mmd-loader/physics` | Bulletと物理バックエンドの型 |
| `@yohawing/three-mmd-loader/webgpu` | TSLマテリアルとパイプライン |
| `@yohawing/three-mmd-loader/worker` | Worker実行と通信 |

WebGPUとWorkerは専用サブパスから読み込みます。`dist`内の個別ファイルを直接importする実装は、公開exportと同じ互換性の対象ではありません。

## 目的から探す

[ローダー](/api/loader)、[Parser](/api/parser)、[Runtime](/api/runtime)、[Three.jsヘルパー](/api/three)、[Physics](/api/physics)、[WebGPU](/api/webgpu)、[Worker](/api/worker)に主要APIの選び方をまとめています。

全ての引数、戻り値、型はソースから生成する[APIリファレンス](/api/reference)を参照してください。生成リファレンスはこのサイトをビルドしたソースに対応します。使用中のnpmバージョンとの差がある場合は、そのパッケージに同梱された型定義を確認します。
