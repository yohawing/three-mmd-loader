import { dom, setStatus } from "./dom.js";

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

export function updateDiagnosticsPanel(model) {
  if (!dom.debugDiagnostics || !dom.debugDiagnosticsList) {
    return;
  }
  const metadata = model?.mesh?.userData?.mmdModel?.metadata;
  const diagnostics = metadata?.diagnostics ?? [];
  if (diagnostics.length === 0) {
    dom.debugDiagnostics.hidden = true;
    return;
  }
  dom.debugDiagnosticsList.textContent = "";
  for (const diagnostic of diagnostics) {
    const li = document.createElement("li");
    li.className = `debug-diagnostic-item debug-diagnostic-${diagnostic.level}`;
    const badge = document.createElement("span");
    badge.className = "debug-diagnostic-badge";
    badge.textContent = diagnostic.category ?? diagnostic.level;
    li.appendChild(badge);
    const code = document.createElement("code");
    code.textContent = diagnostic.code;
    li.appendChild(code);
    const msg = document.createElement("span");
    msg.className = "debug-diagnostic-message";
    msg.textContent = diagnostic.message;
    li.appendChild(msg);
    dom.debugDiagnosticsList.appendChild(li);
  }
  if (dom.debugDiagnosticsCount) {
    dom.debugDiagnosticsCount.textContent = `(${diagnostics.length})`;
  }
  dom.debugDiagnostics.hidden = false;
}

export function clearDiagnosticsPanel() {
  if (!dom.debugDiagnostics) {
    return;
  }
  if (dom.debugDiagnosticsList) {
    dom.debugDiagnosticsList.textContent = "";
  }
  if (dom.debugDiagnosticsCount) {
    dom.debugDiagnosticsCount.textContent = "";
  }
  dom.debugDiagnostics.hidden = true;
}

export function updateBoneDetectionPanel(detectionResult) {
  if (!dom.debugBoneDetection || !dom.debugBoneDetectionContent) {
    return;
  }
  if (!detectionResult) {
    dom.debugBoneDetection.hidden = true;
    return;
  }
  const classification = detectionResult.hasStandardSkeleton
    ? "Character"
    : "Stage / Background";
  const standardCount = detectionResult.standard.present.length;
  const semiStandardCount = detectionResult.semiStandard.present.length;
  dom.debugBoneDetectionContent.textContent =
    `${classification} — standard: ${standardCount}/23, semi-standard: ${semiStandardCount}/16`;
  dom.debugBoneDetection.hidden = false;
}

export function clearBoneDetectionPanel() {
  if (!dom.debugBoneDetection) {
    return;
  }
  if (dom.debugBoneDetectionContent) {
    dom.debugBoneDetectionContent.textContent = "";
  }
  dom.debugBoneDetection.hidden = true;
}
