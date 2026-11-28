---
title: 開発ガイド
description: ソースからライブラリとドキュメントをビルドします。
---

リポジトリのソースコードからライブラリとドキュメントをビルドし、ローカルで検証するための手順です。npmパッケージを利用するだけの場合は、[インストール](/getting-started/installation)へ進んでください。

## 環境を用意する

ドキュメントの依存を含め、Node.js 22.19.0以降の22系または24系とnpmが必要です。サブモジュールを初期化したうえで、コミット済みの`package-lock.json`から依存パッケージを導入してください。

```sh
git submodule update --init native/third_party/mmd-anim
npm ci
```

WASM成果物はGitに含まれません。新しいチェックアウトでは、CIと同じツールチェーンを用意して生成してください。

必要なバージョンはRust 1.88.0、wasm-pack 0.13.1、Emscripten 5.0.7です。ツールチェーンを更新する場合は、ワークフローとビルドスクリプトもあわせて見直してください。

次のコマンドでWASM成果物と配布用`dist`を生成します。

```sh
npm run build:mmd-anim
npm run build:bullet:mmd
npm run build
```

各コマンドの役割は次のとおりです。

- `build:mmd-anim`：ランタイム成果物を`artifacts/mmd-anim/runtime`へ生成します。
- `build:bullet:mmd`：Bullet成果物を`artifacts/mmd-anim/bullet`へ生成します。
- `npm run build`：準備済みの成果物を使ってTypeScriptをコンパイルし、配布用の`dist`へコピーします。ネイティブコードの再ビルドは行いません。

`src/parser/wasm/generated`はTypeScriptビルド用の一時配置です。生成したJS・WASM・型定義や`dist`はソースとしてコミットしないでください。

## ドキュメントを編集する

本文は`docs`、サイト設定は`docs-site/blume.config.ts`にあります。APIページはソースから生成するため、前項の成果物準備を済ませてから開発サーバーを起動してください。

```sh
npm run docs:dev
```

表示されたローカルURLをブラウザーで開くと、本文の変更が開発サーバーへ反映されます。

APIの型やコメントを編集した場合は、`npm run docs:api`で再生成してください。`docs/api/reference`を直接修正しても、次回の生成で上書きされます。

ビルドと型検査には次のコマンドを実行してください。

```sh
npm run docs:build
npm run docs:check
```

`docs:build`はAPI生成と静的サイトのビルドを実行し、`docs-site/dist`へ出力します。`docs:check`はサイトの型検査を実行します。

これらのコマンドは掲載コードの実行結果やリンク先の内容までは保証しません。変更したコード例とページは目視でも確かめてください。ローカル運用文書と作業計画はサイトの対象外です。

## ライブラリを検証する

成果物を生成した後、基本の検証を一通り実行してください。

```sh
npm run lint
npm run build
npm test
npm run check:fixtures
npm run smoke:dist
npm run smoke:types
npm run check:mmd-anim:artifacts
npm run smoke:bullet:mmd
```

CIはNode.js 22系と24系で検証し、WASMの公開ABIと成果物の一致も検査します。正確な実行順と追加検査は`.github/workflows/ci.yml`を参照してください。

描画変更では該当するvisual smokeを追加してください。比較するモデル、描画経路、画面サイズ、フレームをそろえ、画像と結果を記録します。

ユーザー所有アセットを使うローカル検証は、配布可能なフィクスチャによる検証と分けて報告してください。

## 配布内容を確認する

公開前に、パッケージへ含まれるファイル一覧を次のコマンドで出力してください。

```sh
npm pack --dry-run --json
```

`package.json`の`files`と出力一覧を突き合わせ、必要なJS、型定義、WASM、Toon画像がそろっているかを確かめてください。ローカルアセット、テスト結果、作業用文書は公開物へ含めません。公開手順に関する利用者向け情報は、[リリース方針](/project/release-policy)を参照してください。
