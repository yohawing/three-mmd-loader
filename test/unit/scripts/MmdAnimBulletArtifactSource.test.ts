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

    expect(buildSource).toContain('join(root, "native", "mmd-anim-bullet", "dist")');
    expect(copySource).toContain('join(root, "native", "mmd-anim-bullet", "dist")');
    expect(copySource).not.toContain('"third_party", "mmd-anim", "target"');
    for (const name of [
      "mmd_bullet.js",
      "mmd_bullet.wasm",
      "mmd_bullet.worker.mjs",
      "mmd_bullet.worker.wasm"
    ]) {
      expect(ignoreSource).toContain(`!native/mmd-anim-bullet/dist/${name}`);
    }
  });
});
