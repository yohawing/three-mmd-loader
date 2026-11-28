---
title: WebGPU / TSL
description: TSLパイプラインでモデルを表示します。
---

ネイティブWebGPUとTSL（Three Shading Language）でMMDモデルを描画するには、`createMmdTslPipeline()`を使います。TSLマテリアル、モーフ更新、専用セルフシャドウをまとめて管理できます。

これは実験的な描画経路であり、1.0.0以降もsemverの保証対象外です。Three.jsのバージョンを固定したうえで動作を確かめてください。

## パイプラインで表示する

`three/webgpu`と`createMmdTslPipeline()`でモデルを表示する最小構成です。あらかじめ`/models/character/model.pmx`とテクスチャを配信しておいてください。

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

この例はモデル表示までを扱っています。モーションを再生する場合は、ループ開始前にVMDを読み込み、`model.setAnimation()`で設定してください。

`createMmdTslPipeline()`はレンダラーを初期化してから返ります。`pipeline.createModelLoadOptions()`は通常経路の輪郭線・描画順プロキシとの重複を避け、TSL向けのモーフ設定を選びます。モデル更新後は`pipeline.render()`で描画します。

## WebGPUを利用できない場合

このパイプラインはネイティブWebGPUを必須とします。WebGLへフォールバックした場合や`forceWebGL: true`を指定した場合は初期化に失敗し、エラーコード`MMD_TSL_PIPELINE_NATIVE_WEBGPU_REQUIRED`が送出されます。

WebGPUを利用できない環境では、通常の`WebGLRenderer`経路を使ってください。

低水準のTSLマテリアルAPIでWebGL向けの描画を独自に組み立てる構成は、パイプラインとは別です。専用セルフシャドウやモーフ処理がそのまま利用できるとは限りません。

現在のTSLスキニングはボーン行列をuniform bufferへ格納します。上限はGPUのバッファ制限で決まり、64 KiBなら1024ボーンです。頂点に使われていないボーンも数に含まれます。

上限を超えたモデルでは`attach()`でエラーになります。この場合は通常の`WebGLRenderer`経路へ切り替えてください。`forceWebGL`だけでは解消しません。

## 接続を解除する

モデルを終了するときは、`pipeline.detach(model)`の後に`disposeMmdModel(model)`を呼んでください。パイプライン自体が不要になったら、レンダーループを止めて`pipeline.dispose()`と`renderer.dispose()`を呼びます。破棄の責任分担は、[パフォーマンスと破棄](/guides/performance-and-disposal)を参照してください。
