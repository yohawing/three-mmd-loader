import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("browser runtime worker benchmark source", () => {
  it("keeps browser Long Tasks and worker metric gates explicit", async () => {
    const source = await readFile("scripts/bench-runtime-worker-browser.mjs", "utf8");
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["bench:runtime:worker:browser"]).toBe(
      "node scripts/bench-runtime-worker-browser.mjs"
    );
    expect(source).toContain("PerformanceObserver");
    expect(source).toContain('type: "longtask"');
    expect(source).toContain("longTaskCount");
    expect(source).toContain('const physicsEnabled = config.physics !== "none"');
    expect(source).toContain("models[index].update(seconds, { physics: physicsEnabled })");
    expect(source).toContain("requestAnimationFrame(resolvePromise)");
    expect(source).toContain("frame / config.displayRate");
    expect(source).toContain('{ kind: "custom-bullet-mmd" }');
    expect(source).toContain("poseAgeFrames()");
    expect(source).toContain("updateP95GateMs: UPDATE_P95_GATE_MS");
    expect(source).toContain("poseAgeP95GateFrames: POSE_AGE_P95_GATE_FRAMES");
    expect(source).toContain("fallbackCount");
    expect(source).toContain("fallbackErrors");
    expect(source).toContain("At least one runtime-worker fixture case is required");
    expect(source).toContain('characters.push({ role: "secondary", ...fixtureCase.secondary })');
    expect(source).toContain("runtimeFactory.dispose()");
  });

  it("provides an opt-in COOP/COEP path for cross-origin isolation", async () => {
    const source = await readFile("scripts/bench-runtime-worker-browser.mjs", "utf8");

    expect(source).toContain("--coop-coep");
    expect(source).toContain("Cross-Origin-Opener-Policy");
    expect(source).toContain("Cross-Origin-Embedder-Policy");
    expect(source).toContain("crossOriginIsolated");
    expect(source).toContain('sharedMemory: "auto"');
    expect(source).toContain("sharedMemoryEnabled");
    expect(source).toContain("resolve(dirname(fixturesPath), fixtures.basePath)");
    expect(source).toContain('extension === ".js" || extension === ".mjs"');
  });
});
