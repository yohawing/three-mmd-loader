# Bullet MMD build

The package includes an experimental MMD-optimized Bullet backend for browser
physics. The standard Ammo.js path remains the compatibility baseline and should
use `ammo.js@0.0.10` with `createAmmoMmdPhysicsBackend(...)`.

```ts
import {
  createCustomBulletMmdPhysicsBackend,
  loadCustomBulletMmdModule
} from "@yohawing/three-mmd-loader/physics";

const mmdBullet = await loadCustomBulletMmdModule();
const physicsBackend = createCustomBulletMmdPhysicsBackend(mmdBullet);
```

`loadCustomBulletMmdModule()` resolves `./mmd/yw_mmd_bullet.js` relative to the
published `dist/physics/` module. `npm run build` copies that asset into
`dist/physics/mmd/`.

## Building from the Bullet submodule

Bullet is tracked as a git submodule at `native/third_party/bullet3`.

```powershell
git submodule update --init --recursive native/third_party/bullet3
npm run build:bullet
npm run build
npm run compare:bullet:mmd
npm run compare:bullet:mmd:local -- --frames 120
npm run smoke:bullet:mmd
```

`npm run build:bullet` compiles the MMD-optimized browser target. It uses
`native/bullet/mmd_bindings.cc` and outputs:

- `native/bullet/dist/yw_mmd_bullet.js`
- `native/bullet/dist/yw_mmd_bullet.wasm`

## MMD-optimized backend path

The optimized path avoids exposing Bullet objects to JavaScript per frame.
Runtime support for that path is available through
`MmdDirectBufferPhysicsBackend`:

```ts
interface MmdDirectBufferPhysicsBackend extends MmdPhysicsBackend {
  acquireStepBuffers(layout: MmdPhysicsStepBufferLayout): MmdPhysicsStepBuffers | undefined;
}
```

When a backend implements this interface, `DefaultMmdRuntime` writes per-frame
input translations, rotations, world matrices, physics toggles, and output
defaults directly into backend-owned typed arrays. A Wasm backend can make those
typed arrays views over `Module.HEAPF32.buffer` / `Module.HEAPU8.buffer`, so the
native side reads the same memory during a single `step(...)` call.

The Bullet target uses a fixed 64 MiB Wasm heap. That mirrors the existing
Ammo.js deployment constraint and keeps the direct-buffer typed array views
stable for the runtime.

The current MMD target exports the `yw_mmd_bullet_*` C ABI and
`createCustomBulletMmdPhysicsBackend(...)` wraps it as a direct-buffer backend.
Rigid bodies are uploaded to native code when the runtime step context changes,
then per-frame execution stays on the direct-buffer path. Joint upload and
per-bone physics toggles are included, but the backend should still be treated
as an experimental comparison target until larger real-model parity coverage
exists.

The intended native API shape is:

- setup: upload model physics once, then allocate/return step buffer pointers
- frame: runtime writes into those views, then calls one backend `step(...)`
- output: native code writes output buffers and optionally returns
  `updatedBoneCount` for a fixed `updatedBoneIndices` typed array

`DefaultMmdRuntime` currently falls back to the existing JavaScript scratch
buffers when a model needs `transformAfterPhysics` pre-physics rest-pose input,
because that path still needs an intermediate local-pose compose pass.

## Comparing against Ammo.js

Use `compare:bullet:mmd:local` when checking whether the custom Bullet MMD
backend still tracks the stable Ammo.js behavior. The script compares
`AmmoMmdPhysicsBackend` using the npm `ammo.js` package against
`createCustomBulletMmdPhysicsBackend(...)` using `dist/physics/mmd/yw_mmd_bullet.js`.

```powershell
npm run build
npm run compare:bullet:mmd:local -- --frames 120
```

Useful options:

- `--model <path>`: PMX/PMD model to load
- `--motion <path>`: VMD motion to play; omitted means rest pose
- `--bullet <path>`: custom Bullet MMD script path
- `--ammo-script npm|<path>`: Ammo.js baseline; defaults to `npm`
- `--ammo-fixed-time-step <seconds>` and `--ammo-max-sub-steps <count>`:
  Ammo.js stepping controls
- `--dynamic-with-bone-rotation-feedback-scale <value>`, `--collision-margin <value>`,
  `--solver-iterations <count>`, `--split-impulse <0|1>`, and
  `--split-impulse-penetration-threshold <value>`: custom Bullet tuning controls
- `--json`: print parseable metric output
- `--fail-position-delta <value>`: fail when max bone position delta exceeds the threshold

`compare:bullet:mmd` remains a small synthetic smoke comparison. It is useful
for quick local checks, but real parity work should use
`compare:bullet:mmd:local` with a representative model and motion.
