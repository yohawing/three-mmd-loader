#!/usr/bin/env node
import { createReadStream, existsSync } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { PNG } from "pngjs";
import * as THREE from "three";
import { browserLaunchOptions } from "./render-shared.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const syntheticFixturePath = "test/fixtures/generated/visual/mmd-viewer-self-shadow-receiver.pmx";
const defaultOutputDir = path.join(repoRoot, "test-results", "visual", "viewer-self-shadow");
const receiverWorldBounds = { minX: -2.0, maxX: 2.0, minZ: -1.5, maxZ: 1.5, y: 0.002 };
const dedicatedRawRois = {
  unoccludedSameSurface: { minX: -1.8, maxX: -0.8, minZ: -1.2, maxZ: 1.2 },
  separateSurface: { minX: 0.0, maxX: 2.0, minZ: 0.0, maxZ: 1.5 },
  background: null
};
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
const thresholds = {
  receiverMeanDarkeningMin: 0.8,
  receiverP995DarkeningMin: 10,
  shadowPixelRatioMin: 0.005,
  dedicatedShadowPixelRatioMax: 0.60,
  dedicatedNonOccludedShadowRatioMax: 0.01,
  dedicatedOffMeanLuminanceMin: 245,
  localFullFrameMeanDarkeningMin: 0.02,
  localFullFrameP95DarkeningMin: 1,
  localShadowPixelRatioMin: 0.0005,
  localBackgroundMeanDarkeningMin: 0.02,
  localBackgroundP95DarkeningMin: 1,
  localBackgroundShadowPixelRatioMin: 0.0005,
  shadowCameraCasterForegroundRatioMin: 0.001,
  shadowCameraEmptyForegroundRatioMax: 0.0001,
  worldCentroidMaxDistance: 0.25,
  lightWorldConfigurationMaxDelta: 1e-6
};
const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"], [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"], [".json", "application/json; charset=utf-8"],
  [".png", "image/png"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".bmp", "image/bmp"],
  [".pmx", "application/octet-stream"], [".tga", "image/x-tga"], [".dds", "image/vnd-ms.dds"],
  [".wasm", "application/wasm"]
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
  const server = await startStaticServer({
    model: options.localModel ? path.dirname(options.localModel) : undefined,
    motion: options.localMotion ? path.dirname(options.localMotion) : undefined,
    background: options.localBackground ? path.dirname(options.localBackground) : undefined
  });
  const report = {
    fixture: options.localModel ?? syntheticFixturePath,
    localMotion: options.localMotion ?? null,
    localBackground: options.localBackground ?? null,
    passed: false,
    thresholds,
    metricDefinitions: {
      receiverDarkening: "fixed receiver-plane samples compare independent initial selfShadow=0 and selfShadow=1 viewer contexts; positive values are darker with SelfShadow enabled.",
      characterSelfShadow: "local character-only OFF/ON captures measure self-shadow without a background receiver.",
      characterToBackgroundShadow: "local character-plus-background OFF/ON captures measure positive darkening only outside a captured character silhouette, so character self-shadow cannot satisfy the background-shadow observation.",
      worldShadowPosition: "each positive receiver darkening sample is ray-projected from its capture camera onto y=0.002; the camera-only comparison keeps elevation/depth fixed while changing azimuth so the luminance-weighted world x/z centroid is measured over comparable receiver coverage.",
      lightConfiguration: "DirectionalLight world position/target plus shadow-camera world matrix, near/far, and orthographic bounds must be unchanged across camera-only captures.",
      dedicatedRawVisibility: "dedicated raw mode renders grayscale visibility from the independent caster depth target; the same-surface outer ROI must remain lit while the separate-surface shadow ROI contains a bounded dark region. The synthetic fixture has no background receiver, so that ROI is reported as null."
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
      browser, server.origin, modelUrl, undefined, motionUrl, "character", options.outputDir, Boolean(options.localModel), options.rawVisibility, options.standardReceiver, options.dedicatedRawVisibility
    );
    const backgroundScenario = backgroundUrl
      ? await captureScenario(
          browser, server.origin, modelUrl, backgroundUrl, motionUrl, "character-background", options.outputDir, true, options.rawVisibility, options.standardReceiver, options.dedicatedRawVisibility
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
      primary: primary.on.shadowCameraOccupancy,
      moved: moved.on.shadowCameraOccupancy
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
    const diagnosticPass = options.dedicatedRawVisibility
      ? dedicatedRawDiagnosticsPass(primary.on.diagnostics, !options.localModel) &&
        dedicatedRawDiagnosticsPass(moved.on.diagnostics, !options.localModel)
      : selfShadowDiagnosticsPass(primary.on.diagnostics, !options.localModel) &&
        selfShadowDiagnosticsPass(moved.on.diagnostics, !options.localModel);
    const shadowCameraOccupancyPass = Object.values(shadowCameraOccupancy).every((occupancy) =>
      shadowCameraOccupancyPasses(occupancy)
    );
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
      ? localMetricPasses(fullFrame, thresholds.localFullFrameMeanDarkeningMin, thresholds.localFullFrameP95DarkeningMin, thresholds.localShadowPixelRatioMin)
      : undefined;
    const localBackgroundPass = backgroundShadow
      ? localMetricPasses(backgroundShadow, thresholds.localBackgroundMeanDarkeningMin, thresholds.localBackgroundP95DarkeningMin, thresholds.localBackgroundShadowPixelRatioMin)
      : undefined;
    const localObservationPass = options.localModel
      ? diagnosticPass &&
        shadowCameraOccupancyPass &&
        localDarkeningPass &&
        (localBackgroundPass ?? true) &&
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
    report.runtimeSamePageToggle = {
      trackedBy: "T070-19",
      note: "T070-16 compares initial selfShadow=0 and selfShadow=1 viewer contexts only; it does not use a same-page runtime toggle as shadow proof."
    };
    report.localObservations = options.localModel ? {
      characterSelfShadow: { passed: localDarkeningPass, metrics: fullFrame },
      characterToBackgroundShadow: backgroundShadow
        ? { passed: localBackgroundPass, metrics: backgroundShadow, mask: "character silhouette excluded" }
        : { status: "not-requested", reason: "--local-background was not supplied" }
    } : null;
    report.messages = messages;
    report.passed = options.localModel ? localObservationPass && messages.length === 0 : syntheticPass && messages.length === 0;
    if (!report.passed) {
      throw new Error(`viewer self-shadow gate failed: ${JSON.stringify({ diagnosticPass, shadowCameraOccupancy, shadowCameraOccupancyPass, primaryReceiver, movedReceiver, dedicatedPrimary, dedicatedMoved, dedicatedRawPass, worldShadowPosition, lightConfiguration, fullFrame, backgroundShadow, localDarkeningPass, localBackgroundPass, messages })}`);
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

async function viewerObservation(page) {
  return await page.evaluate(() => ({
    nativeWebgpu: globalThis.mmdViewer.renderer?.backend?.isWebGPUBackend === true,
    modelPresent: Boolean(globalThis.mmdViewer.currentModel?.root),
    backgroundPresent: Boolean(globalThis.mmdViewer.currentBackground?.root),
    diagnostics: globalThis.mmdViewer.debug.selfShadowDiagnostics()
  }));
}

async function captureScenario(browser, origin, modelUrl, backgroundUrl, motionUrl, label, outputDir, useAutoFit = false, rawVisibility = false, standardReceiver = false, dedicatedRawVisibility = false) {
  const views = useAutoFit ? localCameraViews : cameraViews;
  const primary = await captureIsolatedPair(
    browser, origin, modelUrl, backgroundUrl, motionUrl, `${label}-primary`, views.primary, outputDir, rawVisibility, standardReceiver, dedicatedRawVisibility
  );
  const moved = await captureIsolatedPair(
    browser, origin, modelUrl, backgroundUrl, motionUrl, `${label}-moved`, views.moved, outputDir, rawVisibility, standardReceiver, dedicatedRawVisibility
  );
  return { primary, moved };
}

async function captureIsolatedPair(browser, origin, modelUrl, backgroundUrl, motionUrl, name, camera, outputDir, rawVisibility, standardReceiver, dedicatedRawVisibility) {
  const off = await captureIsolatedShadowState(
    browser, origin, modelUrl, backgroundUrl, motionUrl, name, camera, false, outputDir, rawVisibility, standardReceiver, dedicatedRawVisibility
  );
  const on = await captureIsolatedShadowState(
    browser, origin, modelUrl, backgroundUrl, motionUrl, name, camera, true, outputDir, rawVisibility, standardReceiver, dedicatedRawVisibility
  );
  return { name, off, on };
}

async function captureIsolatedShadowState(browser, origin, modelUrl, backgroundUrl, motionUrl, name, camera, enabled, outputDir, rawVisibility, standardReceiver, dedicatedRawVisibility) {
  const context = await browser.newContext({ viewport: { width: 960, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const messages = [];
  page.on("pageerror", error => messages.push(error.message));
  try {
    const shadowState = enabled ? "1" : "0";
    await page.goto(
      `${origin}/examples/viewer/?backend=webgpu&debug&physics=0&runtime=js&selfShadow=${shadowState}`,
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
    const native = await viewerObservation(page);
    if (!native.nativeWebgpu) {
      throw new Error(`Native WebGPU backend was not selected: ${JSON.stringify(native)}`);
    }
    const screenshotPath = path.join(outputDir, `${name}-${enabled ? "on" : "off"}.png`);
    const observation = await captureInitialShadowState(page, camera, screenshotPath, motionUrl ? 0.5 : 0);
    const characterSilhouette = backgroundUrl && enabled
      ? await captureCharacterSilhouette(page, screenshotPath.replace(/\.png$/, "-character-mask.png"))
      : undefined;
    const shadowCameraOccupancy = enabled
      ? await captureShadowCameraOccupancy(page, outputDir, name)
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
        if (!material?.receivedShadowNode || !material?.userData?.mmdTslMaterialUniforms) {
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
    await renderer.renderAsync(viewer.scene, viewer.camera);
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

function countForegroundPixels(png) {
  let count = 0;
  for (let index = 0; index < png.data.length; index += 4) {
    if (luminance(png.data[index], png.data[index + 1], png.data[index + 2]) >= 16) {
      count += 1;
    }
  }
  return count;
}

function foregroundRatio(png) {
  return round(countForegroundPixels(png) / (png.width * png.height));
}

function analyzeReceiverDarkening(off, on, cameraSnapshot, bounds) {
  if (off.width !== on.width || off.height !== on.height) {
    throw new Error("Self-shadow OFF/ON captures have different dimensions.");
  }
  const camera = cameraFromSnapshot(cameraSnapshot);
  const origin = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
  const nearPoint = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const darkening = [];
  let samples = 0;
  let darkPixels = 0;
  let totalOffLuminance = 0;
  let totalOnLuminance = 0;
  let weightedX = 0;
  let weightedZ = 0;
  let totalWeight = 0;
  for (let y = 0; y < on.height; y += 2) {
    for (let x = 0; x < on.width; x += 2) {
      const point = projectPixelToPlane(x, y, on.width, on.height, bounds.y, camera, origin, nearPoint, direction);
      if (!point || point.x < bounds.minX || point.x > bounds.maxX || point.z < bounds.minZ || point.z > bounds.maxZ) {
        continue;
      }
      const index = (y * on.width + x) * 4;
      const offLuminance = luminance(off.data[index], off.data[index + 1], off.data[index + 2]);
      const onLuminance = luminance(on.data[index], on.data[index + 1], on.data[index + 2]);
      const value = offLuminance - onLuminance;
      darkening.push(value);
      totalOffLuminance += offLuminance;
      totalOnLuminance += onLuminance;
      samples += 1;
      if (value >= 4) {
        darkPixels += 1;
        weightedX += point.x * value;
        weightedZ += point.z * value;
        totalWeight += value;
      }
    }
  }
  if (samples === 0 || totalWeight === 0) {
    return { samples, meanDarkening: 0, p95Darkening: 0, shadowPixelRatio: 0, centroid: null };
  }
  return {
    samples,
    meanOffLuminance: round(totalOffLuminance / samples),
    meanOnLuminance: round(totalOnLuminance / samples),
    meanDarkening: round(darkening.reduce((sum, value) => sum + value, 0) / samples),
    p95Darkening: round(percentile(darkening, 0.95)),
    p995Darkening: round(percentile(darkening, 0.995)),
    shadowPixelRatio: round(darkPixels / samples),
    centroid: { x: round(weightedX / totalWeight), z: round(weightedZ / totalWeight), weight: round(totalWeight) }
  };
}

function analyzeDedicatedRawVisibility(off, on, cameraSnapshot, bounds) {
  const base = analyzeReceiverDarkening(off, on, cameraSnapshot, bounds);
  const camera = cameraFromSnapshot(cameraSnapshot);
  const origin = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
  const nearPoint = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const rois = {};
  for (const [name, roi] of Object.entries(dedicatedRawRois)) {
    if (!roi) {
      rois[name] = null;
      continue;
    }
    let samples = 0;
    let darkPixels = 0;
    let totalLuminance = 0;
    for (let y = 0; y < on.height; y += 2) {
      for (let x = 0; x < on.width; x += 2) {
        const point = projectPixelToPlane(x, y, on.width, on.height, bounds.y, camera, origin, nearPoint, direction);
        if (!point || point.x < roi.minX || point.x > roi.maxX || point.z < roi.minZ || point.z > roi.maxZ) {
          continue;
        }
        const index = (y * on.width + x) * 4;
        const value = luminance(on.data[index], on.data[index + 1], on.data[index + 2]);
        samples += 1;
        totalLuminance += value;
        if (value < 245) {
          darkPixels += 1;
        }
      }
    }
    rois[name] = {
      samples,
      meanLuminance: samples > 0 ? round(totalLuminance / samples) : 0,
      shadowPixelRatio: samples > 0 ? round(darkPixels / samples) : 1
    };
  }
  // Measure the OFF-white baseline on the same-surface safety ROI so the
  // unchanged caster silhouette cannot make the receiver baseline look dark.
  const offBaselineBounds = { ...dedicatedRawRois.unoccludedSameSurface, y: bounds.y };
  const offMeanLuminance = luminanceMeanInBounds(off, camera, offBaselineBounds, origin, nearPoint, direction);
  return { ...base, offMeanLuminance, rois };
}

function luminanceMeanInBounds(png, camera, bounds, origin, nearPoint, direction) {
  let samples = 0;
  let total = 0;
  for (let y = 0; y < png.height; y += 2) {
    for (let x = 0; x < png.width; x += 2) {
      const point = projectPixelToPlane(x, y, png.width, png.height, bounds.y, camera, origin, nearPoint, direction);
      if (!point || point.x < bounds.minX || point.x > bounds.maxX || point.z < bounds.minZ || point.z > bounds.maxZ) {
        continue;
      }
      const index = (y * png.width + x) * 4;
      total += luminance(png.data[index], png.data[index + 1], png.data[index + 2]);
      samples += 1;
    }
  }
  return samples > 0 ? round(total / samples) : 0;
}

function dedicatedRawVisibilityPass(metrics) {
  if (!metrics) {
    return false;
  }
  const safe = metrics.rois?.unoccludedSameSurface;
  const occluded = metrics.rois?.separateSurface;
  return metrics.offMeanLuminance >= thresholds.dedicatedOffMeanLuminanceMin &&
    metrics.p995Darkening >= thresholds.receiverP995DarkeningMin &&
    metrics.shadowPixelRatio >= thresholds.shadowPixelRatioMin &&
    metrics.shadowPixelRatio < thresholds.dedicatedShadowPixelRatioMax &&
    safe?.shadowPixelRatio <= thresholds.dedicatedNonOccludedShadowRatioMax &&
    occluded?.shadowPixelRatio >= thresholds.shadowPixelRatioMin;
}

function compareWorldShadowPosition(primary, moved) {
  if (!primary.centroid || !moved.centroid) {
    return { centroidDistance: Infinity, primaryCentroid: primary.centroid, movedCentroid: moved.centroid };
  }
  return {
    primaryCentroid: primary.centroid,
    movedCentroid: moved.centroid,
    centroidDistance: round(Math.hypot(primary.centroid.x - moved.centroid.x, primary.centroid.z - moved.centroid.z))
  };
}

function compareLightConfigurations(primary, moved) {
  const primaryLight = primary.light;
  const movedLight = moved.light;
  const primaryValues = [
    ...(primaryLight?.worldPosition ?? []),
    ...(primaryLight?.targetWorldPosition ?? []),
    ...(primaryLight?.shadowCamera?.worldMatrix ?? []),
    primaryLight?.shadowCamera?.near,
    primaryLight?.shadowCamera?.far,
    primaryLight?.shadowCamera?.left,
    primaryLight?.shadowCamera?.right,
    primaryLight?.shadowCamera?.top,
    primaryLight?.shadowCamera?.bottom
  ];
  const movedValues = [
    ...(movedLight?.worldPosition ?? []),
    ...(movedLight?.targetWorldPosition ?? []),
    ...(movedLight?.shadowCamera?.worldMatrix ?? []),
    movedLight?.shadowCamera?.near,
    movedLight?.shadowCamera?.far,
    movedLight?.shadowCamera?.left,
    movedLight?.shadowCamera?.right,
    movedLight?.shadowCamera?.top,
    movedLight?.shadowCamera?.bottom
  ];
  const deltas = primaryValues.map((value, index) => Math.abs(value - movedValues[index]));
  return {
    maxDelta: round(Math.max(...deltas)),
    lightWorldPosition: primaryLight?.worldPosition ?? null,
    lightTargetWorldPosition: primaryLight?.targetWorldPosition ?? null,
    shadowCameraNearFar: primaryLight?.shadowCamera ? [primaryLight.shadowCamera.near, primaryLight.shadowCamera.far] : null
  };
}

function selfShadowDiagnosticsPass(diagnostics, requireSparseMorphs) {
  const light = diagnostics.light;
  return diagnostics.modelPresent &&
    (!requireSparseMorphs || diagnostics.sparsePositionMorphsEnabled === true) &&
    (!requireSparseMorphs || diagnostics.storedBoundingBox !== null) &&
    diagnostics.casterCount > 0 &&
    diagnostics.casterIndexCount > 0 &&
    diagnostics.receiverMaterialCount > 0 &&
    diagnostics.visibleMeshReceiveShadow === true &&
    diagnostics.layerAgreement.casterMatchesShadowCamera === true &&
    light?.castShadow === true &&
    Number.isFinite(light.shadowCamera?.near) &&
    Number.isFinite(light.shadowCamera?.far) &&
    light.shadowCamera.far > light.shadowCamera.near &&
    diagnostics.materials.some(material =>
      material.receiveShadow &&
      material.receivedShadowNode === true
    );
}

function dedicatedRawDiagnosticsPass(diagnostics, requireSparseMorphs) {
  const light = diagnostics.light;
  return diagnostics.modelPresent &&
    (!requireSparseMorphs || diagnostics.sparsePositionMorphsEnabled === true) &&
    (!requireSparseMorphs || diagnostics.storedBoundingBox !== null) &&
    diagnostics.casterCount > 0 &&
    diagnostics.casterIndexCount > 0 &&
    diagnostics.receiverMaterialCount > 0 &&
    diagnostics.visibleMeshReceiveShadow === true &&
    diagnostics.layerAgreement.casterMatchesShadowCamera === true &&
    light?.castShadow === true &&
    Number.isFinite(light.shadowCamera?.near) &&
    Number.isFinite(light.shadowCamera?.far) &&
    light.shadowCamera.far > light.shadowCamera.near;
}

function shadowCameraOccupancyPasses(occupancy) {
  return occupancy.caster.foregroundRatio >= thresholds.shadowCameraCasterForegroundRatioMin &&
    occupancy.empty.foregroundRatio <= thresholds.shadowCameraEmptyForegroundRatioMax &&
    occupancy.caster.foregroundRatio > occupancy.empty.foregroundRatio;
}

function compareFullFrameLuminance(off, on) {
  const darkening = [];
  for (let index = 0; index < off.data.length; index += 4) {
    darkening.push(
      luminance(off.data[index], off.data[index + 1], off.data[index + 2]) -
      luminance(on.data[index], on.data[index + 1], on.data[index + 2])
    );
  }
  const positive = darkening.filter((value) => value >= 1);
  return {
    meanDarkening: round(darkening.reduce((sum, value) => sum + value, 0) / darkening.length),
    p95Darkening: round(percentile(darkening, 0.95)),
    shadowPixelRatio: round(positive.length / darkening.length)
  };
}

function analyzeOutsideCharacterDarkening(off, on, silhouette) {
  if (!silhouette || off.width !== on.width || off.height !== on.height || off.width !== silhouette.png.width || off.height !== silhouette.png.height) {
    throw new Error("Background-shadow captures and character silhouette mask must have matching dimensions.");
  }
  const darkening = [];
  for (let index = 0; index < off.data.length; index += 4) {
    const maskLuminance = luminance(silhouette.png.data[index], silhouette.png.data[index + 1], silhouette.png.data[index + 2]);
    if (maskLuminance >= 16) {
      continue;
    }
    darkening.push(
      luminance(off.data[index], off.data[index + 1], off.data[index + 2]) -
      luminance(on.data[index], on.data[index + 1], on.data[index + 2])
    );
  }
  const positive = darkening.filter((value) => value >= 1);
  return {
    sampledPixels: darkening.length,
    meanDarkening: round(darkening.reduce((sum, value) => sum + value, 0) / darkening.length),
    p95Darkening: round(percentile(darkening, 0.95)),
    shadowPixelRatio: round(positive.length / darkening.length)
  };
}

function localMetricPasses(metrics, meanMin, p95Min, ratioMin) {
  return metrics.primary.meanDarkening >= meanMin &&
    metrics.moved.meanDarkening >= meanMin &&
    metrics.primary.p95Darkening >= p95Min &&
    metrics.moved.p95Darkening >= p95Min &&
    metrics.primary.shadowPixelRatio >= ratioMin &&
    metrics.moved.shadowPixelRatio >= ratioMin;
}

function cameraFromSnapshot(snapshot) {
  const camera = new THREE.PerspectiveCamera();
  camera.projectionMatrix.fromArray(snapshot.projectionMatrix);
  camera.projectionMatrixInverse.fromArray(snapshot.projectionMatrixInverse);
  camera.matrixWorld.fromArray(snapshot.matrixWorld);
  return camera;
}

function projectPixelToPlane(x, y, width, height, planeY, camera, origin, nearPoint, direction) {
  nearPoint.set((x + 0.5) / width * 2 - 1, 1 - (y + 0.5) / height * 2, 0.5).unproject(camera);
  direction.copy(nearPoint).sub(origin).normalize();
  if (Math.abs(direction.y) < 1e-6) {
    return null;
  }
  const distance = (planeY - origin.y) / direction.y;
  return distance > 0 ? direction.multiplyScalar(distance).add(origin) : null;
}

function luminance(r, g, b) {
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

function percentile(values, fraction) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.floor((ordered.length - 1) * fraction))] ?? 0;
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function dataUrl(root, filePath) {
  return `/__mmd_data__/${root}/${encodeURIComponent(path.basename(filePath))}`;
}

async function startStaticServer(dataRoots) {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const filePath = resolveRequestPath(url.pathname, dataRoots);
      if (!filePath) return response.writeHead(403).end("Forbidden");
      const info = await stat(filePath);
      const resolved = info.isDirectory() ? path.join(filePath, "index.html") : filePath;
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": mimeTypes.get(path.extname(resolved).toLowerCase()) ?? "application/octet-stream"
      });
      createReadStream(resolved).pipe(response);
    } catch (error) {
      response.writeHead(error?.code === "ENOENT" ? 404 : 500).end("Not found");
    }
  });
  return await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("Failed to allocate local port."));
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((done, fail) => server.close(error => error ? fail(error) : done()))
      });
    });
  });
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

function isPathInside(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function parseArgs(args) {
  const options = {
    outputDir: defaultOutputDir,
    localModel: undefined,
    localMotion: undefined,
    localBackground: undefined,
    rawVisibility: false,
    standardReceiver: false,
    dedicatedRawVisibility: false
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
    if (arg === "--output-dir" && value) {
      options.outputDir = path.resolve(value);
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
