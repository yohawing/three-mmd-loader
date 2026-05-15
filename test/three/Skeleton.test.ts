import { describe, expect, it } from "vitest";

import { createThreeSkeleton } from "../../src/three/index.js";
import type { ThreeMmdSkeletonData } from "../../src/three/index.js";

describe("createThreeSkeleton", () => {
  it("returns a synthetic root bone for empty skeleton data", () => {
    const skeleton = createThreeSkeleton({ bones: [] });

    expect(skeleton.bones).toHaveLength(1);
    expect(skeleton.bones[0]?.name).toBe("__yw_mmd_root__");
    expect(skeleton.bones[0]?.parent).toBeNull();
    expect(skeleton.bones[0]?.position.toArray()).toEqual([0, 0, 0]);
  });

  it("uses English bone names when present and falls back to local names", () => {
    const skeleton = createThreeSkeleton({
      bones: [
        { name: "センター", englishName: "center", parentIndex: -1, position: [0, 10, 2] },
        { name: "左足", englishName: "", parentIndex: 0, position: [1, 8, 5] }
      ]
    });

    expect(skeleton.bones.map((bone) => bone.name)).toEqual(["center", "左足"]);
  });

  it("builds parent-child hierarchy with Three.js local-space Z inversion", () => {
    const skeletonData: ThreeMmdSkeletonData = {
      bones: [
        { name: "root", englishName: "", parentIndex: -1, position: [1, 2, 3] },
        { name: "spine", englishName: "", parentIndex: 0, position: [1, 5, 7] },
        { name: "head", englishName: "", parentIndex: 1, position: [2, 8, 6] },
        { name: "arm", englishName: "", parentIndex: 0, position: [-2, 3, 10] }
      ]
    };

    const skeleton = createThreeSkeleton(skeletonData);
    const [root, spine, head, arm] = skeleton.bones;

    expect(root?.parent).toBeNull();
    expect(root?.children).toEqual([spine, arm]);
    expect(spine?.children).toEqual([head]);
    expect(head?.children).toEqual([]);
    expect(arm?.children).toEqual([]);

    expect(root?.position.toArray()).toEqual([1, 2, -3]);
    expect(spine?.position.toArray()).toEqual([0, 3, -4]);
    expect(head?.position.toArray()).toEqual([1, 3, 1]);
    expect(arm?.position.toArray()).toEqual([-3, 1, -7]);
  });

  it("rejects invalid parent indices", () => {
    expect(() =>
      createThreeSkeleton({
        bones: [{ name: "root", englishName: "", parentIndex: -2, position: [0, 0, 0] }]
      })
    ).toThrow("THREE_MMD_SKELETON_PARENT_INDEX_INVALID:0:-2");

    expect(() =>
      createThreeSkeleton({
        bones: [{ name: "root", englishName: "", parentIndex: 0.5, position: [0, 0, 0] }]
      })
    ).toThrow("THREE_MMD_SKELETON_PARENT_INDEX_INVALID:0:0.5");

    expect(() =>
      createThreeSkeleton({
        bones: [{ name: "root", englishName: "", parentIndex: Number.NaN, position: [0, 0, 0] }]
      })
    ).toThrow("THREE_MMD_SKELETON_PARENT_INDEX_INVALID:0:NaN");

    expect(() =>
      createThreeSkeleton({
        bones: [{ name: "root", englishName: "", parentIndex: 0, position: [0, 0, 0] }]
      })
    ).toThrow("THREE_MMD_SKELETON_PARENT_SELF:0");

    expect(() =>
      createThreeSkeleton({
        bones: [{ name: "root", englishName: "", parentIndex: 2, position: [0, 0, 0] }]
      })
    ).toThrow("THREE_MMD_SKELETON_PARENT_OUT_OF_RANGE:0:2");

    expect(() =>
      createThreeSkeleton({
        bones: [
          { name: "a", englishName: "", parentIndex: 1, position: [0, 0, 0] },
          { name: "b", englishName: "", parentIndex: 0, position: [0, 0, 0] }
        ]
      })
    ).toThrow("THREE_MMD_SKELETON_PARENT_CYCLE:0:0");
  });

  it("allows parents that appear after children in adapter-local data", () => {
    const skeleton = createThreeSkeleton({
      bones: [
        { name: "child", englishName: "", parentIndex: 1, position: [1, 2, 3] },
        { name: "parent", englishName: "", parentIndex: -1, position: [1, 1, 1] }
      ]
    });

    expect(skeleton.bones[0]?.parent).toBe(skeleton.bones[1]);
    expect(skeleton.bones[0]?.position.toArray()).toEqual([0, 1, -2]);
  });

  it("rejects non-finite bone positions", () => {
    expect(() =>
      createThreeSkeleton({
        bones: [{ name: "root", englishName: "", parentIndex: -1, position: [0, Number.NaN, 0] }]
      })
    ).toThrow("THREE_MMD_SKELETON_POSITION_NON_FINITE:0:1");
  });

  it("rejects malformed bone position tuples", () => {
    expect(() =>
      createThreeSkeleton({
        bones: [
          {
            name: "root",
            englishName: "",
            parentIndex: -1,
            position: [0, 0] as unknown as [number, number, number]
          }
        ]
      })
    ).toThrow("THREE_MMD_SKELETON_POSITION_INVALID:0");

    expect(() =>
      createThreeSkeleton({
        bones: [
          {
            name: "root",
            englishName: "",
            parentIndex: -1,
            position: [0, 0, 0, 0] as unknown as [number, number, number]
          }
        ]
      })
    ).toThrow("THREE_MMD_SKELETON_POSITION_INVALID:0");

    expect(() =>
      createThreeSkeleton({
        bones: [
          {
            name: "root",
            englishName: "",
            parentIndex: -1,
            position: { 0: 0, 1: 0, 2: 0, length: 3 } as unknown as [number, number, number]
          }
        ]
      })
    ).toThrow("THREE_MMD_SKELETON_POSITION_INVALID:0");
  });
});
