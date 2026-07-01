import { describe, expect, it } from "vitest";

import { parsePmx } from "../../src/parser/model/PmxModelParser.js";
import { initCore } from "../../src/parser/wasm/index.js";
import { createMinimalSdefPmx } from "../helpers/minimalPmx.js";

describe("@yw-mmd/core-wasm PMX parser parity", () => {
  it("matches TS parser SDEF geometry while pinning the SDEF diagnostic gap", async () => {
    const bytes = createMinimalSdefPmx();
    const parsed = parsePmx(bytes);
    const core = await initCore();
    const wasmModel = core.loadModel(bytes, { format: "pmx" });
    const wasmGeometry = wasmModel.geometry();

    expect(parsed.geometry.sdef).toBeDefined();
    expect(wasmGeometry.sdef).toBeDefined();
    expect(Array.from(wasmGeometry.sdef!.enabled)).toEqual(
      Array.from(parsed.geometry.sdef!.enabled)
    );
    expectArrayCloseTo(wasmGeometry.sdef!.c, parsed.geometry.sdef!.c);
    expectArrayCloseTo(wasmGeometry.sdef!.r0, parsed.geometry.sdef!.r0);
    expectArrayCloseTo(wasmGeometry.sdef!.r1, parsed.geometry.sdef!.r1);
    expectArrayCloseTo(wasmGeometry.sdef!.rw0, parsed.geometry.sdef!.rw0);
    expectArrayCloseTo(wasmGeometry.sdef!.rw1, parsed.geometry.sdef!.rw1);

    expect(hasDiagnostic(parsed.metadata.diagnostics, "SDEF_SKINNING_FALLBACK")).toBe(true);
    expect(hasDiagnostic(wasmModel.metadata().diagnostics, "SDEF_SKINNING_FALLBACK")).toBe(
      false
    );
  });

  it("matches TS parser flip morph structure on the wasm-backed path", async () => {
    const bytes = createMinimalSdefPmx({ version: 2.1, flipMorphFixture: true });
    const parsed = parsePmx(bytes);
    const core = await initCore();
    const wasmModel = core.loadModel(bytes, { format: "pmx" });
    const wasmMorphs = wasmModel.morphs();

    expect(wasmMorphs).toHaveLength(parsed.morphs.length);
    expect(wasmMorphs[0]).toMatchObject({
      name: parsed.morphs[0]!.name,
      type: "vertex",
      vertexOffsets: parsed.morphs[0]!.vertexOffsets
    });
    expect(wasmMorphs[1]).toMatchObject({
      name: parsed.morphs[1]!.name,
      type: "flip",
      flipOffsets: parsed.morphs[1]!.flipOffsets
    });
    expect(hasDiagnostic(parsed.metadata.diagnostics, "MORPH_TYPE_UNSUPPORTED")).toBe(false);
    expect(hasDiagnostic(wasmModel.metadata().diagnostics, "MORPH_TYPE_UNSUPPORTED")).toBe(
      false
    );
  });

  it("matches TS parser material flags while pinning unsupported-flag diagnostics gap", async () => {
    const bytes = createMinimalSdefPmx({ materialFlagBits: 0xe0 });
    const parsed = parsePmx(bytes);
    const core = await initCore();
    const wasmModel = core.loadModel(bytes, { format: "pmx" });

    expect(wasmModel.materials()[0]?.flags).toMatchObject({
      vertexColor: parsed.materials[0]?.flags.vertexColor,
      pointDraw: parsed.materials[0]?.flags.pointDraw,
      lineDraw: parsed.materials[0]?.flags.lineDraw
    });
    expect(hasDiagnostic(parsed.metadata.diagnostics, "MATERIAL_DRAW_FLAG_UNSUPPORTED")).toBe(
      true
    );
    expect(
      hasDiagnostic(wasmModel.metadata().diagnostics, "MATERIAL_DRAW_FLAG_UNSUPPORTED")
    ).toBe(false);
  });
});

function hasDiagnostic(diagnostics: readonly { code: string }[], code: string): boolean {
  return diagnostics.some((diagnostic) => diagnostic.code === code);
}

function expectArrayCloseTo(actual: ArrayLike<number>, expected: ArrayLike<number>): void {
  expect(actual).toHaveLength(expected.length);
  for (let i = 0; i < expected.length; i++) {
    expect(actual[i]).toBeCloseTo(expected[i]);
  }
}
