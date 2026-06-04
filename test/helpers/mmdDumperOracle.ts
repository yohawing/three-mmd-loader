import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type * as THREE from "three";

import { readMmdBoneUserData } from "../../src/runtime/userData.js";

export interface MmdDumperGoldenIkFixturesResult {
  readonly skipReason?: string;
  readonly cases: readonly MmdDumperGoldenIkCase[];
  readonly skippedCases: readonly MmdDumperGoldenIkSkippedCase[];
}

export interface MmdDumperGoldenIkCase {
  readonly name: string;
  readonly modelPath: string;
  readonly motionPath: string;
  readonly oraclePath: string;
  readonly frames: readonly number[];
  readonly watchBones: readonly string[];
  readonly matrixEpsilon: number;
}

export interface MmdDumperGoldenIkSkippedCase {
  readonly name: string;
  readonly reason: string;
}

export interface MmdDumperOracleDump {
  readonly schemaVersion: 1;
  readonly source: {
    readonly mmdVersion: string;
    readonly dumperVersion: string;
  };
  readonly frames: readonly MmdDumperOracleFrame[];
}

export interface MmdDumperOracleFrame {
  readonly frame: number;
  readonly models: readonly MmdDumperOracleModel[];
}

export interface MmdDumperOracleModel {
  readonly index: number;
  readonly name: string;
  readonly filename: string;
  readonly visible: boolean;
  readonly bones: readonly MmdDumperOracleBone[];
}

export interface MmdDumperOracleBone {
  readonly index: number;
  readonly name: string;
  readonly worldMatrix: readonly number[];
}

export interface FocusedBoneComparison {
  readonly ok: boolean;
  readonly boneName: string;
  readonly boneIndex: number;
  readonly maxAbsError: number;
  readonly worst: {
    readonly index: number;
    readonly expected: number;
    readonly actual: number;
    readonly error: number;
  } | null;
}

interface GoldenIkBatchManifest {
  readonly cases: readonly GoldenIkBatchCase[];
}

interface GoldenIkBatchCase {
  readonly name: string;
  readonly pmx: string;
  readonly vmd: string;
  readonly frames: readonly number[];
}

interface NumberArrayComparison {
  readonly ok: boolean;
  readonly maxAbsError: number;
  readonly worst: {
    readonly index: number;
    readonly expected: number;
    readonly actual: number;
    readonly error: number;
  } | null;
}

interface GoldenIkFixture {
  readonly name: string;
  readonly output: string;
  readonly frames: readonly number[];
}

const defaultOracleRoot = resolve("..", "MMDDumper", "out", "golden-ik-oracle");

const defaultFocusedIkBoneNames = [
  "左足",
  "右足",
  "左ひざ",
  "右ひざ",
  "左足首",
  "右足首",
  "左つま先",
  "右つま先",
  "左足ＩＫ",
  "右足ＩＫ",
  "左つま先ＩＫ",
  "右つま先ＩＫ",
  "左足IK",
  "右足IK",
  "左つま先IK",
  "右つま先IK"
] as const;

const mmdThreeAxisSigns = [1, 1, -1, 1] as const;

export async function loadMmdDumperGoldenIkFixtures(
  oracleRoot = process.env.THREE_MMD_LOADER_GOLDEN_IK_ORACLE_ROOT ?? defaultOracleRoot
): Promise<MmdDumperGoldenIkFixturesResult> {
  if (!(await fileExists(oracleRoot))) {
    return {
      skipReason: `MMDDumper golden IK oracle fixture not found: ${oracleRoot}`,
      cases: [],
      skippedCases: []
    };
  }

  const manifestPath = resolve(oracleRoot, "oracle-batch.json");
  if (!(await fileExists(manifestPath))) {
    return {
      skipReason: `MMDDumper golden IK manifest not found: ${manifestPath}`,
      cases: [],
      skippedCases: []
    };
  }

  const manifest = parseBatchManifest(
    JSON.parse(await readFile(manifestPath, "utf8")) as unknown,
    manifestPath
  );
  const cases: MmdDumperGoldenIkCase[] = [];
  const skippedCases: MmdDumperGoldenIkSkippedCase[] = [];

  for (const manifestCase of manifest.cases) {
    const caseDir = resolve(oracleRoot, manifestCase.name);
    const fixturePath = resolve(caseDir, "fixture.json");
    if (!(await fileExists(fixturePath))) {
      skippedCases.push({ name: manifestCase.name, reason: `missing ${fixturePath}` });
      continue;
    }

    const fixture = parseFixture(
      JSON.parse(await readFile(fixturePath, "utf8")) as unknown,
      fixturePath
    );
    const resolvedCase: MmdDumperGoldenIkCase = {
      name: manifestCase.name,
      modelPath: manifestCase.pmx,
      motionPath: manifestCase.vmd,
      oraclePath: resolveMaybeAbsolute(dirname(fixturePath), fixture.output),
      frames: fixture.frames.length > 0 ? fixture.frames : manifestCase.frames,
      watchBones: defaultFocusedIkBoneNames,
      matrixEpsilon: 0.75
    };

    const missingPath = await firstMissingPath([
      resolvedCase.modelPath,
      resolvedCase.motionPath,
      resolvedCase.oraclePath
    ]);
    if (missingPath) {
      skippedCases.push({ name: manifestCase.name, reason: `missing ${missingPath}` });
      continue;
    }
    cases.push(resolvedCase);
  }

  return {
    skipReason:
      cases.length === 0 && skippedCases.length > 0
        ? `all MMDDumper golden IK cases are unavailable (${skippedCases
            .map((skippedCase) => `${skippedCase.name}: ${skippedCase.reason}`)
            .join("; ")})`
        : undefined,
    cases,
    skippedCases
  };
}

export async function readMmdDumperOracleDump(
  path: string,
  targetFrames?: readonly number[]
): Promise<MmdDumperOracleDump> {
  const targetFrameSet =
    targetFrames === undefined ? undefined : new Set(targetFrames.map((frame) => Math.round(frame)));
  const lines = (await readFile(path, "utf8")).split(/\r?\n/);
  const frames: MmdDumperOracleFrame[] = [];
  let source: MmdDumperOracleDump["source"] | undefined;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]?.trim();
    if (!line) {
      continue;
    }
    const record = parseOracleRecord(
      JSON.parse(line) as unknown,
      `${path}:${lineIndex + 1}`
    );
    source ??= record.source;
    const normalizedFrame = Math.round(record.frame);
    if (targetFrameSet === undefined || targetFrameSet.has(normalizedFrame)) {
      frames.push({ frame: normalizedFrame, models: record.models });
    }
  }

  if (!source) {
    throw new Error(`MMDDumper oracle JSONL is empty: ${path}`);
  }
  return {
    schemaVersion: 1,
    source,
    frames
  };
}

export function compareFocusedBoneMatrices(
  mesh: THREE.SkinnedMesh,
  oracle: MmdDumperOracleDump,
  frameNumber: number,
  boneNames: readonly string[],
  epsilon: number
): readonly FocusedBoneComparison[] {
  const frame = findOracleFrame(oracle, frameNumber);
  const model = frame.models[0];
  if (!model) {
    throw new Error(`MMDDumper oracle model not found: frame=${frameNumber}`);
  }

  const comparisons: FocusedBoneComparison[] = [];
  for (const boneName of boneNames) {
    const oracleBone = findOracleBone(model, boneName);
    if (!oracleBone) {
      continue;
    }
    const runtimeBoneIndex = findRuntimeBoneIndex(mesh, boneName);
    if (runtimeBoneIndex < 0) {
      continue;
    }

    const actual = extractMmdWorldBoneMatrix(mesh, runtimeBoneIndex);
    const expected = oracleBone.worldMatrix;
    const comparison = compareNumberArrays(actual, expected, epsilon);
    comparisons.push({
      ok: comparison.ok,
      boneName,
      boneIndex: runtimeBoneIndex,
      maxAbsError: comparison.maxAbsError,
      worst: comparison.worst
    });
  }

  return comparisons;
}

export function formatFocusedBoneMismatch(
  caseName: string,
  frame: number,
  comparison: FocusedBoneComparison
): string {
  const worst = comparison.worst;
  return [
    `${caseName} frame=${frame} bone=${comparison.boneName} maxAbsError=${comparison.maxAbsError}`,
    worst
      ? `worst index=${worst.index} expected=${worst.expected} actual=${worst.actual} error=${worst.error}`
      : "no worst sample"
  ].join("; ");
}

function parseBatchManifest(raw: unknown, label: string): GoldenIkBatchManifest {
  const manifest = readRecord(raw, label);
  return {
    cases: readArray(manifest.cases, `${label}.cases`).map((entry, index) =>
      parseBatchCase(entry, `${label}.cases[${index}]`)
    )
  };
}

function parseBatchCase(raw: unknown, label: string): GoldenIkBatchCase {
  const value = readRecord(raw, label);
  return {
    name: readString(value.name, `${label}.name`),
    pmx: readString(value.pmx, `${label}.pmx`),
    vmd: readString(value.vmd, `${label}.vmd`),
    frames: readNumberArray(value.frames, `${label}.frames`)
  };
}

function parseFixture(raw: unknown, label: string): GoldenIkFixture {
  const fixture = readRecord(raw, label);
  return {
    name: readString(fixture.name, `${label}.name`),
    output: readString(fixture.output, `${label}.output`),
    frames: readNumberArray(fixture.frames, `${label}.frames`)
  };
}

function parseOracleRecord(raw: unknown, label: string): MmdDumperOracleFrame & {
  readonly source: MmdDumperOracleDump["source"];
} {
  const record = readRecord(raw, label);
  if (readFiniteNumber(record.schemaVersion, `${label}.schemaVersion`) !== 1) {
    throw new Error(`${label}.schemaVersion must be 1`);
  }
  return {
    source: parseSource(record.source, `${label}.source`),
    frame: readFiniteNumber(record.frame, `${label}.frame`),
    models: readArray(record.models, `${label}.models`).map((entry, index) =>
      parseModel(entry, `${label}.models[${index}]`)
    )
  };
}

function parseSource(raw: unknown, label: string): MmdDumperOracleDump["source"] {
  const source = readRecord(raw, label);
  return {
    mmdVersion: readString(source.mmdVersion, `${label}.mmdVersion`),
    dumperVersion: readString(source.dumperVersion, `${label}.dumperVersion`)
  };
}

function parseModel(raw: unknown, label: string): MmdDumperOracleModel {
  const model = readRecord(raw, label);
  return {
    index: readInteger(model.index, `${label}.index`),
    name: readString(model.name, `${label}.name`),
    filename: readString(model.filename, `${label}.filename`),
    visible: readBoolean(model.visible, `${label}.visible`),
    bones: readArray(model.bones, `${label}.bones`).map((entry, index) =>
      parseBone(entry, `${label}.bones[${index}]`)
    )
  };
}

function parseBone(raw: unknown, label: string): MmdDumperOracleBone {
  const bone = readRecord(raw, label);
  const worldMatrix = readNumberArray(bone.worldMatrix, `${label}.worldMatrix`);
  if (worldMatrix.length !== 16) {
    throw new Error(`${label}.worldMatrix must have 16 components`);
  }
  return {
    index: readInteger(bone.index, `${label}.index`),
    name: readString(bone.name, `${label}.name`),
    worldMatrix
  };
}

function findOracleFrame(
  oracle: MmdDumperOracleDump,
  frameNumber: number
): MmdDumperOracleFrame {
  const frame = oracle.frames.find((candidate) => candidate.frame === frameNumber);
  if (!frame) {
    throw new Error(`MMDDumper oracle frame not found: ${frameNumber}`);
  }
  return frame;
}

function findOracleBone(
  model: MmdDumperOracleModel,
  boneName: string
): MmdDumperOracleBone | undefined {
  return model.bones.find((bone) => bone.name === boneName);
}

function compareNumberArrays(
  actual: readonly number[],
  expected: readonly number[],
  epsilon: number
): NumberArrayComparison {
  if (actual.length !== expected.length) {
    throw new Error(`Array length mismatch: actual=${actual.length} expected=${expected.length}`);
  }
  let maxAbsError = 0;
  let worst: NumberArrayComparison["worst"] = null;
  for (let index = 0; index < actual.length; index += 1) {
    const actualValue = actual[index] ?? 0;
    const expectedValue = expected[index] ?? 0;
    const error = Math.abs(actualValue - expectedValue);
    if (error > maxAbsError) {
      maxAbsError = error;
      worst = {
        index,
        expected: expectedValue,
        actual: actualValue,
        error
      };
    }
  }
  return {
    ok: maxAbsError <= epsilon,
    maxAbsError,
    worst
  };
}

function extractMmdWorldBoneMatrix(mesh: THREE.SkinnedMesh, boneIndex: number): readonly number[] {
  mesh.updateWorldMatrix(false, true);
  const bone = mesh.skeleton.bones[boneIndex];
  if (!bone) {
    throw new Error(`Runtime bone not found: ${boneIndex}`);
  }
  const elements = bone.matrixWorld.elements;
  const values: number[] = [];
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      values.push(
        (elements[column * 4 + row] ?? 0) *
          (mmdThreeAxisSigns[row] ?? 1) *
          (mmdThreeAxisSigns[column] ?? 1)
      );
    }
  }
  return values;
}

function findRuntimeBoneIndex(mesh: THREE.SkinnedMesh, boneName: string): number {
  return mesh.skeleton.bones.findIndex((bone) => {
    const userData = readMmdBoneUserData(bone);
    return (
      bone.name === boneName ||
      userData.mmdBoneName === boneName ||
      userData.mmdEnglishBoneName === boneName
    );
  });
}

async function firstMissingPath(paths: readonly string[]): Promise<string | undefined> {
  for (const path of paths) {
    if (!(await fileExists(path))) {
      return path;
    }
  }
  return undefined;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function resolveMaybeAbsolute(basePath: string, path: string): string {
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\\\") ? path : resolve(basePath, path);
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
  const values = readArray(raw, label).map((value, index) =>
    readFiniteNumber(value, `${label}[${index}]`)
  );
  if (values.length === 0) {
    throw new Error(`${label} must contain at least one number`);
  }
  return values;
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
