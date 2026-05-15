import { describe, expect, it } from "vitest";

import { parsePmdMetadata } from "../../../src/parser/index.js";
import { parsePmdSectionInventory } from "../../../src/parser/pmd/index.js";

describe("parsePmdMetadata", () => {
  it("parses PMD header, Shift-JIS metadata, and empty section counts", () => {
    const metadata = parsePmdMetadata(
      createPmdMetadataFixture({
        name: "Test model",
        comment: "Comment"
      })
    );

    expect(metadata).toMatchObject({
      format: "pmd",
      header: {
        signature: "Pmd"
      },
      encoding: "shift-jis",
      name: "Test model",
      englishName: "",
      comment: "Comment",
      englishComment: "",
      counts: {
        vertices: 0,
        faces: 0,
        materials: 0,
        bones: 0,
        iks: 0,
        morphs: 0,
        displayFrames: 0,
        rigidBodies: 0,
        joints: 0,
        softBodies: 0
      },
      trailingBytes: 0
    });
    expect(metadata.header.version).toBeCloseTo(1);
  });

  it("decodes PMD Shift-JIS metadata and English metadata blocks", () => {
    const metadata = parsePmdMetadata(
      createPmdMetadataFixture({
        name: "テスト",
        comment: "コメント",
        englishName: "Test",
        englishComment: "English comment",
        hasEnglish: true
      })
    );

    expect(metadata.name).toBe("テスト");
    expect(metadata.comment).toBe("コメント");
    expect(metadata.englishName).toBe("Test");
    expect(metadata.englishComment).toBe("English comment");
  });

  it("skips fixed and counted payloads to expose major PMD section counts", () => {
    const metadata = parsePmdMetadata(
      createPmdMetadataFixture({
        counts: {
          vertices: 2,
          vertexIndices: 6,
          materials: 1,
          bones: 2,
          iks: 1,
          morphs: 2,
          morphDisplayFrames: 1,
          boneDisplayNames: 1,
          boneDisplayEntries: 1,
          rigidBodies: 1,
          joints: 1
        },
        ikLinkCounts: [2],
        morphVertexCounts: [1, 2],
        includeToonTextures: true
      })
    );

    expect(metadata.counts).toEqual({
      vertices: 2,
      faces: 2,
      materials: 1,
      bones: 2,
      iks: 1,
      morphs: 2,
      displayFrames: 2,
      rigidBodies: 1,
      joints: 1,
      softBodies: 0
    });
    expect(metadata.trailingBytes).toBe(0);
  });

  it("exposes renderer-neutral section inventory ranges for skipped PMD payloads", () => {
    const inventory = parsePmdSectionInventory(
      createPmdMetadataFixture({
        counts: {
          vertices: 1,
          vertexIndices: 3,
          materials: 2,
          bones: 1,
          iks: 1,
          morphs: 1,
          morphDisplayFrames: 1,
          boneDisplayNames: 1,
          boneDisplayEntries: 1,
          rigidBodies: 1,
          joints: 1
        },
        ikLinkCounts: [3],
        morphVertexCounts: [2],
        includeToonTextures: true
      })
    );

    expect(inventory.counts).toMatchObject({
      vertices: 1,
      faces: 1,
      materials: 2,
      bones: 1,
      iks: 1,
      morphs: 1,
      rigidBodies: 1,
      joints: 1
    });
    expect(inventory.sections.map((section) => section.name)).toEqual([
      "vertices",
      "vertexIndices",
      "materials",
      "bones",
      "iks",
      "morphs",
      "morphDisplayFrames",
      "boneDisplayNames",
      "boneDisplayFrames",
      "toonTextures",
      "rigidBodies",
      "joints"
    ]);
    expect(inventory.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "materials", count: 2, byteLength: 140 }),
        expect.objectContaining({ name: "bones", count: 1, byteLength: 39 }),
        expect.objectContaining({ name: "iks", count: 1, byteLength: 17 }),
        expect.objectContaining({ name: "rigidBodies", count: 1, byteLength: 83 })
      ])
    );
    for (const section of inventory.sections) {
      expect(section.offset).toBeGreaterThanOrEqual(0);
      expect(section.byteLength).toBeGreaterThan(0);
    }
    expect(inventory.trailingBytes).toBe(0);
  });

  it("rejects invalid PMD signatures", () => {
    expect(() => parsePmdMetadata(new Uint8Array([0, 1, 2]))).toThrow("Invalid PMD signature");
  });

  it("rejects truncated required section counts", () => {
    const truncated = createPmdMetadataFixture({}).slice(0, 286);

    expect(() => parsePmdMetadata(truncated)).toThrow("Unexpected end of buffer");
  });

  it("rejects truncated counted payloads instead of treating broken input as valid", () => {
    const truncated = createPmdMetadataFixture({
      counts: {
        vertices: 1
      }
    }).slice(0, -1);

    expect(() => parsePmdMetadata(truncated)).toThrow("Unexpected end of buffer");
  });

  it("rejects PMD vertex index counts that cannot form complete faces", () => {
    expect(() =>
      parsePmdMetadata(
        createPmdMetadataFixture({
          counts: {
            vertexIndices: 4
          }
        })
      )
    ).toThrow("PMD vertex index count must be divisible by 3: 4");
  });

  it("keeps IK and morph inventory counts at section count granularity", () => {
    const inventory = parsePmdSectionInventory(
      createPmdMetadataFixture({
        counts: {
          iks: 2,
          morphs: 2
        },
        ikLinkCounts: [1, 3],
        morphVertexCounts: [2, 4]
      })
    );

    expect(inventory.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "iks", count: 2 }),
        expect.objectContaining({ name: "morphs", count: 2 })
      ])
    );
  });

  it("rejects a truncated optional toon texture block that is not a valid physics tail", () => {
    const fixture = createPmdMetadataFixture({});
    const withoutPhysicsTail = fixture.slice(0, -8);
    const truncatedToon = new Uint8Array([...withoutPhysicsTail, ...new Uint8Array(999)]);

    expect(() => parsePmdSectionInventory(truncatedToon)).toThrow(
      "Unexpected end of buffer in PMD toon texture block"
    );
  });

  it.each([
    ["material", "materials", { counts: { materials: 1 } }],
    ["bone", "bones", { counts: { bones: 1 } }],
    ["IK", "iks", { counts: { iks: 1 }, ikLinkCounts: [2] }],
    ["rigid body", "rigidBodies", { counts: { rigidBodies: 1 }, includeToonTextures: true }]
  ] as const)("rejects truncated %s payloads", (_label, sectionName, options) => {
    const fixture = createPmdMetadataFixture(options);
    const truncated = truncateInsideSection(fixture, sectionName);

    expect(() => parsePmdSectionInventory(truncated)).toThrow("Unexpected end of buffer");
  });

  it("rejects invalid English block flags", () => {
    expect(() =>
      parsePmdMetadata(
        createPmdMetadataFixture({
          englishFlagOverride: 2
        })
      )
    ).toThrow("Invalid PMD English block flag: 2");
  });
});

interface PmdMetadataFixtureOptions {
  name?: string;
  comment?: string;
  englishName?: string;
  englishComment?: string;
  hasEnglish?: boolean;
  englishFlagOverride?: number;
  includeToonTextures?: boolean;
  counts?: Partial<{
    vertices: number;
    vertexIndices: number;
    materials: number;
    bones: number;
    iks: number;
    morphs: number;
    morphDisplayFrames: number;
    boneDisplayNames: number;
    boneDisplayEntries: number;
    rigidBodies: number;
    joints: number;
  }>;
  ikLinkCounts?: number[];
  morphVertexCounts?: number[];
}

function createPmdMetadataFixture(options: PmdMetadataFixtureOptions): Uint8Array {
  const bytes: number[] = [];
  const asciiEncoder = new TextEncoder();
  const u8 = (value: number) => bytes.push(value & 0xff);
  const u16 = (value: number) => {
    const buffer = new ArrayBuffer(2);
    new DataView(buffer).setUint16(0, value, true);
    bytes.push(...new Uint8Array(buffer));
  };
  const u32 = (value: number) => {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setUint32(0, value, true);
    bytes.push(...new Uint8Array(buffer));
  };
  const f32 = (value: number) => {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setFloat32(0, value, true);
    bytes.push(...new Uint8Array(buffer));
  };
  const fixedText = (value: string, byteLength: number) => {
    const encoded = encodeFixtureText(value).slice(0, byteLength);
    bytes.push(...encoded);
    bytes.push(...Array.from({ length: byteLength - encoded.byteLength }, () => 0));
  };
  const zeros = (byteLength: number) => {
    bytes.push(...Array.from({ length: byteLength }, () => 0));
  };
  const count = (key: keyof NonNullable<PmdMetadataFixtureOptions["counts"]>) =>
    options.counts?.[key] ?? 0;

  bytes.push(...asciiEncoder.encode("Pmd"));
  f32(1);
  fixedText(options.name ?? "", 20);
  fixedText(options.comment ?? "", 256);

  u32(count("vertices"));
  zeros(count("vertices") * 38);
  u32(count("vertexIndices"));
  zeros(count("vertexIndices") * 2);
  u32(count("materials"));
  zeros(count("materials") * 70);
  u16(count("bones"));
  zeros(count("bones") * 39);

  u16(count("iks"));
  for (let i = 0; i < count("iks"); i++) {
    zeros(4);
    const linkCount = options.ikLinkCounts?.[i] ?? 0;
    u8(linkCount);
    zeros(6 + linkCount * 2);
  }

  u16(count("morphs"));
  for (let i = 0; i < count("morphs"); i++) {
    zeros(20);
    const vertexCount = options.morphVertexCounts?.[i] ?? 0;
    u32(vertexCount);
    u8(0);
    zeros(vertexCount * 16);
  }

  u8(count("morphDisplayFrames"));
  zeros(count("morphDisplayFrames") * 2);
  u8(count("boneDisplayNames"));
  zeros(count("boneDisplayNames") * 50);
  u32(count("boneDisplayEntries"));
  zeros(count("boneDisplayEntries") * 3);

  const englishFlag = options.englishFlagOverride ?? (options.hasEnglish === true ? 1 : 0);
  u8(englishFlag);
  if (englishFlag === 1) {
    fixedText(options.englishName ?? "", 20);
    fixedText(options.englishComment ?? "", 256);
    zeros(count("bones") * 20);
    zeros(Math.max(0, count("morphs") - 1) * 20);
    zeros(count("boneDisplayNames") * 50);
  }

  if (options.includeToonTextures === true) {
    zeros(1000);
  }

  u32(count("rigidBodies"));
  zeros(count("rigidBodies") * 83);
  u32(count("joints"));
  zeros(count("joints") * 124);

  return new Uint8Array(bytes);
}

function encodeFixtureText(value: string): Uint8Array {
  switch (value) {
    case "テスト":
      return new Uint8Array([0x83, 0x65, 0x83, 0x58, 0x83, 0x67]);
    case "コメント":
      return new Uint8Array([0x83, 0x52, 0x83, 0x81, 0x83, 0x93, 0x83, 0x67]);
    default:
      return new TextEncoder().encode(value);
  }
}

function truncateInsideSection(fixture: Uint8Array, sectionName: string): Uint8Array {
  const section = parsePmdSectionInventory(fixture).sections.find(
    (candidate) => candidate.name === sectionName
  );
  if (section === undefined) {
    throw new Error(`Missing PMD section in fixture: ${sectionName}`);
  }
  return fixture.slice(0, section.offset + section.byteLength - 1);
}
