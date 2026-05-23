import { describe, expect, it } from "vitest";

import {
  createMmdTextureMapFromFiles,
  findMmdModelFiles,
  findMmdMotionFiles,
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
});

function file(name: string, webkitRelativePath = name): File {
  const value = new File([""], name);
  Object.defineProperty(value, "webkitRelativePath", {
    configurable: true,
    value: webkitRelativePath
  });
  return value;
}
