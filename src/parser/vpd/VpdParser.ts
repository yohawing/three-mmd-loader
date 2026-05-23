import { toUint8Array } from "../binary/index.js";
import type { MmdAnimation, MmdPose, VpdBonePose, VpdMetadata } from "../model/modelTypes.js";

type MutableVpdMetadata = VpdMetadata & {
  readonly format: "vpd";
  readonly signature: "Vocaloid Pose Data file";
  readonly encoding: "utf-8" | "shift-jis";
};

const signature = "Vocaloid Pose Data file";
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
const shiftJisDecoder = new TextDecoder("shift-jis");

export function parseVpd(input: Uint8Array | string): MmdPose {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : toUint8Array(input);
  const text = typeof input === "string" ? input : decodeVpdText(bytes);
  const parsedPose = readVpdPoseText(text);
  const bones: Record<string, VpdBonePose> = {};
  for (const bonePose of parsedPose.bones) {
    bones[bonePose.name] = {
      name: bonePose.name,
      translation: bonePose.translation,
      rotation: bonePose.rotation
    };
  }
  const morphs = readMorphPoses(text, parsedPose.poseTextOffset);

  const metadata: MutableVpdMetadata = {
    format: "vpd",
    signature,
    encoding: detectEncoding(bytes),
    modelFile: parsedPose.modelFile,
    boneCount: Object.keys(bones).length,
    morphCount: Object.keys(morphs).length
  };

  return {
    kind: "vpd",
    bytes,
    metadata,
    bones,
    morphs
  };
}

export function vpdPoseToAnimation(pose: MmdPose, name = pose.metadata.modelFile): MmdAnimation {
  const boneTracks: MmdAnimation["boneTracks"] = {};
  const morphTracks: MmdAnimation["morphTracks"] = {};
  for (const bone of Object.values(pose.bones)) {
    boneTracks[bone.name] = [
      {
        frame: 0,
        translation: bone.translation,
        rotation: bone.rotation
      }
    ];
  }
  for (const [morphName, weight] of Object.entries(pose.morphs)) {
    morphTracks[morphName] = [{ frame: 0, weight }];
  }
  return {
    kind: "vmd",
    bytes: pose.bytes.slice(),
    metadata: {
      modelName: name,
      counts: {
        bones: Object.keys(boneTracks).length,
        morphs: Object.keys(morphTracks).length,
        cameras: 0,
        lights: 0,
        selfShadows: 0,
        properties: 0
      },
      maxFrame: 0
    },
    boneTracks,
    morphTracks,
    cameraFrames: [],
    lightFrames: [],
    selfShadowFrames: [],
    propertyFrames: []
  };
}

function readVpdPoseText(text: string): {
  readonly modelFile: string;
  readonly poseTextOffset: number;
  readonly bones: VpdBonePose[];
} {
  const header = readVpdHeader(text);
  return {
    modelFile: header.modelFile,
    poseTextOffset: header.poseTextOffset,
    bones: readBonePoses(text, header.poseTextOffset)
  };
}

function readVpdHeader(text: string): {
  readonly modelFile: string;
  readonly poseTextOffset: number;
} {
  if (!text.startsWith(signature)) {
    throw new Error("Invalid VPD header");
  }
  const modelStatement = readStatement(text, signature.length, "model file");
  const countStatement = readStatement(text, modelStatement.nextIndex, "bone count");
  const countText = countStatement.value.trim();
  if (!/^\d+$/.test(countText)) {
    throw new Error(`Invalid VPD bone count: ${countText}`);
  }
  return {
    modelFile: modelStatement.value.trim(),
    poseTextOffset: countStatement.nextIndex
  };
}

function readStatement(
  text: string,
  startIndex: number,
  label: string
): { readonly value: string; readonly nextIndex: number } {
  let index = consumeStatementPrefix(text, startIndex);
  let value = "";
  while (index < text.length) {
    if (text[index] === ";") {
      return { value, nextIndex: index + 1 };
    }
    value += text[index] ?? "";
    index += 1;
  }
  throw new Error(`Missing VPD ${label} statement terminator`);
}

function consumeStatementPrefix(text: string, startIndex: number): number {
  let index = startIndex;
  while (index < text.length) {
    index = consumeWhitespace(text, index);
    if (text[index] !== "/" || text[index + 1] !== "/") {
      return index;
    }
    index = consumeLine(text, index);
  }
  return index;
}

function consumeWhitespace(text: string, startIndex: number): number {
  let index = startIndex;
  while (
    index < text.length &&
    (text[index] === " " || text[index] === "\t" || text[index] === "\r" || text[index] === "\n")
  ) {
    index += 1;
  }
  return index;
}

function consumeLine(text: string, startIndex: number): number {
  let index = startIndex;
  while (index < text.length) {
    const char = text[index];
    index += 1;
    if (char === "\n") {
      break;
    }
  }
  return index;
}

function readBonePoses(text: string, startIndex: number): VpdBonePose[] {
  const blockPattern =
    /Bone\d+\s*\{\s*([^\r\n]+)\s*\r?\n\s*(?:(?:\/\/)[^\r\n]*\r?\n\s*)?([^;]*);\s*(?:\/\/[^\r\n]*)?\r?\n\s*(?:(?:\/\/)[^\r\n]*\r?\n\s*)?([^;]*);\s*(?:\/\/[^\r\n]*)?\r?\n\s*\}/g;
  blockPattern.lastIndex = startIndex;

  const bones: VpdBonePose[] = [];
  for (const match of text.matchAll(blockPattern)) {
    const translation = tryParseTuple(match[2] ?? "", 3);
    const rotation = tryParseTuple(match[3] ?? "", 4);
    if (!translation || !rotation) {
      continue;
    }
    const name = (match[1] ?? "").trim();
    bones.push({
      name,
      translation,
      rotation
    });
  }
  return bones;
}

function readMorphPoses(text: string, startIndex: number): Record<string, number> {
  const morphs: Record<string, number> = {};
  const blockPattern =
    /Morph\d+\s*\{\s*([^\r\n]+)\s*\r?\n\s*(?:(?:\/\/)[^\r\n]*\r?\n\s*)?([^;]+);/g;
  blockPattern.lastIndex = startIndex;
  for (const match of text.matchAll(blockPattern)) {
    const name = (match[1] ?? "").trim();
    const weight = Number((match[2] ?? "").trim());
    if (Number.isFinite(weight)) {
      morphs[name] = weight;
    }
  }
  return morphs;
}

function parseTuple(value: string, length: 3): [number, number, number];
function parseTuple(value: string, length: 4): [number, number, number, number];
function parseTuple(
  value: string,
  length: 3 | 4
): [number, number, number] | [number, number, number, number] {
  const fields = value.split(",").map((item) => item.trim());
  const values = fields.map((item) => Number(item));
  if (values.length !== length || values.some((item) => !Number.isFinite(item))) {
    throw new Error(`Invalid VPD numeric tuple: ${value.trim()}`);
  }
  if (fields.some((item) => item.length === 0)) {
    throw new Error(`Invalid VPD numeric tuple: ${value.trim()}`);
  }
  return values as [number, number, number] | [number, number, number, number];
}

function tryParseTuple(value: string, length: 3): [number, number, number] | undefined;
function tryParseTuple(value: string, length: 4): [number, number, number, number] | undefined;
function tryParseTuple(
  value: string,
  length: 3 | 4
): [number, number, number] | [number, number, number, number] | undefined {
  try {
    return length === 3 ? parseTuple(value, 3) : parseTuple(value, 4);
  } catch {
    return undefined;
  }
}

function decodeVpdText(bytes: Uint8Array): string {
  try {
    const text = utf8Decoder.decode(bytes);
    if (text.startsWith(signature)) {
      return text;
    }
  } catch {
    // Fall through to Shift-JIS, which is the common VPD encoding.
  }
  return shiftJisDecoder.decode(bytes);
}

function detectEncoding(bytes: Uint8Array): "utf-8" | "shift-jis" {
  try {
    const text = utf8Decoder.decode(bytes);
    return text.startsWith(signature) ? "utf-8" : "shift-jis";
  } catch {
    return "shift-jis";
  }
}
