import { Fn, float, floor, fract, ivec2, max, min, mix, normalWorld, positionWorld, reference, renderGroup, saturate, textureLoad, uniform, vec2, vec4 } from "three/tsl";
import type * as THREE from "three/webgpu";
import type Node from "three/src/nodes/core/Node.js";
import { getMmdShadowProjection } from "../three/mmd-shadow-projection.js";

/** Interpolate raw R32F depth first, then apply the MMD mode-dependent ramp. */
export function createMmdTslShadowVisibilityNode(light: THREE.DirectionalLight, depthTexture: THREE.Texture): Node<"float"> {
  const projection = getMmdShadowProjection(light);
  const matrix = uniform(projection.sampleMatrix);
  const shadowMode = uniform(1, "float");
  const sampling = reference("value", "float", projection.sampling);
  const bias = reference("value", "float", projection.receiverBias);
  const normalBias = reference("value", "float", projection.normalBias);
  const intensity = (reference("intensity", "float", light.shadow) as unknown as {
    setGroup(group: typeof renderGroup): Node<"float">;
  }).setGroup(renderGroup);
  const image = depthTexture.image as { width: number; height: number };
  const visibility = Fn(() => {
    const coord = matrix.mul(vec4(positionWorld.add(normalWorld.mul(normalBias)), 1));
    const p = coord.xyz.div(coord.w);
    const inside = p.x.greaterThanEqual(0).and(p.x.lessThanEqual(1))
      .and(p.y.greaterThanEqual(0)).and(p.y.lessThanEqual(1))
      .and(sampling.equal(0).or(sampling.equal(2).or(p.z.add(bias).greaterThanEqual(0)).and(p.z.add(bias).lessThanEqual(1))));
    const size = vec2(image.width, image.height);
    // Explicit bilinear filtering also works without WebGPU float32-filterable.
    const texel = p.xy.mul(size).sub(0.5);
    const base = floor(texel);
    const fraction = fract(texel);
    const at = (offset: Node<"vec2">) => textureLoad(depthTexture,
      ivec2(min(max(base.add(offset), vec2(0)), size.sub(1)))).r;
    const linearDepth = mix(mix(at(vec2(0, 0)), at(vec2(1, 0)), fraction.x),
      mix(at(vec2(0, 1)), at(vec2(1, 1)), fraction.x), fraction.y);
    const nearestDepth = textureLoad(depthTexture, ivec2(min(max(floor(p.xy.mul(size)),vec2(0)),size.sub(1)))).r;
    const depth = sampling.equal(0).select(linearDepth, nearestDepth);
    const scale = shadowMode.equal(2).select(p.y.mul(8000), float(1500));
    const occlusion = sampling.equal(2).select(p.z.add(bias).greaterThan(depth).select(1,0),saturate(max(p.z.add(bias).sub(depth), 0).mul(scale).sub(0.3)));
    const result = float(1).sub(occlusion.mul(saturate(intensity)));
    return inside.select(result, float(-1));
  })() as Node<"float"> & { mmdTslShadowMode: typeof shadowMode };
  visibility.mmdTslShadowMode = shadowMode;
  return visibility;
}
