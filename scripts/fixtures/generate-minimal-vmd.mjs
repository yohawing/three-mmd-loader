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

// Linear bezier interpolation control points (standard MMD defaults).
// Layout: 4 axes (X,Y,Z,R) × 16 bytes each, interleaved in a specific pattern.
// Using the common linear values: x1=x2=20, y1=y2=107 for each axis.
const LINEAR_INTERPOLATION = new Uint8Array([
  20, 20, 107, 107,  20, 20, 107, 107,  20, 20, 107, 107,  20, 20, 107, 107,
  20, 20, 107, 107,  20, 20, 107, 107,  20, 20, 107, 107,  20, 20, 107, 107,
  20, 20, 107, 107,  20, 20, 107, 107,  20, 20, 107, 107,  20, 20, 107, 107,
  20, 20, 107, 107,  20, 20, 107, 107,  20, 20, 107, 107,  20, 20, 107, 107,
]);

/**
 * Generates a VMD with one keyframe per entry in `boneFrames`.
 *
 * @param {object} options
 * @param {string} [options.modelName]  Model name written into VMD header (cosmetic).
 * @param {Array<{boneName: string, frame?: number, quaternion: [number,number,number,number]}>} options.boneFrames
 *   Each entry sets one bone keyframe. quaternion = [x, y, z, w].
 * @returns {Uint8Array}
 */
export function generateMinimalVmd({ modelName = "", boneFrames = [] }) {
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

  // Remaining sections: morph, camera, light, self-shadow, property (all zero)
  i32(0); i32(0); i32(0); i32(0); i32(0);

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

export function skinningVmdCaseIds() {
  return Object.keys(SKINNING_VMOD_CASES);
}

export function generateSkinningVmd(caseId) {
  const spec = SKINNING_VMOD_CASES[caseId];
  if (!spec) throw new Error(`Unknown skinning VMD case: ${caseId}`);
  return generateMinimalVmd(spec);
}

// ──────────────────────────────────────────────────────────────────────────────
// CLI
// ──────────────────────────────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outputArgIndex = process.argv.indexOf("--output-dir");
  const outputDir =
    outputArgIndex >= 0 && process.argv[outputArgIndex + 1] !== undefined
      ? process.argv[outputArgIndex + 1]
      : SKINNING_VMD_OUTPUT_DIR;

  for (const caseId of skinningVmdCaseIds()) {
    const outputPath = resolve(outputDir, `${caseId}.vmd`);
    const bytes = generateSkinningVmd(caseId);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, bytes);
    console.log(`wrote ${bytes.byteLength} bytes to ${outputPath}`);
  }
}
