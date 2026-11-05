#!/usr/bin/env node
/* global document, window */
import {chromium} from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {PNG} from 'pngjs';
import {browserLaunchOptions} from './render-shared.mjs';
const folder=process.argv[2];
if(!folder)throw Error('Usage: check-shadow-stability.mjs MODEL_FOLDER [VIEWER_URL]');
const origin=process.argv[3]??'http://127.0.0.1:3939/';
const output='test-results/visual/shadow-stability';
const backends=(process.argv[4]??'baseline,webgpu,forcewebgl').split(',');
const variants=['stable'];
const angles=[0,0.125,0.25,0.5,1,2,4,0];
await mkdir(output,{recursive:true});
const records=[],errors=[],failures=[];
for(const backend of backends) {
  const launch=browserLaunchOptions();
  const browser=await chromium.launch({...launch,args:[...(launch.args??[]),'--enable-unsafe-webgpu']});
  try {
    const page=await browser.newPage({viewport:{width:640,height:576}});
    page.on('pageerror',e=>errors.push(`${backend}: ${e.message}`));
    page.on('console',m=>{if(m.type()==='error')errors.push(`${backend}: ${m.text()}`);if(m.text().includes('Error while parsing'))console.error(m.text());});
    await page.goto(`${origin}?physics=0&runtime=js&debug=1&backend=${backend}`);
    await page.waitForFunction(async()=>{
      const {state}=await import('/lib/state.js');
      return state.rendererStatus==='ready'&&state.runtimeReadiness==='ready'&&!!state.keyLight&&!!state.controls;
    });
    await page.evaluate(()=>document.querySelector('#model-folder').addEventListener('change',e=>e.stopImmediatePropagation(),true));
    await page.locator('#model-folder').setInputFiles(path.resolve(folder));
    await page.evaluate(async()=>{
      const {loadModelFolder}=await import('/lib/model-loading.js');
      const {renderStillFrame}=await import('/lib/playback.js');
      const {state}=await import('/lib/state.js');
      await loadModelFolder(Array.from(document.querySelector('#model-folder').files));
      if(!state.currentModel)throw Error(document.querySelector('#status').textContent);
      await renderStillFrame({physics:false,ik:false});
      state.renderer.setAnimationLoop(null);
      const raw={value:0};window.shadowComparison={raw};
      if(state.renderer.isWebGPURenderer) {
        const {MeshBasicNodeMaterial}=await import('three/webgpu');
        const {vec3}=await import('three/tsl');
        const {setMmdTslDedicatedRawVisibilityDebug}=await import('/lib/viewer-pipeline.js');
        const mesh=state.currentModel.mesh,original=mesh.material;
        const materials=Array.isArray(original)?original:[original];
        setMmdTslDedicatedRawVisibilityDebug(true);
        const nodes=materials.map(m=>m.userData.mmdTslDedicatedShadowVisibilityDebug?m.colorNode:undefined);
        setMmdTslDedicatedRawVisibilityDebug(false);
        const debugMaterials=materials.map((m,i)=>{
          if(!nodes[i])return m;
          const debug=new MeshBasicNodeMaterial({side:m.side,transparent:m.transparent,opacity:m.opacity,
            depthWrite:m.depthWrite,depthTest:m.depthTest,alphaTest:m.alphaTest,colorWrite:m.colorWrite});
          // Debug API wraps the scalar visibility in vec3(). Use its scalar input:
          // Three can incorrectly swizzle the shared scalar when reusing .r in a select.
          let wrapper=nodes[i];
          while(wrapper.isVarNode)wrapper=wrapper.node;
          if(wrapper.convertTo!=='vec3'||!wrapper.node)throw Error('Unexpected visibility debug node '+wrapper.constructor.name);
          const v=wrapper.node;debug.colorNode=vec3(v.lessThan(0).select(1,v),0,1);debug.positionNode=m.positionNode;debug.opacityNode=m.opacityNode;
          return debug;
        });
        window.shadowComparison.materialBinding={mesh,original,debug:Array.isArray(original)?debugMaterials:debugMaterials[0]};
      } else {
        const seen=new Set();
        state.currentModel.root.traverse(object=>{
          const list=Array.isArray(object.material)?object.material:[object.material];
          for(const material of list) {
            if(!material?.userData.mmdReferenceShadow||material.userData.mmdMaterial?.flags?.selfShadow!==true||seen.has(material))continue;
            seen.add(material);
            const compile=material.onBeforeCompile.bind(material),key=material.customProgramCacheKey.bind(material);
            material.onBeforeCompile=(shader,renderer)=>{
              compile(shader,renderer);shader.uniforms.comparisonRaw=raw;
              shader.fragmentShader='uniform float comparisonRaw;\n'+shader.fragmentShader;
              shader.fragmentShader=shader.fragmentShader.replace('#include <dithering_fragment>',
                '#include <dithering_fragment>\nif(comparisonRaw>0.5){float v=mmdReferenceVisibility(vMmdReferenceCoord);gl_FragColor=vec4(v<0.0?1.0:v,0.0,1.0,1.0);}');
            };
            material.customProgramCacheKey=()=>key()+'-comparison-raw';material.needsUpdate=true;
          }
        });
      }
      const yaw=-27.5*Math.PI/180,pitch=14.3*Math.PI/180,r=9;
      state.controls.target.set(0,18.7,0);
      state.camera.position.set(r*Math.sin(yaw)*Math.cos(pitch),18.7+r*Math.sin(pitch),r*Math.cos(yaw)*Math.cos(pitch));
      state.controls.update();state.camera.updateMatrixWorld(true);
      window.shadowComparison.fixedCamera=state.camera.clone();
      // Wait for the two diagnostic material permutations before measurements.
      await state.renderer.compileAsync(state.scene,state.camera);
    });
    await page.addStyleTag({content:'body *{visibility:hidden!important}#viewer-canvas{visibility:visible!important}'});
    for(const variant of variants) {
      const frames=[];
      console.log(`${backend}/${variant}`);
      for(let frame=0;frame<angles.length;frame++) {
        const info=await page.evaluate(async({angle})=>{
          const {state}=await import('/lib/state.js');
          const {submitViewerRender}=await import('/lib/viewer-pipeline.js');
          const yaw=(-27.5+angle)*Math.PI/180,pitch=14.3*Math.PI/180,r=9;
          state.controls.target.set(angle*0.08,18.7,0);
          state.camera.position.set(angle*0.08+r*Math.sin(yaw)*Math.cos(pitch),18.7+r*Math.sin(pitch),r*Math.cos(yaw)*Math.cos(pitch));
          state.controls.update();window.shadowComparison.raw.value=0;
          if(state.renderer.isWebGPURenderer) {
            const binding=window.shadowComparison.materialBinding;binding.mesh.material=binding.original;
          }
          submitViewerRender();
          const p=state.keyLight.userData.mmdShadowProjection;
          return {matrix:p.sampleMatrix.elements.slice(),mapSize:state.keyLight.shadow.mapSize.toArray(),
            native:state.renderer.backend?.isWebGPUBackend===true};
        },{angle:angles[frame]});
        const file=`${backend}-${variant}-${frame}`;
        await page.locator('#viewer-canvas').screenshot({path:`${output}/${file}.png`});
        // Reproject neither image nor camera motion: measure the same visible
        // world surface from a fixed camera, using the moving camera's shadow map.
        await page.evaluate(async()=>{
          const {state}=await import('/lib/state.js');
          window.shadowComparison.raw.value=1;
          if(state.renderer.isWebGPURenderer) {
            const binding=window.shadowComparison.materialBinding;binding.mesh.material=binding.debug;
          }
          const old=state.renderer.shadowMap.enabled;state.renderer.shadowMap.enabled=false;
          try {
            if(state.renderer.isWebGPURenderer)await state.renderer.renderAsync(state.scene,window.shadowComparison.fixedCamera);
            else state.renderer.render(state.scene,window.shadowComparison.fixedCamera);
          } finally {state.renderer.shadowMap.enabled=old;}
        });
        await page.locator('#viewer-canvas').screenshot({path:`${output}/${file}-visibility.png`});
        if(errors.length)throw Error(errors[0]);
        if(frame===0) {
          const png=PNG.sync.read(await readFile(`${output}/${file}.png`));
          let dark=0;
          for(let y=100;y<png.height;y++)for(let x=0;x<png.width;x++)if(png.data[4*(y*png.width+x)]<240)dark++;
          if(dark<1000)throw Error(`${backend}/${variant}: model not rendered`);
        }
        frames.push({file,...info});
      }
      let total=0,changed=0,count=0,maxMatrixChange=0;
      const first=PNG.sync.read(await readFile(`${output}/${frames[0].file}-visibility.png`));
      let shadowPixels=0,litPixels=0;
      // Receiver marker G=0,B=1 excludes unchanged nonreceiver colors/outline.
      const receiver=(png,i)=>png.data[i+1]<2&&png.data[i+2]>253;
      for(let y=100;y<first.height;y++)for(let x=0;x<first.width;x++) {
        const i=4*(y*first.width+x);
        if(receiver(first,i)){if(first.data[i]<240)shadowPixels++;else litPixels++;}
      }
      for(let f=1;f<frames.length;f++) {
        const beforeCount=count;
        const current=PNG.sync.read(await readFile(`${output}/${frames[f].file}-visibility.png`));
        for(let y=Math.floor(first.height*.15);y<first.height*.82;y++)for(let x=Math.floor(first.width*.28);x<first.width*.9;x++) {
          const i=4*(y*first.width+x);if(!receiver(first,i)||!receiver(current,i))continue;const d=Math.abs(current.data[i]-first.data[i]);total+=d;changed+=d>8?1:0;count++;
        }
        if(count-beforeCount<1000)failures.push(`${backend}/${variant}/${f}: insufficient common receiver pixels`);
        frames[f].matrix.forEach((v,i)=>{maxMatrixChange=Math.max(maxMatrixChange,Math.abs(v-frames[0].matrix[i]));});
      }
      const record={backend,variant,frames,shadowPixels,litPixels,meanVisibilityChange:total/count,changedFraction:changed/count,maxMatrixChange};
      records.push(record);
      if(!Number.isFinite(record.meanVisibilityChange))failures.push(`${backend}/${variant}: nonfinite visibility metric`);
      if(frames.some(f=>f.mapSize.some(v=>v!==4096)))failures.push(`${backend}/${variant}: not 4K`);
      if(backend==='webgpu'&&frames.some(f=>!f.native))failures.push('Native WebGPU fallback');
      if((maxMatrixChange>1e-10||record.meanVisibilityChange>0.1))failures.push(`${backend}/${variant}: unstable world shadow`);
      if((shadowPixels<1000||litPixels<1000))failures.push(`${backend}/${variant}: shadows disappeared`);
    }
  } finally {await browser.close();}
}
await writeFile(`${output}/report.json`,JSON.stringify({folder,angles,records,errors,failures},null,2));
const data=JSON.stringify({backends,variants,angles,records}).replaceAll('<','\\u003c');
await writeFile(`${output}/index.html`, `<!doctype html><meta charset="utf-8"><title>Shadow camera comparison</title><style>body{font:16px sans-serif;background:#202125;color:white}main{display:grid;grid-template-columns:minmax(0,640px);gap:8px}img{width:100%}pre{white-space:pre-wrap}input{width:50%}</style><h1>4Kセルフシャドウ：カメラ移動の安定性</h1><p>Stable方式のみ。固定視点の受影面で比較。診断画像は赤に可視率、青に受影面マスクを格納。平均差は同一Backend内で比較します（TSLはsRGB変換あり）。</p><select id="backend"></select><button id="play">再生 / 停止</button><input id="frame" type="range" min="0" max="7" value="0"><label><input id="raw" type="checkbox" style="width:auto">影の可視率（固定視点）</label><main></main><pre id="metrics"></pre><script>const data=${data};const select=document.querySelector('#backend');data.backends.forEach(b=>select.add(new Option(b,b)));function draw(){let b=select.value,f=document.querySelector('#frame').value,raw=document.querySelector('#raw').checked;document.querySelector('main').innerHTML=data.variants.map(v=>'<section><h3>'+v+'</h3><img src="'+b+'-'+v+'-'+f+(raw?'-visibility':'')+'.png"></section>').join('');document.querySelector('#metrics').textContent=JSON.stringify(data.records.filter(r=>r.backend===b).map(({variant,meanVisibilityChange,changedFraction,maxMatrixChange})=>({variant,meanVisibilityChange,changedFraction,maxMatrixChange})),null,2)}document.querySelectorAll('select,input').forEach(e=>e.oninput=draw);let timer;document.querySelector('#play').onclick=()=>{if(timer){clearInterval(timer);timer=undefined;}else timer=setInterval(()=>{const f=document.querySelector('#frame');f.value=(Number(f.value)+1)%8;draw()},450)};draw();</script>`);
console.log(JSON.stringify({results:records.map(({frames,...r})=>({...r,frames:frames.length})),errors,failures},null,2));
if(errors.length||failures.length)process.exitCode=1;
