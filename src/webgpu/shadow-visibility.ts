import { Fn, float, lightShadowMatrix, max, normalWorld, positionWorld, reference, renderGroup, saturate, texture, uniform, vec3, vec4 } from "three/tsl";
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
  depthTexture: THREE.DepthTexture,
  options: { reversedDepth?: boolean } = {}
): Node<"float"> {
  const reversedDepth = options.reversedDepth === true;
  const shadowMatrix = lightShadowMatrix(light);
  // VMD self-shadow mode is sampled on the CPU, but the selected ramp must be
  // consumed by the already-compiled receiver graph. Keep this as one mutable
  // uniform so mode changes never recreate a node, pass, or material on the
  // render path. Any state other than mode 2 intentionally falls back to the
  // mode-1 ramp (including mode 0 / missing state).
  const shadowMode = uniform(1, "float") as unknown as {
    value: number;
    equal(value: number): Node<"bool">;
  };
  const shadowIntensity = saturate(
    (reference("intensity", "float", light.shadow) as unknown as {
      setGroup(group: typeof renderGroup): Node<"float">;
    }).setGroup(renderGroup)
  );
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
  const visibilityNode = Fn(() => {
    const shadowPosition = shadowMatrix.mul(
      vec4(positionWorld.add(normalWorld.mul(normalBias)), 1)
    );
    const projected = shadowPosition.xyz.div(shadowPosition.w);
    // Three's reversedDepthBuffer flips the orthographic shadow camera's
    // clip-space mapping to 1-x (near->1, far->0 instead of near->0, far->1;
    // see node_modules/three/src/math/Matrix4.js makeOrthographic's
    // reversedDepth branch). `bias` is a small negative constant tuned to
    // pull the receiver's depth slightly *toward* the light in the
    // non-reversed near->0 mapping (i.e. `z.add(bias)` decreases z). Under
    // the flipped mapping "toward the light" means a larger z instead of a
    // smaller one, so the same negative bias must be subtracted instead of
    // added to keep pulling the receiver toward the light.
    const biasedZ = reversedDepth ? projected.z.sub(bias) : projected.z.add(bias);
    const shadowCoord = vec3(
      projected.x,
      projected.y.oneMinus(),
      biasedZ
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
    // Under reversedDepth, WebGPUPipelineUtils (utils/WebGPUPipelineUtils.js
    // `ReversedDepthFuncs`) flips the GPU depth-test function (e.g.
    // LessDepth -> GreaterDepth) for the caster pass, so `sampledDepth` still
    // stores "the caster nearest the light" -- just as the larger reversed-z
    // value instead of the smaller non-reversed one. The occlusion condition
    // therefore flips: a receiver is occluded when `sampledDepth` is larger
    // than the receiver's own (reversed) z, so the subtraction operands swap
    // instead of negating the whole delta (magnitude is identical because
    // the 1-x mapping is a pure affine flip; only the sign of the ordering
    // changes, matching the *1500 - 0.3 ramp constants unchanged).
    const depthDelta = reversedDepth
      ? max(sampledDepth.sub(shadowCoord.z), 0)
      : max(shadowCoord.z.sub(sampledDepth), 0);
    const rampScale = shadowMode.equal(2).select(
      shadowCoord.y.mul(8000),
      float(1500)
    );
    // Shadow intensity attenuates only the occluder darkening. The downstream
    // material graph still applies its existing N.L/toon grade unchanged, so
    // intensity=0 removes the dedicated shadow's darkening without turning off
    // the ordinary lighting contract.
    const visibility = float(1).sub(
      saturate(depthDelta.mul(rampScale).sub(0.3)).mul(shadowIntensity)
    );
    // §10.2: outside the light frustum there is no shadow AND no toon darkening at all
    // (not even the N.L-based grade the in-frustum branch mixes in). A plain `select(1)`
    // here would let the caller's `min(saturate(N.L*3), shadowVis)` combination still
    // apply partial N.L darkening for out-of-frustum pixels. Returning a negative
    // sentinel lets the consumer (material-core.ts) detect "no frustum coverage" and
    // bypass the N.L combination entirely, instead of just clamping shadowVis to 1.
    return inFrustum.select(visibility, float(-1)) as Node<"float">;
  })() as Node<"float"> & {
    mmdTslShadowMode: typeof shadowMode;
  };
  visibilityNode.mmdTslShadowMode = shadowMode;
  return visibilityNode;
}
