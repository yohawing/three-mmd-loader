import { BinaryReader, toUint8Array } from "../binary/index.js";

export interface VmdSectionCounts {
  bones: number;
  morphs: number;
  cameras: number;
  lights: number;
  selfShadows: number;
  properties: number;
}

export interface VmdMetadata {
  format: "vmd";
  signature: string;
  encoding: "shift-jis";
  modelName: string;
  counts: VmdSectionCounts;
  trailingBytes: number;
}

export type VmdSectionName = "bone" | "morph" | "camera" | "light" | "selfShadow" | "property";

export interface VmdSectionRecord {
  name: VmdSectionName;
  count: number;
  countOffset: number;
  dataOffset: number;
  byteLength: number;
}

export interface VmdSectionInventory {
  format: "vmd";
  signature: string;
  encoding: "shift-jis";
  modelName: string;
  sections: VmdSectionRecord[];
  counts: VmdSectionCounts;
  trailingBytes: number;
}

const asciiDecoder = new TextDecoder("ascii");
const shiftJisDecoder = new TextDecoder("shift-jis");

const vmdBoneFrameBytes = 111;
const vmdMorphFrameBytes = 23;
const vmdCameraFrameBytes = 61;
const vmdLightFrameBytes = 28;
const vmdSelfShadowFrameBytes = 9;
const maxVmdSectionCount = 10_000_000;

export function parseVmdMetadata(input: ArrayBuffer | Uint8Array): VmdMetadata {
  const inventory = parseVmdSectionInventory(input);

  return {
    format: "vmd",
    signature: inventory.signature,
    encoding: "shift-jis",
    modelName: inventory.modelName,
    counts: inventory.counts,
    trailingBytes: inventory.trailingBytes
  };
}

export function parseVmdSectionInventory(input: ArrayBuffer | Uint8Array): VmdSectionInventory {
  const reader = new BinaryReader(toUint8Array(input));
  const signature = readFixedText(reader, 30, asciiDecoder);
  if (!signature.startsWith("Vocaloid Motion Data")) {
    throw new Error(`Invalid VMD signature: ${JSON.stringify(signature)}`);
  }

  const modelName = readFixedText(reader, 20, shiftJisDecoder);
  const sections: VmdSectionRecord[] = [];

  const bones = readCount(reader, "bone");
  readFixedSizeSection(reader, sections, "bone", bones, vmdBoneFrameBytes);

  const morphs = readCount(reader, "morph");
  readFixedSizeSection(reader, sections, "morph", morphs, vmdMorphFrameBytes);

  const cameras = readCount(reader, "camera");
  readFixedSizeSection(reader, sections, "camera", cameras, vmdCameraFrameBytes);

  const lights = readCount(reader, "light");
  readFixedSizeSection(reader, sections, "light", lights, vmdLightFrameBytes);

  const selfShadowCountOffset = reader.offset;
  const selfShadows = readOptionalCount(reader, "self-shadow");
  if (reader.offset !== selfShadowCountOffset) {
    readFixedSizeSection(
      reader,
      sections,
      "selfShadow",
      selfShadows,
      vmdSelfShadowFrameBytes,
      selfShadowCountOffset
    );
  }

  const propertyCountOffset = reader.offset;
  const properties = readOptionalCount(reader, "property");
  if (reader.offset !== propertyCountOffset) {
    readPropertySection(reader, sections, properties, propertyCountOffset);
  }

  return {
    format: "vmd",
    signature,
    encoding: "shift-jis",
    modelName,
    sections,
    counts: {
      bones,
      morphs,
      cameras,
      lights,
      selfShadows,
      properties
    },
    trailingBytes: reader.remaining
  };
}

function readFixedSizeSection(
  reader: BinaryReader,
  sections: VmdSectionRecord[],
  name: VmdSectionName,
  count: number,
  entrySize: number,
  countOffset = reader.offset - 4
): void {
  const dataOffset = reader.offset;
  const byteLength = checkedSectionBytes(count, entrySize, name);
  reader.skip(byteLength);
  sections.push({
    name,
    count,
    countOffset,
    dataOffset,
    byteLength
  });
}

function readPropertySection(
  reader: BinaryReader,
  sections: VmdSectionRecord[],
  count: number,
  countOffset: number
): void {
  const dataOffset = reader.offset;
  for (let i = 0; i < count; i++) {
    reader.skip(5);
    const ikStates = readCount(reader, "property IK state");
    reader.skip(checkedSectionBytes(ikStates, 21, "property IK state"));
  }
  sections.push({
    name: "property",
    count,
    countOffset,
    dataOffset,
    byteLength: reader.offset - dataOffset
  });
}

function readOptionalCount(reader: BinaryReader, label: string): number {
  if (reader.remaining === 0) {
    return 0;
  }
  return readCount(reader, label);
}

function readCount(reader: BinaryReader, label: string): number {
  const count = reader.u32();
  if (count > maxVmdSectionCount) {
    throw new Error(`Invalid VMD ${label} count: ${count}`);
  }
  return count;
}

function readFixedText(reader: BinaryReader, byteLength: number, decoder: TextDecoder): string {
  const bytes = reader.bytes(byteLength);
  const end = bytes.indexOf(0);
  return decoder.decode(end >= 0 ? bytes.subarray(0, end) : bytes).trim();
}

function checkedSectionBytes(count: number, entrySize: number, label: string): number {
  const byteLength = count * entrySize;
  if (!Number.isSafeInteger(byteLength)) {
    throw new Error(`Invalid VMD ${label} byte length`);
  }
  return byteLength;
}
