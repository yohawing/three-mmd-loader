# Native layout

`yw_mmd_core.cc` is the Emscripten entry point for the generated wasm module
under `src/parser/wasm/generated/`.

Most exported wrapper functions live in feature-scoped include files under
`native/yw_mmd_core/`:

- `metadata_exports.inc`: health/version, metadata-only parsing, model text helpers.
- `model_cache.inc`: shared model cache population helpers.
- `model_exports.inc`: model load/free and geometry buffer pointer exports.
- `material_exports.inc`, `bone_exports.inc`, `morph_exports.inc`: model object accessors.
- `label_physics_exports.inc`: display frame, rigid body, joint, and soft-body accessors.
- `motion_exports.inc`: VMD motion cache and keyframe accessors.

The nanoem dependency is checked out as a git submodule at
`native/third_party/nanoem`. `scripts/build-wasm.ps1` compiles this wrapper
with nanoem's core C source and Emscripten extension source into
`yw_mmd_core.js` and `yw_mmd_core.wasm`.

Keep exported `yw_mmd_*` function names in sync with
`scripts/build-wasm.ps1` and the TypeScript wasm bindings when adding native
APIs.
