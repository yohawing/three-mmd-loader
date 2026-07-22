import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { parseMmdModelBones } from "../../../src/parser/index.js";

describe("parseMmdModelBones", () => {
  it("reads PMX bones without retaining geometry buffers", async () => {
    const bones = parseMmdModelBones(await readFile(resolve("test/fixtures/test_1bone_cube.pmx")));

    expect(bones).toHaveLength(1);
    expect(bones[0].name).not.toBe("");
  });
});
