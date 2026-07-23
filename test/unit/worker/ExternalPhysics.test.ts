import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createWorkerExternalPhysicsBackend,
  type CustomBulletWorkerPhysicsConfig
} from "../../../src/worker/externalPhysics.js";

describe("worker external physics", () => {
  it("keeps the build and copy scripts on a dual classic/module-worker artifact contract", () => {
    const buildSource = readFileSync(resolve("scripts/build-bullet-mmd-wasm.mjs"), "utf8");
    const copySource = readFileSync(resolve("scripts/copy-bullet-mmd.mjs"), "utf8");

    expect(buildSource).toContain('scriptName: "mmd_bullet.js"');
    expect(buildSource).toContain('scriptName: "mmd_bullet.worker.mjs"');
    expect(buildSource).toContain('extraArgs: ["-sEXPORT_ES6=1"]');
    expect(buildSource).toContain('environment: "web,worker,node"');
    expect(copySource).toContain('"mmd_bullet.worker.mjs"');
    expect(copySource).toContain("THREE_MMD_LOADER_BULLET_MMD_WORKER_MJS");
  });

  it("loads an ESM factory with an explicit wasm URL and leaves disposal to its caller", async () => {
    const moduleSource = `
      export default async function (options) {
        globalThis.__mmdWorkerLocateFile = options.locateFile("mmd_bullet.worker.wasm", "ignored/");
        return {
          HEAPF32: new Float32Array(16),
          _mmd_bullet_create_world: () => 7,
          _mmd_bullet_destroy_world: world => { globalThis.__mmdWorkerDisposedWorld = world; },
          _mmd_bullet_ensure_step_buffers: () => 0,
          _mmd_bullet_begin_model: () => 0,
          _mmd_bullet_add_rigid_body: () => 0,
          _mmd_bullet_add_joint: () => 0,
          _mmd_bullet_commit_model: () => 0,
          _mmd_bullet_model_identity: () => 0,
          _mmd_bullet_reset_world: () => {},
          _mmd_bullet_step: () => 0,
          _mmd_bullet_input_translations: () => 0,
          _mmd_bullet_input_rotations: () => 0,
          _mmd_bullet_input_world_matrices: () => 0,
          _mmd_bullet_output_translations: () => 0,
          _mmd_bullet_output_rotations: () => 0,
          _mmd_bullet_output_world_matrices: () => 0,
          _mmd_bullet_bone_physics_toggles: () => 0,
          _mmd_bullet_updated_bone_indices: () => 0
        };
      }
    `;
    const config: CustomBulletWorkerPhysicsConfig = JSON.parse(JSON.stringify({
      kind: "custom-bullet-mmd",
      moduleUrl: `data:text/javascript,${encodeURIComponent(moduleSource)}`,
      wasmUrl: "https://cdn.example.test/mmd_bullet.worker.wasm",
      options: { maxSubSteps: 3 }
    }));

    const backend = await createWorkerExternalPhysicsBackend(config, "https://app.example.test/worker.js");

    expect(backend.name).toBe("custom-bullet-mmd");
    expect((globalThis as { __mmdWorkerLocateFile?: string }).__mmdWorkerLocateFile).toBe(
      "https://cdn.example.test/mmd_bullet.worker.wasm"
    );
    expect(backend.disposed).toBe(false);

    backend.dispose?.();
    expect(backend.disposed).toBe(true);
    expect((globalThis as { __mmdWorkerDisposedWorld?: number }).__mmdWorkerDisposedWorld).toBe(7);
  });
});
