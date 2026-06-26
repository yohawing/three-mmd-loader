## Summary

- Prepare `@yohawing/three-mmd-loader` v0.4.0.
- Add a public helper for applying sampled VMD light state to a Three.js directional light.
- Add a portable camera/light VMD visual smoke profile and baselines.
- Refresh generated-PMX visual baselines for the current MMD-compatible shading/outline/alpha output.
- Keep self-shadow visual coverage green by restoring the toon-coordinate floor and tightening the measured ROI to the receiver surface.

## Validation

- `npm run build`
- `npm test`
- `npm run lint`
- `npm run check:fixtures`
- `npm run smoke:dist`
- `npm run smoke:types`
- `npm pack --dry-run --json`
- `npm run visual:smoke:generated-pmx`
- `npm run visual:smoke:camera-light-vmd`
- `npm run visual:smoke:self-shadow`

## Notes

Visual smoke remains a local/manual gate because these baselines are GPU/platform-specific. The generated camera/light VMD files are intentionally recreated by script under the ignored `test/fixtures/generated/**/*.vmd` path.
