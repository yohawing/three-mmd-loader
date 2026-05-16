import { describe, expect, it } from "vitest";

import {
  createLoaderMmdMetadata,
  createLoaderMmdModelData,
  validateLoaderMmdModelData
} from "../../src/three/internalModelData.js";
import type { PmxMetadata } from "../../src/parser/index.js";

function createMinimalModelData() {
  return {
    coordinateSystem: "mmd-right-handed-y-up" as const,
    metadata: {
      format: "pmx" as const,
      name: "モデル",
      englishName: "Model",
      comment: "",
      englishComment: ""
    },
    geometry: {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]),
      uvs: new Float32Array([0, 0, 1, 0, 0, 1]),
      indices: new Uint16Array([0, 1, 2]),
      skinIndices: new Uint16Array(12),
      skinWeights: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0])
    },
    materials: [
      {
        name: "mat",
        englishName: "mat",
        faceCount: 1,
        diffuseTexturePath: "body.png"
      }
    ],
    morphs: [
      {
        vertexOffsets: [{ vertexIndex: 0, position: [0, 0.1, 0] as const }]
      }
    ],
    skeleton: {
      bones: [
        {
          name: "センター",
          englishName: "center",
          parentIndex: -1,
          position: [0, 0, 0] as const
        }
      ]
    }
  };
}

describe("internal loader model data contract", () => {
  it("keeps clean MMD-space model data internal to the loader boundary", () => {
    const modelData = createMinimalModelData();

    expect(createLoaderMmdModelData(modelData)).toBe(modelData);
    expect(modelData.coordinateSystem).toBe("mmd-right-handed-y-up");
    expect(modelData.geometry.positions[2]).toBe(0);
    expect(modelData.skeleton.bones[0]?.position).toEqual([0, 0, 0]);
  });

  it("normalizes PMX/PMD parser metadata into loader metadata", () => {
    const metadata = {
      format: "pmx",
      header: {
        version: 2,
        encoding: "utf-8",
        additionalUvCount: 0,
        indexSizes: {
          vertex: 2,
          texture: 1,
          material: 1,
          bone: 1,
          morph: 1,
          rigidBody: 1
        }
      },
      name: "モデル",
      englishName: "Model",
      comment: "コメント",
      englishComment: "Comment",
      counts: {
        vertices: 0,
        faces: 0,
        textures: 0,
        materials: 0,
        bones: 0,
        morphs: 0,
        displayFrames: 0,
        rigidBodies: 0,
        joints: 0,
        softBodies: 0
      },
      trailingBytes: 0
    } satisfies PmxMetadata;

    expect(createLoaderMmdMetadata(metadata)).toEqual({
      format: "pmx",
      name: "モデル",
      englishName: "Model",
      comment: "コメント",
      englishComment: "Comment"
    });
  });

  it("rejects non-finite numeric payloads before Three.js adapter conversion", () => {
    const modelData = createMinimalModelData();
    modelData.geometry.positions[1] = Number.NaN;

    expect(() => validateLoaderMmdModelData(modelData)).toThrow(
      "LOADER_MMD_MODEL_POSITIONS_NON_FINITE:1"
    );
  });
});
