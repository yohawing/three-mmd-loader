import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const manifestPath = path.resolve("scripts/visual-regression/cases.manifest.json");
const realModelsManifestPath = path.resolve("scripts/visual-regression/real-models.manifest.json");
const generatedPmxManifestPath = path.resolve("scripts/visual-regression/generated-pmx.manifest.json");

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

interface RealModelVisualCase {
  name: string;
  model: string;
  motion?: string;
  timeSeconds?: number;
  camera: "front-fit" | {
    position: number[];
    target: number[];
    fov: number;
    near?: number;
    far?: number;
  };
  thresholds?: { mean?: number; p95?: number };
  watchBones?: string[];
  restPoseThresholdDegrees?: number;
}

interface RealModelVisualManifest {
  note: string;
  render: {
    resolution: { width: number; height: number };
    pixelRatio: number;
  };
  cases: RealModelVisualCase[];
}

function readManifest(): VisualManifest {
  return JSON.parse(readFileSync(manifestPath, "utf8")) as VisualManifest;
}

function readRealModelsManifest(): RealModelVisualManifest {
  return JSON.parse(readFileSync(realModelsManifestPath, "utf8")) as RealModelVisualManifest;
}

function readGeneratedPmxManifest(): RealModelVisualManifest {
  return JSON.parse(readFileSync(generatedPmxManifestPath, "utf8")) as RealModelVisualManifest;
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

describe("local real-model visual regression manifest", () => {
  it("documents a manual-only placeholder profile without committed asset paths", () => {
    const manifest = readRealModelsManifest();

    expect(manifest.note).toContain("Local manual");
    expect(manifest.note).toContain("MMD_DATA_ROOT");
    expect(manifest.render.resolution).toEqual({ width: 512, height: 512 });
    expect(manifest.render.pixelRatio).toBe(1);
    expect(manifest.cases.length).toBeGreaterThan(0);
  });

  it("keeps real-model cases portable and explicit", () => {
    const manifest = readRealModelsManifest();
    const names = new Set<string>();

    for (const visualCase of manifest.cases) {
      expect(visualCase.name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(names.has(visualCase.name)).toBe(false);
      names.add(visualCase.name);

      expect(visualCase.model).toMatch(/^pmx\/<your-model>\//);
      expect(path.isAbsolute(visualCase.model)).toBe(false);
      expect(visualCase.model).not.toContain("Tda");
      expect(visualCase.model).not.toContain("tda");
      if (visualCase.motion !== undefined) {
        expect(visualCase.motion).toMatch(/^vmd\/<your-motion>\//);
        expect(path.isAbsolute(visualCase.motion)).toBe(false);
        expect(visualCase.motion).not.toContain("Tda");
        expect(visualCase.motion).not.toContain("tda");
      }
      expect(visualCase.timeSeconds ?? 0).toBeGreaterThanOrEqual(0);
      expect(visualCase.camera).toBe("front-fit");
      if (visualCase.watchBones !== undefined) {
        expect(visualCase.watchBones.length).toBeGreaterThan(0);
        expect(visualCase.watchBones).toContain("腰");
      }
      if (visualCase.restPoseThresholdDegrees !== undefined) {
        expect(visualCase.restPoseThresholdDegrees).toBeGreaterThan(0);
      }
    }
  });
});

describe("generated PMX visual regression manifest", () => {
  it("includes the inactive alpha material morph case", () => {
    const manifest = readGeneratedPmxManifest();
    const names = manifest.cases.map(visualCase => visualCase.name);

    expect(names).toContain("mmd-material-morph-alpha-opaque-depth");
  });

  it("keeps generated PMX cases portable and explicit", () => {
    const manifest = readGeneratedPmxManifest();
    const names = new Set<string>();

    expect(manifest.render.resolution).toEqual({ width: 512, height: 512 });
    expect(manifest.render.pixelRatio).toBe(1);
    for (const visualCase of manifest.cases) {
      expect(visualCase.name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(names.has(visualCase.name)).toBe(false);
      names.add(visualCase.name);
      expect(visualCase.model).toMatch(/^test\/fixtures\/generated\/visual\/.+\.pmx$/);
      expect(path.isAbsolute(visualCase.model)).toBe(false);
      expect(visualCase.motion).toBeUndefined();
      expect(visualCase.timeSeconds ?? 0).toBe(0);
      expect(visualCase.camera).not.toBe("front-fit");
      expect(visualCase.thresholds?.mean).toBeGreaterThan(0);
      expect(visualCase.thresholds?.p95).toBeGreaterThan(visualCase.thresholds?.mean ?? 0);
    }
  });
});
