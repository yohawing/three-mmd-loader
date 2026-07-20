import * as THREE from "three/webgpu";
import { getShadowMaterial, getShadowRenderObjectFunction, vec3 } from "three/tsl";

import { MMD_SELF_SHADOW_LAYER } from "../three/shadow.js";
import { createMmdTslShadowVisibilityNode } from "./shadow-visibility.js";

export interface MmdTslSelfShadowPass {
  readonly renderTarget: THREE.RenderTarget;
  readonly depthTexture: THREE.DepthTexture;
  readonly visibilityNode: ReturnType<typeof createMmdTslShadowVisibilityNode>;
  render(renderer: THREE.WebGPURenderer, scene: THREE.Scene, light: THREE.DirectionalLight): boolean;
  setReceiverVisibilityDebug(root: THREE.Object3D, enabled: boolean, sampleTarget?: boolean): boolean;
  dispose(): void;
}

/**
 * Owns the Phase 1 caster-only depth target. The receiver graph is intentionally
 * not connected here; this pass only proves that the existing caster layer can be
 * rendered into an independent depth texture without invoking Three's shadow map.
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
    depthTexture
  });
  renderTarget.texture.name = "MMD TSL self-shadow target";
  renderTarget.texture.generateMipmaps = false;
  const visibilityNode = createMmdTslShadowVisibilityNode(light, depthTexture);

  const shadowMaterial = getShadowMaterial(light);
  const shadowRenderObjectFunction = getShadowRenderObjectFunction(
    renderer,
    light.shadow,
    renderer.shadowMap.type,
    false
  ) as unknown as Parameters<THREE.WebGPURenderer["setRenderObjectFunction"]>[0];
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

  return {
    renderTarget,
    depthTexture,
    visibilityNode,
    render(currentRenderer, scene, currentLight) {
      if (
        disposed ||
        currentRenderer !== renderer ||
        currentLight !== light ||
        currentRenderer.reversedDepthBuffer !== false ||
        currentLight.castShadow !== true
      ) {
        return false;
      }

      const shadowCamera = currentLight.shadow.camera;
      const originalLayerMask = shadowCamera.layers.mask;
      const originalShadowMapEnabled = currentRenderer.shadowMap.enabled;
      if (shadowCamera.coordinateSystem !== currentRenderer.coordinateSystem) {
        shadowCamera.coordinateSystem = currentRenderer.coordinateSystem;
        shadowCamera.updateProjectionMatrix();
      }
      currentLight.shadow.updateMatrices(currentLight);

      resetRendererAndSceneState(currentRenderer, scene, rendererState);
      try {
        currentRenderer.shadowMap.enabled = false;
        shadowCamera.layers.mask = 1 << MMD_SELF_SHADOW_LAYER;
        scene.overrideMaterial = shadowMaterial;
        currentRenderer.setRenderTarget(renderTarget);
        currentRenderer.setClearColor(0x000000, 0);
        currentRenderer.setRenderObjectFunction(shadowRenderObjectFunction);
        currentRenderer.render(scene, shadowCamera);
        return true;
      } finally {
        shadowCamera.layers.mask = originalLayerMask;
        currentRenderer.shadowMap.enabled = originalShadowMapEnabled;
        restoreRendererAndSceneState(currentRenderer, scene, rendererState);
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
            receivedShadowNode?: unknown;
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
            receivedShadowNode: unknown;
            lights: boolean | undefined;
          } | undefined;
          if (enabled) {
            if (!saved) {
              material.userData[key] = {
                colorNode: material.colorNode,
                receivedShadowNode: material.receivedShadowNode,
                lights: material.lights
              };
            }
            material.colorNode = sampleTarget ? vec3(visibilityNode) : vec3(1, 1, 1);
            material.receivedShadowNode = null;
            material.lights = false;
            material.needsUpdate = true;
            changed = true;
          } else if (saved) {
            material.colorNode = saved.colorNode;
            material.receivedShadowNode = saved.receivedShadowNode;
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
    }
  };
}
