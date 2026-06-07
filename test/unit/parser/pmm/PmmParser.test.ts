import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createPmmScenePlan,
  createPmmStaticPreviewPlan,
  parsePmmManifest,
  resolvePmmAssetPath
} from "../../../../src/parser/index.js";

const bundledPmmFixtureRoot = existingOptionalPath(process.env.THREE_MMD_PMM_USER_FILE_ROOT);
const localUserFileRoot = "test-user-file-root";
const bundledPmmIt =
  bundledPmmFixtureRoot && existsSync(bundledPmmPath("サンプル（きしめん).pmm")) ? it : it.skip;
const bundledAllStarPmmIt =
  bundledPmmFixtureRoot && existsSync(bundledPmmPath("サンプル（きしめんAllStar).pmm"))
    ? it
    : it.skip;
const bundledCameraPmmIt =
  bundledPmmFixtureRoot && existsSync(bundledPmmPath("サンプル（カメラ追従).pmm"))
    ? it
    : it.skip;

describe("PMM manifest parser", () => {
  bundledPmmIt("extracts referenced assets from the bundled kishimen PMM sample", async () => {
    const manifest = parsePmmManifest(await readFile(bundledPmmPath("サンプル（きしめん).pmm")));

    expect(manifest).toMatchObject({
      signature: "Polygon Movie maker",
      version: "0001"
    });
    expect(manifest.modelPaths.map(fileName)).toEqual(["ダミーボーン.pmd", "初音ミクmetal.pmd"]);
    expect(manifest.accessoryPaths.map(fileName)).toEqual([
      "stage01.x",
      "light03_r.x",
      "light03_b.x",
      "floorlight01.x",
      "light01_b.x",
      "light01_r.x",
      "light02_b.x",
      "light02_r.x",
      "light02_y.x",
      "laser01.x"
    ]);
    expect(manifest.audioPaths.map(fileName)).toEqual(["きしめん.wav"]);
    expect(manifest.motionPaths).toEqual([]);
    expect(manifest.assetReferences.every((reference) => reference.offset >= 0)).toBe(true);
  });

  bundledAllStarPmmIt("extracts all-star PMM model and VAC accessory references without short path fragments", async () => {
    const manifest = parsePmmManifest(
      await readFile(bundledPmmPath("サンプル（きしめんAllStar).pmm"))
    );
    const modelFileNames = manifest.modelPaths.map(fileName);
    const accessoryFileNames = manifest.accessoryPaths.map(fileName);

    expect(modelFileNames).toEqual([
      "ダミーボーン.pmd",
      "初音ミク.pmd",
      "鏡音レン.pmd",
      "鏡音リン.pmd",
      "弱音ハク.pmd",
      "亞北ネル.pmd",
      "カイト.pmd",
      "咲音メイコ.pmd",
      "巡音ルカ.pmd",
      "MEIKO.pmd"
    ]);
    expect(accessoryFileNames).toContain("ネギ(右手).vac");
    expect(accessoryFileNames).toContain("stage01.x");
    expect(manifest.assetReferences.map((reference) => reference.normalizedPath)).not.toContain(
      "b.x"
    );
    expect(manifest.assetReferences.map((reference) => reference.normalizedPath)).not.toContain(
      "r.x"
    );
    expect(manifest.assetReferences.map((reference) => reference.normalizedPath)).not.toContain(
      "手).vac"
    );
  });

  it("rejects non-PMM bytes with a labeled error", () => {
    expect(() => parsePmmManifest(new TextEncoder().encode("not a pmm"))).toThrow(
      "PMM_HEADER_NOT_FOUND"
    );
  });

  bundledCameraPmmIt("creates a scene plan that resolves PMM UserFile assets into the local fixture tree", async () => {
    const manifest = parsePmmManifest(
      await readFile(bundledPmmPath("サンプル（カメラ追従).pmm"))
    );
    const existingPaths = [
      `${localUserFileRoot}/Model/初音ミク.pmd`,
      `${localUserFileRoot}/Accessory/stage01.x`,
      `${localUserFileRoot}/Accessory/ネギ(右手).vac`
    ];

    const plan = createPmmScenePlan(manifest, { userFileRoot: localUserFileRoot, existingPaths });

    expect(resolvePmmAssetPath("UserFile\\Model\\初音ミク.pmd", localUserFileRoot)).toBe(
      `${localUserFileRoot}/Model/初音ミク.pmd`
    );
    expect(
      plan.modelAssets.find((asset) => asset.reference.fileName === "初音ミク.pmd")
    ).toMatchObject({
      resolvedPath: `${localUserFileRoot}/Model/初音ミク.pmd`,
      exists: true
    });
    expect(
      plan.accessoryAssets.find((asset) => asset.reference.fileName === "stage01.x")
    ).toMatchObject({
      resolvedPath: `${localUserFileRoot}/Accessory/stage01.x`,
      exists: true
    });
    expect(
      plan.accessoryAssets.find((asset) => asset.reference.fileName === "ネギ(右手).vac")
    ).toMatchObject({
      resolvedPath: `${localUserFileRoot}/Accessory/ネギ(右手).vac`,
      exists: true
    });
    expect(plan.missingAssets.map((asset) => asset.reference.fileName)).toContain(
      "ダミーボーン.pmd"
    );
  });

  bundledPmmIt("creates a static PMM preview plan from existing model and accessory assets only", async () => {
    const manifest = parsePmmManifest(await readFile(bundledPmmPath("サンプル（きしめん).pmm")));
    const existingPaths = [
      `${localUserFileRoot}/Model/初音ミクmetal.pmd`,
      `${localUserFileRoot}/Accessory/stage01.x`,
      `${localUserFileRoot}/Accessory/light03_r.x`
    ];

    const previewPlan = createPmmStaticPreviewPlan(
      createPmmScenePlan(manifest, { userFileRoot: localUserFileRoot, existingPaths })
    );

    expect(previewPlan.primaryModel?.reference.fileName).toBe("初音ミクmetal.pmd");
    expect(previewPlan.modelAssets.map((asset) => asset.reference.fileName)).toEqual([
      "初音ミクmetal.pmd"
    ]);
    expect(previewPlan.accessoryAssets.map((asset) => asset.reference.fileName)).toEqual([
      "stage01.x",
      "light03_r.x"
    ]);
    expect(previewPlan.missingAssets.map((asset) => asset.reference.fileName)).toContain(
      "きしめん.wav"
    );
    expect(previewPlan.skippedAssets.map((asset) => asset.reference.fileName)).toContain(
      "きしめん.wav"
    );
  });

  bundledAllStarPmmIt("prefers a non-dummy model as the static PMM preview primary model", async () => {
    const manifest = parsePmmManifest(
      await readFile(bundledPmmPath("サンプル（きしめんAllStar).pmm"))
    );
    const plan = createPmmScenePlan(manifest, {
      userFileRoot: localUserFileRoot,
      existingPaths: manifest.assetReferences.map((reference) =>
        resolvePmmAssetPath(reference.normalizedPath, localUserFileRoot)
      )
    });

    const previewPlan = createPmmStaticPreviewPlan(plan);

    expect(previewPlan.modelAssets[0]?.reference.fileName).toBe("ダミーボーン.pmd");
    expect(previewPlan.primaryModel?.reference.fileName).toBe("初音ミク.pmd");
  });
});

function fileName(path: string): string {
  return path.split("/").pop() ?? path;
}

function bundledPmmPath(fileName: string): string {
  if (!bundledPmmFixtureRoot) {
    throw new Error("THREE_MMD_PMM_USER_FILE_ROOT is not configured");
  }
  return resolve(bundledPmmFixtureRoot, fileName);
}

function existingOptionalPath(path: string | undefined): string | undefined {
  if (!path) {
    return undefined;
  }
  const resolved = resolve(path);
  return existsSync(resolved) ? resolved : undefined;
}
