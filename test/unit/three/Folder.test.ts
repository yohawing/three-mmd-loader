import { describe, expect, it } from "vitest";

import {
  classifyMmdAssetKind,
  createMmdFileIndex,
  createMmdTextureMapFromFiles,
  findMmdAccessoryFiles,
  findMmdAudioFiles,
  findMmdModelFiles,
  findMmdMotionFiles,
  isMmdAccessoryFile,
  isMmdAudioFile,
  isMmdModelFile,
  isMmdMotionFile,
  isMmdTextureFile,
  normalizeMmdRelativePath
} from "../../../src/three/index.js";

describe("MMD folder file utilities", () => {
  it("normalizes relative paths", () => {
    expect(normalizeMmdRelativePath(".\\models\\miku.pmx")).toBe("models/miku.pmx");
    expect(normalizeMmdRelativePath(".//textures\\face.png")).toBe("textures/face.png");
  });

  it("finds model and motion files with path-aware numeric sorting", () => {
    const files = [
      file("motion2.vmd", "pack/motion2.vmd"),
      file("model10.pmx", "pack/model10.pmx"),
      file("readme.txt", "pack/readme.txt"),
      file("model2.pmd", "pack/model2.pmd"),
      file("motion10.vmd", "pack/motion10.vmd")
    ];

    expect(findMmdModelFiles(files).map((item) => item.name)).toEqual(["model2.pmd", "model10.pmx"]);
    expect(findMmdMotionFiles(files).map((item) => item.name)).toEqual([
      "motion2.vmd",
      "motion10.vmd"
    ]);
  });

  it("detects supported texture file extensions", () => {
    expect(isMmdTextureFile(file("toon.bmp"))).toBe(true);
    expect(isMmdTextureFile(file("diffuse.JPG"))).toBe(true);
    expect(isMmdTextureFile(file("normal.tga"))).toBe(true);
    expect(isMmdTextureFile(file("skin.dds"))).toBe(true);
    expect(isMmdTextureFile(file("notes.txt"))).toBe(false);
  });

  it("creates texture map aliases for full path, model-relative path, and file name", () => {
    const modelFile = file("miku.pmx", "models/miku/miku.pmx");
    const face = file("face.png", "models/miku/textures/face.png");
    const sharedToon = file("toon01.bmp", "models/toon/toon01.bmp");
    const map = createMmdTextureMapFromFiles([modelFile, face, sharedToon], modelFile);

    expect(map["models/miku/textures/face.png"]).toBe(face);
    expect(map["textures/face.png"]).toBe(face);
    expect(map["face.png"]).toBe(face);
    expect(map["models/toon/toon01.bmp"]).toBe(sharedToon);
    expect(map["toon01.bmp"]).toBe(sharedToon);
  });

  it("classifies file types with individual predicates", () => {
    expect(isMmdModelFile(file("miku.pmx"))).toBe(true);
    expect(isMmdModelFile(file("old.pmd"))).toBe(true);
    expect(isMmdModelFile(file("dance.vmd"))).toBe(false);

    expect(isMmdMotionFile(file("dance.vmd"))).toBe(true);
    expect(isMmdMotionFile(file("miku.pmx"))).toBe(false);

    expect(isMmdAccessoryFile(file("glasses.x"))).toBe(true);
    expect(isMmdAccessoryFile(file("placement.vac"))).toBe(true);
    expect(isMmdAccessoryFile(file("miku.pmx"))).toBe(false);

    expect(isMmdAudioFile(file("bgm.wav"))).toBe(true);
    expect(isMmdAudioFile(file("face.png"))).toBe(false);
  });

  it("finds accessory and audio files with numeric sorting", () => {
    const files = [
      file("hat2.x", "pack/hat2.x"),
      file("bgm.wav", "pack/bgm.wav"),
      file("hat10.x", "pack/hat10.x"),
      file("glasses.vac", "pack/glasses.vac"),
      file("se.wav", "pack/se.wav"),
      file("readme.txt", "pack/readme.txt")
    ];

    expect(findMmdAccessoryFiles(files).map((f) => f.name)).toEqual([
      "glasses.vac",
      "hat2.x",
      "hat10.x"
    ]);
    expect(findMmdAudioFiles(files).map((f) => f.name)).toEqual(["bgm.wav", "se.wav"]);
  });
});

describe("classifyMmdAssetKind", () => {
  it("classifies file paths by extension", () => {
    expect(classifyMmdAssetKind("model/miku.pmx")).toBe("model");
    expect(classifyMmdAssetKind("model/old.pmd")).toBe("model");
    expect(classifyMmdAssetKind("motion/dance.vmd")).toBe("motion");
    expect(classifyMmdAssetKind("tex/face.png")).toBe("texture");
    expect(classifyMmdAssetKind("tex/toon.bmp")).toBe("texture");
    expect(classifyMmdAssetKind("tex/skin.tga")).toBe("texture");
    expect(classifyMmdAssetKind("tex/normal.dds")).toBe("texture");
    expect(classifyMmdAssetKind("acc/glasses.x")).toBe("accessory");
    expect(classifyMmdAssetKind("acc/place.vac")).toBe("accessory");
    expect(classifyMmdAssetKind("audio/bgm.wav")).toBe("audio");
    expect(classifyMmdAssetKind("readme.txt")).toBeUndefined();
    expect(classifyMmdAssetKind("project.pmm")).toBeUndefined();
  });

  it("is case-insensitive", () => {
    expect(classifyMmdAssetKind("MODEL.PMX")).toBe("model");
    expect(classifyMmdAssetKind("Dance.VMD")).toBe("motion");
    expect(classifyMmdAssetKind("BGM.WAV")).toBe("audio");
  });
});

describe("MmdFileIndex", () => {
  it("categorizes files by asset kind", () => {
    const files = [
      file("miku.pmx", "project/model/miku.pmx"),
      file("dance.vmd", "project/motion/dance.vmd"),
      file("idle.vmd", "project/motion/idle.vmd"),
      file("face.png", "project/model/tex/face.png"),
      file("toon.bmp", "project/model/tex/toon.bmp"),
      file("glasses.x", "project/accessory/glasses.x"),
      file("bgm.wav", "project/audio/bgm.wav"),
      file("readme.txt", "project/readme.txt")
    ];

    const index = createMmdFileIndex(files);

    expect(index.models.map((f) => f.name)).toEqual(["miku.pmx"]);
    expect(index.motions.map((f) => f.name)).toEqual(["dance.vmd", "idle.vmd"]);
    expect(index.textures.map((f) => f.name)).toEqual(["face.png", "toon.bmp"]);
    expect(index.accessories.map((f) => f.name)).toEqual(["glasses.x"]);
    expect(index.audios.map((f) => f.name)).toEqual(["bgm.wav"]);
  });

  it("resolves files by exact normalized path", () => {
    const miku = file("miku.pmx", "project/model/miku.pmx");
    const face = file("face.png", "project/model/tex/face.png");
    const index = createMmdFileIndex([miku, face]);

    expect(index.resolve("project/model/miku.pmx")).toBe(miku);
    expect(index.resolve("project\\model\\tex\\face.png")).toBe(face);
  });

  it("resolves files by filename only", () => {
    const bgm = file("bgm.wav", "project/audio/bgm.wav");
    const index = createMmdFileIndex([bgm]);

    expect(index.resolve("bgm.wav")).toBe(bgm);
  });

  it("resolves files by suffix match for relative paths", () => {
    const miku = file("miku.pmx", "project/model/miku/miku.pmx");
    const face = file("face.png", "project/model/miku/tex/face.png");
    const index = createMmdFileIndex([miku, face]);

    expect(index.resolve("model/miku/miku.pmx")).toBe(miku);
    expect(index.resolve("tex/face.png")).toBe(face);
  });

  it("resolves case-insensitively", () => {
    const miku = file("Miku.PMX", "Project/Model/Miku.PMX");
    const index = createMmdFileIndex([miku]);

    expect(index.resolve("project/model/miku.pmx")).toBe(miku);
    expect(index.resolve("miku.pmx")).toBe(miku);
  });

  it("returns undefined for unresolvable paths", () => {
    const index = createMmdFileIndex([file("miku.pmx", "project/miku.pmx")]);

    expect(index.resolve("nonexistent.pmx")).toBeUndefined();
    expect(index.resolve("other/model.pmx")).toBeUndefined();
  });

  it("sorts categorized lists by path with numeric ordering", () => {
    const files = [
      file("model10.pmx", "pack/model10.pmx"),
      file("model2.pmx", "pack/model2.pmx"),
      file("motion10.vmd", "pack/motion10.vmd"),
      file("motion2.vmd", "pack/motion2.vmd")
    ];

    const index = createMmdFileIndex(files);

    expect(index.models.map((f) => f.name)).toEqual(["model2.pmx", "model10.pmx"]);
    expect(index.motions.map((f) => f.name)).toEqual(["motion2.vmd", "motion10.vmd"]);
  });
});

function file(name: string, webkitRelativePath = name): File {
  const value = new File([""], name);
  Object.defineProperty(value, "webkitRelativePath", {
    configurable: true,
    value: webkitRelativePath
  });
  return value;
}
