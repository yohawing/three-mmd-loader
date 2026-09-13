---
title: 開発ガイド
description: ソースからライブラリとドキュメントをビルドします。
---

npmパッケージの利用者は[インストール](/getting-started/installation)へ進んでください。このページはリポジトリを編集する開発者向けです。

## 環境を用意する

ドキュメントの依存を含め、Node.js 22.19.0以降の22系または24系とnpmを使います。依存はコミット済みの`package-lock.json`から導入します。

```sh
git submodule update --init native/third_party/mmd-anim
npm ci
```

WASM成果物はGitに含まれません。新しいチェックアウトでは、CIが使うRust 1.88.0、wasm-pack 0.13.1、Emscripten 5.0.7を用意して生成します。ツールチェーンを更新する場合は、ワークフローとビルドスクリプトも確認します。

```sh
npm run build:mmd-anim
npm run build:bullet:mmd
npm run build
```

`build:mmd-anim`はランタイム成果物を`artifacts/mmd-anim/runtime`へ、`build:bullet:mmd`はBullet成果物を`artifacts/mmd-anim/bullet`へ生成します。`npm run build`は準備済み成果物を使ってTypeScriptをコンパイルし、配布用の`dist`へコピーします。ネイティブコードを再ビルドするコマンドではありません。

`src/parser/wasm/generated`はTypeScriptビルド用の一時配置です。生成JS・WASM・型定義や`dist`をソースとしてコミットしないようにします。

## ドキュメントを編集する

本文は`docs`、サイト設定は`docs-site/blume.config.ts`にあります。APIページはソースから生成します。前項の成果物準備を済ませてから実行します。

```sh
npm run docs:dev
```

表示されたローカルURLをブラウザーで開きます。本文の変更は開発サーバーへ反映されます。APIの型やコメントを編集した場合は`npm run docs:api`で再生成します。`docs/api/reference`を直接修正しても次回生成で上書きされます。

完成確認には次を実行します。

```sh
npm run docs:build
npm run docs:check
```

`docs:build`はAPI生成と静的サイトのビルドを行い、`docs-site/dist`へ出力します。`docs:check`はサイトの型検査です。掲載コードの実行結果やリンク先の内容まで保証するものではないため、変更した例とページも確認します。ローカル運用文書と作業計画はサイトの対象外です。

## ライブラリの検証

成果物を生成した後、基本の検証を実行します。

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

CIはNode.js 22系と24系で検証し、WASMの公開ABIと成果物の一致も確認します。正確な実行順と追加検査は`.github/workflows/ci.yml`を参照します。

描画変更では該当するvisual smokeを追加します。比較するモデル、描画経路、画面サイズ、フレームを揃え、画像と結果を記録します。ユーザー所有アセットを使うローカル検証は、配布可能なフィクスチャによる検証と分けて報告します。

## 配布内容を確認する

```sh
npm pack --dry-run --json
```

`package.json`の`files`と実際の一覧を照合し、必要なJS・型定義・WASM・Toon画像が含まれるか確認します。ローカルアセット、テスト結果、作業用文書を公開物へ含めないようにします。公開手順に関する利用者向け情報は[リリース方針](/project/release-policy)を参照してください。
