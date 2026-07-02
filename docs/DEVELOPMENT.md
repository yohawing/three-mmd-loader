# Development

This document describes the project-local checks, test layout, and helper
scripts used while developing `@yohawing/three-mmd-loader`.

## Prerequisites

- Node.js 22 or 24.
- npm with the committed `package-lock.json`.
- Optional: Rust and wasm-pack when rebuilding the mmd-anim / Yw MMD WASM wrapper.
- Optional: Emscripten `emcc` when rebuilding the MMD Bullet browser backend.
- Optional: Playwright browser dependencies for visual regression scripts.

Install dependencies with:

```bash
npm ci
```

CI and release workflows also use `npm ci`, so do not update dependencies with
another package manager.

## Native WASM Builds

`npm run build` copies locally generated native browser artifacts into `dist`;
it does not rebuild the mmd-anim / Yw MMD wrapper or the MMD Bullet backend.
Rebuild the relevant native target first when a generated artifact is missing,
or when its submodule, binding source, or export surface changed.

### mmd-anim / Yw MMD Parser Wrapper

The parser/runtime WASM wrapper is built from the `native/third_party/mmd-anim`
submodule:

```bash
git submodule update --init --recursive native/third_party/mmd-anim
npm run build:mmd-anim
npm run build
```

`build:mmd-anim` runs `node scripts/build-mmd-anim-wasm.mjs`, builds
`native/third_party/mmd-anim/crates/mmd-anim-wasm` with `wasm-pack`, and
synchronizes the generated `mmd_anim_wasm.*` files into
`src/parser/wasm/generated/`.

The npm tarball contains these generated WASM files only through `dist/**`.

### MMD Bullet Browser Backend

The experimental direct-buffer Bullet backend is built from:

- `native/third_party/bullet3`: upstream Bullet source submodule.
- `native/bullet-mmd/mmd_bindings.cc`: MMD-specific browser binding source.

Initialize Bullet and rebuild the browser backend with:

```bash
git submodule update --init --recursive native/third_party/bullet3
npm run build:bullet
npm run build
```

`build:bullet` compiles the MMD-optimized browser target through
`node scripts/build-bullet-mmd-wasm.mjs`. It requires `emcc` on `PATH` and
writes:

- `native/bullet-mmd/dist/mmd_bullet.js`
- `native/bullet-mmd/dist/mmd_bullet.wasm`

`npm run build` then copies `mmd_bullet.js` into `dist/physics/mmd/`.
`loadCustomBulletMmdModule()` resolves `./mmd/mmd_bullet.js` relative to the
published `dist/physics/` module.

Run the focused Bullet checks after rebuilding:

```bash
npm run compare:bullet:mmd
npm run compare:bullet:mmd:local -- --frames 120
npm run smoke:bullet:mmd
```

`compare:bullet:mmd` is a small synthetic smoke comparison. Use
`compare:bullet:mmd:local` with a representative model and motion when checking
whether `createCustomBulletMmdPhysicsBackend(...)` still tracks the stable
Ammo.js baseline. Useful local options include `--model <path>`,
`--motion <path>`, `--bullet <path>`, `--ammo-script npm|<path>`, `--json`, and
`--fail-position-delta <value>`.

The MMD Bullet target exports the `mmd_bullet_*` C ABI and uses a fixed 64 MiB
WASM heap so runtime typed-array views over `Module.HEAPF32.buffer` and
`Module.HEAPU8.buffer` stay stable during direct-buffer physics steps.

## PMX WASM ABI Shape

The default PMX path uses a split mmd-anim WASM ABI through a parsed-model
handle when the generated wrapper exports it:

- `WasmPmxParsedModel.parse(bytes)` parses the PMX bytes once.
- `parsed.nonGeometryJson()` returns metadata, materials, skeleton, morphs,
  display frames, rigid bodies, joints, soft bodies, and diagnostics.
- `parsed.geometry()` returns copied typed arrays for positions, normals, UVs,
  indices, material groups, skinning, SDEF, and QDEF.

This keeps large geometry buffers out of JSON while preserving the existing
`MmdModel` TypeScript-facing shape.

## Release Gate Tiers

Keep release confidence split into portable automation and local evidence.
Portable checks must pass in a fresh clone without user-owned assets. Local
evidence is useful for confidence, but it is not a CI or tag-release blocker.

### PR / CI Portable

The pull-request and branch CI gate is `.github/workflows/ci.yml`. It runs on
Node.js 22 and 24:

```bash
npm ci
npm run lint
npm test
npm run build
npm run check:fixtures
npm run smoke:dist
npm run smoke:types
```

### Tag Release Portable

The release workflow package job is `.github/workflows/release.yml`. It runs on
Node.js 24, repeats the PR / CI portable gate, and then adds:

```bash
npm pack --json
```

For local operator preflight, use `npm pack --dry-run --json` before tagging so
the tarball surface is checked without writing the package artifact.

### Optional Local / Conditional Evidence

Run these when the changed area justifies them. They are intentionally separate
from the portable gate:

```bash
# When native/third_party/mmd-anim, generated WASM, or the export surface changed:
npm run build:mmd-anim
npm run build

# When rendering, parser/runtime WASM output, material, outline, shader, camera,
# light, or self-shadow behavior changed:
npm run visual:smoke:generated-pmx
npm run visual:smoke:camera-light-vmd
npm run visual:smoke:self-shadow

# When checking user-owned local corpora or physics/playback evidence:
npm run check:fixtures:local
npm run check:fixtures:physics
npm test -- test/integration/physics/local-ammo-playback-stability.test.ts
npm test -- test/integration/physics/local-ammo-dynamic-bone-anchor.test.ts
```

`build:mmd-anim` is not a standing CI gate while the generated
`src/parser/wasm/generated/` files are committed. Treat it as a conditional
preflight when the submodule, generated WASM, or wrapper export surface changed.

## Core Checks

Use the release gate tiers above when deciding which checks are required. The
operator-facing release runbook is local-only when present; this public document
records the portable gate contract.

Command summary:

| Command | Purpose |
| --- | --- |
| `npm run lint` | Runs ESLint with `--max-warnings 0`. |
| `npm run lint:fix` | Applies ESLint auto-fixes where available. |
| `npm test` | Runs the Vitest unit and integration suite. |
| `npm run build` | Compiles TypeScript and copies bundled MMD toon BMP and WASM assets into `dist`. |
| `npm run build:mmd-anim` | Rebuilds the mmd-anim WASM wrapper into `src/parser/wasm/generated/`. |
| `npm run build:bullet` | Rebuilds the MMD Bullet browser backend into `native/bullet-mmd/dist/`. |
| `npm run compare:bullet:mmd` | Runs the small synthetic Ammo.js vs MMD Bullet comparison. |
| `npm run compare:bullet:mmd:local` | Compares Ammo.js vs MMD Bullet against a local model and optional motion. |
| `npm run smoke:bullet:mmd` | Smoke-tests the built MMD Bullet browser backend. |
| `npm run bench:wasm:perf -- <model> [repeat]` | Compares WASM and TypeScript fallback `loadModel` speed plus `loadModel + createThreeBufferGeometry` total time against a local PMX / PMD file. |
| `npm run smoke:dist` | Verifies built package exports and key dist runtime paths. |
| `npm run smoke:types` | Packs the library, installs it into a temporary TypeScript consumer, and verifies root/subpath imports with `tsc --noEmit`. |
| `npm run check:fixtures` | Portable fixture gate. Parses `test/fixtures/fixtures.sample.json` through built `dist` parser / Three.js assembly and writes `tmp/fixture-parse-report.json`. |
| `npm run check:fixtures:physics` | Optional local evidence. Runs fixture checks with physics-related validation enabled. |
| `npm run check:fixtures:local` | Parse-only crash-smoke over a gitignored local corpus inventory; skips when the inventory is absent. |
| `npm pack --dry-run --json` | Verifies npm tarball contents without writing a package. |

## Test Layout

Tests are split by risk and scope:

| Path | Scope |
| --- | --- |
| `test/unit/parser/**` | Binary readers and PMX / PMD / VMD / VPD parsers. |
| `test/unit/runtime/**` | Runtime sampling, frame evaluation, IK, append transforms, and parity evidence. |
| `test/unit/three/**` | Three.js geometry, skeleton, material, texture, loader, and helper behavior. |
| `test/unit/physics/**` | Disabled, Ammo, browser loader, and bridge-level physics contracts. |
| `test/unit/package/**` | Public API smoke tests based on documented usage. |
| `test/unit/viewer/**` | Source-level checks for the example viewer. |
| `test/unit/visual-regression/**` | Manifest-level validation for visual regression scripts. |
| `test/integration/**` | Cross-module loading, runtime, IK, animation, and physics checks. |

Keep tests focused on public behavior or stable local contracts. Avoid
snapshotting internal implementation details that should remain easy to refactor.

### Test Suite Classification

Use these categories when adding or auditing tests:

| Category | Examples | Gate treatment |
| --- | --- | --- |
| Public API behavior | `test/unit/package/PublicApiSmoke.test.ts`, `test/unit/three/**`, `test/unit/physics/**`, model-loading and animation integration tests, `scripts/dist-export-smoke.mjs`, `scripts/type-consumer-smoke.mjs` | Required portable checks through `npm test`, `smoke:dist`, and `smoke:types`. |
| Parser / runtime parity | `test/unit/parser/**`, `test/wasm/**`, `test/unit/runtime/**`, `test/integration/runtime/**`, `test/integration/ik/**`, generated skinning/runtime fixtures | Required portable checks when backed by committed fixtures or oracles; local comparison scripts remain optional evidence. |
| Visual regression | `test/unit/visual-regression/CasesManifest.test.ts`, `scripts/visual-regression/**`, `test/fixtures/visual-baselines/**`, `visual:smoke:*` scripts | Manifest source checks are portable through `npm test`; rendered pixel comparisons are optional local evidence because GPU output is platform-sensitive. |
| Release gate | `npm run lint`, `npm test`, `npm run build`, `npm run smoke:dist`, `npm run smoke:types`, `npm run check:fixtures`, npm pack checks | Split by tier: PR / CI portable, tag release portable, and operator dry-run. |
| Local-only asset verification | `test/fixtures/fixtures.local.json`, local playback physics tests, `check:fixtures:local`, real-model visual scripts, runtime / Bullet local comparison and benchmark scripts | Optional local evidence only. Missing local inventory must skip or exit green. |
| Implementation-rule checks | Viewer source-level tests, visual manifest source pins, Bullet patch source checks, selected runtime source guards | Keep only when the checked source shape is a deliberate contract or hard-rule guard. Otherwise rewrite to behavior. |

### Fragile Test Policy

When a test pins internal structure instead of observable behavior, classify it
before editing:

| Decision | Use when | Current examples |
| --- | --- | --- |
| Delete | The test only repeats an implementation detail and a public or integration test already covers the behavior. | Avoid adding more private-signature or file-layout snapshots. |
| Rewrite to behavior | The test protects real behavior, but string or section-shape assertions break on harmless refactors. | Prefer behavior coverage for shader output over raw fragment strings; prefer fixture counts and trailing-byte checks over fixed parser section counts. |
| Keep as source-level regression | The project intentionally treats the source shape as a contract or hard-rule guard. | `test/unit/viewer/ViewerSource.test.ts`, visual manifest entrypoint checks, Bullet patch source checks, and allocation-light render-path guards. |

Source-level regression tests should state the contract they protect. They are
not a default substitute for public API, parser/runtime, or visual evidence.

## Fixtures

Committed fixtures live under `test/fixtures/`.

- `test/helpers/fixtures.ts` lists the committed PMX and VMD fixture names used
  by tests.
- `test/fixtures/fixtures.sample.json` is the sample manifest consumed by
  `scripts/check-fixtures.mjs`.
- `test/fixtures/fixtures.local.json` is an optional, gitignored manifest for a
  large local corpus (see below).
- `test/fixtures/generated/**` contains generated PMX assets used for focused
  runtime and loader cases.
- `test/fixtures/oracles/**` contains numeric parity evidence.

To regenerate the minimal PMX fixture used by smoke tests:

```bash
npm run generate:fixtures:minimal-pmx
```

## Local Corpus Crash-Smoke

`npm run check:fixtures:local` runs a parse-only crash-smoke over a large local
corpus of real PMX / PMD / VMD / VPD files. It is a developer-only check; the
corpus and its manifest are never committed.

The only coupling to local data is a single gitignored inventory at
`test/fixtures/fixtures.local.json`. It uses the same schema as the sample
manifest (`test/fixtures/fixtures.schema.json`): a `basePath` plus
`paths.releaseSmoke.byExtension.{pmx,pmd,vmd,vpd}` maps of arbitrary keys to
paths resolved from `basePath`. Generate it however you like (for example from
your own asset catalog) — the repository intentionally ships no generator and
no machine-specific paths.

Then build and run the smoke:

```bash
npm run build
npm run check:fixtures:local
```

It parses every listed file, cross-checks each model's geometry array lengths
against its metadata counts, writes `tmp/fixture-parse-report.json`, and exits
non-zero if any file fails to parse. When `test/fixtures/fixtures.local.json` is
absent (fresh clones, CI), the command logs a skip and exits `0`.

## Local Playback Fixtures

The repository has a local-only playback fixture path for runtime and physics
stability checks. Register model/motion pairs in the optional local fixture
inventory and keep all user-owned corpus paths out of git.

Add a case to the optional, gitignored
`test/fixtures/fixtures.local.json` inventory. Register the model and motion in
`paths.releaseSmoke.byExtension.{pmx,pmd,vmd}`, then reference those keys from
`paths.playbackSmoke.cases`.

Each playback case has these fields:

- `name`: Human-readable case name.
- `model: { extension, key }`: Reference to a `pmx` or `pmd` key in
  `paths.releaseSmoke.byExtension`.
- `motion: { key }`: Reference to a `vmd` key in
  `paths.releaseSmoke.byExtension.vmd`.
- `oracle`: Optional path to a local comparison artifact, resolved from the
  inventory `basePath`.
- `oracleKind`: Optional discriminator for local tooling.
- `stage`: Runtime stage to compare. The default is `physics`, which is the
  post-IK final pose when the oracle was generated with `--physics none`.
- `frames`: Frame numbers included in the oracle.
- `watchBones`: Bone names that exist in `oracle.model.bones`.
- `matrixEpsilon` / `morphEpsilon`: Numeric tolerances. Both default to
  `1e-4`.
- `skipReason`: Optional local-only reason to skip a case while keeping the
  model, motion, and oracle registration documented in the inventory.
- `skipCategory`: Optional machine-readable skip classification. Use
  `runtime-bug` for cases kept as runtime regression candidates,
  `oracle-limitation` when the native dump is not authoritative for the motion
  semantics, and `asset-unavailable` when the local model, motion, camera, or
  oracle is missing.

The authoritative schema is
`test/fixtures/fixtures.schema.json` under `paths.playbackSmoke.cases`.

### Local Oracle Triage

Do not remove `skipReason` only because the local model and motion exist. A
skipped playback case is eligible to re-enter local playback checks only when
its skip category has been resolved and its local oracle matches the current
case registration.

Current local playback skip triage:

| Case | Category | Current action |
|---|---|---|
| `tda-miku-addiction` | `oracle-limitation` | Keep skipped; the native-health IK dump does not match PMX knee link-limit/local-axis behavior for this motion. |
| `anomalo-miku-change` | `runtime-bug` | Keep skipped as a Phase5 rig regression candidate; regenerate the local oracle for the current Anomalo case before unskipping. |
| `rem-proseka-weekender-girl` | `runtime-bug` | Keep skipped as a dense REM IK/twist rig regression candidate; regenerate the local oracle for the current Weekender Girl case before unskipping. |
| `shiori-novella-patchwork-airi` | `oracle-limitation` | Keep skipped; the native-health local oracle does not apply VMD property IK enable states for this case. |

The old `yyb-10th-change.local.json`, `rem-proseka-patchwork-miku.local.json`,
and `yyb-10th-patchwork-airi.local.json` oracle dumps are stale for the current
case registrations. Do not rename them into the current case names; regenerate
fresh local oracles from the current model and motion pairs.

### Sour Miku RabbitHole Regression

`sour-miku-rabbithole` is the high-signal local regression case for PMX IK
link-limit and knee instability drift. Keep it in the gitignored local
inventory with:

- model key: `sourMikuBlack`
- motion key: `rabbitHoleDance`
- oracle: `test/fixtures/oracles/sour-miku-rabbithole.local.json`
- stage: `physics`
- frames: `0,30,60,120,180`
- matrix / morph epsilon: `1e-4`
- regression tags: `local-only`, `ik-limit`, `knee-instability`, `phase5`

This case depends on user-owned local corpus assets. Do not add the PMX, VMD,
audio, screenshots, raw oracle inputs, or rendered baselines to package files,
public docs, CI artifacts, or portable visual baselines. Re-run it after runtime
IK or physics fixes, but keep the portable release gate separate from this
local evidence.

For the committed cube fixture, a minimal local inventory looks like this:

```json
{
  "$schema": "./fixtures.schema.json",
  "schemaVersion": 1,
  "basePath": ".",
  "paths": {
    "releaseSmoke": {
      "byExtension": {
        "pmx": {
          "oneBoneCube": "test_1bone_cube.pmx"
        },
        "pmd": {},
        "vmd": {
          "oneBoneCubeMotion": "test_1bone_cube_motion.vmd"
        },
        "vpd": {}
      }
    },
    "playbackSmoke": {
      "cases": [
        {
          "name": "one-bone cube",
          "model": {
            "extension": "pmx",
            "key": "oneBoneCube"
          },
          "motion": {
            "key": "oneBoneCubeMotion"
          },
          "stage": "physics",
          "frames": [0, 1, 2],
          "watchBones": ["全ての親"]
        }
      ]
    }
  }
}
```

Real models such as Tda, Sour, or Lat Miku cases use the same three-step flow.
Keep their asset paths in the local inventory; do not commit user-owned corpus
paths.

### Run Local Playback Checks

Run local playback or physics stability tests directly:

```bash
npm test -- test/integration/physics/local-ammo-playback-stability.test.ts
```

When `test/fixtures/fixtures.local.json` is absent, has no playback cases, or a
case's model/motion path is missing, local playback tests are skipped and CI
remains green.

## Dist And Package Smoke

`npm run smoke:dist` runs `scripts/dist-export-smoke.mjs` against the compiled
`dist` output and package export paths. It checks parser exports, runtime
exports, Three.js helpers, physics exports, loader model loading, VMD loading,
VPD loading, pose-to-animation conversion, and bundled toon texture paths.

`npm run smoke:types` runs `scripts/type-consumer-smoke.mjs`. It creates a
temporary package, installs the packed tarball, and checks typed imports from:

- `@yohawing/three-mmd-loader`
- `@yohawing/three-mmd-loader/parser`
- `@yohawing/three-mmd-loader/runtime`
- `@yohawing/three-mmd-loader/three`
- `@yohawing/three-mmd-loader/physics`

Run `npm run build` before `npm run smoke:dist` and `npm run smoke:types` when
source files changed.

`npm pack --dry-run --json` should include:

- `README.md`
- `docs/README.ja.md`
- `CHANGELOG.md`
- `LICENSE`
- `package.json`
- `dist/**`, including `dist/three/assets/mmd/toon01.bmp` through
  `toon10.bmp`

## Example Viewer

Run the local example viewer with:

```bash
npm run example:viewer
```

This is an alias for `npm run dev`, which builds the library and starts
`scripts/serve-example-viewer.mjs`.

If `MMD_DATA_ROOT` is set, the dev server exposes that directory under
`/__mmd_data/`. If `MMD_DATA_ROOT` is unset but the gitignored
`test/fixtures/fixtures.local.json` inventory exists, the server uses that
inventory's `basePath` as the local data root. In that local-only mode the
viewer also exposes a `Local Assets` menu generated from the inventory at
`/__mmd_assets__/fixtures-local.json`; the raw inventory and user-owned assets
are not committed. Local PMX / PMD entries can be loaded either as the active
model or as a separate background, VMD entries can be loaded either as model
motion or camera motion, and recent URL-based loads are saved in browser
storage for quick iteration.

## Visual Regression Scripts

Visual regression scripts are development tools, not release-blocking CI gates.

These baselines are **GPU- and platform-specific**. `render-real-models.mjs`
launches the locally installed Chrome/Edge (hardware WebGL) and does not pin a
software GL backend, so the rendered pixels differ across machines and across
hardware GL vs. swiftshader. That is why the visual smoke is intentionally
local-only: CI's software GL would not match the committed baselines, so a naive
CI gate would fail even when nothing is wrong. Regenerate and review baselines on
the same machine you validate them on.

**Refresh the baselines whenever rendering output can change** — material,
outline, or shader edits, and especially parser/runtime/WASM changes (e.g. the
`native/third_party/mmd-anim` artifacts), which can alter texture-alpha
classification and morph application. A stale baseline silently encodes the old
behavior; this is how the generated-PMX `texture-alpha-used-uv-cutout` and
`png-hair-shadow-alpha-morph-blend` baselines drifted across the mmd-anim
migration. Workflow:

```bash
# 1. regenerate baselines from current output
npm run render:visual:generated-pmx:baseline
# 2. review every changed PNG (git diff) under
#    test/fixtures/visual-baselines/generated-pmx/
# 3. confirm the smoke gate is green (re-render vs the reviewed baselines)
npm run visual:smoke:generated-pmx
# 4. commit only the reviewed baselines
```

Do not eyeball-judge alpha/edge diffs as pass/fail: a soft-alpha texture's
correct blend can look "too faint" and a stale baseline can look "more correct."
Settle direction with the texture's actual alpha distribution
(`evaluateMmdTextureAlphaRgba` in `src/three/textures.ts`) and check whether the
case applies a morph — generated visual cases have no motion, so material morphs
are inactive (weight 0) at rest.

| Command | Purpose |
| --- | --- |
| `npm run visual:smoke:generated-pmx` | Regenerates focused PMX visual fixtures, renders them, then compares them. |
| `npm run visual:smoke:generated-pmx:flip` | Runs the generated-PMX visual smoke through NVIDIA FLIP. |
| `npm run render:visual:generated-pmx:baseline` | Regenerates the generated-PMX baseline images. |
| `npm run render:visual:skinning` | Regenerates skinning PMX/VMD fixtures and renders the skinning visual profile. |
| `npm run visual:report:skinning` | Compares skinning baseline/current images. |
| `npm run render:visual:real-models` | Renders local user-owned real-model cases. Skips when `MMD_DATA_ROOT` is unset. |
| `npm run render:visual:real-models:baseline` | Writes real-model baseline images. |
| `npm run visual:report:real-models` | Compares real-model baseline/current images. |
| `npm run snapshot:real-models:rest-pose` | Captures rest-pose quaternion snapshots for real-model cases. |
| `npm run snapshot:real-models:rest-pose:baseline` | Writes rest-pose baseline snapshots. |
| `npm run compare:real-models:rest-pose` | Compares rest-pose baseline/current snapshots. |

Real-model scripts expect user-owned assets outside the repository:

```bash
MMD_DATA_ROOT=/path/to/local/mmd-assets npm run render:visual:real-models
```

Generated-PMX visual reports use the repository-local JavaScript metric by
default. To use NVIDIA FLIP, install the official tool and run the generated-PMX
`:flip` variant:

```bash
python -m pip install flip-evaluator
npm run visual:smoke:generated-pmx:flip
```

If the `flip` executable is not on `PATH`, point the script at it with either
`NVIDIA_FLIP_PATH`, `FLIP_EXECUTABLE`, or `--flip-path`:

```bash
NVIDIA_FLIP_PATH=/path/to/flip npm run visual:smoke:generated-pmx:flip
node scripts/visual-regression/compute-metrics.mjs --profile generated-pmx --baseline-dir test/fixtures/visual-baselines/generated-pmx --metric flip --flip-path /path/to/flip
```

The FLIP integration treats NVIDIA's CLI as an optional external evaluator. It
records FLIP `Mean` and `Max` in the JSON report and stores the FLIP error map
under `test-results/visual/**/diff/`.

Do not commit generated files under `test-results/`.

## CI And Release

GitHub Actions CI runs the PR / CI portable gate on Node.js 22 and 24:

```bash
npm ci
npm run lint
npm test
npm run build
npm run check:fixtures
npm run smoke:dist
npm run smoke:types
```

The release workflow package job runs on Node.js 24. It repeats the same gate,
then runs `npm pack --json`. For publishable runs it also validates package
metadata, checks tag/version consistency for `v*.*.*` tags, uploads the npm
package artifact, and publishes only from an explicit tag or a manual workflow
dispatch with publishing enabled.
