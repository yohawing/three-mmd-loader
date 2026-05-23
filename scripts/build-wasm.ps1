$ErrorActionPreference = "Stop"

& node (Join-Path $PSScriptRoot "build-wasm.mjs")

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
