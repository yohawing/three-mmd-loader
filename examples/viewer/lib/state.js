import * as THREE from "three";

import { ThreeMmdLoader } from "../../../dist/three/index.js";
import { viewerConfig } from "./viewer-config.js";

export const debugEnabled = new window.URLSearchParams(location.search).has("debug");
const query = new window.URLSearchParams(location.search);
const viewportStorageKey = "three-mmd-loader.viewer.viewport.v1";
const storedViewportSettings = readStoredViewportSettings();
const initialPhysicsMaxSubSteps = parseDebugInteger(query.get("maxSubSteps"), 5);
const initialDynamicWithBoneFeedback = parseDebugNumber(
  query.get("dynamicWithBoneRotationFeedbackScale"),
  1
);
const initialCollisionMargin = parseDebugNumber(query.get("collisionMargin"), -1);
const initialSolverIterations = parseDebugInteger(query.get("solverIterations"), 20);
const initialSplitImpulse = query.get("splitImpulse") === "0" ? false : true;
const initialSplitImpulsePenetrationThreshold = parseDebugNumber(
  query.get("splitImpulsePenetrationThreshold"),
  -0.04
);
const initialSelfShadowEnabled = query.get("selfShadow") === "0" ? false : true;

export const state = {
  hasLocalFixtures: false,
  customBulletMmdScriptUrl: "/dist/physics/mmd/mmd_bullet.js",
  physicsTuningOptions: {
    maxSubSteps: initialPhysicsMaxSubSteps,
    dynamicWithBoneRotationFeedbackScale: initialDynamicWithBoneFeedback,
    collisionMargin: initialCollisionMargin,
    solverIterations: initialSolverIterations,
    splitImpulse: initialSplitImpulse,
    splitImpulsePenetrationThreshold: initialSplitImpulsePenetrationThreshold
  },
  showDebugColliders: query.has("collision") || query.has("debugCollision"),
  activePhysicsBackend: undefined,
  customBulletMmdModule: undefined,
  customBulletMmdLoadPromise: undefined,
  animationLoader: new ThreeMmdLoader({ runtime: { frameRate: viewerConfig.mmdFrameRate } }),
  frameTimer: new THREE.Timer(),
  renderer: undefined,
  scene: undefined,
  gridHelper: undefined,
  axesHelper: undefined,
  viewportGridVisible: storedViewportSettings.grid ?? true,
  viewportAxesVisible: storedViewportSettings.axes ?? true,
  camera: undefined,
  perspectiveCamera: undefined,
  orthographicCamera: undefined,
  cameraAspect: 1,
  controls: undefined,
  keyLight: undefined,
  currentModel: undefined,
  currentBackground: undefined,
  currentMotion: undefined,
  currentCameraMotion: undefined,
  currentFolderTextureMap: undefined,
  currentFolderPmxFiles: [],
  currentMotionVmdFiles: [],
  currentAudioEntries: [],
  currentBackgroundEntries: [],
  currentCameraEntries: [],
  mmdFrameRate: viewerConfig.mmdFrameRate,
  mmdFrameQuantize: viewerConfig.mmdFrameQuantize,
  assetLibrary: {
    presets: [],
    models: [],
    motions: [],
    poses: [],
    backgrounds: [],
    audios: [],
    cameras: []
  },
  pendingMotionSource: undefined,
  pendingMotionLabel: undefined,
  elapsedSeconds: 0,
  isPlaying: false,
  isSeeking: false,
  audioObjectUrl: undefined,
  audioOffsetFrame: 0,
  audioOffsetSeconds: 0,
  isSyncingAudioState: false,
  isSyncingAudioTime: false,
  audioSeekSyncTimer: undefined,
  viewerDisposed: false,
  cameraTargetScratch: new THREE.Vector3(),
  cameraOffsetScratch: new THREE.Vector3(),
  cameraEulerScratch: new THREE.Euler(),
  cameraQuaternionScratch: new THREE.Quaternion(),
  cameraUpScratch: new THREE.Vector3(),
  lightDirectionScratch: new THREE.Vector3(),
  selfShadowBoundsScratch: new THREE.Box3(),
  selfShadowStateScratch: {
    mode: 1,
    distance: 0.4
  },
  selfShadowFrameHint: { index: 0 },
  runtimeUpdateOptionsScratch: {
    ik: true,
    physics: true
  },
  runtimePhysicsDisabledOptionsScratch: {
    physics: false
  },
  audioNoEvaluateOptionsScratch: {
    evaluate: false
  },
  audioDriftSyncOptionsScratch: {
    onlyIfDrifted: true
  },
  selfShadowLightOptionsScratch: {
    distanceScale: 100,
    minFar: 1,
    maxFar: 100,
    shadowIntensity: 1.0
  },
  cameraStateScratch: {
    distance: 0,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    fov: 1,
    perspective: true
  },
  debugMaterialState: new Map(),
  debugColliderGroup: undefined,
  debugCollidersVisible: false,
  debugMaterialMode: "default",
  debugOutlineHidden: false,
  debugSelfShadowEnabled: initialSelfShadowEnabled,
  debugFpsSampleSeconds: 0,
  debugFpsSampleFrames: 0,
  debugFrameTimeSampleMs: 0,
  restPoseAnimation: {
    kind: "vmd",
    metadata: {
      format: "vmd",
      modelName: "",
      counts: { bones: 0, morphs: 0, cameras: 0, lights: 0, selfShadows: 0, properties: 0 },
      maxFrame: 0
    },
    boneTracks: {},
    morphTracks: {},
    cameraFrames: [],
    lightFrames: [],
    selfShadowFrames: [],
    propertyFrames: []
  }
};

state.frameTimer.connect(document);

export function persistViewportSettings() {
  try {
    window.localStorage.setItem(viewportStorageKey, JSON.stringify({
      grid: state.viewportGridVisible,
      axes: state.viewportAxesVisible
    }));
  } catch {
    // Ignore storage failures.
  }
}

function readStoredViewportSettings() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(viewportStorageKey) ?? "null");
    if (parsed && typeof parsed === "object") {
      return {
        grid: typeof parsed.grid === "boolean" ? parsed.grid : undefined,
        axes: typeof parsed.axes === "boolean" ? parsed.axes : undefined
      };
    }
  } catch {
    // Ignore malformed storage.
  }
  return {};
}

function parseDebugInteger(value, fallback) {
  if (value === null) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(Math.trunc(parsed), 0) : fallback;
}

function parseDebugNumber(value, fallback) {
  if (value === null) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

state.cameraApplyOptions = {
  target: state.cameraTargetScratch,
  offset: state.cameraOffsetScratch,
  euler: state.cameraEulerScratch,
  quaternion: state.cameraQuaternionScratch,
  up: state.cameraUpScratch,
  get aspect() {
    return state.cameraAspect;
  },
  get orthographicCamera() {
    return state.orthographicCamera;
  }
};

export function hasCurrentMotion() {
  return state.currentMotion?.animation !== undefined;
}

export function currentMotionDurationSeconds() {
  const motionDuration = state.currentMotion?.durationSeconds ?? (state.currentMotion ? animationDurationSeconds(state.currentMotion.animation) : 0);
  return Math.max(motionDuration, state.currentCameraMotion?.durationSeconds ?? 0);
}

export function animationDurationSeconds(animation) {
  return Math.max((animation.metadata?.maxFrame ?? 0) / state.mmdFrameRate, 0);
}

export function currentMmdFrame() {
  const frame = state.elapsedSeconds * state.mmdFrameRate;
  return Math.max(state.mmdFrameQuantize ? Math.floor(frame + 1e-6) : frame, 0);
}

export function currentMmdSeconds() {
  return currentMmdFrame() / state.mmdFrameRate;
}

