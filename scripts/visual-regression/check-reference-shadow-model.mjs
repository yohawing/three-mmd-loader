#!/usr/bin/env node
/* global document, window */
// YYB maid face framing; local assets stay outside the repository.
// Requires the example viewer server. The oracle is backend shadow-mask parity,
// not an assertion of pixel identity with a separately captured MMD window.
import { chromium } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import { browserLaunchOptions } from './render-shared.mjs';
const folder = process.argv[2];
if (!folder) throw Error('Usage: node scripts/visual-regression/check-reference-shadow-model.mjs MODEL_FOLDER [VIEWER_URL]');
const url = process.argv[3] ?? 'http://127.0.0.1:3939/';
const output = 'test-results/visual/reference-shadow-model';
await mkdir(output, {recursive:true});
const launch = browserLaunchOptions();
let browser;
const captures = [], errors = [], failures = [];
const backends=(process.argv[4] ?? 'baseline,webgpu,tsl-forcewebgl').split(',');
const variants = [
  {name:'mode1',mode:1,distance:0.01125,yaw:-27.5},
  {name:'mode2',mode:2,distance:0.01125,yaw:-27.5},
  {name:'distance',mode:2,distance:0.025,yaw:-27.5},
  {name:'camera',mode:1,distance:0.01125,yaw:20}
];
try {
  for (const backend of backends) {
    console.log(`Loading ${backend}`);
    browser = await chromium.launch({...launch,args:[...(launch.args ?? []),'--enable-unsafe-webgpu']});
    const page = await browser.newPage({viewport:{width:1000,height:900}});
    page.on('pageerror', e=>{errors.push(`${backend}: ${e.message}`);console.error(e.message);});
    page.on('console', m=>{if(m.type()==='error')errors.push(`${backend}: ${m.text()}`);});
    await page.goto(`${url}?physics=0&runtime=js&shadowProjection=mmd&shadowSampling=mmd&backend=${backend==='tsl-forcewebgl'?'forcewebgl':backend}`);
    await page.waitForFunction(async()=>{
      const {state}=await import('/lib/state.js');
      return state.rendererStatus==='ready' && state.runtimeReadiness==='ready' &&
        !!state.keyLight && !!state.scene && !!state.controls;
    });
    // Explicitly await one folder load, independent of asynchronous UI setup.
    await page.evaluate(()=>document.querySelector('#model-folder').addEventListener('change',e=>e.stopImmediatePropagation(),true));
    await page.locator('#model-folder').setInputFiles(path.resolve(folder));
    await page.evaluate(async()=>{
      const {loadModelFolder}=await import('/lib/model-loading.js');
      await loadModelFolder(Array.from(document.querySelector('#model-folder').files));
      const {state}=await import('/lib/state.js');
      if(!state.currentModel) throw Error(JSON.stringify({status:document.querySelector('#status').textContent,pipeline:state.viewerPipeline,
        renderer:state.renderer?.isWebGPURenderer,native:state.renderer?.backend?.isWebGPUBackend,light:!!state.keyLight,
        factory:typeof (await import('/dist/webgpu/index.js')).createMmdTslPipeline}));
      const {renderStillFrame}=await import('/lib/playback.js');
      await renderStillFrame({physics:false,ik:false});
      // Freeze the rest pose: only explicit renders may affect comparisons.
      state.renderer.setAnimationLoop(null);
    });
    console.log(`Loaded ${backend}`);
    console.log(await page.evaluate(()=>({model:!!window.mmdViewer?.currentModel,status:document.querySelector('#status').textContent})));
    if(await page.locator('#credit-close').isVisible()) await page.locator('#credit-close').click();
    for(const variant of variants) {
      for(const enabled of [false,true]) {
        console.log(`Capture ${backend}/${variant.name}/${enabled}`);
        const info = await page.evaluate(async({variant,enabled})=>{
          const {state}=await import('/lib/state.js');
          const {submitViewerRender,syncMmdTslDedicatedShadowMode,syncMmdTslDedicatedShadowVisibility}=await import('/lib/viewer-pipeline.js');
          state.currentMotion={animation:{...state.restPoseAnimation,selfShadowFrames:[{frame:0,mode:variant.mode,distance:variant.distance}]}};
          const pitch=14.3*Math.PI/180,yaw=variant.yaw*Math.PI/180,r=9;
          state.controls.target.set(0,18.7,0);
          state.camera.position.set(r*Math.sin(yaw)*Math.cos(pitch),18.7+r*Math.sin(pitch),r*Math.cos(yaw)*Math.cos(pitch));
          state.controls.update();
          state.debugSelfShadowEnabled=enabled;
          state.keyLight.castShadow=enabled;
          state.selfShadowStateScratch.mode=variant.mode;
          state.selfShadowStateScratch.distance=variant.distance;
          syncMmdTslDedicatedShadowMode(variant.mode);
          syncMmdTslDedicatedShadowVisibility();
          submitViewerRender();
          return {model:state.currentModel.mesh.name,near:state.camera.near,far:state.camera.far,
            shadowMapSize:state.keyLight.shadow.mapSize.toArray(),
            nativeWebGPU:state.renderer.backend?.isWebGPUBackend===true,
            matrix:state.keyLight.userData.mmdShadowProjection.sampleMatrix.elements.slice()};
        },{variant,enabled});
        const file=`${output}/${backend}-${variant.name}-${enabled?'on':'off'}.png`;
        await page.locator('#viewer-canvas').screenshot({path:file});
        captures.push({backend,variant:variant.name,enabled,file,info});
      }
    }
    await page.close();
    await browser.close();
    browser=undefined;
  }
} finally { await browser?.close(); }
const masks = new Map(), comparisons=[];
for (const backend of ['baseline',...backends.filter(b=>b!=='baseline')]) for(const variant of variants) {
  const off=PNG.sync.read(await readFile(`${output}/${backend}-${variant.name}-off.png`));
  const on=PNG.sync.read(await readFile(`${output}/${backend}-${variant.name}-on.png`));
  const mask=new Uint8Array(on.width*on.height);
  let changed=0;
  for(let i=0;i<mask.length;i++) {
    const d=Math.max(...[0,1,2].map(c=>Math.abs(on.data[4*i+c]-off.data[4*i+c])));
    if(d>12) {mask[i]=1;changed++;}
  }
  masks.set(`${backend}-${variant.name}`,mask);
  comparisons.push({backend,variant:variant.name,shadowPixels:changed});
  if(changed<1000) failures.push(`${backend}/${variant.name}: shadow disappeared`);
}
for(const backend of backends.filter(b=>b!=='baseline')) for(const variant of variants) {
  const a=masks.get(`baseline-${variant.name}`),b=masks.get(`${backend}-${variant.name}`);
  let intersection=0,union=0;
  for(let i=0;i<a.length;i++){intersection+=a[i]&b[i];union+=a[i]|b[i];}
  const iou=intersection/union;
  comparisons.push({backend,variant:variant.name,shadowMaskIoU:iou});
  if(iou<0.90) failures.push(`${backend}/${variant.name}: shadow-mask IoU ${iou} < 0.90`);
}
if(!captures.filter(c=>c.backend==='webgpu').every(c=>c.info.nativeWebGPU))failures.push('Native WebGPU fallback');
for(const capture of captures) {
  if(capture.info.shadowMapSize.some(v=>v!==4096)) failures.push(`${capture.backend}: default shadow resolution must be 4096`);
  if(!(capture.info.near>0 && capture.info.near<capture.info.far)) failures.push(`${capture.backend}: invalid camera clip range`);
  const baseline=captures.find(c=>c.backend==='baseline' && c.variant===capture.variant && c.enabled===capture.enabled);
  if(baseline && capture.info.matrix.some((v,i)=>Math.abs(v-baseline.info.matrix[i])>1e-8)) {
    failures.push(`${capture.backend}/${capture.variant}: reference projection differs from Baseline`);
  }
}
await writeFile(`${output}/report.json`,JSON.stringify({folder,captures,comparisons,errors,failures},null,2));
console.log(JSON.stringify({comparisons,errors,failures},null,2));
if(errors.length||failures.length)process.exitCode=1;
