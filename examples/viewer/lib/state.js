import * as THREE from "three";

import { ThreeMmdLoader } from "../../../dist/three/index.js";
import { viewerConfig } from "./viewer-config.js";

export const debugEnabled = new window.URLSearchParams(location.search).has("debug");

export const state = {
  ammoScriptUrl: "/node_modules/ammo.js/ammo.js",
  activePhysicsBackend: undefined,
  ammoNamespace: undefined,
  ammoScriptLoadPromise: undefined,
  animationLoader: new ThreeMmdLoader({ runtime: { frameRate: viewerConfig.mmdFrameRate } }),
  clock: new THREE.Clock(),
  renderer: undefined,
  scene: undefined,
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
  isSyncingAudioState: false,
  isSyncingAudioTime: false,
  audioSeekSyncTimer: undefined,
  viewerDisposed: false,
  cameraTargetScratch: new THREE.Vector3(),
  cameraOffsetScratch: new THREE.Vector3(),
  cameraEulerScratch: new THREE.Euler(),
  cameraQuaternionScratch: new THREE.Quaternion(),
  cameraUpScratch: new THREE.Vector3(),
  cameraStateScratch: {
    distance: 0,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    fov: 1,
    perspective: true
  },
  debugMaterialState: new Map(),
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

