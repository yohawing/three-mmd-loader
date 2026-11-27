import * as THREE from "three";

import {
  createMorphAttributes,
  createThreeAdditionalMorphUvOffsets,
  createThreeMorphPositionOffsets,
  createThreeMorphUvOffsets,
  hasAdditionalUvMorphOffsets,
  hasPositionMorphOffsets,
  hasUvMorphOffsets,
  type ThreeMmdGeometryMorph
} from "./geometry-morph.js";
import { validateGeometryInput } from "./geometry-validation.js";
import { setMmdGeometryMorphSource } from "./internal-morph-source.js";
import { computeMmdMaterialRenderOrder } from "./material/material-metadata.js";
import type { MmdMaterialTransparencyMode } from "./textures.js";

export interface ThreeMmdMaterialGroup {
  readonly start: number;
  readonly count: number;
  readonly materialIndex: number;
}

export interface ThreeMmdGeometryMaterial {
  readonly faceCount: number;
  readonly materialIndex?: number;
  readonly transparencyMode?: MmdMaterialTransparencyMode;
}

export interface ThreeMmdSdefBuffers {
  readonly enabled: Float32Array;
  readonly c: Float32Array;
  readonly r0: Float32Array;
  readonly r1: Float32Array;
  readonly rw0: Float32Array;
  readonly rw1: Float32Array;
}

export interface ThreeMmdQdefBuffers {
  readonly enabled: Float32Array;
}

export interface ThreeMmdGeometryBuffers {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint16Array | Uint32Array;
  readonly additionalUvs?: readonly Float32Array[];
  readonly skinIndices: Uint16Array;
  readonly skinWeights: Float32Array;
  readonly edgeScale?: Float32Array;
  readonly sdef?: ThreeMmdSdefBuffers;
  readonly qdef?: ThreeMmdQdefBuffers;
  readonly materialGroups?: readonly ThreeMmdMaterialGroup[];
}

/** Controls optional Three.js morph attribute allocation during geometry creation. */
export interface ThreeMmdGeometryOptions {
  /** Creates dense Three.js morph attributes. Defaults to true. */
  readonly morphAttributes?: boolean;
}

export function createThreeBufferGeometry(
  buffers: ThreeMmdGeometryBuffers,
  materials: readonly ThreeMmdGeometryMaterial[] = [],
  morphs: readonly ThreeMmdGeometryMorph[] = [],
  options: ThreeMmdGeometryOptions = {}
): THREE.BufferGeometry {
  validateGeometryInput(buffers, materials, morphs);

  const positions = new Float32Array(buffers.positions.length);
  const normals = new Float32Array(buffers.normals.length);
  for (let i = 0; i < buffers.positions.length; i += 3) {
    positions[i] = buffers.positions[i];
    positions[i + 1] = buffers.positions[i + 1];
    positions[i + 2] = -buffers.positions[i + 2];
    normals[i] = buffers.normals[i];
    normals[i + 1] = buffers.normals[i + 1];
    normals[i + 2] = -buffers.normals[i + 2];
  }

  const indices =
    buffers.indices instanceof Uint32Array
      ? new Uint32Array(buffers.indices.length)
      : new Uint16Array(buffers.indices.length);
  for (let i = 0; i < buffers.indices.length; i += 3) {
    indices[i] = buffers.indices[i];
    indices[i + 1] = buffers.indices[i + 2];
    indices[i + 2] = buffers.indices[i + 1];
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(buffers.uvs.slice(), 2));

  if (buffers.edgeScale) {
    geometry.setAttribute("mmdEdgeScale", new THREE.BufferAttribute(buffers.edgeScale.slice(), 1));
    geometry.userData.mmdEdgeScale = { vertexCount: buffers.edgeScale.length };
  }

  const additionalUvs = buffers.additionalUvs ?? [];
  additionalUvs.forEach((additionalUv, index) => {
    geometry.setAttribute(`uv${index + 1}`, new THREE.BufferAttribute(additionalUv.slice(), 4));
  });

  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(buffers.skinIndices, 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(buffers.skinWeights, 4));

  if (buffers.sdef) {
    geometry.setAttribute(
      "matricesSdefEnabled",
      new THREE.BufferAttribute(buffers.sdef.enabled.slice(), 1)
    );
    geometry.setAttribute(
      "matricesSdefC",
      new THREE.BufferAttribute(createThreeVec3Buffer(buffers.sdef.c), 3)
    );
    geometry.setAttribute(
      "matricesSdefR0",
      new THREE.BufferAttribute(createThreeVec3Buffer(buffers.sdef.r0), 3)
    );
    geometry.setAttribute(
      "matricesSdefR1",
      new THREE.BufferAttribute(createThreeVec3Buffer(buffers.sdef.r1), 3)
    );
    geometry.setAttribute(
      "matricesSdefRW0",
      new THREE.BufferAttribute(createThreeVec3Buffer(buffers.sdef.rw0), 3)
    );
    geometry.setAttribute(
      "matricesSdefRW1",
      new THREE.BufferAttribute(createThreeVec3Buffer(buffers.sdef.rw1), 3)
    );
    geometry.userData.mmdSdef = { vertexCount: buffers.sdef.c.length / 3 };
  }

  if (buffers.qdef) {
    geometry.setAttribute(
      "matricesQdefEnabled",
      new THREE.BufferAttribute(buffers.qdef.enabled.slice(), 1)
    );
    geometry.userData.mmdQdef = { vertexCount: buffers.qdef.enabled.length };
  }

  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  if (morphs.length > 0) {
    setMmdGeometryMorphSource(geometry, morphs);
    geometry.morphTargetsRelative = true;
    if (options.morphAttributes ?? true) {
      const morphAttributes = geometry.morphAttributes as Record<string, THREE.BufferAttribute[]>;
      if (morphs.some(hasPositionMorphOffsets)) {
        geometry.morphAttributes.position = createMorphAttributes(
          morphs,
          buffers.positions.length,
          3,
          (morph, length) => createThreeMorphPositionOffsets(length, morph)
        );
      }
      if (morphs.some(hasUvMorphOffsets)) {
        morphAttributes.uv = createMorphAttributes(
          morphs,
          buffers.uvs.length,
          2,
          (morph, length) => createThreeMorphUvOffsets(length, morph)
        );
      }
      additionalUvs.forEach((additionalUv, index) => {
        if (morphs.some((morph) => hasAdditionalUvMorphOffsets(morph, index))) {
          morphAttributes[`uv${index + 1}`] = createMorphAttributes(
            morphs,
            additionalUv.length,
            4,
            (morph, length) => createThreeAdditionalMorphUvOffsets(length, index, morph)
          );
        }
      });
    }
  }

  createMmdRenderOrderGroups(buffers, materials).forEach((group) => {
    geometry.addGroup(group.start, group.count, group.materialIndex);
  });

  geometry.computeBoundingSphere();
  return geometry;
}

export function createMmdRenderOrderGroups(
  buffers: ThreeMmdGeometryBuffers,
  materials: readonly ThreeMmdGeometryMaterial[]
): ThreeMmdMaterialGroup[] {
  const groups = buffers.materialGroups?.length
    ? [...buffers.materialGroups]
    : createMaterialFaceCountGroups(materials);
  if (materials.length === 0 || groups.length <= 1) {
    return groups;
  }

  const renderOrderByMaterial = new Map(
    computeMmdMaterialRenderOrder(
      materials.map((material, fallbackIndex) => ({
        materialIndex: material.materialIndex ?? fallbackIndex,
        transparencyMode: material.transparencyMode ?? "opaque"
      }))
    ).map((entry) => [entry.materialIndex, entry.renderOrder])
  );
  return groups
    .map((group, sourceOrder) => ({ group, sourceOrder }))
    .sort((a, b) => {
      const aOrder = renderOrderByMaterial.get(a.group.materialIndex) ?? Number.POSITIVE_INFINITY;
      const bOrder = renderOrderByMaterial.get(b.group.materialIndex) ?? Number.POSITIVE_INFINITY;
      return aOrder - bOrder || a.sourceOrder - b.sourceOrder;
    })
    .map((entry) => entry.group);
}

function createMaterialFaceCountGroups(
  materials: readonly ThreeMmdGeometryMaterial[]
): ThreeMmdMaterialGroup[] {
  let groupStart = 0;
  return materials.map((material, materialIndex) => {
    const groupCount = material.faceCount * 3;
    const group = {
      start: groupStart,
      count: groupCount,
      materialIndex
    };
    groupStart += groupCount;
    return group;
  });
}

function createThreeVec3Buffer(values: Float32Array): Float32Array {
  const converted = new Float32Array(values.length);
  for (let i = 0; i < values.length; i += 3) {
    converted[i] = values[i];
    converted[i + 1] = values[i + 1];
    converted[i + 2] = -values[i + 2];
  }
  return converted;
}
