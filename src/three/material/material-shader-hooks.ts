import type { MaterialInfo } from "../../parser/model/modelTypes.js";
import * as THREE from "three";

import { configureMmdTexture } from "../textures.js";

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
