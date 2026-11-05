/* global document */
import { attachMmdMaterialFactors, syncMmdSpecularDirection } from "../../dist/three/index.js";
import { attachMmdReferenceShadow } from "../../dist/three/material/material-reference-shadow.js";
import { getMmdShadowProjection } from "../../dist/three/mmd-shadow-projection.js";
import { createMmdTslShadowVisibilityNode } from "../../dist/webgpu/shadow-visibility.js";
import { createMmdTslToonMaterial } from "../../dist/webgpu/material-core.js";
import { MmdWebGlReferenceShadowPass } from "../../dist/three/reference-shadow-pass.js";
import { createMmdTslSelfShadowPass } from "../../dist/webgpu/self-shadow-pass.js";

async function readDepth(renderer,target,x,y,backend) {
  if(backend==='webgpu') return renderer.readRenderTargetPixelsAsync(target,x,y,1,1);
  const pixel=new Float32Array(1);
  if(backend==='baseline'){renderer.readRenderTargetPixels(target,x,y,1,1,pixel);return pixel;}
  // Three's fallback byte-size helper omits RED and returns an empty buffer.
  // Read R32F directly; an empty/NaN result must never pass a numerical test.
  const gl=renderer.backend.gl, state=renderer.backend.state;
  const previous=gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),fbo=gl.createFramebuffer();
  try {
    state.bindFramebuffer(gl.READ_FRAMEBUFFER,fbo);
    gl.framebufferTexture2D(gl.READ_FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,renderer.backend.get(target.texture).textureGPU,0);
    gl.readPixels(x,y,1,1,gl.RED,gl.FLOAT,pixel);
  } finally {state.bindFramebuffer(gl.READ_FRAMEBUFFER,previous);gl.deleteFramebuffer(fbo);}
  return pixel;
}

export async function runReferenceShadowProbe() {
  const cases = [], failures = [];
  for (const backend of ["baseline", "webgpu", "forcewebgl"]) {
    const THREE = await import(backend === "baseline" ? "three" : "three/webgpu");
    const renderer = backend === "baseline" ? new THREE.WebGLRenderer({antialias:false}) :
      new THREE.WebGPURenderer({antialias:false, forceWebGL:backend === "forcewebgl", reversedDepthBuffer:backend === "webgpu"});
    if (backend !== "baseline") await renderer.init();
    if (backend === "webgpu" && !renderer.backend.isWebGPUBackend) throw new Error("Native WebGPU required");
    renderer.setSize(65,65);
    document.body.append(renderer.domElement);
    const target = new (THREE.WebGLRenderTarget ?? THREE.RenderTarget)(65,65);
    target.texture.colorSpace = THREE.SRGBColorSpace;
    const texture = new THREE.DataTexture(new Float32Array([0.2,0.8,0.2,0.8]),2,2,THREE.RedFormat,THREE.FloatType);
    texture.minFilter = texture.magFilter = THREE.NearestFilter;
    texture.needsUpdate = true;
    const toon = new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1);
    toon.needsUpdate = true;
    const light = new THREE.DirectionalLight();
    const projection = getMmdShadowProjection(light);
    const enabled = {value:1}, mode = {value:1};
    let material, visibility;
    if (backend === "baseline") {
      material = new THREE.MeshToonMaterial({gradientMap:toon});
      material.userData.mmdMaterial = { diffuse:[0,0,0,1], ambient:[1,1,1], specular:[0,0,0], specularPower:0, flags:{selfShadow:true} };
      attachMmdMaterialFactors(material);
      syncMmdSpecularDirection(material,new THREE.Vector3(0,0,1));
      attachMmdReferenceShadow(material, {
        mmdReferenceMap:{value:texture},mmdReferenceMatrix:{value:projection.sampleMatrix},
        mmdReferenceSampling:projection.sampling,mmdReferenceBias:projection.receiverBias,mmdReferenceNormalBias:projection.normalBias,
        mmdReferenceMode:mode,mmdReferenceEnabled:enabled,mmdReferenceSize:{value:new THREE.Vector2(2,2)}
      });
    } else {
      visibility = createMmdTslShadowVisibilityNode(light,texture);
      material = createMmdTslToonMaterial({diffuse:[0,0,0],ambient:[1,1,1],specular:[0,0,0],
        lightDirection:new THREE.Vector3(0,0,1),toonMap:toon,dedicatedShadowVisibilityNode:visibility});
      material.userData.mmdTslMaterialUniforms.dedicatedShadowEnabled.value = 1;
    }
    const geometry = new THREE.PlaneGeometry(2,2);
    const mesh = new THREE.Mesh(geometry,material), scene = new THREE.Scene();
    scene.add(mesh);
    const camera = new THREE.OrthographicCamera(-1,1,1,-1,0.1,10);
    camera.position.z = 2;
    const probes = [
      ["mode1 lit",1,0.5,0.5,0.5,255],
      ["mode1 penumbra and bilinear depth",1,0.5,0.5,0.5+0.8/1500,128],
      ["mode1 full shadow",1,0.5,0.5,0.5+1.5/1500,0],
      ["mode2 top UV",2,0.5,0.25,0.5+0.8/2000,128],
      ["mode2 bottom UV",2,0.5,0.75,0.5+0.8/6000,128],
      ["mode2 zero Y",2,0.5,0,0.9,255],
      ["edge clamp",1,0,0.5,0.2+0.8/1500,128],
      ["outside bypasses toon",1,-0.1,0.5,0.9,255],
      ["reference tests XY not Z",1,0.5,0.5,1.2,0]
    ];
    for (const [label,m,x,y,z,value] of probes) {
      projection.sampleMatrix.set(0,0,0,x, 0,0,0,y, 0,0,0,z, 0,0,0,1);
      mode.value = m;
      if (visibility) visibility.mmdTslShadowMode.value = m;
      const normals = geometry.getAttribute("normal");
      for(let i=0;i<normals.count;i++) normals.setXYZ(i,0,0,label.startsWith("outside")?-1:1);
      normals.needsUpdate = true;
      renderer.setRenderTarget(target);
      if (backend === "baseline") renderer.render(scene,camera); else await renderer.renderAsync(scene,camera);
      let pixels;
      if (backend === "baseline") { pixels=new Uint8Array(4); renderer.readRenderTargetPixels(target,32,32,1,1,pixels); }
      else pixels = await renderer.readRenderTargetPixelsAsync(target,32,32,1,1);
      const actual = Array.from(pixels).slice(0,3), name=`${backend} reference ${label}`;
      cases.push({name,actual,expected:[value,value,value]});
      if(actual.length!==3 || actual.some(v=>!Number.isFinite(v)||Math.abs(v-value)>2)) failures.push(name);
    }
    for(const [sampling,z,expected] of [[0,0.6,0],[1,0.6,255],[2,0.6,255],[2,-0.1,255],[1,0.8+0.8/1500,128],[2,0.8+0.8/1500,0]]) {
      projection.sampling.value=sampling;mode.value=1;if(visibility)visibility.mmdTslShadowMode.value=1;
      projection.sampleMatrix.set(0,0,0,0.5,0,0,0,0.5,0,0,0,z,0,0,0,1);
      renderer.setRenderTarget(target);
      if(backend==='baseline')renderer.render(scene,camera);else await renderer.renderAsync(scene,camera);
      let pixel;
      if(backend==='baseline'){pixel=new Uint8Array(4);renderer.readRenderTargetPixels(target,32,32,1,1,pixel);}
      else pixel=await renderer.readRenderTargetPixelsAsync(target,32,32,1,1);
      const name=`${backend} independent sampling ${sampling}, z=${z}`;
      cases.push({name,actual:pixel[0],expected});
      if(!Number.isFinite(pixel[0])||Math.abs(pixel[0]-expected)>2)failures.push(name);
    }
    projection.sampling.value=0;
    texture.image.data.set(backend==='baseline'?[0.4,1,0.2,0.8]:[0.2,0.8,0.4,1]);
    texture.needsUpdate=true;
    for(const [y,depth] of [[0.25,0.5],[0.75,0.7]]) {
      projection.sampleMatrix.set(0,0,0,0.5,0,0,0,y,0,0,0,depth+0.8/(8000*y),0,0,0,1);
      mode.value=2;if(visibility)visibility.mmdTslShadowMode.value=2;
      renderer.setRenderTarget(target);
      if(backend==='baseline')renderer.render(scene,camera);else await renderer.renderAsync(scene,camera);
      let pixel;
      if(backend==='baseline'){pixel=new Uint8Array(4);renderer.readRenderTargetPixels(target,32,32,1,1,pixel);}
      else pixel=await renderer.readRenderTargetPixelsAsync(target,32,32,1,1);
      const name=`${backend} asymmetric depth rows at y=${y}`;
      cases.push({name,actual:pixel[0],expected:128});
      if(!Number.isFinite(pixel[0])||Math.abs(pixel[0]-128)>2)failures.push(name);
    }
    if(backend==='baseline') {
      // A rendered program must bind a new pass even when its shader cache key
      // is unchanged. The new pass is disabled, so the black legacy toon wins.
      projection.sampleMatrix.set(0,0,0,-0.1,0,0,0,0.5,0,0,0,0.5,0,0,0,1);
      attachMmdReferenceShadow(material,{
        mmdReferenceMap:{value:texture},mmdReferenceMatrix:{value:projection.sampleMatrix},
        mmdReferenceMode:{value:1},mmdReferenceEnabled:{value:0},mmdReferenceSize:{value:new THREE.Vector2(2,2)}
      });
      renderer.render(scene,camera);
      const pixel=new Uint8Array(4);renderer.readRenderTargetPixels(target,32,32,1,1,pixel);
      const name='baseline rendered receiver rebinds to replacement pass';
      cases.push({name,actual:Array.from(pixel).slice(0,3),expected:[0,0,0]});
      if(pixel[0]>2)failures.push(name);
    }
    geometry.dispose();material.dispose();toon.dispose();texture.dispose();target.dispose();
    // Exercise the real caster target and raster winding, not a prepared texture.
    light.castShadow=true;
    light.shadow.mapSize.set(64,64);
    const casterScene=new THREE.Scene();
    const pass=backend==='baseline' ? new MmdWebGlReferenceShadowPass(renderer,light) : createMmdTslSelfShadowPass(renderer,light);
    const depthTarget=pass.target ?? pass.renderTarget;
    const casterMaterial=backend==='baseline' ? new THREE.MeshBasicMaterial() : new THREE.MeshBasicNodeMaterial();
    const casterGeometry=new THREE.BufferGeometry();
    const caster=new THREE.Mesh(casterGeometry,casterMaterial);
    caster.castShadow=true;caster.frustumCulled=false;caster.layers.set(1);casterScene.add(caster);
    casterGeometry.setIndex([0,1,2]);
    casterGeometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(9),3));
    if(backend==='baseline')pass.add(caster);
    for(const shadowMode of [1,2]) {
      projection.update(camera,shadowMode,0.01125);
      const inverse=projection.sampleMatrix.clone().invert();
      const positions=casterGeometry.attributes.position;
      const points=[[0.2,0.8,0.3],[0.8,0.8,0.3],[0.5,0.2,0.3]];
      points.forEach((point,i)=>{const p=new THREE.Vector3(...point).applyMatrix4(inverse);positions.setXYZ(i,p.x,p.y,p.z);});
      positions.needsUpdate=true;
      for(const [label,indices,side,expected,flags={selfShadowMap:true},edge=1,opacity=1] of [
        ['front',[0,1,2],THREE.FrontSide,0.3],
        ['back culled',[0,2,1],THREE.FrontSide,1],
        ['double side',[0,2,1],THREE.DoubleSide,0.3],
        ['ground only excluded',[0,1,2],THREE.FrontSide,1,{groundShadow:true},1,1],
        ['edge morph zero',[0,1,2],THREE.FrontSide,1,{selfShadowMap:true},0,1],
        ['edge morph restored',[0,1,2],THREE.FrontSide,0.3,{selfShadowMap:true},1,1],
        ['special alpha 0.98',[0,1,2],THREE.FrontSide,1,{selfShadowMap:true},1,0.98],
        ['alpha zero still casts',[0,1,2],THREE.FrontSide,0.3,{selfShadowMap:true},1,0]
      ]) {
        casterGeometry.setIndex(indices);casterMaterial.side=side;casterMaterial.shadowSide=side;
        casterMaterial.userData.mmdMaterial={flags,edgeColor:[0,0,0,1]};
        casterMaterial.userData.mmdMaterialState={edgeColor:[0,0,0,edge]};
        casterMaterial.opacity=opacity;
        // Baseline caster materials are created at registration time.
        if(backend==='baseline'){pass.remove(caster);pass.add(caster);pass.render(casterScene,camera,true,shadowMode,0.01125);}
        else {pass.setMode(shadowMode);pass.render(renderer,casterScene,light);}
        const pixel=await readDepth(renderer,depthTarget,depthTarget.width/2,depthTarget.height/2,backend);
        const actual=pixel[0],name=`${backend} caster mode${shadowMode} ${label}`;
        cases.push({name,actual,expected});if(!Number.isFinite(actual)||Math.abs(actual-expected)>0.002)failures.push(name);
      }
    }
    // D3D9 rasterizes texel (i,j) at integer viewport coordinates, unlike
    // modern APIs' (i+.5,j+.5). A sloped raw-depth plane distinguishes them.
    projection.update(camera,1,0.01125);
    const inverse=projection.sampleMatrix.clone().invert();
    const slopes=[[0.2,0],[0,0.3],[0.2,0.3]];
    for(const [sx,sy] of slopes) {
      [[0.1,0.9],[0.9,0.9],[0.5,0.1]].forEach(([u,v],i)=>{
        const p=new THREE.Vector3(u,v,0.1+sx*u+sy*v).applyMatrix4(inverse);
        casterGeometry.attributes.position.setXYZ(i,p.x,p.y,p.z);
      });
      casterGeometry.attributes.position.needsUpdate=true;
      casterGeometry.setIndex([0,1,2]);casterMaterial.side=THREE.DoubleSide;casterMaterial.shadowSide=THREE.DoubleSide;
      casterMaterial.opacity=1;casterMaterial.userData.mmdMaterialState.edgeColor[3]=1;
      if(backend==='baseline'){pass.remove(caster);pass.add(caster);pass.render(casterScene,camera,true,1,0.01125);}
      else {pass.setMode(1);pass.render(renderer,casterScene,light);}
      const x=depthTarget.width/2,y=depthTarget.height/2;
      const readY=backend==='webgpu'?y:depthTarget.height-1-y;
      const pixel=await readDepth(renderer,depthTarget,x,readY,backend);
      const expected=0.1+sx*x/depthTarget.width+sy*y/depthTarget.height;
      const name=`${backend} D3D9 raster center slope ${sx},${sy}`;
      cases.push({name,actual:pixel[0],expected});if(!Number.isFinite(pixel[0])||Math.abs(pixel[0]-expected)>1e-6)failures.push(name);
    }
    pass.dispose();casterGeometry.dispose();casterMaterial.dispose();renderer.dispose();
  }
  return {cases,failures};
}
