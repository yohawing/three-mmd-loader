---
title: アセットとテクスチャ
description: URLとローカルファイルからモデルとテクスチャを読み込みます。
---

モデルとテクスチャは別々に読み込まれます。モデル内の相対パスに対応するURLまたはファイルを用意します。

## 入力を選ぶ

| 入力 | 用途 | テクスチャの扱い |
| --- | --- | --- |
| `string` | HTTPで配信したモデルやモーション | モデルURLを基準に相対パスを解決 |
| `File` | ファイル選択やドロップ | 一緒に選択したファイルから`textureMap`を作成 |
| `Uint8Array` / `ArrayBuffer` | 取得済みのバイト列 | 元のURL情報がないため、`textureMap`などで指定 |

文字列は`fetch()`へ渡されます。OSの絶対パスを渡しても、ブラウザーから任意のディスクファイルを読めるわけではありません。

## フォルダー内のファイルを対応付ける

HTMLに`<input id="assets" type="file" webkitdirectory multiple>`を置いた例です。`scene`は作成済みのThree.jsシーンとします。

```ts
import {
  ThreeMmdLoader,
  createMmdTextureMapFromFiles,
  findMmdModelFiles
} from "@yohawing/three-mmd-loader";

const input = document.querySelector<HTMLInputElement>("#assets")!;
input.addEventListener("change", async () => {
  try {
    const files = Array.from(input.files ?? []);
    const modelFile = findMmdModelFiles(files)[0];
    if (!modelFile) throw new Error("PMXまたはPMDを含むフォルダーを選択してください。");
    const loader = new ThreeMmdLoader({
      textureMap: createMmdTextureMapFromFiles(files, modelFile)
    });
    const model = await loader.loadModel(modelFile);
    scene.add(model.root);
    console.table(model.diagnostics.textures);
  } catch (error) {
    console.error(error);
  }
});
```

この例は見つかった最初のモデルを追加します。複数モデルを扱うアプリケーションでは選択UIを設け、切り替え前のモデルを[破棄](/guides/performance-and-disposal)します。階層を失うと同名テクスチャを区別しにくくなるため、フォルダー構造を保ちます。

## 読み込み失敗を調べる

`loadModel()`の失敗は`try` / `catch`で扱います。モデルが返ってもテクスチャが欠けている場合は`model.diagnostics.textures`とネットワークパネルを確認します。外部配信では配信元のCORS設定も必要です。

URLを独自に対応付ける場合は`textureMap`または`textureResolver`、画像デコードを置き換える場合は`textureLoader`または`ddsLoader`を使います。モデルバイト列用の`fetch`設定だけでテクスチャの読み込みまで置き換わるわけではありません。
