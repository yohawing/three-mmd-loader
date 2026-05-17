import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { TextEncoder } from "node:util";

import {
  DefaultMmdRuntime as PackageRootDefaultMmdRuntime,
  ThreeMmdLoader as PackageRootThreeMmdLoader,
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
  createAmmoMmdPhysicsBackend as createPackageAmmoMmdPhysicsBackend,
  createDisabledMmdPhysicsBackend as createPackageDisabledMmdPhysicsBackend,
  validateConcreteMmdPhysicsStepContext as validatePackageConcreteMmdPhysicsStepContext
} from "@yohawing/three-mmd-loader/physics";
import { DefaultMmdRuntime as PackageDefaultMmdRuntime } from "@yohawing/three-mmd-loader/runtime";
import {
  createMmdBuiltInToonTextureMap as createPackageMmdBuiltInToonTextureMap,
  createThreeBufferGeometry as createPackageThreeBufferGeometry,
  createThreeSkeleton as createPackageThreeSkeleton,
  mmdWorldMatrixToThree as packageMmdWorldMatrixToThree,
  ThreeMmdLoader as PackageThreeMmdLoader
} from "@yohawing/three-mmd-loader/three";
import {
  DefaultMmdRuntime as RootDefaultMmdRuntime,
  ThreeMmdLoader as RootThreeMmdLoader,
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
  parseVpdPose as parseRootVpdPose
} from "../dist/index.js";
import {
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
  validateConcreteMmdPhysicsStepContext
} from "../dist/physics/index.js";
import { DefaultMmdRuntime } from "../dist/runtime/index.js";
import {
  createMmdBuiltInToonTextureMap,
  createThreeBufferGeometry,
  createThreeSkeleton,
  mmdWorldMatrixToThree,
  ThreeMmdLoader
} from "../dist/three/index.js";

const pmxBytes = await readFile(resolve("test", "fixtures", "test_1bone_cube.pmx"));
assert.equal(detectModelFormat(pmxBytes), "pmx");
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

const smokeRigidBody = {
  index: 0,
  boneIndex: 0,
  motionType: "static",
  shape: { type: "sphere", size: [1, 1, 1] },
  localTranslation: [0, 0, 0],
  localRotation: [0, 0, 0, 1],
  mass: 0,
  linearDamping: 0,
  angularDamping: 0,
  restitution: 0,
  friction: 0.5,
  collisionGroup: 1,
  collisionMask: 0xffff
};
const concreteContext = {
  seconds: 0,
  deltaSeconds: 1 / 60,
  frame: 0,
  frameRate: 60,
  skeleton: { bones: [{ index: 0, parentIndex: -1, restTranslation: [0, 0, 0] }] },
  rigidBodies: [smokeRigidBody],
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
assert.equal(validatePackageConcreteMmdPhysicsStepContext(concreteContext).valid, true);

const ammoModule = await import("ammo.js");
const Ammo = ammoModule.default ?? ammoModule;
const ammoBackend = createPackageAmmoMmdPhysicsBackend(Ammo);
assert.equal(ammoBackend.disabled, false);
assert.equal(ammoBackend.disposed, false);
assert.equal(ammoBackend.step(createAmmoStepContext()).simulated, false);
assert.equal(ammoBackend.disposed, false);
ammoBackend.dispose?.();
assert.equal(ammoBackend.disposed, true);

const loader = new ThreeMmdLoader();
const rootLoader = new RootThreeMmdLoader();
const packageLoader = new PackageThreeMmdLoader();
const packageRootLoader = new PackageRootThreeMmdLoader();

async function expectLoaderMethodNotImplemented(loaderInstance, method) {
  const source = method === "loadModel" ? pmxBytes : new Uint8Array();
  assert.match(
    await loaderInstance[method](source).then(
      () => "",
      (error) => String(error instanceof Error ? error.message : error)
    ),
    new RegExp(`ThreeMmdLoader\\.${method}.*is not implemented`)
  );
}

for (const loaderInstance of [loader, rootLoader, packageLoader, packageRootLoader]) {
  const model = await loaderInstance.loadModel(pmxBytes);
  assert.equal(model.mesh.name, "TestModel");
  assert.equal(model.mesh.skeleton.bones.length, 1);
  assert.equal(model.mesh.geometry.getAttribute("position").count, 14);
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

function createAmmoStepContext() {
  const inputTranslations = new Float32Array([0, 0, 0]);
  const inputRotations = new Float32Array([0, 0, 0, 1]);
  const inputWorldMatricesColumnMajor = new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ]);

  return {
    seconds: 0,
    deltaSeconds: 0,
    frame: 0,
    frameRate: 60,
    skeleton: {
      bones: [
        {
          index: 0,
          name: "bone",
          parentIndex: -1,
          restTranslation: [0, 0, 0],
          restRotation: [0, 0, 0, 1]
        }
      ]
    },
    rigidBodies: [
      {
        index: 0,
        name: "body",
        boneIndex: 0,
        motionType: "dynamic",
        shape: {
          type: "sphere",
          size: [0.25, 0.25, 0.25]
        },
        localTranslation: [0, 1, 0],
        localRotation: [0, 0, 0, 1],
        mass: 1,
        linearDamping: 0,
        angularDamping: 0,
        restitution: 0,
        friction: 0.5,
        collisionGroup: 0,
        collisionMask: 0xffff
      }
    ],
    joints: [],
    inputTranslations,
    inputRotations,
    inputWorldMatricesColumnMajor,
    output: {
      translations: new Float32Array(inputTranslations),
      rotations: new Float32Array(inputRotations),
      worldMatricesColumnMajor: new Float32Array(inputWorldMatricesColumnMajor),
      updatedBoneIndices: []
    }
  };
}
