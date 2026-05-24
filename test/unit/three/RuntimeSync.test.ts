import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  mmdWorldMatrixToThree,
  syncThreeMmdRuntimeToModel,
  type MmdRuntimeMeshSyncSource,
  type MmdWorldMatrixColumnMajorTuple
} from "../../../src/three/index.js";
import type {
  MaterialRuntimeState,
  MmdModel
} from "../../../src/parser/model/modelTypes.js";

describe("mmdWorldMatrixToThree", () => {
  it("converts a column-major MMD world matrix into Three.js coordinate space", () => {
    const matrix: MmdWorldMatrixColumnMajorTuple = [
      1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0, 10, 11, 12, 1
    ];

    const threeMatrix = mmdWorldMatrixToThree(matrix);

    expect(Array.from(threeMatrix.elements)).toEqual([
      1, 2, -3, 0, 4, 5, -6, 0, -7, -8, 9, 0, 10, 11, -12, 1
    ]);
  });

  it("reads the selected matrix from a typed matrix buffer", () => {
    const matrices = new Float32Array([
      100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 1, 0, 0, 0, 0,
      1, 0, 0, 0, 0, 1, 0, -2, 3, 4, 1
    ]);

    const threeMatrix = mmdWorldMatrixToThree(matrices, 1);

    expect(Array.from(threeMatrix.elements)).toEqual([
      1, 0, -0, 0, 0, 1, -0, 0, -0, -0, 1, 0, -2, 3, -4, 1
    ]);
  });

  it("rejects invalid matrix indices", () => {
    const matrix = new Float32Array(16);

    expect(() => mmdWorldMatrixToThree(matrix, -1)).toThrow(RangeError);
    expect(() => mmdWorldMatrixToThree(matrix, 0.5)).toThrow("MMD_WORLD_MATRIX_INDEX_INVALID:0.5");
  });

  it("rejects invalid matrix buffers", () => {
    expect(() => mmdWorldMatrixToThree(null as unknown as MmdWorldMatrixColumnMajorTuple)).toThrow(
      "MMD_WORLD_MATRIX_BUFFER_INVALID"
    );
    expect(() =>
      mmdWorldMatrixToThree({ length: "16" } as unknown as MmdWorldMatrixColumnMajorTuple)
    ).toThrow("MMD_WORLD_MATRIX_BUFFER_INVALID");
  });

  it("rejects matrix buffers that do not contain the selected matrix", () => {
    expect(() => mmdWorldMatrixToThree(new Float32Array(15), 0)).toThrow(
      "MMD_WORLD_MATRIX_BUFFER_TOO_SHORT:0:15"
    );
    expect(() => mmdWorldMatrixToThree(new Float32Array(16), 1)).toThrow(
      "MMD_WORLD_MATRIX_BUFFER_TOO_SHORT:1:16"
    );
  });

  it("rejects non-finite matrix components", () => {
    const matrix = new Float32Array(16);
    matrix[10] = Number.NaN;

    expect(() => mmdWorldMatrixToThree(matrix, 0)).toThrow(
      "MMD_WORLD_MATRIX_COMPONENT_NON_FINITE:0:10"
    );
  });
});

describe("syncThreeMmdRuntimeToModel", () => {
  it("syncs sibling outline proxy materials returned by ThreeMmdModel", () => {
    const mesh = createSkinnedMesh(new THREE.MeshBasicMaterial());
    const outlineMaterial = new THREE.MeshBasicMaterial();
    outlineMaterial.userData.mmdOutlineMaterial = {
      sourceMaterialIndex: 0,
      fallback: false
    };
    const outlineMesh = createSkinnedMesh(outlineMaterial);
    const renderOrderMesh = createSkinnedMesh(new THREE.MeshBasicMaterial());
    const runtime = createRuntimeSyncSource({
      diffuse: [1, 1, 1, 1],
      specular: [0, 0, 0],
      specularPower: 1,
      ambient: [0, 0, 0],
      edgeColor: [0.25, 0.5, 0.75, 0.4],
      edgeSize: 2.5,
      textureFactor: [1, 1, 1, 1],
      sphereTextureFactor: [1, 1, 1, 1],
      toonTextureFactor: [1, 1, 1, 1]
    });

    syncThreeMmdRuntimeToModel(
      createModelSkeleton(),
      { mesh, outlineMeshes: [outlineMesh], renderOrderMeshes: [renderOrderMesh] },
      runtime
    );

    expect(outlineMaterial.color).toEqual(new THREE.Color(0.25, 0.5, 0.75));
    expect(outlineMaterial.opacity).toBeCloseTo(0.4);
    expect(outlineMaterial.visible).toBe(true);
    expect(outlineMaterial.userData.mmdOutlineMaterial.outlineWidth).toBeCloseTo(2.5);
    expect(outlineMesh.visible).toBe(true);
    expect(renderOrderMesh.visible).toBe(true);
  });

  it("applies runtime visibility to sibling proxy meshes", () => {
    const mesh = createSkinnedMesh(new THREE.MeshBasicMaterial());
    const outlineMaterial = new THREE.MeshBasicMaterial();
    outlineMaterial.userData.mmdOutlineMaterial = {
      sourceMaterialIndex: 0,
      fallback: false
    };
    const outlineMesh = createSkinnedMesh(outlineMaterial);
    const renderOrderMesh = createSkinnedMesh(new THREE.MeshBasicMaterial());

    syncThreeMmdRuntimeToModel(
      createModelSkeleton(),
      { mesh, outlineMeshes: [outlineMesh], renderOrderMeshes: [renderOrderMesh] },
      createRuntimeSyncSource(createMaterialRuntimeState(), false)
    );

    expect(mesh.visible).toBe(false);
    expect(outlineMesh.visible).toBe(false);
    expect(renderOrderMesh.visible).toBe(false);
  });

  it("syncs render-order proxy visibility without outline proxies", () => {
    const mesh = createSkinnedMesh(new THREE.MeshBasicMaterial());
    const renderOrderMesh = createSkinnedMesh(new THREE.MeshBasicMaterial());

    syncThreeMmdRuntimeToModel(
      createModelSkeleton(),
      { mesh, renderOrderMeshes: [renderOrderMesh] },
      createRuntimeSyncSource(createMaterialRuntimeState(), false)
    );

    expect(renderOrderMesh.visible).toBe(false);
  });
});

function createSkinnedMesh(material: THREE.Material): THREE.SkinnedMesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0], 3));
  const mesh = new THREE.SkinnedMesh(geometry, material);
  const bone = new THREE.Bone();
  mesh.add(bone);
  mesh.bind(new THREE.Skeleton([bone]));
  return mesh;
}

function createModelSkeleton(): Pick<MmdModel, "skeleton"> {
  return {
    skeleton: () => ({
      bones: [
        {
          parentIndex: -1
        }
      ]
    })
  } as Pick<MmdModel, "skeleton">;
}

function createRuntimeSyncSource(
  state: MaterialRuntimeState,
  visible = true
): MmdRuntimeMeshSyncSource {
  return {
    boneMatrices: () =>
      new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
      ]),
    morphWeights: () => new Float32Array(),
    propertyState: () => ({ visible }),
    materialStates: () => [state]
  };
}

function createMaterialRuntimeState(): MaterialRuntimeState {
  return {
    diffuse: [1, 1, 1, 1],
    specular: [0, 0, 0],
    specularPower: 1,
    ambient: [0, 0, 0],
    edgeColor: [0, 0, 0, 1],
    edgeSize: 1,
    textureFactor: [1, 1, 1, 1],
    sphereTextureFactor: [1, 1, 1, 1],
    toonTextureFactor: [1, 1, 1, 1]
  };
}
