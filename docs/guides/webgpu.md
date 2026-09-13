---
title: WebGPU / TSL
description: TSLパイプラインでモデルを表示します。
---

`createMmdTslPipeline()`はTSLマテリアル、モーフ更新、セルフシャドウをまとめて管理します。実験的な描画経路のため、Three.jsのバージョンを固定して確認します。

## パイプラインで表示する

以下はブラウザー用の最小構成です。`/models/character/model.pmx`とテクスチャを配信しておきます。

```ts
import * as THREE from "three/webgpu";
import { ThreeMmdLoader } from "@yohawing/three-mmd-loader";
import { createMmdTslPipeline } from "@yohawing/three-mmd-loader/webgpu";

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 1000);
const renderer = new THREE.WebGPURenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
camera.position.set(0, 10, 35);
camera.lookAt(0, 10, 0);
const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(5, 15, 10);
light.castShadow = true;
scene.add(light, light.target);
const pipeline = await createMmdTslPipeline(renderer, { light, selfShadowEnabled: true });
const loader = new ThreeMmdLoader();
const model = await loader.loadModel(
  "/models/character/model.pmx",
  pipeline.createModelLoadOptions()
);
scene.add(model.root);
pipeline.attach(model);
const startedAt = performance.now();
renderer.setAnimationLoop(() => {
  model.update((performance.now() - startedAt) / 1000);
  pipeline.render(scene, camera);
});
```

この例はモデル表示までです。モーションを再生する場合は、ループ開始前にVMDを読み込み、`model.setAnimation()`で設定します。

`createMmdTslPipeline()`はレンダラーを初期化してから返ります。`createModelLoadOptions()`は通常経路の輪郭線・描画順プロキシとの重複を避け、TSL向けのモーフ設定を選びます。モデル更新後は`pipeline.render()`で描画します。

## WebGPUを利用できない場合

このパイプラインはネイティブWebGPUを必須とします。レンダラーがWebGLへフォールバックした場合や`forceWebGL: true`を指定した場合は、`MMD_TSL_PIPELINE_NATIVE_WEBGPU_REQUIRED`で初期化を拒否します。WebGPUを利用できない環境では通常の`WebGLRenderer`経路を使います。

低水準のTSL材質APIを使ってWebGL向けの描画を組み立てる構成は、パイプラインとは別です。専用セルフシャドウやモーフ処理をそのまま利用できるとは限りません。

現在のTSLスキニングはボーン行列をuniform bufferへ格納します。上限はGPUのバッファ制限で決まり、64 KiBなら1024ボーンです。頂点に使われていないボーンも数えます。超過時は`attach()`でエラーになり、通常の`WebGLRenderer`経路への切り替えが必要です。`forceWebGL`だけでは解消しません。

## 接続を解除する

モデルの終了時は`pipeline.detach(model)`を呼び、その後に`disposeMmdModel(model)`を呼びます。パイプライン自体が不要になったら、レンダーループを止めて`pipeline.dispose()`と`renderer.dispose()`で終了します。[破棄の例](/guides/performance-and-disposal)も参照してください。
