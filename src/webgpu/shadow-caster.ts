import type { MaterialFlags } from "../parser/model/modelTypes.js";
import { MMD_SELF_SHADOW_LAYER } from "../three/shadow.js";
import * as THREE from "three/webgpu";

interface MmdShadowMaterialMetadata {
  readonly flags?: Partial<MaterialFlags>;
}

interface MmdTslTextureReferences {
  readonly diffuseMap?: THREE.Texture;
}

interface ShadowCasterBucket {
  readonly material: THREE.Material;
  readonly groups: ShadowGeometryGroup[];
}

interface ShadowGeometryGroup {
  readonly start: number;
  readonly count: number;
  readonly materialIndex: number;
}

interface MmdTslShadowCasterState {
  readonly proxy: THREE.SkinnedMesh;
  readonly originalCastShadow: boolean;
  readonly originalLayersMask: number;
  readonly onSourceGeometryDispose: () => void;
}

export interface CreateMmdTslShadowCasterOptions {
  readonly shadowLayer?: number;
  /** Set false to merge texture cutouts into opaque caster buckets for lower shadow cost. */
  readonly alphaTest?: boolean;
}

const shadowCasterStates = new WeakMap<THREE.SkinnedMesh, MmdTslShadowCasterState>();

/**
 * Creates a shadow-only child representation with compatible opaque-side and
 * alpha-test buckets. Vertex, skinning, morph, and storage attributes
 * remain shared with the visible mesh; only the compact caster index is owned.
 */
export function createMmdTslShadowCaster(
  mesh: THREE.SkinnedMesh,
  options: CreateMmdTslShadowCasterOptions = {}
): THREE.SkinnedMesh | null {
  const existing = shadowCasterStates.get(mesh);
  if (existing) {
    return existing.proxy;
  }

  const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const opaqueBuckets = new Map<string, ShadowCasterBucket>();
  const alphaBuckets = new Map<string, ShadowCasterBucket>();
  const sourceGroups = readSourceGroups(mesh.geometry);
  for (const group of sourceGroups) {
    const material = sourceMaterials[group.materialIndex ?? 0];
    if (!material || material.userData.mmdTslOutlineMaterial || !materialCastsShadow(material)) {
      continue;
    }
    const diffuseMap = readDiffuseMap(material);
    if (options.alphaTest === false || !(material.alphaTest > 0) || !diffuseMap) {
      const key = shadowSideKey(material);
      let bucket = opaqueBuckets.get(key);
      if (!bucket) {
        bucket = { material: createOpaqueShadowMaterial(material), groups: [] };
        opaqueBuckets.set(key, bucket);
      }
      bucket.groups.push(group);
      continue;
    }
    const key = `${diffuseMap.uuid}:${material.alphaTest}:${shadowSideKey(material)}`;
    let bucket = alphaBuckets.get(key);
    if (!bucket) {
      bucket = {
        material: createAlphaTestShadowMaterial(material, diffuseMap),
        groups: []
      };
      alphaBuckets.set(key, bucket);
    }
    bucket.groups.push(group);
  }

  const buckets: ShadowCasterBucket[] = [];
  buckets.push(...opaqueBuckets.values());
  buckets.push(...alphaBuckets.values());
  if (buckets.length === 0) {
    return null;
  }

  const geometry = createShadowCasterGeometry(mesh.geometry, buckets);
  const materials = buckets.map((bucket) => bucket.material);
  const proxy = new THREE.SkinnedMesh(geometry, materials.length === 1 ? materials[0] : materials);
  proxy.name = `${mesh.name || "mmd"} TSL shadow caster`;
  proxy.bindMode = mesh.bindMode;
  proxy.bind(mesh.skeleton, mesh.bindMatrix);
  proxy.morphTargetDictionary = mesh.morphTargetDictionary;
  proxy.morphTargetInfluences = mesh.morphTargetInfluences;
  proxy.castShadow = true;
  proxy.receiveShadow = false;
  proxy.frustumCulled = mesh.frustumCulled;
  proxy.layers.set(normalizeShadowLayer(options.shadowLayer));
  proxy.userData.mmdTslShadowCaster = {
    opaqueDraws: opaqueBuckets.size,
    alphaTestDraws: alphaBuckets.size,
    sourceGroupCount: sourceGroups.length
  };

  const originalCastShadow = mesh.castShadow;
  const originalLayersMask = mesh.layers.mask;
  mesh.castShadow = false;
  mesh.layers.disable(normalizeShadowLayer(options.shadowLayer));
  mesh.add(proxy);

  const onSourceGeometryDispose = (): void => {
    releaseMmdTslShadowCaster(mesh, false);
  };
  const state: MmdTslShadowCasterState = {
    proxy,
    originalCastShadow,
    originalLayersMask,
    onSourceGeometryDispose
  };
  shadowCasterStates.set(mesh, state);
  mesh.geometry.addEventListener("dispose", onSourceGeometryDispose);
  return proxy;
}

export function disposeMmdTslShadowCaster(mesh: THREE.SkinnedMesh): boolean {
  return releaseMmdTslShadowCaster(mesh, true);
}

function releaseMmdTslShadowCaster(mesh: THREE.SkinnedMesh, restoreSource: boolean): boolean {
  const state = shadowCasterStates.get(mesh);
  if (!state) {
    return false;
  }
  shadowCasterStates.delete(mesh);
  mesh.geometry.removeEventListener("dispose", state.onSourceGeometryDispose);
  state.proxy.parent?.remove(state.proxy);
  state.proxy.geometry.dispose();
  for (const material of normalizeMaterials(state.proxy.material)) {
    material.dispose();
  }
  if (restoreSource) {
    mesh.castShadow = state.originalCastShadow;
    mesh.layers.mask = state.originalLayersMask;
  }
  return true;
}

function createShadowCasterGeometry(
  source: THREE.BufferGeometry,
  buckets: readonly ShadowCasterBucket[]
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) {
    geometry.setAttribute(name, attribute);
  }
  geometry.morphAttributes = source.morphAttributes;
  geometry.morphTargetsRelative = source.morphTargetsRelative;
  geometry.boundingBox = source.boundingBox;
  geometry.boundingSphere = source.boundingSphere;

  let indexCount = 0;
  for (const bucket of buckets) {
    for (const group of bucket.groups) {
      indexCount += group.count;
    }
  }
  const position = source.getAttribute("position");
  const indexArray = position && position.count > 65535
    ? new Uint32Array(indexCount)
    : new Uint16Array(indexCount);
  const sourceIndex = source.index;
  let targetOffset = 0;
  for (let materialIndex = 0; materialIndex < buckets.length; materialIndex += 1) {
    const bucket = buckets[materialIndex];
    if (!bucket) continue;
    const groupStart = targetOffset;
    for (const group of bucket.groups) {
      const groupEnd = group.start + group.count;
      for (let sourceOffset = group.start; sourceOffset < groupEnd; sourceOffset += 1) {
        indexArray[targetOffset] = sourceIndex ? sourceIndex.getX(sourceOffset) : sourceOffset;
        targetOffset += 1;
      }
    }
    geometry.addGroup(groupStart, targetOffset - groupStart, materialIndex);
  }
  geometry.setIndex(new THREE.BufferAttribute(indexArray, 1));
  return geometry;
}

function readSourceGroups(geometry: THREE.BufferGeometry): ShadowGeometryGroup[] {
  if (geometry.groups.length > 0) {
    return geometry.groups.map((group) => ({
      start: group.start,
      count: group.count ?? 0,
      materialIndex: group.materialIndex ?? 0
    }));
  }
  const elementCount = geometry.index?.count ?? geometry.getAttribute("position")?.count ?? 0;
  const start = Math.min(Math.max(geometry.drawRange.start, 0), elementCount);
  const availableCount = elementCount - start;
  const count = Number.isFinite(geometry.drawRange.count)
    ? Math.min(Math.max(geometry.drawRange.count, 0), availableCount)
    : availableCount;
  return count > 0 ? [{ start, count, materialIndex: 0 }] : [];
}

function createOpaqueShadowMaterial(source: THREE.Material): THREE.MeshBasicNodeMaterial {
  const material = new THREE.MeshBasicNodeMaterial({ side: source.side });
  material.shadowSide = source.shadowSide;
  material.name = "MMD TSL opaque shadow caster";
  material.userData.mmdTslShadowCasterMaterial = { alphaTest: false };
  return material;
}

function createAlphaTestShadowMaterial(
  source: THREE.Material,
  diffuseMap: THREE.Texture
): THREE.MeshBasicNodeMaterial {
  const material = new THREE.MeshBasicNodeMaterial({
    map: diffuseMap,
    alphaTest: source.alphaTest,
    side: source.side
  });
  material.shadowSide = source.shadowSide;
  material.name = "MMD TSL alpha-test shadow caster";
  material.userData.mmdTslShadowCasterMaterial = {
    alphaTest: true,
    sourceMaterialUuid: source.uuid
  };
  return material;
}

function shadowSideKey(material: THREE.Material): string {
  return `${material.side}:${material.shadowSide ?? "default"}`;
}

function materialCastsShadow(material: THREE.Material): boolean {
  const metadata = material.userData.mmdMaterial as MmdShadowMaterialMetadata | undefined;
  return metadata?.flags?.groundShadow === true || metadata?.flags?.selfShadowMap === true;
}

function readDiffuseMap(material: THREE.Material): THREE.Texture | undefined {
  const references = material.userData.mmdTslTextureReferences as MmdTslTextureReferences | undefined;
  return references?.diffuseMap;
}

function normalizeShadowLayer(layer: number | undefined): number {
  return Number.isInteger(layer) && layer !== undefined && layer >= 0 && layer <= 31
    ? layer
    : MMD_SELF_SHADOW_LAYER;
}

function normalizeMaterials(material: THREE.Material | THREE.Material[]): THREE.Material[] {
  return Array.isArray(material) ? material : [material];
}
