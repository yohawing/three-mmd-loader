#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { PNG } from "pngjs";
import {
  browserLaunchOptions,
  commonWebMimeTypes,
  isPathInside,
  peekArgValue,
  startStaticServer
} from "./render-shared.mjs";
import {
  analyzeDedicatedRawVisibility,
  analyzeOutsideCharacterDarkening,
  analyzeReceiverDarkening,
  compareFullFrameLuminance,
  compareLightConfigurations,
  compareWorldShadowPosition,
  countForegroundPixels,
  dedicatedRawDiagnosticsPass,
  dedicatedRawRois,
  dedicatedRawVisibilityPass,
  foregroundRatio,
  localBackgroundMetricPasses,
  localMetricPasses,
  receiverWorldBounds,
  selfShadowDiagnosticsPass,
  shadowCameraOccupancyPasses,
  thresholds,
  vmdLifecycleGate,
  vmdLifecyclePixelPass,
  vmdObservation
} from "./viewer-self-shadow-analysis.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const syntheticFixturePath = "test/fixtures/generated/visual/mmd-viewer-self-shadow-receiver.pmx";
const defaultOutputDir = path.join(repoRoot, "test-results", "visual", "viewer-self-shadow");
const cameraViews = {
  primary: { position: [3.6, 3.2, 7.4], target: [0, 0.25, 0] },
  // Keep elevation/depth fixed while changing azimuth so both captures retain
  // comparable coverage of the same receiver shadow region.
  moved: { position: [-3.0, 3.2, 7.4], target: [0, 0.25, 0] }
};
const localCameraViews = {
  // The main light arrives from front-up-right. Observe the opposite hemisphere
  // so occluded character surfaces are visible instead of hidden behind the model.
  primary: { useAutoFit: true, orbitRadians: Math.PI * 0.75 },
  moved: { useAutoFit: true, orbitRadians: Math.PI * 1.25 }
};
const mimeTypes = new Map([
  ...commonWebMimeTypes,
  [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".bmp", "image/bmp"],
  [".tga", "image/x-tga"], [".dds", "image/vnd-ms.dds"]
]);

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!existsSync(path.join(repoRoot, "dist", "three", "index.js"))) {
    throw new Error("dist/three/index.js is missing. Run npm run build before the viewer self-shadow gate.");
  }
  if (!options.localModel && !existsSync(path.join(repoRoot, syntheticFixturePath))) {
    throw new Error(`Synthetic self-shadow fixture is missing: ${syntheticFixturePath}`);
  }
  await mkdir(options.outputDir, { recursive: true });
  const dataRoots = {
    model: options.localModel ? path.dirname(options.localModel) : undefined,
    motion: options.localMotion ? path.dirname(options.localMotion) : undefined,
    background: options.localBackground ? path.dirname(options.localBackground) : undefined
  };
  const server = await startStaticServer(pathname => resolveRequestPath(pathname, dataRoots), mimeTypes);
  const report = {
    fixture: options.localModel ?? syntheticFixturePath,
    backend: options.backend,
    localMotion: options.localMotion ?? null,
    localBackground: options.localBackground ?? null,
    vmdLifecycle: options.vmdLifecycle,
    passed: false,
    thresholds,
    metricDefinitions: {
      receiverDarkening: "fixed receiver-plane samples compare independent initial selfShadow=0 and selfShadow=1 viewer contexts; positive values are darker with SelfShadow enabled.",
      characterSelfShadow: "local character-only OFF/ON captures measure self-shadow without a background receiver.",
      characterToBackgroundShadow: "local character-plus-background OFF/ON captures measure positive darkening only outside a captured character silhouette, so character self-shadow cannot satisfy the background-shadow observation.",
      worldShadowPosition: "each positive receiver darkening sample is ray-projected from its capture camera onto y=0.002; the camera-only comparison keeps elevation/depth fixed while changing azimuth so the luminance-weighted world x/z centroid is measured over comparable receiver coverage.",
      lightConfiguration: "DirectionalLight world position/target plus shadow-camera world matrix, near/far, and orthographic bounds must be unchanged across camera-only captures.",
      dedicatedRawVisibility: "dedicated raw mode renders grayscale visibility from the independent caster depth target; the same-surface outer ROI must remain lit while the separate-surface shadow ROI contains a bounded dark region. The synthetic fixture has no background receiver, so that ROI is reported as null.",
      localSparseShadow: "local character gates use mean darkening, p995 darkening, and positive shadow-pixel ratio; background gates use mean darkening, max darkening, and positive shadow-pixel ratio because p995 can remain zero at very sparse coverage. p95 remains diagnostic-only.",
      vmdLifecyclePixels: "mode 0 requires near-zero OFF/ON image darkening; modes 1 and 2 require positive mean darkening and shadow-pixel coverage in both camera views."
    },
    cases: []
  };
  let browser;
  try {
    const launchOptions = browserLaunchOptions();
    browser = await chromium.launch({
      ...launchOptions,
      args: ["--enable-unsafe-webgpu", ...(launchOptions.args ?? [])]
    });
    const modelUrl = options.localModel
      ? dataUrl("model", options.localModel)
      : `/${syntheticFixturePath}`;
    const backgroundUrl = options.localBackground
      ? dataUrl("background", options.localBackground)
      : undefined;
    const motionUrl = options.localMotion
      ? dataUrl("motion", options.localMotion)
      : undefined;
    const characterScenario = await captureScenario(
      browser, server.origin, modelUrl, undefined, motionUrl, "character", options.outputDir, Boolean(options.localModel), options.rawVisibility, options.standardReceiver, options.dedicatedRawVisibility, options.backend
    );
    const backgroundScenario = backgroundUrl
      ? await captureScenario(
          browser, server.origin, modelUrl, backgroundUrl, motionUrl, "character-background", options.outputDir, true, options.rawVisibility, options.standardReceiver, options.dedicatedRawVisibility, options.backend
        )
      : undefined;
    const { primary, moved } = characterScenario;
    const messages = [
      ...primary.off.messages,
      ...primary.on.messages,
      ...moved.off.messages,
      ...moved.on.messages,
      ...(backgroundScenario ? [
        ...backgroundScenario.primary.off.messages,
        ...backgroundScenario.primary.on.messages,
        ...backgroundScenario.moved.off.messages,
        ...backgroundScenario.moved.on.messages
      ] : [])
    ];
    const shadowCameraOccupancy = {
      primary: primary.on.shadowCameraOccupancy ?? { status: "not-applicable", reason: "backend does not expose occupancy" },
      moved: moved.on.shadowCameraOccupancy ?? { status: "not-applicable", reason: "backend does not expose occupancy" }
    };
    const diagnostics = {
      primary: { off: primary.off.diagnostics, on: primary.on.diagnostics },
      moved: { off: moved.off.diagnostics, on: moved.on.diagnostics }
    };
    const lightConfiguration = compareLightConfigurations(primary.on.diagnostics, moved.on.diagnostics);
    const primaryReceiver = options.localModel
      ? undefined
      : analyzeReceiverDarkening(primary.off.png, primary.on.png, primary.on.camera, receiverWorldBounds);
    const movedReceiver = options.localModel
      ? undefined
      : analyzeReceiverDarkening(moved.off.png, moved.on.png, moved.on.camera, receiverWorldBounds);
    const dedicatedPrimary = options.localModel || !options.dedicatedRawVisibility
      ? undefined
      : analyzeDedicatedRawVisibility(primary.off.png, primary.on.png, primary.on.camera, receiverWorldBounds);
    const dedicatedMoved = options.localModel || !options.dedicatedRawVisibility
      ? undefined
      : analyzeDedicatedRawVisibility(moved.off.png, moved.on.png, moved.on.camera, receiverWorldBounds);
    const worldShadowPosition = primaryReceiver && movedReceiver
      ? compareWorldShadowPosition(primaryReceiver, movedReceiver)
      : undefined;
    const fullFrame = {
      primary: compareFullFrameLuminance(primary.off.png, primary.on.png),
      moved: compareFullFrameLuminance(moved.off.png, moved.on.png)
    };
    const backgroundShadow = backgroundScenario ? {
      primary: analyzeOutsideCharacterDarkening(
        backgroundScenario.primary.off.png,
        backgroundScenario.primary.on.png,
        backgroundScenario.primary.on.characterSilhouette
      ),
      moved: analyzeOutsideCharacterDarkening(
        backgroundScenario.moved.off.png,
        backgroundScenario.moved.on.png,
        backgroundScenario.moved.on.characterSilhouette
      )
    } : null;
    const requireSparseMorphs = !options.localModel && options.backend === "webgpu";
    const inactiveVmdMode = options.vmdLifecycle && primary.on.diagnostics.vmdSelfShadow?.mode === 0;
    const diagnosticPass = options.backend === "baseline"
      ? true
      : options.dedicatedRawVisibility
        ? dedicatedRawDiagnosticsPass(primary.on.diagnostics, requireSparseMorphs) &&
          dedicatedRawDiagnosticsPass(moved.on.diagnostics, requireSparseMorphs)
        : selfShadowDiagnosticsPass(primary.on.diagnostics, requireSparseMorphs, !inactiveVmdMode) &&
          selfShadowDiagnosticsPass(moved.on.diagnostics, requireSparseMorphs, !inactiveVmdMode);
    const shadowCameraOccupancyPass = options.backend === "baseline"
      ? true
      : Object.values(shadowCameraOccupancy)
        .filter((occupancy) => occupancy?.status !== "not-applicable")
        .every((occupancy) => shadowCameraOccupancyPasses(occupancy));
    const dedicatedRawPass = !options.dedicatedRawVisibility || options.localModel
      ? true
      : dedicatedRawVisibilityPass(dedicatedPrimary) && dedicatedRawVisibilityPass(dedicatedMoved);
    const syntheticPass = !options.localModel && primaryReceiver && movedReceiver && worldShadowPosition
      ? diagnosticPass &&
        shadowCameraOccupancyPass &&
        primaryReceiver.meanDarkening >= thresholds.receiverMeanDarkeningMin &&
        movedReceiver.meanDarkening >= thresholds.receiverMeanDarkeningMin &&
        primaryReceiver.p995Darkening >= thresholds.receiverP995DarkeningMin &&
        movedReceiver.p995Darkening >= thresholds.receiverP995DarkeningMin &&
        primaryReceiver.shadowPixelRatio >= thresholds.shadowPixelRatioMin &&
        movedReceiver.shadowPixelRatio >= thresholds.shadowPixelRatioMin &&
        dedicatedRawPass &&
        worldShadowPosition.centroidDistance <= thresholds.worldCentroidMaxDistance &&
        lightConfiguration.maxDelta <= thresholds.lightWorldConfigurationMaxDelta
      : undefined;
    const localDarkeningPass = options.localModel
      ? options.vmdLifecycle
        ? vmdLifecyclePixelPass(fullFrame, primary.on.diagnostics.vmdSelfShadow?.mode)
        : localMetricPasses(fullFrame, thresholds.localFullFrameMeanDarkeningMin, thresholds.localFullFrameP995DarkeningMin, thresholds.localShadowPixelRatioMin)
      : undefined;
    const localBackgroundPass = backgroundShadow
      ? localBackgroundMetricPasses(backgroundShadow)
      : undefined;
    const vmdLifecyclePass = options.vmdLifecycle
      ? vmdLifecycleGate(primary, moved)
      : undefined;
    const localObservationPass = options.localModel
      ? diagnosticPass &&
        shadowCameraOccupancyPass &&
        localDarkeningPass &&
        (localBackgroundPass ?? true) &&
        (vmdLifecyclePass ?? true) &&
        lightConfiguration.maxDelta <= thresholds.lightWorldConfigurationMaxDelta
      : undefined;
    report.rawVisibility = options.rawVisibility;
    report.standardReceiver = options.standardReceiver;
    report.dedicatedRawVisibility = options.dedicatedRawVisibility;
    report.native = {
      primary: { off: primary.off.native, on: primary.on.native },
      moved: { off: moved.off.native, on: moved.on.native }
    };
    report.cases.push(serializablePair(primary), serializablePair(moved));
    report.backgroundCases = backgroundScenario
      ? [serializablePair(backgroundScenario.primary), serializablePair(backgroundScenario.moved)]
      : [];
    report.diagnostics = diagnostics;
    report.fullFrame = fullFrame;
    report.receiver = primaryReceiver && movedReceiver ? { bounds: receiverWorldBounds, primary: primaryReceiver, moved: movedReceiver } : null;
    report.dedicatedRaw = dedicatedPrimary && dedicatedMoved
      ? { bounds: receiverWorldBounds, rois: dedicatedRawRois, primary: dedicatedPrimary, moved: dedicatedMoved, passed: dedicatedRawPass }
      : null;
    report.worldShadowPosition = worldShadowPosition ?? null;
    report.lightConfiguration = lightConfiguration;
    report.shadowCameraOccupancy = { ...shadowCameraOccupancy, passed: shadowCameraOccupancyPass };
    report.localObservations = options.localModel ? {
      characterSelfShadow: { passed: localDarkeningPass, metrics: fullFrame },
      characterToBackgroundShadow: backgroundShadow
        ? { passed: localBackgroundPass, metrics: backgroundShadow, mask: "character silhouette excluded" }
        : { status: "not-requested", reason: "--local-background was not supplied" }
    } : null;
    report.vmdLifecycle = options.vmdLifecycle
      ? {
          primary: {
            off: vmdObservation(primary.off.diagnostics),
            on: vmdObservation(primary.on.diagnostics)
          },
          moved: {
            off: vmdObservation(moved.off.diagnostics),
            on: vmdObservation(moved.on.diagnostics)
          }
        }
      : null;
    report.vmdLifecyclePass = vmdLifecyclePass;
    report.messages = messages;
    report.passed = options.localModel ? localObservationPass && messages.length === 0 : syntheticPass && messages.length === 0;
    if (!report.passed) {
      throw new Error(`viewer self-shadow gate failed: ${JSON.stringify({ diagnosticPass, shadowCameraOccupancy, shadowCameraOccupancyPass, primaryReceiver, movedReceiver, dedicatedPrimary, dedicatedMoved, dedicatedRawPass, worldShadowPosition, lightConfiguration, fullFrame, backgroundShadow, localDarkeningPass, localBackgroundPass, vmdLifecyclePass, messages })}`);
    }
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    await writeFile(path.join(options.outputDir, "report.json"), JSON.stringify(report, null, 2));
    await browser?.close();
    await server.close();
  }
}

function serializablePair(pair) {
  return {
    name: pair.name,
    camera: pair.on.camera,
    off: { imagePath: `${pair.name}-off.png`, diagnostics: pair.off.diagnostics },
    on: { imagePath: `${pair.name}-on.png`, diagnostics: pair.on.diagnostics }
  };
}

async function waitForViewer(page) {
  await page.waitForFunction(
    () => Boolean(globalThis.mmdViewer?.renderer && globalThis.mmdViewer?.scene && globalThis.mmdViewer?.debug),
    null,
    { timeout: 20000 }
  ).catch(async error => {
    const status = await page.locator("#status").textContent().catch(() => "<missing>");
    throw new Error(`Native main viewer did not initialize: ${error.message}; status=${status}`);
  });
}

async function viewerObservation(page, backend) {
  return await page.evaluate((requestedBackend) => {
    const renderer = globalThis.mmdViewer.renderer;
    const rendererKind = renderer?.isWebGLRenderer === true
      ? "webgl"
      : renderer?.isWebGPURenderer === true
        ? "webgpu"
        : "unknown";
    const nativeWebgpu = renderer?.backend?.isWebGPUBackend === true;
    const expectedRendererKind = requestedBackend === "baseline" ? "webgl" : "webgpu";
    const expectedNativeWebgpu = requestedBackend === "webgpu";
    return {
      requestedBackend,
      rendererKind,
      nativeWebgpu,
      backendMatch: rendererKind === expectedRendererKind && nativeWebgpu === expectedNativeWebgpu,
      modelPresent: Boolean(globalThis.mmdViewer.currentModel?.root),
      backgroundPresent: Boolean(globalThis.mmdViewer.currentBackground?.root),
      diagnostics: globalThis.mmdViewer.debug.selfShadowDiagnostics()
    };
  }, backend);
}

async function captureScenario(browser, origin, modelUrl, backgroundUrl, motionUrl, label, outputDir, useAutoFit = false, rawVisibility = false, standardReceiver = false, dedicatedRawVisibility = false, backend = "webgpu") {
  const views = useAutoFit ? localCameraViews : cameraViews;
  const primary = await captureIsolatedPair(
    browser, origin, modelUrl, backgroundUrl, motionUrl, `${label}-primary`, views.primary, outputDir, rawVisibility, standardReceiver, dedicatedRawVisibility, backend
  );
  const moved = await captureIsolatedPair(
    browser, origin, modelUrl, backgroundUrl, motionUrl, `${label}-moved`, views.moved, outputDir, rawVisibility, standardReceiver, dedicatedRawVisibility, backend
  );
  return { primary, moved };
}

async function captureIsolatedPair(browser, origin, modelUrl, backgroundUrl, motionUrl, name, camera, outputDir, rawVisibility, standardReceiver, dedicatedRawVisibility, backend) {
  const off = await captureIsolatedShadowState(
    browser, origin, modelUrl, backgroundUrl, motionUrl, name, camera, false, outputDir, rawVisibility, standardReceiver, dedicatedRawVisibility, backend
  );
  const on = await captureIsolatedShadowState(
    browser, origin, modelUrl, backgroundUrl, motionUrl, name, camera, true, outputDir, rawVisibility, standardReceiver, dedicatedRawVisibility, backend
  );
  return { name, off, on };
}

async function captureIsolatedShadowState(browser, origin, modelUrl, backgroundUrl, motionUrl, name, camera, enabled, outputDir, rawVisibility, standardReceiver, dedicatedRawVisibility, backend) {
  const context = await browser.newContext({ viewport: { width: 960, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const messages = [];
  page.on("pageerror", error => messages.push(error.message));
  try {
    const shadowState = enabled ? "1" : "0";
    await page.goto(
      `${origin}/examples/viewer/?backend=${backend}&debug&physics=0&runtime=js&selfShadow=${shadowState}`,
      { waitUntil: "domcontentloaded" }
    );
    await waitForViewer(page);
    const loaded = await page.evaluate(async (url) => globalThis.mmdViewer.loadModelUrl(url), modelUrl);
    if (!loaded) {
      const status = await page.locator("#status").textContent().catch(() => "<missing>");
      throw new Error(`Main viewer model URL load returned false: status=${status}; messages=${JSON.stringify(messages)}`);
    }
    if (backgroundUrl) {
      const backgroundLoaded = await page.evaluate(async (url) => globalThis.mmdViewer.loadBackgroundUrl(url), backgroundUrl);
      if (!backgroundLoaded) {
        throw new Error("Main viewer local background URL load returned false.");
      }
    }
    if (motionUrl) {
      const motionLoaded = await page.evaluate(async (url) => globalThis.mmdViewer.loadMotionUrl(url), motionUrl);
      if (!motionLoaded) {
        throw new Error("Main viewer local motion URL load returned false.");
      }
    }
    if (dedicatedRawVisibility) {
      await useDedicatedRawShadowVisibilityMaterial(page);
    } else if (rawVisibility) {
      await useRawShadowVisibilityMaterial(page);
    }
    if (standardReceiver) {
      await useStandardShadowReceiverMaterial(page);
    }
    await page.waitForTimeout(700);
    const native = await viewerObservation(page, backend);
    if (!native.backendMatch) {
      throw new Error(`Unexpected renderer backend for ${backend}: ${JSON.stringify(native)}`);
    }
    const screenshotPath = path.join(outputDir, `${name}-${enabled ? "on" : "off"}.png`);
    const observation = await captureInitialShadowState(page, camera, screenshotPath, motionUrl ? 0.5 : 0);
    const characterSilhouette = backgroundUrl && enabled
      ? await captureCharacterSilhouette(page, screenshotPath.replace(/\.png$/, "-character-mask.png"))
      : undefined;
    const shadowCameraOccupancy = enabled && backend !== "baseline"
      ? native.diagnostics?.light?.castShadow === true
        ? await captureShadowCameraOccupancy(page, outputDir, name)
        : { status: "not-applicable", reason: "VMD self-shadow mode disabled" }
      : undefined;
    return { ...observation, native, characterSilhouette, shadowCameraOccupancy, messages };
  } finally {
    await context.close();
  }
}

async function useRawShadowVisibilityMaterial(page) {
  await page.evaluate(async () => {
    const viewer = globalThis.mmdViewer;
    const { Fn, vec3, vec4 } = await import("/node_modules/three/build/three.tsl.js");
    const white = vec3(1, 1, 1);
    viewer.currentModel?.root?.traverse?.((object) => {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!material?.userData?.mmdTslMaterialUniforms) {
          continue;
        }
        material.colorNode = white;
        material.receivedShadowNode = Fn(([shadow]) => vec4(vec3(shadow.r), 1));
        material.needsUpdate = true;
      }
    });
  });
}

async function useDedicatedRawShadowVisibilityMaterial(page) {
  const result = await page.evaluate(() => globalThis.mmdViewer?.debug?.dedicatedRawVisibility?.(true));
  if (typeof result !== "string" || !result.endsWith("=true")) {
    throw new Error(`Dedicated raw shadow visibility debug mode was not enabled: ${String(result)}`);
  }
}

async function useStandardShadowReceiverMaterial(page) {
  await page.evaluate(async () => {
    const viewer = globalThis.mmdViewer;
    const { MeshToonNodeMaterial } = await import("/node_modules/three/build/three.webgpu.js");
    const { Fn, vec3, vec4 } = await import("/node_modules/three/build/three.tsl.js");
    viewer.currentModel?.root?.traverse?.((object) => {
      if (!object.isMesh || !object.material) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      const replacements = materials.map((source) => {
        if (!source?.userData?.mmdTslMaterialUniforms) return source;
        const material = new MeshToonNodeMaterial({
          color: 0xffffff,
          side: source.side,
          transparent: source.transparent,
          depthWrite: source.depthWrite
        });
        material.colorNode = vec3(1, 1, 1);
        material.receivedShadowNode = Fn(([shadow]) => vec4(vec3(shadow.r), 1));
        material.castShadowNode = vec4(1, 1, 1, 1);
        return material;
      });
      object.material = Array.isArray(object.material) ? replacements : replacements[0];
    });
  });
}

async function captureCharacterSilhouette(page, outputPath) {
  await page.evaluate(async () => {
    const viewer = globalThis.mmdViewer;
    const renderer = viewer.renderer;
    const { MeshBasicNodeMaterial } = await import("/node_modules/three/build/three.webgpu.js");
    const maskMaterial = new MeshBasicNodeMaterial({ color: 0xffffff });
    viewer.scene.userData.mmdSelfShadowGateMaskState = {
      backgroundVisible: viewer.currentBackground?.root?.visible,
      overrideMaterial: viewer.scene.overrideMaterial,
      shadowMapEnabled: renderer.shadowMap.enabled,
      maskMaterial
    };
    if (viewer.currentBackground?.root) {
      viewer.currentBackground.root.visible = false;
    }
    renderer.setAnimationLoop(null);
    renderer.shadowMap.enabled = false;
    renderer.setClearColor(0x000000, 1);
    viewer.scene.overrideMaterial = maskMaterial;
    if (typeof renderer.renderAsync === "function") {
      await renderer.renderAsync(viewer.scene, viewer.camera);
    } else {
      renderer.render(viewer.scene, viewer.camera);
    }
  });
  try {
    const png = PNG.sync.read(await page.locator("canvas").screenshot());
    await writeFile(outputPath, PNG.sync.write(png));
    return { imagePath: path.basename(outputPath), png };
  } finally {
    await page.evaluate(() => {
      const viewer = globalThis.mmdViewer;
      const saved = viewer.scene.userData.mmdSelfShadowGateMaskState;
      if (!saved) return;
      if (viewer.currentBackground?.root && saved.backgroundVisible !== undefined) {
        viewer.currentBackground.root.visible = saved.backgroundVisible;
      }
      viewer.scene.overrideMaterial = saved.overrideMaterial;
      viewer.renderer.shadowMap.enabled = saved.shadowMapEnabled;
      viewer.renderer.shadowMap.needsUpdate = true;
      viewer.renderer.setClearColor(0xffffff, 1);
      saved.maskMaterial.dispose();
      delete viewer.scene.userData.mmdSelfShadowGateMaskState;
    });
  }
}

async function captureInitialShadowState(page, view, outputPath, evaluationSeconds) {
  const observation = await page.evaluate(({ cameraView, seconds }) => {
    const viewer = globalThis.mmdViewer;
    if (cameraView.useAutoFit) {
      const target = viewer.controls.target;
      const offsetX = viewer.camera.position.x - target.x;
      const offsetZ = viewer.camera.position.z - target.z;
      const cos = Math.cos(cameraView.orbitRadians);
      const sin = Math.sin(cameraView.orbitRadians);
      viewer.camera.position.x = target.x + offsetX * cos + offsetZ * sin;
      viewer.camera.position.z = target.z - offsetX * sin + offsetZ * cos;
    } else {
      viewer.camera.position.fromArray(cameraView.position);
      viewer.controls.target.fromArray(cameraView.target);
    }
    viewer.camera.updateProjectionMatrix();
    viewer.controls.update();
    viewer.scene.traverse((object) => {
      if (object.type === "GridHelper" || object.type === "AxesHelper") {
        object.visible = false;
      }
    });
    viewer.debug.evaluateAt(seconds, { physics: false });
    const camera = viewer.camera;
    camera.updateMatrixWorld();
    return {
      diagnostics: viewer.debug.selfShadowDiagnostics(),
      camera: {
        position: camera.position.toArray(),
        target: viewer.controls.target.toArray(),
        projectionMatrix: Array.from(camera.projectionMatrix.elements),
        projectionMatrixInverse: Array.from(camera.projectionMatrixInverse.elements),
        matrixWorld: Array.from(camera.matrixWorld.elements)
      }
    };
  }, { cameraView: view, seconds: evaluationSeconds });
  await page.waitForTimeout(350);
  const png = PNG.sync.read(await page.locator("canvas").screenshot());
  await writeFile(outputPath, PNG.sync.write(png));
  return { ...observation, png };
}

async function captureShadowCameraOccupancy(page, outputDir, name) {
  const empty = await captureShadowCameraLayer(page, false, path.join(outputDir, `${name}-shadow-camera-empty.png`));
  const caster = await captureShadowCameraLayer(page, true, path.join(outputDir, `${name}-shadow-camera-caster.png`));
  return { empty, caster };
}

async function captureShadowCameraLayer(page, casterVisible, outputPath) {
  const restoreState = await page.evaluate((nextVisible) => {
    const viewer = globalThis.mmdViewer;
    const renderer = viewer.renderer;
    const light = viewer.debug.selfShadowDiagnostics().light;
    let keyLight;
    viewer.scene.traverse((object) => {
      if (!keyLight && object.isDirectionalLight === true && object.castShadow === true) {
        keyLight = object;
      }
    });
    const shadowCamera = keyLight?.shadow?.camera;
    if (!shadowCamera) {
      throw new Error("Main viewer directional-light shadow camera is unavailable.");
    }
    const casterVisibility = [];
    viewer.currentModel?.root?.traverse?.((object) => {
      if (object.userData?.mmdTslShadowCaster) {
        casterVisibility.push({ uuid: object.uuid, visible: object.visible });
        object.visible = nextVisible;
      }
    });
    if (casterVisibility.length === 0) {
      throw new Error("Main viewer has no native shadow-caster proxy to render from the shadow camera.");
    }
    const state = {
      casterVisibility,
      shadowMapEnabled: renderer.shadowMap.enabled,
      shadowCameraLayerMask: shadowCamera.layers.mask,
      casterCount: casterVisibility.length,
      light
    };
    renderer.shadowMap.enabled = false;
    renderer.setClearColor(0x000000, 1);
    renderer.setAnimationLoop(null);
    const canvas = renderer.domElement;
    for (const element of globalThis.document.body.querySelectorAll("*")) {
      if (element === canvas || element.contains(canvas) || canvas.contains(element)) {
        continue;
      }
      if (!element.hasAttribute("data-self-shadow-gate-visibility")) {
        element.setAttribute("data-self-shadow-gate-visibility", element.style.visibility);
        element.style.visibility = "hidden";
      }
    }
    return state;
  }, casterVisible);
  try {
    await page.evaluate(async () => {
      const viewer = globalThis.mmdViewer;
      let keyLight;
      viewer.scene.traverse((object) => {
        if (!keyLight && object.isDirectionalLight === true && object.castShadow === true) {
          keyLight = object;
        }
      });
      await viewer.renderer.renderAsync(viewer.scene, keyLight.shadow.camera);
    });
    const png = PNG.sync.read(await page.locator("canvas").screenshot());
    await writeFile(outputPath, PNG.sync.write(png));
    return {
      imagePath: path.basename(outputPath),
      casterVisible,
      casterCount: restoreState.casterCount,
      shadowCameraLayerMask: restoreState.shadowCameraLayerMask,
      foregroundRatio: foregroundRatio(png),
      nonBlackPixels: countForegroundPixels(png)
    };
  } finally {
    await page.evaluate((state) => {
      const viewer = globalThis.mmdViewer;
      viewer.currentModel?.root?.traverse?.((object) => {
        const saved = state.casterVisibility.find((item) => item.uuid === object.uuid);
        if (saved) {
          object.visible = saved.visible;
        }
      });
      viewer.renderer.shadowMap.enabled = state.shadowMapEnabled;
      viewer.renderer.shadowMap.needsUpdate = true;
      viewer.renderer.setClearColor(0xffffff, 1);
      for (const element of globalThis.document.querySelectorAll("[data-self-shadow-gate-visibility]")) {
        element.style.visibility = element.getAttribute("data-self-shadow-gate-visibility") ?? "";
        element.removeAttribute("data-self-shadow-gate-visibility");
      }
      viewer.debug.evaluateAt(0, { physics: false });
    }, restoreState);
  }
}

function dataUrl(root, filePath) {
  return `/__mmd_data__/${root}/${encodeURIComponent(path.basename(filePath))}`;
}

function resolveRequestPath(pathname, dataRoots) {
  if (pathname.startsWith("/__mmd_anim_wasm/")) {
    const wasmRoot = path.join(repoRoot, "dist", "parser", "wasm", "generated");
    const candidate = path.resolve(wasmRoot, decodeURIComponent(pathname.slice(17)));
    return isPathInside(candidate, wasmRoot) ? candidate : undefined;
  }
  if (pathname.startsWith("/__mmd_data__/")) {
    const parts = decodeURIComponent(pathname.slice(14)).split("/");
    const root = dataRoots[parts.shift() ?? ""];
    const candidate = root ? path.resolve(root, ...parts) : undefined;
    return candidate && isPathInside(candidate, root) ? candidate : undefined;
  }
  const candidate = path.resolve(repoRoot, path.normalize(decodeURIComponent(pathname)).replace(/^[/\\]+/, "") || "examples/viewer/index.html");
  return isPathInside(candidate, repoRoot) ? candidate : undefined;
}

function parseArgs(args) {
  const options = {
    outputDir: defaultOutputDir,
    backend: "webgpu",
    localModel: undefined,
    localMotion: undefined,
    localBackground: undefined,
    vmdLifecycle: false,
    rawVisibility: false,
    standardReceiver: false,
    dedicatedRawVisibility: false
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = peekArgValue(args, index);
    if (arg === "--output-dir" && value) {
      options.outputDir = path.resolve(value);
      index += 1;
    } else if (arg === "--backend" && value) {
      options.backend = value.toLowerCase();
      index += 1;
    } else if (arg === "--local-model" && value) {
      options.localModel = path.resolve(value);
      index += 1;
    } else if (arg === "--local-motion" && value) {
      options.localMotion = path.resolve(value);
      index += 1;
    } else if (arg === "--local-background" && value) {
      options.localBackground = path.resolve(value);
      index += 1;
    } else if (arg === "--vmd-lifecycle") {
      options.vmdLifecycle = true;
    } else if (arg === "--raw-visibility") {
      options.rawVisibility = true;
    } else if (arg === "--standard-receiver") {
      options.standardReceiver = true;
    } else if (arg === "--dedicated-raw-visibility") {
      options.dedicatedRawVisibility = true;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }
  if (options.localBackground && !options.localModel) {
    throw new Error("--local-background requires --local-model so the gate has a character self-shadow receiver.");
  }
  if (options.localMotion && !options.localModel) {
    throw new Error("--local-motion requires --local-model.");
  }
  if (options.vmdLifecycle && !options.localMotion) {
    throw new Error("--vmd-lifecycle requires --local-motion.");
  }
  if (!["baseline", "forcewebgl", "webgpu"].includes(options.backend)) {
    throw new Error(`--backend must be one of baseline, forcewebgl, webgpu; received ${options.backend}`);
  }
  if (options.dedicatedRawVisibility && options.backend !== "webgpu") {
    throw new Error("--dedicated-raw-visibility requires --backend webgpu.");
  }
  if (options.backend === "baseline" && options.rawVisibility) {
    throw new Error("--raw-visibility requires a TSL backend; use --backend forcewebgl or webgpu.");
  }
  if (options.backend === "baseline" && options.standardReceiver) {
    throw new Error("--standard-receiver requires a TSL backend; use --backend forcewebgl or webgpu.");
  }
  for (const [flag, filePath] of [
    ["--local-model", options.localModel],
    ["--local-motion", options.localMotion],
    ["--local-background", options.localBackground]
  ]) {
    if (filePath && !existsSync(filePath)) {
      throw new Error(`${flag} does not exist: ${filePath}`);
    }
  }
  return options;
}

await main();
