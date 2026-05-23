import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("example viewer source", () => {
  it("clears model resources through the texture-aware dispose helper", async () => {
    const modelSource = await readFile("examples/viewer/lib/model-loading.js", "utf8");
    const disposeSource = await readFile("examples/viewer/lib/dispose.js", "utf8");

    expect(modelSource).toContain("disposeModelResources(state.currentModel)");
    expect(disposeSource).toContain('import { disposeMmdModel } from "../../../dist/three/index.js"');
    expect(disposeSource).toContain("disposeMmdModel(model)");
    expect(disposeSource).not.toContain("function collectMaterialTextures(material)");
  });

  it("surfaces texture diagnostics from loaded models", async () => {
    const modelSource = await readFile("examples/viewer/lib/model-loading.js", "utf8");
    const diagnosticsSource = await readFile("examples/viewer/lib/diagnostics.js", "utf8");
    const domSource = await readFile("examples/viewer/lib/dom.js", "utf8");
    const styles = await readFile("examples/viewer/styles.css", "utf8");

    expect(modelSource).toContain("reportTextureDiagnostics(state.currentModel)");
    expect(diagnosticsSource).toContain("model.textureDiagnostics ?? []");
    expect(diagnosticsSource).toContain('globalThis.console.warn("[mmd-viewer] texture diagnostics:"');
    expect(diagnosticsSource).toContain('setStatus(');
    expect(diagnosticsSource).toContain('"warning"');
    expect(domSource).toContain("dom.topBar?.classList.toggle(\"is-warning\"");
    expect(styles).toContain(".top-bar.is-warning .status");
  });

  it("keeps same-folder PMX variants in a switcher instead of reloading them during folder drops", async () => {
    const mainSource = await readFile("examples/viewer/main.js", "utf8");
    const domSource = await readFile("examples/viewer/lib/dom.js", "utf8");
    const modelSource = await readFile("examples/viewer/lib/model-loading.js", "utf8");
    const stateSource = await readFile("examples/viewer/lib/state.js", "utf8");
    const html = await readFile("examples/viewer/index.html", "utf8");
    const styles = await readFile("examples/viewer/styles.css", "utf8");

    expect(html).toContain('id="model-switcher"');
    expect(html).not.toContain('id="model-name"');
    expect(html).toContain('aria-label="Selected model"');
    expect(domSource).toContain('modelSwitcher: document.querySelector("#model-switcher")');
    expect(domSource).not.toContain("modelNameText");
    expect(stateSource).toContain("currentFolderTextureMap: undefined");
    expect(stateSource).toContain("currentFolderPmxFiles: []");
    expect(modelSource).toContain("state.currentFolderPmxFiles = [createModelSwitcherEntry(source, label)]");
    expect(modelSource).toContain("state.currentFolderTextureMap = textureMap");
    expect(modelSource).toContain("state.currentFolderPmxFiles = modelFiles");
    expect(modelSource).toContain("updateModelSwitcher(modelFile)");
    expect(modelSource).toContain("findMmdModelFiles");
    expect(modelSource).toContain("createMmdTextureMapFromFiles");
    expect(modelSource).toContain("export async function switchFolderModel(modelFile)");
    expect(modelSource).toContain('setStatus(`Switching to ${modelFile.name}`, "loading")');
    expect(modelSource).toContain("createModelLoader({ textureMap: state.currentFolderTextureMap })");
    expect(modelSource).toContain("dom.modelSwitcher.hidden = state.currentFolderPmxFiles.length === 0");
    expect(modelSource).toContain("preserveModelSwitcher: true");
    expect(mainSource).toContain("modelFileKey(file) === dom.modelSwitcher.value");
    expect(styles).toContain(".loaded-files > select");

    const dropHandler = modelSource.slice(
      modelSource.indexOf("function handleDroppedFiles"),
      modelSource.indexOf("async function collectDroppedFiles")
    );
    expect(dropHandler).toContain("await loadModelFolder(files)");
    expect(dropHandler).toContain("if (!shouldLoadModelFolder)");
  });

  it("keeps same-folder VMD variants in a motion switcher instead of sequentially loading them", async () => {
    const mainSource = await readFile("examples/viewer/main.js", "utf8");
    const domSource = await readFile("examples/viewer/lib/dom.js", "utf8");
    const modelSource = await readFile("examples/viewer/lib/model-loading.js", "utf8");
    const motionSource = await readFile("examples/viewer/lib/motion-loading.js", "utf8");
    const stateSource = await readFile("examples/viewer/lib/state.js", "utf8");
    const html = await readFile("examples/viewer/index.html", "utf8");

    expect(html).toContain('id="motion-switcher"');
    expect(html).toContain('aria-label="Selected motion"');
    expect(html).not.toContain('id="motion-name"');
    expect(domSource).toContain('motionSwitcher: document.querySelector("#motion-switcher")');
    expect(domSource).not.toContain("motionNameText");
    expect(stateSource).toContain("currentMotionVmdFiles: []");
    expect(mainSource).toContain("state.currentMotionVmdFiles = [file]");
    expect(modelSource).toContain("state.currentMotionVmdFiles = vmdFiles");
    expect(motionSource).toContain("export const findVmdFiles = findMmdMotionFiles");
    expect(motionSource).toContain("findMmdMotionFiles");
    expect(motionSource).toContain("export async function switchMotion(file)");
    expect(motionSource).toContain('setStatus(`Switching motion to ${file.name}`, "loading")');
    expect(motionSource).toContain("dom.motionSwitcher.hidden = state.currentMotionVmdFiles.length === 0");

    const dropHandler = modelSource.slice(
      modelSource.indexOf("function handleDroppedFiles"),
      modelSource.indexOf("async function collectDroppedFiles")
    );
    expect(dropHandler).toContain("const vmdFiles = findVmdFiles(files)");
    expect(dropHandler).toContain("await loadMotion(vmdFiles[0])");
    expect(dropHandler).toContain("vmdFiles.includes(file)");
    expect(dropHandler).not.toContain('lowerName.endsWith(".vmd")');
    expect(dropHandler).not.toContain("await loadMotion(file)");
  });

  it("delegates Ammo script loading to the public physics browser loader", async () => {
    const ammoSource = await readFile("examples/viewer/lib/ammo-bootstrap.js", "utf8");

    expect(ammoSource).toContain("loadAmmoNamespace");
    expect(ammoSource).toContain("state.ammoScriptLoadPromise ??= loadAmmoNamespace(state.ammoScriptUrl)");
    expect(ammoSource).toContain("dom.physicsErrorBanner.textContent = message");
    expect(ammoSource).not.toContain("function loadAmmoScript");
    expect(ammoSource).not.toContain("function getAmmoCandidate");
  });

  it("profiles viewer model load stages only behind the perf query flag", async () => {
    const modelSource = await readFile("examples/viewer/lib/model-loading.js", "utf8");
    const performanceSource = await readFile("examples/viewer/lib/performance.js", "utf8");

    expect(modelSource).toContain("createViewerLoadProfile");
    expect(modelSource).toContain('profile?.measure("loader-loadModel", "loader-ready", "model-loaded")');
    expect(modelSource).toContain('profile?.measure("first-render", "animation-ready", "first-render")');
    expect(performanceSource).toContain('new window.URLSearchParams(location.search).has("perf")');
    expect(performanceSource).toContain('"__THREE_MMD_LOADER_PERF__"');
    expect(performanceSource).toContain('window.console?.table(');
  });
});
