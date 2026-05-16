import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { parseVmd } from "../../../src/parser/vmd/index.js";
import { ThreeMmdLoader } from "../../../src/three/index.js";
import type { VmdBoneFrame, VmdMorphFrame } from "../../../src/parser/model/modelTypes.js";

const fixtures = [
  "test_1bone_cube_motion.vmd",
  "joint_orient_test.vmd",
  "test_append_bone.vmd"
] as const;

describe("parseVmd", () => {
  it.each(fixtures)("parses %s into sorted MMD animation tracks", async (fixture) => {
    const bytes = await readFile(resolve("data", "unittest", fixture));

    const animation = parseVmd(bytes);

    expect(animation.kind).toBe("vmd");
    expect((animation.metadata as { readonly format?: string }).format).toBe("vmd");
    expect(Object.keys(animation.boneTracks).length).toBeGreaterThan(0);
    expect(animation.morphTracks).toBeDefined();
    for (const frames of Object.values(animation.boneTracks)) {
      expectSortedFrames(frames);
    }
    for (const frames of Object.values(animation.morphTracks)) {
      expectSortedFrames(frames);
    }
  });

  it("loads VMD through ThreeMmdLoader without requiring a model", async () => {
    const bytes = await readFile(resolve("data", "unittest", "test_1bone_cube_motion.vmd"));
    const loader = new ThreeMmdLoader();

    await expect(loader.loadAnimation(bytes)).resolves.toMatchObject({
      source: bytes,
      animation: {
        kind: "vmd"
      }
    });
  });
});

function expectSortedFrames(frames: readonly VmdBoneFrame[] | readonly VmdMorphFrame[]): void {
  for (let index = 1; index < frames.length; index += 1) {
    expect(frames[index]?.frame).toBeGreaterThanOrEqual(frames[index - 1]?.frame ?? 0);
  }
}
