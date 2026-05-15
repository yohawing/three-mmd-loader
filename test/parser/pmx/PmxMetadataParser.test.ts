import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { parsePmxMetadata } from "../../../src/parser/index.js";
import { parsePmxSectionInventory } from "../../../src/parser/pmx/index.js";

const unitPmxInventoryFixtures = [
  "joint_orient_test.pmx",
  "test_1bone_cube.pmx",
  "test_append_bone.pmx",
  "test_basic_bone.pmx",
  "test_fix_axis.pmx",
  "test_given_bone_comprehensive.pmx",
  "test_semi_basic_bone.pmx"
] as const;

const pmx20SectionNames = [
  "vertices",
  "faces",
  "textures",
  "materials",
  "bones",
  "morphs",
  "displayFrames",
  "rigidBodies",
  "joints"
] as const;

const pmx21SectionNames = [...pmx20SectionNames, "softBodies"] as const;

describe("parsePmxMetadata", () => {
  it("parses PMX header, UTF-8 metadata, and empty section counts", () => {
    const metadata = parsePmxMetadata(
      createPmxMetadataFixture({
        encoding: "utf-8",
        version: 2.1,
        additionalUvCount: 2,
        name: "Test model",
        englishName: "Test model EN",
        comment: "Comment",
        englishComment: "Comment EN",
        includeSoftBodyCount: true
      })
    );

    expect(metadata).toMatchObject({
      format: "pmx",
      header: {
        encoding: "utf-8",
        additionalUvCount: 2,
        indexSizes: {
          vertex: 1,
          texture: 2,
          material: 1,
          bone: 4,
          morph: 1,
          rigidBody: 2
        }
      },
      name: "Test model",
      englishName: "Test model EN",
      comment: "Comment",
      englishComment: "Comment EN",
      counts: {
        vertices: 0,
        faces: 0,
        textures: 0,
        materials: 0,
        bones: 0,
        morphs: 0,
        displayFrames: 0,
        rigidBodies: 0,
        joints: 0,
        softBodies: 0
      },
      trailingBytes: 0
    });
    expect(metadata.header.version).toBeCloseTo(2.1);
  });

  it("decodes PMX UTF-16LE metadata text", () => {
    const metadata = parsePmxMetadata(
      createPmxMetadataFixture({
        encoding: "utf-16-le",
        name: "テスト用モデル",
        englishName: "TestModel",
        comment: "コメント",
        englishComment: "Comment"
      })
    );

    expect(metadata.header.encoding).toBe("utf-16-le");
    expect(metadata.name).toBe("テスト用モデル");
    expect(metadata.englishName).toBe("TestModel");
    expect(metadata.comment).toBe("コメント");
    expect(metadata.englishComment).toBe("Comment");
  });

  it("rejects invalid PMX signatures and header encodings", () => {
    expect(() => parsePmxMetadata(new Uint8Array([0, 1, 2, 3]))).toThrow("Invalid PMX signature");
    expect(() =>
      parsePmxMetadata(
        createPmxMetadataFixture({
          encoding: "utf-8",
          encodingByteOverride: 2
        })
      )
    ).toThrow("Unsupported PMX text encoding byte: 2");
  });

  it("rejects PMX metadata when required section counts are truncated", () => {
    const truncated = createPmxMetadataFixture({ encoding: "utf-8" }).slice(0, -4);

    expect(() => parsePmxMetadata(truncated)).toThrow("Unexpected end of buffer");
  });

  it("rejects PMX 2.1 metadata when the required soft body count is truncated", () => {
    expect(() =>
      parsePmxMetadata(
        createPmxMetadataFixture({
          encoding: "utf-8",
          version: 2.1,
          includeSoftBodyCount: false
        })
      )
    ).toThrow("Unexpected end of buffer");
  });

  it("rejects PMX vertex index counts that cannot form complete faces", () => {
    expect(() =>
      parsePmxMetadata(
        createPmxMetadataFixture({
          encoding: "utf-8",
          counts: {
            vertexIndices: 4
          }
        })
      )
    ).toThrow("PMX vertex index count must be divisible by 3: 4");
  });

  it("reads inventory ranges from an empty PMX fixture", () => {
    const inventory = parsePmxSectionInventory(
      createPmxMetadataFixture({
        encoding: "utf-8",
        version: 2.1,
        includeSoftBodyCount: true
      })
    );

    expect(inventory.format).toBe("pmx");
    expect(inventory.header.encoding).toBe("utf-8");
    expect(inventory.header.version).toBeCloseTo(2.1);
    expect(inventory.counts).toEqual({
      vertices: 0,
      faces: 0,
      textures: 0,
      materials: 0,
      bones: 0,
      morphs: 0,
      displayFrames: 0,
      rigidBodies: 0,
      joints: 0,
      softBodies: 0
    });
    expect(inventory.sections.map((section) => section.name)).toEqual(pmx21SectionNames);
    expect(inventory.sections.every((section) => section.count === 0)).toBe(true);
    expect(inventory.sections.every((section) => section.byteLength === 0)).toBe(true);
    assertOrderedInventoryRanges(inventory.sections);
    expect(inventory.trailingBytes).toBe(0);
  });

  it("reads metadata and section counts from a non-empty PMX fixture", async () => {
    const bytes = await readFile(resolve("..", "data/unittest/test_1bone_cube.pmx"));
    const metadata = parsePmxMetadata(bytes);

    expect(metadata).toMatchObject({
      format: "pmx",
      header: {
        encoding: "utf-16-le",
        additionalUvCount: 0,
        indexSizes: {
          vertex: 1,
          texture: 1,
          material: 1,
          bone: 1,
          morph: 1,
          rigidBody: 1
        }
      },
      name: "テスト用モデル",
      englishName: "TestModel",
      counts: {
        vertices: 14,
        faces: 12,
        textures: 0,
        materials: 1,
        bones: 1,
        morphs: 0,
        displayFrames: 2,
        rigidBodies: 0,
        joints: 0,
        softBodies: 0
      },
      trailingBytes: 0
    });
    expect(metadata.header.version).toBeCloseTo(2.0);
  });

  it("reads inventory ranges from a non-empty minimal PMX fixture", () => {
    const inventory = parsePmxSectionInventory(
      createPmxMetadataFixture({
        encoding: "utf-8",
        version: 2.1,
        includeSoftBodyCount: true,
        counts: {
          vertices: 1,
          vertexIndices: 3,
          textures: 1
        },
        textureNames: ["toon/default.png"]
      })
    );

    expect(inventory.format).toBe("pmx");
    expect(inventory.counts).toMatchObject({
      vertices: 1,
      faces: 1,
      textures: 1,
      materials: 0,
      bones: 0,
      morphs: 0,
      displayFrames: 0,
      rigidBodies: 0,
      joints: 0,
      softBodies: 0
    });
    expect(inventory.sections.map((section) => section.name)).toEqual(pmx21SectionNames);
    expect(inventory.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "vertices", count: 1, byteLength: 41 }),
        expect.objectContaining({ name: "faces", count: 1, byteLength: 3 }),
        expect.objectContaining({ name: "textures", count: 1, byteLength: 20 }),
        expect.objectContaining({ name: "materials", count: 0, byteLength: 0 })
      ])
    );
    assertOrderedInventoryRanges(inventory.sections);
    expect(inventory.trailingBytes).toBe(0);
  });

  it("reads inventory ranges from existing PMX unit fixtures", async () => {
    const bytes = await readFile(resolve("..", "data/unittest/test_1bone_cube.pmx"));
    const inventory = parsePmxSectionInventory(bytes);

    expect(inventory.counts).toMatchObject({
      vertices: 14,
      faces: 12,
      materials: 1,
      bones: 1,
      displayFrames: 2
    });
    expect(inventory.sections.map((section) => section.name)).toEqual(pmx20SectionNames);
    expect(inventory.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "vertices", count: 14 }),
        expect.objectContaining({ name: "faces", count: 12, byteLength: 36 }),
        expect.objectContaining({ name: "materials", count: 1 }),
        expect.objectContaining({ name: "bones", count: 1 })
      ])
    );
    assertOrderedInventoryRanges(inventory.sections);
    expect(inventory.trailingBytes).toBe(0);
  });

  it("reads inventory from existing unit PMX fixtures", async () => {
    for (const fixtureName of unitPmxInventoryFixtures) {
      const bytes = await readFile(resolve("..", "data/unittest", fixtureName));
      let inventory;
      try {
        inventory = parsePmxSectionInventory(bytes);
      } catch (error) {
        throw new Error(
          `Failed to parse PMX inventory fixture ${fixtureName}: ${(error as Error).message}`
        );
      }

      expect(inventory.format).toBe("pmx");
      expect(inventory.counts.vertices).toBeGreaterThanOrEqual(0);
      expect(inventory.counts.faces).toBeGreaterThanOrEqual(0);
      expect(inventory.counts.textures).toBeGreaterThanOrEqual(0);
      expect(inventory.sections.map((section) => section.name)).toEqual(pmx20SectionNames);
      assertOrderedInventoryRanges(inventory.sections);
      expect(inventory.trailingBytes).toBe(0);
    }
  });
});

function assertOrderedInventoryRanges(
  sections: ReadonlyArray<{ offset: number; byteLength: number }>
): void {
  for (let i = 0; i < sections.length; i++) {
    expect(sections[i].offset).toBeGreaterThanOrEqual(0);
    expect(sections[i].byteLength).toBeGreaterThanOrEqual(0);
    if (i > 0) {
      expect(sections[i].offset).toBeGreaterThanOrEqual(
        sections[i - 1].offset + sections[i - 1].byteLength
      );
    }
  }
}

type PmxFixtureEncoding = "utf-16-le" | "utf-8";

interface PmxMetadataFixtureOptions {
  version?: number;
  encoding: PmxFixtureEncoding;
  encodingByteOverride?: number;
  additionalUvCount?: number;
  name?: string;
  englishName?: string;
  comment?: string;
  englishComment?: string;
  includeSoftBodyCount?: boolean;
  textureNames?: string[];
  counts?: Partial<{
    vertices: number;
    vertexIndices: number;
    textures: number;
    materials: number;
    bones: number;
    morphs: number;
    displayFrames: number;
    rigidBodies: number;
    joints: number;
    softBodies: number;
  }>;
}

function createPmxMetadataFixture(options: PmxMetadataFixtureOptions): Uint8Array {
  const bytes: number[] = [];
  const utf8Encoder = new TextEncoder();
  const u8 = (value: number) => bytes.push(value & 0xff);
  const i32 = (value: number) => {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setInt32(0, value, true);
    bytes.push(...new Uint8Array(buffer));
  };
  const f32 = (value: number) => {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setFloat32(0, value, true);
    bytes.push(...new Uint8Array(buffer));
  };
  const text = (value: string) => {
    const encoded =
      options.encoding === "utf-16-le" ? encodeUtf16Le(value) : utf8Encoder.encode(value);
    i32(encoded.byteLength);
    bytes.push(...encoded);
  };
  const count = (key: keyof NonNullable<PmxMetadataFixtureOptions["counts"]>) => {
    i32(options.counts?.[key] ?? 0);
  };

  bytes.push(...utf8Encoder.encode("PMX "));
  f32(options.version ?? 2.0);
  u8(8);
  u8(options.encodingByteOverride ?? (options.encoding === "utf-16-le" ? 0 : 1));
  u8(options.additionalUvCount ?? 0);
  u8(1);
  u8(2);
  u8(1);
  u8(4);
  u8(1);
  u8(2);
  text(options.name ?? "");
  text(options.englishName ?? "");
  text(options.comment ?? "");
  text(options.englishComment ?? "");
  count("vertices");
  for (let i = 0; i < (options.counts?.vertices ?? 0); i++) {
    vertex();
  }
  count("vertexIndices");
  zeros((options.counts?.vertexIndices ?? 0) * 1);
  count("textures");
  for (let i = 0; i < (options.counts?.textures ?? 0); i++) {
    text(options.textureNames?.[i] ?? "");
  }
  count("materials");
  count("bones");
  count("morphs");
  count("displayFrames");
  count("rigidBodies");
  count("joints");
  if (options.includeSoftBodyCount === true) {
    count("softBodies");
  }

  return new Uint8Array(bytes);

  function vertex() {
    zeros(12 + 12 + 8 + (options.additionalUvCount ?? 0) * 16);
    u8(0);
    zeros(4);
    zeros(4);
  }

  function zeros(byteLength: number) {
    bytes.push(...Array.from({ length: byteLength }, () => 0));
  }
}

function encodeUtf16Le(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < value.length; i++) {
    view.setUint16(i * 2, value.charCodeAt(i), true);
  }
  return bytes;
}
