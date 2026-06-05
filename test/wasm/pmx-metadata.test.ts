import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it, vi } from "vitest";
import { MmdAnimBackedCore } from "../../src/parser/wasm/MmdAnimBackedCore.js";
import { initCore } from "../../src/parser/wasm/index.js";
import { createThreeBufferGeometry } from "../../src/three/index.js";
import { parsePmd } from "../../src/parser/model/PmdModelParser.js";
import { parsePmx } from "../../src/parser/model/PmxModelParser.js";

const execFileAsync = promisify(execFile);
const generatedFixturePath = resolve("test/fixtures/generated/minimal-loader-smoke.pmx");
const generatorPath = resolve("scripts/fixtures/generate-minimal-pmx.mjs");

describe("@yw-mmd/core-wasm PMX metadata", () => {
  it("loads PMX through the parsed-model handle when it is available", () => {
    const geometryHandle = {
      free: vi.fn(),
      additionalUvCount: () => 0,
      additionalUvs: () => new Float32Array(0),
      edgeScale: () => Float32Array.from([1]),
      indices: () => Uint32Array.from([0, 0, 0]),
      materialGroups: () => Uint32Array.from([0, 3, 0]),
      normals: () => Float32Array.from([0, 1, 0]),
      positions: () => Float32Array.from([2, 4, 6]),
      qdefEnabled: () => new Uint8Array([0]),
      sdefC: () => new Float32Array(3),
      sdefEnabled: () => new Uint8Array([0]),
      sdefR0: () => new Float32Array(3),
      sdefR1: () => new Float32Array(3),
      sdefRw0: () => new Float32Array(3),
      sdefRw1: () => new Float32Array(3),
      skinIndices: () => Uint32Array.from([0, 0, 0, 0]),
      skinWeights: () => Float32Array.from([1, 0, 0, 0]),
      uvs: () => Float32Array.from([0, 0]),
      vertexCount: () => 1
    };
    const parsedHandle = {
      free: vi.fn(),
      geometry: vi.fn(() => geometryHandle),
      nonGeometryJson: vi.fn(() =>
        JSON.stringify({
          metadata: { diagnostics: [] },
          materials: [],
          skeleton: { bones: [] },
          morphs: [],
          displayFrames: [],
          rigidBodies: [],
          joints: [],
          softBodies: [],
          diagnostics: []
        })
      )
    };
    const parse = vi.fn(() => parsedHandle);
    const parsePmxModelNonGeometryJson = vi.fn(() => {
      throw new Error("split stateless JSON path should not be used");
    });
    const fromPmxBytes = vi.fn(() => {
      throw new Error("split stateless geometry path should not be used");
    });
    const core = new MmdAnimBackedCore({
      parsePmxModelJson: () => {
        throw new Error("full PMX JSON geometry path should not be used");
      },
      parsePmxModelNonGeometryJson,
      WasmPmxParsedModel: { parse },
      WasmPmxGeometry: { fromPmxBytes },
      wasm_wrapper_version: () => 1
    });

    const model = core.loadModel(new Uint8Array([1, 2, 3]), { format: "pmx" });

    expect(parse).toHaveBeenCalledOnce();
    expect(parsedHandle.nonGeometryJson).toHaveBeenCalledOnce();
    expect(parsedHandle.geometry).toHaveBeenCalledOnce();
    expect(parsePmxModelNonGeometryJson).not.toHaveBeenCalled();
    expect(fromPmxBytes).not.toHaveBeenCalled();
    expect(geometryHandle.free).toHaveBeenCalledOnce();
    expect(parsedHandle.free).toHaveBeenCalledOnce();
    expect(Array.from(model.geometry().positions)).toEqual([2, 4, 6]);
  });

  it("loads PMX geometry through the typed-array DTO when the split ABI is available", () => {
    const geometryHandle = {
      free: vi.fn(),
      additionalUvCount: () => 2,
      additionalUvs: () => Float32Array.from([1, 2, 3, 4, 5, 6, 7, 8]),
      edgeScale: () => Float32Array.from([1]),
      indices: () => Uint32Array.from([0, 0, 0]),
      materialGroups: () => Uint32Array.from([0, 3, 0]),
      normals: () => Float32Array.from([0, 1, 0]),
      positions: () => Float32Array.from([1, 2, 3]),
      qdefEnabled: () => new Uint8Array([0]),
      sdefC: () => new Float32Array(3),
      sdefEnabled: () => new Uint8Array([0]),
      sdefR0: () => new Float32Array(3),
      sdefR1: () => new Float32Array(3),
      sdefRw0: () => new Float32Array(3),
      sdefRw1: () => new Float32Array(3),
      skinIndices: () => Uint32Array.from([0, 0, 0, 0]),
      skinWeights: () => Float32Array.from([1, 0, 0, 0]),
      uvs: () => Float32Array.from([0.25, 0.75]),
      vertexCount: () => 1
    };
    const parsePmxModelJson = vi.fn(() => {
      throw new Error("full PMX JSON geometry path should not be used");
    });
    const parsePmxModelNonGeometryJson = vi.fn(() =>
      JSON.stringify({
        metadata: {
          version: 2,
          encoding: "utf-8",
          name: "dto",
          englishName: "dto",
          comment: "",
          englishComment: "",
          counts: {
            vertices: 1,
            faces: 1,
            materials: 0,
            bones: 0,
            morphs: 0,
            displayFrames: 0,
            rigidBodies: 0,
            joints: 0,
            softBodies: 0
          },
          indexSizes: {
            vertex: 1,
            texture: 1,
            material: 1,
            bone: 1,
            morph: 1,
            rigidBody: 1
          },
          additionalUvCount: 2,
          diagnostics: []
        },
        materials: [],
        skeleton: { bones: [] },
        morphs: [],
        displayFrames: [],
        rigidBodies: [],
        joints: [],
        softBodies: [],
        diagnostics: []
      })
    );
    const fromPmxBytes = vi.fn(() => geometryHandle);
    const core = new MmdAnimBackedCore({
      parsePmxModelJson,
      parsePmxModelNonGeometryJson,
      WasmPmxGeometry: { fromPmxBytes },
      wasm_wrapper_version: () => 1
    });

    const model = core.loadModel(new Uint8Array([1, 2, 3]), { format: "pmx" });

    expect(parsePmxModelNonGeometryJson).toHaveBeenCalledOnce();
    expect(parsePmxModelJson).not.toHaveBeenCalled();
    expect(fromPmxBytes).toHaveBeenCalledOnce();
    expect(geometryHandle.free).toHaveBeenCalledOnce();
    expect(Array.from(model.geometry().positions)).toEqual([1, 2, 3]);
    expect(model.geometry().additionalUvs.map((set) => Array.from(set))).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7, 8]
    ]);
    expect(model.geometry().indices).toBeInstanceOf(Uint16Array);
    expect(model.geometry().materialGroups).toEqual([{ start: 0, count: 3, materialIndex: 0 }]);
    expect(model.geometry().sdef).toBeUndefined();
    expect(model.geometry().qdef).toBeUndefined();
  });

  it("keeps the old full-JSON PMX path as a fallback when the split ABI is unavailable", () => {
    const parsePmxModelJson = vi.fn(() =>
      JSON.stringify({
        metadata: {
          version: 2,
          encoding: "utf-8",
          name: "legacy",
          englishName: "legacy",
          comment: "",
          englishComment: "",
          counts: {
            vertices: 1,
            faces: 0,
            materials: 0,
            bones: 0,
            morphs: 0,
            displayFrames: 0,
            rigidBodies: 0,
            joints: 0,
            softBodies: 0
          },
          indexSizes: {
            vertex: 1,
            texture: 1,
            material: 1,
            bone: 1,
            morph: 1,
            rigidBody: 1
          },
          additionalUvCount: 0,
          diagnostics: []
        },
        geometry: {
          positions: [1, 2, 3],
          normals: [0, 1, 0],
          uvs: [0, 0],
          additionalUvs: [],
          indices: [],
          skinIndices: [0, 0, 0, 0],
          skinWeights: [1, 0, 0, 0],
          sdef: { enabled: [], c: [], r0: [], r1: [], rw0: [], rw1: [] },
          qdef: { enabled: [] }
        },
        materials: [],
        skeleton: { bones: [] },
        morphs: [],
        displayFrames: [],
        rigidBodies: [],
        joints: [],
        softBodies: [],
        diagnostics: []
      })
    );
    const core = new MmdAnimBackedCore({
      parsePmxModelJson,
      wasm_wrapper_version: () => 1
    });

    const model = core.loadModel(createMinimalSdefPmx(), { format: "pmx" });

    expect(parsePmxModelJson).toHaveBeenCalledOnce();
    expect(Array.from(model.geometry().positions)).toEqual([1, 2, 3]);
    expect(model.geometry().sdef).toBeDefined();
    expect(Array.from(model.geometry().sdef!.enabled)).toEqual([1]);
  });

  it("rejects PMX skin indices that cannot fit the current Uint16 geometry contract", () => {
    const geometryHandle = {
      additionalUvCount: () => 0,
      additionalUvs: () => new Float32Array(0),
      edgeScale: () => Float32Array.from([1]),
      indices: () => Uint32Array.from([0, 0, 0]),
      materialGroups: () => new Uint32Array(0),
      normals: () => Float32Array.from([0, 1, 0]),
      positions: () => Float32Array.from([0, 0, 0]),
      qdefEnabled: () => new Uint8Array([0]),
      sdefC: () => new Float32Array(3),
      sdefEnabled: () => new Uint8Array([0]),
      sdefR0: () => new Float32Array(3),
      sdefR1: () => new Float32Array(3),
      sdefRw0: () => new Float32Array(3),
      sdefRw1: () => new Float32Array(3),
      skinIndices: () => Uint32Array.from([65536, 0, 0, 0]),
      skinWeights: () => Float32Array.from([1, 0, 0, 0]),
      uvs: () => Float32Array.from([0, 0]),
      vertexCount: () => 1
    };
    const core = new MmdAnimBackedCore({
      parsePmxModelJson: () => {
        throw new Error("full PMX JSON geometry path should not be used");
      },
      parsePmxModelNonGeometryJson: () =>
        JSON.stringify({
          metadata: { diagnostics: [] },
          materials: [],
          skeleton: { bones: [] },
          morphs: [],
          displayFrames: [],
          rigidBodies: [],
          joints: [],
          softBodies: [],
          diagnostics: []
        }),
      WasmPmxGeometry: { fromPmxBytes: () => geometryHandle },
      wasm_wrapper_version: () => 1
    });

    expect(() => core.loadModel(new Uint8Array([1]), { format: "pmx" })).toThrow(
      /skin index range/
    );
  });

  it("parses the 1-bone cube fixture metadata", async () => {
    const core = await initCore();
    const bytes = await readFile(resolve("test/fixtures/test_1bone_cube.pmx"));
    const model = core.loadModel(bytes, { format: "pmx" });
    const metadata = model.metadata();

    expect(core.healthCheck()).toBe(true);
    expect(core.version()).toMatch(/\d+\.\d+\.\d+/);
    expect(metadata.version).toBeCloseTo(2.0);
    expect(metadata.encoding).toBe("utf-16-le");
    expect(metadata.name).toBe("テスト用モデル");
    expect(metadata.englishName).toBe("TestModel");
    expect(metadata.counts).toMatchObject({
      vertices: 14,
      faces: 12,
      materials: 1,
      bones: 1,
      morphs: 0,
      displayFrames: 2,
      rigidBodies: 0,
      joints: 0,
      softBodies: 0
    });
    expect(metadata.indexSizes.vertex).toBe(1);
    expect(model.morphs()).toHaveLength(0);
    expect(model.rigidBodies()).toHaveLength(0);
    expect(model.joints()).toHaveLength(0);
    expect(model.geometry().positions).toHaveLength(14 * 3);
    expect(model.geometry().normals).toHaveLength(14 * 3);
    expect(model.geometry().uvs).toHaveLength(14 * 2);
    expect(model.geometry().additionalUvs).toHaveLength(0);
    expect(model.geometry().indices).toHaveLength(12 * 3);
    expect(model.geometry().edgeScale).toHaveLength(14);
    expect(model.geometry().skinIndices).toHaveLength(14 * 4);
    expect(model.geometry().skinWeights).toHaveLength(14 * 4);
    expect(model.geometry().sdef).toBeUndefined();
    expect(model.geometry().qdef).toBeUndefined();
    expect(Array.from(model.geometry().skinWeights.slice(0, 4))).toEqual([1, 0, 0, 0]);
    expect(Array.from(model.geometry().positions.slice(0, 3))).toEqual([-12.5, -12.5, -12.5]);
    expect(model.materials()[0]?.faceCount).toBe(12);
    expect(model.materials()[0]?.sphereMode).toBe("none");
    expect(Number.isFinite(model.materials()[0]?.specularPower)).toBe(true);
    expect(model.materials()[0]?.flags.edge).toBeTypeOf("boolean");
    expect(model.materials()[0]?.edgeColor).toHaveLength(4);
    expect(model.skeleton().bones[0]).toMatchObject({
      name: "全ての親",
      englishName: "Root",
      parentIndex: -1,
      position: [0, 0, 0]
    });
  });

  it("rejects broken PMX data", async () => {
    const core = await initCore();
    expect(() => core.loadModel(new Uint8Array([0, 1, 2, 3]), { format: "pmx" })).toThrow(
      /Invalid PMX signature|Unexpected end|invalid PMX magic bytes|parsePmxModelJson/
    );
  });

  it("warns when SDEF vertices fall back to BDEF-compatible skinning", async () => {
    const model = parsePmx(createMinimalSdefPmx());

    expect(model.metadata.counts.vertices).toBe(1);
    expect(Array.from(model.geometry.skinWeights.slice(0, 4))).toEqual([0.25, 0.75, 0, 0]);
    expect(model.geometry.sdef).toBeDefined();
    expect(Array.from(model.geometry.sdef!.enabled.slice(0, 1))).toEqual([1]);
    expectArrayCloseTo(model.geometry.sdef!.c.slice(0, 3), [1, 2, 3]);
    expectArrayCloseTo(model.geometry.sdef!.r0.slice(0, 3), [4, 5, 6]);
    expectArrayCloseTo(model.geometry.sdef!.r1.slice(0, 3), [7, 8, 9]);
    expectArrayCloseTo(model.geometry.sdef!.rw0.slice(0, 3), [-0.125, 0.875, 1.875]);
    expectArrayCloseTo(model.geometry.sdef!.rw1.slice(0, 3), [1.375, 2.375, 3.375]);
    expect(model.metadata.diagnostics).toContainEqual(
      expect.objectContaining({
        level: "warning",
        code: "SDEF_SKINNING_FALLBACK"
      })
    );
  });

  it("parses PMX flip morph target weights", async () => {
    const model = parsePmx(createMinimalSdefPmx({ version: 2.1, flipMorphFixture: true }));
    const morphs = model.morphs;

    expect(morphs[0]).toMatchObject({ name: "Target", type: "vertex" });
    expect(morphs[1]).toMatchObject({
      name: "Flip",
      type: "flip",
      flipOffsets: [{ morphIndex: 0, weight: 0.75 }]
    });
    expect(
      model.metadata.diagnostics.some((diagnostic) => diagnostic.code === "MORPH_TYPE_UNSUPPORTED")
    ).toBe(false);
  });

  it("parses PMX impulse morph offsets and reports external-physics diagnostics", async () => {
    const model = parsePmx(createMinimalSdefPmx({ version: 2.1, impulseMorphFixture: true }));

    expect(model.morphs[0]).toMatchObject({
      name: "Impulse",
      type: "impulse",
      impulseOffsets: [
        {
          rigidBodyIndex: -1,
          local: true,
          velocity: [1, 2, 3],
          torque: [4, 5, 6]
        }
      ]
    });
    expect(model.metadata.diagnostics).toContainEqual(
      expect.objectContaining({
        level: "warning",
        code: "IMPULSE_MORPH_EXTERNAL_PHYSICS_ONLY"
      })
    );
    expect(
      model.metadata.diagnostics.some((diagnostic) => diagnostic.code === "MORPH_TYPE_UNSUPPORTED")
    ).toBe(false);
  });

  it("parses PMX group, vertex, bone, UV, additional-UV, and material morph offsets", async () => {
    const model = parsePmx(createMinimalSdefPmx({ morphTypesFixture: true }));

    expect(model.morphs).toHaveLength(6);
    expect(model.morphs[0]).toMatchObject({
      name: "Vertex",
      type: "vertex",
      vertexOffsets: [{ vertexIndex: 0 }]
    });
    expectArrayCloseTo(model.morphs[0]!.vertexOffsets[0]!.position, [1, 2, 3]);
    expect(model.morphs[1]).toMatchObject({
      name: "Group",
      type: "group",
      groupOffsets: [{ morphIndex: 0 }]
    });
    expect(model.morphs[1]!.groupOffsets[0]!.weight).toBeCloseTo(0.5);
    expect(model.morphs[2]).toMatchObject({
      name: "Bone",
      type: "bone",
      boneOffsets: [
        {
          boneIndex: -1
        }
      ]
    });
    expectArrayCloseTo(model.morphs[2]!.boneOffsets[0]!.translation, [4, 5, 6]);
    expectArrayCloseTo(model.morphs[2]!.boneOffsets[0]!.rotation, [0, 0, 0, 1]);
    expect(model.morphs[3]).toMatchObject({
      name: "Uv",
      type: "uv",
      uvOffsets: [{ vertexIndex: 0 }]
    });
    expectArrayCloseTo(model.morphs[3]!.uvOffsets[0]!.uv, [0.1, 0.2, 0.3, 0.4]);
    expect(model.morphs[4]).toMatchObject({
      name: "AddUv",
      type: "additionalUv",
      additionalUvOffsets: [{ vertexIndex: 0, uvIndex: 0 }]
    });
    expectArrayCloseTo(model.morphs[4]!.additionalUvOffsets[0]!.uv, [0.5, 0.6, 0.7, 0.8]);
    expect(model.morphs[5]).toMatchObject({
      name: "Material",
      type: "material",
      materialOffsets: [
        {
          materialIndex: -1,
          operation: "add"
        }
      ]
    });
    const materialOffset = model.morphs[5]!.materialOffsets[0]!;
    expectArrayCloseTo(materialOffset.diffuse, [0.1, 0.2, 0.3, 0.4]);
    expectArrayCloseTo(materialOffset.specular, [0.5, 0.6, 0.7]);
    expect(materialOffset.specularPower).toBeCloseTo(0.8);
    expectArrayCloseTo(materialOffset.ambient, [0.9, 1, 1.1]);
    expectArrayCloseTo(materialOffset.edgeColor, [1.2, 1.3, 1.4, 1.5]);
    expect(materialOffset.edgeSize).toBeCloseTo(1.6);
    expectArrayCloseTo(materialOffset.textureFactor, [1.7, 1.8, 1.9, 2]);
    expectArrayCloseTo(materialOffset.sphereTextureFactor, [2.1, 2.2, 2.3, 2.4]);
    expectArrayCloseTo(materialOffset.toonTextureFactor, [2.5, 2.6, 2.7, 2.8]);
    expect(
      model.metadata.diagnostics.some((diagnostic) => diagnostic.code === "MORPH_TYPE_UNSUPPORTED")
    ).toBe(false);
  });

  it("creates matching PMX morph geometry from Wasm sparse morph offsets", async () => {
    await execFileAsync(process.execPath, [generatorPath, "--output", generatedFixturePath]);

    const bytes = await readFile(generatedFixturePath);
    const parsed = parsePmx(bytes);
    const core = await initCore();
    const model = core.loadModel(bytes, { format: "pmx" });
    const wasmMorphs = model.morphs();

    expect(wasmMorphs[0]).toMatchObject({ name: "tiny_raise", type: "vertex" });
    expect(wasmMorphs[0]?.densePositionOffsets).toBeUndefined();
    expect(wasmMorphs[0]?.vertexOffsets).toHaveLength(1);

    const wasmGeometry = createThreeBufferGeometry(model.geometry(), model.materials(), wasmMorphs);
    const tsGeometry = createThreeBufferGeometry(
      parsed.geometry,
      parsed.materials,
      parsed.morphs
    );

    expectArrayCloseTo(
      Array.from(wasmGeometry.morphAttributes.position?.[0]?.array ?? []),
      Array.from(tsGeometry.morphAttributes.position?.[0]?.array ?? [])
    );
  });

  it("diagnoses unsupported PMX morph types when the payload is skippable", async () => {
    const model = parsePmx(createMinimalSdefPmx({ unknownMorphFixture: true }));

    expect(model.metadata.counts.morphs).toBe(1);
    expect(model.morphs[0]).toMatchObject({
      name: "UnknownMorph",
      type: "unknown",
      vertexOffsets: [],
      groupOffsets: [],
      materialOffsets: []
    });
    expect(model.metadata.diagnostics).toContainEqual(
      expect.objectContaining({
        level: "warning",
        code: "MORPH_TYPE_UNSUPPORTED"
      })
    );
  });

  it("preserves PMX display frame entries", async () => {
    const model = parsePmx(createMinimalSdefPmx({ displayFrameFixture: true }));

    expect(model.metadata.counts.displayFrames).toBe(1);
    expect(model.displayFrames).toEqual([
      {
        name: "Display",
        englishName: "DisplayEn",
        special: true,
        frames: [
          { type: "bone", index: -1 },
          { type: "morph", index: -1 }
        ]
      }
    ]);
  });

  it("diagnoses unsupported PMX display frame entry types", async () => {
    const model = parsePmx(createMinimalSdefPmx({ unknownDisplayFrameFixture: true }));

    expect(model.metadata.counts.displayFrames).toBe(1);
    expect(model.displayFrames).toEqual([
      {
        name: "UnknownDisplay",
        englishName: "",
        special: false,
        frames: [{ type: "unknown", index: -1 }]
      }
    ]);
    expect(model.metadata.diagnostics).toContainEqual(
      expect.objectContaining({
        level: "warning",
        code: "DISPLAY_FRAME_TYPE_UNSUPPORTED"
      })
    );
  });

  it("warns when PMX 2.1 soft-body data is present but unsupported", async () => {
    const model = parsePmx(
      createMinimalSdefPmx({
        version: 2.1,
        softBodyCount: 1,
        trailingBytes: [0xde, 0xad, 0xbe, 0xef]
      })
    );

    expect(model.metadata.counts.softBodies).toBe(1);
    expect(model.softBodies).toHaveLength(1);
    expect(model.softBodies[0]).toMatchObject({
      name: "SoftBody",
      englishName: "SoftBodyEn",
      type: "triMesh",
      materialIndex: -1,
      collisionGroup: 1,
      collisionMask: 0xffff,
      flags: 0x03,
      bendingConstraintsDistance: 2,
      clusterCount: 3,
      totalMass: 4,
      collisionMargin: 0.5,
      aeroModel: "faceTwoSided",
      iteration: { velocity: 1, position: 2, drift: 3, cluster: 4 },
      anchors: [{ rigidBodyIndex: -1, vertexIndex: 0, nearMode: true }],
      pinnedVertexIndices: [0]
    });
    expect(model.softBodies[0]?.material.linearStiffnessCoefficient).toBeCloseTo(0.1);
    expect(model.softBodies[0]?.material.angularStiffnessCoefficient).toBeCloseTo(0.2);
    expect(model.softBodies[0]?.material.volumeStiffnessCoefficient).toBeCloseTo(0.3);
    expect(model.metadata.diagnostics).toContainEqual(
      expect.objectContaining({
        level: "warning",
        code: "PMX_SOFT_BODY_UNSUPPORTED",
        message: "1 PMX soft bodies are parsed but are not simulated by the current runtime."
      })
    );
    expect(model.metadata.diagnostics).toContainEqual(
      expect.objectContaining({
        level: "warning",
        code: "PMX_TRAILING_DATA_UNPARSED"
      })
    );
  });

  it("diagnoses unsupported PMX 2.1 soft-body types and invalid references", () => {
    const model = parsePmx(
      createMinimalSdefPmx({
        version: 2.1,
        softBodyCount: 1,
        invalidSoftBodyFixture: true
      })
    );
    const diagnostics = model.metadata.diagnostics;

    expect(model.softBodies[0]).toMatchObject({
      type: "unknown",
      materialIndex: 5,
      aeroModel: "unknown",
      anchors: [{ rigidBodyIndex: 7, vertexIndex: 99 }],
      pinnedVertexIndices: [88]
    });
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        level: "warning",
        code: "PMX_SOFT_BODY_TYPE_UNSUPPORTED"
      })
    );
    expect(
      diagnostics.filter((diagnostic) => diagnostic.code === "PMX_SOFT_BODY_REFERENCE_INVALID")
    ).toEqual([
      expect.objectContaining({ message: expect.stringContaining("material index 5") }),
      expect.objectContaining({ message: expect.stringContaining("rigid body index 7") }),
      expect.objectContaining({ message: expect.stringContaining("vertex index 99") }),
      expect.objectContaining({ message: expect.stringContaining("vertex index 88") })
    ]);
  });

  it("warns when PMX material draw flags are parsed but unsupported by the adapter", async () => {
    const model = parsePmx(createMinimalSdefPmx({ materialFlagBits: 0xe0 }));

    expect(model.materials[0]?.flags).toMatchObject({
      vertexColor: true,
      pointDraw: true,
      lineDraw: true
    });
    expect(model.metadata.diagnostics).toContainEqual(
      expect.objectContaining({
        level: "warning",
        code: "MATERIAL_DRAW_FLAG_UNSUPPORTED"
      })
    );
  });

  it("maps PMX material render and shadow flag bits", async () => {
    const model = parsePmx(createMinimalSdefPmx({ materialFlagBits: 0x1f }));

    expect(model.materials[0]?.flags).toMatchObject({
      doubleSided: true,
      groundShadow: true,
      selfShadowMap: true,
      selfShadow: true,
      edge: true,
      vertexColor: false,
      pointDraw: false,
      lineDraw: false
    });
  });

  it("diagnoses unsupported PMX rigid body and joint type values", () => {
    const model = parsePmx(createMinimalSdefPmx({ unknownPhysicsFixture: true }));

    expect(model.metadata.counts).toMatchObject({
      rigidBodies: 1,
      joints: 1
    });
    expect(model.rigidBodies[0]).toMatchObject({
      name: "UnknownBody",
      shape: "unknown",
      mode: "unknown"
    });
    expect(model.joints[0]).toMatchObject({
      name: "UnknownJoint",
      type: "unknown",
      rigidBodyIndexA: 0,
      rigidBodyIndexB: 0
    });
    expect(model.metadata.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "RIGID_BODY_TYPE_UNSUPPORTED" }),
        expect.objectContaining({ code: "JOINT_TYPE_UNSUPPORTED" })
      ])
    );
  });

  it("parses PMD texture, sphere, toon, and alpha-derived shadow material flags", () => {
    const model = parsePmd(createMinimalPmdMaterialFixture());

    expect(model.metadata).toMatchObject({
      format: "pmd",
      encoding: "shift-jis",
      counts: {
        vertices: 0,
        faces: 0,
        materials: 2,
        bones: 0,
        morphs: 0,
        displayFrames: 0,
        rigidBodies: 0,
        joints: 0,
        softBodies: 0
      }
    });
    expect(model.materials[0]).toMatchObject({
      texturePath: "base.png",
      sphereTexturePath: "add.spa",
      sphereMode: "add",
      sharedToonIndex: 0,
      toonTexturePath: "toon01.bmp",
      flags: {
        doubleSided: false,
        groundShadow: true,
        selfShadowMap: true,
        selfShadow: true,
        edge: true
      }
    });
    expect(model.materials[1]).toMatchObject({
      texturePath: "",
      sphereTexturePath: "mul.sph",
      sphereMode: "multiply",
      sharedToonIndex: undefined,
      toonTexturePath: "",
      flags: {
        doubleSided: true,
        groundShadow: false,
        selfShadowMap: false,
        selfShadow: false,
        edge: false
      }
    });
  });

  it("maps PMD bone tail indices, movable flags, append rotation, and twist axes", () => {
    const model = parsePmd(createMinimalPmdBoneTypeFixture());

    expect(model.metadata.counts.bones).toBe(8);
    expect(model.skeleton.bones[0]).toMatchObject({
      name: "root",
      tailIndex: 1,
      flags: {
        indexedTail: true,
        rotatable: true,
        translatable: false,
        visible: true
      }
    });
    expect(model.skeleton.bones[1]).toMatchObject({
      name: "move",
      flags: {
        translatable: true
      }
    });
    expect(model.skeleton.bones[2]).toMatchObject({
      name: "effect",
      tailIndex: -1,
      appendTransform: {
        parentIndex: 1,
        weight: 0.5
      },
      flags: {
        indexedTail: false,
        visible: false,
        appendRotate: true
      }
    });
    expect(model.skeleton.bones[3]).toMatchObject({
      name: "twist",
      flags: {
        indexedTail: false,
        fixedAxis: true
      }
    });
    expectArrayCloseTo(model.skeleton.bones[3]!.fixedAxis!, [0, 1, 0]);
    expect(model.skeleton.bones[4]).toMatchObject({
      name: "typedIk",
      layer: 1,
      flags: {
        ik: true,
        translatable: true
      }
    });
    expect(model.skeleton.bones[5]).toMatchObject({
      name: "invisible",
      flags: {
        visible: false,
        enabled: true
      }
    });
    expect(model.skeleton.bones[6]).toMatchObject({
      name: "twistBadTail",
      flags: {
        indexedTail: false,
        fixedAxis: true
      }
    });
    expectArrayCloseTo(model.skeleton.bones[6]!.fixedAxis!, [-1, 0, 0]);
    expect(model.skeleton.bones[7]).toMatchObject({
      name: "unknown",
      flags: {
        rotatable: true,
        visible: true
      }
    });
    expect(model.metadata.diagnostics).toContainEqual(
      expect.objectContaining({
        level: "warning",
        code: "BONE_FIXED_AXIS_CONSTRAINTS_UNSUPPORTED"
      })
    );
    expect(model.metadata.diagnostics).toContainEqual(
      expect.objectContaining({
        level: "warning",
        code: "PMD_BONE_TYPE_UNSUPPORTED"
      })
    );
  });

  it("parses PMD rigid body and joint physics metadata", () => {
    const model = parsePmd(createMinimalPmdPhysicsFixture());

    expect(model.metadata.counts).toMatchObject({
      bones: 1,
      rigidBodies: 3,
      joints: 1
    });
    expect(model.rigidBodies[0]).toMatchObject({
      name: "StaticSphere",
      boneIndex: -1,
      group: 2,
      mask: 0x00f0,
      shape: "sphere",
      mass: 0,
      angularDamping: 0.5,
      mode: "static"
    });
    expectArrayCloseTo(model.rigidBodies[0]!.size, [1, 2, 3]);
    expectArrayCloseTo(model.rigidBodies[0]!.position, [4, 5, 6]);
    expectArrayCloseTo(model.rigidBodies[0]!.rotation, [0.1, 0.2, 0.3]);
    expect(model.rigidBodies[0]!.linearDamping).toBeCloseTo(0.4);
    expect(model.rigidBodies[0]!.restitution).toBeCloseTo(0.6);
    expect(model.rigidBodies[0]!.friction).toBeCloseTo(0.7);
    expect(model.rigidBodies[1]).toMatchObject({
      name: "DynamicBox",
      boneIndex: 0,
      shape: "box",
      mode: "dynamic"
    });
    expectArrayCloseTo(model.rigidBodies[1]!.position, [10, 20, 30]);
    expect(model.rigidBodies[2]).toMatchObject({
      name: "BoneCapsule",
      boneIndex: 0,
      shape: "capsule",
      mode: "dynamicBone"
    });
    expectArrayCloseTo(model.rigidBodies[2]!.position, [10, 20, 30]);
    expect(model.joints[0]).toMatchObject({
      name: "Joint",
      type: "generic6dofSpring",
      rigidBodyIndexA: 0,
      rigidBodyIndexB: 1
    });
    expectArrayCloseTo(model.joints[0]!.position, [1, 2, 3]);
    expectArrayCloseTo(model.joints[0]!.rotation, [0.1, 0.2, 0.3]);
    expectArrayCloseTo(model.joints[0]!.translationLowerLimit, [-1, -2, -3]);
    expectArrayCloseTo(model.joints[0]!.translationUpperLimit, [1, 2, 3]);
    expectArrayCloseTo(model.joints[0]!.rotationLowerLimit, [-0.1, -0.2, -0.3]);
    expectArrayCloseTo(model.joints[0]!.rotationUpperLimit, [0.1, 0.2, 0.3]);
    expectArrayCloseTo(model.joints[0]!.springTranslationFactor, [0.4, 0.5, 0.6]);
    expectArrayCloseTo(model.joints[0]!.springRotationFactor, [0.7, 0.8, 0.9]);
  });

  it("parses PMD IK chains and applies knee link limits", () => {
    const model = parsePmd(createMinimalPmdIkFixture());
    const ikBone = model.skeleton.bones[0];

    expect(model.metadata.counts).toMatchObject({
      bones: 3,
      rigidBodies: 0,
      joints: 0
    });
    expect(ikBone).toMatchObject({
      name: "IK",
      flags: { ik: true },
      ik: {
        targetIndex: 1,
        loopCount: 40,
        limitAngle: 1
      }
    });
    expect(ikBone?.ik?.links).toHaveLength(2);
    expect(ikBone?.ik?.links[0]).toMatchObject({
      boneIndex: 2,
      limits: {
        lower: [-Math.PI, 0, 0],
        upper: [-0.0001, 0, 0]
      }
    });
    expect(ikBone?.ik?.links[1]).toMatchObject({
      boneIndex: 1,
      limits: undefined
    });
    expect(
      model.metadata.diagnostics.some(
        (diagnostic) => diagnostic.code === "IK_PMD_KNEE_LIMITS_APPROXIMATE"
      )
    ).toBe(true);
  });

  it("normalizes duplicate PMD IK chains into synthetic chain bones", () => {
    const model = parsePmd(createMinimalPmdIkFixture({ duplicateChain: true }));
    const ikBone = model.skeleton.bones[0];
    const syntheticIkBone = model.skeleton.bones[3];

    expect(model.metadata.counts.bones).toBe(4);
    expect(ikBone?.ik).toMatchObject({
      targetIndex: 1,
      loopCount: 40,
      limitAngle: 1
    });
    expect(ikBone?.ik?.links).toHaveLength(2);
    expect(syntheticIkBone).toMatchObject({
      name: "IK+",
      ikStateName: "IK",
      parentIndex: 0,
      tailIndex: -1,
      flags: {
        ik: true,
        indexedTail: false,
        visible: false
      },
      ik: {
        targetIndex: 2,
        loopCount: 12,
        limitAngle: 0.5,
        links: [{ boneIndex: 1 }]
      }
    });
    expect(
      model.metadata.diagnostics.some(
        (diagnostic) => diagnostic.code === "PMD_DUPLICATE_IK_CHAIN_SYNTHESIZED"
      )
    ).toBe(true);
  });

  it("resolves PMD vertex morph indices through the base morph", () => {
    const model = parsePmd(createMinimalPmdMorphFixture());

    expect(model.metadata.counts).toMatchObject({
      vertices: 2,
      morphs: 2
    });
    expect(model.morphs[0]).toMatchObject({
      name: "base",
      type: "base",
      vertexOffsets: []
    });
    expect(model.morphs[1]).toMatchObject({
      name: "smile",
      type: "vertex",
      vertexOffsets: [{ vertexIndex: 1 }]
    });
    expectArrayCloseTo(model.morphs[1]!.vertexOffsets[0]!.position, [1, 2, 3]);
    expect(
      model.metadata.diagnostics.some((diagnostic) => diagnostic.code === "MORPH_TYPE_UNSUPPORTED")
    ).toBe(false);
  });

  it("parses PMX append, IK, fixed-axis, and local-axis bone data", async () => {
    const core = await initCore();
    const appendModel = core.loadModel(
      await readFile(resolve("test/fixtures/test_append_bone.pmx")),
      {
        format: "pmx"
      }
    );
    const basicModel = core.loadModel(
      await readFile(resolve("test/fixtures/test_basic_bone.pmx")),
      {
        format: "pmx"
      }
    );
    const axisModel = core.loadModel(await readFile(resolve("test/fixtures/test_fix_axis.pmx")), {
      format: "pmx"
    });

    const appended = appendModel.skeleton().bones.find((bone) => bone.name === "D");
    expect(appended?.flags.appendRotate).toBe(true);
    expect(appended?.flags.appendTranslate).toBe(false);
    expect(appended?.appendTransform).toMatchObject({ parentIndex: 5, weight: -1 });

    const legIk = basicModel.skeleton().bones.find((bone) => bone.name === "左足ＩＫ");
    expect(legIk?.flags.ik).toBe(true);
    expect(legIk?.ik?.targetIndex).toBe(41);
    expect(legIk?.ik?.links).toHaveLength(2);
    expect(legIk?.ik?.links[0]?.limits?.lower[0]).toBeLessThan(-3);
    expect(
      basicModel
        .metadata()
        .diagnostics.some((diagnostic) => diagnostic.code === "IK_PMX_LINK_LIMITS_APPROXIMATE")
    ).toBe(true);

    const fixed = axisModel.skeleton().bones.find((bone) => bone.name === "軸固定");
    const local = axisModel.skeleton().bones.find((bone) => bone.name === "ローカル軸");
    expect(fixed?.flags.fixedAxis).toBe(true);
    expect(fixed?.fixedAxis?.every(Number.isFinite)).toBe(true);
    expect(local?.flags.localAxis).toBe(true);
    expect(local?.localAxis?.x.every(Number.isFinite)).toBe(true);
    expect(
      axisModel
        .metadata()
        .diagnostics.some(
          (diagnostic) => diagnostic.code === "BONE_FIXED_AXIS_CONSTRAINTS_UNSUPPORTED"
        )
    ).toBe(true);
    expect(
      axisModel
        .metadata()
        .diagnostics.some(
          (diagnostic) => diagnostic.code === "BONE_LOCAL_AXIS_CONSTRAINTS_UNSUPPORTED"
        )
    ).toBe(true);
  });

  it("exposes SDEF geometry buffers from the PMX wasm-backed path", async () => {
    const core = await initCore();
    const model = core.loadModel(createMinimalSdefPmx(), { format: "pmx" });
    const geo = model.geometry();

    expect(geo.sdef).toBeDefined();
    expect(geo.sdef!.enabled).toHaveLength(1);
    expect(Array.from(geo.sdef!.enabled.slice(0, 1))).toEqual([1]);
    expectArrayCloseTo(geo.sdef!.c.slice(0, 3), [1, 2, 3]);
    expectArrayCloseTo(geo.sdef!.r0.slice(0, 3), [4, 5, 6]);
    expectArrayCloseTo(geo.sdef!.r1.slice(0, 3), [7, 8, 9]);
    expectArrayCloseTo(geo.sdef!.rw0.slice(0, 3), [-0.125, 0.875, 1.875]);
    expectArrayCloseTo(geo.sdef!.rw1.slice(0, 3), [1.375, 2.375, 3.375]);
  });

});

function createMinimalSdefPmx(
  options: {
    version?: number;
    softBodyCount?: number;
    trailingBytes?: number[];
    materialFlagBits?: number;
    flipMorphFixture?: boolean;
    impulseMorphFixture?: boolean;
    morphTypesFixture?: boolean;
    unknownMorphFixture?: boolean;
    displayFrameFixture?: boolean;
    unknownDisplayFrameFixture?: boolean;
    unknownPhysicsFixture?: boolean;
    invalidSoftBodyFixture?: boolean;
  } = {}
): Uint8Array {
  const bytes: number[] = [];
  const encoder = new TextEncoder();
  const u8 = (value: number) => bytes.push(value & 0xff);
  const i8 = (value: number) => u8(value);
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
    const encoded = encoder.encode(value);
    i32(encoded.byteLength);
    bytes.push(...encoded);
  };
  const vec3 = (x: number, y: number, z: number) => {
    f32(x);
    f32(y);
    f32(z);
  };
  const vec4 = (x: number, y: number, z: number, w: number) => {
    f32(x);
    f32(y);
    f32(z);
    f32(w);
  };

  bytes.push(...encoder.encode("PMX "));
  f32(options.version ?? 2.0);
  u8(8);
  u8(1);
  u8(0);
  u8(1);
  u8(1);
  u8(1);
  u8(1);
  u8(1);
  u8(1);
  text("SDEF fallback fixture");
  text("");
  text("");
  text("");

  i32(1);
  vec3(0, 0, 0);
  vec3(0, 1, 0);
  f32(0);
  f32(0);
  u8(3);
  i8(0);
  i8(0);
  f32(0.25);
  vec3(1, 2, 3);
  vec3(4, 5, 6);
  vec3(7, 8, 9);
  f32(1);

  i32(0);
  i32(0);
  if (options.materialFlagBits !== undefined) {
    i32(1);
    text("Material flags");
    text("");
    vec4(1, 1, 1, 1);
    vec3(0, 0, 0);
    f32(0);
    vec3(0, 0, 0);
    u8(options.materialFlagBits);
    vec4(0, 0, 0, 1);
    f32(1);
    i8(-1);
    i8(-1);
    u8(0);
    u8(1);
    u8(0);
    text("");
    i32(0);
  } else {
    i32(0);
  }
  i32(0);
  if (options.flipMorphFixture) {
    i32(2);
    text("Target");
    text("");
    u8(1);
    u8(1);
    i32(1);
    i8(0);
    vec3(1, 2, 3);
    text("Flip");
    text("");
    u8(1);
    u8(9);
    i32(1);
    i8(0);
    f32(0.75);
  } else if (options.impulseMorphFixture) {
    i32(1);
    text("Impulse");
    text("");
    u8(1);
    u8(10);
    i32(1);
    i8(-1);
    u8(1);
    vec3(1, 2, 3);
    vec3(4, 5, 6);
  } else if (options.morphTypesFixture) {
    i32(6);
    text("Vertex");
    text("");
    u8(1);
    u8(1);
    i32(1);
    i8(0);
    vec3(1, 2, 3);
    text("Group");
    text("");
    u8(1);
    u8(0);
    i32(1);
    i8(0);
    f32(0.5);
    text("Bone");
    text("");
    u8(1);
    u8(2);
    i32(1);
    i8(-1);
    vec3(4, 5, 6);
    vec4(0, 0, 0, 1);
    text("Uv");
    text("");
    u8(1);
    u8(3);
    i32(1);
    i8(0);
    vec4(0.1, 0.2, 0.3, 0.4);
    text("AddUv");
    text("");
    u8(1);
    u8(4);
    i32(1);
    i8(0);
    vec4(0.5, 0.6, 0.7, 0.8);
    text("Material");
    text("");
    u8(1);
    u8(8);
    i32(1);
    i8(-1);
    u8(1);
    vec4(0.1, 0.2, 0.3, 0.4);
    vec3(0.5, 0.6, 0.7);
    f32(0.8);
    vec3(0.9, 1, 1.1);
    vec4(1.2, 1.3, 1.4, 1.5);
    f32(1.6);
    vec4(1.7, 1.8, 1.9, 2);
    vec4(2.1, 2.2, 2.3, 2.4);
    vec4(2.5, 2.6, 2.7, 2.8);
  } else if (options.unknownMorphFixture) {
    i32(1);
    text("UnknownMorph");
    text("");
    u8(1);
    u8(99);
    i32(0);
  } else {
    i32(0);
  }
  if (options.displayFrameFixture) {
    i32(1);
    text("Display");
    text("DisplayEn");
    u8(1);
    i32(2);
    u8(0);
    i8(-1);
    u8(1);
    i8(-1);
  } else if (options.unknownDisplayFrameFixture) {
    i32(1);
    text("UnknownDisplay");
    text("");
    u8(0);
    i32(1);
    u8(99);
    i8(-1);
  } else {
    i32(0);
  }
  if (options.unknownPhysicsFixture) {
    i32(1);
    text("UnknownBody");
    text("");
    i8(-1);
    u8(0);
    u8(0xff);
    u8(0xff);
    u8(99);
    vec3(1, 1, 1);
    vec3(0, 0, 0);
    vec3(0, 0, 0);
    f32(1);
    f32(0);
    f32(0);
    f32(0);
    f32(0);
    u8(99);
    i32(1);
    text("UnknownJoint");
    text("");
    u8(99);
    i8(0);
    i8(0);
    vec3(0, 0, 0);
    vec3(0, 0, 0);
    vec3(0, 0, 0);
    vec3(0, 0, 0);
    vec3(0, 0, 0);
    vec3(0, 0, 0);
    vec3(0, 0, 0);
    vec3(0, 0, 0);
  } else {
    i32(0);
    i32(0);
  }
  if ((options.version ?? 2.0) >= 2.1) {
    const softBodyCount = options.softBodyCount ?? 0;
    i32(softBodyCount);
    for (let i = 0; i < softBodyCount; i++) {
      const invalidSoftBody = options.invalidSoftBodyFixture;
      text("SoftBody");
      text("SoftBodyEn");
      u8(invalidSoftBody ? 99 : 0);
      i8(invalidSoftBody ? 5 : -1);
      u8(1);
      u8(0xff);
      u8(0xff);
      u8(0x03);
      i32(2);
      i32(3);
      f32(4);
      f32(0.5);
      i32(invalidSoftBody ? 99 : 3);
      for (const value of [
        0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.11, 0.12, 0.13
      ]) {
        f32(value);
      }
      for (const value of [0.14, 0.15, 0.16, 0.17, 0.18, 0.19]) {
        f32(value);
      }
      i32(1);
      i32(2);
      i32(3);
      i32(4);
      f32(0.1);
      f32(0.2);
      f32(0.3);
      i32(1);
      i8(invalidSoftBody ? 7 : -1);
      u8(invalidSoftBody ? 99 : 0);
      u8(1);
      i32(1);
      u8(invalidSoftBody ? 88 : 0);
    }
    bytes.push(...(options.trailingBytes ?? []));
  }

  return new Uint8Array(bytes);
}

function createMinimalPmdMaterialFixture(): Uint8Array {
  const bytes: number[] = [];
  const encoder = new TextEncoder();
  const u8 = (value: number) => bytes.push(value & 0xff);
  const u16 = (value: number) => {
    u8(value);
    u8(value >> 8);
  };
  const u32 = (value: number) => {
    u8(value);
    u8(value >> 8);
    u8(value >> 16);
    u8(value >> 24);
  };
  const f32 = (value: number) => {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setFloat32(0, value, true);
    bytes.push(...new Uint8Array(buffer));
  };
  const fixedText = (value: string, byteLength: number) => {
    const encoded = encoder.encode(value);
    for (let i = 0; i < byteLength; i++) {
      u8(encoded[i] ?? 0);
    }
  };
  const material = (alpha: number, toonIndex: number, edgeFlag: number, textureName: string) => {
    f32(1);
    f32(1);
    f32(1);
    f32(alpha);
    f32(8);
    f32(0.1);
    f32(0.2);
    f32(0.3);
    f32(0.4);
    f32(0.5);
    f32(0.6);
    u8(toonIndex);
    u8(edgeFlag);
    u32(0);
    fixedText(textureName, 20);
  };

  bytes.push(...encoder.encode("Pmd"));
  f32(1);
  fixedText("PMDMaterial", 20);
  fixedText("", 256);
  u32(0);
  u32(0);
  u32(2);
  material(1, 0, 1, "base.png*add.spa");
  material(0.98, 255, 0, "mul.sph");
  u16(0);
  u16(0);
  u16(0);
  u8(0);
  u8(0);
  u32(0);
  u8(0);
  for (const path of [
    "toon01.bmp",
    "toon02.bmp",
    "toon03.bmp",
    "toon04.bmp",
    "toon05.bmp",
    "toon06.bmp",
    "toon07.bmp",
    "toon08.bmp",
    "toon09.bmp",
    "toon10.bmp"
  ]) {
    fixedText(path, 100);
  }

  return new Uint8Array(bytes);
}

function createMinimalPmdPhysicsFixture(): Uint8Array {
  const bytes: number[] = [];
  const encoder = new TextEncoder();
  const u8 = (value: number) => bytes.push(value & 0xff);
  const u16 = (value: number) => {
    u8(value);
    u8(value >> 8);
  };
  const u32 = (value: number) => {
    u8(value);
    u8(value >> 8);
    u8(value >> 16);
    u8(value >> 24);
  };
  const f32 = (value: number) => {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setFloat32(0, value, true);
    bytes.push(...new Uint8Array(buffer));
  };
  const vec3 = (x: number, y: number, z: number) => {
    f32(x);
    f32(y);
    f32(z);
  };
  const fixedText = (value: string, byteLength: number) => {
    const encoded = encoder.encode(value);
    for (let i = 0; i < byteLength; i++) {
      u8(encoded[i] ?? 0);
    }
  };
  const rigidBody = (
    name: string,
    boneIndex: number,
    shape: number,
    mode: number,
    position: [number, number, number] = [0, 0, 0],
    rotation: [number, number, number] = [0, 0, 0]
  ) => {
    fixedText(name, 20);
    u16(boneIndex);
    u8(2);
    u16(0x00f0);
    u8(shape);
    vec3(1, 2, 3);
    vec3(...position);
    vec3(...rotation);
    f32(mode === 0 ? 0 : 1);
    f32(0.4);
    f32(0.5);
    f32(0.6);
    f32(0.7);
    u8(mode);
  };

  bytes.push(...encoder.encode("Pmd"));
  f32(1);
  fixedText("PMDPhysics", 20);
  fixedText("", 256);
  u32(0);
  u32(0);
  u32(0);
  u16(1);
  fixedText("root", 20);
  u16(0xffff);
  u16(0);
  u8(0);
  u16(0xffff);
  vec3(10, 20, 30);
  u16(0);
  u16(0);
  u8(0);
  u8(0);
  u32(0);
  u8(0);
  u32(3);
  rigidBody("StaticSphere", 0xffff, 0, 0, [4, 5, 6], [0.1, 0.2, 0.3]);
  rigidBody("DynamicBox", 0, 1, 1);
  rigidBody("BoneCapsule", 0, 2, 2);
  u32(1);
  fixedText("Joint", 20);
  u32(0);
  u32(1);
  vec3(1, 2, 3);
  vec3(0.1, 0.2, 0.3);
  vec3(-1, -2, -3);
  vec3(1, 2, 3);
  vec3(-0.1, -0.2, -0.3);
  vec3(0.1, 0.2, 0.3);
  vec3(0.4, 0.5, 0.6);
  vec3(0.7, 0.8, 0.9);

  return new Uint8Array(bytes);
}

function createMinimalPmdBoneTypeFixture(): Uint8Array {
  const bytes: number[] = [];
  const encoder = new TextEncoder();
  const u8 = (value: number) => bytes.push(value & 0xff);
  const u16 = (value: number) => {
    u8(value);
    u8(value >> 8);
  };
  const u32 = (value: number) => {
    u8(value);
    u8(value >> 8);
    u8(value >> 16);
    u8(value >> 24);
  };
  const f32 = (value: number) => {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setFloat32(0, value, true);
    bytes.push(...new Uint8Array(buffer));
  };
  const vec3 = (x: number, y: number, z: number) => {
    f32(x);
    f32(y);
    f32(z);
  };
  const fixedText = (value: string, byteLength: number) => {
    const encoded = encoder.encode(value);
    for (let i = 0; i < byteLength; i++) {
      u8(encoded[i] ?? 0);
    }
  };
  const bone = (
    name: string,
    parentIndex: number,
    tailIndex: number,
    type: number,
    ikIndex: number,
    position: [number, number, number]
  ) => {
    fixedText(name, 20);
    u16(parentIndex);
    u16(tailIndex);
    u8(type);
    u16(ikIndex);
    vec3(...position);
  };

  bytes.push(...encoder.encode("Pmd"));
  f32(1);
  fixedText("PMDBoneType", 20);
  fixedText("", 256);
  u32(0);
  u32(0);
  u32(0);
  u16(8);
  bone("root", 0xffff, 1, 0, 0, [0, 0, 0]);
  bone("move", 0, 0, 1, 0, [0, 2, 0]);
  bone("effect", 0, 1, 5, 50, [0, 0, 0]);
  bone("twist", 0, 1, 8, 0, [0, 0, 0]);
  bone("typedIk", 0, 1, 2, 0, [0, 0, 0]);
  bone("invisible", 0, 0, 7, 0, [0, 0, 0]);
  bone("twistBadTail", 0, 99, 8, 0, [1, 0, 0]);
  bone("unknown", 0, 0, 3, 0, [0, 0, 0]);
  u16(0);
  u16(0);
  u8(0);
  u8(0);
  u32(0);
  u8(0);

  return new Uint8Array(bytes);
}

function createMinimalPmdIkFixture(options: { duplicateChain?: boolean } = {}): Uint8Array {
  const bytes: number[] = [];
  const encoder = new TextEncoder();
  const u8 = (value: number) => bytes.push(value & 0xff);
  const u16 = (value: number) => {
    u8(value);
    u8(value >> 8);
  };
  const u32 = (value: number) => {
    u8(value);
    u8(value >> 8);
    u8(value >> 16);
    u8(value >> 24);
  };
  const f32 = (value: number) => {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setFloat32(0, value, true);
    bytes.push(...new Uint8Array(buffer));
  };
  const vec3 = (x: number, y: number, z: number) => {
    f32(x);
    f32(y);
    f32(z);
  };
  const fixedText = (value: string, byteLength: number) => {
    const encoded = encoder.encode(value);
    for (let i = 0; i < byteLength; i++) {
      u8(encoded[i] ?? 0);
    }
  };
  const bone = (name: string, parentIndex = 0xffff) => {
    fixedText(name, 20);
    u16(parentIndex);
    u16(0xffff);
    u8(0);
    u16(0xffff);
    vec3(0, 0, 0);
  };

  bytes.push(...encoder.encode("Pmd"));
  f32(1);
  fixedText("PMDIk", 20);
  fixedText("", 256);
  u32(0);
  u32(0);
  u32(0);
  u16(3);
  bone("IK");
  bone("Target", 0);
  bone("left knee", 1);
  u16(options.duplicateChain ? 2 : 1);
  u16(0);
  u16(1);
  u8(2);
  u16(40);
  f32(1);
  u16(2);
  u16(1);
  if (options.duplicateChain) {
    u16(0);
    u16(2);
    u8(1);
    u16(12);
    f32(0.5);
    u16(1);
  }
  u16(0);
  u8(0);
  u8(0);
  u32(0);
  u8(0);

  return new Uint8Array(bytes);
}

function createMinimalPmdMorphFixture(): Uint8Array {
  const bytes: number[] = [];
  const encoder = new TextEncoder();
  const u8 = (value: number) => bytes.push(value & 0xff);
  const u16 = (value: number) => {
    u8(value);
    u8(value >> 8);
  };
  const u32 = (value: number) => {
    u8(value);
    u8(value >> 8);
    u8(value >> 16);
    u8(value >> 24);
  };
  const f32 = (value: number) => {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setFloat32(0, value, true);
    bytes.push(...new Uint8Array(buffer));
  };
  const vec3 = (x: number, y: number, z: number) => {
    f32(x);
    f32(y);
    f32(z);
  };
  const fixedText = (value: string, byteLength: number) => {
    const encoded = encoder.encode(value);
    for (let i = 0; i < byteLength; i++) {
      u8(encoded[i] ?? 0);
    }
  };
  const vertex = (x: number) => {
    vec3(x, 0, 0);
    vec3(0, 1, 0);
    f32(0);
    f32(0);
    u16(0xffff);
    u16(0xffff);
    u8(100);
    u8(0);
  };

  bytes.push(...encoder.encode("Pmd"));
  f32(1);
  fixedText("PMDMorph", 20);
  fixedText("", 256);
  u32(2);
  vertex(0);
  vertex(1);
  u32(0);
  u32(0);
  u16(0);
  u16(0);
  u16(2);
  fixedText("base", 20);
  u32(1);
  u8(0);
  u32(1);
  vec3(0, 0, 0);
  fixedText("smile", 20);
  u32(1);
  u8(1);
  u32(0);
  vec3(1, 2, 3);
  u8(0);
  u8(0);
  u32(0);
  u8(0);

  return new Uint8Array(bytes);
}

function expectArrayCloseTo(actual: ArrayLike<number>, expected: readonly number[]): void {
  expect(actual).toHaveLength(expected.length);
  for (let i = 0; i < expected.length; i++) {
    expect(actual[i]).toBeCloseTo(expected[i]);
  }
}
