# Changelog

All notable changes to this project will be documented in this file.

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
