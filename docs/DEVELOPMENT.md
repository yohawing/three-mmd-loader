# Development

This document describes the project-local checks, test layout, and helper
scripts used while developing `@yohawing/three-mmd-loader`.

## Prerequisites

- Node.js 22 or 24.
- npm with the committed `package-lock.json`.
- Optional: Playwright browser dependencies for visual regression scripts.

Install dependencies with:

```bash
npm ci
```

CI and release workflows also use `npm ci`, so do not update dependencies with
another package manager.

## Core Checks

Run these before publishing or opening a release PR:

```bash
npm run lint
npm test
npm run build
npm run smoke:dist
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
| `npm run smoke:dist` | Verifies built package exports and key dist runtime paths. |
| `npm run check:fixtures` | Parses the fixture manifest and writes `tmp/fixture-parse-report.json`. |
| `npm run check:fixtures:physics` | Runs fixture checks with physics-related validation enabled. |
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
- `test/fixtures/generated/**` contains generated PMX assets used for focused
  runtime and loader cases.
- `test/fixtures/oracles/**` contains numeric parity evidence.

To regenerate the minimal PMX fixture used by smoke tests:

```bash
npm run generate:fixtures:minimal-pmx
```

## Dist And Package Smoke

`npm run smoke:dist` runs `scripts/dist-export-smoke.mjs` against the compiled
`dist` output and package export paths. It checks parser exports, runtime
exports, Three.js helpers, physics exports, loader model loading, VMD loading,
VPD loading, pose-to-animation conversion, and bundled toon texture paths.

Run `npm run build` before `npm run smoke:dist` when source files changed.

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

## Visual Regression Scripts

Visual regression scripts are development tools, not release-blocking CI gates.

| Command | Purpose |
| --- | --- |
| `npm run render:visual` | Renders deterministic material cases to `test-results/visual/current/`. |
| `npm run render:visual:baseline` | Writes the same cases to `test-results/visual/baseline/`. |
| `npm run visual:report` | Compares baseline/current images and writes a JSON report plus diffs. |
| `npm run render:visual:real-models` | Renders local user-owned real-model cases. Skips when `MMD_VIEWER_DATA_ROOT` is unset. |
| `npm run render:visual:real-models:baseline` | Writes real-model baseline images. |
| `npm run visual:report:real-models` | Compares real-model baseline/current images. |
| `npm run snapshot:real-models:rest-pose` | Captures rest-pose quaternion snapshots for real-model cases. |
| `npm run snapshot:real-models:rest-pose:baseline` | Writes rest-pose baseline snapshots. |
| `npm run compare:real-models:rest-pose` | Compares rest-pose baseline/current snapshots. |

Real-model scripts expect user-owned assets outside the repository:

```bash
MMD_VIEWER_DATA_ROOT=/path/to/local/mmd-assets npm run render:visual:real-models
```

Do not commit generated files under `test-results/`.

## CI And Release

GitHub Actions run the same core sequence on Node.js 22 and 24:

```bash
npm ci
npm run lint
npm test
npm run build
npm run smoke:dist
```

The release workflow additionally validates that the package is publishable,
checks tag/version consistency for `v*.*.*` tags, creates an npm package, and
publishes only from an explicit tag or a manual workflow dispatch with
publishing enabled.
