---
title: Parser
description: 描画せずにMMDファイルを解析します。
---

`@yohawing/three-mmd-loader/parser`は、Three.jsのシーンやレンダラーを作らずにMMDファイルを解析し、構造化データを取得するためのモジュールです。

## 必要な情報量で選ぶ

| 取得したい情報 | 主なAPI |
| --- | --- |
| モデルのメタデータ | `parsePmxMetadata()`、`parsePmdMetadata()` |
| モデルのセクション情報 | `parsePmxSectionInventory()`、`parsePmdSectionInventory()` |
| モデル全体のデータ | `initCore()`で初期化した`MmdCore` |
| モーションの解析 | `parseVmd()` |
| ポーズの解析 | `parseVpd()` |

各関数が受け付ける入力型は個別の型定義を参照してください。ローダーのURL入力と異なり、低水準の解析関数へURLを渡しても自動取得されません。

PMXのバイト列を取得し、メタデータを解析する例です。

```ts
import { parsePmxMetadata } from "@yohawing/three-mmd-loader/parser";

const response = await fetch("/models/character/model.pmx");
if (!response.ok) throw new Error(`HTTP ${response.status}`);
const bytes = new Uint8Array(await response.arrayBuffer());
console.log(parsePmxMetadata(bytes));
```

## WASMと診断

`initCore()`はWASMの初期化失敗を例外として返します。`initCoreWithFallback()`は失敗時にTypeScript実装の`FallbackCore`を返します。解析できたことと、すべての要素を描画・再生できることは別です。

PMMの構造解析には`parsePmmDocument()`や`parsePmmManifest()`、アクセサリの解析には`parseAccessory()`を使えます。解析結果の診断と[対応形式](/reference/formats)を見比べてから、アプリケーション側の表示や変換処理を組んでください。

[Parserの全API](/api/reference/parser) / [MmdCore](/api/reference/parser/interfaces/MmdCore)
