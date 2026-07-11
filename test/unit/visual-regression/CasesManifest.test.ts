import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const realModelsManifestPath = path.resolve("scripts/visual-regression/real-models.manifest.json");
const generatedPmxManifestPath = path.resolve("scripts/visual-regression/generated-pmx.manifest.json");
const cameraLightVmdManifestPath = path.resolve("scripts/visual-regression/camera-light-vmd.manifest.json");
const skinningManifestPath = path.resolve("scripts/visual-regression/skinning.manifest.json");
const selfShadowManifestPath = path.resolve("scripts/visual-regression/self-shadow.manifest.json");
const packageJsonPath = path.resolve("package.json");

interface RealModelVisualCase {
  name: string;
  model: string;
  motion?: string;
  timeSeconds?: number;
  camera: "front-fit" | "viewer-fit" | {
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

function readRealModelsManifest(): RealModelVisualManifest {
  return JSON.parse(readFileSync(realModelsManifestPath, "utf8")) as RealModelVisualManifest;
}

function readGeneratedPmxManifest(): RealModelVisualManifest {
  return JSON.parse(readFileSync(generatedPmxManifestPath, "utf8")) as RealModelVisualManifest;
}

interface CameraLightVmdVisualCase extends RealModelVisualCase {
  cameraVmd?: string;
  lightVmd?: string;
}

interface CameraLightVmdVisualManifest extends Omit<RealModelVisualManifest, "cases"> {
  cases: CameraLightVmdVisualCase[];
}

function readCameraLightVmdManifest(): CameraLightVmdVisualManifest {
  return JSON.parse(readFileSync(cameraLightVmdManifestPath, "utf8")) as CameraLightVmdVisualManifest;
}

interface SelfShadowVisualManifest extends RealModelVisualManifest {
  comparisons: Array<{
    name: string;
    shadowOn: string;
    shadowOff: string;
    receiverRoi: { x: number; y: number; width: number; height: number };
    thresholds: {
      receiverMeanDarkeningMin: number;
      receiverP95DarkeningMin: number;
      receiverMeanAbsDeltaMin?: number;
      receiverP95AbsDeltaMin?: number;
      shadowPixelRatioMin: number;
      shadowOnMeanLuminanceMin?: number;
      shadowOnP05LuminanceMin?: number;
      outsideRoiMeanDeltaMax: number;
    };
  }>;
}

function readSelfShadowManifest(): SelfShadowVisualManifest {
  return JSON.parse(readFileSync(selfShadowManifestPath, "utf8")) as SelfShadowVisualManifest;
}

function readPackageJson(): { scripts: Record<string, string> } {
  return JSON.parse(readFileSync(packageJsonPath, "utf8")) as { scripts: Record<string, string> };
}

describe("visual regression cases manifest", () => {
  it("removes the synthetic shaderball profile from npm entrypoints", () => {
    const scripts = readPackageJson().scripts;
    const serializedScripts = JSON.stringify(scripts);

    expect(serializedScripts).not.toContain("render-cases.mjs");
    expect(serializedScripts).not.toContain("shaderball");
    expect(scripts["visual:smoke:generated-pmx"]).toContain("render:visual:generated-pmx");
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

  it("includes generated replacements for the removed shaderball coverage", () => {
    const manifest = readGeneratedPmxManifest();
    const names = manifest.cases.map(visualCase => visualCase.name);

    expect(names).toEqual(expect.arrayContaining([
      "mmd-diffuse-lit-box",
      "mmd-toon-ramp-lit-box",
      "mmd-alpha-blend-overlap",
      "mmd-texture-uv-orientation-plane",
      "mmd-sphere-texture-multiply",
      "mmd-sphere-texture-add",
      "mmd-material-order-body-outline-interleave",
      "mmd-outline-normal-silhouette",
      "mmd-texture-alpha-used-uv-cutout",
      "mmd-png-hair-shadow-alpha-morph-blend",
      "mmd-tga-regular-hair-alpha-opaque",
      "mmd-tga-hair-shadow-overlay-alpha-blend"
    ]));
  });

  it("keeps generated PMX cases portable and explicit", () => {
    const manifest = readGeneratedPmxManifest();
    const names = new Set<string>();

    expect(manifest.render.resolution).toEqual({ width: 1024, height: 1024 });
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

describe("self-shadow visual regression manifest", () => {
  it("defines paired cases that fail no-op and object-level-only self-shadow implementations", () => {
    const manifest = readSelfShadowManifest();
    const names = manifest.cases.map(visualCase => visualCase.name);

    expect(manifest.note).toContain("no-op");
    expect(manifest.render.resolution).toEqual({ width: 512, height: 512 });
    expect(manifest.render.pixelRatio).toBe(1);
    expect((manifest.render as unknown as { shadow?: { enabled?: boolean } }).shadow?.enabled).toBe(true);
    expect(names).toEqual(expect.arrayContaining([
      "mmd-self-shadow-body-on",
      "mmd-self-shadow-body-caster-off",
      "mmd-self-shadow-body-midband-black-toon-on",
      "mmd-self-shadow-body-midband-black-toon-caster-off",
      "mmd-self-shadow-body-vmd-off",
      "mmd-self-shadow-body-vmd-on",
      "mmd-self-shadow-on",
      "mmd-self-shadow-caster-flag-off-mixed",
      "mmd-self-shadow-receiver-flag-off-mixed",
      "mmd-self-shadow-vmd-off",
      "mmd-self-shadow-vmd-on",
      "mmd-self-shadow-sdef-depth"
    ]));
  });

  it("keeps self-shadow comparisons explicit and measurable", () => {
    const manifest = readSelfShadowManifest();
    const names = new Set(manifest.cases.map(visualCase => visualCase.name));

    expect(manifest.comparisons.length).toBeGreaterThanOrEqual(3);
    for (const comparison of manifest.comparisons) {
      expect(comparison.name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(names.has(comparison.shadowOn)).toBe(true);
      expect(names.has(comparison.shadowOff)).toBe(true);
      expect(comparison.shadowOn).not.toBe(comparison.shadowOff);
      expect(comparison.receiverRoi.width).toBeGreaterThan(0);
      expect(comparison.receiverRoi.height).toBeGreaterThan(0);
      expect(comparison.thresholds.receiverMeanDarkeningMin).toBeGreaterThanOrEqual(0);
      expect(comparison.thresholds.receiverP95DarkeningMin).toBeGreaterThanOrEqual(
        comparison.thresholds.receiverMeanDarkeningMin
      );
      if (comparison.thresholds.receiverMeanAbsDeltaMin !== undefined) {
        expect(comparison.thresholds.receiverMeanAbsDeltaMin).toBeGreaterThanOrEqual(0);
      }
      if (comparison.thresholds.receiverP95AbsDeltaMin !== undefined) {
        expect(comparison.thresholds.receiverP95AbsDeltaMin).toBeGreaterThanOrEqual(
          comparison.thresholds.receiverMeanAbsDeltaMin ?? 0
        );
      }
      expect(
        comparison.thresholds.receiverMeanDarkeningMin > 0 ||
          (comparison.thresholds.receiverMeanAbsDeltaMin ?? 0) > 0 ||
          (comparison.thresholds.shadowOnMeanLuminanceMin ?? 0) > 0
      ).toBe(true);
      expect(comparison.thresholds.shadowPixelRatioMin).toBeGreaterThanOrEqual(0);
      if (comparison.thresholds.shadowOnMeanLuminanceMin !== undefined) {
        expect(comparison.thresholds.shadowOnMeanLuminanceMin).toBeGreaterThan(0);
      }
      if (comparison.thresholds.shadowOnP05LuminanceMin !== undefined) {
        expect(comparison.thresholds.shadowOnP05LuminanceMin).toBeGreaterThan(0);
      }
      expect(comparison.thresholds.outsideRoiMeanDeltaMax).toBeGreaterThan(0);
    }
  });
});

describe("camera/light VMD visual regression manifest", () => {
  it("defines portable rendered-output coverage for camera and light VMD tracks", () => {
    const manifest = readCameraLightVmdManifest();
    const names = manifest.cases.map(visualCase => visualCase.name);

    expect(manifest.note).toContain("camera/light VMD");
    expect(manifest.render.resolution).toEqual({ width: 1024, height: 1024 });
    expect(manifest.render.pixelRatio).toBe(1);
    expect(names).toEqual(["camera-near", "camera-far", "light-front", "light-side"]);
    for (const visualCase of manifest.cases) {
      expect(visualCase.model).toMatch(/^test\/fixtures\/generated\/visual\/.+\.pmx$/);
      expect(path.isAbsolute(visualCase.model)).toBe(false);
      expect(visualCase.motion).toBeUndefined();
      expect(visualCase.timeSeconds ?? 0).toBe(0);
      expect(visualCase.camera).not.toBe("front-fit");
      expect(visualCase.thresholds?.mean).toBeGreaterThan(0);
      expect(visualCase.thresholds?.p95).toBeGreaterThan(visualCase.thresholds?.mean ?? 0);
    }
    expect(manifest.cases.filter(visualCase => visualCase.cameraVmd !== undefined)).toHaveLength(2);
    const lightCases = manifest.cases.filter(visualCase => visualCase.lightVmd !== undefined);
    expect(lightCases).toHaveLength(2);
    for (const visualCase of lightCases) {
      expect(visualCase.model).toBe("test/fixtures/generated/visual/mmd-toon-ramp-lit-box.pmx");
      expect(visualCase.thresholds?.p95).toBeCloseTo(0.22);
    }
  });
});

interface ThresholdAuditCase {
  name: string;
  thresholds?: { mean?: number; p95?: number };
  toleranceNote?: string;
}

function readThresholdAuditManifest(manifestPath: string): { cases: ThresholdAuditCase[] } {
  return JSON.parse(readFileSync(manifestPath, "utf8")) as { cases: ThresholdAuditCase[] };
}

describe("visual regression threshold audit", () => {
  const auditProfiles = [
    { name: "generated-pmx", path: generatedPmxManifestPath },
    { name: "camera-light-vmd", path: cameraLightVmdManifestPath },
    { name: "skinning", path: skinningManifestPath },
    { name: "self-shadow", path: selfShadowManifestPath }
  ];

  it("requires every rendered case to have explicit thresholds", () => {
    for (const profile of auditProfiles) {
      const manifest = readThresholdAuditManifest(profile.path);
      for (const visualCase of manifest.cases) {
        const thresholds = visualCase.thresholds;
        expect(thresholds, `${profile.name}/${visualCase.name} missing thresholds`).toBeDefined();
        expect(thresholds?.mean, `${profile.name}/${visualCase.name} missing mean`).toBeGreaterThan(0);
        expect(thresholds?.p95, `${profile.name}/${visualCase.name} missing p95`).toBeGreaterThan(0);
      }
    }
  });

  it("keeps p95 strictly greater than mean for all cases", () => {
    for (const profile of auditProfiles) {
      const manifest = readThresholdAuditManifest(profile.path);
      for (const visualCase of manifest.cases) {
        if (visualCase.thresholds?.mean !== undefined && visualCase.thresholds?.p95 !== undefined) {
          expect(
            visualCase.thresholds.p95,
            `${profile.name}/${visualCase.name}: p95 (${visualCase.thresholds.p95}) must be > mean (${visualCase.thresholds.mean})`
          ).toBeGreaterThan(visualCase.thresholds.mean);
        }
      }
    }
  });

  it("requires a toleranceNote when p95 exceeds 0.25", () => {
    for (const profile of auditProfiles) {
      const manifest = readThresholdAuditManifest(profile.path);
      for (const visualCase of manifest.cases) {
        const p95 = visualCase.thresholds?.p95 ?? 0;
        if (p95 > 0.25) {
          expect(
            visualCase.toleranceNote,
            `${profile.name}/${visualCase.name}: p95=${p95} exceeds 0.25 without a toleranceNote`
          ).toBeTruthy();
        }
      }
    }
  });

  it("caps p95 at 0.5 to prevent regression-masking blanket thresholds", () => {
    for (const profile of auditProfiles) {
      const manifest = readThresholdAuditManifest(profile.path);
      for (const visualCase of manifest.cases) {
        expect(
          visualCase.thresholds?.p95 ?? 0,
          `${profile.name}/${visualCase.name}: p95=${visualCase.thresholds?.p95} exceeds 0.5 cap`
        ).toBeLessThanOrEqual(0.5);
      }
    }
  });
});

describe("visual regression smoke scripts", () => {
  it("exposes generated PMX, camera/light VMD, and self-shadow smoke entrypoints", () => {
    const scripts = readPackageJson().scripts;

    expect(scripts["visual:smoke"]).toBeUndefined();
    expect(scripts["visual:smoke:flip"]).toBeUndefined();
    expect(scripts["visual:report"]).toBeUndefined();
    expect(scripts["visual:report:flip"]).toBeUndefined();
    expect(scripts["visual:smoke:generated-pmx"]).toContain("visual:report:generated-pmx");
    expect(scripts["visual:smoke:camera-light-vmd"]).toContain("visual:report:camera-light-vmd");
    expect(scripts["render:visual:camera-light-vmd"]).toContain("camera-light-vmd.manifest.json");
    expect(scripts["visual:smoke:generated-pmx:flip"]).toContain("visual:report:generated-pmx:flip");
    expect(scripts["visual:report:generated-pmx:flip"]).toContain("--metric flip");
    expect(scripts["visual:smoke:self-shadow"]).toContain("visual:report:self-shadow");
    expect(scripts["visual:report:self-shadow"]).toContain("compute-shadow-metrics.mjs");
    expect(scripts["render:visual:self-shadow:local"]).toContain("render-local-self-shadow-pair.mjs");
  });
});
