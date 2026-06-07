# Native Layout

`native/` is reserved for native dependencies that are built or copied as part
of this package. The parser/runtime WASM wrapper now comes from the
`native/third_party/mmd-anim` submodule and is synchronized by
`npm run build:mmd-anim`.

Current native content:

- `native/bullet-mmd`: MMD-specific Bullet binding source and generated
  browser backend artifacts.
- `native/third_party/bullet3`: Bullet source used by the Ammo MMD physics
  build path.
