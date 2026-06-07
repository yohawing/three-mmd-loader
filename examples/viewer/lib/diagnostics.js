import { setStatus } from "./dom.js";

export function reportTextureDiagnostics(model) {
  const diagnostics = model.diagnostics?.textures ?? model.textureDiagnostics ?? [];
  if (diagnostics.length === 0) {
    return;
  }

  const summaryRows = diagnostics.map((diagnostic) => ({
    level: diagnostic.level,
    code: diagnostic.code,
    materialIndex: diagnostic.materialIndex,
    textureKind: diagnostic.textureKind,
    path: diagnostic.path
  }));

  const readableRows = summaryRows.map(
    (diagnostic) => {
      const hint =
        diagnostic.code === "TEXTURE_FORMAT_UNSUPPORTED"
          ? " — DDS textures are not natively supported; supply a ddsLoader option to enable DDS"
          : "";
      return `${diagnostic.level} ${diagnostic.code} material=${diagnostic.materialIndex} kind=${diagnostic.textureKind} path=${diagnostic.path}${hint}`;
    }
  );

  globalThis.console.warn("[mmd-viewer] texture diagnostics:", summaryRows, readableRows);
  setStatus(
    `Loaded with ${diagnostics.length} texture ${diagnostics.length === 1 ? "warning" : "warnings"} (see console)`,
    "warning"
  );
}
