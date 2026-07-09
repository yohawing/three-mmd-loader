import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { MmdAnimBackedCore } from "../../src/parser/wasm/MmdAnimBackedCore.js";
import { initCore } from "../../src/parser/wasm/index.js";
import { parsePmmDocument } from "../../src/parser/pmm/index.js";
import type { PmmParsedManifest } from "../../src/parser/pmm/index.js";
import { FallbackCore } from "../../src/parser/wasm/FallbackCore.js";

const fixturePmmPath = resolve(
  "native/third_party/mmd-anim/crates/mmd-anim-format/fixtures/pmm/ik_multi_bone_from_pmx_vmd.pmm"
);

describe("parsePmmDocument", () => {
  it("routes PMM bytes through parseMmdFormatJson on MmdAnimBackedCore", () => {
    const stubManifest: Partial<PmmParsedManifest> = {
      signature: "Polygon Movie maker",
      version: "0002",
      byteLength: 1024,
      modelPaths: ["UserFile/model/test.pmx"],
      accessoryPaths: [],
      motionPaths: [],
      audioPaths: [],
      imagePaths: [],
      videoPaths: [],
      diagnostics: []
    };
    const parseMmdFormatJson = vi.fn(() => JSON.stringify(stubManifest));
    const core = new MmdAnimBackedCore({
      parseMmdFormatJson,
      wasm_wrapper_version: () => 7
    });

    const result = parsePmmDocument(new Uint8Array([0x50]), core);

    expect(parseMmdFormatJson).toHaveBeenCalledOnce();
    expect(result.signature).toBe("Polygon Movie maker");
    expect(result.version).toBe("0002");
    expect(result.modelPaths).toEqual(["UserFile/model/test.pmx"]);
  });

  it("throws when core lacks WASM PMM support", () => {
    const core = new FallbackCore();
    expect(() => parsePmmDocument(new Uint8Array([0x50]), core)).toThrow(
      /WASM core/
    );
  });

  it("throws when parseMmdFormatJson export is missing", () => {
    const core = new MmdAnimBackedCore({
      wasm_wrapper_version: () => 7
    });
    expect(() => parsePmmDocument(new Uint8Array([0x50]), core)).toThrow(
      /parseMmdFormatJson/
    );
  });

  it("parses the ik_multi_bone fixture PMM with full WASM core", async () => {
    const core = await initCore();
    const bytes = await readFile(fixturePmmPath);
    const result = parsePmmDocument(bytes, core);

    expect(result.signature).toBe("Polygon Movie maker");
    expect(typeof result.version).toBe("string");
    expect(result.byteLength).toBe(bytes.byteLength);

    expect(result.modelPaths.length).toBeGreaterThan(0);
    expect(Array.isArray(result.assetReferences)).toBe(true);
    expect(Array.isArray(result.diagnostics)).toBe(true);

    expect(result.timeline).toBeDefined();
    expect(result.projectSettings).toBeDefined();
    expect(result.displayState).toBeDefined();
  });

  it("exposes document summary with per-model structure", async () => {
    const core = await initCore();
    const bytes = await readFile(fixturePmmPath);
    const result = parsePmmDocument(bytes, core);

    if (result.documentSummary) {
      expect(result.documentSummary.models.length).toBeGreaterThan(0);
      const model = result.documentSummary.models[0]!;
      expect(typeof model.name).toBe("string");
      expect(typeof model.path).toBe("string");
      expect(typeof model.boneCount).toBe("number");
      expect(typeof model.morphCount).toBe("number");
      expect(typeof model.visible).toBe("boolean");
    }
  });

  it("exposes project graph with scene settings when available", async () => {
    const core = await initCore();
    const bytes = await readFile(fixturePmmPath);
    const result = parsePmmDocument(bytes, core);

    if (result.projectGraph) {
      const settings = result.projectGraph.sceneSettings;
      expect(typeof settings.preferredFps).toBe("number");
      expect(typeof settings.loopEnabled).toBe("boolean");
      expect(typeof settings.audioEnabled).toBe("boolean");
      expect(typeof settings.audioPath).toBe("string");
      expect(typeof settings.currentFrameIndex).toBe("number");

      expect(result.projectGraph.models.length).toBeGreaterThan(0);
      expect(result.projectGraph.global).toBeDefined();
      expect(result.projectGraph.global.camera).toBeDefined();
    }
  });
});
