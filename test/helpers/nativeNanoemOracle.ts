import { readFile } from "node:fs/promises";

import type * as THREE from "three";

export type NativeNanoemOracleStageName =
  | "vmdInterpolation"
  | "appendTransform"
  | "ik"
  | "physics";

export interface NativeNanoemOracleDump {
  readonly schemaVersion: 1;
  readonly kind: "native-nanoem-runtime-dump";
  readonly coordinateSpace: "mmd-world";
  readonly matrixOrder: "column-major";
  readonly model: NativeNanoemOracleModel | null;
  readonly frames: readonly NativeNanoemOracleFrame[];
}

export interface NativeNanoemOracleModel {
  readonly bones?: readonly NativeNanoemOracleIndexedName[];
  readonly morphs?: readonly NativeNanoemOracleIndexedName[];
}

export interface NativeNanoemOracleIndexedName {
  readonly index: number;
  readonly name: string;
}

export interface NativeNanoemOracleFrame {
  readonly frame: number;
  readonly stages: Partial<Record<NativeNanoemOracleStageName, NativeNanoemOracleStage>>;
  readonly camera: NativeNanoemOracleCamera | null;
}

export interface NativeNanoemOracleStage {
  readonly worldMatricesColumnMajor: readonly number[];
  readonly morphWeights: readonly number[];
}

export interface NativeNanoemOracleCamera {
  readonly distance: number;
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly fov: number;
  readonly perspective: boolean;
}

export interface MatrixComparisonIssue {
  readonly index: number;
  readonly expected: number;
  readonly actual: number;
  readonly error: number;
}

export interface MatrixComparisonResult {
  readonly ok: boolean;
  readonly maxAbsError: number;
  readonly worst: MatrixComparisonIssue | null;
}

const stageNames = ["vmdInterpolation", "appendTransform", "ik", "physics"] as const;
const mmdThreeAxisSigns = [1, 1, -1, 1] as const;

export async function readNativeNanoemOracleDump(
  path: string
): Promise<NativeNanoemOracleDump> {
  const raw = JSON.parse(await readFile(path, "utf8")) as unknown;
  return parseNativeNanoemOracleDump(raw, path);
}

export function parseNativeNanoemOracleDump(
  raw: unknown,
  label = "native nanoem oracle"
): NativeNanoemOracleDump {
  const dump = readRecord(raw, label);
  assertEqual(dump.kind, "native-nanoem-runtime-dump", `${label}.kind`);
  assertEqual(dump.coordinateSpace, "mmd-world", `${label}.coordinateSpace`);
  assertEqual(dump.matrixOrder, "column-major", `${label}.matrixOrder`);
  const frames = readArray(dump.frames, `${label}.frames`).map((frame, frameIndex) =>
    parseOracleFrame(frame, `${label}.frames[${frameIndex}]`)
  );
  return {
    schemaVersion: 1,
    kind: "native-nanoem-runtime-dump",
    coordinateSpace: "mmd-world",
    matrixOrder: "column-major",
    model: parseOracleModel(dump.model, `${label}.model`),
    frames
  };
}

export function findOracleFrame(
  dump: NativeNanoemOracleDump,
  frameNumber: number
): NativeNanoemOracleFrame {
  const frame = dump.frames.find((candidate) => candidate.frame === frameNumber);
  if (!frame) {
    throw new Error(`Native nanoem oracle frame not found: ${frameNumber}`);
  }
  return frame;
}

export function getOracleStage(
  dump: NativeNanoemOracleDump,
  frameNumber: number,
  stageName: NativeNanoemOracleStageName
): NativeNanoemOracleStage {
  const stage = findOracleFrame(dump, frameNumber).stages[stageName];
  if (!stage) {
    throw new Error(`Native nanoem oracle stage not found: frame=${frameNumber} stage=${stageName}`);
  }
  return stage;
}

export function getOracleCamera(
  dump: NativeNanoemOracleDump,
  frameNumber: number
): NativeNanoemOracleCamera | null {
  return findOracleFrame(dump, frameNumber).camera;
}

export function getOracleBoneMatrix(
  dump: NativeNanoemOracleDump,
  frameNumber: number,
  stageName: NativeNanoemOracleStageName,
  boneNameOrIndex: string | number
): readonly number[] {
  const boneIndex =
    typeof boneNameOrIndex === "number" ? boneNameOrIndex : findOracleBoneIndex(dump, boneNameOrIndex);
  const stage = getOracleStage(dump, frameNumber, stageName);
  return sliceMatrix16(stage.worldMatricesColumnMajor, boneIndex, `bone=${boneNameOrIndex}`);
}

export function getOracleMorphWeight(
  dump: NativeNanoemOracleDump,
  frameNumber: number,
  stageName: NativeNanoemOracleStageName,
  morphNameOrIndex: string | number
): number {
  const morphIndex =
    typeof morphNameOrIndex === "number"
      ? morphNameOrIndex
      : findOracleMorphIndex(dump, morphNameOrIndex);
  const stage = getOracleStage(dump, frameNumber, stageName);
  const value = stage.morphWeights[morphIndex];
  if (!Number.isFinite(value)) {
    throw new Error(`Native nanoem oracle morph weight not found: morph=${morphNameOrIndex}`);
  }
  return value;
}

export function extractMmdWorldBoneMatrix(
  mesh: THREE.SkinnedMesh,
  boneIndex: number
): readonly number[] {
  mesh.updateWorldMatrix(false, true);
  const bone = mesh.skeleton.bones[boneIndex];
  if (!bone) {
    throw new Error(`Runtime bone not found: index=${boneIndex}`);
  }
  const elements = bone.matrixWorld.elements;
  const matrix: number[] = [];
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      matrix.push(mmdThreeAxisSigns[row] * elements[column * 4 + row] * mmdThreeAxisSigns[column]);
    }
  }
  return matrix;
}

export function compareNumberArrays(
  actual: readonly number[],
  expected: readonly number[],
  epsilon: number
): MatrixComparisonResult {
  if (actual.length !== expected.length) {
    throw new Error(`Comparison length mismatch: actual=${actual.length} expected=${expected.length}`);
  }
  let maxAbsError = 0;
  let worst: MatrixComparisonIssue | null = null;
  for (let index = 0; index < expected.length; index += 1) {
    const actualValue = Number(actual[index]);
    const expectedValue = Number(expected[index]);
    const error = Math.abs(actualValue - expectedValue);
    if (!Number.isFinite(actualValue) || !Number.isFinite(expectedValue)) {
      throw new Error(`Comparison value must be finite: index=${index}`);
    }
    if (error > maxAbsError || !worst) {
      maxAbsError = error;
      worst = { index, expected: expectedValue, actual: actualValue, error };
    }
  }
  return {
    ok: maxAbsError <= epsilon,
    maxAbsError,
    worst
  };
}

export function findOracleBoneIndex(dump: NativeNanoemOracleDump, boneName: string): number {
  const bone = dump.model?.bones?.find((candidate) => candidate.name === boneName);
  if (!bone) {
    throw new Error(`Native nanoem oracle bone not found: ${boneName}`);
  }
  return bone.index;
}

export function findOracleMorphIndex(dump: NativeNanoemOracleDump, morphName: string): number {
  const morph = dump.model?.morphs?.find((candidate) => candidate.name === morphName);
  if (!morph) {
    throw new Error(`Native nanoem oracle morph not found: ${morphName}`);
  }
  return morph.index;
}

function parseOracleFrame(raw: unknown, label: string): NativeNanoemOracleFrame {
  const frame = readRecord(raw, label);
  const frameNumber = readFiniteNumber(frame.frame, `${label}.frame`);
  const stages = readRecord(frame.stages, `${label}.stages`);
  const parsedStages: Partial<Record<NativeNanoemOracleStageName, NativeNanoemOracleStage>> = {};
  for (const stageName of stageNames) {
    if (stages[stageName] !== undefined) {
      parsedStages[stageName] = parseOracleStage(stages[stageName], `${label}.stages.${stageName}`);
    }
  }
  return {
    frame: frameNumber,
    stages: parsedStages,
    camera: parseOracleCamera(frame.camera, `${label}.camera`)
  };
}

function parseOracleStage(raw: unknown, label: string): NativeNanoemOracleStage {
  const stage = readRecord(raw, label);
  const matrices = readNumberArray(
    stage.worldMatricesColumnMajor,
    `${label}.worldMatricesColumnMajor`
  );
  if (matrices.length % 16 !== 0) {
    throw new Error(`${label}.worldMatricesColumnMajor length must be a multiple of 16`);
  }
  return {
    worldMatricesColumnMajor: matrices,
    morphWeights: readNumberArray(stage.morphWeights, `${label}.morphWeights`)
  };
}

function parseOracleModel(raw: unknown, label: string): NativeNanoemOracleModel | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  const model = readRecord(raw, label);
  return {
    bones: model.bones === undefined ? undefined : parseIndexedNames(model.bones, `${label}.bones`),
    morphs:
      model.morphs === undefined ? undefined : parseIndexedNames(model.morphs, `${label}.morphs`)
  };
}

function parseOracleCamera(raw: unknown, label: string): NativeNanoemOracleCamera | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  const camera = readRecord(raw, label);
  return {
    distance: readFiniteNumber(camera.distance, `${label}.distance`),
    position: readVec3(camera.position, `${label}.position`),
    rotation: readVec3(camera.rotation, `${label}.rotation`),
    fov: readFiniteNumber(camera.fov, `${label}.fov`),
    perspective: readBoolean(camera.perspective, `${label}.perspective`)
  };
}

function parseIndexedNames(raw: unknown, label: string): readonly NativeNanoemOracleIndexedName[] {
  return readArray(raw, label).map((entry, index) => {
    const value = readRecord(entry, `${label}[${index}]`);
    return {
      index: readInteger(value.index, `${label}[${index}].index`),
      name: readString(value.name, `${label}[${index}].name`)
    };
  });
}

function readVec3(raw: unknown, label: string): [number, number, number] {
  const values = readNumberArray(raw, label);
  if (values.length !== 3) {
    throw new Error(`${label} must have 3 components`);
  }
  return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0];
}

function sliceMatrix16(
  matrices: readonly number[],
  boneIndex: number,
  context: string
): readonly number[] {
  const offset = boneIndex * 16;
  if (boneIndex < 0 || offset + 16 > matrices.length) {
    throw new Error(`Native nanoem oracle bone matrix not found: ${context}`);
  }
  return matrices.slice(offset, offset + 16);
}

function readRecord(raw: unknown, label: string): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${label} must be an object`);
  }
  return raw as Record<string, unknown>;
}

function readArray(raw: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(raw)) {
    throw new Error(`${label} must be an array`);
  }
  return raw;
}

function readNumberArray(raw: unknown, label: string): readonly number[] {
  return readArray(raw, label).map((value, index) =>
    readFiniteNumber(value, `${label}[${index}]`)
  );
}

function readFiniteNumber(raw: unknown, label: string): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    throw new Error(`${label} must be a finite number`);
  }
  return raw;
}

function readInteger(raw: unknown, label: string): number {
  const value = readFiniteNumber(raw, label);
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer`);
  }
  return value;
}

function readString(raw: unknown, label: string): string {
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return raw;
}

function readBoolean(raw: unknown, label: string): boolean {
  if (typeof raw !== "boolean") {
    throw new Error(`${label} must be a boolean`);
  }
  return raw;
}

function assertEqual(actual: unknown, expected: string, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label} must be ${expected}`);
  }
}
