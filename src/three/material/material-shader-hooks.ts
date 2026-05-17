import type { MaterialInfo } from "../../parser/model/modelTypes.js";
import * as THREE from "three";

import { configureMmdTexture } from "../textures.js";
import { clampColor } from "../utils.js";

const MMD_DIRECT_DIFFUSE_SCALE = Math.PI;
const MMD_AMBIENT_COLOR_SCALE = 0.2;
const THREE_GRADIENT_IRRADIANCE_BODY = [
  "float dotNL = dot( normal, lightDirection );",
  "\tvec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );"
].join("\n");

function mmdToonGradientParsFragment(toonNdotLSign: number): string {
  return [
    "#ifdef USE_GRADIENTMAP",
    "",
    "\tuniform sampler2D gradientMap;",
    "",
    "#endif",
    "",
    "vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {",
    "",
    `\tfloat dotNL = dot( normal, lightDirection ) * ${toonNdotLSign.toFixed(1)};`,
    "\tvec2 coord = vec2( 0.5, clamp( dotNL, 0.02, 0.98 ) );",
    "",
    "\t#ifdef USE_GRADIENTMAP",
    "",
    "\t\treturn texture2D( gradientMap, coord ).rgb;",
    "",
    "\t#else",
    "",
    "\t\tvec2 fw = fwidth( coord ) * 0.5;",
    "\t\treturn mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.y, 0.7 + fw.y, coord.y ) );",
    "",
    "\t#endif",
    "",
    "}"
  ].join("\n");
}

export function attachMmdMaterialFactors(material: THREE.Material): void {
  if (material.userData.mmdMaterialFactors?.shaderApplied) {
    return;
  }
  const previousOnBeforeCompile = material.onBeforeCompile.bind(material);
  const previousProgramCacheKey = material.customProgramCacheKey.bind(material);
  material.userData.mmdMaterialFactors = {
    shaderApplied: true,
    toonTextureFactorUniform: true,
    noToonFlatDiffuseWeight: materialUsesTextureOnlyLightingFallback(material) ? 1.0 : 0,
    babylonToonGradientSampling: materialUsesMmdToonGradient(material),
    toonNdotLSign: 1
  };
  material.onBeforeCompile = (shader, renderer) => {
    previousOnBeforeCompile(shader, renderer);
    shader.uniforms.mmdTextureFactor = { value: new THREE.Vector4(1, 1, 1, 1) };
    shader.uniforms.mmdToonTextureFactor = { value: new THREE.Vector4(1, 1, 1, 1) };
    shader.uniforms.mmdMaterialAmbient = { value: new THREE.Color(0, 0, 0) };
    shader.uniforms.mmdNoToonFlatDiffuseWeight = {
      value: material.userData.mmdMaterialFactors.noToonFlatDiffuseWeight
    };
    shader.uniforms.mmdSpecularColor = { value: new THREE.Color(0, 0, 0) };
    shader.uniforms.mmdSpecularPower = { value: 0 };
    shader.uniforms.mmdLightDirection = { value: new THREE.Vector3(0, 1, 1) };
    shader.uniforms.mmdDirectLightColor = { value: new THREE.Color(0, 0, 0) };
    shader.uniforms.mmdDirectDiffuseScale = { value: MMD_DIRECT_DIFFUSE_SCALE };
    shader.uniforms.mmdAmbientColorScale = { value: MMD_AMBIENT_COLOR_SCALE };
    const lightUniformState = material.userData.mmdLightUniformState as
      | { direction: [number, number, number]; directColor: [number, number, number] }
      | undefined;
    if (lightUniformState) {
      shader.uniforms.mmdLightDirection.value.set(
        lightUniformState.direction[0],
        lightUniformState.direction[1],
        lightUniformState.direction[2]
      );
      shader.uniforms.mmdDirectLightColor.value.setRGB(
        lightUniformState.directColor[0],
        lightUniformState.directColor[1],
        lightUniformState.directColor[2]
      );
    }
    const materialState = material.userData.mmdMaterialState as
      | {
          textureFactor: [number, number, number, number];
          toonTextureFactor: [number, number, number, number];
          ambient: [number, number, number];
          specular: [number, number, number];
          specularPower: number;
        }
      | undefined;
    if (materialState) {
      shader.uniforms.mmdTextureFactor.value.set(
        materialState.textureFactor[0],
        materialState.textureFactor[1],
        materialState.textureFactor[2],
        materialState.textureFactor[3]
      );
      shader.uniforms.mmdToonTextureFactor.value.set(
        materialState.toonTextureFactor[0],
        materialState.toonTextureFactor[1],
        materialState.toonTextureFactor[2],
        materialState.toonTextureFactor[3]
      );
      shader.uniforms.mmdMaterialAmbient.value.setRGB(
        clampColor(materialState.ambient[0]),
        clampColor(materialState.ambient[1]),
        clampColor(materialState.ambient[2])
      );
      shader.uniforms.mmdSpecularColor.value.setRGB(
        clampColor(materialState.specular[0]),
        clampColor(materialState.specular[1]),
        clampColor(materialState.specular[2])
      );
      shader.uniforms.mmdSpecularPower.value = materialState.specularPower;
    }
    material.userData.mmdMaterialFactorShader = shader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      [
        "diffuseColor.rgb = clamp( diffuseColor.rgb + mmdMaterialAmbient * mmdAmbientColorScale, 0.0, 1.0 );",
        "#include <map_fragment>",
        "diffuseColor *= mmdTextureFactor;"
      ].join("\n")
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_pars_fragment>",
      [
        "#include <map_pars_fragment>",
        "uniform vec4 mmdTextureFactor;",
        "uniform vec4 mmdToonTextureFactor;",
        "uniform vec3 mmdMaterialAmbient;",
        "uniform float mmdNoToonFlatDiffuseWeight;",
        "uniform vec3 mmdSpecularColor;",
        "uniform float mmdSpecularPower;",
        "uniform vec3 mmdLightDirection;",
        "uniform vec3 mmdDirectLightColor;",
        "uniform float mmdDirectDiffuseScale;",
        "uniform float mmdAmbientColorScale;"
      ].join("\n")
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <lights_fragment_end>",
      [
        "#include <lights_fragment_end>",
        "reflectedLight.directDiffuse *= mmdDirectDiffuseScale;",
        "reflectedLight.directDiffuse = max( reflectedLight.directDiffuse, diffuseColor.rgb * mmdNoToonFlatDiffuseWeight * mmdDirectLightColor );",
        "reflectedLight.directDiffuse *= mmdToonTextureFactor.rgb;",
        "reflectedLight.indirectDiffuse *= mmdToonTextureFactor.rgb;",
        "if ( mmdSpecularPower > 0.0 ) {",
        "  vec3 mmdHalfVec = normalize( geometryViewDir + mmdLightDirection );",
        "  reflectedLight.directSpecular += pow( max( 0.0, dot( mmdHalfVec, geometryNormal ) ), mmdSpecularPower ) * mmdSpecularColor;",
        "}"
      ].join("\n")
    );
    if (material.userData.mmdMaterialFactors.babylonToonGradientSampling) {
      const toonNdotLSign =
        material.userData.mmdMaterialFactors.toonNdotLSign === -1 ? -1 : 1;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <gradientmap_pars_fragment>",
        mmdToonGradientParsFragment(toonNdotLSign)
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        THREE_GRADIENT_IRRADIANCE_BODY,
        [
          `float dotNL = dot( normal, lightDirection ) * ${toonNdotLSign.toFixed(1)};`,
          "\tvec2 coord = vec2( 0.5, clamp( dotNL, 0.02, 0.98 ) );"
        ].join("\n")
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "\treturn vec3( texture2D( gradientMap, coord ).r );",
        "\treturn texture2D( gradientMap, coord ).rgb;"
      );
    }
  };
  material.customProgramCacheKey = () =>
    `${previousProgramCacheKey()}-yw-mmd-material-factors-${material.userData.mmdMaterialFactors.babylonToonGradientSampling ? "babylon-toon-gradient" : "standard-toon-gradient"}-toon-ndl-${material.userData.mmdMaterialFactors.toonNdotLSign === -1 ? "neg" : "pos"}`;
  material.needsUpdate = true;
}

export function materialHasTextureMap(
  material: THREE.Material
): material is THREE.Material & { map: THREE.Texture } {
  return "map" in material && material.map instanceof THREE.Texture;
}

function materialHasGradientMap(
  material: THREE.Material
): material is THREE.Material & { gradientMap: THREE.Texture } {
  return "gradientMap" in material && material.gradientMap instanceof THREE.Texture;
}

function materialUsesTextureOnlyLightingFallback(material: THREE.Material): boolean {
  if (!materialHasTextureMap(material)) {
    return false;
  }
  if (!materialHasGradientMap(material)) {
    return true;
  }
  return !!material.gradientMap.userData.mmdFallbackToonGradient;
}

function materialUsesMmdToonGradient(material: THREE.Material): boolean {
  if (!materialHasGradientMap(material)) {
    return false;
  }
  return (
    typeof material.gradientMap.userData.mmdToonTexturePath === "string" ||
    material.gradientMap.userData.mmdFallbackToonGradient === true
  );
}

export function attachMmdSphereTexture(
  material: THREE.Material,
  sphereMode: MaterialInfo["sphereMode"],
  texture: THREE.Texture | undefined
): void {
  if (!texture || sphereMode === "none") {
    return;
  }
  if (!texture.userData.mmdTextureInfo) {
    configureMmdTexture(texture);
  }
  const previousOnBeforeCompile = material.onBeforeCompile.bind(material);
  const previousProgramCacheKey = material.customProgramCacheKey.bind(material);
  material.userData.mmdSphereMap = {
    mode: sphereMode,
    texture,
    shaderApplied: true
  };
  material.onBeforeCompile = (shader, renderer) => {
    previousOnBeforeCompile(shader, renderer);
    shader.uniforms.mmdSphereMap = { value: texture };
    shader.uniforms.mmdSphereMode = { value: mmdSphereModeToUniform(sphereMode) };
    shader.uniforms.mmdSphereFactor = { value: new THREE.Vector4(1, 1, 1, 1) };
    material.userData.mmdSphereShader = shader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_pars_fragment>",
      [
        "#include <map_pars_fragment>",
        "uniform sampler2D mmdSphereMap;",
        "uniform int mmdSphereMode;",
        "uniform vec4 mmdSphereFactor;"
      ].join("\n")
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      [
        "#include <opaque_fragment>",
        "vec2 mmdSphereUv = vec2( normal.x, -normal.y ) * 0.5 + 0.5;",
        "vec4 mmdSphereColor = texture2D( mmdSphereMap, mmdSphereUv ) * mmdSphereFactor;",
        "if ( mmdSphereMode == 1 ) {",
        "  gl_FragColor.rgb *= mmdSphereColor.rgb * diffuseColor.rgb;",
        "} else if ( mmdSphereMode == 2 ) {",
        "  gl_FragColor.rgb += mmdSphereColor.rgb * mmdSphereColor.a;",
        "} else if ( mmdSphereMode == 3 ) {",
        "  gl_FragColor.rgb = mix( gl_FragColor.rgb, mmdSphereColor.rgb, mmdSphereColor.a );",
        "}"
      ].join("\n")
    );
  };
  material.customProgramCacheKey = () =>
    `${previousProgramCacheKey()}-yw-mmd-sphere-${sphereMode}`;
  material.needsUpdate = true;
}

export function mmdSphereModeToUniform(sphereMode: MaterialInfo["sphereMode"]): number {
  switch (sphereMode) {
    case "multiply":
      return 1;
    case "add":
      return 2;
    case "subTexture":
      return 3;
    default:
      return 0;
  }
}
