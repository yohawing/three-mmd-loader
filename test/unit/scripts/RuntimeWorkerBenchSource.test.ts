import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("runtime worker benchmark source", () => {
  it("keeps the repeatable worker matrix and gate contract explicit", async () => {
    const source = await readFile("scripts/bench-runtime-worker.mjs", "utf8");
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["bench:runtime:worker"]).toBe(
      "node scripts/bench-runtime-worker.mjs"
    );
    expect(source).toContain('new Worker(defaultWorkerUrl, {');
    expect(source).toContain('type: "module"');
    expect(source).toContain("execArgv: []");
    expect(source).toContain("createWorkerMmdRuntimeFactory");
    expect(source).toContain('physics: "external"');
    expect(source).toContain('{ kind: "custom-bullet-mmd" }');
    expect(source).toContain("parsedCases[characterIndex % parsedCases.length]");
    expect(source).toContain('characters.push({ role: "secondary", ...fixtureCase.secondary })');
    expect(source).toContain("poseAgeFrames()");
    expect(source).toContain("runtime.frameState().seconds");
    expect(source).toContain("model.update(seconds, { physics: true })");
    expect(source).toContain("const displayIntervalMs = 1_000 / args.displayRate");
    expect(source).toContain("nextDisplayAt - performance.now()");
    expect(source).toContain("wallTimeMs");
    expect(source).toContain("fallbackCount");
    expect(source).toContain("longTaskProxyCount");
    expect(source).toContain("passingPoolSizes");
    expect(source).toContain("saturatedMatrices");
    expect(source).toContain("gate.operational");
    expect(source).toContain("gate.realtime");
    expect(source).toContain("LONG_TASK_PROXY_THRESHOLD_MS = 50");
    expect(source).toContain("browser Long Tasks API");
    expect(source).toContain("disposeMmdModel(model");
    expect(source).toContain("factory.dispose()");
    expect(source).toContain("process.exitCode = 1");
  });

  it("documents the requested default matrix in the usage text", async () => {
    const source = await readFile("scripts/bench-runtime-worker.mjs", "utf8");

    expect(source).toContain("--character-counts 1,4,8");
    expect(source).toContain("--pool-sizes 1,2,3,4");
    expect(source).toContain("--warmup 30");
    expect(source).toContain("--frames 120");
    expect(source).toContain("--display-rate 60");
  });
});
