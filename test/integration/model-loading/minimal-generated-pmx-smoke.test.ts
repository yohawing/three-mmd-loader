import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { ThreeMmdLoader } from "../../../src/index.js";

const execFileAsync = promisify(execFile);
const fixturePath = resolve("test/fixtures/generated/minimal-loader-smoke.pmx");
const generatorPath = resolve("scripts/fixtures/generate-minimal-pmx.mjs");

describe("minimal generated PMX loader smoke", () => {
  it("generates and loads a redistribution-safe PMX into a skinned mesh", async () => {
    await execFileAsync(process.execPath, [generatorPath, "--output", fixturePath]);

    const bytes = await readFile(fixturePath);
    const loader = new ThreeMmdLoader();
    const model = await loader.loadModel(bytes);
    const materialCount = Array.isArray(model.mesh.material) ? model.mesh.material.length : 1;

    expect(model.mesh.isSkinnedMesh).toBe(true);
    expect(model.mesh.geometry.getAttribute("position").count).toBeGreaterThan(0);
    expect(materialCount).toBeGreaterThan(0);
    expect(model.mesh.skeleton.bones.length).toBeGreaterThanOrEqual(3);
    expect(model.mesh.userData.mmdModel).toMatchObject({
      format: "pmx",
      englishName: "GeneratedMinimalLoaderSmoke"
    });
    expect(model.mesh.morphTargetDictionary).toHaveProperty("tiny_raise");
    expect(model.diagnostics.textures).toEqual([]);
  });
});
