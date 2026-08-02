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
        const buffer = new ArrayBuffer(65536);
        const HEAPF32 = new Float32Array(buffer);
        const HEAPU8 = new Uint8Array(buffer);
        const HEAPU32 = new Uint32Array(buffer);
        let next = 256;
        return {
          HEAPF32, HEAPU8, HEAPU32,
          _malloc: size => { const pointer = next; next += size; return pointer; },
          _free: () => {},
          _mmd_anim_bullet_world_create: out => { HEAPU32[out >> 2] = 7; return 0; },
          _mmd_anim_bullet_world_destroy: world => { globalThis.__mmdWorkerDisposedWorld = world; },
          _mmd_anim_bullet_world_reset: () => 0,
          _mmd_anim_bullet_world_settle_to_current: () => 0,
          _mmd_anim_bullet_world_step: () => 0,
          _mmd_anim_bullet_world_add_rigidbody: () => 0,
          _mmd_anim_bullet_world_get_rigidbody_transform: () => 0,
          _mmd_anim_bullet_world_set_rigidbody_transform: () => 0,
          _mmd_anim_bullet_world_add_6dof_spring_joint: () => 0
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
