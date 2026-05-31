# Self Shadow Implementation Plan

## Goal

Implement MMD self shadow support on top of Three.js' standard shadow pipeline.

This work should not add a separate renderer pass owned by this library. Instead,
it should configure and extend Three.js' built-in shadow pass:

- `renderer.shadowMap.enabled`
- `DirectionalLight.castShadow`
- `Object3D.castShadow`
- `Object3D.receiveShadow`
- `Object3D.customDepthMaterial`
- `Object3D.customDistanceMaterial` only if point-light support is later needed

The first target is directional-light self shadow for MMD models.

## Current State

Already implemented:

- PMX/PMD material shadow flags are parsed:
  - `groundShadow`
  - `selfShadowMap`
  - `selfShadow`
- VMD self shadow frames are parsed as:
  - `frame`
  - `mode`
  - `distance`
- Base mesh and outline proxy shadow flags are synchronized at object level.
- MMD material shader hooks already customize toon, texture, sphere, ambient,
  specular, SDEF, and QDEF paths for normal rendering.

Missing:

- Shadow depth pass does not use the MMD SDEF/QDEF vertex shader path.
- Material-level `selfShadowMap` is not enforced during the shadow pass for a
  multi-material base mesh.
- The receiver shader does not yet explicitly match Babylon-MMD's toon-shadow
  treatment.
- VMD self shadow frames are not sampled or applied to a light/shadow camera.
- The example viewer does not enable a full MMD shadow setup.

## Babylon-MMD Findings

Babylon-MMD has two relevant pieces:

1. VMD self shadow keyframes are parsed, but runtime keyframe application is
   documented as unsupported.
2. MMD shader code modifies the standard lighting path so the shadow factor
   participates in toon ramp evaluation.

Relevant upstream files:

- `src/Loader/Parser/vmdObject.ts`
- `src/Loader/Shaders/mmdStandard.ts`
- `src/Loader/ShadersWGSL/mmdStandard.ts`
- `src/Loader/sdefInjector.ts`

The important design point is not to copy a self-shadow runtime from
Babylon-MMD. There is no complete one to copy. The useful precedent is:

- keep the renderer's normal shadow-map mechanism
- make MMD deformation available to shadow shaders
- fold the shadow factor into MMD toon shading rather than treating it as a
  generic post-lighting multiplier only

## Architecture

### 1. Three Shadow Pass Integration

Use Three.js' `WebGLShadowMap` as-is.

Three uses:

- `object.customDepthMaterial` for directional and spot light shadow maps
- `object.customDistanceMaterial` for point light shadow maps

For the first implementation, support only `DirectionalLight` and
`customDepthMaterial`.

### 2. Material-Level Caster Control

MMD material flags are material-scoped, while Three's `castShadow` is
object-scoped. A single multi-material `SkinnedMesh` cannot safely express:

- group A casts shadow
- group B does not cast shadow

Use a shadow caster proxy approach:

- create one or more shadow-only proxy meshes for material groups whose
  `selfShadowMap` is true
- share geometry attributes and index with the base mesh
- keep the proxy invisible to the color pass
- keep it visible to the shadow pass via `castShadow`
- avoid per-frame geometry cloning

The proxy should follow the existing geometry/proxy constraints:

- do not clone geometry per material
- reuse attributes and index references
- keep setup eager and deterministic

### 3. Receiver Control

Use `selfShadow` to control whether a model surface receives self shadow.

The base mesh or receiving proxy should keep:

- `receiveShadow = true` if any relevant material has `selfShadow`
- material shader logic should still determine the final visual response

If material-level receive control is required later, use shader-side masking or
receiver proxies. Do not force this into the first pass unless visual evidence
shows object-level receive is insufficient.

### 4. Depth Material

Add a helper that builds an MMD shadow depth material:

- base: `THREE.MeshDepthMaterial`
- copy `map` and `alphaTest` behavior from the visible material where needed
- use `RGBADepthPacking` if required by the active Three path
- attach SDEF/QDEF skinning shader code to the depth material
- preserve the relevant default attribute values for absent SDEF/QDEF buffers

Expected API shape:

```ts
createMmdShadowDepthMaterial(sourceMaterial, options)
attachMmdShadowDepthMaterial(mesh, materials, modelMaterials)
```

Exact names can change during implementation, but keep them internal unless a
public API is clearly needed.

### 5. Receiver Shader

Update the existing `MeshToonMaterial` shader hook so shadow attenuation is
compatible with MMD toon shading.

Babylon-MMD's key behavior:

- compute toon ramp from `ndl * shadow`
- use the toon ramp in diffuse accumulation

Three's shader chunk structure is different, so implement this by carefully
patching stable shader chunks in `material-shader-hooks.ts`. Add source-level
tests that pin the injected snippets.

### 6. VMD Self Shadow Frames

Add runtime sampling after the shadow pass foundation is in place.

Expected API shape:

```ts
sampleMmdSelfShadowTrack(frames, frame)
sampleMmdSelfShadowTrackInto(frames, frame, target, hint?)
applyMmdSelfShadowStateToThreeDirectionalLight(light, state, options?)
```

Initial behavior:

- `mode` is held from the latest keyframe at or before the current frame
- `distance` is held from the latest keyframe at or before the current frame
- no interpolation until an MMD-compatible rule is verified

The light helper should affect:

- shadow enabled/disabled state
- directional light shadow camera near/far or equivalent distance parameters
- optional shadow bias defaults if needed

## Implementation Phases

### Phase 1: Shadow Pass Foundation

- Add internal MMD shadow depth material helper.
- Attach SDEF/QDEF skinning to depth material.
- Add unit tests for shader injection and default attributes.
- Verify that `customDepthMaterial` is used by Three's shadow path.

Exit criteria:

- Depth material contains MMD skinning code.
- Alpha-tested textures can still clip shadow casters.
- No public API change unless unavoidable.

### Phase 2: Caster Proxies

- Add shadow-only caster proxy generation for `selfShadowMap` materials.
- Share geometry buffers with the base mesh.
- Ensure proxies are not rendered in the color pass.
- Ensure outline/render-order proxies do not double-cast unless explicitly
  intended.

Exit criteria:

- Materials with `selfShadowMap: false` do not cast into the shadow map.
- Materials with `selfShadowMap: true` cast.
- No per-frame allocations or per-material geometry clones.

### Phase 3: Receiver Shader Parity

- Update toon shader hook so shadow factor affects toon ramp.
- Keep existing sphere/texture/material morph hooks intact.
- Add shader source tests for the new patch points.

Exit criteria:

- Existing material tests still pass.
- New tests prove shadow-aware toon ramp injection exists.

### Phase 4: VMD Self Shadow Runtime

- Add `SelfShadowState` type.
- Add self shadow sampling helpers.
- Add Three directional light application helper.
- Export public helpers only if they are consumer-facing and stable.

Exit criteria:

- Sampling behavior is tested.
- DirectionalLight shadow camera changes are tested.
- README states the exact supported scope.

### Phase 5: Viewer Integration

- Enable `renderer.shadowMap`.
- Configure `keyLight.castShadow`.
- Apply shadow setup when an MMD model is loaded.
- Apply VMD self shadow state during playback if animation has frames.

Exit criteria:

- Viewer renders visible model self shadow with a known fixture.
- No shadow-only proxies appear in the visible render.
- Existing non-shadow viewer behavior remains stable when shadows are disabled.

## Testing Plan

Run focused tests first:

```powershell
rtk npm run test -- --run test/unit/three
rtk npm run test -- --run test/unit/runtime/CameraLightSampling.test.ts
```

Then run:

```powershell
rtk npm run build
```

If Vitest hits the known Windows/Codex `EPERM` spawn issue, record it and use
`npm run build` plus focused direct smoke checks as the local verification.

## Visual TDD Plan

Yes, this can have a visual test that defines "done" before the implementation
is written. Do not rely only on a baseline screenshot diff. A baseline diff can
detect regressions after the feature is working, but it does not prove that self
shadow is functionally present.

Use a dedicated generated-PMX visual profile with paired cases and numeric
acceptance metrics.

### Test Fixtures

Create deterministic generated fixtures under the existing generated PMX flow:

1. `mmd-self-shadow-body-on`
   - a simple single-PMX model with a body receiver surface and a protruding
     in-model caster
   - caster material has `selfShadowMap: true`
   - receiver material has `selfShadow: true`
   - expected result: a clear shadow falls on the body receiver, proving this
     is not only a ground-shadow wiring test

2. `mmd-self-shadow-body-caster-off`
   - same body geometry and camera
   - visible caster material has `selfShadowMap: false`
   - expected result: the body receiver remains lit, with no caster shadow

3. `mmd-self-shadow-receiver-plane`
   - a simple PMX model with a vertical/tilted caster surface and a receiving
     surface
   - caster material has `selfShadowMap: true`
   - receiver material has `selfShadow: true`
   - expected result: a clear shadow falls on the receiver

4. `mmd-self-shadow-caster-flag-off`
   - same geometry and camera
   - caster material has `selfShadowMap: false`
   - receiver material has `selfShadow: true`
   - expected result: the receiver is lit, with no caster shadow

5. `mmd-self-shadow-receiver-flag-off`
   - same geometry and camera
   - caster material has `selfShadowMap: true`
   - receiver material has `selfShadow: false`
   - expected result: no visible self shadow on the receiver

6. `mmd-self-shadow-sdef-depth`
   - a small SDEF/QDEF-deformed caster over a receiver
   - render at a posed frame where linear skinning and SDEF/QDEF create visibly
     different silhouettes
   - expected result: visible shadow silhouette matches the deformed visible
     mesh, not the undeformed or linearly skinned shape

7. `mmd-self-shadow-vmd-distance`
   - same model with a generated VMD containing self shadow frames
   - render two frames:
     - frame A: self shadow disabled or out of range
     - frame B: self shadow enabled/in range
   - expected result: frame B has a measurable receiver darkening region that
     frame A does not

### Metrics

Add a shadow-specific visual metric script instead of relying on whole-image
mean error only.

Suggested script:

```powershell
node scripts/visual-regression/compute-shadow-metrics.mjs `
  --manifest scripts/visual-regression/self-shadow.manifest.json `
  --output-dir test-results/visual/self-shadow/current
```

The script should compare named paired renders:

- `shadow-on` vs `caster-flag-off`
- `shadow-on` vs `receiver-flag-off`
- `vmd-shadow-on` vs `vmd-shadow-off`

Compute:

- `receiverMeanDarkening`: average luminance drop inside a fixed receiver ROI
- `receiverP95Darkening`: high-percentile luminance drop inside that ROI
- `outsideRoiMeanDelta`: average absolute difference outside the receiver ROI
- `shadowPixelRatio`: ratio of ROI pixels whose luminance drops above a small
  threshold

Completion thresholds should be explicit in the manifest:

```json
{
  "metrics": {
    "receiverMeanDarkeningMin": 0.04,
    "receiverP95DarkeningMin": 0.12,
    "shadowPixelRatioMin": 0.08,
    "outsideRoiMeanDeltaMax": 0.015
  }
}
```

These are starting thresholds. Tune once after producing the first known-good
baseline, but keep them strict enough that a no-op implementation fails.

### Red-Green Workflow

1. Add `self-shadow.manifest.json`, generated PMX cases, and
   `compute-shadow-metrics.mjs` first.
2. Run the self-shadow visual smoke before implementation.
3. Confirm the test fails because:
   - no shadow appears, or
   - `selfShadowMap`/`selfShadow` flags do not affect the result, or
   - SDEF/QDEF shadow silhouette does not match the visible mesh.
4. Implement the feature in phases.
5. Re-run the same test until it passes.

Suggested package scripts:

```json
{
  "render:visual:self-shadow": "npm run build && node scripts/fixtures/generate-minimal-pmx.mjs --all-self-shadow && node scripts/fixtures/generate-minimal-vmd.mjs --all-self-shadow && node scripts/visual-regression/render-real-models.mjs --manifest scripts/visual-regression/self-shadow.manifest.json --data-root . --output-dir test-results/visual/self-shadow/current",
  "visual:report:self-shadow": "node scripts/visual-regression/compute-shadow-metrics.mjs --manifest scripts/visual-regression/self-shadow.manifest.json --output-dir test-results/visual/self-shadow/current",
  "visual:smoke:self-shadow": "npm run render:visual:self-shadow && npm run visual:report:self-shadow"
}
```

The names can change during implementation, but keep the test intent:

- no-op implementation fails
- generic object-level shadow pass is not enough to pass all cases
- material flags are observable
- SDEF/QDEF shadow deformation is observable
- VMD self shadow frames are observable

### Done Definition

Self shadow can be considered visually complete for the first pass when:

- `visual:smoke:self-shadow` passes
- the body self-shadow case has measurable darkening on the model receiver
- the generated `shadow-on` case has measurable receiver darkening
- caster and receiver flag-off cases remove the shadow
- SDEF/QDEF depth pass case does not show a detached or undeformed shadow
- VMD self shadow frame on/off changes are visible and metric-positive
- existing generated-PMX visual smoke still passes

## Risks

- Three shader chunk names can drift across Three versions.
  - Mitigation: keep patch points narrow and add source-level tests.
- Material-level receive shadow may need finer control than object-level
  `receiveShadow`.
  - Mitigation: start object-level, add shader masking only with evidence.
- Shadow caster proxy skinning must stay synchronized with the base skeleton.
  - Mitigation: reuse skeleton and shared geometry; avoid cloned runtime state.
- QDEF/SDEF depth shader parity can be visually wrong even if it compiles.
  - Mitigation: add visual fixture once the shader path is in place.

## Non-Goals For First Pass

- Full MME effect compatibility.
- PointLight self shadow.
- WebGPU/WGSL support.
- Perfect MMD renderer parity for every self shadow edge case.
- Runtime mutation of PMX material shadow flags.
