import { Fn, float, lightShadowMatrix, normalWorld, positionWorld, reference, renderGroup, texture, vec3, vec4 } from "three/tsl";
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
      .and(shadowCoord.z.lessThanEqual(1));
    const visibility = texture(depthTexture, shadowCoord.xy).compare(shadowCoord.z) as Node<"float">;
    return inFrustum.select(visibility, float(1)) as Node<"float">;
  })();
}
