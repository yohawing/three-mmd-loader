# Development

This document describes the project-local checks, test layout, and helper
scripts used while developing `@yohawing/three-mmd-loader`.

## Prerequisites

- Node.js 22 or 24.
- npm with the committed `package-lock.json`.
- Optional: Emscripten via emsdk when rebuilding the generated WASM wrapper.
- Optional: Playwright browser dependencies for visual regression scripts.

Install dependencies with:

```bash
npm ci
```

CI and release workflows also use `npm ci`, so do not update dependencies with
another package manager.

## WASM Wrapper Build

`npm run build` copies the locally generated WASM wrapper into `dist`; it does
not rebuild the native wrapper. Rebuild it before `npm run build` when the
generated wrapper is missing, or when files under `native/**` or the WASM export
surface changed:

```bash
npm run build:wasm
```

`build:wasm` runs `node scripts/build-wasm.mjs` and spawns Emscripten `em++`.
Emscripten is not bundled as an npm dependency. Install it with the official
emsdk and make it discoverable by one of these methods:

- Set `EMSDK` to the emsdk directory.
- Place `emsdk` under the repository root.
- Place `emsdk` next to the repository directory.
- Activate emsdk so `em++` is available on `PATH`.

The script supports Windows, macOS, and Linux as long as Emscripten is
available. Generated `.js` and `.wasm` files are written to
`src/parser/wasm/generated/` and are intentionally not checked in. The
hand-written `yw_mmd_core.d.ts` declaration file remains in source control.

CI and release packaging install emsdk `5.0.7`, run `npm run build:wasm`, then
run the normal build/test/smoke sequence. The npm tarball contains the generated
WASM files only through `dist/**`.

## Core Checks

Run these before publishing or opening a release PR. The full operator-facing
release checklist is in [RELEASE.md](./RELEASE.md).

```bash
npm run lint
npm test
npm run build
npm run smoke:dist
npm run smoke:types
npm run check:fixtures
npm pack --dry-run --json
```

Command summary:

| Command | Purpose |
| --- | --- |
| `npm run lint` | Runs ESLint with `--max-warnings 0`. |
| `npm run lint:fix` | Applies ESLint auto-fixes where available. |
| `npm test` | Runs the Vitest unit and integration suite. |
| `npm run build` | Compiles TypeScript and copies bundled MMD toon BMP assets into `dist`. |
| `npm run build:wasm` | Rebuilds the nanoem-backed WASM wrapper into `src/parser/wasm/generated/`. |
| `npm run bench:wasm:perf -- <model> [repeat]` | Compares WASM and TypeScript fallback `loadModel` speed plus `loadModel + createThreeBufferGeometry` total time against a local PMX / PMD file. |
| `npm run smoke:dist` | Verifies built package exports and key dist runtime paths. |
| `npm run smoke:types` | Packs the library, installs it into a temporary TypeScript consumer, and verifies root/subpath imports with `tsc --noEmit`. |
| `npm run check:fixtures` | Parses the fixture manifest and writes `tmp/fixture-parse-report.json`. |
| `npm run check:fixtures:physics` | Runs fixture checks with physics-related validation enabled. |
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

## Local Playback Oracle Tests

The repository also has a local-only playback comparison path for runtime
motion evaluation. It treats native nanoem as the authority, stores a numeric
oracle dump locally, registers the same model/motion in the local fixture
inventory, then compares runtime evaluation output against that oracle.

The committed consumers are:

- `test/integration/animation/local-oracle-playback.test.ts`
- `test/helpers/nativeNanoemOracle.ts`
- `test/helpers/localPlaybackFixtures.ts`

All local playback data follows the same separation rule as the local corpus:
the generator, inventory, and `.local.json` oracle files are developer-local
and are not committed.

### Step 1: Generate the native nanoem oracle

Oracle generation uses the local-only, gitignored script
`scripts/local/oracle/native-nanoem-dump.mjs`. The repository does not ship this
script, so fresh clones will not have it. Local developers provide that script
at the gitignored path when they need to refresh playback evidence.

The local generator builds a native nanoem CLI from the
`native/third_party/nanoem` git submodule with emsdk clang, runs it headlessly,
and writes `native-nanoem-runtime-dump` JSON. Before running it, initialize the
submodule and make emsdk available through the same discovery paths used by
`scripts/build-wasm.mjs`:

```bash
git submodule update --init --recursive native/third_party/nanoem
```

Then generate an oracle from repository-relative or placeholder paths:

```bash
node scripts/local/oracle/native-nanoem-dump.mjs \
  --model <model.pmx|model.pmd> \
  --motion <motion.vmd> \
  --frames 0,30,60 \
  --physics none \
  --out test/fixtures/oracles/<case>.local.json
```

`test/fixtures/oracles/*.local.json` is gitignored. Keep physics disabled for
the initial oracle path; the default comparison stage is still named `physics`
because it represents the final post-IK runtime snapshot in the oracle format
when physics is off.

### Step 2: Register the playback fixture

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
- `oracle`: Path to the oracle JSON generated in Step 1, resolved from the
  inventory `basePath`.
- `oracleKind: "native-nanoem-runtime-dump"`: Oracle reader discriminator.
- `stage`: Runtime stage to compare. The default is `physics`, which is the
  post-IK final pose when the oracle was generated with `--physics none`.
- `frames`: Frame numbers included in the oracle.
- `watchBones`: Bone names that exist in `oracle.model.bones`.
- `matrixEpsilon` / `morphEpsilon`: Numeric tolerances. Both default to
  `1e-4`.
- `skipReason`: Optional local-only reason to skip a case while keeping the
  model, motion, and oracle registration documented in the inventory.

The authoritative schema is
`test/fixtures/fixtures.schema.json` under `paths.playbackSmoke.cases`.

For the committed cube fixture, the minimal local inventory looks like this:

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
          "oracle": "oracles/test_1bone_cube.local.json",
          "oracleKind": "native-nanoem-runtime-dump",
          "stage": "physics",
          "frames": [0, 1, 2],
          "watchBones": ["全ての親"]
        }
      ]
    }
  }
}
```

Generate that oracle with:

```bash
node scripts/local/oracle/native-nanoem-dump.mjs \
  --model test/fixtures/test_1bone_cube.pmx \
  --motion test/fixtures/test_1bone_cube_motion.vmd \
  --frames 0,1,2 \
  --physics none \
  --out test/fixtures/oracles/test_1bone_cube.local.json
```

Real models such as Tda, Sour, or Lat Miku cases use the same three-step flow.
Keep their asset paths in the local inventory; do not commit user-owned corpus
paths.

### Step 3: Run the playback comparison

Run the local playback test directly:

```bash
npm test -- test/integration/animation/local-oracle-playback.test.ts
```

When `test/fixtures/fixtures.local.json` is absent, has no playback cases, or a
case's model/motion/oracle path is missing, the test is skipped and CI remains
green. For runnable cases, the test loads the model and VMD through the
runtime path, calls `DefaultMmdRuntime.evaluate(frame / 30, { physics: false })`,
extracts each watched bone's world matrix in MMD coordinates, and compares it
with the matching native nanoem oracle stage. Morph weights are compared when
the oracle stage includes them.

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

| Command | Purpose |
| --- | --- |
| `npm run render:visual` | Renders deterministic material cases to `test-results/visual/current/`. |
| `npm run render:visual:baseline` | Writes the same cases to `test-results/visual/baseline/`. |
| `npm run visual:report` | Compares baseline/current images and writes a JSON report plus diffs. |
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

Do not commit generated files under `test-results/`.

## CI And Release

GitHub Actions run the same core sequence on Node.js 22 and 24:

```bash
npm ci
npm run build:wasm
npm run lint
npm test
npm run build
npm run smoke:dist
npm run smoke:types
```

The release workflow additionally validates that the package is publishable,
checks tag/version consistency for `v*.*.*` tags, creates an npm package, and
publishes only from an explicit tag or a manual workflow dispatch with
publishing enabled.
