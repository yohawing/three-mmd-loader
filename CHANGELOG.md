# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

## [0.3.0] - 2026-06-06

### Added

- Add the mmd-anim backed parser/runtime path and make the mmd-anim runtime the
  default PMX runtime path.
- Add experimental custom runtime support for plugging alternate model runtime
  implementations into the Three.js loader.
- Add VMD camera and light motion state sampling/application helpers.
- Add Three.js shadow-map based self-shadow support with VMD self-shadow
  sampling.
- Add the experimental direct-buffer MMD Bullet browser backend.
- Add the preferred `ThreeMmdModel.root`, `ThreeMmdModel.setAnimation(...)`,
  `ThreeMmdModel.update(...)`, `ThreeMmdModel.diagnostics.textures`,
  `ThreeMmdLoadModelOptions.outline`, and
  `ThreeMmdLoadModelOptions.materialRenderOrder` API surface.

### Changed

- Move native dependencies under `native/third_party/` and keep the MMD Bullet
  binding source under `native/bullet-mmd/`.
- Rename the MMD Bullet browser artifact and C ABI prefix to `mmd_bullet`.
- Consolidate native WASM build notes into `docs/DEVELOPMENT.md`.
- Update the Vitest release test runner to 4.1.8 and clear the npm audit gate.

### Fixed

- Disable the stale Yw MMD core WASM loader path in favor of the mmd-anim
  generated wrapper.
- Avoid CI source submodule checkout issues.
- Preserve parsed scene state across the custom runtime path.

### Deprecated

- Deprecate `ThreeMmdModel.object`, `ThreeMmdModel.textureDiagnostics`,
  `ThreeMmdLoadModelOptions.outlines`, and
  `ThreeMmdLoadModelOptions.renderOrderProxies`. These aliases now emit a
  one-time runtime warning when used and are planned for removal in the next
  breaking release. Root exports remain supported.

## [0.2.2] - 2026-05-28

### Added

- Add VMD camera motion playback support in the viewer and Three.js runtime
  helper path.
- Add localized viewer UI copy and expanded asset/playback controls for local
  MMD verification workflows.

### Changed

- Reduce per-frame runtime allocations in animation, append transform, and IK
  evaluation paths.
- Simplify the viewer fixture/preset UI when no local fixture inventory is
  available, including folder-only model/background loading.
- Clarify the release flow from `develop` to `main` before tag-triggered npm
  publishing.
- Refresh README demo and compatibility notes for the current viewer and
  runtime surface.

### Fixed

- Honor VMD IK enable tracks and camera state when applying motion data.
- Place the viewer import map before module loads so browser module resolution
  is initialized before dependent scripts execute.
- Address parser/runtime review follow-ups from the post-0.2.1 changes.

## [0.2.1] - 2026-05-26

### Added

- Add viewer asset presets and expanded loader controls for local playback
  verification.
- Add local Ammo playback stability coverage for dynamic bone anchoring and
  hierarchy behavior.
- Add generated visual regression fixtures for material morph alpha and hair
  shadow transparency cases.

### Changed

- Pack VMD tracks into compact runtime storage by default to reduce animation
  memory overhead.
- Improve PMX twist IK solving and default IK convergence tolerance behavior.
- Avoid per-frame cached ancestor allocation in the physics path.
- Expand viewer loading helpers for model, motion, camera, audio, and
  background assets.

### Fixed

- Guard MMD texture alpha transparency so stale morph alpha state does not leak
  into material transparency.
- Align dynamic-with-bone hierarchy handling in Ammo physics.
- Gate fixed-axis IK behavior to hand twist chains.
- Align dist export smoke coverage with packed VMD tracks.

## [0.2.0] - 2026-05-25

### Added

- Add the nanoem-backed WASM parser core and route viewer model loading through
  the WASM-backed path when available.
- Add DDS texture loading support, including viewer `DDSLoader` integration and
  diagnostics for unsupported texture formats.
- Add PMM parser entry points and tests for PMM project metadata parsing.
- Add generated-PMX visual regression cases and committed baselines for outline,
  material ordering, and texture-alpha behavior.
- Add local native-nanoem playback oracle tooling for motion/runtime parity
  checks.
- Add `ThreeMmdModel.object` as the scene-ready root containing the base mesh
  and generated proxy meshes.
- Add a release checklist under `docs/RELEASE.md`.

### Changed

- Move WASM support under the parser module pipeline and build the generated
  WASM wrapper in CI/release packaging instead of committing generated binaries.
- Default the Three.js loader to the `mmdCompat` draw path with PMX-order
  two-pass outline rendering.
- Remove the earlier `outlineMode` and `renderOrderProxies` options in favor of
  the `mmdCompat` compatibility path.
- Improve outline screen-space width matching and runtime proxy mesh
  synchronization.
- Decouple local corpus smoke tests from the local asset database and document
  the local corpus/playback oracle workflows.
- Link the release checklist from the README and development documentation.

### Fixed

- Parse morph-only VMD files that omit the camera section.
- Treat oversized optional VMD tail counts as trailing data instead of failing
  the parse.
- Harden WASM parser loading and texture handling review issues.
- Keep third-party submodules out of the lint target and generate minimal PMX
  fixtures for WASM metadata tests when needed.

## [0.1.2] - 2026-05-20

### Changed

- Relax the Three.js peer dependency range to allow newer 0.x releases.
- Verify the development toolchain against Three.js 0.184.x.

## [0.1.1] - 2026-05-20

### Changed

- Harden the GitHub Actions release workflow for npm trusted publishing.
- Add fixture parsing to the release gate before packaging.
- Use the HTTPS GitHub repository URL in package metadata.

## [0.1.0] - 2026-05-19

Initial public release candidate for `@yohawing/three-mmd-loader`.

### Added

- PMX and PMD model parsing and Three.js `SkinnedMesh` assembly.
- VMD motion parsing and runtime application for bone and morph animation.
- VPD pose parsing and pose-to-animation loading.
- `ThreeMmdLoader` facade for model, animation, and pose loading.
- Default MMD runtime with frame evaluation, ticking, append transforms, and CCD IK.
- PMX layer-order append transform evaluation.
- VMD Bezier interpolation for animation sampling.
- Material, toon texture, sphere texture, outline, and render-order helpers.
- Texture diagnostics for recoverable texture resolution failures.
- Disabled physics backend and isolated Ammo.js physics backend boundary.
- Public package entry points:
  - `@yohawing/three-mmd-loader`
  - `@yohawing/three-mmd-loader/parser`
  - `@yohawing/three-mmd-loader/runtime`
  - `@yohawing/three-mmd-loader/three`
  - `@yohawing/three-mmd-loader/physics`
- Dist export smoke tests and fixture-based release evidence.
- Local visual regression scripts for material cases and user-owned real-model checks.

### Known Limitations

- Camera motion is parsed but not applied as a Three.js camera runtime feature.
- IK link-local / parent-local clamps support the fixed single-axis case; multi-axis behavior is partial.
- Ammo.js behavior is available through an explicit backend boundary and is not claimed to be native-MMD equivalent.
- Real-model visual regression assets are local-only and are not bundled with the package.
- PMM project files and `.x` / `.vac` accessories are out of scope for the initial release.
