import { toUint8Array } from "../binary/index.js";
import type { MmdPose, VpdBonePose, VpdMetadata } from "../model/modelTypes.js";

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
  const encoded = typeof input === "string" ? bytes : toUint8Array(input);
  const parsedPose = readVpdPoseText(text);
  const bones: Record<string, VpdBonePose> = {};
  for (const bonePose of parsedPose.bones) {
    bones[bonePose.name] = {
      name: bonePose.name,
      translation: bonePose.translation,
      rotation: bonePose.rotation
    };
  }

  const metadata: MutableVpdMetadata = {
    format: "vpd",
    signature,
    encoding: detectEncoding(bytes),
    modelFile: parsedPose.modelFile,
    boneCount: parsedPose.bones.length,
    morphCount: 0
  };

  return {
    kind: "vpd",
    bytes: encoded,
    metadata,
    bones,
    morphs: {}
  };
}

function readVpdPoseText(text: string): {
  readonly modelFile: string;
  readonly bones: VpdBonePose[];
} {
  const header = readVpdHeader(text);
  return {
    modelFile: header.modelFile,
    bones: readBonePoses(text, header.poseTextOffset)
  };
}

function readVpdHeader(text: string): {
  readonly modelFile: string;
  readonly poseTextOffset: number;
} {
  if (!text.startsWith(signature)) {
    throw new Error("Invalid VPD signature");
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
  const blockRanges: Array<{ readonly start: number; readonly end: number }> = [];
  for (const match of text.matchAll(blockPattern)) {
    const offset = match.index ?? 0;
    blockRanges.push({ start: offset, end: offset + match[0].length });
    const name = (match[1] ?? "").trim();
    bones.push({
      name,
      translation: parseTuple(match[2] ?? "", 3),
      rotation: parseTuple(match[3] ?? "", 4)
    });
  }

  const blockStartPattern = /Bone\d+\s*\{/g;
  blockStartPattern.lastIndex = startIndex;
  for (const match of text.matchAll(blockStartPattern)) {
    const offset = match.index ?? 0;
    if (!blockRanges.some((range) => offset >= range.start && offset < range.end)) {
      throw new Error("Invalid VPD bone block");
    }
  }
  return bones;
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
