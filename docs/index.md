---
title: three-mmd-loader
description: Three.jsでMMDモデルとモーションを表示・再生するライブラリです。
---

three-mmd-loaderは、Three.jsでPMX・PMDモデルを表示し、VMDモーションとVPDポーズを適用するライブラリです。MMDの材質、輪郭線、IK、モーフを扱い、Bulletによる物理演算も接続できます。

[はじめに](/getting-started)からモデル表示と再生を進めます。利用目的に合わせて[実装ガイド](/guides)と[API](/api)を参照してください。

![three-mmd-loader viewer screenshot](./assets/screenshots.png)

スクリーンショット使用アセット: モデル [Tda式初音ミク V4X by Tda](https://3d.nicovideo.jp/works/td30681)、
モーション [ラビットホール by mobiusP](https://www.nicovideo.jp/watch/sm42576784)。

## 目的から探す

| やりたいこと | 入口 |
| --- | --- |
| モデルを表示して動かす | [導入ガイド](/getting-started) |
| 髪や衣装を物理で動かす | [物理](/guides/physics) |
| WebGPUで表示する | [WebGPU / TSL](/guides/webgpu) |
| 対応形式と制約を確認する | [対応形式](/reference/formats) |
| 動作しない原因を調べる | [トラブルシューティング](/reference/troubleshooting) |
| ソースから開発する | [開発ガイド](/archive/development) |

PMMとアクセサリ形式には構造化解析APIがありますが、シーン全体の一括再生には対応していません。TSLは実験的な機能です。導入前に[互換性](/reference/compatibility)を確認してください。

## 関連プロジェクト

PMX解析とアニメーション処理の主要経路にはmmd-animを使用しています。開発にあたりBabylon-MMD、saba、nanoemを参考にしています。
