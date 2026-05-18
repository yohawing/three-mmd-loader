import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const manifestPath = path.resolve("scripts/visual-regression/cases.manifest.json");

interface VisualCase {
  id: string;
  features: string[];
  thresholds: { mean: number; p95: number };
  geometry: { kind: string };
  material: Record<string, unknown> & { kind: string };
  note: string;
}

interface VisualManifest {
  note: string;
  render: {
    resolution: { width: number; height: number };
    pixelRatio: number;
  };
  cases: VisualCase[];
}

function readManifest(): VisualManifest {
  return JSON.parse(readFileSync(manifestPath, "utf8")) as VisualManifest;
}

describe("visual regression cases manifest", () => {
  it("describes the baseline policy without visual equivalence claims", () => {
    const manifest = readManifest();

    expect(manifest.note).toContain("baseline");
    expect(manifest.note).toContain("regression detection only");
    expect(manifest.note).toContain("not proof");
    expect(JSON.stringify(manifest).toLowerCase()).not.toContain(["gol", "den"].join(""));
  });

  it("defines the expected MMD material visual cases", () => {
    const manifest = readManifest();
    const ids = manifest.cases.map(visualCase => visualCase.id);

    expect(manifest.render.resolution).toEqual({ width: 512, height: 512 });
    expect(manifest.render.pixelRatio).toBe(1);
    expect(ids).toEqual([
      "diffuse-sphere",
      "textured-sphere",
      "uv-orientation-plane",
      "toon-sphere",
      "sphere-multiply",
      "sphere-add",
      "alpha-cutout-plane",
      "alpha-blend-overlap",
      "render-order-overlap",
      "outline-sphere"
    ]);
  });

  it("keeps ids, feature coverage, geometry, material, and notes complete", () => {
    const manifest = readManifest();
    const ids = new Set<string>();
    const requiredFeatures = [
      "diffuse",
      "texture",
      "uv",
      "toon",
      "sphere-texture",
      "multiply",
      "add",
      "alpha-test",
      "blend",
      "outline",
      "render-order"
    ];

    for (const visualCase of manifest.cases) {
      expect(visualCase.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(ids.has(visualCase.id)).toBe(false);
      ids.add(visualCase.id);

      expect(visualCase.features.length).toBeGreaterThan(0);
      expect(visualCase.thresholds.mean).toBeGreaterThan(0);
      expect(visualCase.thresholds.p95).toBeGreaterThan(visualCase.thresholds.mean);
      expect(visualCase.geometry.kind).toMatch(/^(sphere|plane|overlap-planes|outline-sphere|shaderball)$/);
      expect(typeof visualCase.material.kind).toBe("string");
      expect(visualCase.note).toContain("regression detection only");
    }

    const featureCoverage = new Set(manifest.cases.flatMap(visualCase => visualCase.features));
    for (const feature of requiredFeatures) {
      expect(featureCoverage.has(feature)).toBe(true);
    }
  });
});
