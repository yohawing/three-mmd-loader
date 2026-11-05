import * as THREE from "three/webgpu";
import { getShadowMaterial, getShadowRenderObjectFunction, positionWorld, uniform, vec3, vec4 } from "three/tsl";

import { MMD_SELF_SHADOW_LAYER } from "../three/shadow.js";
import { createMmdTslShadowVisibilityNode } from "./shadow-visibility.js";
import { getMmdShadowProjection } from "../three/mmd-shadow-projection.js";
import { castsMmdReferenceShadow } from "../three/material/material-shadow-casting.js";

export interface MmdTslSelfShadowPass {
  readonly renderTarget: THREE.RenderTarget;
  readonly depthTexture: THREE.DepthTexture;
  readonly visibilityNode: ReturnType<typeof createMmdTslShadowVisibilityNode>;
  /**
   * Selects the precompiled VMD self-shadow ramp. Only mode 2 is distinct;
   * every other value (including disabled/missing state) safely uses mode 1.
   */
  setMode(mode: number): boolean;
  compileAsync(renderer: THREE.WebGPURenderer, scene: THREE.Scene, light: THREE.DirectionalLight): Promise<boolean>;
  render(renderer: THREE.WebGPURenderer, scene: THREE.Scene, light: THREE.DirectionalLight): boolean;
  setReceiverVisibilityDebug(root: THREE.Object3D, enabled: boolean, sampleTarget?: boolean): boolean;
  dispose(): void;
}

/**
 * Stores reference z/w in R32F, with a separate raster depth attachment.
 * Receivers interpolate that raw value before MMD's mode-dependent comparison.
 */
export function createMmdTslSelfShadowPass(
  renderer: THREE.WebGPURenderer,
  light: THREE.DirectionalLight
): MmdTslSelfShadowPass {
  const targetWidth = Math.max(1, Math.floor(light.shadow.mapSize.x));
  const targetHeight = Math.max(1, Math.floor(light.shadow.mapSize.y));
  const depthTexture = new THREE.DepthTexture(targetWidth, targetHeight);
  depthTexture.name = "MMD TSL self-shadow depth";
  depthTexture.compareFunction = null;
  depthTexture.generateMipmaps = false;

  const renderTarget = new THREE.RenderTarget(targetWidth, targetHeight, {
    depthBuffer: true,
    depthTexture,
    format: THREE.RedFormat,
    type: THREE.FloatType,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter
  });
  renderTarget.texture.name = "MMD TSL self-shadow target";
  renderTarget.texture.generateMipmaps = false;
  // Raster reversed depth does not change the raw depth used by receivers.
  const projection = getMmdShadowProjection(light);
  projection.retain();
  const visibilityNode = createMmdTslShadowVisibilityNode(light, renderTarget.texture);
  const shadowModeUniform = (visibilityNode as unknown as {
    mmdTslShadowMode: { value: number };
  }).mmdTslShadowMode;

  // Own the material so disposing/recreating this pass cannot poison Three's
  // shared shadow material for the same light.
  const shadowMaterial = getShadowMaterial(light).clone();
  (shadowMaterial as unknown as { isShadowPassMaterial: boolean }).isShadowPassMaterial = true;
  const referencePosition = uniform(projection.sampleMatrix).mul(vec4(positionWorld, 1));
  shadowMaterial.fragmentNode = vec4(referencePosition.z.div(referencePosition.w), 0, 0, 1);
  const shadowRenderObjectFunction = getShadowRenderObjectFunction(
    renderer,
    light.shadow,
    renderer.shadowMap.type,
    false
  ) as unknown as Parameters<THREE.WebGPURenderer["setRenderObjectFunction"]>[0];
  const referenceRenderObject: NonNullable<typeof shadowRenderObjectFunction> =
    (object, scene, camera, geometry, material, group, lightsNode, clippingContext, passId) => {
      const source = material.userData.mmdReferenceShadowSource ?? material;
      if (!castsMmdReferenceShadow(source)) return;
      shadowRenderObjectFunction?.(object, scene, camera, geometry, material, group, lightsNode, clippingContext, passId);
    };
  const rendererState = { clearColor: new THREE.Color() } as THREE.RendererUtils.RendererAndSceneState;
  const resetRendererAndSceneState = THREE.RendererUtils.resetRendererAndSceneState as unknown as (
    renderer: THREE.WebGPURenderer,
    scene: THREE.Scene,
    state: THREE.RendererUtils.RendererAndSceneState
  ) => THREE.RendererUtils.RendererAndSceneState;
  const restoreRendererAndSceneState = THREE.RendererUtils.restoreRendererAndSceneState as unknown as (
    renderer: THREE.WebGPURenderer,
    scene: THREE.Scene,
    state: THREE.RendererUtils.RendererAndSceneState
  ) => void;
  let disposed = false;
  let prepared = false;
  let originalLayerMask = 0;
  let originalShadowMapEnabled = false;
  let preparedScene: THREE.Scene;

  function restoreShadowRender(): void {
    if (!prepared) return;
    prepared = false;
    light.shadow.camera.layers.mask = originalLayerMask;
    renderer.shadowMap.enabled = originalShadowMapEnabled;
    restoreRendererAndSceneState(renderer, preparedScene, rendererState);
  }

  function prepareShadowRender(
    currentRenderer: THREE.WebGPURenderer,
    scene: THREE.Scene,
    currentLight: THREE.DirectionalLight
  ): THREE.Camera | undefined {
    if (
      disposed || prepared ||
      currentRenderer !== renderer ||
      currentLight !== light ||
      currentLight.castShadow !== true
    ) {
      return undefined;
    }

    const shadowCamera = currentLight.shadow.camera;
    originalLayerMask = shadowCamera.layers.mask;
    originalShadowMapEnabled = currentRenderer.shadowMap.enabled;
    if (shadowCamera.coordinateSystem !== currentRenderer.coordinateSystem) {
      shadowCamera.coordinateSystem = currentRenderer.coordinateSystem;
      shadowCamera.updateProjectionMatrix();
    }
    // Three's common Renderer only flips a camera's projection matrix to the
    // reversed-depth form lazily, the first time that camera is passed to
    // renderer.render() (node_modules/three/src/renderers/common/
    // Renderer.js ~line 1516). Update the flag before LightShadow bakes its
    // matrix so the first async compile and the first real pass agree.
    const wantsReversedDepth = currentRenderer.reversedDepthBuffer === true;
    if (shadowCamera.reversedDepth !== wantsReversedDepth) {
      (shadowCamera as unknown as { _reversedDepth: boolean })._reversedDepth = wantsReversedDepth;
      shadowCamera.updateProjectionMatrix();
    }
    currentLight.shadow.updateMatrices(currentLight);

    resetRendererAndSceneState(currentRenderer, scene, rendererState);
    preparedScene = scene;
    prepared = true;
    try {
      currentRenderer.shadowMap.enabled = false;
      shadowCamera.layers.mask = 1 << MMD_SELF_SHADOW_LAYER;
      scene.overrideMaterial = shadowMaterial;
      currentRenderer.setRenderTarget(renderTarget);
      currentRenderer.setClearColor(0xffffff, 1);
      currentRenderer.setRenderObjectFunction(referenceRenderObject);
      return shadowCamera;
    } catch (error) {
      restoreShadowRender();
      throw error;
    }
  }

  return {
    renderTarget,
    depthTexture,
    visibilityNode,
    setMode(mode) {
      const nextMode = mode === 2 ? 2 : 1;
      if (shadowModeUniform.value === nextMode) {
        return false;
      }
      shadowModeUniform.value = nextMode;
      return true;
    },
    async compileAsync(currentRenderer, scene, currentLight) {
      if (typeof currentRenderer.compileAsync !== "function") {
        return false;
      }
      const shadowCamera = prepareShadowRender(currentRenderer, scene, currentLight);
      if (!shadowCamera) {
        return false;
      }
      try {
        await currentRenderer.compileAsync(scene, shadowCamera);
        return true;
      } finally {
        restoreShadowRender();
      }
    },
    render(currentRenderer, scene, currentLight) {
      const shadowCamera = prepareShadowRender(currentRenderer, scene, currentLight);
      if (!shadowCamera) {
        return false;
      }
      try {
        currentRenderer.render(scene, shadowCamera);
        return true;
      } finally {
        restoreShadowRender();
      }
    },
    setReceiverVisibilityDebug(root, enabled, sampleTarget = true) {
      let changed = false;
      root.traverse((object) => {
        const materialValue = (object as THREE.Mesh).material;
        const materials = materialValue
          ? (Array.isArray(materialValue) ? materialValue : [materialValue])
          : [];
        for (let index = 0; index < materials.length; index += 1) {
          const material = materials[index] as (THREE.Material & {
            colorNode?: unknown;
            lights?: boolean;
            userData: Record<string, unknown>;
          }) | undefined;
          const metadata = material?.userData?.mmdMaterial as {
            flags?: { selfShadow?: boolean };
          } | undefined;
          if (!material?.userData?.mmdTslMaterialUniforms || metadata?.flags?.selfShadow !== true) {
            continue;
          }
          const key = "mmdTslDedicatedShadowVisibilityDebug";
          const saved = material.userData[key] as {
            colorNode: unknown;
            lights: boolean | undefined;
          } | undefined;
          if (enabled) {
            if (!saved) {
              material.userData[key] = {
                colorNode: material.colorNode,
                lights: material.lights
              };
            }
            material.colorNode = sampleTarget ? vec3(visibilityNode) : vec3(1, 1, 1);
            material.lights = false;
            material.needsUpdate = true;
            changed = true;
          } else if (saved) {
            material.colorNode = saved.colorNode;
            material.lights = saved.lights;
            delete material.userData[key];
            material.needsUpdate = true;
            changed = true;
          }
        }
      });
      return changed;
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      renderTarget.dispose();
      shadowMaterial.dispose();
      projection.release();
    }
  };
}
