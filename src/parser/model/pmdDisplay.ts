import type { BinaryReader } from "../binary/index.js";
import type { DisplayFrameData, MorphData, SkeletonData } from "./modelTypes.js";
import { readCount, readFixedText } from "./pmdBinary.js";

export function readPmdDisplayFrames(
  reader: BinaryReader,
  morphs: readonly MorphData[]
): {
  displayFrames: DisplayFrameData[];
  boneDisplayNameCount: number;
  boneDisplayFrameStart: number;
} {
  const displayFrames: DisplayFrameData[] = [];
  if (reader.remaining < 1) {
    return { displayFrames, boneDisplayNameCount: 0, boneDisplayFrameStart: 0 };
  }

  const morphDisplayFrameCount = reader.u8();
  for (let i = 0; i < morphDisplayFrameCount; i++) {
    const morphIndex = reader.u16();
    displayFrames.push({
      name: morphs[morphIndex]?.name ?? "",
      englishName: "",
      special: true,
      frames: [{ type: "morph", index: morphIndex }]
    });
  }

  if (reader.remaining < 1) {
    return { displayFrames, boneDisplayNameCount: 0, boneDisplayFrameStart: displayFrames.length };
  }
  const boneDisplayNameCount = reader.u8();
  const boneDisplayFrameStart = displayFrames.length;
  for (let i = 0; i < boneDisplayNameCount; i++) {
    displayFrames.push({
      name: readFixedText(reader, 50),
      englishName: "",
      special: false,
      frames: []
    });
  }

  if (reader.remaining < 4) {
    return { displayFrames, boneDisplayNameCount, boneDisplayFrameStart };
  }
  const boneDisplayCount = readCount(reader, "bone display", { remainingBytesPerEntry: 3 });
  for (let i = 0; i < boneDisplayCount; i++) {
    const boneIndex = reader.u16();
    const frameIndex = reader.u8();
    const displayFrame = displayFrames[boneDisplayFrameStart + frameIndex - 1];
    if (displayFrame) {
      displayFrame.frames.push({ type: "bone", index: boneIndex });
    }
  }
  return { displayFrames, boneDisplayNameCount, boneDisplayFrameStart };
}

export function readOptionalEnglishBlock(
  reader: BinaryReader,
  skeleton: SkeletonData,
  morphs: MorphData[],
  displayFrames: DisplayFrameData[],
  boneDisplayFrameStart: number,
  boneDisplayNameCount: number
): { name: string; comment: string } {
  if (reader.remaining < 1) {
    return { name: "", comment: "" };
  }
  const hasEnglish = reader.u8();
  if (hasEnglish === 0) {
    return { name: "", comment: "" };
  }
  const name = readFixedText(reader, 20);
  const comment = readFixedText(reader, 256);
  for (const bone of skeleton.bones) {
    bone.englishName = readFixedText(reader, 20);
  }
  for (let i = 1; i < morphs.length; i++) {
    const morph = morphs[i];
    const englishName = readFixedText(reader, 20);
    if (morph) {
      morph.englishName = englishName;
    }
  }
  for (let i = 0; i < boneDisplayNameCount; i++) {
    const displayFrame = displayFrames[boneDisplayFrameStart + i];
    const englishName = readFixedText(reader, 50);
    if (displayFrame) {
      displayFrame.englishName = englishName;
    }
  }
  return { name, comment };
}
