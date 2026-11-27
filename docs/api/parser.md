---
title: Parser
description: 描画せずにMMDファイルを解析します。
---

`/parser`はファイルの内容を調べるための入口です。Three.jsのシーンやレンダラーを作る必要はありません。

## 必要な情報量で選ぶ

`parsePmxMetadata()`と`parsePmdMetadata()`はモデルのメタデータ、`parsePmxSectionInventory()`と`parsePmdSectionInventory()`はセクションの情報を取得します。モデル全体を読み込む場合は`initCore()`で`MmdCore`を初期化して使います。

VMDは`parseVmd()`、VPDは`parseVpd()`で扱います。各関数が受け付ける入力は個別の型定義を確認してください。ローダーのURL入力と異なり、低水準の解析関数へURLを渡しても自動取得されません。

PMXのメタデータを取得する例です。

```ts
import { parsePmxMetadata } from "@yohawing/three-mmd-loader/parser";

const response = await fetch("/models/character/model.pmx");
if (!response.ok) throw new Error(`HTTP ${response.status}`);
const bytes = new Uint8Array(await response.arrayBuffer());
console.log(parsePmxMetadata(bytes));
```

## WASMと診断

`initCore()`はWASMの初期化失敗を例外として返します。`initCoreWithFallback()`は失敗時にTypeScriptの`FallbackCore`を返します。解析できたことと、全ての要素を描画・再生できることは別です。

PMMは`parsePmmDocument()`や`parsePmmManifest()`、アクセサリは`parseAccessory()`で構造を調べます。解析結果の診断と[対応形式](/reference/formats)を確認してから、アプリケーション側の表示・変換処理へ進みます。

[Parserの全API](/api/reference/parser) / [MmdCore](/api/reference/parser/interfaces/MmdCore)
