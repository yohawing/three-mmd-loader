import { describe, expect, it } from "vitest";

import { parsePmx } from "../../../../src/parser/model/PmxModelParser.js";

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

const enc = new TextEncoder();

function makePmxBytes(vertexSpecs: VertexWeightSpec[]): Uint8Array {
  const bytes: number[] = [];
  const u8 = (v: number) => bytes.push(v & 0xff);
  const i8 = (v: number) => u8(v);
  const i32 = (v: number) => {
    const b = new ArrayBuffer(4);
    new DataView(b).setInt32(0, v, true);
    bytes.push(...new Uint8Array(b));
  };
  const f32 = (v: number) => {
    const b = new ArrayBuffer(4);
    new DataView(b).setFloat32(0, v, true);
    bytes.push(...new Uint8Array(b));
  };
  const vec3 = (x: number, y: number, z: number) => { f32(x); f32(y); f32(z); };
  const text = (s: string) => {
    const encoded = enc.encode(s);
    i32(encoded.byteLength);
    bytes.push(...encoded);
  };
  const count = (n = 0) => i32(n);

  bytes.push(...enc.encode("PMX "));
  f32(2.0);
  u8(8);  // settings count
  u8(1);  // utf8
  u8(0);  // additional UV count
  u8(1);  // vertex index size
  u8(1);  // texture index size
  u8(1);  // material index size
  u8(1);  // bone index size
  u8(1);  // morph index size
  u8(1);  // rigid body index size

  text("test"); text("test"); text(""); text("");

  count(vertexSpecs.length);
  for (const spec of vertexSpecs) {
    vec3(0, 0, 0);  // position
    vec3(0, 1, 0);  // normal
    f32(0); f32(0); // uv
    u8(spec.type);
    const bones = spec.bones ?? [0];
    const weights = spec.weights ?? [1];
    switch (spec.type) {
      case 0: // BDEF1
        i8(bones[0] ?? 0);
        break;
      case 1: // BDEF2
        i8(bones[0] ?? 0);
        i8(bones[1] ?? 0);
        f32(weights[0] ?? 1);
        break;
      case 2: // BDEF4
      case 4: // QDEF
        for (let i = 0; i < 4; i++) i8(bones[i] ?? 0);
        for (let i = 0; i < 4; i++) f32(weights[i] ?? 0);
        break;
      case 3: { // SDEF
        const [cx, cy, cz] = spec.sdefC ?? [0, 0.5, 0];
        const [r0x, r0y, r0z] = spec.sdefR0 ?? [0, 0.5, 0];
        const [r1x, r1y, r1z] = spec.sdefR1 ?? [0, 0.5, 0];
        i8(bones[0] ?? 0);
        i8(bones[1] ?? 0);
        f32(weights[0] ?? 0.5);
        vec3(cx, cy, cz);
        vec3(r0x, r0y, r0z);
        vec3(r1x, r1y, r1z);
        break;
      }
    }
    f32(1); // edge scale
  }

  count(0); // faces
  count(0); // textures
  count(0); // materials
  count(0); // bones
  count(0); // morphs
  count(0); // display
  count(0); // rigid bodies
  count(0); // joints

  return new Uint8Array(bytes);
}

interface VertexWeightSpec {
  readonly type: 0 | 1 | 2 | 3 | 4;
  readonly bones?: readonly number[];
  readonly weights?: readonly number[];
  readonly sdefC?: readonly [number, number, number];
  readonly sdefR0?: readonly [number, number, number];
  readonly sdefR1?: readonly [number, number, number];
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe("PMX skinning weight type parsing", () => {
  describe("BDEF1 (type 0)", () => {
    it("sets skin index to the single bone and weight to 1", () => {
      const pmx = makePmxBytes([{ type: 0, bones: [2] }]);
      const model = parsePmx(pmx);
      expect(model.geometry.skinIndices[0]).toBe(2);
      expect(model.geometry.skinWeights[0]).toBe(1);
    });
  });

  describe("BDEF2 (type 1)", () => {
    it("stores both bone indices and the correct split weights", () => {
      const pmx = makePmxBytes([{ type: 1, bones: [0, 1], weights: [0.7, 0.3] }]);
      const model = parsePmx(pmx);
      const { skinIndices: si, skinWeights: sw } = model.geometry;
      expect(si[0]).toBe(0);
      expect(si[1]).toBe(1);
      expect(sw[0]).toBeCloseTo(0.7);
      expect(sw[1]).toBeCloseTo(0.3);
    });

    it("infers weight1 = 1 - weight0", () => {
      const pmx = makePmxBytes([{ type: 1, bones: [0, 1], weights: [0.4, 0.6] }]);
      const model = parsePmx(pmx);
      expect(model.geometry.skinWeights[0]).toBeCloseTo(0.4);
      expect(model.geometry.skinWeights[1]).toBeCloseTo(0.6);
    });

    it("does NOT set sdef.enabled for BDEF2 vertices", () => {
      const pmx = makePmxBytes([{ type: 1, bones: [0, 1], weights: [0.5, 0.5] }]);
      const model = parsePmx(pmx);
      if (model.geometry.sdef) {
        expect(model.geometry.sdef.enabled[0]).toBe(0);
      }
    });
  });

  describe("BDEF4 (type 2)", () => {
    it("stores all four bone indices and weights", () => {
      const pmx = makePmxBytes([{ type: 2, bones: [0, 1, 2, 3], weights: [0.4, 0.3, 0.2, 0.1] }]);
      const model = parsePmx(pmx);
      const { skinIndices: si, skinWeights: sw } = model.geometry;
      expect(si[0]).toBe(0);
      expect(si[1]).toBe(1);
      expect(si[2]).toBe(2);
      expect(si[3]).toBe(3);
      expect(sw[0]).toBeCloseTo(0.4);
      expect(sw[1]).toBeCloseTo(0.3);
      expect(sw[2]).toBeCloseTo(0.2);
      expect(sw[3]).toBeCloseTo(0.1);
    });
  });

  describe("SDEF (type 3)", () => {
    it("stores bone indices and weight like BDEF2", () => {
      const pmx = makePmxBytes([{
        type: 3, bones: [0, 1], weights: [0.6, 0.4],
        sdefC: [0, 0.5, 0], sdefR0: [0, 0.5, 0], sdefR1: [0, 0.5, 0]
      }]);
      const model = parsePmx(pmx);
      const { skinIndices: si, skinWeights: sw } = model.geometry;
      expect(si[0]).toBe(0);
      expect(si[1]).toBe(1);
      expect(sw[0]).toBeCloseTo(0.6);
      expect(sw[1]).toBeCloseTo(0.4);
    });

    it("sets sdef.enabled = 1 for the vertex", () => {
      const pmx = makePmxBytes([{
        type: 3, bones: [0, 1], weights: [0.5, 0.5],
        sdefC: [0, 0.5, 0], sdefR0: [0, 0.5, 0], sdefR1: [0, 0.5, 0]
      }]);
      const model = parsePmx(pmx);
      if (!model.geometry.sdef) throw new Error("sdef buffer missing");
      expect(model.geometry.sdef.enabled[0]).toBe(1);
    });

    it("stores the sdef C point in model space", () => {
      const pmx = makePmxBytes([{
        type: 3, bones: [0, 1], weights: [0.5, 0.5],
        sdefC: [1, 2, 3], sdefR0: [1, 2, 3], sdefR1: [1, 2, 3]
      }]);
      const model = parsePmx(pmx);
      if (!model.geometry.sdef) throw new Error("sdef buffer missing");
      expect(model.geometry.sdef.c[0]).toBeCloseTo(1);
      expect(model.geometry.sdef.c[1]).toBeCloseTo(2);
      expect(model.geometry.sdef.c[2]).toBeCloseTo(3);
    });

    it("stores computed rw0 and rw1 for shader use", () => {
      const pmx = makePmxBytes([{
        type: 3, bones: [0, 1], weights: [0.5, 0.5],
        sdefC: [0, 0.5, 0], sdefR0: [0, 0.5, 0], sdefR1: [0, 0.5, 0]
      }]);
      const model = parsePmx(pmx);
      if (!model.geometry.sdef) throw new Error("sdef buffer missing");
      expect(model.geometry.sdef.rw0).toBeDefined();
      expect(model.geometry.sdef.rw1).toBeDefined();
      expect(model.geometry.sdef.rw0.length).toBeGreaterThan(0);
      expect(model.geometry.sdef.rw1.length).toBeGreaterThan(0);
    });

    it("leaves sdef.enabled = 0 for non-SDEF vertices in the same model", () => {
      const pmx = makePmxBytes([
        { type: 1, bones: [0, 1], weights: [0.5, 0.5] },
        { type: 3, bones: [0, 1], weights: [0.5, 0.5],
          sdefC: [0, 0.5, 0], sdefR0: [0, 0.5, 0], sdefR1: [0, 0.5, 0] }
      ]);
      const model = parsePmx(pmx);
      if (!model.geometry.sdef) throw new Error("sdef buffer missing");
      expect(model.geometry.sdef.enabled[0]).toBe(0); // BDEF2 → no SDEF
      expect(model.geometry.sdef.enabled[1]).toBe(1); // SDEF → enabled
    });
  });

  describe("QDEF (type 4)", () => {
    it("stores all four bone indices and weights (same binary layout as BDEF4)", () => {
      const pmx = makePmxBytes([{ type: 4, bones: [0, 1, 2, 3], weights: [0.5, 0.3, 0.1, 0.1] }]);
      const model = parsePmx(pmx);
      const { skinIndices: si, skinWeights: sw } = model.geometry;
      expect(si[0]).toBe(0);
      expect(si[1]).toBe(1);
      expect(si[2]).toBe(2);
      expect(si[3]).toBe(3);
      expect(sw[0]).toBeCloseTo(0.5);
      expect(sw[1]).toBeCloseTo(0.3);
      expect(sw[2]).toBeCloseTo(0.1);
      expect(sw[3]).toBeCloseTo(0.1);
    });

    it("sets qdef.enabled = 1 for the vertex", () => {
      const pmx = makePmxBytes([{ type: 4, bones: [0, 1, 2, 3], weights: [0.5, 0.3, 0.1, 0.1] }]);
      const model = parsePmx(pmx);
      expect(model.geometry.qdef).toBeDefined();
      if (!model.geometry.qdef) throw new Error("qdef buffer missing");
      expect(model.geometry.qdef.enabled[0]).toBe(1);
    });

    it("does NOT set sdef.enabled for QDEF vertices", () => {
      const pmx = makePmxBytes([{ type: 4, bones: [0, 1, 0, 0], weights: [0.5, 0.5, 0, 0] }]);
      const model = parsePmx(pmx);
      if (model.geometry.sdef) {
        expect(model.geometry.sdef.enabled[0]).toBe(0);
      }
    });

    it("BDEF4 does NOT set qdef.enabled", () => {
      const pmx = makePmxBytes([{ type: 2, bones: [0, 1, 2, 3], weights: [0.5, 0.3, 0.1, 0.1] }]);
      const model = parsePmx(pmx);
      // BDEF4 should not create a qdef buffer
      expect(model.geometry.qdef).toBeUndefined();
    });
  });

  describe("mixed weight types in one PMX", () => {
    it("parses each vertex with its own weight type independently", () => {
      const pmx = makePmxBytes([
        { type: 0, bones: [0] },
        { type: 1, bones: [0, 1], weights: [0.7, 0.3] },
        { type: 2, bones: [0, 1, 2, 3], weights: [0.4, 0.3, 0.2, 0.1] },
        { type: 3, bones: [0, 1], weights: [0.6, 0.4],
          sdefC: [0, 0.5, 0], sdefR0: [0, 0.5, 0], sdefR1: [0, 0.5, 0] },
        { type: 4, bones: [0, 1, 2, 3], weights: [0.25, 0.25, 0.25, 0.25] }
      ]);
      const model = parsePmx(pmx);
      const { skinIndices: si, skinWeights: sw, sdef } = model.geometry;

      // BDEF1 (vertex 0): stride offset 0
      expect(si[0]).toBe(0);
      expect(sw[0]).toBe(1);

      // BDEF2 (vertex 1): stride offset 4
      expect(si[4]).toBe(0);
      expect(si[5]).toBe(1);
      expect(sw[4]).toBeCloseTo(0.7);
      expect(sw[5]).toBeCloseTo(0.3);

      // BDEF4 (vertex 2): stride offset 8
      expect(si[8]).toBe(0);
      expect(si[11]).toBe(3);
      expect(sw[8]).toBeCloseTo(0.4);
      expect(sw[11]).toBeCloseTo(0.1);

      // SDEF (vertex 3): stride offset 12
      expect(sdef?.enabled[3]).toBe(1);
      expect(si[12]).toBe(0);
      expect(sw[12]).toBeCloseTo(0.6);

      // QDEF (vertex 4): stride offset 16
      expect(sdef?.enabled[4]).toBe(0);
      expect(si[16]).toBe(0);
      expect(sw[16]).toBeCloseTo(0.25);
    });
  });
});
