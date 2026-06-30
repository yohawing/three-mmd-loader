import type { MaterialRuntimeState } from "../../parser/model/modelTypes.js";
import * as THREE from "three";

import { clampColor } from "../utils.js";
import { mmdMaterialDepthWrite, mmdMaterialSuppressesColorAtAlpha } from "./material-metadata.js";

type ShaderUniformMap = Record<string, { value: unknown }>;
const mmdDirectionalLightPositionScratch = new THREE.Vector3();
const mmdDirectionalLightTargetScratch = new THREE.Vector3();
const mmdDirectionalLightNormalizedScratch = new THREE.Vector3();

export function syncMmdMaterialStates(
  materials: THREE.Material | THREE.Material[],
  states: readonly MaterialRuntimeState[]
): void {
  const materialList = Array.isArray(materials) ? materials : [materials];
  materialList.forEach((material, index) => {
    const state = states[index];
    if (!state) {
      return;
    }
    const materialColor = (material as { color?: unknown }).color;
    if (materialColor instanceof THREE.Color) {
      materialColor.setRGB(
        clampColor(state.diffuse[0]),
        clampColor(state.diffuse[1]),
        clampColor(state.diffuse[2])
      );
    }
    material.opacity = clampColor(state.diffuse[3]);
    const flags = material.userData.mmdMaterial?.flags;
    const suppressColor = mmdMaterialSuppressesColorAtAlpha(material.opacity, flags);
    const transparencyMode = material.userData.mmdMaterial?.transparencyMode;
    const usesAlphaBlend = transparencyMode === "alphaBlend";
    material.visible = material.opacity > 0 || suppressColor;
    material.colorWrite = !suppressColor;
    material.transparent = usesAlphaBlend || material.opacity < 1;
    material.depthWrite = transparencyMode
      ? mmdMaterialDepthWrite(transparencyMode)
      : !material.transparent;
    material.userData.mmdMaterialState = {
      diffuse: [...state.diffuse],
      specular: [...state.specular],
      specularPower: state.specularPower,
      ambient: [...state.ambient],
      edgeColor: [...state.edgeColor],
      edgeSize: state.edgeSize,
      textureFactor: [...state.textureFactor],
      sphereTextureFactor: [...state.sphereTextureFactor],
      toonTextureFactor: [...state.toonTextureFactor]
    };
    const sphereShader = material.userData.mmdSphereShader as
      | { uniforms?: ShaderUniformMap }
      | undefined;
    const materialFactorShader = material.userData.mmdMaterialFactorShader as
      | { uniforms?: ShaderUniformMap }
      | undefined;
    const emissive = (material as { emissive?: unknown }).emissive;
    if (
      !material.userData.mmdMaterialFactors?.shaderApplied &&
      !materialFactorShader &&
      emissive instanceof THREE.Color
    ) {
      emissive.setRGB(
        clampColor(state.ambient[0]),
        clampColor(state.ambient[1]),
        clampColor(state.ambient[2])
      );
    }
    const diffuseColorUniform = materialFactorShader?.uniforms?.mmdDiffuseColor?.value;
    if (diffuseColorUniform instanceof THREE.Color) {
      diffuseColorUniform.setRGB(
        clampColor(state.diffuse[0]),
        clampColor(state.diffuse[1]),
        clampColor(state.diffuse[2])
      );
    }
    const textureFactor = materialFactorShader?.uniforms?.mmdTextureFactor?.value;
    if (textureFactor instanceof THREE.Vector4) {
      textureFactor.set(
        state.textureFactor[0],
        state.textureFactor[1],
        state.textureFactor[2],
        state.textureFactor[3]
      );
    }
    const sphereFactor = sphereShader?.uniforms?.mmdSphereFactor?.value;
    if (sphereFactor instanceof THREE.Vector4) {
      sphereFactor.set(
        state.sphereTextureFactor[0],
        state.sphereTextureFactor[1],
        state.sphereTextureFactor[2],
        state.sphereTextureFactor[3]
      );
    }
    const toonFactor = materialFactorShader?.uniforms?.mmdToonTextureFactor?.value;
    if (toonFactor instanceof THREE.Vector4) {
      toonFactor.set(
        state.toonTextureFactor[0],
        state.toonTextureFactor[1],
        state.toonTextureFactor[2],
        state.toonTextureFactor[3]
      );
    }
    const materialAmbient = materialFactorShader?.uniforms?.mmdMaterialAmbient?.value;
    if (materialAmbient instanceof THREE.Color) {
      materialAmbient.setRGB(
        clampColor(state.ambient[0]),
        clampColor(state.ambient[1]),
        clampColor(state.ambient[2])
      );
    }
    const specularColor = materialFactorShader?.uniforms?.mmdSpecularColor?.value;
    if (specularColor instanceof THREE.Color) {
      specularColor.setRGB(
        clampColor(state.specular[0]),
        clampColor(state.specular[1]),
        clampColor(state.specular[2])
      );
    }
    const specularPower = materialFactorShader?.uniforms?.mmdSpecularPower?.value;
    const specularPowerUniform = materialFactorShader?.uniforms?.mmdSpecularPower;
    if (typeof specularPower === "number" && specularPowerUniform) {
      specularPowerUniform.value = state.specularPower;
    }
    material.needsUpdate = true;
  });
}

export function syncMmdSpecularDirection(
  material: THREE.Material | THREE.Material[],
  lightDirection: THREE.Vector3 | THREE.DirectionalLight
): void {
  const materialList = Array.isArray(material) ? material : [material];
  const directionSource = mmdLightDirectionSource(lightDirection);
  const directColor =
    lightDirection instanceof THREE.Light
      ? [
          lightDirection.visible ? lightDirection.color.r * lightDirection.intensity : 0,
          lightDirection.visible ? lightDirection.color.g * lightDirection.intensity : 0,
          lightDirection.visible ? lightDirection.color.b * lightDirection.intensity : 0
        ]
      : [1, 1, 1];
  materialList.forEach((mat) => {
    const normalizedDirection = mmdDirectionalLightNormalizedScratch.copy(directionSource).normalize();
    const lightUniformState = getMmdLightUniformState(mat);
    lightUniformState.direction[0] = normalizedDirection.x;
    lightUniformState.direction[1] = normalizedDirection.y;
    lightUniformState.direction[2] = normalizedDirection.z;
    lightUniformState.directColor[0] = directColor[0];
    lightUniformState.directColor[1] = directColor[1];
    lightUniformState.directColor[2] = directColor[2];
    const shader = mat.userData.mmdMaterialFactorShader as
      | { uniforms?: ShaderUniformMap }
      | undefined;
    const dir = shader?.uniforms?.mmdLightDirection?.value;
    if (dir instanceof THREE.Vector3) {
      dir.copy(normalizedDirection);
    }
    const color = shader?.uniforms?.mmdDirectLightColor?.value;
    if (color instanceof THREE.Color) {
      color.setRGB(directColor[0], directColor[1], directColor[2]);
    }
    const mmdLightColor = shader?.uniforms?.mmdLightColor?.value;
    if (mmdLightColor instanceof THREE.Color) {
      mmdLightColor.setRGB(directColor[0], directColor[1], directColor[2]);
    }
    const toonCoordinateOffsetUniform = shader?.uniforms?.mmdToonCoordinateOffset;
    if (toonCoordinateOffsetUniform && typeof toonCoordinateOffsetUniform.value === "number") {
      toonCoordinateOffsetUniform.value = 0.5;
    }
  });
}

function getMmdLightUniformState(material: THREE.Material): {
  direction: [number, number, number];
  directColor: [number, number, number];
} {
  const existing = material.userData.mmdLightUniformState as
    | { direction?: unknown; directColor?: unknown }
    | undefined;
  if (
    existing &&
    Array.isArray(existing.direction) &&
    existing.direction.length >= 3 &&
    Array.isArray(existing.directColor) &&
    existing.directColor.length >= 3
  ) {
    return existing as {
      direction: [number, number, number];
      directColor: [number, number, number];
    };
  }
  const created = {
    direction: [0, 0, 1] as [number, number, number],
    directColor: [1, 1, 1] as [number, number, number]
  };
  material.userData.mmdLightUniformState = created;
  return created;
}

function mmdLightDirectionSource(lightDirection: THREE.Vector3 | THREE.DirectionalLight): THREE.Vector3 {
  if (!(lightDirection instanceof THREE.DirectionalLight)) {
    return lightDirection;
  }
  lightDirection.updateMatrixWorld();
  lightDirection.target.updateMatrixWorld();
  mmdDirectionalLightPositionScratch.setFromMatrixPosition(lightDirection.matrixWorld);
  mmdDirectionalLightTargetScratch.setFromMatrixPosition(lightDirection.target.matrixWorld);
  return mmdDirectionalLightPositionScratch.sub(mmdDirectionalLightTargetScratch);
}
