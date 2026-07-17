# WebGPU / TSL PoC

This example is an experimental harness for the 0.7.0 TSL/WebGPU investigation.
It is intentionally separate from the main viewer and does not change the default
WebGL path.

## Run

```bash
npm run build
node scripts/serve-example-viewer.mjs
```

Open `/examples/webgpu-poc/`.

Useful query parameters:

- `backend=forcewebgl|webgpu|webgl`
- `scene=model|ordering|compute-attribute|compute-position-morph|node-mmd-model|node-mmd-outline-groups`
- `model=/test/fixtures/generated/minimal-loader-smoke.pmx`
- `motion=/test/fixtures/generated/skinning/bend-two-bone-90.vmd`
- `shadow=1`
- `outline=1`
- `pixelRatio=2`
- `view=self-shadow-body`

## Verification

Portable gate:

```bash
npm run visual:smoke:webgpu-poc
```

Local observation with headless WebGPU fallback cases:

```bash
npm run visual:smoke:webgpu-poc:local
```

`compute-attribute` is a native-WebGPU-only spike. It writes triangle positions
with `computeAsync()` into a storage buffer and renders the same buffer through
`positionNode = storage.toAttribute()`.

`compute-position-morph` exercises the library CSR integration. Its base triangle
starts off-screen and becomes visible only when a sparse position morph weight is
applied through native WebGPU compute into the geometry position storage attribute.

Optional local real-model observation:

```bash
node scripts/visual-regression/check-webgpu-poc.mjs --data-root F:/MMD --local-model "pmx/Sour式初音ミクVer.1.02/Black.pmx" --output-dir test-results/visual/webgpu-poc-local
```

The public package exports `@yohawing/three-mmd-loader/webgpu` as experimental.
The PoC still imports `/dist/webgpu/index.js` directly so this harness can test
the built local files without package resolution.
