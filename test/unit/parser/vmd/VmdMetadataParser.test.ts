import { describe, expect, it } from "vitest";

import { parseVmdMetadata } from "../../../../src/parser/index.js";
import { parseVmdSectionInventory } from "../../../../src/parser/vmd/index.js";

describe("parseVmdMetadata", () => {
  it("parses VMD signature, model name, section counts, and fixed-size payloads", () => {
    const metadata = parseVmdMetadata(
      createVmdMetadataFixture({
        signature: "Vocaloid Motion Data 0002",
        modelName: "Test model",
        counts: {
          bones: 2,
          morphs: 3,
          cameras: 1,
          lights: 1,
          selfShadows: 2,
          properties: 2
        },
        propertyIkCounts: [0, 2]
      })
    );

    expect(metadata).toEqual({
      format: "vmd",
      signature: "Vocaloid Motion Data 0002",
      encoding: "shift-jis",
      modelName: "Test model",
      counts: {
        bones: 2,
        morphs: 3,
        cameras: 1,
        lights: 1,
        selfShadows: 2,
        properties: 2
      },
      trailingBytes: 0
    });
  });

  it("treats self-shadow and property sections as absent only when no bytes remain", () => {
    const metadata = parseVmdMetadata(
      createVmdMetadataFixture({
        counts: {
          bones: 0,
          morphs: 0,
          cameras: 0,
          lights: 0
        },
        includeSelfShadowCount: false,
        includePropertyCount: false
      })
    );

    expect(metadata.counts.selfShadows).toBe(0);
    expect(metadata.counts.properties).toBe(0);
    expect(metadata.trailingBytes).toBe(0);
  });

  it("rejects invalid VMD signatures", () => {
    expect(() =>
      parseVmdMetadata(
        createVmdMetadataFixture({
          signature: "not a vmd file"
        })
      )
    ).toThrow("Invalid VMD signature");
  });

  it("rejects truncated counted frame payloads", () => {
    const truncated = createVmdMetadataFixture({
      counts: {
        bones: 1,
        morphs: 0,
        cameras: 0,
        lights: 0
      }
    }).slice(0, -1);

    expect(() => parseVmdMetadata(truncated)).toThrow("Unexpected end of buffer");
  });

  it("rejects partial optional section counts instead of treating broken input as valid", () => {
    const bytes = createVmdMetadataFixture({
      counts: {
        bones: 0,
        morphs: 0,
        cameras: 0,
        lights: 0
      },
      includeSelfShadowCount: false,
      includePropertyCount: false
    });
    const broken = new Uint8Array([...bytes, 1, 2, 3]);

    expect(() => parseVmdMetadata(broken)).toThrow("Unexpected end of buffer");
  });

  it.each([
    ["bone", 50],
    ["morph", 54],
    ["camera", 58],
    ["light", 62]
  ])("rejects truncated required %s section counts at the count offset", (_name, countOffset) => {
    const bytes = createVmdMetadataFixture({
      counts: {
        bones: 0,
        morphs: 0,
        cameras: 0,
        lights: 0
      }
    });
    const broken = bytes.slice(0, countOffset + 3);

    expect(() => parseVmdMetadata(broken)).toThrow(
      `Unexpected end of buffer at ${countOffset}; need 4 bytes`
    );
  });

  it("rejects truncated property IK counts inside property payloads", () => {
    const bytes = createVmdMetadataFixture({
      counts: {
        bones: 0,
        morphs: 0,
        cameras: 0,
        lights: 0,
        selfShadows: 0,
        properties: 1
      },
      propertyIkCounts: [1]
    });
    const broken = bytes.slice(0, 82);

    expect(() => parseVmdMetadata(broken)).toThrow("Unexpected end of buffer at 79; need 4 bytes");
  });

  it("rejects unreasonable VMD frame counts", () => {
    const bytes: number[] = [];
    const u32 = (value: number) => {
      const buffer = new ArrayBuffer(4);
      new DataView(buffer).setUint32(0, value, true);
      bytes.push(...new Uint8Array(buffer));
    };

    pushFixedText(bytes, "Vocaloid Motion Data 0002", 30);
    pushFixedText(bytes, "", 20);
    u32(10_000_001);

    expect(() => parseVmdMetadata(new Uint8Array(bytes))).toThrow(
      "Invalid VMD bone count: 10000001"
    );
  });
});

describe("parseVmdSectionInventory", () => {
  it.each([
    [
      "bone",
      { bones: 2 },
      { name: "bone", count: 2, countOffset: 50, dataOffset: 54, byteLength: 222 }
    ],
    [
      "morph",
      { morphs: 2 },
      { name: "morph", count: 2, countOffset: 54, dataOffset: 58, byteLength: 46 }
    ],
    [
      "camera",
      { cameras: 2 },
      { name: "camera", count: 2, countOffset: 58, dataOffset: 62, byteLength: 122 }
    ],
    [
      "light",
      { lights: 2 },
      { name: "light", count: 2, countOffset: 62, dataOffset: 66, byteLength: 56 }
    ]
  ] as const)("reports %s section inventory independently", (_name, counts, expectedSection) => {
    const inventory = parseVmdSectionInventory(
      createVmdMetadataFixture({
        counts,
        includeSelfShadowCount: false,
        includePropertyCount: false
      })
    );

    expect(inventory.sections).toContainEqual(expectedSection);
    expect(inventory.sections.map((section) => section.name)).toEqual([
      "bone",
      "morph",
      "camera",
      "light"
    ]);
    expect(inventory.trailingBytes).toBe(0);
  });

  it("reports property section inventory independently", () => {
    const inventory = parseVmdSectionInventory(
      createVmdMetadataFixture({
        counts: {
          bones: 0,
          morphs: 0,
          cameras: 0,
          lights: 0,
          selfShadows: 0,
          properties: 2
        },
        propertyIkCounts: [0, 2]
      })
    );

    expect(inventory.sections).toContainEqual({
      name: "property",
      count: 2,
      countOffset: 70,
      dataOffset: 74,
      byteLength: 60
    });
    expect(inventory.counts.properties).toBe(2);
    expect(inventory.trailingBytes).toBe(0);
  });

  it("reports section count offsets, data offsets, and byte lengths", () => {
    const inventory = parseVmdSectionInventory(
      createVmdMetadataFixture({
        counts: {
          bones: 1,
          morphs: 2,
          cameras: 0,
          lights: 1,
          selfShadows: 1,
          properties: 2
        },
        propertyIkCounts: [0, 2]
      })
    );

    expect(inventory.sections).toEqual([
      { name: "bone", count: 1, countOffset: 50, dataOffset: 54, byteLength: 111 },
      { name: "morph", count: 2, countOffset: 165, dataOffset: 169, byteLength: 46 },
      { name: "camera", count: 0, countOffset: 215, dataOffset: 219, byteLength: 0 },
      { name: "light", count: 1, countOffset: 219, dataOffset: 223, byteLength: 28 },
      { name: "selfShadow", count: 1, countOffset: 251, dataOffset: 255, byteLength: 9 },
      { name: "property", count: 2, countOffset: 264, dataOffset: 268, byteLength: 60 }
    ]);
    expect(inventory.counts).toEqual({
      bones: 1,
      morphs: 2,
      cameras: 0,
      lights: 1,
      selfShadows: 1,
      properties: 2
    });
    expect(inventory.trailingBytes).toBe(0);
  });

  it("omits optional section records only when their count fields are absent", () => {
    const inventory = parseVmdSectionInventory(
      createVmdMetadataFixture({
        counts: {
          bones: 0,
          morphs: 0,
          cameras: 0,
          lights: 0
        },
        includeSelfShadowCount: false,
        includePropertyCount: false
      })
    );

    expect(inventory.sections.map((section) => section.name)).toEqual([
      "bone",
      "morph",
      "camera",
      "light"
    ]);
    expect(inventory.counts.selfShadows).toBe(0);
    expect(inventory.counts.properties).toBe(0);
  });
});

interface VmdMetadataFixtureOptions {
  signature?: string;
  modelName?: string;
  includeSelfShadowCount?: boolean;
  includePropertyCount?: boolean;
  counts?: Partial<{
    bones: number;
    morphs: number;
    cameras: number;
    lights: number;
    selfShadows: number;
    properties: number;
  }>;
  propertyIkCounts?: number[];
}

function createVmdMetadataFixture(options: VmdMetadataFixtureOptions): Uint8Array {
  const bytes: number[] = [];
  const u32 = (value: number) => {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setUint32(0, value, true);
    bytes.push(...new Uint8Array(buffer));
  };
  const zeros = (byteLength: number) => {
    bytes.push(...Array.from({ length: byteLength }, () => 0));
  };
  const count = (key: keyof NonNullable<VmdMetadataFixtureOptions["counts"]>) =>
    options.counts?.[key] ?? 0;

  pushFixedText(bytes, options.signature ?? "Vocaloid Motion Data 0002", 30);
  pushFixedText(bytes, options.modelName ?? "", 20);

  u32(count("bones"));
  zeros(count("bones") * 111);
  u32(count("morphs"));
  zeros(count("morphs") * 23);
  u32(count("cameras"));
  zeros(count("cameras") * 61);
  u32(count("lights"));
  zeros(count("lights") * 28);

  if (options.includeSelfShadowCount !== false) {
    u32(count("selfShadows"));
    zeros(count("selfShadows") * 9);
  }

  if (options.includePropertyCount !== false) {
    u32(count("properties"));
    for (let i = 0; i < count("properties"); i++) {
      zeros(5);
      const ikCount = options.propertyIkCounts?.[i] ?? 0;
      u32(ikCount);
      zeros(ikCount * 21);
    }
  }

  return new Uint8Array(bytes);
}

function pushFixedText(bytes: number[], value: string, byteLength: number): void {
  const encoded = new TextEncoder().encode(value).slice(0, byteLength);
  bytes.push(...encoded);
  bytes.push(...Array.from({ length: byteLength - encoded.byteLength }, () => 0));
}
