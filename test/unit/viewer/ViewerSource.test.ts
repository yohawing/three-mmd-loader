import { readFile as readRawFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("example viewer source", () => {
  it("keeps viewer version metadata aligned with the package version", async () => {
    const html = await readFile("examples/viewer/index.html", "utf8");
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as { version: string };
    const buildDeploySource = await readLocalOptionalText("scripts/build-deploy.mjs");

    expect(html).toContain(`<meta name="mmd-viewer-version" content="${packageJson.version}" />`);
    if (buildDeploySource !== undefined) {
      expect(buildDeploySource).toContain('name="mmd-viewer-version"');
      expect(buildDeploySource).toContain('content="${packageJson.version}"');
    }
  });

  it("clears model resources through the texture-aware dispose helper", async () => {
    const modelSource = await readFile("examples/viewer/lib/model-loading.js", "utf8");
    const disposeSource = await readFile("examples/viewer/lib/dispose.js", "utf8");

    expect(modelSource).toContain("disposeModelResources(state.currentModel)");
    expect(modelSource).toContain("state.scene.remove(state.currentModel.root)");
    expect(disposeSource).toContain('import { disposeMmdModel } from "../../../dist/three/index.js"');
    expect(disposeSource).toContain("disposeMmdModel(model)");
    expect(disposeSource).not.toContain("function collectMaterialTextures(material)");
  });

  it("keeps the default viewer camera far clip distance wide enough for large stages", async () => {
    const sceneSetupSource = await readFile("examples/viewer/lib/scene-setup.js", "utf8");

    expect(sceneSetupSource).toContain("const viewerDefaultCameraFar = 2000;");
    expect(sceneSetupSource).toContain("viewerDefaultCameraFar");
    expect(sceneSetupSource).toContain("Math.max(radius * 80, 200)");
    expect(sceneSetupSource).not.toContain("Math.max(radius * 40, 100)");
  });

  it("auto-fits only an initially empty stage and preserves restored camera views", async () => {
    const mainSource = await readFile("examples/viewer/main.js", "utf8");
    const modelSource = await readFile("examples/viewer/lib/model-loading.js", "utf8");

    expect(modelSource).toContain("function shouldAutoFitCameraOnModelLoad(loadOptions)");
    expect(modelSource).toContain("loadOptions.autoFitCamera !== false");
    expect(modelSource).toContain("!state.currentModel");
    expect(modelSource).toContain("!state.currentBackground");
    expect(modelSource).toContain("!state.currentCameraMotion");
    expect(modelSource.match(/if \(shouldAutoFitCamera\) \{\n {6}frameCurrentModel\(\);\n {4}\}/g)).toHaveLength(3);
    expect(modelSource).toContain("export function frameCurrentModel()");
    expect(modelSource).toContain("fitCameraToObject(state.currentModel.mesh)");
    expect(mainSource).toContain("frameModel: frameCurrentModel");
    expect(mainSource).toContain("const restoreModelLoadOptions = { autoFitCamera: false };");
    expect(mainSource).toContain("loadModelFromUrl(model.url, restoreModelLoadOptions)");
    expect(mainSource).toContain("loadModelFolder(files, restoreModelLoadOptions)");
    expect(mainSource).toContain("switchFolderModel(selectedModel, restoreModelLoadOptions)");
    expect(mainSource).toContain("loadModelFile(restoreFiles([model.file])[0], restoreModelLoadOptions)");
    expect(mainSource).toContain("restoreRendererSwitchCameraView(snapshot.cameraView)");
    expect(mainSource).toContain("camera.position.fromArray(view.position)");
    expect(mainSource).toContain("state.controls.target.fromArray(view.target)");
    expect(mainSource).toContain("camera.fov = view.fov");
  });

  it("adapts camera near/far to scene bounds on auto-fit-suppressed commit paths without moving the camera (T070-18)", async () => {
    const sceneSetupSource = await readFile("examples/viewer/lib/scene-setup.js", "utf8");
    const modelSource = await readFile("examples/viewer/lib/model-loading.js", "utf8");
    const backgroundSource = await readFile("examples/viewer/lib/background-loading.js", "utf8");
    const mainSource = await readFile("examples/viewer/main.js", "utf8");

    expect(sceneSetupSource).toContain("export function adaptCameraDepthRange()");
    const adaptStart = sceneSetupSource.indexOf("export function adaptCameraDepthRange()");
    const adaptEnd = sceneSetupSource.indexOf("export function setDefaultCameraView()");
    expect(adaptStart).toBeGreaterThanOrEqual(0);
    expect(adaptEnd).toBeGreaterThan(adaptStart);
    const adaptSource = sceneSetupSource.slice(adaptStart, adaptEnd);
    expect(adaptSource).not.toContain("position.set(");
    expect(adaptSource).not.toContain("position.copy(");
    expect(adaptSource).not.toContain("position.fromArray(");
    expect(adaptSource).not.toContain("controls.target");
    expect(adaptSource).not.toContain(".fov");
    expect(adaptSource).toContain("state.currentCameraMotion");
    expect(adaptSource).toContain("camera.near = near;");
    expect(adaptSource).toContain("camera.far = far;");
    expect(adaptSource).toContain("camera.updateProjectionMatrix();");

    expect(modelSource).toContain("import { adaptCameraDepthRange, fitCameraToObject } from \"./scene-setup.js\";");
    expect(modelSource.match(/if \(shouldAutoFitCamera\) \{\n {6}frameCurrentModel\(\);\n {4}\} else \{\n {6}adaptCameraDepthRange\(\);\n {4}\}/g)).toHaveLength(3);

    expect(backgroundSource).toContain("import { adaptCameraDepthRange } from \"./scene-setup.js\";");
    expect(backgroundSource).toContain("state.scene.add(background.root);\n    adaptCameraDepthRange();");
    expect(backgroundSource).toContain("updateStageState();\n  adaptCameraDepthRange();\n}");

    expect(mainSource).toContain("import { adaptCameraDepthRange, resize, setViewportAxesVisible, setViewportGridVisible, setupScene } from \"./lib/scene-setup.js\";");
    expect(mainSource).toContain("const hasSavedDepthRange = typeof view.near === \"number\" && typeof view.far === \"number\";");
    expect(mainSource).toContain("if (!hasSavedDepthRange) {");
  });

  it("wires the main viewer as a TSL parity review viewer with a baseline fallback", async () => {
    const html = await readFile("examples/viewer/index.html", "utf8");
    const debugSource = await readFile("examples/viewer/lib/debug.js", "utf8");
    const domSource = await readFile("examples/viewer/lib/dom.js", "utf8");
    const mainSource = await readFile("examples/viewer/main.js", "utf8");
    const modelSource = await readFile("examples/viewer/lib/model-loading.js", "utf8");
    const playbackSource = await readFile("examples/viewer/lib/playback.js", "utf8");
    const pipelineSource = await readFile("examples/viewer/lib/viewer-pipeline.js", "utf8");
    const rendererSwitchSource = await readFile("examples/viewer/lib/renderer-switch-state.js", "utf8");
    const sceneSetupSource = await readFile("examples/viewer/lib/scene-setup.js", "utf8");
    const stateSource = await readFile("examples/viewer/lib/state.js", "utf8");
    const selfShadowGateSource = await readFile("scripts/visual-regression/check-viewer-self-shadow.mjs", "utf8");
    const styles = await readFile("examples/viewer/styles.css", "utf8");

    expect(html).toContain('const threeBuild = baseline');
    expect(html).toContain('"/node_modules/three/build/three.module.js"');
    expect(html).toContain('"/node_modules/three/build/three.webgpu.js"');
    expect(html).toContain('"three": threeBuild');
    expect(html).toContain('"three/webgpu": "/node_modules/three/build/three.webgpu.js"');
    expect(html).toContain('"three/tsl": "/node_modules/three/build/three.tsl.js"');
    expect(html).toContain('const backend = query.get("backend")?.toLowerCase()');
    expect(html).not.toContain('query.get("pipeline")');
    expect(html).not.toContain('query.get("baseline")');
    expect(html).toContain('backend === "baseline"');
    expect(html).toContain('backend === "webgl"');
    expect(html).toContain('id="pipeline-backend-switcher"');
    expect(html).toContain('value="forcewebgl"');
    expect(html).toContain('<sl-option value="forcewebgl">TSL WebGL</sl-option>');
    expect(html).toContain('<sl-option value="webgpu">WebGPU</sl-option>');
    expect(html).toContain('<sl-option value="baseline">Baseline</sl-option>');
    expect(html).toContain('class="debug-backend-control"');
    expect(html).not.toContain('class="pipeline-status"');
    expect(html).not.toContain('id="pipeline-backend"');
    expect(html).not.toContain('id="pipeline-name"');
    expect(html).not.toContain('id="pipeline-model"');
    expect(html).not.toContain('id="pipeline-renderer"');
    expect(domSource).toContain('pipelineBackendSwitcher: document.querySelector("#pipeline-backend-switcher")');
    expect(stateSource).toContain('return "tsl-forcewebgl";');
    expect(stateSource).not.toContain('params.get("pipeline")');
    expect(stateSource).not.toContain('params.get("baseline")');
    expect(stateSource).toContain('backend === "baseline"');
    expect(stateSource).toContain('backend === "webgl"');
    expect(stateSource).toContain('backend === "forcewebgl"');
    expect(stateSource).toContain('backend === "webgpu"');
    expect(stateSource).toContain('query.get("selfShadow") !== "0"');
    expect(sceneSetupSource).toContain("export async function setupScene()");
    expect(sceneSetupSource).toContain("const viewerTslSupersample = 1;");
    expect(sceneSetupSource).toContain('state.viewerPipeline === "baseline-webgl"');
    expect(sceneSetupSource).not.toContain('import { WebGPURenderer } from "three/webgpu"');
    expect(sceneSetupSource).toContain('await import("three/webgpu")');
    expect(sceneSetupSource).toContain("new WebGPURenderer({");
    expect(sceneSetupSource).toContain('forceWebGL: state.viewerPipeline === "tsl-forcewebgl"');
    expect(sceneSetupSource).toContain("state.renderer.shadowMap.transmitted = false");
    expect(sceneSetupSource).toContain("await state.renderer.init()");
    expect(mainSource).toContain("void initializeViewer();");
    expect(mainSource).toContain("await setupScene();");
    expect(mainSource).toContain("await restoreRendererSwitchState();");
    expect(mainSource).toContain("function switchRendererBackend(backend)");
    expect(mainSource).toContain("saveRendererSwitchSnapshot(snapshot)");
    expect(mainSource).toContain("setRendererSwitchRestoreParam(url, restoreId)");
    expect(mainSource).toContain("async function restoreRendererSwitchState()");
    expect(mainSource).toContain("state.debugBeforeCapture = snapshot.debugBeforeCapture");
    expect(mainSource).toContain("await restoreRendererSwitchPose(snapshot.pose)");
    expect(mainSource).toContain("restoreRendererSwitchCameraView(snapshot.cameraView)");
    expect(mainSource).toContain("camera.position.fromArray(view.position)");
    expect(mainSource).toContain("state.controls.target.fromArray(view.target)");
    expect(mainSource).toContain("setSelfShadowEnabled(snapshot.debugSelfShadowEnabled)");
    expect(mainSource).toContain("updateViewerPipelineStatus();");
    expect(mainSource).toContain('url.searchParams.set("backend", backend)');
    expect(modelSource).toContain("loadOptions.folderFiles");
    expect(modelSource).toContain("loadOptions.folderModelFiles");
    expect(modelSource).toContain("loadOptions.folderTextureMap");
    expect(modelSource).toContain("let modelLoadGeneration = 0;");
    expect(modelSource).toContain("function beginModelLoad() {\n  return ++modelLoadGeneration;\n}");
    expect(modelSource).toContain("const generation = beginModelLoad();");
    expect(modelSource).toContain("generation = beginModelLoad()");
    expect(modelSource).toContain("loadOptions,\n      generation\n    );");
    expect(modelSource).toContain(
      "if (generation === modelLoadGeneration && (!loadOptions.shouldCommit || loadOptions.shouldCommit()))"
    );
    const urlLoadStart = modelSource.indexOf("export async function loadModelFromUrl");
    const urlGenerationIndex = modelSource.indexOf("const generation = beginModelLoad();", urlLoadStart);
    const urlFetchIndex = modelSource.indexOf("const bytes = await fetchBytes(url);", urlLoadStart);
    expect(urlLoadStart).toBeGreaterThanOrEqual(0);
    expect(urlGenerationIndex).toBeGreaterThan(urlLoadStart);
    expect(urlGenerationIndex).toBeLessThan(urlFetchIndex);
    expect(modelSource).toContain("preserveLoadGeneration: true");
    expect(modelSource).toContain("generation === modelLoadGeneration");
    expect(modelSource).toContain("source instanceof window.File ? [source] : []");
    expect(modelSource).toContain("state.currentFolderFiles = files");
    expect(stateSource).toContain("currentFolderFiles: []");
    expect(stateSource).toContain("currentPoseSource: undefined");
    expect(stateSource).toContain("currentBackgroundFiles: []");
    expect(modelSource).toContain("createViewerModelLoadOptions()");
    expect(modelSource).toContain("{ shouldCommit: isCurrentLoad }");
    expect(pipelineSource).toContain('if (shouldCommit && !shouldCommit()) {');
    expect(pipelineSource).toContain("return false;");
    expect(modelSource).toContain("syncMmdTslDedicatedShadowVisibility(model.root);");
    expect(rendererSwitchSource).toContain("const restoreParamName = \"restoreState\"");
    expect(rendererSwitchSource).toContain("window.indexedDB.open");
    expect(rendererSwitchSource).toContain("snapshotModel()");
    expect(rendererSwitchSource).toContain("snapshotMotion()");
    expect(rendererSwitchSource).toContain("snapshotPose()");
    expect(rendererSwitchSource).toContain("snapshotCameraView()");
    expect(rendererSwitchSource).toContain("state.controls.target.toArray()");
    expect(rendererSwitchSource).toContain("snapshotAudio()");
    expect(rendererSwitchSource).toContain("debugSelfShadowEnabled: state.debugSelfShadowEnabled");
    expect(rendererSwitchSource).toContain("relativePath: file.webkitRelativePath || \"\"");
    expect(pipelineSource).not.toContain('from "../../../dist/webgpu/index.js"');
    expect(pipelineSource).toContain('import("../../../dist/webgpu/index.js")');
    expect(pipelineSource).toContain('import("../../../dist/webgpu/self-shadow-pass.js")');
    expect(pipelineSource).toContain("dom.pipelineBackendSwitcher.value = state.rendererBackend");
    expect(pipelineSource).toContain('dom.pipelineBackendSwitcher.setAttribute("value", state.rendererBackend)');
    expect(pipelineSource).toContain('replaceMmdModelMaterialsWithTsl(model.mesh, {');
    expect(pipelineSource).toContain(
      "createMmdTslShadowCaster(model.mesh, { alphaTest: false });"
    );
    expect(pipelineSource).toContain("disposeMmdTslSelfShadowPass();");
    expect(pipelineSource).toContain("mmdTslSelfShadowPass.dispose();");
    expect(pipelineSource).toContain("disposeMmdTslShadowCaster?.(model.mesh)");
    expect(pipelineSource).toContain("appendOutlineGroups: true");
    expect(pipelineSource).toContain("morphSplit: false");
    expect(pipelineSource).toContain("morphAttributes: state.renderer?.backend?.isWebGPUBackend === true ? false : true");
    expect(pipelineSource).toContain("outline: false");
    expect(pipelineSource).toContain("materialRenderOrder: false");
    expect(pipelineSource).toContain("syncMmdTslMaterialState(material, materialState)");
    expect(pipelineSource).toContain("const syncedLightToonCoordinateOffset = 0.5;");
    expect(pipelineSource).toContain("uniforms.toonCoordinateOffset.value = syncedLightToonCoordinateOffset;");
    expect(pipelineSource).toContain("outlineMetadata?.sourceMaterialIndex");
    expect(pipelineSource).toContain("syncTslOutlineMaterialState(material, materialState, outlineMetadata)");
    expect(pipelineSource).toContain("export function setCurrentModelTslOutlineHidden(hidden)");
    expect(pipelineSource).toContain("material.visible = !state.debugOutlineHidden && runtimeVisible");
    expect(pipelineSource).toContain("setTslOutlineMaterialHidden(material, hidden)");
    expect(pipelineSource).toContain("export function submitViewerRender()");
    expect(pipelineSource).toContain("computeCurrentModelTslSparsePositionMorphs();");
    expect(pipelineSource).toContain("ensureMmdTslSelfShadowPass();");
    expect(pipelineSource).toContain("mmdTslSelfShadowPass.render(state.renderer, state.scene, state.keyLight);");
    expect(pipelineSource).toContain("dedicatedShadowVisibilityNode: mmdTslSelfShadowPass?.visibilityNode");
    expect(pipelineSource).toContain("export function syncMmdTslDedicatedShadowVisibility");
    expect(pipelineSource).toContain("const mmdTslSelfShadowModelRoots = new Set();");
    expect(pipelineSource).toContain("const mmdTslDedicatedShadowUniforms = new Set();");
    expect(pipelineSource).toContain("registerTslDedicatedShadowUniforms(model.root, model.mesh, true);");
    expect(pipelineSource).toContain("if (force) {");
    expect(pipelineSource).toContain("model.root.userData.mmdTslSelfShadowRole = role;");
    expect(pipelineSource).toContain("mmdTslSelfShadowModelRoots.delete(model.root);");
    expect(pipelineSource).toContain(
      "mmdTslSelfShadowModelRoots.delete(model.root);\n      unregisterTslDedicatedShadowUniforms(model.root);\n      disposeMmdTslSelfShadowPassIfUnused();"
    );
    expect(pipelineSource).toContain("state.keyLight?.castShadow === true");
    expect(pipelineSource).toContain("disposeMmdTslSelfShadowPassIfUnused();");
    const submitViewerRenderStart = pipelineSource.indexOf("export function submitViewerRender()");
    const submitViewerRenderEnd = pipelineSource.indexOf("export function disposeViewerPipelineModel");
    expect(submitViewerRenderStart).toBeGreaterThanOrEqual(0);
    expect(submitViewerRenderEnd).toBeGreaterThan(submitViewerRenderStart);
    const submitViewerRenderSource = pipelineSource.slice(submitViewerRenderStart, submitViewerRenderEnd);
    expect(submitViewerRenderSource).not.toContain("syncTslDedicatedShadowVisibility(");
    expect(submitViewerRenderSource).not.toContain(
      "mmdTslDedicatedRawVisibilityDebugActive === true"
    );
    expect(pipelineSource).toContain("export function setMmdTslDedicatedRawVisibilityDebug(enabled = true)");
    expect(pipelineSource).toContain("mmdTslSelfShadowPass.setReceiverVisibilityDebug(");
    expect(pipelineSource).toContain("export function syncMmdTslDedicatedRawVisibilityDebug()");
    expect(selfShadowGateSource).toContain('options.backend === "baseline"');
    expect(selfShadowGateSource).toContain('backend === "webgpu"');
    expect(selfShadowGateSource).toContain('options.backend = value.toLowerCase()');
    expect(selfShadowGateSource).toContain("--dedicated-raw-visibility requires --backend webgpu.");
    expect(selfShadowGateSource).toContain("renderer?.isWebGLRenderer === true");
    expect(selfShadowGateSource).toContain("renderer?.isWebGPURenderer === true");
    expect(selfShadowGateSource).toContain("typeof renderer.renderAsync === \"function\"");
    expect(selfShadowGateSource).toContain("--raw-visibility requires a TSL backend");
    expect(selfShadowGateSource).toContain("--vmd-lifecycle");
    expect(selfShadowGateSource).toContain("vmdLifecyclePixelPass(fullFrame");
    expect(selfShadowGateSource).toContain("vmdInactiveMeanDarkeningMax");
    expect(selfShadowGateSource).toContain("mode === 0");
    expect(selfShadowGateSource).toContain("mode === 1 || mode === 2");
    expect(selfShadowGateSource).toContain("vmdObservation(primary.on.diagnostics)");
    expect(selfShadowGateSource).toContain('status: "not-applicable"');
    expect(selfShadowGateSource).toContain("VMD self-shadow mode disabled");
    expect(selfShadowGateSource).toContain("onModeDistanceAgreement");
    expect(selfShadowGateSource).toContain("localFullFrameP995DarkeningMin");
    expect(selfShadowGateSource).toContain("localBackgroundMaxDarkeningMin");
    expect(selfShadowGateSource).toContain("maxDarkening");
    expect(selfShadowGateSource).not.toContain("Math.max(...darkening");
    expect(selfShadowGateSource).toContain("metrics.primary.p995Darkening >= p995Min");
    expect(selfShadowGateSource).toContain("p95 remains diagnostic-only");
    expect(selfShadowGateSource).toContain("const inactiveVmdMode = options.vmdLifecycle");
    expect(selfShadowGateSource).toContain("requireCastShadow = true");
    expect(selfShadowGateSource).toContain("shadowCameraFar");
    expect(selfShadowGateSource).toContain("vmdShadowCameraFarPass");
    expect(selfShadowGateSource).toContain("Math.min(Math.max(on.distance * 100, off.shadowCameraFar), 100)");
    expect(selfShadowGateSource).toContain("const onShadowCameraFarPass = !enabled");
    expect(pipelineSource).toContain("state.debugSelfShadowEnabled === true");
    expect(pipelineSource).toContain("mmdTslDedicatedRawVisibilityDebugActive = false;");
    expect(pipelineSource).toContain("if (!root) {");
    expect(pipelineSource).toContain("if (!mmdTslSelfShadowPass) {");
    expect(pipelineSource).toContain("state.renderer.shadowMap.enabled = false;");
    expect(pipelineSource).toContain("state.renderer.render(state.scene, state.camera);");
    expect(debugSource).toContain("submitViewerRender();");
    expect(debugSource).not.toContain("state.renderer.render(state.scene, state.camera)");
    expect(playbackSource).toContain("submitViewerRender();");
    expect(playbackSource).not.toContain("state.renderer.render(state.scene, state.camera)");
    expect(pipelineSource).not.toContain("Array.isArray(material) ? material : [material]");
    expect(debugSource).toContain("setCurrentModelTslOutlineHidden(state.debugOutlineHidden)");
    expect(debugSource).toContain("dedicatedRawVisibility(enabled = true)");
    expect(debugSource).toContain("setMmdTslDedicatedRawVisibilityDebug(enabled)");
    expect(playbackSource).toContain("syncViewerTslLight()");
    expect(playbackSource).toContain("syncCurrentModelTslMaterialStates()");
    expect(playbackSource).toContain("syncMmdTslDedicatedShadowVisibility();");
    expect(styles).toContain(".debug-backend-control");
    expect(styles).not.toContain(".pipeline-status");
  });

  it("adds loader root objects so split morph body meshes are rendered", async () => {
    const modelSource = await readFile("examples/viewer/lib/model-loading.js", "utf8");
    const backgroundSource = await readFile("examples/viewer/lib/background-loading.js", "utf8");
    const realModelVisualSource = await readFile("scripts/visual-regression/render-real-models.mjs", "utf8");

    expect(modelSource).toContain("state.scene.add(model.root)");
    expect(modelSource).not.toContain("state.scene.add(\n    model.mesh");
    expect(backgroundSource).toContain("state.scene.add(background.root)");
    expect(backgroundSource).toContain("state.scene.remove(state.currentBackground.root)");
    expect(realModelVisualSource).toContain("scene.add(model.root)");
    expect(realModelVisualSource).toContain("createCamera(visualCase.camera, model.root");
    expect(realModelVisualSource).not.toContain("scene.add(model.mesh, ...model.renderOrderMeshes, ...model.outlineMeshes)");
  });

  it("exposes bounded self-shadow diagnostics for the native viewer gate", async () => {
    const debugSource = await readFile("examples/viewer/lib/debug.js", "utf8");

    expect(debugSource).toContain("selfShadowDiagnostics: createSelfShadowDiagnostics");
    expect(debugSource).toContain("selfShadow: createSelfShadowDiagnostics()");
    expect(debugSource).toContain("casterMatchesShadowCamera");
    expect(debugSource).toContain("sparsePositionMorphsEnabled");
    expect(debugSource).toContain("visibleMeshReceiveShadow");
    expect(debugSource).toContain("shadowCamera: shadowCamera");
    expect(debugSource).toContain("vmdSelfShadow:");
    expect(debugSource).toContain("dedicatedShadowEnabled:");
  });

  it("preserves CPU bounds before native sparse morph output replaces geometry positions", async () => {
    const pipelineSource = await readFile("examples/viewer/lib/viewer-pipeline.js", "utf8");

    expect(pipelineSource).toContain("model.mesh.computeBoundingBox();");
    expect(pipelineSource).toContain("model.mesh.userData.mmdTslSparsePositionMorphs = enableMmdTslSparsePositionMorphs(model.mesh);");
  });

  it("routes backgrounds through the role-aware TSL pipeline without replacing character state", async () => {
    const backgroundSource = await readFile("examples/viewer/lib/background-loading.js", "utf8");
    const disposeSource = await readFile("examples/viewer/lib/dispose.js", "utf8");
    const mainSource = await readFile("examples/viewer/main.js", "utf8");
    const pipelineSource = await readFile("examples/viewer/lib/viewer-pipeline.js", "utf8");
    const playbackSource = await readFile("examples/viewer/lib/playback.js", "utf8");

    expect(backgroundSource).toContain("createViewerBackgroundLoadOptions()");
    expect(backgroundSource).toContain("let backgroundLoadGeneration = 0;");
    expect(backgroundSource).toContain("const generation = ++backgroundLoadGeneration;");
    expect(backgroundSource).toContain("clearCommittedBackground();");
    expect(backgroundSource).toContain('applyViewerPipelineToModel(background, label, { role: "background" })');
    expect(backgroundSource).toContain("if (generation !== backgroundLoadGeneration) {\n      disposeLoadedBackground();");
    expect(backgroundSource).toContain("await applyViewerPipelineToModel(background, label, { role: \"background\" });\n    if (generation !== backgroundLoadGeneration)");
    expect(backgroundSource).toContain("state.currentBackground = background;\n    if (!isTslViewerPipeline())");
    expect(backgroundSource).toContain("backgroundLoadGeneration += 1;\n  clearCommittedBackground();");
    expect(backgroundSource).toContain("disposeModelResources(background);");
    expect(backgroundSource).toContain("if (!isTslViewerPipeline())");
    expect(backgroundSource).toContain("disposeModelResources(state.currentBackground)");
    expect(pipelineSource).toContain("export function createViewerBackgroundLoadOptions()");
    expect(pipelineSource).toContain("morphAttributes: true");
    expect(pipelineSource).toContain(
      'export async function applyViewerPipelineToModel(model, label, { role = "character", shouldCommit } = {})'
    );
    expect(pipelineSource).toContain('if (role === "character")');
    expect(pipelineSource).toContain('role === "character" && state.renderer?.backend?.isWebGPUBackend === true');
    expect(pipelineSource).toContain("export function syncViewerTslLight()");
    expect(pipelineSource).toContain("state.currentBackground?.mesh?.material");
    expect(disposeSource).toContain("disposeViewerPipelineModel(model)");
    expect(playbackSource).toContain("syncViewerTslLight()");
    expect(playbackSource).toContain("} else {\n    if (state.currentModel?.mesh?.material)");
    expect(playbackSource).toContain("if (state.currentBackground?.mesh?.material)");
    expect(mainSource).toContain("await restoreRendererSwitchBackground(snapshot.background)");
    expect(mainSource).toContain("await loadBackgroundFromUrl(background.url)");
  });

  it("keeps the independent main-viewer native WebGPU background visual gate wired to its synthetic fixture", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as { scripts: Record<string, string> };
    const generatorSource = await readFile("scripts/fixtures/generate-minimal-pmx.mjs", "utf8");
    const gateSource = await readFile("scripts/visual-regression/check-viewer-background.mjs", "utf8");

    expect(packageJson.scripts["visual:smoke:viewer-background"]).toContain("check-viewer-background.mjs");
    expect(packageJson.scripts["visual:smoke:viewer-background"]).toContain("mmd-viewer-background-room");
    expect(generatorSource).toContain('"mmd-viewer-background-room"');
    expect(generatorSource).toContain("background-room-checker.png");
    expect(gateSource).toContain('"#pipeline-backend-switcher"');
    expect(gateSource).toContain('CustomEvent("sl-change"');
    expect(gateSource).toContain("nativeWebgpu");
    expect(gateSource).toContain("diffuseTexturesResolved");
    expect(gateSource).toContain("resolvedDiffuseTextureCount");
    expect(gateSource).toContain("shadowCasters");
    expect(gateSource).toContain("analyzeSyntheticRois");
    expect(gateSource).toContain("maximumBlackPropMean");
    expect(gateSource).toContain("clear-background");
    expect(gateSource).toContain("--local-background");
    expect(gateSource).toContain("/__mmd_data__/");
  });

  it("surfaces texture diagnostics from loaded models", async () => {
    const modelSource = await readFile("examples/viewer/lib/model-loading.js", "utf8");
    const diagnosticsSource = await readFile("examples/viewer/lib/diagnostics.js", "utf8");
    const domSource = await readFile("examples/viewer/lib/dom.js", "utf8");
    const styles = await readFile("examples/viewer/styles.css", "utf8");

    expect(modelSource).toContain("reportTextureDiagnostics(state.currentModel)");
    expect(diagnosticsSource).toContain("model.diagnostics?.textures ?? model.textureDiagnostics ?? []");
    expect(diagnosticsSource).toContain('globalThis.console.warn("[mmd-viewer] texture diagnostics:"');
    expect(diagnosticsSource).toContain('setStatus(');
    expect(diagnosticsSource).toContain('"warning"');
    expect(domSource).toContain("dom.topBar?.classList.toggle(\"is-warning\"");
    expect(styles).toContain(".top-bar.is-warning .status");
  });

  it("shows dismissible model credits from loaded PMX and PMD metadata comments", async () => {
    const html = await readFile("examples/viewer/index.html", "utf8");
    const mainSource = await readFile("examples/viewer/main.js", "utf8");
    const modelSource = await readFile("examples/viewer/lib/model-loading.js", "utf8");
    const creditsSource = await readFile("examples/viewer/lib/credits.js", "utf8");
    const domSource = await readFile("examples/viewer/lib/dom.js", "utf8");
    const i18nSource = await readFile("examples/viewer/lib/i18n.js", "utf8");
    const styles = await readFile("examples/viewer/styles.css", "utf8");
    const threeSource = await readFile("src/three/index.ts", "utf8");

    expect(threeSource).toContain("comment: modelData.metadata.comment");
    expect(threeSource).toContain("englishComment: modelData.metadata.englishComment");
    expect(html).toContain('id="credit-popup"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('id="credit-close"');
    expect(html).toContain("close</span>");
    expect(domSource).toContain('creditPopup: document.querySelector("#credit-popup")');
    expect(domSource).toContain('creditCommentText: document.querySelector("#credit-comment")');
    expect(domSource).toContain('creditCloseButton: document.querySelector("#credit-close")');
    expect(mainSource).toContain("bindCreditPopupControls()");
    expect(modelSource).toContain("showModelCredits(state.currentModel, label)");
    expect(modelSource).toContain("showModelCredits(state.currentModel, modelFile.name)");
    expect(modelSource).toContain("hideCreditPopup()");
    expect(creditsSource).toContain("export function bindCreditPopupControls()");
    expect(creditsSource).toContain('dom.creditCloseButton?.addEventListener("click", hideCreditPopup)');
    expect(creditsSource).toContain("metadata?.comment");
    expect(creditsSource).toContain("metadata?.englishComment");
    expect(creditsSource).toContain("const code = char.charCodeAt(0)");
    expect(creditsSource).toContain('char !== "\\n" && char !== "\\r" && char !== "\\t"');
    expect(creditsSource).toContain("dom.creditPopup.hidden = false");
    expect(creditsSource).toContain("dom.creditPopup.hidden = true");
    expect(i18nSource).toContain('"credit.title": "Credits"');
    expect(i18nSource).toContain('"aria.closeCredits": "Close credits"');
    expect(styles).toContain(".credit-popup");
    expect(styles).toContain(".credit-popup[hidden]");
    expect(styles).toContain(".credit-close");
    expect(styles).toContain("white-space: pre-wrap");
  });

  it("keeps same-folder PMX variants in a switcher instead of reloading them during folder drops", async () => {
    const mainSource = await readFile("examples/viewer/main.js", "utf8");
    const domSource = await readFile("examples/viewer/lib/dom.js", "utf8");
    const modelSource = await readFile("examples/viewer/lib/model-loading.js", "utf8");
    const stateSource = await readFile("examples/viewer/lib/state.js", "utf8");
    const configSource = await readFile("examples/viewer/lib/viewer-config.js", "utf8");
    const html = await readFile("examples/viewer/index.html", "utf8");
    const styles = await readFile("examples/viewer/styles.css", "utf8");

    expect(configSource).toContain('query.get("mmdFrameRate")');
    expect(configSource).toContain('query.get("mmdFrameQuantize")');
    expect(configSource).toContain('readFirstQueryValue("ikTolerance", "ikTorelance")');
    expect(configSource).toContain('"ikTorelance"');
    expect(configSource).toContain('"ikMaxIterationsCap"');
    expect(configSource).toContain('"ikMaxIter"');
    expect(configSource).toContain('"maxIkIterations"');
    expect(stateSource).toContain("frameRate: viewerConfig.mmdFrameRate");
    expect(stateSource).toContain("mmdFrameRate: viewerConfig.mmdFrameRate");
    expect(stateSource).toContain("mmdFrameQuantize: viewerConfig.mmdFrameQuantize");
    expect(stateSource).toContain("ikTolerance: viewerConfig.ikTolerance");
    expect(stateSource).toContain("ikMaxIterationsCap: viewerConfig.ikMaxIterationsCap");
    expect(html).toContain('id="model-switcher"');
    expect(html).toContain('<sl-select id="model-switcher"');
    expect(html).toContain('id="clear-model" slot="suffix"');
    expect(html).not.toContain('id="model-name"');
    expect(html).toContain('aria-label="Selected model"');
    expect(domSource).toContain('modelSwitcher: document.querySelector("#model-switcher")');
    expect(domSource).toContain("export function setLoadedFileSwitcherOptions");
    expect(domSource).toContain('document.createElement("sl-option")');
    expect(domSource).toContain('switcher.classList.toggle("is-single-loaded-file", isSingleEntry)');
    expect(domSource).toContain('setAttribute("slot", isSingleEntry ? "prefix" : "suffix")');
    expect(domSource).toContain("export function clearLoadedFileSwitcher");
    expect(domSource).toContain('switcher.classList.remove("is-single-loaded-file")');
    expect(domSource).not.toContain("modelNameText");
    expect(stateSource).toContain("currentFolderTextureMap: undefined");
    expect(stateSource).toContain("currentFolderPmxFiles: []");
    expect(modelSource).toContain("const selectedModelEntry = switcherEntry ?? createModelSwitcherEntry(source, label)");
    expect(modelSource).toContain("state.currentFolderPmxFiles = loadOptions.folderModelFiles ?? [selectedModelEntry]");
    expect(modelSource).toContain("state.currentFolderTextureMap = textureMap");
    expect(modelSource).toContain("state.currentFolderPmxFiles = modelFiles");
    expect(modelSource).toContain("updateModelSwitcher(modelFile)");
    expect(modelSource).toContain("findMmdModelFiles");
    expect(modelSource).toContain("createMmdTextureMapFromFiles");
    expect(modelSource).toContain("export async function switchFolderModel(modelFile, loadOptions = {})");
    expect(modelSource).toContain('setStatus(`Switching to ${modelFile.name}`, "loading")');
    expect(modelSource).toContain("createModelLoader({ textureMap: state.currentFolderTextureMap })");
    expect(modelSource).toContain("createViewerRuntimeOptions({");
    expect(modelSource).toContain("dom.modelControl.hidden = state.currentFolderPmxFiles.length === 0");
    expect(modelSource).toContain("preserveModelSwitcher: true");
    expect(modelSource).toContain("dom.timeline.max = Math.max(currentMotionDurationSeconds(), 0.001)");
    expect(mainSource).toContain("const selectedValue = loadedFileSwitcherValue(dom.modelSwitcher)");
    expect(mainSource).toContain("modelFileKey(file) === selectedValue");
    expect(styles).toContain(".loaded-file-control sl-select");
    expect(styles).toContain(".loaded-file-control sl-select::part(combobox)");
    expect(styles).toContain(".loaded-file-control sl-select.is-single-loaded-file::part(expand-icon)");
    expect(styles).toContain("display: none;");

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
    const cameraSource = await readFile("examples/viewer/lib/camera-loading.js", "utf8");
    const stateSource = await readFile("examples/viewer/lib/state.js", "utf8");
    const html = await readFile("examples/viewer/index.html", "utf8");

    expect(html).toContain('id="motion-switcher"');
    expect(html).toContain('<sl-select id="motion-switcher"');
    expect(html).toContain('id="clear-motion" slot="suffix"');
    expect(html).toContain('aria-label="Selected motion"');
    expect(html).not.toContain('id="motion-name"');
    expect(domSource).toContain('motionSwitcher: document.querySelector("#motion-switcher")');
    expect(domSource).not.toContain("motionNameText");
    expect(stateSource).toContain("currentMotionVmdFiles: []");
    expect(mainSource).toContain("async function loadSelectedMotionFile(file)");
    expect(mainSource).toContain("const { motionFiles, cameraFiles } = await classifyVmdFiles([file])");
    expect(mainSource).toContain("await loadCameraFile(cameraFiles[0])");
    expect(mainSource).toContain("motionFileKey(file) === selectedValue");
    expect(modelSource).toContain("const { motionFiles, cameraFiles } = await classifyVmdFiles(vmdFiles)");
    expect(modelSource).toContain("state.currentMotionVmdFiles = motionFiles");
    expect(motionSource).toContain("export const findVmdFiles = findMmdMotionFiles");
    expect(motionSource).toContain("findMmdMotionFiles");
    expect(motionSource).toContain("parseVmdSectionInventory");
    expect(motionSource).not.toContain("parseVmd,");
    expect(motionSource).toContain("const loaded = await state.animationLoader.loadAnimation(source)");
    expect(motionSource).toContain("const { animation } = loaded");
    expect(motionSource).toContain("export async function classifyVmdFiles(files)");
    expect(motionSource).toContain("counts.cameras > 0 && counts.bones === 0 && counts.morphs === 0");
    expect(motionSource).toContain("return await loadCameraAnimation(loaded, label, createCameraSwitcherEntry(source, label))");
    expect(motionSource).toContain("export async function switchMotion(file)");
    expect(motionSource).toContain('setStatus(`Switching motion to ${file.name}`, "loading")');
    expect(motionSource).toContain("createMotionSwitcherEntry(source, label)");
    expect(motionSource).toContain('id: `url:${source}`');
    expect(motionSource).toContain("setLoadedFileSwitcherOptions(");
    expect(motionSource).toContain("dom.motionControl.hidden = state.currentMotionVmdFiles.length === 0");
    expect(cameraSource).toContain("export async function loadCameraAnimation(loadedAnimation, label, entry)");
    expect(cameraSource).toContain("export function createCameraSwitcherEntry(source, label)");
    expect(cameraSource).not.toContain("parseVmd");
    expect(cameraSource).toContain("state.animationLoader.loadAnimation(url)");
    expect(cameraSource).toContain("state.animationLoader.loadAnimation(file)");
    expect(cameraSource).toContain("sampleMmdAnimWasmCameraTrackInto");
    expect(cameraSource).toContain("state.cameraSampleScratch");
    expect(cameraSource).toContain("state.animationLoader.createCameraTrack(loadedAnimation)");
    expect(cameraSource).toContain("lightFrames: animation.lightFrames");
    expect(cameraSource).toContain("state.animationLoader.createLightTrack(loadedAnimation)");
    expect(cameraSource).not.toContain("state.renderer.render(");

    const dropHandler = modelSource.slice(
      modelSource.indexOf("function handleDroppedFiles"),
      modelSource.indexOf("async function collectDroppedFiles")
    );
    expect(dropHandler).toContain("const vmdFiles = findVmdFiles(files)");
    expect(dropHandler).toContain("else if (vmdFiles.length === 0)");
    expect(dropHandler).toContain("await loadMotion(motionFiles[0])");
    expect(dropHandler).toContain("await loadCameraFile(cameraFiles[0])");
    expect(dropHandler).toContain("vmdFiles.includes(file)");
    expect(dropHandler).not.toContain('lowerName.endsWith(".vmd")');
    expect(dropHandler).not.toContain("await loadMotion(file)");
  });

  it("loads local viewer assets from the gitignored fixture inventory through the MMD data route", async () => {
    const mainSource = await readFile("examples/viewer/main.js", "utf8");
    const assetLibrarySource = await readFile("examples/viewer/lib/asset-library.js", "utf8");
    const domSource = await readFile("examples/viewer/lib/dom.js", "utf8");
    const stateSource = await readFile("examples/viewer/lib/state.js", "utf8");
    const html = await readFile("examples/viewer/index.html", "utf8");
    const styles = await readFile("examples/viewer/styles.css", "utf8");
    const serverSource = await readFile("scripts/serve-example-viewer.mjs", "utf8");

    expect(html).toContain('id="asset-preset-section"');
    expect(html).toContain('id="asset-preset-select"');
    expect(html).toContain('id="save-current-preset"');
    expect(html).toContain('id="model-load-category"');
    expect(html).toContain('id="motion-load-category"');
    expect(html).toContain('id="audio-load-category"');
    expect(html).toContain('id="background-load-category"');
    expect(html).toContain('id="camera-load-category"');
    expect(html).toContain('for="asset-model-select"');
    expect(html).toContain('for="asset-motion-select"');
    expect(html).toContain('for="asset-background-select"');
    expect(html).toContain('for="asset-audio-select"');
    expect(html).toContain('for="asset-camera-select"');
    expect(html).toContain('id="load-asset-model"');
    expect(html).toContain('id="load-asset-motion"');
    expect(html).toContain('id="load-asset-background"');
    expect(html).toContain('id="load-asset-audio"');
    expect(html).toContain('id="load-asset-camera"');
    expect(html).toContain('id="delete-asset-preset"');
    expect(html).not.toContain('id="recent-model-select"');
    expect(html).not.toContain('id="recent-motion-select"');
    expect(html).not.toContain('id="recent-camera-select"');
    expect(html).toContain('id="loading-indicator"');
    expect(html).toContain('id="load-menu-icon"');
    expect(html).not.toContain('id="load-selected-assets"');
    expect(html).not.toContain('id="recent-assets-section"');
    expect(domSource).toContain('assetPresetSection: document.querySelector("#asset-preset-section")');
    expect(domSource).toContain('assetPresetSaveButton: document.querySelector("#save-current-preset")');
    expect(domSource).toContain('assetModelLoadButton: document.querySelector("#load-asset-model")');
    expect(domSource).toContain('assetPresetDeleteButton: document.querySelector("#delete-asset-preset")');
    expect(domSource).not.toContain("recentModelSelect");
    expect(domSource).toContain('loadingIndicator: document.querySelector("#loading-indicator")');
    expect(domSource).toContain("function setLoadingIndicator");
    expect(domSource).toContain("export function updateLoadMenuIcon()");
    expect(domSource).toContain("export function toggleLoadMenu(event)");
    expect(stateSource).toContain("assetLibrary: {");
    expect(mainSource).toContain("initializeAssetLibrary");
    expect(mainSource).toContain("bindAssetLibraryControls");
    expect(mainSource).toContain('dom.loadMenu?.querySelector("summary")?.addEventListener("click", toggleLoadMenu)');
    expect(mainSource).not.toContain('document.addEventListener("click"');
    expect(mainSource).not.toContain('document.addEventListener("keydown"');
    expect(assetLibrarySource).toContain('"/__mmd_assets__/fixtures-local.json"');
    expect(assetLibrarySource).toContain("selectionStorageKey");
    expect(assetLibrarySource).toContain("customPresetStorageKey");
    expect(assetLibrarySource).toContain("saveCurrentAssetPreset");
    expect(assetLibrarySource).toContain("createCurrentAssetPreset");
    expect(assetLibrarySource).toContain("readCustomPresets()");
    expect(assetLibrarySource).toContain("saveSelectedAssetSelection()");
    expect(assetLibrarySource).toContain("restoreSavedSelection(readSavedSelection())");
    expect(assetLibrarySource).toContain('select.closest(".asset-load-row")');
    expect(assetLibrarySource).toContain("const assetCategories = {");
    expect(assetLibrarySource).toContain("async function loadCategoryAsset(category, asset)");
    expect(assetLibrarySource).toContain("if (!await config.load(asset))");
    expect(assetLibrarySource).toContain("rememberFixtureUse(category, asset.id)");
    expect(assetLibrarySource).toContain('const fixtureOrderStorageKey = "three-mmd-loader.viewer.fixtureOrder.v1"');
    expect(assetLibrarySource).toContain("function sortByRecency(category, assets)");
    expect(assetLibrarySource).toContain("function deleteSelectedAssetPreset()");
    expect(assetLibrarySource).toContain("clearLegacyRecentStorage()");
    expect(assetLibrarySource).not.toContain("rememberRecentAsset");
    expect(assetLibrarySource).not.toContain("migrateLegacyRecentAssets");
    expect(assetLibrarySource).not.toContain("Restoring selected assets");
    expect(assetLibrarySource).not.toContain("hasRestorableSelection");
    expect(assetLibrarySource).toContain("loadModelFromUrl(preset.modelUrl)");
    expect(assetLibrarySource).toContain("loadMotionFromUrl(preset.motionUrl)");
    expect(assetLibrarySource).toContain("loadBackgroundFromUrl");
    expect(assetLibrarySource).toContain("preset.backgroundUrl");
    expect(assetLibrarySource).toContain("preset.audioUrl");
    expect(assetLibrarySource).toContain("preset.cameraUrl");
    expect(assetLibrarySource).toContain("loadAudioFromUrl(asset.url");
    expect(assetLibrarySource).toContain("loadCameraFromUrl(asset.url)");
    expect(assetLibrarySource).not.toContain("async function loadSelectedAssets");
    expect(assetLibrarySource).not.toContain('const noneOptionValue = "__none__"');
    expect(assetLibrarySource).toContain("window.localStorage.setItem(fixtureOrderStorageKey");
    expect(html).toContain('id="asset-background-select"');
    expect(html).toContain('id="asset-audio-select"');
    expect(html).toContain('id="asset-camera-select"');
    expect(serverSource).toContain('"fixtures.local.json"');
    expect(serverSource).toContain('const dataRoute = "/__mmd_data/"');
    expect(serverSource).toContain('const localAssetsRoute = "/__mmd_assets__/fixtures-local.json"');
    expect(serverSource).toContain('Location: `/${url.search}`');
    expect(serverSource).toContain("createLocalAssetManifest");
    expect(serverSource).toContain('import { parseVmdSectionInventory } from "../dist/parser/index.js"');
    expect(serverSource).toContain("const vmdEntries = splitVmdAssetEntries(byExtension.vmd)");
    expect(serverSource).toContain("const motions = vmdEntries.motions");
    expect(serverSource).toContain("function isCameraOnlyVmdFixturePath(fixturePath)");
    expect(serverSource).toContain("counts.cameras > 0 && counts.bones === 0 && counts.morphs === 0");
    expect(serverSource).toContain("function dedupeAssetsByUrl(assets)");
    expect(serverSource).not.toContain(": motions;");
    expect(serverSource).toContain("backgrounds");
    expect(serverSource).toContain("backgroundPmx");
    expect(serverSource).toContain("backgroundPmd");
    expect(serverSource).toContain("audios");
    expect(serverSource).toContain("cameras");
    expect(serverSource).toContain("fixtureCase.background?.extension");
    expect(serverSource).toContain("fixtureCase.camera?.key");
    expect(serverSource).toContain("fixtureCase.audio?.extension");
    expect(serverSource).toContain("process.env.MMD_DATA_ROOT");
    expect(serverSource).not.toContain("MMD_VIEWER_DATA_ROOT");
    expect(styles).toContain(".asset-load-row");
    expect(styles).toContain(".asset-load-row label");
    expect(styles).toContain(".load-category");
    expect(styles).toContain(".load-category > summary");
    expect(styles).toContain(".loading-indicator");
    expect(styles).toContain("@keyframes loading-spin");
  });

  it("persists viewport grid and axis visibility controls from the load menu", async () => {
    const html = await readFile("examples/viewer/index.html", "utf8");
    const mainSource = await readFile("examples/viewer/main.js", "utf8");
    const domSource = await readFile("examples/viewer/lib/dom.js", "utf8");
    const stateSource = await readFile("examples/viewer/lib/state.js", "utf8");
    const sceneSource = await readFile("examples/viewer/lib/scene-setup.js", "utf8");
    const i18nSource = await readFile("examples/viewer/lib/i18n.js", "utf8");
    const styles = await readFile("examples/viewer/styles.css", "utf8");

    expect(html).toContain('id="viewport-settings-category"');
    expect(html).toContain('data-i18n="menu.viewport"');
    expect(html.indexOf('id="viewport-settings-category"')).toBeLessThan(html.indexOf('id="model-load-category"'));
    expect(html).toContain('id="viewport-grid-toggle"');
    expect(html).toContain('id="viewport-axes-toggle"');
    expect(domSource).toContain('viewportGridToggle: document.querySelector("#viewport-grid-toggle")');
    expect(domSource).toContain('viewportAxesToggle: document.querySelector("#viewport-axes-toggle")');
    expect(stateSource).toContain('const viewportStorageKey = "three-mmd-loader.viewer.viewport.v1"');
    expect(stateSource).toContain("const storedViewportSettings = readStoredViewportSettings()");
    expect(stateSource).toContain("viewportGridVisible: storedViewportSettings.grid ?? true");
    expect(stateSource).toContain("viewportAxesVisible: storedViewportSettings.axes ?? true");
    expect(stateSource).toContain("export function persistViewportSettings()");
    expect(sceneSource).toContain("state.gridHelper = new THREE.GridHelper");
    expect(sceneSource).toContain("state.axesHelper = new THREE.AxesHelper");
    expect(sceneSource).toContain("state.gridHelper.visible = state.viewportGridVisible");
    expect(sceneSource).toContain("state.axesHelper.visible = state.viewportAxesVisible");
    expect(sceneSource).toContain("export function setViewportGridVisible(visible)");
    expect(sceneSource).toContain("export function setViewportAxesVisible(visible)");
    expect(sceneSource).toContain("persistViewportSettings()");
    expect(mainSource).toContain("bindViewportControls()");
    expect(mainSource).toContain("setViewportGridVisible(dom.viewportGridToggle.checked)");
    expect(mainSource).toContain("setViewportAxesVisible(dom.viewportAxesToggle.checked)");
    expect(i18nSource).toContain('"menu.viewport": "Viewport"');
    expect(i18nSource).toContain('"viewport.grid": "Grid"');
    expect(i18nSource).toContain('"viewport.axes": "Axis"');
    expect(styles).toContain(".viewport-settings");
    expect(styles).toContain(".switch-toggle input:checked");
  });

  it("decodes URL labels and keeps background and camera imports separate from the main model", async () => {
    const mainSource = await readFile("examples/viewer/main.js", "utf8");
    const modelSource = await readFile("examples/viewer/lib/model-loading.js", "utf8");
    const motionSource = await readFile("examples/viewer/lib/motion-loading.js", "utf8");
    const backgroundSource = await readFile("examples/viewer/lib/background-loading.js", "utf8");
    const cameraSource = await readFile("examples/viewer/lib/camera-loading.js", "utf8");
    const playbackSource = await readFile("examples/viewer/lib/playback.js", "utf8");
    const domSource = await readFile("examples/viewer/lib/dom.js", "utf8");
    const stateSource = await readFile("examples/viewer/lib/state.js", "utf8");
    const html = await readFile("examples/viewer/index.html", "utf8");
    const urlLabelSource = await readFile("examples/viewer/lib/url-label.js", "utf8");

    expect(urlLabelSource).toContain("decodeURIComponent(label)");
    expect(modelSource).toContain("export async function loadModelFromUrl(url, loadOptions = {})");
    expect(modelSource).toContain("loadOptions.shouldCommit");
    expect(motionSource).toContain("await loadMotion(url, labelFromUrl(url))");
    expect(backgroundSource).toContain("state.scene.add(background.root)");
    expect(backgroundSource).toContain("state.scene.remove(state.currentBackground.root)");
    expect(html).toContain('id="choose-background"');
    expect(html).toContain('id="choose-camera"');
    expect(html).toContain('id="background-switcher"');
    expect(html).toContain('id="camera-switcher"');
    expect(html).toContain('id="audio-switcher"');
    expect(html).toContain('id="clear-background"');
    expect(html).toContain('id="clear-background" slot="suffix"');
    expect(html).toContain('id="clear-camera"');
    expect(html).toContain('id="clear-camera" slot="suffix"');
    expect(html).toContain('id="clear-audio"');
    expect(html).toContain('id="clear-audio" slot="suffix"');
    expect(mainSource).toContain('dom.audioSwitcher?.addEventListener("sl-change"');
    expect(mainSource).toContain('dom.backgroundSwitcher?.addEventListener("sl-change"');
    expect(mainSource).toContain('dom.cameraSwitcher?.addEventListener("sl-change"');
    expect(mainSource).toContain("loadBackgroundUrl: loadBackgroundFromUrl");
    expect(mainSource).toContain("loadCameraUrl: loadCameraFromUrl");
    expect(mainSource).toContain("clearBackground()");
    expect(mainSource).toContain("clearCameraMotion()");
    expect(backgroundSource).toContain("state.currentBackground = background");
    expect(backgroundSource).toContain("disposeModelResources(state.currentBackground)");
    expect(backgroundSource).toContain("updateStageState()");
    expect(domSource).toContain("!state.currentModel && !state.currentBackground");
    expect(domSource).toContain("let lastPlaybackCurrentFrameText");
    expect(domSource).toContain("let lastPlaybackTotalFrameText");
    expect(domSource).toContain("const shouldForceFrameInput = options?.forceFrameInput === true");
    expect(domSource).toContain("shouldForceFrameInput || (document.activeElement !== dom.frameCurrentInput");
    expect(domSource).toContain("document.activeElement !== dom.frameCurrentInput");
    expect(cameraSource).toContain("state.currentCameraMotion = {");
    expect(cameraSource).toContain("syncTimelineRangeToCurrentMotion()");
    expect(cameraSource).toContain("currentMotionDurationSeconds()");
    expect(cameraSource).not.toContain("existingMax");
    expect(cameraSource).toContain("cameraMotion.frameIndexHint");
    expect(cameraSource).toContain("currentMmdFrame()");
    expect(cameraSource).toContain("/ state.mmdFrameRate");
    expect(cameraSource).toContain("applyMmdCameraStateToThreeCamera(");
    expect(cameraSource).toContain("state.perspectiveCamera");
    expect(cameraSource).toContain("state.controls.object = activeCamera");
    expect(cameraSource).not.toContain("function interpolateBezier");
    expect(cameraSource).not.toContain("function cubicBezier");
    expect(cameraSource).not.toContain("function cameraFrameAt");
    expect(playbackSource).toContain("applyCameraMotion()");
    expect(playbackSource).toContain("currentMmdSeconds()");
    expect(stateSource).toContain("frameRate: viewerConfig.mmdFrameRate");
    expect(modelSource).toContain("MmdAnimRuntime.fromPmxBytes(wasm, modelBytes, createViewerRuntimeOptions({");
    expect(stateSource).toContain("currentBackground: undefined");
    expect(stateSource).toContain("currentCameraMotion: undefined");
    expect(stateSource).toContain("mmdFrameQuantize");
    expect(stateSource).toContain("export function currentMmdFrame()");
    expect(stateSource).toContain("state.mmdFrameQuantize ? Math.floor");
    expect(stateSource).toContain("cameraTargetScratch: new THREE.Vector3()");
    expect(stateSource).toContain("cameraQuaternionScratch: new THREE.Quaternion()");
    expect(stateSource).toContain("quaternion: state.cameraQuaternionScratch");
    expect(stateSource).toContain("cameraStateScratch: {");
    expect(stateSource).toContain("cameraSampleScratch: new Float32Array(9)");
    expect(stateSource).toContain("lightSampleScratch: new Float32Array(6)");
    expect(stateSource).toContain("lightStateScratch: {");
    expect(stateSource).toContain("orthographicCamera: undefined");
    expect(stateSource).toContain("get orthographicCamera()");
    expect(stateSource).toContain("state.cameraApplyOptions = {");
  });

  it("wires self-shadow rendering into the viewer renderer, light, and playback loop", async () => {
    const domSource = await readFile("examples/viewer/lib/dom.js", "utf8");
    const debugSource = await readFile("examples/viewer/lib/debug.js", "utf8");
    const htmlSource = await readFile("examples/viewer/index.html", "utf8");
    const mainSource = await readFile("examples/viewer/main.js", "utf8");
    const sceneSource = await readFile("examples/viewer/lib/scene-setup.js", "utf8");
    const playbackSource = await readFile("examples/viewer/lib/playback.js", "utf8");
    const stateSource = await readFile("examples/viewer/lib/state.js", "utf8");

    expect(sceneSource).toContain("state.renderer.shadowMap.enabled = state.debugSelfShadowEnabled");
    expect(sceneSource).toContain("state.renderer.shadowMap.type = THREE.BasicShadowMap");
    expect(sceneSource).toContain("state.keyLight.castShadow = state.debugSelfShadowEnabled");
    expect(sceneSource).toContain("configureMmdSelfShadowDirectionalLight");
    expect(sceneSource).toContain("fitMmdSelfShadowDirectionalLightToBox");
    expect(sceneSource).toContain("const viewerBaselineSelfShadowQuality = {");
    expect(sceneSource).toContain("mapSize: 4096");
    expect(sceneSource).toContain("const viewerTslSelfShadowQuality = {");
    expect(sceneSource).toContain("mapSize: 2048");
    expect(sceneSource).toContain("shadowIntensity: 1.0");
    expect(sceneSource).toContain("normalBias: 0.006");
    expect(sceneSource).toContain("const viewerTslSelfShadowWorldDepthBiasScale = 0.01");
    expect(sceneSource).toContain(") * viewerTslSelfShadowWorldDepthBiasScale;");
    expect(sceneSource).toContain("-viewerTslSelfShadowWorldDepthBias / depthRange");
    expect(playbackSource).toContain("updateSelfShadowDepthBias();");
    expect(sceneSource).toContain("export function fitShadowCameraToObject(object)");
    expect(sceneSource).toContain("state.selfShadowBoundsScratch.setFromObject(object)");
    expect(sceneSource).toContain("const viewerTslShadowBoundsRefreshFrames = 6");
    expect(sceneSource).toContain("export function updateShadowCameraForFrame(object)");
    expect(sceneSource).toContain("state.selfShadowBoundsRefreshCountdown -= 1");
    expect(sceneSource).toContain("marginScale: 0.06");
    expect(stateSource).toContain("selfShadowStateScratch");
    expect(stateSource).toContain("selfShadowBoundsScratch: new THREE.Box3()");
    expect(stateSource).toContain("selfShadowBoundsRefreshCountdown: 0");
    expect(stateSource).toContain("selfShadowFrameHint");
    expect(stateSource).toContain("debugSelfShadowEnabled: initialSelfShadowEnabled");
    expect(playbackSource).toContain("sampleMmdSelfShadowTrackInto");
    expect(playbackSource).toContain("applyMmdSelfShadowStateToThreeDirectionalLight");
    expect(playbackSource).toContain('from "../../../dist/runtime/index.js"');
    expect(playbackSource).toContain('from "../../../dist/three/index.js"');
    expect(playbackSource).toContain("applySelfShadowMotion()");
    expect(playbackSource).toContain("updateShadowCameraForFrame(state.currentModel.mesh)");
    const shadowCameraUpdateIndex = playbackSource.indexOf("updateShadowCameraForFrame(state.currentModel.mesh)");
    const minFarAssignment = "state.selfShadowLightOptionsScratch.minFar = state.keyLight.shadow.camera.far;";
    const minFarAssignmentIndex = playbackSource.indexOf(minFarAssignment);
    const selfShadowApplyIndex = playbackSource.indexOf("applyMmdSelfShadowStateToThreeDirectionalLight(");
    expect(minFarAssignmentIndex).toBeGreaterThan(shadowCameraUpdateIndex);
    expect(playbackSource.slice(minFarAssignmentIndex, selfShadowApplyIndex)).toBe(`${minFarAssignment}\n  `);
    expect(playbackSource).toContain("state.selfShadowBoundsRefreshCountdown = 0");
    expect(playbackSource).toContain("state.keyLight.castShadow = true");
    expect(playbackSource).toContain("!state.debugSelfShadowEnabled");
    expect(playbackSource).toContain("state.selfShadowLightOptionsScratch");
    expect(stateSource).toContain("shadowIntensity: 1.0");
    expect(htmlSource).toContain('id="debug-self-shadow-toggle"');
    expect(domSource).toContain('debugSelfShadowToggle: document.querySelector("#debug-self-shadow-toggle")');
    expect(mainSource).toContain("setSelfShadowEnabled(dom.debugSelfShadowToggle.checked)");
    expect(debugSource).toContain("export function setSelfShadowEnabled(enabled)");
    expect(debugSource).toContain("state.renderer.shadowMap.enabled = state.debugSelfShadowEnabled");
    expect(debugSource).toContain("selfShadowEnabled: state.debugSelfShadowEnabled");
  });

  it("keeps audio playback resume from seeking back to the start", async () => {
    const playbackSource = await readFile("examples/viewer/lib/playback.js", "utf8");
    const mainSource = await readFile("examples/viewer/main.js", "utf8");

    expect(playbackSource).toContain("syncMotionToAudioTime(state.audioNoEvaluateOptionsScratch);");
    expect(playbackSource).toContain("syncAudioToMotionTime(state.audioDriftSyncOptionsScratch)");
    expect(playbackSource).toContain("Math.abs(dom.bgmAudio.currentTime - targetTime) < 0.05");
    expect(playbackSource).toContain("state.elapsedSeconds = Math.max(audioTime + state.audioOffsetSeconds, 0)");
    expect(playbackSource).toContain("const offsetTargetTime = state.elapsedSeconds - state.audioOffsetSeconds");
    expect(playbackSource).toContain("state.isSyncingAudioTime = true;");
    expect(playbackSource).toContain("export function finishAudioTimeSync()");
    expect(mainSource).toContain("if (finishAudioTimeSync()) return;");
    expect(playbackSource).toContain("function hasTimelineSource()");
    expect(mainSource).toContain("function hasTimelineSource()");
    expect(mainSource).not.toContain("!state.isPlaying || !hasCurrentMotion()");
  });

  it("supports audio offset frames from the transport UI and fixture presets", async () => {
    const html = await readFile("examples/viewer/index.html", "utf8");
    const domSource = await readFile("examples/viewer/lib/dom.js", "utf8");
    const stateSource = await readFile("examples/viewer/lib/state.js", "utf8");
    const mainSource = await readFile("examples/viewer/main.js", "utf8");
    const audioSource = await readFile("examples/viewer/lib/audio-loading.js", "utf8");
    const assetLibrarySource = await readFile("examples/viewer/lib/asset-library.js", "utf8");
    const serverSource = await readFile("scripts/serve-example-viewer.mjs", "utf8");
    const fixtureSchema = await readFile("test/fixtures/fixtures.schema.json", "utf8");
    const styles = await readFile("examples/viewer/styles.css", "utf8");

    expect(html).toContain('id="audio-offset-control"');
    expect(html).toContain('id="audio-offset-frame"');
    expect(html).toContain('type="text"');
    expect(html).toContain('inputmode="numeric"');
    expect(html).toContain('pattern="-?[0-9]*"');
    expect(html.indexOf('id="audio-load-category"')).toBeLessThan(html.indexOf('id="audio-offset-control"'));
    expect(html.indexOf('id="audio-offset-control"')).toBeLessThan(html.indexOf('id="asset-audio-select"'));
    expect(html.indexOf('id="audio-offset-control"')).toBeLessThan(html.indexOf('id="background-load-category"'));
    expect(domSource).toContain('audioOffsetControl: document.querySelector("#audio-offset-control")');
    expect(domSource).toContain('audioOffsetFrameInput: document.querySelector("#audio-offset-frame")');
    expect(stateSource).toContain("audioOffsetFrame: 0");
    expect(stateSource).toContain("audioOffsetSeconds: 0");
    expect(mainSource).toContain("setAudioOffsetFrame");
    expect(mainSource).toContain('dom.audioOffsetFrameInput?.addEventListener("input", handleAudioOffsetFrameInput)');
    expect(mainSource).toContain('dom.audioOffsetFrameInput?.addEventListener("change", commitAudioOffsetFrameInput)');
    expect(mainSource).toContain("fallback: false");
    expect(mainSource).toContain("updateInput: false");
    expect(audioSource).toContain("export function setAudioOffsetFrame(value, options = {})");
    expect(audioSource).toContain("if (frame === undefined)");
    expect(audioSource).toContain("state.audioOffsetSeconds = frame / state.mmdFrameRate");
    expect(audioSource).toContain("const targetTime = state.elapsedSeconds - state.audioOffsetSeconds");
    expect(audioSource).not.toContain("dom.audioOffsetControl.hidden = state.currentAudioEntries.length === 0");
    expect(assetLibrarySource).toContain("audioOffsetFrame: state.audioOffsetFrame");
    expect(assetLibrarySource).toContain("offsetFrame: preset.audioOffsetFrame ?? preset.audio?.offsetFrame");
    expect(assetLibrarySource).toContain("offsetFrame: asset.audioOffsetFrame ?? asset.offsetFrame");
    expect(serverSource).toContain("fixtureCase.audioOffsetFrame ?? fixtureCase.audio?.offsetFrame");
    expect(serverSource).toContain("...(audioOffsetFrame !== undefined ? { audioOffsetFrame } : {})");
    expect(fixtureSchema).toContain('"audioOffsetFrame"');
    expect(fixtureSchema).toContain('"offsetFrame"');
    expect(styles).toContain(".audio-offset-control");
    expect(styles).toContain("#audio-offset-frame");
  });

  it("keeps the playback transport single-row without volume overflow on narrow viewports", async () => {
    const html = await readFile("examples/viewer/index.html", "utf8");
    const domSource = await readFile("examples/viewer/lib/dom.js", "utf8");
    const mainSource = await readFile("examples/viewer/main.js", "utf8");
    const styles = (await readFile("examples/viewer/styles.css", "utf8")).replaceAll("\r\n", "\n");

    expect(html).toContain('<sl-icon-button id="play-toggle" name="play" label="Play"></sl-icon-button>');
    expect(html).toContain('id="frame-current"');
    expect(html).toContain('id="frame-total"');
    expect(html).toContain('data-i18n-aria="aria.currentFrame"');
    expect(html).not.toContain("play_arrow");
    expect(domSource).toContain('playToggle: document.querySelector("#play-toggle")');
    expect(domSource).toContain('frameCurrentInput: document.querySelector("#frame-current")');
    expect(domSource).toContain('frameTotalText: document.querySelector("#frame-total")');
    expect(domSource).not.toContain("playToggleIcon");
    expect(domSource).toContain('const iconName = state.isPlaying ? "pause" : "play"');
    expect(domSource).toContain("dom.playToggle.name = iconName");
    expect(domSource).toContain("dom.playToggle.label = label");
    expect(mainSource).toContain("updatePlayToggle, updateStageState");
    expect(mainSource).toContain("updatePlayToggle();");
    expect(styles).toContain("--transport-min-height: 40px");
    expect(styles).toContain("min-height: var(--transport-min-height)");
    expect(styles).not.toContain("min-height: var(--transport-height)");
    expect(styles).toContain("grid-template-columns: 34px minmax(0, 1fr) max-content");
    expect(styles).toContain("grid-template-columns: auto minmax(48px, 90px)");
    expect(styles).toContain("grid-template-columns: auto minmax(48px, 54px)");
    expect(styles).toContain("#play-toggle::part(base)");
    expect(styles).toContain(".frame-display");
    expect(styles).toContain(".frame-display input");
    expect(styles).toContain("justify-self: end");
    expect(styles).toContain(".transport sl-range {\n    width: 100%;\n    min-width: 0;");
    expect(styles).toContain("#volume-slider {\n    width: 100%;\n    min-width: 0;");
    expect(styles).toContain("@media (max-width: 920px)");
    expect(styles).not.toContain("grid-column: 1 / -1");
    expect(styles).not.toContain("grid-template-columns: 1fr");
  });

  it("seeks to an entered current frame from the transport frame input", async () => {
    const mainSource = await readFile("examples/viewer/main.js", "utf8");
    const domSource = await readFile("examples/viewer/lib/dom.js", "utf8");
    const i18nSource = await readFile("examples/viewer/lib/i18n.js", "utf8");

    expect(i18nSource).toContain('"aria.currentFrame": "Current frame"');
    expect(i18nSource).toContain('"aria.currentFrame": "現在フレーム"');
    expect(mainSource).toContain("currentMotionDurationSeconds, debugEnabled");
    expect(mainSource).toContain("let frameCurrentInputDirty = false");
    expect(mainSource).toContain('dom.frameCurrentInput?.addEventListener("input", () => {');
    expect(mainSource).toContain('dom.frameCurrentInput?.addEventListener("keydown", handleFrameCurrentKeydown)');
    expect(mainSource).toContain('dom.frameCurrentInput?.addEventListener("change", commitFrameCurrentInput)');
    expect(mainSource).toContain('dom.frameCurrentInput?.addEventListener("blur", handleFrameCurrentBlur)');
    expect(mainSource).toContain('if (event.key === "Enter")');
    expect(mainSource).toContain("if (frameCurrentInputDirty)");
    expect(mainSource).toContain('} else if (event.key === "Escape")');
    expect(mainSource).toContain("function handleFrameCurrentBlur()");
    expect(mainSource).toContain("frameCurrentInputDirty = false");
    expect(mainSource).toContain("updatePlaybackDisplay({ forceFrameInput: true })");
    expect(mainSource).toContain("function seekToFrame(frame)");
    expect(mainSource).toContain("const targetFrame = Math.min(Math.max(frame, 0), maxFrame)");
    expect(mainSource).toContain("state.elapsedSeconds = targetFrame / state.mmdFrameRate");
    expect(mainSource).toContain("dom.timeline.value = state.elapsedSeconds");
    expect(mainSource).toContain('dom.timeline.setAttribute("value", String(state.elapsedSeconds))');
    expect(mainSource).toContain("evaluateRuntime(state.runtimePhysicsDisabledOptionsScratch)");
    expect(mainSource).toContain("syncAudioToMotionTime()");
    expect(domSource).toContain("dom.frameCurrentInput.value = currentText");
    expect(domSource).toContain("dom.frameTotalText.textContent = totalText");
  });

  it("refreshes chrome height after the audio controls change transport height", async () => {
    const audioSource = await readFile("examples/viewer/lib/audio-loading.js", "utf8");

    expect(audioSource).toContain('import { dom, setLoadedFileSwitcherOptions, setStatus, updateChromeHeights, updatePresetSectionVisibility } from "./dom.js"');
    expect(audioSource.indexOf("updateAudioOffsetInput();")).toBeLessThan(audioSource.indexOf("updatePresetSectionVisibility();"));
    expect(audioSource.indexOf("updatePresetSectionVisibility();")).toBeLessThan(audioSource.indexOf("updateChromeHeights();"));
  });

  it("persists viewer volume and reapplies it after reload and audio metadata loads", async () => {
    const mainSource = await readFile("examples/viewer/main.js", "utf8");

    expect(mainSource).toContain('const volumeStorageKey = "three-mmd-loader.viewer.volume.v1"');
    expect(mainSource.indexOf("const volumeStorageKey")).toBeLessThan(mainSource.indexOf("initVolumeControls()"));
    expect(mainSource).toContain('dom.volumeSlider?.addEventListener("sl-input", handleVolumeSliderInput)');
    expect(mainSource).toContain('dom.volumeSlider?.addEventListener("sl-change", handleVolumeSliderInput)');
    expect(mainSource).toContain("function applyStoredVolume()");
    expect(mainSource).toContain("function applyVolumeState(volume, muted)");
    expect(mainSource).toContain('dom.volumeSlider.setAttribute("value", String(clampedVolume))');
    expect(mainSource).toContain("dom.volumeSlider.value = clampedVolume");
    expect(mainSource).toContain("dom.volumeToggle.setAttribute(\"name\", iconName)");
    expect(mainSource).toContain('dom.bgmAudio.addEventListener("loadedmetadata", () => {');
    expect(mainSource).toContain("applyStoredVolume()");
    expect(mainSource).toContain("window.localStorage.setItem(volumeStorageKey, JSON.stringify({");
    expect(mainSource).toContain("volume: clampVolume(volume)");
    expect(mainSource).toContain("function clampVolume(volume)");
  });

  it("keeps viewer runtime updates allocation-light on the render path", async () => {
    const playbackSource = await readFile("examples/viewer/lib/playback.js", "utf8");
    const cameraSource = await readFile("examples/viewer/lib/camera-loading.js", "utf8");
    const stateSource = await readFile("examples/viewer/lib/state.js", "utf8");

    expect(playbackSource).toContain("export function evaluateRuntime(options)");
    expect(playbackSource).not.toContain("export function evaluateRuntime(options = {})");
    expect(playbackSource).not.toContain("state.currentModel.update(currentMmdSeconds(), {");
    expect(playbackSource).not.toContain("applyMmdSelfShadowStateToThreeDirectionalLight(state.keyLight, selfShadowState, {");
    expect(playbackSource).toContain("const updateOptions = state.runtimeUpdateOptionsScratch");
    expect(playbackSource).toContain("state.currentModel.update(currentMmdSeconds(), updateOptions)");
    expect(playbackSource).toContain("state.selfShadowLightOptionsScratch");
    expect(stateSource).toContain("runtimeUpdateOptionsScratch");
    expect(stateSource).toContain("runtimePhysicsDisabledOptionsScratch");
    expect(stateSource).toContain("audioNoEvaluateOptionsScratch");
    expect(stateSource).toContain("selfShadowLightOptionsScratch");
    expect(stateSource).toContain("cameraSampleScratch: new Float32Array(9)");
    expect(stateSource).toContain("lightSampleScratch: new Float32Array(6)");
    expect(cameraSource).toContain("sampleMmdAnimWasmCameraTrackInto(");
    expect(playbackSource).toContain("sampleMmdAnimWasmLightTrackInto(");
    expect(playbackSource).toContain("state.lightSampleScratch");
    expect(playbackSource).toContain("sampleMmdLightTrackInto(cameraMotion.lightFrames");
    expect(cameraSource).not.toContain(".sampleJson(");
    expect(cameraSource).not.toContain(".sampleArray(");
    expect(playbackSource).not.toContain(".sampleJson(");
    expect(playbackSource).not.toContain(".sampleArray(");
  });

  it("uses the custom Bullet MMD backend without an Ammo viewer fallback", async () => {
    const physicsSource = await readFile("examples/viewer/lib/physics-backend.js", "utf8");
    const stateSource = await readFile("examples/viewer/lib/state.js", "utf8");
    const mainSource = await readFile("examples/viewer/main.js", "utf8");
    const modelSource = await readFile("examples/viewer/lib/model-loading.js", "utf8");

    expect(stateSource).toContain('customBulletMmdScriptUrl: "/dist/physics/mmd/mmd_bullet.js"');
    expect(stateSource).not.toContain("ammoScriptUrl");
    expect(stateSource).not.toContain("physicsBackendKind");
    expect(stateSource).not.toContain("ammoNamespace");
    expect(physicsSource).toContain("loadCustomBulletMmdModule");
    expect(physicsSource).toContain("createCustomBulletMmdPhysicsBackend");
    expect(physicsSource).toContain("Physics disabled by viewer query parameter.");
    expect(physicsSource).toContain("dom.physicsErrorBanner.textContent = message");
    expect(physicsSource).not.toContain("loadAmmoNamespace");
    expect(physicsSource).not.toContain("createAmmoMmdPhysicsBackend");
    expect(mainSource).toContain('./lib/physics-backend.js');
    expect(modelSource).toContain('./physics-backend.js');
  });

  it("defers Bullet physics initialization until a model and motion are both bound", async () => {
    const physicsSource = await readFile("examples/viewer/lib/physics-backend.js", "utf8");
    const modelSource = await readFile("examples/viewer/lib/model-loading.js", "utf8");
    const motionSource = await readFile("examples/viewer/lib/motion-loading.js", "utf8");

    expect(physicsSource).toContain("createDeferredPhysicsBackend");
    expect(physicsSource).toContain("export async function ensurePhysicsBackendReady()");
    expect(physicsSource).toContain("loadPromise ??= createActivePhysicsBackend()");
    expect(modelSource).toContain("const physicsBackend = await createPhysicsBackend()");
    expect(modelSource).toContain("await ensurePhysicsBackendReady();");
    expect(modelSource).toContain("state.currentModel.setAnimation(state.currentMotion)");
    expect(motionSource).toContain("await ensurePhysicsBackendReady();\n    state.currentModel.setAnimation(animation)");
    expect(motionSource).toContain("void loadKurokoModelForQueuedMotion()");
    expect(motionSource).not.toContain("await ensurePhysicsBackendReady();\n      state.pendingMotionSource = source");
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

  it("serves Wasm with the browser streaming MIME type", async () => {
    const serverSource = await readFile("scripts/serve-example-viewer.mjs", "utf8");

    expect(serverSource).toContain('[".wasm", "application/wasm"]');
  });

  it("keeps the debug panel behind the debug query flag with collider controls", async () => {
    const html = await readFile("examples/viewer/index.html", "utf8");
    const mainSource = await readFile("examples/viewer/main.js", "utf8");
    const playbackSource = await readFile("examples/viewer/lib/playback.js", "utf8");
    const debugSource = await readFile("examples/viewer/lib/debug.js", "utf8");
    const domSource = await readFile("examples/viewer/lib/dom.js", "utf8");
    const stateSource = await readFile("examples/viewer/lib/state.js", "utf8");
    const styles = await readFile("examples/viewer/styles.css", "utf8");

    expect(html).toContain('id="debug-menu" hidden');
    expect(html).toContain('id="debug-colliders-toggle"');
    expect(html).toContain('id="debug-normals-toggle"');
    expect(html).toContain('id="debug-outline-off-toggle"');
    expect(html).toContain('id="debug-self-shadow-toggle"');
    expect(html).toContain('id="debug-fps-value"');
    expect(html).toContain('id="debug-frame-time-value"');
    expect(html).toContain('id="debug-memory-value"');
    expect(html).toContain("FPS");
    expect(html).toContain("Frame");
    expect(html).toContain("Memory");
    expect(html).not.toContain('id="debug-toon-off-toggle"');
    expect(html).not.toContain("Toon off");
    expect(html).not.toContain('id="debug-max-sub-steps"');
    expect(html).not.toContain('id="debug-dynamic-with-bone-feedback"');
    expect(html).not.toContain('id="debug-collision-margin"');
    expect(html).not.toContain('id="debug-solver-iterations"');
    expect(html).not.toContain('id="debug-split-impulse-toggle"');
    expect(html).not.toContain('id="debug-split-impulse-threshold"');
    expect(html).not.toContain('id="debug-refresh-state"');
    expect(html).not.toContain('id="debug-state-output"');
    expect(html).not.toContain("Refresh state");
    expect(html).toContain('type="checkbox" role="switch"');
    expect(html).toContain("bug_report");
    expect(html).not.toContain("id=\"debug-normals\"");
    expect(html).not.toContain("id=\"debug-toon-off\"");
    expect(html).not.toContain("id=\"debug-outline-off\"");
    expect(domSource).toContain('debugMenu: document.querySelector("#debug-menu")');
    expect(domSource).toContain('debugCollidersToggle: document.querySelector("#debug-colliders-toggle")');
    expect(domSource).toContain('debugNormalsToggle: document.querySelector("#debug-normals-toggle")');
    expect(domSource).toContain('debugOutlineOffToggle: document.querySelector("#debug-outline-off-toggle")');
    expect(domSource).toContain('debugSelfShadowToggle: document.querySelector("#debug-self-shadow-toggle")');
    expect(domSource).toContain('debugFpsValue: document.querySelector("#debug-fps-value")');
    expect(domSource).toContain('debugFrameTimeValue: document.querySelector("#debug-frame-time-value")');
    expect(domSource).toContain('debugMemoryValue: document.querySelector("#debug-memory-value")');
    expect(domSource).not.toContain('debugToonOffToggle: document.querySelector("#debug-toon-off-toggle")');
    expect(domSource).not.toContain('debugMaxSubStepsInput: document.querySelector("#debug-max-sub-steps")');
    expect(domSource).not.toContain('debugDynamicWithBoneFeedbackInput: document.querySelector("#debug-dynamic-with-bone-feedback")');
    expect(domSource).not.toContain('debugCollisionMarginInput: document.querySelector("#debug-collision-margin")');
    expect(domSource).not.toContain('debugSolverIterationsInput: document.querySelector("#debug-solver-iterations")');
    expect(domSource).not.toContain('debugSplitImpulseToggle: document.querySelector("#debug-split-impulse-toggle")');
    expect(domSource).not.toContain('debugSplitImpulsePenetrationThresholdInput: document.querySelector("#debug-split-impulse-threshold")');
    expect(domSource).not.toContain('debugRefreshStateButton: document.querySelector("#debug-refresh-state")');
    expect(domSource).not.toContain('debugStateOutput: document.querySelector("#debug-state-output")');
    expect(stateSource).toContain('new window.URLSearchParams(location.search).has("debug")');
    expect(stateSource).toContain('maxSubSteps: initialPhysicsMaxSubSteps');
    expect(stateSource).toContain('parseDebugInteger(query.get("maxSubSteps"), 5)');
    expect(stateSource).toContain('query.get("physics") === "0" ? false : true');
    expect(stateSource).toContain("physicsEnabled: initialPhysicsEnabled");
    expect(stateSource).toContain('solverIterations: initialSolverIterations');
    expect(stateSource).toContain('splitImpulsePenetrationThreshold: initialSplitImpulsePenetrationThreshold');
    expect(stateSource).toContain("if (value === null)");
    expect(stateSource).toContain('debugMaterialMode: "default"');
    expect(stateSource).toContain("debugOutlineHidden: false");
    expect(stateSource).toContain("debugFpsSampleSeconds: 0");
    expect(stateSource).toContain("debugFpsSampleFrames: 0");
    expect(stateSource).toContain("debugFrameTimeSampleMs: 0");
    expect(mainSource).toContain("if (!debugEnabled)");
    expect(mainSource).toContain("dom.debugMenu.hidden = false");
    expect(mainSource).toContain("window.mmdDebug = viewerApi.debug");
    expect(mainSource).toContain("toggleColliderHelpers()");
    expect(mainSource).toContain('setDebugMaterialMode(dom.debugNormalsToggle.checked ? "normals" : "default")');
    expect(mainSource).toContain("setOutlineHidden(dom.debugOutlineOffToggle.checked)");
    expect(mainSource).toContain("setSelfShadowEnabled(dom.debugSelfShadowToggle.checked)");
    expect(mainSource).not.toContain("dom.debugToonOffToggle");
    expect(mainSource).not.toContain('"toonOff"');
    expect(mainSource).not.toContain("setPhysicsMaxSubSteps(dom.debugMaxSubStepsInput.value)");
    expect(mainSource).not.toContain("setDynamicWithBoneRotationFeedbackScale(dom.debugDynamicWithBoneFeedbackInput.value)");
    expect(mainSource).not.toContain("setCollisionMargin(dom.debugCollisionMarginInput.value)");
    expect(mainSource).not.toContain("setSolverIterations(dom.debugSolverIterationsInput.value)");
    expect(mainSource).not.toContain("setSplitImpulse(dom.debugSplitImpulseToggle.checked)");
    expect(mainSource).not.toContain("setSplitImpulsePenetrationThreshold(dom.debugSplitImpulsePenetrationThresholdInput.value)");
    expect(mainSource).not.toContain("dom.debugRefreshStateButton");
    expect(playbackSource).toContain("updateColliderHelpers()");
    expect(playbackSource).toContain("state.physicsEnabled &&");
    expect(playbackSource).toContain("updateDebugFps(delta)");
    expect(debugSource).toContain("export function toggleColliderHelpers()");
    expect(debugSource).toContain("export function setDebugMaterialMode(mode)");
    expect(debugSource).not.toContain('import Stats from "three/addons/libs/stats.module.js"');
    expect(debugSource).toContain("export function updateDebugFps(deltaSeconds)");
    expect(debugSource).toContain("state.debugFpsSampleSeconds += deltaSeconds");
    expect(debugSource).toContain("state.debugFrameTimeSampleMs += deltaSeconds * 1000");
    expect(debugSource).toContain("dom.debugFpsValue.textContent = fps.toFixed(1)");
    expect(debugSource).toContain("dom.debugFrameTimeValue.textContent = `${frameTimeMs.toFixed(1)} ms`");
    expect(debugSource).toContain("physicsEnabled: state.physicsEnabled");
    expect(debugSource).toContain("ikMaxIterationsCap: state.ikMaxIterationsCap ?? null");
    expect(debugSource).toContain("function formatDebugMemory()");
    expect(debugSource).toContain("window.performance?.memory");
    expect(debugSource).toContain("usedJSHeapSize");
    expect(debugSource).not.toContain("toonOff");
    expect(debugSource).not.toContain("function applyToonOffMaterial()");
    expect(debugSource).not.toContain("currentBodyDebugMeshes");
    expect(debugSource).toContain("...(state.currentModel.renderOrderMeshes ?? [])");
    expect(debugSource).toContain("...(state.currentModel.outlineMeshes ?? [])");
    expect(debugSource).toContain("export function setOutlineHidden(hidden)");
    expect(debugSource).toContain("export function setPhysicsMaxSubSteps(value)");
    expect(debugSource).toContain("export function setSolverIterations(value)");
    expect(debugSource).toContain("export function setSplitImpulse(enabled)");
    expect(debugSource).toContain("export function setSplitImpulsePenetrationThreshold(value)");
    expect(debugSource).toContain("dumpRigidBodies(indices)");
    expect(debugSource).toContain("dumpCollisionPair(indexA, indexB)");
    expect(debugSource).toContain("function rigidBodyCollisionGroup(body)");
    expect(debugSource).toContain("function rigidBodyCollisionMask(body)");
    expect(debugSource).toContain("new THREE.LineSegments(");
    expect(debugSource).toContain("function createColliderLineGeometry(body)");
    expect(debugSource).toContain("function appendEllipseSegments(");
    expect(debugSource).toContain("function colliderMaterialForGroup(collisionGroup, materialsByGroup)");
    expect(debugSource).toContain("new THREE.LineBasicMaterial({");
    expect(debugSource).not.toContain("wireframe: true");
    expect(debugSource).toContain("function createRigidBodyRestMatrix(body)");
    expect(debugSource).toContain("function setHelperMatrixFromMmdMatrix(helper, matrix)");
    expect(debugSource).toContain("makeScale(1, 1, -1)");
    expect(debugSource).toContain("helper.matrixWorldNeedsUpdate = true");
    expect(debugSource).toContain("mmdRigidBodyRestMatrix");
    expect(debugSource).toContain("mmdRigidBodyGroup");
    expect(debugSource).toContain("mmd collider group");
    expect(debugSource).toContain("state.showDebugColliders = state.debugCollidersVisible");
    expect(styles).toContain(".debug-menu[hidden]");
    expect(styles).toContain(".debug-metrics");
    expect(styles).toContain(".debug-metric");
    expect(styles).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(styles).not.toContain(".debug-number");
    expect(styles).not.toContain("#debug-refresh-state");
    expect(styles).not.toContain("#debug-state-output");
    expect(styles).toContain(".debug-toggle input:checked");
  });

  it("provides a canvas capture button in the debug panel that downloads a PNG", async () => {
    const html = await readFile("examples/viewer/index.html", "utf8");
    const debugSource = await readFile("examples/viewer/lib/debug.js", "utf8");
    const domSource = await readFile("examples/viewer/lib/dom.js", "utf8");
    const mainSource = await readFile("examples/viewer/main.js", "utf8");
    const styles = await readFile("examples/viewer/styles.css", "utf8");

    expect(html).toContain('id="debug-capture-button"');
    expect(html).toContain("photo_camera");
    expect(html).toContain("Capture");
    expect(domSource).toContain('debugCaptureButton: document.querySelector("#debug-capture-button")');
    expect(debugSource).toContain("export function captureCanvas()");
    expect(debugSource).toContain("submitViewerRender();");
    expect(debugSource).toContain('state.renderer.domElement.toDataURL("image/png")');
    expect(debugSource).toContain("link.download =");
    expect(debugSource).toContain("link.click()");
    expect(mainSource).toContain('dom.debugCaptureButton?.addEventListener("click", captureCanvas)');
    expect(mainSource).toContain("captureCanvas");
    expect(styles).toContain(".debug-capture-button");
  });

  it("provides before/after capture comparison in the debug panel", async () => {
    const debugSource = await readFile("examples/viewer/lib/debug.js", "utf8");
    const mainSource = await readFile("examples/viewer/main.js", "utf8");
    const domSource = await readFile("examples/viewer/lib/dom.js", "utf8");
    const stateSource = await readFile("examples/viewer/lib/state.js", "utf8");
    const html = await readFile("examples/viewer/index.html", "utf8");

    expect(debugSource).toContain("function markBeforeCapture()");
    expect(debugSource).toContain("function captureAfterAndCompare()");
    expect(debugSource).toContain("function showComparisonOverlay(");
    expect(debugSource).toContain("state.debugBeforeCapture");
    expect(mainSource).toContain("markBeforeCapture");
    expect(mainSource).toContain("captureAfterAndCompare");
    expect(domSource).toContain("debugBeforeButton:");
    expect(domSource).toContain("debugCompareAfterButton:");
    expect(stateSource).toContain("debugBeforeCapture:");
    expect(html).toContain('id="debug-before-button"');
    expect(html).toContain('id="debug-compare-after-button"');
  });

  it("shows model diagnostics in a collapsible debug panel section", async () => {
    const html = await readFile("examples/viewer/index.html", "utf8");
    const diagnosticsSource = await readFile("examples/viewer/lib/diagnostics.js", "utf8");
    const domSource = await readFile("examples/viewer/lib/dom.js", "utf8");
    const modelSource = await readFile("examples/viewer/lib/model-loading.js", "utf8");
    const styles = await readFile("examples/viewer/styles.css", "utf8");

    expect(html).toContain('id="debug-diagnostics"');
    expect(html).toContain('id="debug-diagnostics-count"');
    expect(html).toContain('id="debug-diagnostics-list"');
    expect(domSource).toContain('debugDiagnostics: document.querySelector("#debug-diagnostics")');
    expect(domSource).toContain('debugDiagnosticsCount: document.querySelector("#debug-diagnostics-count")');
    expect(domSource).toContain('debugDiagnosticsList: document.querySelector("#debug-diagnostics-list")');
    expect(diagnosticsSource).toContain("export function updateDiagnosticsPanel(model)");
    expect(diagnosticsSource).toContain("metadata?.diagnostics ?? []");
    expect(diagnosticsSource).toContain("diagnostic.category ?? diagnostic.level");
    expect(diagnosticsSource).toContain("diagnostic.code");
    expect(diagnosticsSource).toContain("diagnostic.message");
    expect(diagnosticsSource).toContain("export function clearDiagnosticsPanel()");
    expect(modelSource).toContain("updateDiagnosticsPanel(state.currentModel)");
    expect(modelSource).toContain("clearDiagnosticsPanel()");
    expect(styles).toContain(".debug-diagnostics");
    expect(styles).toContain(".debug-diagnostics-list");
    expect(styles).toContain(".debug-diagnostic-item");
    expect(styles).toContain(".debug-diagnostic-badge");
    expect(styles).toContain(".debug-diagnostic-warning");
    expect(styles).toContain(".debug-diagnostic-error");
  });

  it("does not keep transient debug console logs in the viewer", async () => {
    const mainSource = await readFile("examples/viewer/main.js", "utf8");
    const playbackSource = await readFile("examples/viewer/lib/playback.js", "utf8");
    const marker = "[mmd" + "-debug]";

    expect(mainSource).not.toContain(marker);
    expect(playbackSource).not.toContain(marker);
  });

  it("uses the non-deprecated Three.js frame timer in the viewer loop", async () => {
    const mainSource = await readFile("examples/viewer/main.js", "utf8");
    const playbackSource = await readFile("examples/viewer/lib/playback.js", "utf8");
    const stateSource = await readFile("examples/viewer/lib/state.js", "utf8");

    expect(stateSource).toContain("frameTimer: new THREE.Timer()");
    expect(stateSource).toContain("state.frameTimer.connect(document)");
    expect(mainSource).toContain("state.frameTimer.update()");
    expect(playbackSource).toContain("state.frameTimer.update()");
    expect(playbackSource).toContain("state.frameTimer.getDelta()");
    expect(stateSource).not.toContain("new THREE.Clock()");
  });

  it("auto-loads kuroko stand-in model when a non-camera VMD is loaded without a model", async () => {
    const motionSource = await readFile("examples/viewer/lib/motion-loading.js", "utf8");
    const stateSource = await readFile("examples/viewer/lib/state.js", "utf8");
    const mainSource = await readFile("examples/viewer/main.js", "utf8");
    const serverSource = await readFile("scripts/serve-example-viewer.mjs", "utf8");

    expect(stateSource).toContain("kurokoModelUrl");
    expect(stateSource).toContain('"assets/yw_test_model.pmx"');
    expect(stateSource).toContain("state.kurokoModelLoadPromise = undefined");
    expect(motionSource).toContain('import("./model-loading.js")');
    expect(motionSource).toContain("kurokoModelUrl");
    expect(motionSource).toContain("loadModelFromUrl(kurokoModelUrl, {");
    expect(motionSource).toContain("shouldCommit: hasQueuedMotionWithoutModel");
    expect(motionSource).toContain("function hasQueuedMotionWithoutModel()");
    expect(motionSource).toContain("state.pendingMotionSource !== undefined");
    expect(motionSource).toContain('setStatus("Motion queued", "ready")');
    expect(mainSource).toContain("kurokoModelUrl");
    expect(mainSource).toContain("fetch(kurokoModelUrl)");
    expect(mainSource).toContain(".catch(() => {})");
    expect(serverSource).toContain('pathname.startsWith("/assets/")');
    expect(serverSource).toContain('return resolve(viewerRoot, "assets", relativePath)');
  });

  it("keeps PMM and accessory support parser-only", async () => {
    const mainSource = await readFile("examples/viewer/main.js", "utf8");
    const domSource = await readFile("examples/viewer/lib/dom.js", "utf8");
    const stateSource = await readFile("examples/viewer/lib/state.js", "utf8");
    const html = await readFile("examples/viewer/index.html", "utf8");

    expect(mainSource).not.toContain("loadPmmFolder");
    expect(mainSource).not.toContain("loadAccessoryFile");
    expect(domSource).not.toContain("pmmFolderInput:");
    expect(domSource).not.toContain("accessoryFileInput:");
    expect(stateSource).not.toContain("currentAccessory:");
    expect(html).not.toContain('id="choose-pmm-folder"');
    expect(html).not.toContain('id="accessory-load-category"');
  });

  it("shows bone detection results in the debug panel", async () => {
    const modelSource = await readFile("examples/viewer/lib/model-loading.js", "utf8");
    const diagnosticsSource = await readFile("examples/viewer/lib/diagnostics.js", "utf8");
    const domSource = await readFile("examples/viewer/lib/dom.js", "utf8");
    const html = await readFile("examples/viewer/index.html", "utf8");

    expect(modelSource).toContain('import { detectStandardBones } from "../../../dist/parser/index.js"');
    expect(modelSource).toContain("detectStandardBones(");
    expect(modelSource).toContain("updateBoneDetectionPanel(");
    expect(modelSource).toContain("clearBoneDetectionPanel()");
    expect(diagnosticsSource).toContain("function updateBoneDetectionPanel(");
    expect(diagnosticsSource).toContain("function clearBoneDetectionPanel(");
    expect(domSource).toContain('debugBoneDetection:');
    expect(domSource).toContain('debugBoneDetectionContent:');
    expect(html).toContain('id="debug-bone-detection"');
  });
});

async function readFile(path: string, encoding: BufferEncoding): Promise<string> {
  return (await readRawFile(path, encoding)).replaceAll("\r\n", "\n");
}

async function readLocalOptionalText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}
