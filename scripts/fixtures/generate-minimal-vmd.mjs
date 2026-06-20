/**
 * Generates minimal VMD animation files for skinning visual regression.
 *
 * VMD binary layout:
 *   30 bytes  signature ("Vocaloid Motion Data 0002", null-padded)
 *   20 bytes  model name (Shift-JIS, null-padded; any value — not matched to PMX)
 *   4 bytes   bone frame count (i32 LE)
 *   per bone frame:
 *     15 bytes  bone name (Shift-JIS, null-padded)
 *      4 bytes  frame number (u32 LE)
 *     12 bytes  translation xyz (f32 × 3)
 *     16 bytes  rotation quaternion xyzw (f32 × 4)
 *     64 bytes  bezier interpolation (linear defaults: 20 20 107 107 pattern)
 *   4 bytes   morph frame count (i32 LE) = 0
 *   4 bytes   camera frame count (i32 LE) = 0
 *   4 bytes   light frame count (i32 LE) = 0
 *   4 bytes   self-shadow frame count (i32 LE) = 0
 *   4 bytes   property frame count (i32 LE) = 0
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SKINNING_VMD_OUTPUT_DIR = "test/fixtures/generated/skinning";
const CAMERA_LIGHT_VMD_OUTPUT_DIR = "test/fixtures/generated/camera-light-vmd";

// Linear bezier interpolation control points (standard MMD defaults).
// Layout: 4 axes (X,Y,Z,R) × 16 bytes each, interleaved in a specific pattern.
// Using the common linear values: x1=x2=20, y1=y2=107 for each axis.
const LINEAR_INTERPOLATION = new Uint8Array([
  20, 20, 107, 107,  20, 20, 107, 107,  20, 20, 107, 107,  20, 20, 107, 107,
  20, 20, 107, 107,  20, 20, 107, 107,  20, 20, 107, 107,  20, 20, 107, 107,
  20, 20, 107, 107,  20, 20, 107, 107,  20, 20, 107, 107,  20, 20, 107, 107,
  20, 20, 107, 107,  20, 20, 107, 107,  20, 20, 107, 107,  20, 20, 107, 107,
]);
const LINEAR_CAMERA_INTERPOLATION = new Uint8Array([
  20, 20, 20, 20, 20, 20,
  20, 20, 20, 20, 20, 20,
  107, 107, 107, 107, 107, 107,
  107, 107, 107, 107, 107, 107
]);

/**
 * Generates a VMD with one keyframe per entry in `boneFrames`.
 *
 * @param {object} options
 * @param {string} [options.modelName]  Model name written into VMD header (cosmetic).
 * @param {Array<{boneName: string, frame?: number, quaternion: [number,number,number,number]}>} options.boneFrames
 *   Each entry sets one bone keyframe. quaternion = [x, y, z, w].
 * @param {Array<{frame?: number, distance: number, position: [number,number,number], rotation: [number,number,number], fov: number, perspective?: boolean}>} [options.cameraFrames]
 * @param {Array<{frame?: number, color: [number,number,number], direction: [number,number,number]}>} [options.lightFrames]
 * @param {Array<{frame?: number, mode: number, distance: number}>} [options.selfShadowFrames]
 * @returns {Uint8Array}
 */
export function generateMinimalVmd({
  modelName = "",
  boneFrames = [],
  cameraFrames = [],
  lightFrames = [],
  selfShadowFrames = []
}) {
  const out = [];

  const u32 = (v) => {
    const b = new ArrayBuffer(4);
    new DataView(b).setUint32(0, v, true);
    out.push(...new Uint8Array(b));
  };
  const i32 = (v) => {
    const b = new ArrayBuffer(4);
    new DataView(b).setInt32(0, v, true);
    out.push(...new Uint8Array(b));
  };
  const f32 = (v) => {
    const b = new ArrayBuffer(4);
    new DataView(b).setFloat32(0, v, true);
    out.push(...new Uint8Array(b));
  };
  const fixedText = (s, length) => {
    // ASCII/Shift-JIS: ASCII subset works directly as byte values
    for (let i = 0; i < length; i++) {
      out.push(i < s.length ? s.charCodeAt(i) : 0);
    }
  };

  // Signature (30 bytes)
  fixedText("Vocaloid Motion Data 0002", 30);
  // Model name (20 bytes)
  fixedText(modelName.substring(0, 20), 20);

  // Bone frame count
  i32(boneFrames.length);

  for (const bf of boneFrames) {
    fixedText(bf.boneName, 15);                    // bone name (15 bytes)
    u32(bf.frame ?? 0);                            // frame number
    f32(0); f32(0); f32(0);                        // translation (zero)
    const [qx, qy, qz, qw] = bf.quaternion;
    f32(qx); f32(qy); f32(qz); f32(qw);           // rotation quaternion
    out.push(...LINEAR_INTERPOLATION);             // interpolation (64 bytes)
  }

  // Morph frames
  i32(0);
  // Camera frames
  i32(cameraFrames.length);
  for (const frame of cameraFrames) {
    u32(frame.frame ?? 0);
    f32(frame.distance);
    f32(frame.position[0]); f32(frame.position[1]); f32(frame.position[2]);
    f32(frame.rotation[0]); f32(frame.rotation[1]); f32(frame.rotation[2]);
    out.push(...LINEAR_CAMERA_INTERPOLATION);
    u32(frame.fov);
    out.push(frame.perspective === false ? 1 : 0);
  }
  // Light frames
  i32(lightFrames.length);
  for (const frame of lightFrames) {
    u32(frame.frame ?? 0);
    f32(frame.color[0]); f32(frame.color[1]); f32(frame.color[2]);
    f32(frame.direction[0]); f32(frame.direction[1]); f32(frame.direction[2]);
  }
  i32(selfShadowFrames.length);
  for (const frame of selfShadowFrames) {
    u32(frame.frame ?? 0);
    out.push(frame.mode & 0xff);
    f32(frame.distance);
  }
  // property
  i32(0);

  return new Uint8Array(out);
}

// ──────────────────────────────────────────────────────────────────────────────
// Named VMD fixtures for skinning visual tests
// ──────────────────────────────────────────────────────────────────────────────

// Rotate around the Z axis by `deg` degrees — elbow-like sideways bend for a Y-axis limb.
// Quaternion for Z rotation: [0, 0, sin(θ/2), cos(θ/2)]
function rotZ(deg) {
  const r = (deg * Math.PI) / 180;
  return [0, 0, Math.sin(r / 2), Math.cos(r / 2)];
}

// Rotate around the Y axis by `deg` degrees — axial twist.
function rotY(deg) {
  const r = (deg * Math.PI) / 180;
  return [0, Math.sin(r / 2), 0, Math.cos(r / 2)];
}

export const SKINNING_VMOD_CASES = {
  // 2-bone elbow bend: rotate upper bone 90° sideways (Z axis).
  // Upper half goes in +X direction, forming an L-shape visible from the front.
  "bend-two-bone-90": {
    modelName: "bend90",
    boneFrames: [
      { boneName: "upper",    frame: 0, quaternion: rotZ(90) },
      { boneName: "upperArm", frame: 0, quaternion: rotZ(90) }
    ]
  },
  // 4-bone twist: rotate top bone 120° around Y — shows candy-wrapper on BDEF4
  "twist-four-bone-120": {
    modelName: "twist120",
    boneFrames: [
      { boneName: "bone3", frame: 0, quaternion: rotY(120) }
    ]
  }
};

export const SELF_SHADOW_VMD_CASES = {
  "mmd-self-shadow-vmd-off": {
    modelName: "shadowOff",
    boneFrames: [],
    selfShadowFrames: [
      { frame: 0, mode: 0, distance: 0 }
    ]
  },
  "mmd-self-shadow-vmd-on": {
    modelName: "shadowOn",
    boneFrames: [],
    selfShadowFrames: [
      { frame: 0, mode: 1, distance: 0.4 }
    ]
  },
  "mmd-self-shadow-sdef-depth": {
    modelName: "sdefShadow",
    boneFrames: [
      { boneName: "upperArm", frame: 0, quaternion: rotZ(72) }
    ],
    selfShadowFrames: [
      { frame: 0, mode: 1, distance: 0.4 }
    ]
  }
};

export const CAMERA_LIGHT_VMD_CASES = {
  "camera-near": {
    modelName: "cameraNear",
    cameraFrames: [
      {
        frame: 0,
        distance: -3.2,
        position: [0.06, 0.6, 0],
        rotation: [0, 0, 0],
        fov: 24,
        perspective: true
      }
    ]
  },
  "camera-far": {
    modelName: "cameraFar",
    cameraFrames: [
      {
        frame: 0,
        distance: -6.2,
        position: [0.06, 0.6, 0],
        rotation: [0, 0, 0],
        fov: 24,
        perspective: true
      }
    ]
  },
  "light-front": {
    modelName: "lightFront",
    lightFrames: [
      {
        frame: 0,
        color: [0.9, 0.45, 0.25],
        direction: [0.45, -0.9, -0.55]
      }
    ]
  },
  "light-side": {
    modelName: "lightSide",
    lightFrames: [
      {
        frame: 0,
        color: [0.2, 0.55, 0.9],
        direction: [-1.0, -0.35, 0.0]
      }
    ]
  }
};

export function skinningVmdCaseIds() {
  return Object.keys(SKINNING_VMOD_CASES);
}

export function generateSkinningVmd(caseId) {
  const spec = SKINNING_VMOD_CASES[caseId];
  if (!spec) throw new Error(`Unknown skinning VMD case: ${caseId}`);
  return generateMinimalVmd(spec);
}

export function selfShadowVmdCaseIds() {
  return Object.keys(SELF_SHADOW_VMD_CASES);
}

export function generateSelfShadowVmd(caseId) {
  const spec = SELF_SHADOW_VMD_CASES[caseId];
  if (!spec) throw new Error(`Unknown self-shadow VMD case: ${caseId}`);
  return generateMinimalVmd(spec);
}

export function cameraLightVmdCaseIds() {
  return Object.keys(CAMERA_LIGHT_VMD_CASES);
}

export function generateCameraLightVmd(caseId) {
  const spec = CAMERA_LIGHT_VMD_CASES[caseId];
  if (!spec) throw new Error(`Unknown camera/light VMD case: ${caseId}`);
  return generateMinimalVmd(spec);
}

// ──────────────────────────────────────────────────────────────────────────────
// CLI
// ──────────────────────────────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outputArgIndex = process.argv.indexOf("--output-dir");
  const writeSelfShadow = process.argv.includes("--all-self-shadow");
  const writeCameraLight = process.argv.includes("--camera-light");
  const outputDir =
    outputArgIndex >= 0 && process.argv[outputArgIndex + 1] !== undefined
      ? process.argv[outputArgIndex + 1]
      : writeCameraLight
        ? CAMERA_LIGHT_VMD_OUTPUT_DIR
        : SKINNING_VMD_OUTPUT_DIR;
  const caseIds = writeCameraLight
    ? cameraLightVmdCaseIds()
    : writeSelfShadow
      ? selfShadowVmdCaseIds()
      : skinningVmdCaseIds();
  for (const caseId of caseIds) {
    const outputPath = resolve(outputDir, `${caseId}.vmd`);
    const bytes = writeCameraLight
      ? generateCameraLightVmd(caseId)
      : writeSelfShadow
        ? generateSelfShadowVmd(caseId)
        : generateSkinningVmd(caseId);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, bytes);
    console.log(`wrote ${bytes.byteLength} bytes to ${outputPath}`);
  }
}
