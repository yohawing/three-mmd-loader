export type MmdModelFormat = "pmx" | "pmd";

export function detectModelFormat(bytes: Uint8Array): MmdModelFormat {
  if (bytes.length < 4) {
    throw new Error("Unable to detect MMD model format");
  }

  if (bytes[0] === 0x50 && bytes[1] === 0x4d && bytes[2] === 0x58 && bytes[3] === 0x20) {
    return "pmx";
  }

  if (bytes[0] === 0x50 && bytes[1] === 0x6d && bytes[2] === 0x64) {
    return "pmd";
  }

  throw new Error("Unable to detect MMD model format");
}
