import * as THREE from "three";
import { luminance, percentile, round } from "./pixel-metrics.mjs";

export const receiverWorldBounds = { minX: -2.0, maxX: 2.0, minZ: -1.5, maxZ: 1.5, y: 0.002 };
export const dedicatedRawRois = {
  unoccludedSameSurface: { minX: -1.8, maxX: -0.8, minZ: -1.2, maxZ: 1.2 },
  separateSurface: { minX: 0.0, maxX: 2.0, minZ: 0.0, maxZ: 1.5 },
  background: null
};

export const thresholds = {
  // 2026-07-20 (mmd-shading-notes.md §10.2 self-shadow composite fix): the receiver
  // ROI mean darkening is no longer a reliable "shadow present" signal by itself.
  // Real MMD drops the continuous toon ramp entirely while self-shadow is scene-ON,
  // replacing it with a steep saturate(N.L*3) grade -- so most of an unoccluded,
  // near-perpendicular flat receiver (like this synthetic floor) renders BRIGHTER
  // than the OFF/ramp image, while the actual caster-occluded sub-region gets much
  // darker. Net ROI mean can legitimately go negative (observed: primary -18.4,
  // moved -10.5) even though shadowing is correctly localized. p995Darkening and
  // shadowPixelRatio below are the load-bearing "shadow occurred" checks; this floor
  // only guards against a total regression (e.g. mean collapsing far past what the
  // brightening effect alone would produce).
  receiverMeanDarkeningMin: -25,
  receiverP995DarkeningMin: 10,
  shadowPixelRatioMin: 0.005,
  dedicatedShadowPixelRatioMax: 0.60,
  dedicatedNonOccludedShadowRatioMax: 0.01,
  dedicatedOffMeanLuminanceMin: 245,
  localFullFrameMeanDarkeningMin: 0.02,
  localFullFrameP995DarkeningMin: 1,
  localShadowPixelRatioMin: 0.0005,
  vmdInactiveMeanDarkeningMax: 0.01,
  vmdInactiveP995DarkeningMax: 0.5,
  vmdInactiveShadowPixelRatioMax: 0.005,
  localBackgroundMeanDarkeningMin: 0.02,
  localBackgroundMaxDarkeningMin: 1,
  localBackgroundShadowPixelRatioMin: 0.0005,
  shadowCameraCasterForegroundRatioMin: 0.001,
  shadowCameraEmptyForegroundRatioMax: 0.0001,
  worldCentroidMaxDistance: 0.25,
  lightWorldConfigurationMaxDelta: 1e-6
};

export function vmdObservation(diagnostics) {
  const material = diagnostics.materials?.find((entry) => entry.dedicatedShadowEnabled !== null);
  return {
    mode: diagnostics.vmdSelfShadow?.mode ?? null,
    distance: diagnostics.vmdSelfShadow?.distance ?? null,
    castShadow: diagnostics.light?.castShadow ?? null,
    dedicatedShadowEnabled: material?.dedicatedShadowEnabled ?? null,
    shadowCameraFar: diagnostics.light?.shadowCamera?.far ?? null
  };
}

export function vmdLifecycleGate(primary, moved) {
  const observations = [
    vmdObservation(primary.off.diagnostics),
    vmdObservation(primary.on.diagnostics),
    vmdObservation(moved.off.diagnostics),
    vmdObservation(moved.on.diagnostics)
  ];
  const mode = observations[1]?.mode;
  const enabled = mode === 1 || mode === 2;
  const offPass = observations[0]?.castShadow === false &&
    observations[0]?.dedicatedShadowEnabled === 0 &&
    observations[2]?.castShadow === false &&
    observations[2]?.dedicatedShadowEnabled === 0;
  const onPass = observations[1]?.castShadow === enabled &&
    observations[1]?.dedicatedShadowEnabled === (enabled ? 1 : 0) &&
    observations[3]?.castShadow === enabled &&
    observations[3]?.dedicatedShadowEnabled === (enabled ? 1 : 0);
  const onModeDistanceAgreement = observations[1]?.mode === mode &&
    observations[3]?.mode === mode &&
    Math.abs((observations[1]?.distance ?? NaN) - (observations[3]?.distance ?? NaN)) <= 1e-6;
  const onShadowCameraFarPass = !enabled ||
    (vmdShadowCameraFarPass(observations[1], observations[0]) &&
      vmdShadowCameraFarPass(observations[3], observations[2]));
  return offPass && onPass && onModeDistanceAgreement && onShadowCameraFarPass;
}

export function vmdLifecyclePixelPass(metrics, mode) {
  if (mode === 0) {
    return metrics.primary.meanDarkening <= thresholds.vmdInactiveMeanDarkeningMax &&
      metrics.moved.meanDarkening <= thresholds.vmdInactiveMeanDarkeningMax &&
      metrics.primary.p995Darkening <= thresholds.vmdInactiveP995DarkeningMax &&
      metrics.moved.p995Darkening <= thresholds.vmdInactiveP995DarkeningMax &&
      metrics.primary.shadowPixelRatio <= thresholds.vmdInactiveShadowPixelRatioMax &&
      metrics.moved.shadowPixelRatio <= thresholds.vmdInactiveShadowPixelRatioMax;
  }
  if (mode === 1 || mode === 2) {
    return metrics.primary.meanDarkening >= thresholds.localFullFrameMeanDarkeningMin &&
      metrics.moved.meanDarkening >= thresholds.localFullFrameMeanDarkeningMin &&
      metrics.primary.shadowPixelRatio >= thresholds.localShadowPixelRatioMin &&
      metrics.moved.shadowPixelRatio >= thresholds.localShadowPixelRatioMin;
  }
  return false;
}

function vmdShadowCameraFarPass(on, off) {
  if (!Number.isFinite(on?.distance) || !Number.isFinite(on?.shadowCameraFar) || !Number.isFinite(off?.shadowCameraFar)) {
    return false;
  }
  const expectedFar = Math.min(Math.max(on.distance * 100, off.shadowCameraFar), 100);
  return Math.abs(on.shadowCameraFar - expectedFar) <= 1e-6;
}

export function countForegroundPixels(png) {
  let count = 0;
  for (let index = 0; index < png.data.length; index += 4) {
    if (luminance(png.data[index], png.data[index + 1], png.data[index + 2]) >= 16) {
      count += 1;
    }
  }
  return count;
}

export function foregroundRatio(png) {
  return round(countForegroundPixels(png) / (png.width * png.height));
}

export function analyzeReceiverDarkening(off, on, cameraSnapshot, bounds) {
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

export function analyzeDedicatedRawVisibility(off, on, cameraSnapshot, bounds) {
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

export function dedicatedRawVisibilityPass(metrics) {
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

export function compareWorldShadowPosition(primary, moved) {
  if (!primary.centroid || !moved.centroid) {
    return { centroidDistance: Infinity, primaryCentroid: primary.centroid, movedCentroid: moved.centroid };
  }
  return {
    primaryCentroid: primary.centroid,
    movedCentroid: moved.centroid,
    centroidDistance: round(Math.hypot(primary.centroid.x - moved.centroid.x, primary.centroid.z - moved.centroid.z))
  };
}

export function compareLightConfigurations(primary, moved) {
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

export function selfShadowDiagnosticsPass(diagnostics, requireSparseMorphs, requireCastShadow = true) {
  const light = diagnostics.light;
  return diagnostics.modelPresent &&
    (!requireSparseMorphs || diagnostics.sparsePositionMorphsEnabled === true) &&
    (!requireSparseMorphs || diagnostics.storedBoundingBox !== null) &&
    diagnostics.casterCount > 0 &&
    diagnostics.casterIndexCount > 0 &&
    diagnostics.receiverMaterialCount > 0 &&
    diagnostics.visibleMeshReceiveShadow === true &&
    diagnostics.layerAgreement.casterMatchesShadowCamera === true &&
    light?.castShadow === requireCastShadow &&
    Number.isFinite(light.shadowCamera?.near) &&
    Number.isFinite(light.shadowCamera?.far) &&
    light.shadowCamera.far > light.shadowCamera.near &&
    diagnostics.materials.some(material => material.receiveShadow && material.dedicatedShadowEnabled !== null);
}

export function dedicatedRawDiagnosticsPass(diagnostics, requireSparseMorphs) {
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

export function shadowCameraOccupancyPasses(occupancy) {
  return occupancy.caster.foregroundRatio >= thresholds.shadowCameraCasterForegroundRatioMin &&
    occupancy.empty.foregroundRatio <= thresholds.shadowCameraEmptyForegroundRatioMax &&
    occupancy.caster.foregroundRatio > occupancy.empty.foregroundRatio;
}

export function compareFullFrameLuminance(off, on) {
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
    p995Darkening: round(percentile(darkening, 0.995)),
    shadowPixelRatio: round(positive.length / darkening.length)
  };
}

export function analyzeOutsideCharacterDarkening(off, on, silhouette) {
  if (!silhouette || off.width !== on.width || off.height !== on.height || off.width !== silhouette.png.width || off.height !== silhouette.png.height) {
    throw new Error("Background-shadow captures and character silhouette mask must have matching dimensions.");
  }
  const darkening = [];
  let maxDarkening = 0;
  for (let index = 0; index < off.data.length; index += 4) {
    const maskLuminance = luminance(silhouette.png.data[index], silhouette.png.data[index + 1], silhouette.png.data[index + 2]);
    if (maskLuminance >= 16) {
      continue;
    }
    const value = luminance(off.data[index], off.data[index + 1], off.data[index + 2]) -
      luminance(on.data[index], on.data[index + 1], on.data[index + 2]);
    darkening.push(value);
    maxDarkening = Math.max(maxDarkening, value);
  }
  const positive = darkening.filter((value) => value >= 1);
  return {
    sampledPixels: darkening.length,
    meanDarkening: round(darkening.reduce((sum, value) => sum + value, 0) / darkening.length),
    p95Darkening: round(percentile(darkening, 0.95)),
    p995Darkening: round(percentile(darkening, 0.995)),
    maxDarkening: round(maxDarkening),
    shadowPixelRatio: round(positive.length / darkening.length)
  };
}

export function localMetricPasses(metrics, meanMin, p995Min, ratioMin) {
  return metrics.primary.meanDarkening >= meanMin &&
    metrics.moved.meanDarkening >= meanMin &&
    metrics.primary.p995Darkening >= p995Min &&
    metrics.moved.p995Darkening >= p995Min &&
    metrics.primary.shadowPixelRatio >= ratioMin &&
    metrics.moved.shadowPixelRatio >= ratioMin;
}

export function localBackgroundMetricPasses(metrics) {
  return metrics.primary.meanDarkening >= thresholds.localBackgroundMeanDarkeningMin &&
    metrics.moved.meanDarkening >= thresholds.localBackgroundMeanDarkeningMin &&
    metrics.primary.maxDarkening >= thresholds.localBackgroundMaxDarkeningMin &&
    metrics.moved.maxDarkening >= thresholds.localBackgroundMaxDarkeningMin &&
    metrics.primary.shadowPixelRatio >= thresholds.localBackgroundShadowPixelRatioMin &&
    metrics.moved.shadowPixelRatio >= thresholds.localBackgroundShadowPixelRatioMin;
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
