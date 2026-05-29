import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { ThreeMmdLoader } from "../../../src/index.js";
import {
  generateSkinningPmx,
  skinningCaseIds
} from "../../../scripts/fixtures/generate-minimal-pmx.mjs";

const execFileAsync = promisify(execFile);
const generatorPath = resolve("scripts/fixtures/generate-minimal-pmx.mjs");

// Load fixture bytes on-the-fly from the generator (no disk I/O required for most tests)
function skinningFixtureBytes(caseId: string): Uint8Array {
  return generateSkinningPmx(caseId);
}

describe("skinning fixture loader smoke", () => {
  for (const caseId of skinningCaseIds()) {
    it(`loads ${caseId} as a skinned mesh without errors`, async () => {
      const bytes = skinningFixtureBytes(caseId);
      const loader = new ThreeMmdLoader();
      const model = await loader.loadModel(bytes);

      expect(model.mesh.isSkinnedMesh).toBe(true);
      expect(model.mesh.geometry.getAttribute("position").count).toBeGreaterThan(0);
      expect(model.mesh.skeleton.bones.length).toBeGreaterThanOrEqual(1);
      expect(model.textureDiagnostics).toEqual([]);
    });
  }

  it("bdef1-single-bone-quad has 4 vertices and 2 bones", async () => {
    const bytes = skinningFixtureBytes("bdef1-single-bone-quad");
    const loader = new ThreeMmdLoader();
    const model = await loader.loadModel(bytes);
    expect(model.mesh.geometry.getAttribute("position").count).toBe(4);
    expect(model.mesh.skeleton.bones.length).toBe(2);
  });

  it("bdef2-two-bone-strip has SDEF attribute absent or all-zero", async () => {
    const bytes = skinningFixtureBytes("bdef2-two-bone-strip");
    const loader = new ThreeMmdLoader();
    const model = await loader.loadModel(bytes);
    const sdefEnabled = model.mesh.geometry.getAttribute("matricesSdefEnabled");
    if (sdefEnabled) {
      const allZero = Array.from(sdefEnabled.array as Float32Array).every((v) => v === 0);
      expect(allZero).toBe(true);
    }
  });

  it("sdef-two-bone-elbow has SDEF enabled on all its vertices", async () => {
    const bytes = skinningFixtureBytes("sdef-two-bone-elbow");
    const loader = new ThreeMmdLoader();
    const model = await loader.loadModel(bytes);
    const sdefEnabled = model.mesh.geometry.getAttribute("matricesSdefEnabled");
    if (!sdefEnabled) throw new Error("matricesSdefEnabled attribute missing");
    const enabled = Array.from(sdefEnabled.array as Float32Array);
    expect(enabled.every((v) => v === 1)).toBe(true);
  });

  it("mixed-deform-types has exactly 4 SDEF-enabled vertices (one quad)", async () => {
    const bytes = skinningFixtureBytes("mixed-deform-types");
    const loader = new ThreeMmdLoader();
    const model = await loader.loadModel(bytes);
    const sdefEnabled = model.mesh.geometry.getAttribute("matricesSdefEnabled");
    if (!sdefEnabled) throw new Error("matricesSdefEnabled attribute missing");
    const count = Array.from(sdefEnabled.array as Float32Array).filter((v) => v === 1).length;
    expect(count).toBe(4);
  });

  it("qdef-twist-cylinder has 4 bones and no SDEF buffers", async () => {
    const bytes = skinningFixtureBytes("qdef-twist-cylinder");
    const loader = new ThreeMmdLoader();
    const model = await loader.loadModel(bytes);
    expect(model.mesh.skeleton.bones.length).toBe(4);
    const sdefEnabled = model.mesh.geometry.getAttribute("matricesSdefEnabled");
    if (sdefEnabled) {
      const allZero = Array.from(sdefEnabled.array as Float32Array).every((v) => v === 0);
      expect(allZero).toBe(true);
    }
  });

  // ── QDEF geometry attribute tests ──────────────────────────────────────────

  it("qdef-twist-cylinder has matricesQdefEnabled attribute with all vertices = 1", async () => {
    const bytes = skinningFixtureBytes("qdef-twist-cylinder");
    const loader = new ThreeMmdLoader();
    const model = await loader.loadModel(bytes);
    const qdefEnabled = model.mesh.geometry.getAttribute("matricesQdefEnabled");
    if (!qdefEnabled) throw new Error("matricesQdefEnabled attribute missing");
    const arr = Array.from(qdefEnabled.array as Float32Array);
    expect(arr.every((v) => v === 1)).toBe(true);
  });

  it("mixed-deform-types has exactly 4 QDEF-enabled vertices (one quad)", async () => {
    const bytes = skinningFixtureBytes("mixed-deform-types");
    const loader = new ThreeMmdLoader();
    const model = await loader.loadModel(bytes);
    const qdefEnabled = model.mesh.geometry.getAttribute("matricesQdefEnabled");
    if (!qdefEnabled) throw new Error("matricesQdefEnabled attribute missing");
    const count = Array.from(qdefEnabled.array as Float32Array).filter((v) => v === 1).length;
    expect(count).toBe(4);
  });

  it("bdef4-twist-cylinder has NO matricesQdefEnabled attribute (BDEF4 != QDEF)", async () => {
    const bytes = skinningFixtureBytes("bdef4-twist-cylinder");
    const loader = new ThreeMmdLoader();
    const model = await loader.loadModel(bytes);
    expect(model.mesh.geometry.getAttribute("matricesQdefEnabled")).toBeUndefined();
  });

  it("generator CLI produces the same output as the exported function", async () => {
    const caseId = "bdef1-single-bone-quad";
    const expected = generateSkinningPmx(caseId);

    const tmpPath = resolve("test/fixtures/generated/skinning/tmp-cli-check.pmx");
    await execFileAsync(process.execPath, [
      generatorPath,
      "--skinning-case", caseId,
      "--output", tmpPath
    ]);
    const fromDisk = await readFile(tmpPath);
    expect(new Uint8Array(fromDisk)).toEqual(expected);
  });
});
