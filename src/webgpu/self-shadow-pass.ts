import * as THREE from "three/webgpu";
import { getShadowMaterial, getShadowRenderObjectFunction } from "three/tsl";

import { MMD_SELF_SHADOW_LAYER } from "../three/shadow.js";

export interface MmdTslSelfShadowPass {
  readonly renderTarget: THREE.RenderTarget;
  readonly depthTexture: THREE.DepthTexture;
  render(renderer: THREE.WebGPURenderer, scene: THREE.Scene, light: THREE.DirectionalLight): boolean;
  dispose(): void;
}

const SHADOW_TARGET_SIZE = 1024;

/**
 * Owns the Phase 1 caster-only depth target. The receiver graph is intentionally
 * not connected here; this pass only proves that the existing caster layer can be
 * rendered into an independent depth texture without invoking Three's shadow map.
 */
export function createMmdTslSelfShadowPass(
  renderer: THREE.WebGPURenderer,
  light: THREE.DirectionalLight
): MmdTslSelfShadowPass {
  const depthTexture = new THREE.DepthTexture(SHADOW_TARGET_SIZE, SHADOW_TARGET_SIZE);
  depthTexture.name = "MMD TSL self-shadow depth";
  depthTexture.compareFunction = THREE.LessEqualCompare;
  depthTexture.generateMipmaps = false;

  const renderTarget = new THREE.RenderTarget(SHADOW_TARGET_SIZE, SHADOW_TARGET_SIZE, {
    depthBuffer: true,
    depthTexture
  });
  renderTarget.texture.name = "MMD TSL self-shadow target";
  renderTarget.texture.generateMipmaps = false;

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
    render(currentRenderer, scene, currentLight) {
      if (
        disposed ||
        currentRenderer !== renderer ||
        currentLight !== light ||
        (currentRenderer.backend as { isWebGPUBackend?: boolean } | undefined)?.isWebGPUBackend !== true ||
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
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      renderTarget.dispose();
    }
  };
}
