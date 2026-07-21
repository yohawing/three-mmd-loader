import type * as THREE from "three";

import type { ThreeMmdGeometryMorph } from "./geometry.js";

const geometryMorphSources = new WeakMap<THREE.BufferGeometry, readonly ThreeMmdGeometryMorph[]>();

export function setMmdGeometryMorphSource(
  geometry: THREE.BufferGeometry,
  morphs: readonly ThreeMmdGeometryMorph[]
): void {
  if (morphs.length > 0) {
    geometryMorphSources.set(geometry, morphs);
  }
}

export function getMmdGeometryMorphSource(
  geometry: THREE.BufferGeometry
): readonly ThreeMmdGeometryMorph[] | undefined {
  return geometryMorphSources.get(geometry);
}
