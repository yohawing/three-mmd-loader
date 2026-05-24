import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { NativeNanoemOracleStageName } from "./nativeNanoemOracle.js";

export interface LocalPlaybackFixturesResult {
  readonly skipReason?: string;
  readonly cases: readonly LocalPlaybackCase[];
  readonly skippedCases: readonly LocalPlaybackSkippedCase[];
}

export interface LocalPlaybackCase {
  readonly name: string;
  readonly modelPath: string;
  readonly motionPath: string;
  readonly oraclePath: string;
  readonly stage: NativeNanoemOracleStageName;
  readonly frames: readonly number[];
  readonly watchBones: readonly string[];
  readonly matrixEpsilon: number;
  readonly morphEpsilon: number;
}

export interface LocalPlaybackSkippedCase {
  readonly name: string;
  readonly reason: string;
}

interface FixtureInventory {
  readonly schemaVersion: 1;
  readonly basePath?: string;
  readonly paths: {
    readonly releaseSmoke: {
      readonly byExtension: {
        readonly pmx: Record<string, string>;
        readonly pmd: Record<string, string>;
        readonly vmd: Record<string, string>;
        readonly vpd: Record<string, string>;
      };
    };
    readonly playbackSmoke?: {
      readonly cases?: readonly PlaybackSmokeCaseConfig[];
    };
  };
}

interface PlaybackSmokeCaseConfig {
  readonly name: string;
  readonly model: {
    readonly extension: "pmx" | "pmd";
    readonly key: string;
  };
  readonly motion: {
    readonly key: string;
  };
  readonly oracle: string;
  readonly oracleKind: "native-nanoem-runtime-dump";
  readonly stage?: NativeNanoemOracleStageName;
  readonly frames: readonly number[];
  readonly watchBones: readonly string[];
  readonly matrixEpsilon?: number;
  readonly morphEpsilon?: number;
}

const defaultInventoryPath = "test/fixtures/fixtures.local.json";
const stageNames = new Set<NativeNanoemOracleStageName>([
  "vmdInterpolation",
  "appendTransform",
  "ik",
  "physics"
]);

export async function loadLocalPlaybackFixtures(
  inventoryPath = defaultInventoryPath
): Promise<LocalPlaybackFixturesResult> {
  if (!(await fileExists(inventoryPath))) {
    return {
      skipReason: `local fixture inventory not found: ${inventoryPath}`,
      cases: [],
      skippedCases: []
    };
  }

  const inventory = parseFixtureInventory(
    JSON.parse(await readFile(inventoryPath, "utf8")) as unknown,
    inventoryPath
  );
  const rawCases = inventory.paths.playbackSmoke?.cases ?? [];
  if (rawCases.length === 0) {
    return {
      skipReason: `no paths.playbackSmoke.cases entries in ${inventoryPath}`,
      cases: [],
      skippedCases: []
    };
  }

  const inventoryDir = dirname(resolve(inventoryPath));
  const basePath = resolve(inventoryDir, inventory.basePath ?? ".");
  const cases: LocalPlaybackCase[] = [];
  const skippedCases: LocalPlaybackSkippedCase[] = [];

  for (const rawCase of rawCases) {
    const resolvedCase = resolvePlaybackCase(rawCase, inventory, basePath);
    const missingPath = await firstMissingPath([
      resolvedCase.modelPath,
      resolvedCase.motionPath,
      resolvedCase.oraclePath
    ]);
    if (missingPath) {
      skippedCases.push({
        name: resolvedCase.name,
        reason: `missing ${missingPath}`
      });
      continue;
    }
    cases.push(resolvedCase);
  }

  return {
    skipReason:
      cases.length === 0 && skippedCases.length > 0
        ? `all local playback cases are unavailable (${skippedCases
            .map((skippedCase) => `${skippedCase.name}: ${skippedCase.reason}`)
            .join("; ")})`
        : undefined,
    cases,
    skippedCases
  };
}

function resolvePlaybackCase(
  rawCase: PlaybackSmokeCaseConfig,
  inventory: FixtureInventory,
  basePath: string
): LocalPlaybackCase {
  const modelPath = inventory.paths.releaseSmoke.byExtension[rawCase.model.extension][rawCase.model.key];
  const motionPath = inventory.paths.releaseSmoke.byExtension.vmd[rawCase.motion.key];
  if (!modelPath) {
    throw new Error(
      `${rawCase.name}: model key not found: ${rawCase.model.extension}.${rawCase.model.key}`
    );
  }
  if (!motionPath) {
    throw new Error(`${rawCase.name}: motion key not found: vmd.${rawCase.motion.key}`);
  }

  return {
    name: rawCase.name,
    modelPath: resolve(basePath, modelPath),
    motionPath: resolve(basePath, motionPath),
    oraclePath: resolve(basePath, rawCase.oracle),
    stage: rawCase.stage ?? "physics",
    frames: rawCase.frames,
    watchBones: rawCase.watchBones,
    matrixEpsilon: rawCase.matrixEpsilon ?? 1e-4,
    morphEpsilon: rawCase.morphEpsilon ?? 1e-4
  };
}

function parseFixtureInventory(raw: unknown, label: string): FixtureInventory {
  const inventory = readRecord(raw, label);
  if (inventory.schemaVersion !== 1) {
    throw new Error(`${label}.schemaVersion must be 1`);
  }
  const paths = readRecord(inventory.paths, `${label}.paths`);
  const releaseSmoke = readRecord(paths.releaseSmoke, `${label}.paths.releaseSmoke`);
  const byExtension = readRecord(
    releaseSmoke.byExtension,
    `${label}.paths.releaseSmoke.byExtension`
  );
  const playbackSmoke =
    paths.playbackSmoke === undefined
      ? undefined
      : parsePlaybackSmoke(paths.playbackSmoke, `${label}.paths.playbackSmoke`);
  return {
    schemaVersion: 1,
    basePath:
      inventory.basePath === undefined
        ? undefined
        : readString(inventory.basePath, `${label}.basePath`),
    paths: {
      releaseSmoke: {
        byExtension: {
          pmx: parseStringMap(byExtension.pmx, `${label}.paths.releaseSmoke.byExtension.pmx`),
          pmd: parseStringMap(byExtension.pmd, `${label}.paths.releaseSmoke.byExtension.pmd`),
          vmd: parseStringMap(byExtension.vmd, `${label}.paths.releaseSmoke.byExtension.vmd`),
          vpd: parseStringMap(byExtension.vpd, `${label}.paths.releaseSmoke.byExtension.vpd`)
        }
      },
      playbackSmoke
    }
  };
}

function parsePlaybackSmoke(raw: unknown, label: string): FixtureInventory["paths"]["playbackSmoke"] {
  const playbackSmoke = readRecord(raw, label);
  return {
    cases:
      playbackSmoke.cases === undefined
        ? []
        : readArray(playbackSmoke.cases, `${label}.cases`).map((entry, index) =>
            parsePlaybackCaseConfig(entry, `${label}.cases[${index}]`)
          )
  };
}

function parsePlaybackCaseConfig(raw: unknown, label: string): PlaybackSmokeCaseConfig {
  const config = readRecord(raw, label);
  const model = readRecord(config.model, `${label}.model`);
  const motion = readRecord(config.motion, `${label}.motion`);
  const extension = readString(model.extension, `${label}.model.extension`);
  const stage = config.stage === undefined ? "physics" : readStage(config.stage, `${label}.stage`);
  if (extension !== "pmx" && extension !== "pmd") {
    throw new Error(`${label}.model.extension must be pmx or pmd`);
  }
  if (config.oracleKind !== "native-nanoem-runtime-dump") {
    throw new Error(`${label}.oracleKind must be native-nanoem-runtime-dump`);
  }
  return {
    name: readString(config.name, `${label}.name`),
    model: {
      extension,
      key: readString(model.key, `${label}.model.key`)
    },
    motion: {
      key: readString(motion.key, `${label}.motion.key`)
    },
    oracle: readString(config.oracle, `${label}.oracle`),
    oracleKind: "native-nanoem-runtime-dump",
    stage,
    frames: readNumberArray(config.frames, `${label}.frames`),
    watchBones: readStringArray(config.watchBones, `${label}.watchBones`),
    matrixEpsilon:
      config.matrixEpsilon === undefined
        ? undefined
        : readPositiveNumber(config.matrixEpsilon, `${label}.matrixEpsilon`),
    morphEpsilon:
      config.morphEpsilon === undefined
        ? undefined
        : readPositiveNumber(config.morphEpsilon, `${label}.morphEpsilon`)
  };
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

function readRecord(raw: unknown, label: string): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${label} must be an object`);
  }
  return raw as Record<string, unknown>;
}

function parseStringMap(raw: unknown, label: string): Record<string, string> {
  const map = readRecord(raw, label);
  const parsed: Record<string, string> = {};
  for (const [key, value] of Object.entries(map)) {
    parsed[key] = readString(value, `${label}.${key}`);
  }
  return parsed;
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
    throw new Error(`${label} must contain at least one frame`);
  }
  return values;
}

function readStringArray(raw: unknown, label: string): readonly string[] {
  return readArray(raw, label).map((value, index) => readString(value, `${label}[${index}]`));
}

function readFiniteNumber(raw: unknown, label: string): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    throw new Error(`${label} must be a finite number`);
  }
  return raw;
}

function readPositiveNumber(raw: unknown, label: string): number {
  const value = readFiniteNumber(raw, label);
  if (value <= 0) {
    throw new Error(`${label} must be greater than 0`);
  }
  return value;
}

function readString(raw: unknown, label: string): string {
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return raw;
}

function readStage(raw: unknown, label: string): NativeNanoemOracleStageName {
  const stage = readString(raw, label);
  if (!stageNames.has(stage as NativeNanoemOracleStageName)) {
    throw new Error(`${label} must be a known runtime stage`);
  }
  return stage as NativeNanoemOracleStageName;
}
