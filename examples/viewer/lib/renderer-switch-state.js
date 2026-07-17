import { loadedFileSwitcherValue, dom } from "./dom.js";
import { state } from "./state.js";

const dbName = "three-mmd-loader.viewer.rendererSwitch.v1";
const storeName = "snapshots";
const restoreParamName = "restoreState";

export function createRendererSwitchSnapshot() {
  return {
    version: 1,
    savedAt: Date.now(),
    model: snapshotModel(),
    motion: snapshotMotion(),
    pose: snapshotPose(),
    background: snapshotBackground(),
    camera: snapshotCamera(),
    cameraView: snapshotCameraView(),
    audio: snapshotAudio(),
    debugSelfShadowEnabled: state.debugSelfShadowEnabled,
    debugBeforeCapture: state.debugBeforeCapture,
    elapsedSeconds: state.elapsedSeconds
  };
}

export function hasRendererSwitchSnapshotState(snapshot) {
  return Boolean(
    snapshot.model ||
    snapshot.motion ||
    snapshot.pose ||
    snapshot.background ||
    snapshot.camera ||
    snapshot.cameraView ||
    snapshot.audio ||
    snapshot.debugBeforeCapture
  );
}

export async function saveRendererSwitchSnapshot(snapshot) {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const db = await openRendererSwitchDb();
  await requestToPromise(db.transaction(storeName, "readwrite").objectStore(storeName).put(snapshot, id));
  db.close();
  return id;
}

export async function consumeRendererSwitchSnapshot() {
  const url = new URL(window.location.href);
  const id = url.searchParams.get(restoreParamName);
  if (!id) {
    return undefined;
  }
  url.searchParams.delete(restoreParamName);
  window.history.replaceState(window.history.state, "", url);

  const db = await openRendererSwitchDb();
  const transaction = db.transaction(storeName, "readwrite");
  const store = transaction.objectStore(storeName);
  const snapshot = await requestToPromise(store.get(id));
  await requestToPromise(store.delete(id));
  db.close();
  return isRendererSwitchSnapshot(snapshot) ? snapshot : undefined;
}

export function setRendererSwitchRestoreParam(url, id) {
  url.searchParams.set(restoreParamName, id);
}

export function restoreFiles(records) {
  return records.map(restoreFileRecord);
}

function snapshotModel() {
  const selectedKey = loadedFileSwitcherValue(dom.modelSwitcher);
  const selected = selectedEntry(state.currentFolderPmxFiles, selectedKey, modelEntryKey);
  if (typeof selected?.source === "string") {
    return {
      kind: "url",
      url: selected.source
    };
  }
  if (state.currentFolderFiles.length > 1 || hasRelativeFile(state.currentFolderFiles)) {
    return {
      kind: "folder",
      files: fileRecords(state.currentFolderFiles),
      selectedKey
    };
  }
  const modelFile = selected instanceof window.File
    ? selected
    : state.currentFolderFiles.find((file) => modelEntryKey(file) === selectedKey);
  return modelFile
    ? {
        kind: "file",
        file: fileRecord(modelFile)
      }
    : undefined;
}

function snapshotMotion() {
  const selectedKey = loadedFileSwitcherValue(dom.motionSwitcher);
  const selected = selectedEntry(state.currentMotionVmdFiles, selectedKey, motionEntryKey);
  const source = selected?.source ?? selected ?? state.currentMotion?.source ?? state.pendingMotionSource;
  if (typeof source === "string") {
    return {
      kind: "url",
      url: source
    };
  }
  if (source instanceof window.File) {
    return {
      kind: "file",
      files: fileRecords(state.currentMotionVmdFiles.filter((entry) => entry instanceof window.File)),
      selectedKey,
      file: fileRecord(source)
    };
  }
  return undefined;
}

function snapshotPose() {
  const source = state.currentPoseSource;
  if (typeof source === "string") {
    return {
      kind: "url",
      url: source,
      label: state.currentPoseLabel
    };
  }
  return source instanceof window.File
    ? {
        kind: "file",
        file: fileRecord(source),
        label: state.currentPoseLabel
      }
    : undefined;
}

function snapshotBackground() {
  const selectedKey = loadedFileSwitcherValue(dom.backgroundSwitcher);
  const selected = selectedEntry(state.currentBackgroundEntries, selectedKey, entryKey);
  if (typeof selected?.source === "string") {
    return {
      kind: "url",
      url: selected.source
    };
  }
  if (state.currentBackgroundFiles.length > 1 || hasRelativeFile(state.currentBackgroundFiles)) {
    return {
      kind: "folder",
      files: fileRecords(state.currentBackgroundFiles)
    };
  }
  const source = selected?.source;
  return source instanceof window.File
    ? {
        kind: "file",
        file: fileRecord(source)
      }
    : undefined;
}

function snapshotCamera() {
  const selectedKey = loadedFileSwitcherValue(dom.cameraSwitcher);
  const selected = selectedEntry(state.currentCameraEntries, selectedKey, entryKey);
  const source = selected?.source;
  if (typeof source === "string") {
    return {
      kind: "url",
      url: source
    };
  }
  return source instanceof window.File
    ? {
        kind: "file",
        file: fileRecord(source)
      }
    : undefined;
}

function snapshotCameraView() {
  if (!state.camera || !state.controls) {
    return undefined;
  }
  return {
    active: state.camera === state.orthographicCamera ? "orthographic" : "perspective",
    position: state.camera.position.toArray(),
    quaternion: state.camera.quaternion.toArray(),
    up: state.camera.up.toArray(),
    target: state.controls.target.toArray(),
    near: state.camera.near,
    far: state.camera.far,
    fov: state.perspectiveCamera?.fov,
    zoom: state.camera.zoom
  };
}

function snapshotAudio() {
  const selectedKey = loadedFileSwitcherValue(dom.audioSwitcher);
  const selected = selectedEntry(state.currentAudioEntries, selectedKey, entryKey);
  if (selected?.source instanceof window.File) {
    return {
      kind: "file",
      file: fileRecord(selected.source),
      offsetFrame: state.audioOffsetFrame
    };
  }
  const src = selected?.src;
  return typeof src === "string" && !src.startsWith("blob:")
    ? {
        kind: "url",
        url: src,
        name: selected.name,
        offsetFrame: state.audioOffsetFrame
      }
    : undefined;
}

function selectedEntry(entries, selectedKey, keyFn) {
  return entries.find((entry) => keyFn(entry) === selectedKey) ?? entries[0];
}

function modelEntryKey(entry) {
  if (typeof entry?.id === "string") {
    return entry.id;
  }
  if (typeof entry?.source === "string") {
    return `url:${entry.source}`;
  }
  return entry instanceof window.File ? (entry.webkitRelativePath || entry.name) : "";
}

function motionEntryKey(entry) {
  if (typeof entry?.id === "string") {
    return entry.id;
  }
  if (typeof entry?.source === "string") {
    return `url:${entry.source}`;
  }
  return entry instanceof window.File ? (entry.webkitRelativePath || entry.name) : "";
}

function entryKey(entry) {
  return typeof entry?.id === "string" ? entry.id : "";
}

function hasRelativeFile(files) {
  return files.some((file) => Boolean(file.webkitRelativePath));
}

function fileRecords(files) {
  return files.map(fileRecord);
}

function fileRecord(file) {
  return {
    file,
    relativePath: file.webkitRelativePath || ""
  };
}

function restoreFileRecord(record) {
  const file = record.file;
  if (record.relativePath) {
    Object.defineProperty(file, "webkitRelativePath", {
      configurable: true,
      value: record.relativePath
    });
  }
  return file;
}

function isRendererSwitchSnapshot(value) {
  return Boolean(value && typeof value === "object" && value.version === 1);
}

function openRendererSwitchDb() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(storeName);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
