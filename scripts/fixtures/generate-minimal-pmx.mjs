import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TextEncoder } from "node:util";

const DEFAULT_OUTPUT = "test/fixtures/generated/minimal-loader-smoke.pmx";
const REST_POSE_OUTPUT_DIR = "test/fixtures/generated/rest-pose";
const VISUAL_OUTPUT_DIR = "test/fixtures/generated/visual";
const BASE_BONE_FLAGS = 0x001e;
const REST_POSE_CASES = {
  "append-rotate-parent": {
    englishName: "RestPoseAppendRotateParent",
    comment: "Rest pose fixture with appendRotate parent metadata.",
    bones: [
      bone("センター", "center", [0, 0, 0], -1),
      bone("付与元", "appendSource", [0, 0.8, 0], 0),
      bone("腰", "waist", [0, 1.2, 0], 1, {
        flags: BASE_BONE_FLAGS | 0x0100,
        appendTransform: { parent: 1, weight: 1 }
      })
    ],
    watchBone: "腰"
  },
  "append-local": {
    englishName: "RestPoseAppendLocal",
    comment: "Rest pose fixture with local appendRotate metadata.",
    bones: [
      bone("センター", "center", [0, 0, 0], -1),
      bone("付与元", "appendSource", [0, 0.8, 0], 0),
      bone("腰", "waist", [0, 1.2, 0], 1, {
        flags: BASE_BONE_FLAGS | 0x0080 | 0x0100,
        appendTransform: { parent: 1, weight: 1 }
      })
    ],
    watchBone: "腰"
  },
  "ik-chain": {
    englishName: "RestPoseIkChain",
    comment: "Rest pose fixture with an MMD-style leg IK chain.",
    bones: [
      bone("センター", "center", [0, 0, 0], -1),
      bone("腰", "waist", [0, 0.8, 0], 0),
      bone("上半身", "upperBody", [0, 1.4, 0], 1),
      bone("左足", "leftLeg", [0, 0.6, 0], 1),
      bone("左足先", "leftFootTip", [0, 0.1, 0], 3),
      bone("左足IK", "leftLegIk", [0.45, 0.3, 0], 0, {
        flags: BASE_BONE_FLAGS | 0x0020,
        ik: {
          target: 4,
          loopCount: 8,
          limitAngle: Math.PI,
          links: [{ bone: 3 }]
        }
      })
    ],
    torsoBones: ["センター", "腰", "上半身"],
    ikLinkBone: "左足"
  },
  "fixed-local-axis": {
    englishName: "RestPoseFixedLocalAxis",
    comment: "Rest pose fixture with fixedAxis and localAxis bone metadata.",
    bones: [
      bone("センター", "center", [0, 0, 0], -1),
      bone("腰", "waist", [0, 0.8, 0], 0, {
        flags: BASE_BONE_FLAGS | 0x0400 | 0x0800,
        fixedAxis: [0, 1, 0],
        localAxis: {
          x: [1, 0, 0],
          z: [0, 0, 1]
        }
      }),
      bone("上半身", "upperBody", [0, 1.4, 0], 1)
    ],
    watchBone: "腰"
  },
  "transform-after-physics": {
    englishName: "RestPoseTransformAfterPhysics",
    comment: "Rest pose fixture with a transformAfterPhysics bone.",
    bones: [
      bone("センター", "center", [0, 0, 0], -1),
      bone("腰", "waist", [0, 0.8, 0], 0, {
        flags: BASE_BONE_FLAGS | 0x1000
      }),
      bone("上半身", "upperBody", [0, 1.4, 0], 1)
    ],
    watchBone: "腰"
  }
};
const VISUAL_CASES = {
  "mmd-material-order-body-outline-interleave": {
    name: "generated visual material order body outline interleave",
    englishName: "GeneratedVisualMaterialOrderBodyOutlineInterleave",
    comment: "redistribution-safe PMX visual fixture for material body/outline render order",
    englishComment: "Two overlapping angled translucent edged boxes with separate PMX materials.",
    geometry: mergeGeometries([
      transformGeometry(
        boxGeometry({
          min: [-0.62, 0.1, -0.34],
          max: [0.34, 1.0, 0.34],
          bone: 0,
          normalMode: "corner"
        }),
        { rotateY: 0.72, rotateX: -0.08, translate: [-0.08, 0, 0.02] }
      ),
      transformGeometry(
        boxGeometry({
          min: [-0.18, 0.35, -0.3],
          max: [0.78, 1.25, 0.38],
          bone: 0,
          normalMode: "corner"
        }),
        { rotateY: -0.78, rotateX: 0.06, translate: [0.1, 0, 0.04] }
      )
    ]),
    materials: [
      material("mat_red_order0", "RedOrder0", {
        diffuse: [1, 0.12, 0.08, 0.55],
        specular: [0.05, 0.02, 0.02],
        ambient: [0.35, 0.06, 0.04],
        edgeColor: [0, 0, 0, 1],
        edgeSize: 5,
        flags: 0x11,
        faceVertexCount: 36,
        comment: "material 0: translucent red thin box with edge"
      }),
      material("mat_blue_order1", "BlueOrder1", {
        diffuse: [0.08, 0.22, 1, 0.55],
        specular: [0.02, 0.03, 0.06],
        ambient: [0.04, 0.08, 0.35],
        edgeColor: [0, 0, 0, 1],
        edgeSize: 5,
        flags: 0x11,
        faceVertexCount: 36,
        comment: "material 1: translucent blue thin box with edge"
      })
    ]
  },
  "mmd-outline-normal-silhouette": {
    name: "generated visual outline normal silhouette",
    englishName: "GeneratedVisualOutlineNormalSilhouette",
    comment: "redistribution-safe PMX visual fixture for outline normal/depth visibility",
    englishComment: "One rotated translucent edged box that should show a continuous black silhouette.",
    geometry: transformGeometry(
      boxGeometry({ min: [-0.42, 0.18, -0.22], max: [0.42, 1.02, 0.22], bone: 0 }),
      { rotateY: -0.48, translate: [0.06, 0, 0] }
    ),
    materials: [
      material("mat_outline_silhouette", "OutlineSilhouette", {
        diffuse: [0.25, 0.78, 0.36, 0.52],
        specular: [0.03, 0.04, 0.03],
        ambient: [0.08, 0.28, 0.12],
        edgeColor: [0, 0, 0, 1],
        edgeSize: 5,
        flags: 0x11,
        faceVertexCount: 36,
        comment: "single rotated translucent box for outline normal visibility"
      })
    ]
  }
};

export function generateMinimalPmx() {
  return generatePmx({
    name: "generated minimal loader smoke",
    englishName: "GeneratedMinimalLoaderSmoke",
    comment: "redistribution-safe fixture generated by scripts/fixtures/generate-minimal-pmx.mjs",
    englishComment: "Generated tetrahedron-like PMX with one material, three bones, and one vertex morph.",
    bones: [
      bone("center", "center", [0, 0, 0], -1, { tail: [0, 0.8, 0] }),
      bone("upperBody", "upperBody", [0, 0.8, 0], 0, { tail: [0, 0.55, 0] }),
      bone("head", "head", [0, 1.35, 0], 1, { tail: [0, 0.25, 0] })
    ],
    morphs: true,
    geometry: defaultGeometry(),
    materials: [defaultMaterial()]
  });
}

export function generateRestPosePmx(caseId) {
  const restCase = REST_POSE_CASES[caseId];
  if (!restCase) {
    throw new Error(`Unknown rest pose PMX case: ${caseId}`);
  }
  return generatePmx({
    name: `generated rest pose ${caseId}`,
    englishName: restCase.englishName,
    comment: "redistribution-safe rest pose regression fixture",
    englishComment: restCase.comment,
    bones: restCase.bones,
    morphs: false,
    geometry: defaultGeometry(),
    materials: [defaultMaterial()]
  });
}

export function generateVisualPmx(caseId) {
  const visualCase = VISUAL_CASES[caseId];
  if (!visualCase) {
    throw new Error(`Unknown visual PMX case: ${caseId}`);
  }
  return generatePmx({
    name: visualCase.name,
    englishName: visualCase.englishName,
    comment: visualCase.comment,
    englishComment: visualCase.englishComment,
    bones: [bone("center", "center", [0, 0, 0], -1, { tail: [0, 1, 0] })],
    morphs: false,
    geometry: visualCase.geometry,
    materials: visualCase.materials
  });
}

export function restPoseCaseIds() {
  return Object.keys(REST_POSE_CASES);
}

export function visualCaseIds() {
  return Object.keys(VISUAL_CASES);
}

export function restPoseCaseMetadata(caseId) {
  const restCase = REST_POSE_CASES[caseId];
  if (!restCase) {
    throw new Error(`Unknown rest pose PMX case: ${caseId}`);
  }
  return { ...restCase };
}

function generatePmx({ name, englishName, comment, englishComment, bones, morphs, geometry, materials }) {
  const writer = new BinaryWriter();

  writer.bytes(new TextEncoder().encode("PMX "));
  writer.f32(2.0);
  writer.u8(8);
  writer.u8(1);
  writer.u8(0);
  writer.u8(1);
  writer.u8(1);
  writer.u8(1);
  writer.u8(1);
  writer.u8(1);
  writer.u8(1);

  writer.text(name);
  writer.text(englishName);
  writer.text(comment);
  writer.text(englishComment);

  writeVertices(writer, geometry.vertices);
  writeFaces(writer, geometry.indices);
  writeTextures(writer);
  writeMaterials(writer, materials);
  writeBones(writer, bones);
  writeMorphs(writer, morphs);
  writeDisplayFrames(writer);
  writer.i32(0);
  writer.i32(0);

  return writer.toUint8Array();
}

async function main() {
  if (process.argv.includes("--list-rest-pose-cases")) {
    console.log(restPoseCaseIds().join("\n"));
    return;
  }

  if (process.argv.includes("--list-visual-cases")) {
    console.log(visualCaseIds().join("\n"));
    return;
  }

  if (process.argv.includes("--all-rest-pose")) {
    const outputArgIndex = process.argv.indexOf("--output-dir");
    const outputDir =
      outputArgIndex >= 0 && process.argv[outputArgIndex + 1] !== undefined
        ? process.argv[outputArgIndex + 1]
        : REST_POSE_OUTPUT_DIR;
    for (const caseId of restPoseCaseIds()) {
      const outputPath = resolve(outputDir, `${caseId}.pmx`);
      const bytes = generateRestPosePmx(caseId);
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, bytes);
      console.log(`wrote ${bytes.byteLength} bytes to ${outputPath}`);
    }
    return;
  }

  if (process.argv.includes("--all-visual")) {
    const outputArgIndex = process.argv.indexOf("--output-dir");
    const outputDir =
      outputArgIndex >= 0 && process.argv[outputArgIndex + 1] !== undefined
        ? process.argv[outputArgIndex + 1]
        : VISUAL_OUTPUT_DIR;
    for (const caseId of visualCaseIds()) {
      const outputPath = resolve(outputDir, `${caseId}.pmx`);
      const bytes = generateVisualPmx(caseId);
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, bytes);
      console.log(`wrote ${bytes.byteLength} bytes to ${outputPath}`);
    }
    return;
  }

  const caseArgIndex = process.argv.indexOf("--case");
  const visualCaseArgIndex = process.argv.indexOf("--visual-case");
  const outputArgIndex = process.argv.indexOf("--output");
  const outputPath =
    outputArgIndex >= 0 && process.argv[outputArgIndex + 1] !== undefined
      ? process.argv[outputArgIndex + 1]
      : DEFAULT_OUTPUT;
  const absoluteOutput = resolve(outputPath);
  const bytes =
    visualCaseArgIndex >= 0 && process.argv[visualCaseArgIndex + 1] !== undefined
      ? generateVisualPmx(process.argv[visualCaseArgIndex + 1])
      : caseArgIndex >= 0 && process.argv[caseArgIndex + 1] !== undefined
      ? generateRestPosePmx(process.argv[caseArgIndex + 1])
      : generateMinimalPmx();

  await mkdir(dirname(absoluteOutput), { recursive: true });
  await writeFile(absoluteOutput, bytes);
  console.log(`wrote ${bytes.byteLength} bytes to ${outputPath}`);
}

function defaultGeometry() {
  return {
    vertices: [
    { position: [-0.4, 0, -0.25], uv: [0, 1], bone: 0 },
    { position: [0.4, 0, -0.25], uv: [1, 1], bone: 0 },
    { position: [0, 1.1, 0], uv: [0.5, 0], bone: 1 },
    { position: [0, 1.55, 0.25], uv: [0.5, 0.5], bone: 2 }
    ],
    indices: [
      0, 1, 2,
      0, 2, 3,
      1, 3, 2,
      0, 3, 1
    ]
  };
}

function boxGeometry({ min, max, bone, normalMode = "face" }) {
  const [minX, minY, minZ] = min;
  const [maxX, maxY, maxZ] = max;
  const center = [(minX + maxX) * 0.5, (minY + maxY) * 0.5, (minZ + maxZ) * 0.5];
  const faces = [
    {
      normal: [0, 0, 1],
      corners: [
        [minX, minY, maxZ],
        [maxX, minY, maxZ],
        [maxX, maxY, maxZ],
        [minX, maxY, maxZ]
      ]
    },
    {
      normal: [0, 0, -1],
      corners: [
        [maxX, minY, minZ],
        [minX, minY, minZ],
        [minX, maxY, minZ],
        [maxX, maxY, minZ]
      ]
    },
    {
      normal: [-1, 0, 0],
      corners: [
        [minX, minY, minZ],
        [minX, minY, maxZ],
        [minX, maxY, maxZ],
        [minX, maxY, minZ]
      ]
    },
    {
      normal: [1, 0, 0],
      corners: [
        [maxX, minY, maxZ],
        [maxX, minY, minZ],
        [maxX, maxY, minZ],
        [maxX, maxY, maxZ]
      ]
    },
    {
      normal: [0, 1, 0],
      corners: [
        [minX, maxY, maxZ],
        [maxX, maxY, maxZ],
        [maxX, maxY, minZ],
        [minX, maxY, minZ]
      ]
    },
    {
      normal: [0, -1, 0],
      corners: [
        [minX, minY, minZ],
        [maxX, minY, minZ],
        [maxX, minY, maxZ],
        [minX, minY, maxZ]
      ]
    }
  ];
  const vertices = [];
  const indices = [];
  for (const face of faces) {
    const base = vertices.length;
    vertices.push(
      { position: face.corners[0], normal: boxNormal(face.corners[0], center, face.normal, normalMode), uv: [0, 1], bone },
      { position: face.corners[1], normal: boxNormal(face.corners[1], center, face.normal, normalMode), uv: [1, 1], bone },
      { position: face.corners[2], normal: boxNormal(face.corners[2], center, face.normal, normalMode), uv: [1, 0], bone },
      { position: face.corners[3], normal: boxNormal(face.corners[3], center, face.normal, normalMode), uv: [0, 0], bone }
    );
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { vertices, indices };
}

function boxNormal(corner, center, faceNormal, normalMode) {
  if (normalMode !== "corner") {
    return faceNormal;
  }
  return normalizeVector([
    corner[0] - center[0],
    corner[1] - center[1],
    corner[2] - center[2]
  ]);
}

function normalizeVector(value) {
  const length = Math.hypot(value[0], value[1], value[2]) || 1;
  return [value[0] / length, value[1] / length, value[2] / length];
}

function mergeGeometries(geometries) {
  const vertices = [];
  const indices = [];
  for (const geometry of geometries) {
    const base = vertices.length;
    vertices.push(...geometry.vertices);
    indices.push(...geometry.indices.map((index) => index + base));
  }
  return { vertices, indices };
}

function transformGeometry(geometry, transform) {
  const cosX = Math.cos(transform.rotateX ?? 0);
  const sinX = Math.sin(transform.rotateX ?? 0);
  const cosY = Math.cos(transform.rotateY ?? 0);
  const sinY = Math.sin(transform.rotateY ?? 0);
  const translate = transform.translate ?? [0, 0, 0];
  return {
    vertices: geometry.vertices.map((vertex) => ({
      ...vertex,
      position: rotateXThenYThenTranslate(vertex.position, cosX, sinX, cosY, sinY, translate),
      normal: rotateXThenYThenTranslate(vertex.normal ?? [0, 0, 1], cosX, sinX, cosY, sinY, [0, 0, 0])
    })),
    indices: [...geometry.indices]
  };
}

function rotateXThenYThenTranslate(value, cosX, sinX, cosY, sinY, translate) {
  const [x, y, z] = value;
  const rotatedY = y * cosX - z * sinX;
  const rotatedZ = y * sinX + z * cosX;
  return [
    x * cosY + rotatedZ * sinY + translate[0],
    rotatedY + translate[1],
    -x * sinY + rotatedZ * cosY + translate[2]
  ];
}

function writeVertices(writer, vertices) {
  writer.i32(vertices.length);
  for (const vertex of vertices) {
    writer.vec3(vertex.position);
    writer.vec3(vertex.normal ?? [0, 0, 1]);
    writer.vec2(vertex.uv);
    writer.u8(0);
    writer.i8(vertex.bone);
    writer.f32(1);
  }
}

function writeFaces(writer, indices) {
  writer.i32(indices.length);
  for (const index of indices) {
    writer.u8(index);
  }
}

function writeTextures(writer) {
  writer.i32(0);
}

function defaultMaterial() {
  return material("mat_body", "BodyMaterial", {
    diffuse: [0.65, 0.72, 0.85, 1],
    specular: [0.08, 0.08, 0.08],
    ambient: [0.25, 0.25, 0.28],
    flags: 0x01,
    edgeColor: [0, 0, 0, 1],
    edgeSize: 0,
    faceVertexCount: 12,
    comment: "single deterministic material without texture references"
  });
}

function material(name, englishName, options) {
  return {
    name,
    englishName,
    specularPower: 8,
    textureIndex: -1,
    sphereTextureIndex: -1,
    sphereMode: 0,
    toonShared: 0,
    toonTextureIndex: -1,
    ...options
  };
}

function writeMaterials(writer, materials) {
  writer.i32(materials.length);
  for (const material of materials) {
    writer.text(material.name);
    writer.text(material.englishName);
    writer.vec4(material.diffuse);
    writer.vec3(material.specular);
    writer.f32(material.specularPower);
    writer.vec3(material.ambient);
    writer.u8(material.flags);
    writer.vec4(material.edgeColor);
    writer.f32(material.edgeSize);
    writer.i8(material.textureIndex);
    writer.i8(material.sphereTextureIndex);
    writer.u8(material.sphereMode);
    writer.u8(material.toonShared);
    writer.i8(material.toonTextureIndex);
    writer.text(material.comment);
    writer.i32(material.faceVertexCount);
  }
}

function writeBones(writer, bones) {
  writer.i32(bones.length);
  for (const bone of bones) {
    writer.text(bone.name);
    writer.text(bone.englishName);
    writer.vec3(bone.position);
    writer.i8(bone.parent);
    writer.i32(0);
    writer.u16(bone.flags ?? BASE_BONE_FLAGS);
    writer.vec3(bone.tail ?? [0, 0.4, 0]);
    if (bone.appendTransform) {
      writer.i8(bone.appendTransform.parent);
      writer.f32(bone.appendTransform.weight);
    }
    if (bone.fixedAxis) {
      writer.vec3(bone.fixedAxis);
    }
    if (bone.localAxis) {
      writer.vec3(bone.localAxis.x);
      writer.vec3(bone.localAxis.z);
    }
    if (bone.ik) {
      writer.i8(bone.ik.target);
      writer.i32(bone.ik.loopCount);
      writer.f32(bone.ik.limitAngle);
      writer.i32(bone.ik.links.length);
      for (const link of bone.ik.links) {
        writer.i8(link.bone);
        writer.u8(link.limits ? 1 : 0);
        if (link.limits) {
          writer.vec3(link.limits.lower);
          writer.vec3(link.limits.upper);
        }
      }
    }
  }
}

function writeMorphs(writer, enabled) {
  if (!enabled) {
    writer.i32(0);
    return;
  }
  writer.i32(1);
  writer.text("tiny_raise");
  writer.text("TinyRaise");
  writer.u8(1);
  writer.u8(1);
  writer.i32(1);
  writer.u8(3);
  writer.vec3([0, 0.05, 0]);
}

function writeDisplayFrames(writer) {
  writer.i32(1);
  writer.text("Root");
  writer.text("Root");
  writer.u8(1);
  writer.i32(3);
  writer.u8(0);
  writer.i8(0);
  writer.u8(0);
  writer.i8(1);
  writer.u8(0);
  writer.i8(2);
}

function bone(name, englishName, position, parent, options = {}) {
  return {
    name,
    englishName,
    position,
    parent,
    ...options
  };
}

class BinaryWriter {
  #bytes = [];
  #encoder = new TextEncoder();

  bytes(value) {
    this.#bytes.push(...value);
  }

  u8(value) {
    this.#bytes.push(value & 0xff);
  }

  i8(value) {
    this.u8(value);
  }

  u16(value) {
    const buffer = new ArrayBuffer(2);
    new DataView(buffer).setUint16(0, value, true);
    this.bytes(new Uint8Array(buffer));
  }

  i32(value) {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setInt32(0, value, true);
    this.bytes(new Uint8Array(buffer));
  }

  f32(value) {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setFloat32(0, value, true);
    this.bytes(new Uint8Array(buffer));
  }

  vec2(value) {
    this.f32(value[0]);
    this.f32(value[1]);
  }

  vec3(value) {
    this.f32(value[0]);
    this.f32(value[1]);
    this.f32(value[2]);
  }

  vec4(value) {
    this.f32(value[0]);
    this.f32(value[1]);
    this.f32(value[2]);
    this.f32(value[3]);
  }

  text(value) {
    const encoded = this.#encoder.encode(value);
    this.i32(encoded.byteLength);
    this.bytes(encoded);
  }

  toUint8Array() {
    return new Uint8Array(this.#bytes);
  }
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
const modulePath = fileURLToPath(import.meta.url);

if (entryPath === modulePath) {
  await main();
}
