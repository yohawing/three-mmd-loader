import * as THREE from "three/webgpu";
import { getShadowMaterial, getShadowRenderObjectFunction, vec3 } from "three/tsl";

import { MMD_SELF_SHADOW_LAYER } from "../three/shadow.js";
import { createMmdTslShadowVisibilityNode } from "./shadow-visibility.js";

export interface MmdTslSelfShadowPass {
  readonly renderTarget: THREE.RenderTarget;
  readonly depthTexture: THREE.DepthTexture;
  readonly visibilityNode: ReturnType<typeof createMmdTslShadowVisibilityNode>;
  /**
   * Selects the precompiled VMD self-shadow ramp. Only mode 2 is distinct;
   * every other value (including disabled/missing state) safely uses mode 1.
   */
  setMode(mode: number): boolean;
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
  // Reflect the renderer's actual reversed-depth mode into the visibility
  // graph's occlusion math (see shadow-visibility.ts). Native WebGPU viewer
  // renderers are created with reversedDepthBuffer: true; baseline WebGL and
  // TSL forceWebGL stay non-reversed.
  const reversedDepth = renderer.reversedDepthBuffer === true;
  const visibilityNode = createMmdTslShadowVisibilityNode(light, depthTexture, { reversedDepth });
  const shadowModeUniform = (visibilityNode as unknown as {
    mmdTslShadowMode: { value: number };
  }).mmdTslShadowMode;

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
    setMode(mode) {
      const nextMode = mode === 2 ? 2 : 1;
      if (shadowModeUniform.value === nextMode) {
        return false;
      }
      shadowModeUniform.value = nextMode;
      return true;
    },
    render(currentRenderer, scene, currentLight) {
      if (
        disposed ||
        currentRenderer !== renderer ||
        currentLight !== light ||
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
      // Three's common Renderer only flips a camera's projection matrix to
      // the reversed-depth form lazily, the first time that camera is passed
      // to renderer.render() (node_modules/three/src/renderers/common/
      // Renderer.js ~line 1516: `if (this.reversedDepthBuffer === true &&
      // camera.reversedDepth !== true) { camera._reversedDepth = true; ...
      // camera.updateProjectionMatrix(); }`). DirectionalLightShadow.
      // updateMatrices() below (node_modules/three/src/lights/LightShadow.js
      // ~line 213) bakes `shadowCamera.projectionMatrix` into `shadow.matrix`
      // immediately, using whatever matrix is on the camera *right now* --
      // it does not defer. Left to the lazy path, the very first frame would
      // bake a non-reversed shadow.matrix while the actual render call flips
      // the camera to reversed afterward, producing one frame of mismatched
      // depth comparisons. Sync the flag proactively (mirroring the
      // renderer's own `_reversedDepth` field, which has no public setter)
      // so updateMatrices always sees the projection that will actually be
      // used to render the depth target.
      const wantsReversedDepth = currentRenderer.reversedDepthBuffer === true;
      if (shadowCamera.reversedDepth !== wantsReversedDepth) {
        (shadowCamera as unknown as { _reversedDepth: boolean })._reversedDepth = wantsReversedDepth;
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
    }
  };
}
