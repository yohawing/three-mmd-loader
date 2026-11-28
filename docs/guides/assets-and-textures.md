---
title: アセットとテクスチャ
description: URLとローカルファイルからモデルとテクスチャを読み込みます。
---

HTTP配信だけでなく、ユーザーが選択したフォルダーや取得済みのバイト列からモデルを読み込むには、入力形式に応じたテクスチャ解決方法を選びます。モデルとテクスチャは別々に読み込まれるため、モデル内の相対パスに対応するURLまたはファイルが必要です。

このページのコード例は、[最初のモデルを表示する](/getting-started/first-model)で作成した`scene`を使う前提です。

## 入力を選ぶ

URLで読み込む方法は、モデルをサーバーで配信する前提です。サーバーに置いたファイルは閲覧者が誰でもダウンロードできるため、Web配信や再配布が許可されたモデルだけを置いてください。配信が許可されていないモデルは、利用者にファイルやフォルダーを選択してもらい、端末内で読み込みます。詳しくは[試すアセットを用意する](/getting-started/prepare-assets)を参照してください。

| 入力 | 用途 | テクスチャの扱い |
| --- | --- | --- |
| `string` | HTTPで配信したモデルやモーション | モデルURLを基準に相対パスを解決 |
| `File` | ファイル選択やドロップ | 一緒に選択したファイルから`textureMap`を作成 |
| `Uint8Array` / `ArrayBuffer` | 取得済みのバイト列 | 元のURL情報がないため、`textureMap`などで指定 |

文字列は`fetch()`へ渡されます。OSの絶対パスを渡しても、ブラウザーから任意のディスクファイルを読めるわけではありません。

## フォルダー内のファイルを対応付ける

HTMLに`<input id="assets" type="file" webkitdirectory multiple>`を置き、選択されたフォルダーからモデルとテクスチャを読み込む例です。

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

この例では最初に見つかったモデルを追加します。複数モデルを切り替えるアプリケーションでは選択UIを設け、切り替え前のモデルを[パフォーマンスと破棄](/guides/performance-and-disposal)の手順で解放してください。フォルダー階層を失うと同名テクスチャを区別しにくくなるため、フォルダー構造を保ったまま渡します。

## MMDのパス規則と配信時の注意

MMDモデルの内部に書かれたテクスチャパスはWindows環境を前提にしていることが多く、`\`（バックスラッシュ）区切りやファイル名末尾の空白、大文字小文字の違いを含む場合があります。

読み込み時、three-mmd-loaderはパス末尾の空白を取り除き、`\`を`/`へ、先頭の`./`を除いて正規化します。その後の照合方法は、読み込み経路によって異なります。

- **`textureMap`、`createMmdTextureMapFromFiles()`、`createMmdFileIndex()`**：正規化したパスを小文字化して照合するため、大文字小文字の違いを無視して見つけられます。
- **文字列URLでのHTTP配信**：正規化した相対パスをモデルのURLから解決します。大文字小文字の区別は配信サーバーの設定に依存します。

WindowsやmacOSの開発環境では表示できたのに、Linuxなどの公開サーバーでテクスチャが`404`になる場合は、モデル内のパス表記と実ファイル名の大文字小文字が一致しているかを確かめてください。

日本語を含むファイル名は、ZIP展開時の文字化けや配信サーバー側のURLエンコードの違いで解決できないことがあります。欠けたテクスチャがある場合は、開発者ツールのネットワークパネルで実際に要求されたURLと実ファイル名を突き合わせてください。

## 対応する画像形式

テクスチャの読み込み経路と対応状況は次のとおりです。

| 形式 | 読み込み経路 | 補足 |
| --- | --- | --- |
| PNG / JPEG / GIF / WebP | 既定の`THREE.TextureLoader` | `textureLoader`オプションで差し替え可能 |
| BMP（`.bmp`） | 既定のローダー＋32bitアルファ補正 | 32bit非圧縮BMPのアルファチャンネルをブラウザーで読めるようヘッダーを補完 |
| `.spa` / `.sph`（スフィアマップ） | 既定のローダー＋BMP向けアルファ補正 | URL解決や`textureMap`で読み込み。`createMmdTextureMapFromFiles()`の自動収集対象（`isMmdTextureFile`）には含まれない点に注意 |
| TGA（`.tga`） | 内蔵TGAデコーダー（`DataTexture`） | 非圧縮およびRLE圧縮の24bit・32bit truecolorに対応 |
| DDS（`.dds`） | `ddsLoader`オプション（任意） | 既定では未対応。`ddsLoader`を渡さない場合は`TEXTURE_FORMAT_UNSUPPORTED`の警告診断を出力 |
| 共有Toon（`toon01.bmp`〜`toon10.bmp`） | パッケージ同梱アセットから自動解決 | 独自に配信したToon画像を使う場合は`createMmdBuiltInToonTextureMap()`を指定可能 |

`createMmdTextureMapFromFiles()`が自動で集める拡張子は、`bmp`、`dds`、`gif`、`jpg`、`jpeg`、`png`、`tga`、`webp`です。

通常テクスチャはMMDのUV規約に合わせて`THREE.RepeatWrapping`と`THREE.SRGBColorSpace`で設定されます。Toonテクスチャは端の色を保つため、`THREE.ClampToEdgeWrapping`で読み込まれます。

## 読み込み失敗を調べる

モデルの読み込み失敗は`try` / `catch`で捕捉してください。モデルが返ってもテクスチャが欠けている場合は、`model.diagnostics.textures`と開発者ツールのネットワークパネルを見比べて原因を切り分けます。外部オリジンから配信する場合は、配信元のCORS設定も必要です。

テクスチャの読み込み処理を差し替えるには、用途に応じて次のオプションを指定します。

- URLの対応付けを独自に定義する：`textureMap`または`textureResolver`
- 画像のデコードを置き換える：`textureLoader`または`ddsLoader`

モデルバイト列用の`fetch`オプションを差し替えても、テクスチャの読み込みは置き換わらない点に注意してください。
