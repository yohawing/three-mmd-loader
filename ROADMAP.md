# Public Release Roadmap

This roadmap is organized around what users can rely on from the published
package, not around internal migration order.

## 1. Package Readiness

- Finalize `package.json` metadata, public exports, and release version.
- Decide when to remove `private: true`.
- Keep README wording aligned with the implemented API surface.
- Verify license and acknowledgement wording before publication.

## 2. Parser MVP

- Keep PMX / PMD model parsing APIs stable enough for release candidates.
- Keep PMX / PMD / VMD / VPD metadata parsing stable.
- Preserve clear failures for malformed or unsupported binary input.
- Document which parser outputs are complete and which are inventory-only.

## 3. Three.js Loader MVP

- Keep `ThreeMmdLoader.loadModel(...)` focused on reliable PMX / PMD model
  loading.
- Preserve nonblank `SkinnedMesh` output for supported fixtures.
- Keep texture and toon reference resolution explicit and diagnosable.
- Keep unsupported model features visible through diagnostics or explicit
  errors, not silent failure.

## 4. Motion And Runtime MVP

- Implement VMD motion loading.
- Apply bone and morph animation to runtime state.
- Add a clear frame update API for runtime integration.
- Add VPD pose application or pose-to-animation conversion.

## 5. Runtime Correctness

- Define and preserve MMD transform evaluation order.
- Integrate append transforms and IK behavior into runtime updates.
- Expand PMX IK link-limit and local-axis handling.
- Track runtime compatibility with numeric regression evidence.

## 6. Physics Boundary

- Keep disabled physics as a predictable fallback.
- Keep Ammo physics optional and isolated behind `MmdPhysicsBackend`.
- Document backend setup, runtime expectations, and known compatibility limits.
- Avoid publishing physics as a separate package for the initial release.

## 7. Release Evidence

- Keep build, lint, and package export smoke checks green.
- Add fixture inventory evidence for bundled local fixture sets.
- Add release-owned Three.js screenshot smoke checks once visual baselines exist.
- Track limitations in README until the behavior is release-ready.
