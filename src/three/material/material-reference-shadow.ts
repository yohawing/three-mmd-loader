import type * as THREE from "three";
const compiledUniforms = new WeakMap<THREE.Material, Set<Record<string, unknown>>>();

export interface MmdReferenceShadowUniforms {
  mmdReferenceMap: { value: THREE.Texture };
  mmdReferenceMatrix: { value: THREE.Matrix4 };
  mmdReferenceMode: { value: number };
  mmdReferenceEnabled: { value: number };
  mmdReferenceSize: { value: THREE.Vector2 };
  mmdReferenceSampling?: { value: number };
  mmdReferenceBias?: { value: number };
  mmdReferenceNormalBias?: { value: number };
}

export function attachMmdReferenceShadow(material: THREE.Material, uniforms: MmdReferenceShadowUniforms): void {
  uniforms = {mmdReferenceSampling:{value:0},mmdReferenceBias:{value:0},mmdReferenceNormalBias:{value:0},...uniforms};
  if (material.userData.mmdReferenceShadow) {
    material.userData.mmdReferenceShadow = uniforms;
    // Three can reuse a cached program without calling onBeforeCompile again.
    for (const shaderUniforms of compiledUniforms.get(material) ?? []) Object.assign(shaderUniforms, uniforms);
    return;
  }
  material.userData.mmdReferenceShadow = uniforms;
  const variants = new Set<Record<string, unknown>>();
  compiledUniforms.set(material, variants);
  const compile = material.onBeforeCompile.bind(material);
  const key = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    compile(shader, renderer);
    Object.assign(shader.uniforms, material.userData.mmdReferenceShadow);
    variants.add(shader.uniforms);
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
uniform mat4 mmdReferenceMatrix;
uniform float mmdReferenceNormalBias;
varying vec4 vMmdReferenceCoord;`)
      .replace("#include <project_vertex>", `#include <project_vertex>
vMmdReferenceCoord = mmdReferenceMatrix * (modelMatrix * vec4( transformed, 1.0 ) + vec4(inverseTransformDirection(transformedNormal, viewMatrix)*mmdReferenceNormalBias,0.0));`);
    shader.fragmentShader = `#define MMD_REFERENCE_SHADOW
uniform sampler2D mmdReferenceMap;
uniform float mmdReferenceMode;
uniform float mmdReferenceEnabled;
uniform float mmdReferenceSampling;
uniform float mmdReferenceBias;
uniform vec2 mmdReferenceSize;
varying vec4 vMmdReferenceCoord;
float mmdReferenceDepth(vec2 texel) {
  return texture2D(mmdReferenceMap, (clamp(texel,vec2(0.0),mmdReferenceSize-1.0)+0.5)/mmdReferenceSize).r;
}
float mmdReferenceVisibility( vec4 coord ) {
  vec3 p = coord.xyz / coord.w;
  if ( p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 ) return -1.0;
  p.z += mmdReferenceBias;
  if (mmdReferenceSampling > 0.5 && (p.z > 1.0 || (mmdReferenceSampling != 2.0 && p.z < 0.0))) return -1.0;
  // Reference UV is top-origin; WebGL render-target textures are bottom-origin.
  vec2 texel = vec2(p.x,1.0-p.y)*mmdReferenceSize-0.5;
  vec2 base = floor(texel), f = fract(texel);
  float depth = mix(mix(mmdReferenceDepth(base),mmdReferenceDepth(base+vec2(1,0)),f.x),
    mix(mmdReferenceDepth(base+vec2(0,1)),mmdReferenceDepth(base+vec2(1,1)),f.x),f.y);
  if (mmdReferenceSampling > 0.5) depth = mmdReferenceDepth(floor(texel+0.5));
  if (mmdReferenceSampling == 2.0) return step(p.z,depth);
  float scale = mmdReferenceMode > 1.5 ? 8000.0 * p.y : 1500.0;
  return 1.0-clamp(max(p.z-depth,0.0)*scale-0.3,0.0,1.0);
}
${shader.fragmentShader}`;
  };
  material.customProgramCacheKey = () => `${key()}-mmd-reference-shadow`;
  material.needsUpdate = true;
}
