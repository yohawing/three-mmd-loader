# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

## [0.7.0] - 2026-07-23

### Added

- Add the experimental `@yohawing/three-mmd-loader/webgpu` entry point with a
  TSL material pipeline, native WebGPU support, and a force-WebGL fallback for
  portable comparison and integration.
- Add dedicated MMD self-shadow handling across the baseline WebGL, TSL
  force-WebGL, and native WebGPU paths, including VMD shadow mode and intensity
  synchronization.
- Add sparse position and UV morph evaluation for the WebGPU pipeline and a
  high-level pipeline facade for model attachment, rendering, and disposal.
- Add generated-PMX, self-shadow, viewer background, and backend-parity visual
  coverage for the new rendering paths.

### Changed

- Align toon and self-shadow composition with MMD 9.32 behavior. Existing WebGL
  applications with `shadowMap.enabled = true` may render differently because
  MMD toon selection now responds to the scene self-shadow state.
- Update the bundled mmd-anim WASM runtime and parser artifacts to v0.3.1.
- Expose the structured PMM document and project-summary types from the parser
  entry point, and represent nullable fields from the WASM JSON contract
  explicitly in the public TypeScript types.
- Preserve the active camera when loading a model or switching renderer
  backends, and adapt viewer near/far planes to scene bounds without moving the
  camera.
- Consolidate duplicated viewer backend parameters, model-load guards, sparse
  morph builders, and visual-regression helpers.

### Fixed

- Fix generated-PMX lighting, gamma blending, additive sphere contribution,
  texture alpha, and double-sided alpha rendering in the TSL pipeline.
- Fix self-shadow lifecycle, receiver filtering, visibility composition,
  camera-load re-entry, and shadow-mode synchronization across viewer backends.
- Classify soft-alpha-dominant textures as alpha-blended without relying on a
  texture-name heuristic.
- Wait for material textures before invoking a custom runtime factory so the
  runtime receives the fully initialized mesh materials.
- Reject malformed non-object WASM JSON responses and normalize missing parser
  arrays and records at the adapter boundary.
- Remove a racy idle shader prewarm path while retaining asynchronous shader
  compilation for viewer mode switches.

## [0.6.0] - 2026-07-11

### Added

- Add experimental structured parser APIs for PMM projects and DirectX `.x` /
  `.vac` accessory data, backed by the bundled mmd-anim WASM module. Asset
  resolution, scene construction, textures, attachment, and playback remain
  application responsibilities.
- Add public MMD asset classification and file-index helpers for resolving
  models, motions, audio, backgrounds, and accessory files from local folders.
- Add standard and semi-standard MMD bone detection APIs and surface the result
  in the example viewer diagnostics.
- Add viewer diagnostics, frame capture, and before/after comparison tools, plus
  a phase-oriented model load benchmark.

### Changed

- Update the bundled mmd-anim WASM runtime to the v0.2.0 release and
  carry PMX local-axis frames into IK link-limit evaluation.
- Keep PMM and accessory support parser-only; remove incomplete PMM and `.x`
  scene-loading controls from the example viewer.
- Avoid redundant rest-pose evaluation during runtime initialization.
- Expand structured diagnostics with categories and improve local fixture
  classification without treating local-only assets as portable release gates.

### Fixed

- Align toon and self-shadow composition more closely with MMD reference output,
  including the non-self-shadow toon ramp.
- Correct sphere UVs, additive sphere contribution, non-toon lighting, texture
  alpha handling, transparency classification, and outline polygon offset for
  generated and real-model visual cases.
- Apply PMX local-axis bases while solving constrained IK links and add focused
  regression coverage for fixed/local-axis rigs.

## [0.5.0] - 2026-07-03

### Added

- Add generated PMX/VMD parity coverage comparing TypeScript runtime output
  against the mmd-anim/WASM-backed runtime for sampling, append transforms, IK,
  morph sync, camera/light tracks, and physics handoff state.
- Add WASM-backed PMX parity fixtures for SDEF geometry, flip morphs, material
  flag behavior, split ABI routing, and adapter diagnostics.
- Add source-level hot-path allocation guards for runtime animation, append
  transforms, IK solving, and related scratch-buffer helpers.

### Changed

- Promote the MMD-optimized Bullet backend as the recommended physics path in
  README guidance and the example viewer.
- Remove the normal PMX load-time TypeScript parser merge fallback from
  `MmdAnimBackedCore`; the WASM-backed path now requires the split parsed-model
  or non-geometry-plus-geometry adapter result.
- Reduce per-frame allocations across animation sampling, append transform
  application, IK world-matrix composition, IK solve scratch storage, and
  runtime debug/morph fallback paths.
- Move local planning and release-runbook files out of the tracked public
  surface, and add the portable fixture check to PR CI.

### Fixed

- Keep pre-append runtime scratch state synchronized after `resetPose()` so a
  subsequent `clearAnimation()` and `evaluate()` does not reuse stale pose data.
- Classify local playback oracle skips by runtime bug, oracle limitation, or
  unavailable asset so local-only evidence is not confused with portable
  release gates.
- Keep Sour PMX plus `ラビットホール.vmd` documented as a local-only IK
  limit/knee-instability regression case without redistributing user-owned
  assets.

## [0.4.0] - 2026-06-30

### Added

- Add a public helper for applying sampled VMD light state to a Three.js
  directional light.
- Add a portable camera/light VMD visual smoke profile so VMD camera and light
  tracks are verified through rendered output.
- Add a morph-split load option so models with split morph body meshes can keep
  the split rendering path when needed.

### Changed

- Rework the MMD-compatible material shader path around gamma-space
  `diffuse * light + ambient`, MMD default light color/direction, half-lambert
  toon response, and view-space sphere texture coordinates.
- Update the bundled mmd-anim WASM runtime/parser artifacts to v0.1.7.
- Route VMD camera and light sampling through the bundled mmd-anim WASM track
  sampler while keeping caller-owned scratch buffers on playback paths.
- Update the viewer light-motion path to use the shared VMD light helper.
- Refresh generated-PMX visual baselines against the current MMD-compatible
  shading, alpha, and outline behavior.

### Fixed

- Draw inverted-hull outlines as flat texture-independent edges and keep outline
  width stable across hi-DPI and supersampled rendering.
- Preserve MMD-style alpha behavior for TGA alpha blending and texture cutout
  outline cases under geometry-aware alpha evaluation.
- Avoid per-frame allocations while syncing MMD light direction/material shader
  uniforms during playback.
- Interpret VMD light direction as the MMD light travel direction when applying
  it to a Three.js directional light.
- Match custom toon ramp sampling more closely to MMD output while preserving
  the generated PMX GoldenOracle fixture.
- Exclude the local-only viewer deploy runbook from the npm package.
- Reuse cached TGA blob texture decodes so materials sharing the same in-memory
  texture source do not decode duplicate image data.

### Test

- Add rendered-output visual coverage for camera VMD and light VMD application.
- Add generated visual baselines for edge-order and texture alpha cutout cases.
- Document local-only visual baseline refresh requirements for rendering
  changes.
- Relax generated-PMX visual thresholds to accept the current local rendering
  output.

## [0.3.1] - 2026-06-16

### Added

- Add a bundled viewer stand-in model for motion-first local playback flows.

### Changed

- Update the bundled mmd-anim WASM runtime/parser artifacts to v0.1.3.

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
