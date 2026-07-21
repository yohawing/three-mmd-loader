import { Fn, float, lightShadowMatrix, max, normalWorld, positionWorld, reference, renderGroup, saturate, texture, vec3, vec4 } from "three/tsl";
import type * as THREE from "three/webgpu";
import type Node from "three/src/nodes/core/Node.js";

/**
 * Builds the receiver-only visibility graph for the dedicated caster depth
 * target. This intentionally mirrors the directional-light portion of
 * Three's shadow node, but keeps the target independent from the renderer's
 * ordinary shadow-map binding.
 */
export function createMmdTslShadowVisibilityNode(
  light: THREE.DirectionalLight,
  depthTexture: THREE.DepthTexture
): Node<"float"> {
  const shadowMatrix = lightShadowMatrix(light);
  const bias = (
    reference("bias", "float", light.shadow) as unknown as {
      setGroup(group: typeof renderGroup): Node<"float">;
    }
  ).setGroup(renderGroup);
  const normalBias = (
    reference("normalBias", "float", light.shadow) as unknown as {
      setGroup(group: typeof renderGroup): Node<"float">;
    }
  ).setGroup(renderGroup);
  return Fn(() => {
    const shadowPosition = shadowMatrix.mul(
      vec4(positionWorld.add(normalWorld.mul(normalBias)), 1)
    );
    const projected = shadowPosition.xyz.div(shadowPosition.w);
    const shadowCoord = vec3(
      projected.x,
      projected.y.oneMinus(),
      projected.z.add(bias)
    );
    const inFrustum = shadowCoord.x
      .greaterThanEqual(0)
      .and(shadowCoord.x.lessThanEqual(1))
      .and(shadowCoord.y.greaterThanEqual(0))
      .and(shadowCoord.y.lessThanEqual(1))
      .and(shadowCoord.z.greaterThanEqual(0))
      .and(shadowCoord.z.lessThanEqual(1));
    const sampledDepth = texture(depthTexture, shadowCoord.xy).r;
    // Real MMD 9.32 (apitrace-disassembled shader, mmd-shading-notes.md §10.2) uses a
    // continuous depth-delta ramp, NOT a binary depth compare:
    //   shadowVis = 1 - saturate(depthDelta * 1500 - 0.3)   // mode 1
    // depthDelta is clamped to >= 0 so a receiver in front of the caster (no occlusion)
    // never goes negative and stays fully lit. The -0.3 offset is a real bias baked into
    // the reference shader's immediate constants, not an authoring choice.
    // TODO(mode2): mode 2 multiplies depthDelta by `8000 * shadowUV.y` instead of the
    // flat 1500. VMD self-shadow mode is tracked in SelfShadowState.mode (src/three/shadow.ts)
    // but is not yet wired through to this node, so only mode 1 is implemented here.
    const depthDelta = max(shadowCoord.z.sub(sampledDepth), 0);
    const visibility = float(1).sub(saturate(depthDelta.mul(1500).sub(0.3)));
    // §10.2: outside the light frustum there is no shadow AND no toon darkening at all
    // (not even the N.L-based grade the in-frustum branch mixes in). A plain `select(1)`
    // here would let the caller's `min(saturate(N.L*3), shadowVis)` combination still
    // apply partial N.L darkening for out-of-frustum pixels. Returning a negative
    // sentinel lets the consumer (material-core.ts) detect "no frustum coverage" and
    // bypass the N.L combination entirely, instead of just clamping shadowVis to 1.
    return inFrustum.select(visibility, float(-1)) as Node<"float">;
  })();
}
