# Bullet / Ammo build

The browser physics path can load a package-local Bullet/Ammo script instead of
requiring applications to serve `node_modules/ammo.js/ammo.js` directly.

```ts
import {
  createAmmoMmdPhysicsBackend,
  loadCustomBulletAmmoNamespace
} from "@yohawing/three-mmd-loader/physics";

const Ammo = await loadCustomBulletAmmoNamespace();
const physicsBackend = createAmmoMmdPhysicsBackend(Ammo);
```

`loadCustomBulletAmmoNamespace()` resolves `./ammo/yw_bullet_ammo.js` relative to
the published `dist/physics/` module. `npm run build` copies that asset into
`dist/physics/ammo/`.

## Building from the Bullet submodule

Bullet is tracked as a git submodule at `native/third_party/bullet3`.

```powershell
git submodule update --init --recursive native/third_party/bullet3
npm run build:bullet
npm run build
npm run compare:bullet
npm run smoke:bullet:mmd
```

`npm run build:bullet` compiles both Bullet browser targets. The Ammo-compatible
target uses `native/bullet/ammo_compat_bindings.cc` and outputs:

- `native/bullet/dist/yw_bullet_ammo.js`
- `native/bullet/dist/yw_bullet_ammo.wasm`

The MMD-optimized target uses `native/bullet/mmd_bindings.cc` and outputs:

- `native/bullet/dist/yw_mmd_bullet.js`
- `native/bullet/dist/yw_mmd_bullet.wasm`

The binding layer intentionally exposes only the Ammo.js surface consumed by
`AmmoMmdPhysicsBackend`, so the custom build stays smaller and easier to audit
than a full upstream Ammo.js-style binding set.

## MMD-optimized backend path

The Ammo-compatible build is a comparison and migration target. The optimized
path should avoid exposing Bullet objects to JavaScript per frame. Runtime
support for that path is available through `MmdDirectBufferPhysicsBackend`:

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

Both Bullet targets use a fixed 64 MiB Wasm heap. That mirrors the existing
Ammo.js deployment constraint and keeps the direct-buffer typed array views
stable for the runtime.

The current MMD target exports the `yw_mmd_bullet_*` C ABI and `createCustomBulletMmdPhysicsBackend(...)`
wraps it as a direct-buffer backend. Rigid bodies are uploaded to native code
when the runtime step context changes, then per-frame execution stays on the
direct-buffer path. Joint upload and per-bone physics toggles are included, but
the backend should still be treated as an experimental comparison target until
larger real-model parity coverage exists.

The intended native API shape is:

- setup: upload model physics once, then allocate/return step buffer pointers
- frame: runtime writes into those views, then calls one backend `step(...)`
- output: native code writes output buffers and optionally returns
  `updatedBoneCount` for a fixed `updatedBoneIndices` typed array

`DefaultMmdRuntime` currently falls back to the existing JavaScript scratch
buffers when a model needs `transformAfterPhysics` pre-physics rest-pose input,
because that path still needs an intermediate local-pose compose pass.

## Comparing with npm ammo.js

`npm run compare:bullet` loads `ammo.js` from npm and the package-local Bullet
asset from `dist/physics/ammo/yw_bullet_ammo.js`, checks the required API
surface, and runs a tiny rigid-body step in both engines.

To compare a freshly built native artifact before copying it into `dist`, pass
the script path:

```powershell
npm run compare:bullet -- native/bullet/dist/yw_bullet_ammo.js
```

## Supplying an external artifact

Set `THREE_MMD_LOADER_BULLET_AMMO_JS` to a built Ammo-compatible JavaScript file
before running `npm run build`:

```powershell
$env:THREE_MMD_LOADER_BULLET_AMMO_JS = "F:\path\to\yw_bullet_ammo.js"
npm run build
```

If the variable is not set, `scripts/copy-bullet-ammo.mjs` looks for:

- `native/bullet/dist/yw_bullet_ammo.js`
- `src/physics/ammo/generated/yw_bullet_ammo.js`
- `node_modules/ammo.js/ammo.js`

The final fallback keeps local development and release packaging working while
the native Bullet build recipe is unavailable. A real custom build must export
the same constructor/method surface consumed by `AmmoNamespace` in
`src/physics/ammoMmdPhysicsBackend.ts`.
