import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import {
  createMmdBuiltInToonTextureMap,
  createTextureResolver,
  defaultSharedToonTexturePath,
  getDefaultToonGradientMap,
  isMmdDdsTexturePath,
  normalizeMmdTexturePath,
  resolveMappedTexture,
  resolveMmdToonTextureReference
} from "../../../src/three/index.js";
import {
  configureMmdTexture,
  evaluateMmdTextureAlphaRgba,
  evaluateMmdTextureTransparencySamples,
  rotateMmdToonTexture
} from "../../../src/three/textures.js";

describe("MMD texture path utilities", () => {
  it("normalizes Windows separators and leading current-directory segments", () => {
    expect(normalizeMmdTexturePath("textures\\body.bmp")).toBe("textures/body.bmp");
    expect(normalizeMmdTexturePath("./textures\\face.bmp")).toBe("textures/face.bmp");
    expect(normalizeMmdTexturePath(".//textures\\toon\\toon01.bmp")).toBe("textures/toon/toon01.bmp");
  });

  it("detects DDS texture paths case-insensitively", () => {
    expect(isMmdDdsTexturePath("skin.DDS")).toBe(true);
    expect(isMmdDdsTexturePath("skin.dds")).toBe(true);
    expect(isMmdDdsTexturePath("skin.png")).toBe(false);
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
    expect(createMmdBuiltInToonTextureMap("textures/toon")).not.toHaveProperty("toon00.bmp");
    expect(createMmdBuiltInToonTextureMap(new URL("https://example.test/mmd/toon/"))).toMatchObject({
      "toon01.bmp": "https://example.test/mmd/toon/toon01.bmp",
      "toon10.bmp": "https://example.test/mmd/toon/toon10.bmp"
    });
    expect(createMmdBuiltInToonTextureMap(new URL("https://example.test/mmd/toon/"))).not.toHaveProperty(
      "toon00.bmp"
    );
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

  it("creates the default toon gradient map as a singleton white data texture", () => {
    const texture = getDefaultToonGradientMap();
    const secondTexture = getDefaultToonGradientMap();
    const image = texture.image as { data: Uint8Array; width: number; height: number };

    expect(texture).toBe(secondTexture);
    expect(texture).toBeInstanceOf(THREE.DataTexture);
    expect(image.width).toBe(1);
    expect(image.height).toBe(1);
    expect(texture.format).toBe(THREE.RGBAFormat);
    expect(Array.from(image.data)).toEqual([255, 255, 255, 255]);
    expect(texture.name).toBe("mmd-default-toon");
    expect(texture.wrapS).toBe(THREE.ClampToEdgeWrapping);
    expect(texture.wrapT).toBe(THREE.ClampToEdgeWrapping);
  });

  it("configures MMD material textures to repeat for wrapped UVs", () => {
    const texture = new THREE.Texture();

    configureMmdTexture(texture, { invertY: true, noMipmap: true });

    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(texture.wrapS).toBe(THREE.RepeatWrapping);
    expect(texture.wrapT).toBe(THREE.RepeatWrapping);
    expect(texture.flipY).toBe(true);
    expect(texture.generateMipmaps).toBe(false);
    expect(texture.userData.mmdTextureInfo).toEqual({ invertY: true, noMipmap: true });
    expect(texture.version).toBeGreaterThan(0);
  });

  it("keeps fully opaque RGBA texture alpha samples opaque", () => {
    const rgba = new Uint8Array([
      255, 255, 255, 255,
      0, 0, 0, 255,
      128, 128, 128, 255,
      255, 0, 0, 255
    ]);

    expect(evaluateMmdTextureAlphaRgba(rgba)).toBe("opaque");
  });

  it("classifies soft transparency ramps as alpha blending", () => {
    const transparency = new Uint8Array([
      3, 4, 5, 6, 7, 8, 10, 12,
      20, 32, 45, 60, 81, 101, 127, 151,
      178, 199, 226, 240, 254, 255
    ]);

    expect(evaluateMmdTextureTransparencySamples(transparency)).toBe("alphaBlend");
  });

  it("rotates non-square CanvasImageSource toon textures without clipping dimensions", () => {
    const originalDocument = globalThis.document;
    const calls: Array<readonly [string, ...number[]]> = [];
    vi.stubGlobal("document", {
      createElement(tagName: string) {
        expect(tagName).toBe("canvas");
        return {
          width: 0,
          height: 0,
          getContext(kind: string) {
            expect(kind).toBe("2d");
            return {
              clearRect: (...args: number[]) => calls.push(["clearRect", ...args]),
              translate: (...args: number[]) => calls.push(["translate", ...args]),
              rotate: (...args: number[]) => calls.push(["rotate", ...args]),
              drawImage: () => calls.push(["drawImage"]),
              getImageData: (_x: number, _y: number, width: number, height: number) => ({
                data: new Uint8ClampedArray(width * height * 4),
                width,
                height
              })
            };
          }
        };
      }
    });
    const texture = new THREE.Texture({
      width: 2,
      height: 4
    } as CanvasImageSource);

    rotateMmdToonTexture(texture);

    expect(texture.image).toMatchObject({ width: 4, height: 2 });
    expect(calls).toContainEqual(["clearRect", 0, 0, 4, 2]);
    expect(texture.userData.mmdToonTextureRotated).toBe(true);
    vi.stubGlobal("document", originalDocument);
  });
});
