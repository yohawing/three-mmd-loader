# Development

This document is the public development guide for
`@yohawing/three-mmd-loader`. It covers the checks, generated assets, local
fixtures, and release-facing contracts that should stay true in a fresh clone.

## Setup

Required:

- Node.js 22 or 24.
- npm with the committed `package-lock.json`.

Optional tools:

- Rust and wasm-pack, only when rebuilding the mmd-anim / Yw MMD WASM wrapper.
- Emscripten `emcc`, only when rebuilding the MMD Bullet browser backend.
- Playwright browser dependencies, only for visual regression scripts.

Install dependencies with:

```bash
npm ci
```

CI and release workflows also use `npm ci`. Do not update dependencies with a
different package manager.

## Build Artifacts

`npm run build` compiles TypeScript and copies already-generated browser assets
into `dist`. It does not rebuild native WASM targets. Rebuild the relevant
native target first when a submodule, binding source, generated artifact, or
export surface changed.

### mmd-anim / Yw MMD

```bash
git submodule update --init --recursive native/third_party/mmd-anim
npm run build:mmd-anim
npm run build
```

`build:mmd-anim` builds `native/third_party/mmd-anim/crates/mmd-anim-wasm` with
wasm-pack and synchronizes `mmd_anim_wasm.*` into
`src/parser/wasm/generated/`. The npm package ships these generated files
through `dist/**`.

### MMD Bullet

```bash
git submodule update --init --recursive native/third_party/bullet3
npm run build:bullet
npm run build
```

`build:bullet` requires `emcc` and writes:

- `native/bullet-mmd/dist/mmd_bullet.js`
- `native/bullet-mmd/dist/mmd_bullet.wasm`

`npm run build` copies `mmd_bullet.js` to `dist/physics/mmd/`. The backend uses
the `mmd_bullet_*` C ABI and a fixed 64 MiB WASM heap so direct-buffer typed
array views remain stable during runtime physics steps.

Focused checks after Bullet rebuilds:

```bash
npm run compare:bullet:mmd
npm run compare:bullet:mmd:local -- --frames 120
npm run smoke:bullet:mmd
```

## PMX WASM ABI

The default PMX path uses the split mmd-anim WASM ABI when available:

- `WasmPmxParsedModel.parse(bytes)` parses the PMX bytes once.
- `parsed.nonGeometryJson()` returns metadata, materials, skeleton, morphs,
  display frames, rigid bodies, joints, soft bodies, and diagnostics.
- `parsed.geometry()` returns typed arrays for positions, normals, UVs,
  indices, material groups, skinning, SDEF, and QDEF.

This keeps large geometry buffers out of JSON while preserving the existing
TypeScript-facing `MmdModel` shape.

## Release Gates

Keep portable automation separate from local evidence. Portable checks must
pass in a fresh clone without user-owned assets. Local evidence is useful, but
it is not a CI, tag, or publish blocker.

### PR / CI Gate

`.github/workflows/ci.yml` runs on Node.js 22 and 24:

```bash
npm ci
npm run lint
npm test
npm run build
npm run check:fixtures
npm run smoke:dist
npm run smoke:types
```

### Release Package Gate

`.github/workflows/release.yml` runs on Node.js 24, repeats the PR / CI gate,
then runs:

```bash
npm pack --json
```

For local preflight, use `npm pack --dry-run --json` before tagging so the
tarball surface is checked without writing a package artifact.

Publishable release workflow runs also validate package metadata, check that
`v*.*.*` tags match `package.json`, upload the packed artifact, and publish only
from an explicit tag or manual workflow dispatch with publishing enabled.

### Conditional Local Evidence

Run these only when the changed area justifies them:

```bash
# Native WASM or generated-wrapper changes
npm run build:mmd-anim
npm run build

# Rendering, material, outline, shader, camera, light, or self-shadow changes
npm run visual:smoke:generated-pmx
npm run visual:smoke:camera-light-vmd
npm run visual:smoke:self-shadow

# User-owned corpora or local playback/physics evidence
npm run check:fixtures:local
npm run check:fixtures:physics
```

`build:mmd-anim` is not a standing CI gate while
`src/parser/wasm/generated/` is committed. Treat it as conditional preflight.

### Package Contents

`npm pack --dry-run --json` should include:

- `README.md`
- `docs/README.ja.md`
- `docs/DEVELOPMENT.md`
- `CHANGELOG.md`
- `LICENSE`
- `package.json`
- `dist/**`, including `dist/three/assets/mmd/toon01.bmp` through
  `toon10.bmp`

## Command Reference

| Command | Purpose |
| --- | --- |
| `npm run lint` | ESLint with `--max-warnings 0`. |
| `npm run lint:fix` | Applies ESLint fixes. |
| `npm test` | Runs the Vitest unit and integration suite. |
| `npm run build` | Compiles TypeScript and copies bundled assets into `dist`. |
| `npm run build:mmd-anim` | Rebuilds the mmd-anim WASM wrapper. |
| `npm run build:bullet` | Rebuilds the MMD Bullet browser backend. |
| `npm run smoke:dist` | Verifies built package exports and key dist runtime paths. |
| `npm run smoke:types` | Packs the library into a temporary TypeScript consumer and checks typed imports. |
| `npm run check:fixtures` | Portable fixture parse / Three.js assembly gate. |
| `npm run check:fixtures:local` | Optional local corpus crash-smoke; skips when inventory is absent. |
| `npm run check:fixtures:physics` | Optional local fixture checks with physics-related validation enabled. |
| `npm run compare:runtime:js` | Compares generated TypeScript runtime and WASM-backed runtime outputs. |
| `npm run bench:runtime:js` | Measures runtime JS hot paths. |
| `npm run bench:wasm:perf -- <model> [repeat]` | Compares WASM and TypeScript model-load performance for a local PMX / PMD. |
| `npm run compare:bullet:mmd` | Runs a small synthetic Bullet comparison. |
| `npm run compare:bullet:mmd:local` | Runs a local model/motion Bullet comparison. |
| `npm run smoke:bullet:mmd` | Smoke-tests the built MMD Bullet browser backend. |
| `npm pack --dry-run --json` | Verifies npm tarball contents without writing a package. |

## Tests

| Path | Scope |
| --- | --- |
| `test/unit/parser/**` | Binary readers and PMX / PMD / VMD / VPD parsers. |
| `test/unit/runtime/**` | Runtime sampling, frame evaluation, IK, append transforms, and parity evidence. |
| `test/unit/three/**` | Three.js geometry, skeleton, material, texture, loader, and helper behavior. |
| `test/unit/physics/**` | Physics backend contracts. |
| `test/unit/package/**` | Public API smoke tests based on documented usage. |
| `test/unit/viewer/**` | Source-level checks for the example viewer. |
| `test/unit/visual-regression/**` | Visual manifest validation. |
| `test/integration/**` | Cross-module loading, runtime, IK, animation, and physics checks. |

Prefer public behavior or stable local contracts. Avoid pinning private
implementation details unless the source shape is intentionally part of the
contract.

Test categories:

- Public API, parser/runtime parity, and portable fixture checks are required
  through `npm test`, `smoke:dist`, `smoke:types`, and `check:fixtures`.
- Rendered visual comparisons are local evidence because GPU output is
  platform-sensitive; manifest source checks remain portable.
- Local corpus, local playback, real-model visual, benchmark, and Bullet local
  comparisons are optional evidence and must skip or exit green when local data
  is absent.
- Source-level tests are acceptable only for deliberate contracts such as viewer
  source wiring, visual manifest entrypoints, Bullet patch source checks, or
  runtime allocation guards.

When a fragile test pins structure instead of behavior, choose one:

- Delete it if behavior is already covered elsewhere.
- Rewrite it to behavior if it protects a real user-visible contract.
- Keep it as source-level regression only when the source shape itself is the
  contract.

## Fixtures And Local Evidence

Committed fixtures live under `test/fixtures/`:

- `test/helpers/fixtures.ts` lists committed PMX and VMD fixture names used by
  tests.
- `test/fixtures/fixtures.sample.json` feeds `scripts/check-fixtures.mjs`.
- `test/fixtures/generated/**` contains generated PMX/VMD assets.
- `test/fixtures/oracles/**` contains numeric parity evidence.

Regenerate the minimal PMX smoke fixture with:

```bash
npm run generate:fixtures:minimal-pmx
```

### Local Inventory

`test/fixtures/fixtures.local.json` is the only gitignored bridge to user-owned
local corpora. It uses `test/fixtures/fixtures.schema.json`, starts with a
`basePath`, and registers PMX / PMD / VMD / VPD paths under
`paths.releaseSmoke.byExtension`.

Do not commit local model paths, motions, audio, screenshots, raw oracle input,
or local render baselines. When the inventory is absent, local fixture commands
and tests must skip or exit `0`.

### Local Playback

Playback cases live under `paths.playbackSmoke.cases` in the local inventory.
Use the schema as the source of truth. Keep these semantics explicit:

- `stage` defaults to `physics`.
- `matrixEpsilon` and `morphEpsilon` default to `1e-4`.
- `skipCategory` is one of `runtime-bug`, `oracle-limitation`, or
  `asset-unavailable`.
- Do not remove `skipReason` only because local files exist. Regenerate the
  oracle for the current model/motion pair before unskipping.
- Do not rename stale oracle dumps into current case names.

Minimal local playback inventory:

```json
{
  "$schema": "./fixtures.schema.json",
  "schemaVersion": 1,
  "basePath": ".",
  "paths": {
    "releaseSmoke": {
      "byExtension": {
        "pmx": { "oneBoneCube": "test_1bone_cube.pmx" },
        "pmd": {},
        "vmd": { "oneBoneCubeMotion": "test_1bone_cube_motion.vmd" },
        "vpd": {}
      }
    },
    "playbackSmoke": {
      "cases": [
        {
          "name": "one-bone cube",
          "model": { "extension": "pmx", "key": "oneBoneCube" },
          "motion": { "key": "oneBoneCubeMotion" },
          "stage": "physics",
          "frames": [0, 1, 2],
          "watchBones": ["全ての親"]
        }
      ]
    }
  }
}
```

## Dist And Type Smoke

`npm run smoke:dist` checks parser exports, runtime exports, Three.js helpers,
physics exports, loader model loading, VMD loading, VPD loading,
pose-to-animation conversion, and bundled toon texture paths against `dist`.

`npm run smoke:types` packs the library into a temporary package and checks
typed imports from:

- `@yohawing/three-mmd-loader`
- `@yohawing/three-mmd-loader/parser`
- `@yohawing/three-mmd-loader/runtime`
- `@yohawing/three-mmd-loader/three`
- `@yohawing/three-mmd-loader/physics`

Run `npm run build` first when source files changed.

## Example Viewer

Run the local example viewer with:

```bash
npm run example:viewer
```

This aliases `npm run dev`, which builds the library and starts
`scripts/serve-example-viewer.mjs`.

If `MMD_DATA_ROOT` is set, the server exposes it under `/__mmd_data/`. If it is
unset and `test/fixtures/fixtures.local.json` exists, the server uses that
inventory `basePath` instead. In local-only mode the viewer exposes a
`Local Assets` menu from `/__mmd_assets__/fixtures-local.json`; the raw
inventory and user-owned assets remain local.

## Visual Regression

Visual regression scripts are local development tools, not release-blocking CI
gates. Baselines are GPU- and platform-specific because `render-real-models.mjs`
uses the locally installed Chrome/Edge hardware WebGL path. Regenerate and
review baselines on the same machine you validate them on.

Refresh baselines whenever rendering output can change: material, outline,
shader, parser/runtime/WASM output, texture alpha classification, morph
application, camera, light, or self-shadow behavior.

Workflow:

```bash
npm run render:visual:generated-pmx:baseline
# review changed PNGs under test/fixtures/visual-baselines/generated-pmx/
npm run visual:smoke:generated-pmx
# commit only reviewed baselines
```

Do not judge alpha or edge diffs by sight alone. Use
`evaluateMmdTextureAlphaRgba` in `src/three/textures.ts` and confirm whether the
case applies morphs. Do not commit generated files under `test-results/`.

| Command | Purpose |
| --- | --- |
| `npm run visual:smoke:generated-pmx` | Renders and compares generated PMX visual fixtures. |
| `npm run visual:smoke:camera-light-vmd` | Renders and compares camera/light VMD visual fixtures. |
| `npm run visual:smoke:self-shadow` | Renders and reports self-shadow visual fixtures. |
| `npm run visual:smoke:generated-pmx:flip` | Runs generated-PMX visual smoke through NVIDIA FLIP. |
| `npm run render:visual:generated-pmx:baseline` | Regenerates generated-PMX baseline images. |
| `npm run render:visual:skinning` | Renders the skinning visual profile. |
| `npm run visual:report:skinning` | Compares skinning baseline/current images. |
| `npm run render:visual:real-models` | Renders local user-owned real-model cases. |
| `npm run render:visual:real-models:baseline` | Writes real-model baseline images. |
| `npm run visual:report:real-models` | Compares real-model baseline/current images. |
| `npm run snapshot:real-models:rest-pose` | Captures rest-pose quaternion snapshots. |
| `npm run snapshot:real-models:rest-pose:baseline` | Writes rest-pose snapshot baselines. |
| `npm run compare:real-models:rest-pose` | Compares rest-pose snapshots. |

Real-model scripts expect user-owned assets outside the repository:

```bash
MMD_DATA_ROOT=/path/to/local/mmd-assets npm run render:visual:real-models
```

NVIDIA FLIP is optional:

```bash
python -m pip install flip-evaluator
npm run visual:smoke:generated-pmx:flip
NVIDIA_FLIP_PATH=/path/to/flip npm run visual:smoke:generated-pmx:flip
```
