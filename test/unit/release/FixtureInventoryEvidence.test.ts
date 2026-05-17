import { readdir } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  parsePmxSectionInventory,
  parseVmdSectionInventory
} from "../../../src/parser/index.js";
import { PMX_FIXTURES, VMD_FIXTURES, loadFixtureBytes } from "../../helpers/fixtures.js";

const expectedPmxInventory = {
  "joint_orient_test.pmx": {
    vertices: 24,
    faces: 36,
    materials: 3,
    bones: 3,
    displayFrames: 0
  },
  "test_1bone_cube.pmx": {
    vertices: 14,
    faces: 12,
    materials: 1,
    bones: 1,
    displayFrames: 2
  },
  "test_append_bone.pmx": {
    vertices: 0,
    faces: 0,
    materials: 0,
    bones: 9,
    displayFrames: 3
  },
  "test_basic_bone.pmx": {
    vertices: 0,
    faces: 0,
    materials: 0,
    bones: 79,
    displayFrames: 9
  },
  "test_fix_axis.pmx": {
    vertices: 0,
    faces: 0,
    materials: 0,
    bones: 5,
    displayFrames: 2
  },
  "test_given_bone_comprehensive.pmx": {
    vertices: 0,
    faces: 0,
    materials: 0,
    bones: 23,
    displayFrames: 3
  },
  "test_semi_basic_bone.pmx": {
    vertices: 0,
    faces: 0,
    materials: 0,
    bones: 100,
    displayFrames: 9
  }
} as const satisfies Record<
  (typeof PMX_FIXTURES)[number],
  {
    vertices: number;
    faces: number;
    materials: number;
    bones: number;
    displayFrames: number;
  }
>;

const expectedVmdInventory = {
  "joint_orient_test.vmd": {
    bones: 12,
    morphs: 0,
    cameras: 0,
    lights: 0,
    selfShadows: 0,
    properties: 0
  },
  "test_1bone_cube_motion.vmd": {
    bones: 6,
    morphs: 0,
    cameras: 0,
    lights: 0,
    selfShadows: 0,
    properties: 0
  },
  "test_append_bone.vmd": {
    bones: 13,
    morphs: 0,
    cameras: 0,
    lights: 0,
    selfShadows: 0,
    properties: 1
  }
} as const satisfies Record<
  (typeof VMD_FIXTURES)[number],
  {
    bones: number;
    morphs: number;
    cameras: number;
    lights: number;
    selfShadows: number;
    properties: number;
  }
>;

describe("release fixture inventory evidence", () => {
  it("keeps the fixture manifest explicit", async () => {
    const fixtureFiles = (await readdir("test/fixtures"))
      .filter((filename) => filename.endsWith(".pmx") || filename.endsWith(".vmd"))
      .sort();

    expect(fixtureFiles).toEqual([...PMX_FIXTURES, ...VMD_FIXTURES].sort());
  });

  it("records stable PMX inventory counts for bundled fixtures", async () => {
    for (const fixtureName of PMX_FIXTURES) {
      const inventory = parsePmxSectionInventory(await loadFixtureBytes(fixtureName));

      expect(inventory.format).toBe("pmx");
      expect(inventory.counts).toMatchObject(expectedPmxInventory[fixtureName]);
      expect(inventory.trailingBytes).toBe(0);
      expect(inventory.sections.length).toBe(9);
      assertOrderedSectionRanges(inventory.sections);
    }
  });

  it("records stable VMD inventory counts for bundled fixtures", async () => {
    for (const fixtureName of VMD_FIXTURES) {
      const inventory = parseVmdSectionInventory(await loadFixtureBytes(fixtureName));

      expect(inventory.format).toBe("vmd");
      expect(inventory.counts).toEqual(expectedVmdInventory[fixtureName]);
      expect(inventory.trailingBytes).toBe(0);
      assertOrderedVmdSections(inventory.sections);
    }
  });

  it("summarizes the release fixture coverage", async () => {
    const pmxInventories = await Promise.all(
      PMX_FIXTURES.map(async (fixtureName) =>
        parsePmxSectionInventory(await loadFixtureBytes(fixtureName))
      )
    );
    const vmdInventories = await Promise.all(
      VMD_FIXTURES.map(async (fixtureName) =>
        parseVmdSectionInventory(await loadFixtureBytes(fixtureName))
      )
    );

    expect({
      pmxFixtures: pmxInventories.length,
      pmxVertices: sum(pmxInventories.map((inventory) => inventory.counts.vertices)),
      pmxBones: sum(pmxInventories.map((inventory) => inventory.counts.bones)),
      vmdFixtures: vmdInventories.length,
      vmdBoneFrames: sum(vmdInventories.map((inventory) => inventory.counts.bones)),
      vmdPropertyFrames: sum(vmdInventories.map((inventory) => inventory.counts.properties))
    }).toEqual({
      pmxFixtures: 7,
      pmxVertices: 38,
      pmxBones: 220,
      vmdFixtures: 3,
      vmdBoneFrames: 31,
      vmdPropertyFrames: 1
    });
  });
});

function assertOrderedSectionRanges(
  sections: ReadonlyArray<{ offset: number; byteLength: number }>
): void {
  for (let i = 0; i < sections.length; i++) {
    expect(sections[i].offset).toBeGreaterThanOrEqual(0);
    expect(sections[i].byteLength).toBeGreaterThanOrEqual(0);
    if (i > 0) {
      expect(sections[i].offset).toBeGreaterThanOrEqual(
        sections[i - 1].offset + sections[i - 1].byteLength
      );
    }
  }
}

function assertOrderedVmdSections(
  sections: ReadonlyArray<{ countOffset: number; dataOffset: number; byteLength: number }>
): void {
  for (const section of sections) {
    expect(section.countOffset).toBeGreaterThanOrEqual(0);
    expect(section.dataOffset).toBeGreaterThan(section.countOffset);
    expect(section.byteLength).toBeGreaterThanOrEqual(0);
  }
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
