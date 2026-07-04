import type { MaterialInfo } from "../../parser/model/modelTypes.js";
import * as THREE from "three";

import { configureMmdTexture } from "../textures.js";
import { clampColor } from "../utils.js";

// MMD's default directional light is (154,154,154)/255 ~= 0.604 (NOT white) and is
// baked into the material, independent of the host scene's lights. See
// ../unity-mmd-loader/docs/mmd-shading-notes.md §3.
const MMD_DEFAULT_LIGHT_COLOR = 154 / 255;
const MMD_TOON_SAMPLE_U = 0.5;
// MMD chooses the representative self-shadow ToonColor from the source image bottom
// band. Toon textures are uploaded with flipY=true, so source y ~= 1 maps to shader v=0.
const MMD_SELF_SHADOW_TOON_V = 0.0;
const MMD_DEFAULT_TOON_COORD_OFFSET = 0.45;
const MMD_SYNCED_LIGHT_TOON_COORD_OFFSET = 0.5;
// MMD light travel direction (the light moves toward this vector). dirToLight is its
// negation, so the key light arrives from front-up-right (+x, +y, +z toward camera) --
// matched against the real MMD 9.32 toon golden.
const MMD_DEFAULT_LIGHT_TRAVEL_DIRECTION: readonly [number, number, number] = [-0.5, -1.0, -1.0];
// MMD self-shadow uses the material toon color as a multiplier for fully shadowed
// fragments. D3D9 traces show that texture-backed toon color comes from the bottom band,
// then gets blended toward white by min(shadow visibility, light visibility).
const MMD_TOON_SHADOW_FACTOR_DECLARATION = "float ywMmdToonShadowFactor = 1.0;";
const DIRECTIONAL_LIGHT_INFO_CALL = "getDirectionalLightInfo( directionalLight, directLight );";
const DIRECTIONAL_SHADOW_COLOR_MULTIPLY =
  "directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;";
const MMD_DIRECTIONAL_SELF_SHADOW_FACTOR =
  "ywMmdToonShadowFactor = min( ywMmdToonShadowFactor, ( mmdSelfShadowReceive > 0.5 && directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0 );";

/**
 * Apply the MMD texture-factor helpers (material morph tint, §9). With identity
 * factors these are the identity, leaving the texture untouched.
 */
const MMD_TEXTURE_FACTOR_HELPERS = [
  "vec3 ywMmdApplyMul( vec3 c, vec4 f ) {",
  "  return mix( vec3( 1.0 ), c * f.rgb, f.a );",
  "}",
  // sRGB <-> linear helpers so the MMD formula runs in gamma (sRGB) space (§1)
  // while still feeding Three's linear -> sRGB output encode correctly.
  "vec3 ywMmdLinearToGamma( vec3 c ) {",
  "  c = clamp( c, 0.0, 1.0 );",
  "  bvec3 cutoff = lessThanEqual( c, vec3( 0.0031308 ) );",
  "  vec3 lower = c * 12.92;",
  "  vec3 higher = pow( c, vec3( 1.0 / 2.4 ) ) * 1.055 - 0.055;",
  "  return mix( higher, lower, vec3( cutoff ) );",
  "}",
  "vec3 ywMmdGammaToLinear( vec3 c ) {",
  "  c = clamp( c, 0.0, 1.0 );",
  "  bvec3 cutoff = lessThanEqual( c, vec3( 0.04045 ) );",
  "  vec3 lower = c / 12.92;",
  "  vec3 higher = pow( ( c + 0.055 ) / 1.055, vec3( 2.4 ) );",
  "  return mix( higher, lower, vec3( cutoff ) );",
  "}"
].join("\n");

/**
 * Uniform declarations for the self-contained MMD shading block. Sphere uniforms are
 * declared by {@link attachMmdSphereTexture} guarded by USE_MMD_SPHERE.
 */
const MMD_FRAGMENT_PARS = [
  "uniform vec4 mmdTextureFactor;",
  "uniform vec4 mmdToonTextureFactor;",
  "uniform vec3 mmdDiffuseColor;",
  "uniform vec3 mmdMaterialAmbient;",
  "uniform vec3 mmdSpecularColor;",
  "uniform float mmdSpecularPower;",
  "uniform vec3 mmdLightDirection;",
  "uniform vec3 mmdLightColor;",
  "uniform float mmdToonCoordinateOffset;",
  "uniform float mmdSelfShadowReceive;",
  MMD_TOON_SHADOW_FACTOR_DECLARATION,
  MMD_TEXTURE_FACTOR_HELPERS
].join("\n");

/**
 * The complete MMD fragment composite (§2), evaluated in gamma (sRGB) space and then
 * converted back to linear so Three's sRGB output encode reproduces it.
 *
 * Inputs that come from the standard pipeline before <opaque_fragment>:
 *   - normal           : view-space normal (normal_fragment_begin)
 *   - vViewPosition    : view-space vertex position
 *   - diffuseColor.a   : material alpha * texture alpha (map_fragment / morph)
 *   - sampledMmdDiffuse: the diffuse texel in gamma space (or vec4(1) when no map)
 */
const MMD_OPAQUE_FRAGMENT = [
  "{",
  "  vec3 ywMmdNormal = normalize( vNormal );",
  // vViewPosition points from the fragment toward the camera; eyeDir in MMD/saba points
  // from the camera toward the fragment, hence the negation.
  "  vec3 ywMmdEyeDir = normalize( -vViewPosition );",
  // mmdLightDirection is the world-space direction toward the light. The normal is in
  // view space, so transform the light direction into view space before dotting.
  "  vec3 ywMmdLightDir = normalize( ( viewMatrix * vec4( mmdLightDirection, 0.0 ) ).xyz );",
  "  float ywMmdLightVisibility = clamp( dot( ywMmdNormal, ywMmdLightDir ) * 3.0, 0.0, 1.0 );",
  "  float ywMmdToonVisibility = min( ywMmdToonShadowFactor, ywMmdLightVisibility );",
  "  float ywMmdLn = dot( ywMmdNormal, ywMmdLightDir );",
  "  ywMmdLn = clamp( ywMmdLn * 0.5 + mmdToonCoordinateOffset, 0.0, 1.0 );",
  "  vec3 ywMmdBase = clamp( mmdDiffuseColor * mmdLightColor + mmdMaterialAmbient, 0.0, 1.0 );",
  "  #ifdef USE_MAP",
  // mmdTextureFactor is the morph-aggregated multiply tint (identity = (1,1,1,1)).
  "    vec3 ywMmdTex = ywMmdApplyMul( sampledMmdDiffuse.rgb, mmdTextureFactor );",
  "    ywMmdBase *= ywMmdTex;",
  "  #endif",
  "  #ifdef USE_MMD_SPHERE",
  // MMD matcap UV: project the view-space normal to [0,1] (§7 / saba mmd.frag).
  "    vec2 ywMmdSphereUv = vec2( ywMmdNormal.x * 0.5 + 0.5, 1.0 - ( ywMmdNormal.y * 0.5 + 0.5 ) );",
  // Sphere texture is configured SRGBColorSpace, so texture2D returns linear; re-encode
  // to gamma for the MMD (gamma-space) composite.
  "    vec3 ywMmdSphere = ywMmdLinearToGamma( texture2D( mmdSphereMap, ywMmdSphereUv ).rgb );",
  "    ywMmdSphere = ywMmdApplyMul( ywMmdSphere, mmdSphereFactor );",
  "    if ( mmdSphereMode == 1 ) { ywMmdBase *= ywMmdSphere; }",
  "    else if ( mmdSphereMode == 2 ) { ywMmdBase += ywMmdSphere; }",
  "    else if ( mmdSphereMode == 3 ) { ywMmdBase = mix( ywMmdBase, ywMmdSphere, mmdSphereFactor.a ); }",
  "  #endif",
  "  #ifdef USE_GRADIENTMAP",
  // Toon ramp (gradientMap) is configured NoColorSpace, so texture2D returns the stored
  // (gamma) ramp value directly.
  `    vec3 ywMmdToon = texture2D( gradientMap, vec2( ${MMD_TOON_SAMPLE_U.toFixed(1)}, ywMmdLn ) ).rgb;`,
  "    ywMmdToon = ywMmdApplyMul( ywMmdToon, mmdToonTextureFactor );",
  `    vec3 ywMmdSelfShadowToon = texture2D( gradientMap, vec2( ${MMD_TOON_SAMPLE_U.toFixed(1)}, ${MMD_SELF_SHADOW_TOON_V.toFixed(1)} ) ).rgb;`,
  "    ywMmdSelfShadowToon = ywMmdApplyMul( ywMmdSelfShadowToon, mmdToonTextureFactor );",
  "    vec3 ywMmdColor = ywMmdBase * ywMmdToon;",
  "    if ( ywMmdToonShadowFactor < 0.999 ) {",
  "      ywMmdColor = ywMmdBase * mix( ywMmdSelfShadowToon, vec3( 1.0 ), ywMmdToonVisibility );",
  "    }",
  "  #else",
  "    vec3 ywMmdColor = ywMmdBase;",
  "  #endif",
  "  if ( mmdSpecularPower > 0.0 ) {",
  "    vec3 ywMmdHalf = normalize( ywMmdEyeDir + ywMmdLightDir );",
  "    ywMmdColor += pow( max( 0.0, dot( ywMmdHalf, ywMmdNormal ) ), mmdSpecularPower ) * mmdSpecularColor * mmdLightColor * ywMmdToonVisibility;",
  "  }",
  "  outgoingLight = ywMmdGammaToLinear( clamp( ywMmdColor, 0.0, 1.0 ) );",
  "}",
  "#include <opaque_fragment>"
].join("\n");

export function attachMmdMaterialFactors(material: THREE.Material): void {
  if (material.userData.mmdMaterialFactors?.shaderApplied) {
    return;
  }
  const previousOnBeforeCompile = material.onBeforeCompile.bind(material);
  const previousProgramCacheKey = material.customProgramCacheKey.bind(material);
  const rawDiffuse = readMaterialRawDiffuse(material);
  const rawAmbient = readMaterialRawVec3(material, "ambient", [0, 0, 0]);
  const rawSpecular = readMaterialRawVec3(material, "specular", [0, 0, 0]);
  const rawSpecularPower = readMaterialRawSpecularPower(material);
  material.userData.mmdMaterialFactors = {
    shaderApplied: true,
    toonTextureFactorUniform: true,
    rawDiffuse
  };
  // Drop Three's own diffuse/emissive contribution: the MMD block computes the lit
  // color from scratch. Keeping emissive at 0 also prevents material-sync from writing
  // ambient into it on the legacy path.
  if ("emissive" in material && (material as { emissive?: unknown }).emissive instanceof THREE.Color) {
    (material as { emissive: THREE.Color }).emissive.setRGB(0, 0, 0);
  }
  material.onBeforeCompile = (shader, renderer) => {
    previousOnBeforeCompile(shader, renderer);
    shader.uniforms.mmdTextureFactor = { value: new THREE.Vector4(1, 1, 1, 1) };
    shader.uniforms.mmdToonTextureFactor = { value: new THREE.Vector4(1, 1, 1, 1) };
    shader.uniforms.mmdDiffuseColor = {
      value: new THREE.Color(rawDiffuse[0], rawDiffuse[1], rawDiffuse[2])
    };
    shader.uniforms.mmdMaterialAmbient = {
      value: new THREE.Color(rawAmbient[0], rawAmbient[1], rawAmbient[2])
    };
    shader.uniforms.mmdSpecularColor = {
      value: new THREE.Color(rawSpecular[0], rawSpecular[1], rawSpecular[2])
    };
    shader.uniforms.mmdSpecularPower = { value: rawSpecularPower };
    const lightUniformState = material.userData.mmdLightUniformState as
      | { direction: [number, number, number]; directColor?: [number, number, number] }
      | undefined;
    shader.uniforms.mmdLightDirection = {
      value: new THREE.Vector3(
        -MMD_DEFAULT_LIGHT_TRAVEL_DIRECTION[0],
        -MMD_DEFAULT_LIGHT_TRAVEL_DIRECTION[1],
        -MMD_DEFAULT_LIGHT_TRAVEL_DIRECTION[2]
      ).normalize()
    };
    shader.uniforms.mmdLightColor = {
      value: new THREE.Color(
        MMD_DEFAULT_LIGHT_COLOR,
        MMD_DEFAULT_LIGHT_COLOR,
        MMD_DEFAULT_LIGHT_COLOR
      )
    };
    shader.uniforms.mmdToonCoordinateOffset = {
      value: lightUniformState ? MMD_SYNCED_LIGHT_TOON_COORD_OFFSET : MMD_DEFAULT_TOON_COORD_OFFSET
    };
    shader.uniforms.mmdSelfShadowReceive = {
      value: materialReceivesMmdSelfShadow(material) ? 1 : 0
    };
    if (lightUniformState) {
      shader.uniforms.mmdLightDirection.value.set(
        lightUniformState.direction[0],
        lightUniformState.direction[1],
        lightUniformState.direction[2]
      );
      if (lightUniformState.directColor) {
        shader.uniforms.mmdLightColor.value.setRGB(
          lightUniformState.directColor[0],
          lightUniformState.directColor[1],
          lightUniformState.directColor[2]
        );
      }
    }
    const materialState = material.userData.mmdMaterialState as
      | {
          diffuse: [number, number, number, number];
          textureFactor: [number, number, number, number];
          toonTextureFactor: [number, number, number, number];
          ambient: [number, number, number];
          specular: [number, number, number];
          specularPower: number;
        }
      | undefined;
    if (materialState) {
      shader.uniforms.mmdDiffuseColor.value.setRGB(
        clampColor(materialState.diffuse[0]),
        clampColor(materialState.diffuse[1]),
        clampColor(materialState.diffuse[2])
      );
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
    shader.fragmentShader = injectMmdShading(shader.fragmentShader);
  };
  material.customProgramCacheKey = () => `${previousProgramCacheKey()}-yw-mmd-material-factors-v3`;
  material.needsUpdate = true;
}

function injectMmdShading(fragmentShader: string): string {
  let shader = fragmentShader;
  // Declare uniforms + helpers.
  shader = shader.replace(
    "#include <map_pars_fragment>",
    ["#include <map_pars_fragment>", MMD_FRAGMENT_PARS].join("\n")
  );
  // Capture the diffuse texel in gamma space (Three samples it as linear), and stop the
  // standard map_fragment from baking texture color into diffuseColor (we recompute it).
  shader = shader.replace(
    "#include <map_fragment>",
    [
      "#ifdef USE_MAP",
      "  vec4 ywMmdSampledDiffuse = texture2D( map, vMapUv );",
      "  vec4 sampledMmdDiffuse = vec4( ywMmdLinearToGamma( ywMmdSampledDiffuse.rgb ), ywMmdSampledDiffuse.a );",
      "  diffuseColor.a *= ywMmdSampledDiffuse.a;",
      "#else",
      "  vec4 sampledMmdDiffuse = vec4( 1.0 );",
      "#endif"
    ].join("\n")
  );
  // Replace the final composite with the MMD formula. We overwrite outgoingLight just
  // before <opaque_fragment> so alpha/discard/blend handling stays standard.
  shader = shader.replace("#include <opaque_fragment>", MMD_OPAQUE_FRAGMENT);
  // Drive the self-shadow factor from the directional shadow map (when present), so
  // fully shadowed fragments use the material toon color multiplier. On scenes without a
  // shadow map this leaves ywMmdToonShadowFactor at 1.0.
  shader = shader.replace(
    "#include <lights_fragment_begin>",
    mmdLightsFragmentBegin(MMD_DIRECTIONAL_SELF_SHADOW_FACTOR)
  );
  return shader;
}

function mmdLightsFragmentBegin(shadowReplacement: string): string {
  return THREE.ShaderChunk.lights_fragment_begin
    .replace(
      DIRECTIONAL_LIGHT_INFO_CALL,
      [DIRECTIONAL_LIGHT_INFO_CALL].join("\n")
    )
    .replace(DIRECTIONAL_SHADOW_COLOR_MULTIPLY, shadowReplacement);
}

function readMaterialRawDiffuse(material: THREE.Material): [number, number, number] {
  const diffuse = material.userData.mmdMaterial?.diffuse as
    | [number, number, number, number]
    | undefined;
  if (diffuse) {
    return [clampColor(diffuse[0]), clampColor(diffuse[1]), clampColor(diffuse[2])];
  }
  const color = (material as { color?: unknown }).color;
  if (color instanceof THREE.Color) {
    // Fallback: Three stores material.color in linear working space; convert to gamma.
    const gamma = color.clone().convertLinearToSRGB();
    return [gamma.r, gamma.g, gamma.b];
  }
  return [1, 1, 1];
}

function readMaterialRawVec3(
  material: THREE.Material,
  key: "ambient" | "specular",
  fallback: [number, number, number]
): [number, number, number] {
  const value = material.userData.mmdMaterial?.[key] as
    | [number, number, number]
    | undefined;
  if (value) {
    return [clampColor(value[0]), clampColor(value[1]), clampColor(value[2])];
  }
  return fallback;
}

function readMaterialRawSpecularPower(material: THREE.Material): number {
  const value = material.userData.mmdMaterial?.specularPower as number | undefined;
  return Number.isFinite(value) ? (value as number) : 0;
}

function materialReceivesMmdSelfShadow(material: THREE.Material): boolean {
  const flags = material.userData.mmdMaterial?.flags as { selfShadow?: boolean } | undefined;
  return flags?.selfShadow !== false;
}

export function materialHasTextureMap(
  material: THREE.Material
): material is THREE.Material & { map: THREE.Texture } {
  return "map" in material && material.map instanceof THREE.Texture;
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
    // Declare sphere uniforms and enable the USE_MMD_SPHERE branch in the main MMD
    // shading block (material-shader-hooks injected before this hook runs).
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_pars_fragment>",
      [
        "#include <map_pars_fragment>",
        "#define USE_MMD_SPHERE",
        "uniform sampler2D mmdSphereMap;",
        "uniform int mmdSphereMode;",
        "uniform vec4 mmdSphereFactor;"
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
