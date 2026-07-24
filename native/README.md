# Native Layout

`native/` is reserved for native dependencies that are built or copied as part
of this package. The parser/runtime WASM wrapper now comes from the
`native/third_party/mmd-anim` submodule and is synchronized by
`npm run build:mmd-anim`.

Current native content:

- `native/mmd-anim-bullet`: generated browser artifacts compiled from the
  mmd-anim submodule and published under the stable `mmd_bullet*` names.
