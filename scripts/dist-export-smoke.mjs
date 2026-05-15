import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { TextEncoder } from "node:util";

import {
  DefaultMmdRuntime as PackageRootDefaultMmdRuntime,
  ThreeMmdLoader as PackageRootThreeMmdLoader,
  MODEL_SOURCE_STRING_UNRESOLVED as PACKAGE_ROOT_MODEL_SOURCE_STRING_UNRESOLVED,
  createMmdBuiltInToonTextureMap as createPackageRootMmdBuiltInToonTextureMap,
  mmdWorldMatrixToThree as packageRootMmdWorldMatrixToThree,
  parsePmdMetadata as parsePackageRootPmdMetadata,
  parsePmdSectionInventory as parsePackageRootPmdSectionInventory,
  parsePmxMetadata as parsePackageRootPmxMetadata,
  parsePmxSectionInventory as parsePackageRootPmxSectionInventory,
  parseVmdMetadata as parsePackageRootVmdMetadata,
  parseVmdSectionInventory as parsePackageRootVmdSectionInventory,
  parseVpdMetadata as parsePackageRootVpdMetadata,
  parseVpdPoseInventory as parsePackageRootVpdPoseInventory,
  resolveMappedTexture as resolvePackageRootMappedTexture,
  readModelSourceBytes as readPackageRootModelSourceBytes,
  parseVpdPose as parsePackageRootVpdPose
} from "@yohawing/three-mmd-loader";
import {
  parsePmdMetadata as parsePackageParserPmdMetadata,
  parsePmdSectionInventory as parsePackageParserPmdSectionInventory,
  parsePmxMetadata as parsePackageParserPmxMetadata,
  parsePmxSectionInventory as parsePackageParserPmxSectionInventory,
  parseVmdMetadata as parsePackageParserVmdMetadata,
  parseVmdSectionInventory as parsePackageParserVmdSectionInventory,
  parseVpdMetadata as parsePackageParserVpdMetadata,
  parseVpdPoseInventory as parsePackageParserVpdPoseInventory,
  parseVpdPose as parsePackageParserVpdPose
} from "@yohawing/three-mmd-loader/parser";
import {
  createDisabledMmdPhysicsBackend as createPackageDisabledMmdPhysicsBackend,
  mapLegacyMmdRigidBodyToPhysicsRigidBody as mapPackageLegacyMmdRigidBodyToPhysicsRigidBody,
  validateConcreteMmdPhysicsStepContext as validatePackageConcreteMmdPhysicsStepContext
} from "@yohawing/three-mmd-loader/physics";
import { DefaultMmdRuntime as PackageDefaultMmdRuntime } from "@yohawing/three-mmd-loader/runtime";
import {
  createMmdBuiltInToonTextureMap as createPackageMmdBuiltInToonTextureMap,
  createThreeBufferGeometry as createPackageThreeBufferGeometry,
  createThreeSkeleton as createPackageThreeSkeleton,
  mmdWorldMatrixToThree as packageMmdWorldMatrixToThree,
  MODEL_SOURCE_STRING_UNRESOLVED as PACKAGE_THREE_MODEL_SOURCE_STRING_UNRESOLVED,
  readModelSourceBytes as readPackageModelSourceBytes,
  ThreeMmdLoader as PackageThreeMmdLoader
} from "@yohawing/three-mmd-loader/three";
import {
  DefaultMmdRuntime as RootDefaultMmdRuntime,
  ThreeMmdLoader as RootThreeMmdLoader,
  MODEL_SOURCE_STRING_UNRESOLVED as ROOT_MODEL_SOURCE_STRING_UNRESOLVED,
  createMmdBuiltInToonTextureMap as createRootMmdBuiltInToonTextureMap,
  createDisabledMmdPhysicsBackend as createRootDisabledMmdPhysicsBackend,
  mmdWorldMatrixToThree as rootMmdWorldMatrixToThree,
  parsePmdMetadata as parseRootPmdMetadata,
  parsePmdSectionInventory as parseRootPmdSectionInventory,
  parsePmxMetadata as parseRootPmxMetadata,
  parsePmxSectionInventory as parseRootPmxSectionInventory,
  parseVmdMetadata as parseRootVmdMetadata,
  parseVmdSectionInventory as parseRootVmdSectionInventory,
  parseVpdMetadata as parseRootVpdMetadata,
  parseVpdPoseInventory as parseRootVpdPoseInventory,
  resolveMappedTexture as resolveRootMappedTexture,
  readModelSourceBytes as readRootModelSourceBytes,
  parseVpdPose as parseRootVpdPose
} from "../dist/index.js";
import {
  BinaryReader,
  detectModelFormat,
  parsePmdMetadata,
  parsePmdSectionInventory,
  parsePmxMetadata,
  parsePmxSectionInventory,
  parseVmdMetadata,
  parseVmdSectionInventory,
  parseVpdMetadata,
  parseVpdPose,
  parseVpdPoseInventory
} from "../dist/parser/index.js";
import {
  createDisabledMmdPhysicsBackend,
  mapLegacyMmdRigidBodyToPhysicsRigidBody,
  validateConcreteMmdPhysicsStepContext
} from "../dist/physics/index.js";
import { DefaultMmdRuntime } from "../dist/runtime/index.js";
import {
  createMmdBuiltInToonTextureMap,
  createThreeBufferGeometry,
  createThreeSkeleton,
  mmdWorldMatrixToThree,
  MODEL_SOURCE_STRING_UNRESOLVED,
  readModelSourceBytes,
  ThreeMmdLoader
} from "../dist/three/index.js";

const pmxBytes = await readFile(resolve("..", "data/unittest/test_1bone_cube.pmx"));
assert.equal(detectModelFormat(pmxBytes), "pmx");
assert.equal(new BinaryReader(pmxBytes).remaining, pmxBytes.byteLength);
assert.equal(parsePmxMetadata(pmxBytes).name, "テスト用モデル");
assert.equal(parsePmxSectionInventory(pmxBytes).counts.bones, 1);
assert.equal(parseRootPmxMetadata(pmxBytes).name, "テスト用モデル");
assert.equal(parseRootPmxSectionInventory(pmxBytes).counts.materials, 1);
assert.equal(parsePackageRootPmxMetadata(pmxBytes).name, "テスト用モデル");
assert.equal(parsePackageRootPmxSectionInventory(pmxBytes).counts.faces, 12);
assert.equal(parsePackageParserPmxMetadata(pmxBytes).name, "テスト用モデル");
assert.equal(parsePackageParserPmxSectionInventory(pmxBytes).counts.vertices, 14);

const pmdBytes = createMinimalPmdBytes();
assert.equal(detectModelFormat(pmdBytes), "pmd");
assert.equal(parsePmdMetadata(pmdBytes).format, "pmd");
assert.equal(parsePmdSectionInventory(pmdBytes).counts.bones, 0);
assert.equal(parseRootPmdMetadata(pmdBytes).counts.materials, 0);
assert.equal(parseRootPmdSectionInventory(pmdBytes).trailingBytes, 0);
assert.equal(parsePackageRootPmdMetadata(pmdBytes).counts.vertices, 0);
assert.equal(parsePackageRootPmdSectionInventory(pmdBytes).counts.rigidBodies, 0);
assert.equal(parsePackageParserPmdMetadata(pmdBytes).format, "pmd");
assert.equal(parsePackageParserPmdSectionInventory(pmdBytes).counts.joints, 0);

const vmdBytes = createMinimalVmdBytes();
assert.equal(parseVmdMetadata(vmdBytes).format, "vmd");
assert.equal(parseVmdSectionInventory(vmdBytes).sections.length, 6);
assert.equal(parseRootVmdMetadata(vmdBytes).counts.bones, 0);
assert.equal(parseRootVmdSectionInventory(vmdBytes).counts.properties, 0);
assert.equal(parsePackageRootVmdMetadata(vmdBytes).modelName, "Smoke model");
assert.equal(parsePackageRootVmdSectionInventory(vmdBytes).trailingBytes, 0);
assert.equal(parsePackageParserVmdMetadata(vmdBytes).counts.morphs, 0);
assert.equal(parsePackageParserVmdSectionInventory(vmdBytes).counts.selfShadows, 0);

const vpdBytes = new TextEncoder().encode(`Vocaloid Pose Data file
sample.pmx;
1;
Bone0{
center
0,1,2;
0,0,0,1;
}
`);
assert.equal(parseVpdMetadata(vpdBytes).boneCount, 1);
assert.equal(parseVpdPoseInventory(vpdBytes).boneBlocks[0]?.boneName, "center");
assert.equal(parseVpdPose(vpdBytes).bonePoses.length, 1);
assert.equal(parseRootVpdMetadata(vpdBytes).modelFile, "sample.pmx");
assert.equal(parseRootVpdPoseInventory(vpdBytes).parsedBoneCount, 1);
assert.equal(parseRootVpdPose(vpdBytes).modelFile, "sample.pmx");
assert.equal(parsePackageRootVpdMetadata(vpdBytes).boneCount, 1);
assert.equal(parsePackageRootVpdPoseInventory(vpdBytes).boneBlocks[0]?.blockIndex, 0);
assert.equal(parsePackageRootVpdPose(vpdBytes).bonePoses.length, 1);
assert.equal(parsePackageParserVpdMetadata(vpdBytes).modelFile, "sample.pmx");
assert.equal(parsePackageParserVpdPoseInventory(vpdBytes).parsedBoneCount, 1);
assert.equal(parsePackageParserVpdPose(vpdBytes).modelFile, "sample.pmx");

const runtime = new DefaultMmdRuntime({ frameRate: 60 });
assert.deepEqual(runtime.evaluate(0.5), {
  seconds: 0.5,
  frame: 30,
  frameRate: 60
});
assert.equal(new RootDefaultMmdRuntime({ frameRate: 24 }).evaluate(0.5).frame, 12);
assert.equal(new PackageRootDefaultMmdRuntime({ frameRate: 120 }).evaluate(0.5).frame, 60);
assert.equal(new PackageDefaultMmdRuntime({ frameRate: 30 }).evaluate(0.5).frame, 15);

assert.equal(createDisabledMmdPhysicsBackend().step(runtime.frameState()).simulated, false);
assert.equal(createRootDisabledMmdPhysicsBackend().step(runtime.frameState()).simulated, false);
assert.equal(createPackageDisabledMmdPhysicsBackend().step(runtime.frameState()).simulated, false);

const triangleGeometryInput = {
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 1]),
  normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
  uvs: new Float32Array([0, 0, 1, 0, 0, 1]),
  indices: new Uint16Array([0, 1, 2]),
  skinIndices: new Uint16Array(12),
  skinWeights: new Float32Array(12)
};
const distGeometry = createThreeBufferGeometry(triangleGeometryInput, [{ faceCount: 1 }]);
const packageGeometry = createPackageThreeBufferGeometry(triangleGeometryInput, [{ faceCount: 1 }]);
assert.equal(distGeometry.getAttribute("position").getZ(2), -1);
assert.equal(packageGeometry.getAttribute("position").getZ(2), -1);

const smokeSkeleton = {
  bones: [
    { name: "センター", englishName: "center", parentIndex: -1, position: [0, 0, 0] },
    { name: "髪", englishName: "hair", parentIndex: 0, position: [0, 1, 1] }
  ]
};
assert.equal(createThreeSkeleton(smokeSkeleton).bones[1]?.position.z, -1);
assert.equal(createPackageThreeSkeleton(smokeSkeleton).bones[1]?.position.z, -1);

const identityWorldMatrix = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 2, 3, 1]);
assert.deepEqual(Array.from(mmdWorldMatrixToThree(identityWorldMatrix, 0).elements.slice(12, 15)), [
  1,
  2,
  -3
]);
assert.deepEqual(
  Array.from(packageMmdWorldMatrixToThree(identityWorldMatrix, 0).elements.slice(12, 15)),
  [1, 2, -3]
);
assert.deepEqual(
  Array.from(rootMmdWorldMatrixToThree(identityWorldMatrix, 0).elements.slice(12, 15)),
  [1, 2, -3]
);
assert.deepEqual(
  Array.from(packageRootMmdWorldMatrixToThree(identityWorldMatrix, 0).elements.slice(12, 15)),
  [1, 2, -3]
);

assert.equal(createMmdBuiltInToonTextureMap("toon")["toon10.bmp"], "toon/toon10.bmp");
assert.equal(createRootMmdBuiltInToonTextureMap("toon")["toon10.bmp"], "toon/toon10.bmp");
assert.equal(
  createPackageMmdBuiltInToonTextureMap("https://example.test/toon/")["toon01.bmp"],
  "https://example.test/toon/toon01.bmp"
);
assert.equal(
  createPackageRootMmdBuiltInToonTextureMap("https://example.test/toon/")["toon01.bmp"],
  "https://example.test/toon/toon01.bmp"
);
assert.equal(resolveRootMappedTexture("Textures\\Body.BMP", { "textures/body.bmp": "body" }), "body");
assert.equal(
  resolvePackageRootMappedTexture("Textures\\Body.BMP", { "textures/body.bmp": "body" }),
  "body"
);

const modelSourceBytes = new Uint8Array([1, 2, 3]);
assert.equal(await readModelSourceBytes(modelSourceBytes), modelSourceBytes);
assert.equal(await readRootModelSourceBytes(modelSourceBytes), modelSourceBytes);
assert.equal(await readPackageModelSourceBytes(modelSourceBytes), modelSourceBytes);
assert.equal(await readPackageRootModelSourceBytes(modelSourceBytes), modelSourceBytes);
assert.equal(MODEL_SOURCE_STRING_UNRESOLVED, "MODEL_SOURCE_STRING_UNRESOLVED");
assert.equal(ROOT_MODEL_SOURCE_STRING_UNRESOLVED, "MODEL_SOURCE_STRING_UNRESOLVED");
assert.equal(PACKAGE_ROOT_MODEL_SOURCE_STRING_UNRESOLVED, "MODEL_SOURCE_STRING_UNRESOLVED");
assert.equal(PACKAGE_THREE_MODEL_SOURCE_STRING_UNRESOLVED, "MODEL_SOURCE_STRING_UNRESOLVED");
assert.match(
  await readModelSourceBytes("model.pmx").then(
    () => "",
    (error) => String(error instanceof Error ? error.message : error)
  ),
  /MODEL_SOURCE_STRING_UNRESOLVED/
);

const smokeRigidBody = {
  boneIndex: 0,
  group: 1,
  mask: 0xffff,
  shape: "sphere",
  size: [1, 1, 1],
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  mass: 0,
  linearDamping: 0,
  angularDamping: 0,
  restitution: 0,
  friction: 0.5,
  mode: "static"
};
const distRigidBody = mapLegacyMmdRigidBodyToPhysicsRigidBody(smokeRigidBody, 0);
const packageRigidBody = mapPackageLegacyMmdRigidBodyToPhysicsRigidBody(smokeRigidBody, 0);
const concreteContext = {
  seconds: 0,
  deltaSeconds: 1 / 60,
  frame: 0,
  frameRate: 60,
  skeleton: { bones: [{ index: 0, parentIndex: -1, restTranslation: [0, 0, 0] }] },
  rigidBodies: [distRigidBody],
  joints: [],
  inputTranslations: new Float32Array(3),
  inputRotations: new Float32Array([0, 0, 0, 1]),
  inputWorldMatricesColumnMajor: new Float32Array(16),
  output: {
    translations: new Float32Array(3),
    rotations: new Float32Array(4),
    worldMatricesColumnMajor: new Float32Array(16)
  },
  bonePhysicsToggles: new Uint8Array([1])
};
assert.equal(validateConcreteMmdPhysicsStepContext(concreteContext).valid, true);
assert.equal(
  validatePackageConcreteMmdPhysicsStepContext({
    ...concreteContext,
    rigidBodies: [packageRigidBody]
  }).valid,
  true
);

const loader = new ThreeMmdLoader();
const rootLoader = new RootThreeMmdLoader();
const packageLoader = new PackageThreeMmdLoader();
const packageRootLoader = new PackageRootThreeMmdLoader();

async function expectLoaderMethodNotImplemented(loaderInstance, method) {
  assert.match(
    await loaderInstance[method](new Uint8Array()).then(
      () => "",
      (error) => String(error instanceof Error ? error.message : error)
    ),
    new RegExp(`ThreeMmdLoader\\.${method} is not implemented`)
  );
}

for (const loaderInstance of [loader, rootLoader, packageLoader, packageRootLoader]) {
  await expectLoaderMethodNotImplemented(loaderInstance, "loadModel");
  await expectLoaderMethodNotImplemented(loaderInstance, "loadAnimation");
  await expectLoaderMethodNotImplemented(loaderInstance, "loadPose");
  await expectLoaderMethodNotImplemented(loaderInstance, "loadPoseAnimation");
}

function createMinimalPmdBytes() {
  const bytes = [];
  const encoder = new TextEncoder();
  const u8 = (value) => bytes.push(value & 0xff);
  const u16 = (value) => {
    const buffer = new ArrayBuffer(2);
    new DataView(buffer).setUint16(0, value, true);
    bytes.push(...new Uint8Array(buffer));
  };
  const u32 = (value) => {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setUint32(0, value, true);
    bytes.push(...new Uint8Array(buffer));
  };
  const f32 = (value) => {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setFloat32(0, value, true);
    bytes.push(...new Uint8Array(buffer));
  };
  const fixedText = (value, byteLength) => {
    const encoded = encoder.encode(value).slice(0, byteLength);
    bytes.push(...encoded, ...Array.from({ length: byteLength - encoded.byteLength }, () => 0));
  };

  bytes.push(...encoder.encode("Pmd"));
  f32(1);
  fixedText("Smoke model", 20);
  fixedText("Smoke comment", 256);
  u32(0);
  u32(0);
  u32(0);
  u16(0);
  u16(0);
  u16(0);
  u8(0);
  u8(0);
  u32(0);
  u8(0);
  u32(0);
  u32(0);

  return new Uint8Array(bytes);
}

function createMinimalVmdBytes() {
  const bytes = [];
  const encoder = new TextEncoder();
  const u32 = (value) => {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setUint32(0, value, true);
    bytes.push(...new Uint8Array(buffer));
  };
  const fixedText = (value, byteLength) => {
    const encoded = encoder.encode(value).slice(0, byteLength);
    bytes.push(...encoded, ...Array.from({ length: byteLength - encoded.byteLength }, () => 0));
  };

  fixedText("Vocaloid Motion Data 0002", 30);
  fixedText("Smoke model", 20);
  u32(0);
  u32(0);
  u32(0);
  u32(0);
  u32(0);
  u32(0);

  return new Uint8Array(bytes);
}
