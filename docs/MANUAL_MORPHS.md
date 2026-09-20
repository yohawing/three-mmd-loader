# Manual morph input

Pass `morphOverrides` to `model.update(seconds, options)` or
`model.updateAsync(seconds, options)`. The same option is accepted by runtime
`evaluate`, `tick`, and worker updates.

```ts
const morphOverrides = {
  indices: new Uint32Array([morphIndex]),
  weights: new Float32Array([0.7])
};

model.update(seconds, { morphOverrides });
// Reuse the buffers while dragging a slider.
morphOverrides.weights[0] = 0.3;
model.update(seconds, { morphOverrides });
// Omission releases all overrides for this evaluation.
model.update(seconds);
```

Indices refer to the original PMX morph order, including bone, material, vertex,
UV, group, and flip morphs. Both arrays must have equal lengths. Indices must be
in range and weights must be finite; weights are not clamped. A weight of zero
is an explicit override. Duplicate indices use the last supplied value.

The runtime samples a fresh VMD pose (or rest pose), replaces the specified
direct weights, expands group/flip contributions, applies bone morphs, and
evaluates Append/IK. A child override replaces its direct weight; it does not
suppress contributions from a parent group. Rendering and physics consume the
resulting evaluated weights through their existing synchronization paths.

Overrides last for one evaluation only. Repeated evaluation does not accumulate
bone offsets. A seek sets the timeline position; pass the overrides again to the
following update. With a Host Rig, overrides replace the supplied host pose's
direct weights without modifying the caller's buffers.

Worker updates copy the input through the existing message transport. Ordinary
updates can return the last published pose; await `updateAsync` when the caller
needs the requested pose to be applied before proceeding.

The WASM runtime must include `evaluateClipFrameWithMorphOverrides` and
`evaluateRestPoseWithMorphOverrides`. Rebuild with `npm run build:mmd-anim` and
`npm run build` after updating the mmd-anim submodule. Older WASM modules continue
to support ordinary evaluation, but a nonempty override request throws an error
instead of silently ignoring the input.
