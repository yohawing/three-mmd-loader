import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { MmdAnimBackedCore } from "../../src/parser/wasm/MmdAnimBackedCore.js";
import { initCore } from "../../src/parser/wasm/index.js";
import { parseAccessory } from "../../src/parser/accessory/index.js";
import type { AccessoryParsedManifest } from "../../src/parser/accessory/index.js";
import { FallbackCore } from "../../src/parser/wasm/FallbackCore.js";

const fixtureXPath = resolve("test/fixtures/test_quad_accessory.x");
const fixtureVacPath = resolve("test/fixtures/test_quad_accessory.vac");

describe("parseAccessory", () => {
  it("routes bytes through parseMmdFormatJson on MmdAnimBackedCore", () => {
    const stubManifest: Partial<AccessoryParsedManifest> = {
      format: "x",
      byteLength: 256,
      text: true,
      header: "xof 0303txt 0032",
      meshCount: 1,
      materialCount: 1,
      meshSummaries: [],
      materials: [],
      textureReferences: [],
      diagnostics: []
    };
    const parseMmdFormatJson = vi.fn(() => JSON.stringify(stubManifest));
    const core = new MmdAnimBackedCore({
      parseMmdFormatJson,
      wasm_wrapper_version: () => 7
    });

    const result = parseAccessory(new Uint8Array([0x78]), core, "test.x");

    expect(parseMmdFormatJson).toHaveBeenCalledOnce();
    expect(result.format).toBe("x");
    expect(result.text).toBe(true);
    expect(result.meshCount).toBe(1);
  });

  it("throws when core lacks WASM support", () => {
    const core = new FallbackCore();
    expect(() => parseAccessory(new Uint8Array([0x78]), core)).toThrow(/WASM core/);
  });

  it("rejects a non-object root from the WASM JSON response", () => {
    const core = new MmdAnimBackedCore({
      parseMmdFormatJson: vi.fn(() => "null"),
      wasm_wrapper_version: () => 7
    });

    expect(() => parseAccessory(new Uint8Array([0x78]), core, "test.x")).toThrow(
      /WASM JSON response must be an object/
    );
  });

  it("parses .x fixture with full WASM core", async () => {
    const core = await initCore();
    const bytes = await readFile(fixtureXPath);
    const result = parseAccessory(bytes, core, "test_quad_accessory.x");

    expect(result.format).toBe("x");
    expect(result.text).toBe(true);
    expect(result.header).toMatch(/^xof/);
    expect(result.meshCount).toBeGreaterThanOrEqual(1);
    expect(result.vacSettings).toBeNull();

    const mesh = result.meshSummaries[0]!;
    expect(mesh.vertexCount).toBe(4);
    expect(mesh.faceCount).toBe(2);
    expect(mesh.positions).toHaveLength(4);
    expect(mesh.normals).toHaveLength(4);
    expect(mesh.textureCoordinates).toHaveLength(4);

    expect(result.materialCount).toBeGreaterThanOrEqual(1);
    const material = result.materials[0]!;
    expect(material.faceColor).toBeDefined();
    expect(material.power).toBeDefined();
    expect(material.name).toBeNull();
  });

  it("parses .vac fixture with placement settings", async () => {
    const core = await initCore();
    const bytes = await readFile(fixtureVacPath);
    const result = parseAccessory(bytes, core, "test_quad_accessory.vac");

    expect(result.format).toBe("vac");
    expect(result.vacSettings).toBeDefined();

    const vac = result.vacSettings!;
    expect(vac.xFile).toBe("test_quad_accessory.x");
    expect(vac.scale).toBeCloseTo(1.5);
    expect(vac.position).toBeDefined();
    expect(vac.position![1]).toBeCloseTo(-1.0);
    expect(vac.rotation).toBeDefined();
    expect(vac.rotation![0]).toBeCloseTo(90.0);
    expect(vac.attachmentTarget).toBe("center");
  });
});
