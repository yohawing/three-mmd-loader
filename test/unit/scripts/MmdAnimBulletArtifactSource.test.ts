import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("mmd-anim Bullet executable paths", () => {
  it("keeps the existing Bullet MMD artifact and worker API names", () => {
    const artifactPaths = ["scripts/smoke-bullet-mmd.mjs"];
    if (existsSync(resolve("scripts/build-deploy.mjs"))) {
      artifactPaths.push("scripts/build-deploy.mjs");
    }
    for (const path of artifactPaths) {
      const source = readFileSync(resolve(path), "utf8");
      expect(source).toContain("mmd_bullet");
    }
    const workerPaths = [
      "scripts/bench-runtime-worker.mjs",
      "scripts/bench-runtime-worker-browser.mjs"
    ];
    for (const path of workerPaths) {
      const source = readFileSync(resolve(path), "utf8");
      expect(source).toContain('kind: "custom-bullet-mmd"');
    }
  });

  it("builds mmd-anim Bullet behind the stable artifact names", () => {
    const buildSource = readFileSync(resolve("scripts/build-bullet-mmd-wasm.mjs"), "utf8");
    const copySource = readFileSync(resolve("scripts/copy-bullet-mmd.mjs"), "utf8");
    const ignoreSource = readFileSync(resolve(".gitignore"), "utf8");

    expect(buildSource).toContain('join(root, "artifacts", "mmd-anim", "bullet")');
    expect(copySource).toContain('join(root, "artifacts", "mmd-anim", "bullet")');
    expect(copySource).not.toContain('"third_party", "mmd-anim", "target"');
    expect(ignoreSource).toContain("artifacts/mmd-anim/");
  });

  it("exports the version, last-error, gravity, and all header ABI functions", () => {
    const buildSource = readFileSync(resolve("scripts/build-bullet-mmd-wasm.mjs"), "utf8");
    const typeSource = readFileSync(resolve("src/physics/mmdAnimBullet.ts"), "utf8");
    for (const name of [
      "mmd_anim_bullet_get_version",
      "mmd_anim_bullet_get_last_error",
      "mmd_anim_bullet_world_get_gravity",
      "mmd_anim_bullet_world_set_gravity"
    ]) {
      expect(buildSource).toContain(`_${name}`);
      expect(typeSource).toContain(`_${name}`);
    }
    expect(readFileSync(resolve("scripts/check-mmd-anim-artifacts.mjs"), "utf8"))
      .toContain("MMD_ANIM_BULLET_API");
  });

  it("runs the live module-worker artifact through the ABI smoke", () => {
    const smokeSource = readFileSync(resolve("scripts/smoke-bullet-mmd.mjs"), "utf8");
    expect(smokeSource).toContain("pathToFileURL");
    expect(smokeSource).toContain('"mmd_bullet.worker.mjs"');
    expect(smokeSource).toContain('verifyRawAbi(workerBulletModule, "module-worker")');
  });
});
