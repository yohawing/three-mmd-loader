import { describe, expect, it } from "vitest";

import {
  createMmdBuiltInToonTextureMap,
  createTextureResolver,
  defaultSharedToonTexturePath,
  isBuiltInToonTexturePath,
  normalizeMmdTexturePath,
  resolveMappedTexture,
  resolveMmdToonTextureReference
} from "../../../src/three/index.js";

describe("MMD texture path utilities", () => {
  it("normalizes Windows separators and leading current-directory segments", () => {
    expect(normalizeMmdTexturePath("textures\\body.bmp")).toBe("textures/body.bmp");
    expect(normalizeMmdTexturePath("./textures\\face.bmp")).toBe("textures/face.bmp");
    expect(normalizeMmdTexturePath(".//textures\\toon\\toon01.bmp")).toBe("textures/toon/toon01.bmp");
  });

  it("resolves texture maps with normalized case-insensitive paths", () => {
    const textureMap = {
      "Textures/Body.BMP": "mapped-body",
      "./toon/toon01.bmp": new URL("https://example.test/toon01.png")
    };

    expect(resolveMappedTexture("textures\\body.bmp", textureMap)).toBe("mapped-body");
    expect(resolveMappedTexture("toon\\TOON01.BMP", textureMap)).toEqual(
      new URL("https://example.test/toon01.png")
    );
    expect(resolveMappedTexture("missing.bmp", textureMap)).toBeUndefined();
  });

  it("creates a resolver that prefers explicit maps before custom and adjacent fallbacks", async () => {
    const resolver = createTextureResolver(
      {
        async resolve(path) {
          return path === "custom.bmp" ? "custom-resolved" : undefined;
        }
      },
      {
        "mapped.bmp": "map-resolved"
      }
    );

    await expect(resolver?.resolve("mapped.bmp", "models/model.pmx")).resolves.toBe("map-resolved");
    await expect(resolver?.resolve("custom.bmp", "models/model.pmx")).resolves.toBe("custom-resolved");
    await expect(resolver?.resolve("textures\\face.bmp", "models/character/model.pmx")).resolves.toBe(
      "models/character/textures/face.bmp"
    );
    await expect(
      resolver?.resolve("textures\\face.bmp", "https://example.test/models/character/model.pmx")
    ).resolves.toBe("https://example.test/models/character/textures/face.bmp");
    expect(createTextureResolver()).toBeUndefined();
  });

  it("generates shared toon texture paths and built-in toon maps", () => {
    expect(defaultSharedToonTexturePath(undefined)).toBe("");
    expect(defaultSharedToonTexturePath(0)).toBe("toon01.bmp");
    expect(defaultSharedToonTexturePath(9)).toBe("toon10.bmp");

    expect(createMmdBuiltInToonTextureMap("textures/toon")).toMatchObject({
      "toon01.bmp": "textures/toon/toon01.bmp",
      "toon10.bmp": "textures/toon/toon10.bmp"
    });
    expect(createMmdBuiltInToonTextureMap(new URL("https://example.test/mmd/toon/"))).toMatchObject({
      "toon01.bmp": "https://example.test/mmd/toon/toon01.bmp",
      "toon10.bmp": "https://example.test/mmd/toon/toon10.bmp"
    });
  });

  it("detects built-in toon paths after separator normalization", () => {
    expect(isBuiltInToonTexturePath("toon01.bmp")).toBe(true);
    expect(isBuiltInToonTexturePath(".\\TOON10.BMP")).toBe(true);
    expect(isBuiltInToonTexturePath("toon00.bmp")).toBe(false);
    expect(isBuiltInToonTexturePath("toon11.bmp")).toBe(false);
    expect(isBuiltInToonTexturePath("textures/toon01.bmp")).toBe(false);
  });

  it("resolves explicit and shared toon references without renderer dependencies", () => {
    expect(
      resolveMmdToonTextureReference({
        toonTexturePath: "custom/toon.bmp",
        toonTextureInfo: { index: 1 },
        sharedToonIndex: 0
      })
    ).toEqual({
      path: "custom/toon.bmp",
      textureInfo: { index: 1 },
      shared: false
    });

    expect(resolveMmdToonTextureReference({ sharedToonIndex: 2 })).toEqual({
      path: "toon03.bmp",
      textureInfo: undefined,
      shared: true
    });

    expect(resolveMmdToonTextureReference({})).toEqual({
      path: "",
      textureInfo: undefined,
      shared: false
    });
  });
});
