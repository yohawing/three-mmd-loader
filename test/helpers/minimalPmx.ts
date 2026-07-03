export interface MinimalSdefPmxOptions {
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
}

export function createMinimalSdefPmx(options: MinimalSdefPmxOptions = {}): Uint8Array {
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
