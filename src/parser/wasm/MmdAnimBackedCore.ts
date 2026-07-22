import { toUint8Array } from "../binary/index.js";
import { detectModelFormat } from "../formatDetection.js";
import type {
  Diagnostic,
  DisplayFrameData,
  GeometryBuffers,
  JointData,
  MaterialInfo,
  MmdAnimation,
  MmdCore,
  MmdModel,
  MmdPose,
  ModelMetadata,
  MorphData,
  RigidBodyData,
  SkeletonData,
  SoftBodyData
} from "../model/modelTypes.js";
import type { AccessoryParsedManifest } from "../accessory/AccessoryParsedTypes.js";
import type { PmmParsedManifest } from "../pmm/PmmParsedTypes.js";
import { parsePmd } from "../model/PmdModelParser.js";
import { parseVmd } from "../vmd/index.js";
import { parseVpd, vpdPoseToAnimation } from "../vpd/index.js";
import { mmdAnimWasmVmdDtoToAnimation } from "../../runtime/mmdAnimWasmParser.js";
import { ParsedModel } from "./ParsedModel.js";

export interface MmdAnimWasmExports {
  parsePmxModelNonGeometryJson?: (data: Uint8Array) => string;
  parseMmdFormatJson?: (data: Uint8Array, fileName?: string | null) => string;
  parseVmdAnimationJson?: (data: Uint8Array) => string;
  WasmPmxParsedModel?: WasmPmxParsedModelConstructor;
  WasmPmxGeometry?: WasmPmxGeometryConstructor;
  wasm_wrapper_version(): number;
}

interface WasmPmxParsedModelConstructor {
  parse(data: Uint8Array): WasmPmxParsedModelDto;
}

interface WasmPmxParsedModelDto {
  free?(): void;
  nonGeometryJson(): string;
  geometry(): WasmPmxGeometryDto;
}

interface WasmPmxGeometryConstructor {
  fromPmxBytes(data: Uint8Array): WasmPmxGeometryDto;
}

interface WasmPmxGeometryDto {
  free?(): void;
  additionalUvCount(): number;
  additionalUvs(): Float32Array;
  edgeScale(): Float32Array;
  indices(): Uint32Array;
  materialGroups(): Uint32Array;
  normals(): Float32Array;
  positions(): Float32Array;
  qdefEnabled(): Uint8Array;
  sdefC(): Float32Array;
  sdefEnabled(): Uint8Array;
  sdefR0(): Float32Array;
  sdefR1(): Float32Array;
  sdefRw0(): Float32Array;
  sdefRw1(): Float32Array;
  skinIndices(): Uint32Array;
  skinWeights(): Float32Array;
  uvs(): Float32Array;
  vertexCount(): number;
}

class MmdAnimPmxModel implements MmdModel {
  private readonly _metadata: ModelMetadata;
  private readonly _geometry: GeometryBuffers;
  private readonly _skeleton: SkeletonData;
  private readonly _materials: MaterialInfo[];

  constructor(
    private readonly j: Record<string, unknown>,
    geometry: GeometryBuffers
  ) {
    const rawMeta = asRecord(j["metadata"]);
    const topDiagnostics = asDiagnostics(j["diagnostics"]);
    const metaDiagnostics = asDiagnostics(rawMeta["diagnostics"]);
    const adapterDiagnostics = buildAdapterDiagnostics(j);
    this._metadata = {
      ...(rawMeta as unknown as ModelMetadata),
      diagnostics: [...metaDiagnostics, ...topDiagnostics, ...adapterDiagnostics]
    };
    this._geometry = geometry;
    this._skeleton = normalizeSkeleton(j["skeleton"]);
    this._materials = normalizeMaterials(j["materials"]);
  }

  metadata(): ModelMetadata      { return this._metadata; }
  geometry(): GeometryBuffers    { return this._geometry; }
  materials(): MaterialInfo[]    { return this._materials; }
  skeleton(): SkeletonData       { return this._skeleton; }
  morphs(): MorphData[]          { return asArray<MorphData>(this.j["morphs"]); }
  displayFrames(): DisplayFrameData[] { return asArray<DisplayFrameData>(this.j["displayFrames"]); }
  rigidBodies(): RigidBodyData[] { return asArray<RigidBodyData>(this.j["rigidBodies"]); }
  joints(): JointData[]          { return asArray<JointData>(this.j["joints"]); }
  softBodies(): SoftBodyData[]   { return asArray<SoftBodyData>(this.j["softBodies"]); }
  embeddedTextures()             { return []; }
}

function buildGeometryFromWasm(g: WasmPmxGeometryDto): GeometryBuffers {
  const vertexCount = g.vertexCount();
  const rawIndices = g.indices();
  const indices: Uint16Array | Uint32Array =
    vertexCount <= 65535 ? Uint16Array.from(rawIndices) : rawIndices;
  return {
    positions: g.positions(),
    normals: g.normals(),
    uvs: g.uvs(),
    additionalUvs: buildAdditionalUvsFromWasm(g.additionalUvs(), g.additionalUvCount(), vertexCount),
    indices,
    edgeScale: g.edgeScale(),
    materialGroups: buildMaterialGroupsFromWasm(g.materialGroups()),
    skinIndices: toSkinIndices16(g.skinIndices()),
    skinWeights: g.skinWeights(),
    sdef: buildSdefFromWasm(g),
    qdef: buildQdefFromWasm(g)
  };
}

function buildAdditionalUvsFromWasm(
  raw: Float32Array,
  additionalUvCount: number,
  vertexCount: number
): Float32Array[] {
  const stride = vertexCount * 4;
  const additionalUvs: Float32Array[] = [];
  for (let index = 0; index < additionalUvCount; index += 1) {
    additionalUvs.push(raw.slice(index * stride, (index + 1) * stride));
  }
  return additionalUvs;
}

function buildMaterialGroupsFromWasm(raw: Uint32Array): GeometryBuffers["materialGroups"] {
  const materialGroups: NonNullable<GeometryBuffers["materialGroups"]> = [];
  for (let index = 0; index < raw.length; index += 3) {
    materialGroups.push({
      start: raw[index] ?? 0,
      count: raw[index + 1] ?? 0,
      materialIndex: raw[index + 2] ?? 0
    });
  }
  return materialGroups;
}

function toSkinIndices16(values: ArrayLike<number>): Uint16Array {
  const converted = new Uint16Array(values.length);
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index] ?? 0;
    if (value < 0 || value > 0xffff) {
      throw new Error(
        `PMX bone index ${value} exceeds the current three-mmd-loader skin index range.`
      );
    }
    converted[index] = value;
  }
  return converted;
}

function normalizeSkeleton(skeleton: unknown): SkeletonData {
  const skeletonRecord = asRecord(skeleton);
  const bones = asArray<SkeletonData["bones"][number]>(skeletonRecord["bones"]);
  return {
    bones: bones.map((bone) => ({
      ...bone,
      tailPosition: bone.tailPosition ?? undefined,
      appendTransform: bone.appendTransform ?? undefined,
      fixedAxis: bone.fixedAxis ?? undefined,
      localAxis: bone.localAxis ?? undefined,
      externalParentKey: bone.externalParentKey ?? undefined,
      ikStateName: bone.ikStateName ?? undefined,
      ik:
        bone.ik == null
          ? undefined
          : {
              ...bone.ik,
              links: asArray<NonNullable<SkeletonData["bones"][number]["ik"]>["links"][number]>(
                bone.ik.links
              ).map((link) => ({
                ...link,
                limits: link.limits ?? undefined
              }))
            }
    }))
  };
}

function normalizeMaterials(materials: unknown): MaterialInfo[] {
  return asArray<MaterialInfo>(materials).map((material) => ({
    ...material,
    sharedToonIndex: material.sharedToonIndex ?? undefined,
    toonTexturePath: material.toonTexturePath || ""
  }));
}

function buildSdefFromWasm(g: WasmPmxGeometryDto): GeometryBuffers["sdef"] {
  const enabled = enabledU8ToF32(g.sdefEnabled());
  if (!hasEnabledDeformVertex(enabled)) {
    return undefined;
  }
  return {
    enabled,
    c: g.sdefC(),
    r0: g.sdefR0(),
    r1: g.sdefR1(),
    rw0: g.sdefRw0(),
    rw1: g.sdefRw1()
  };
}

function buildQdefFromWasm(g: WasmPmxGeometryDto): GeometryBuffers["qdef"] {
  const enabled = enabledU8ToF32(g.qdefEnabled());
  if (!hasEnabledDeformVertex(enabled)) {
    return undefined;
  }
  return { enabled };
}

function enabledU8ToF32(enabled: Uint8Array): Float32Array {
  const converted = new Float32Array(enabled.length);
  for (let index = 0; index < enabled.length; index += 1) {
    converted[index] = enabled[index] === 0 ? 0 : 1;
  }
  return converted;
}

function hasEnabledDeformVertex(enabled: Float32Array): boolean {
  for (let index = 0; index < enabled.length; index += 1) {
    if (enabled[index] > 0.5) {
      return true;
    }
  }
  return false;
}

function buildAdapterDiagnostics(j: Record<string, unknown>): Diagnostic[] {
  const skeleton = asRecord(j["skeleton"]);
  const bones = asArray<Record<string, unknown>>(skeleton["bones"]);
  const diagnostics: Diagnostic[] = [];
  if (bones.some((bone) => {
    const ik = asRecord(bone["ik"]);
    return asArray<Record<string, unknown>>(ik["links"]).some((link) => link["limits"] != null);
  })) {
    diagnostics.push({
      level: "warning",
      code: "IK_PMX_LINK_LIMITS_APPROXIMATE",
      category: "skeleton",
      message: "PMX IK link limits are parsed but are approximated by the runtime solver."
    });
  }
  if (bones.some((bone) => asRecord(bone["flags"])["fixedAxis"] === true)) {
    diagnostics.push({
      level: "warning",
      code: "BONE_FIXED_AXIS_CONSTRAINTS_UNSUPPORTED",
      category: "skeleton",
      message:
        "Fixed-axis metadata is applied to IK links, but non-IK fixed-axis bone behavior is not yet enforced by the runtime."
    });
  }
  if (bones.some((bone) => asRecord(bone["flags"])["localAxis"] === true)) {
    diagnostics.push({
      level: "warning",
      code: "BONE_LOCAL_AXIS_CONSTRAINTS_UNSUPPORTED",
      category: "skeleton",
      message:
        "Local-axis metadata is applied to IK link limits, but non-IK local-axis bone behavior is not yet enforced by the runtime."
    });
  }
  return diagnostics;
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asDiagnostics(value: unknown): Diagnostic[] {
  return asArray<Diagnostic>(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseWasmJsonResponse<T>(raw: string, fileName: string): T {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed)) {
    throw new TypeError(`${fileName} WASM JSON response must be an object`);
  }
  return parsed as T;
}

function missingSplitPmxAbi(): never {
  throw new Error(
    "mmd-anim PMX split ABI is required: provide WasmPmxParsedModel or parsePmxModelNonGeometryJson plus WasmPmxGeometry."
  );
}

export class MmdAnimBackedCore implements MmdCore {
  private readonly versionString: string;

  constructor(private readonly wasm: MmdAnimWasmExports) {
    this.versionString = `0.0.${wasm.wasm_wrapper_version()}+mmd-anim`;
  }

  version(): string {
    return this.versionString;
  }

  healthCheck(): boolean {
    return true;
  }

  loadModel(
    bytes: ArrayBuffer | Uint8Array,
    options: { format?: "pmx" | "pmd" | "auto" } = {}
  ): MmdModel {
    const input = toUint8Array(bytes);
    const format =
      options.format === "auto" || !options.format ? detectModelFormat(input) : options.format;
    if (format === "pmx") {
      if (this.wasm.WasmPmxParsedModel != null) {
        const parsedHandle = this.wasm.WasmPmxParsedModel.parse(input);
        try {
          const json = parseWasmJsonResponse<Record<string, unknown>>(
            parsedHandle.nonGeometryJson(),
            "PMX model"
          );
          const geometryHandle = parsedHandle.geometry();
          try {
            return new MmdAnimPmxModel(json, buildGeometryFromWasm(geometryHandle));
          } finally {
            geometryHandle.free?.();
          }
        } finally {
          parsedHandle.free?.();
        }
      }
      if (this.wasm.parsePmxModelNonGeometryJson != null && this.wasm.WasmPmxGeometry != null) {
        const json = parseWasmJsonResponse<Record<string, unknown>>(
          this.wasm.parsePmxModelNonGeometryJson(input),
          "PMX model"
        );
        const geometryHandle = this.wasm.WasmPmxGeometry.fromPmxBytes(input);
        try {
          return new MmdAnimPmxModel(json, buildGeometryFromWasm(geometryHandle));
        } finally {
          geometryHandle.free?.();
        }
      }
      return missingSplitPmxAbi();
    }
    return new ParsedModel(parsePmd(input));
  }

  loadVmd(bytes: ArrayBuffer | Uint8Array): MmdAnimation {
    const input = toUint8Array(bytes);
    if (this.wasm.parseVmdAnimationJson != null) {
      return mmdAnimWasmVmdDtoToAnimation(
        parseWasmJsonResponse<Parameters<typeof mmdAnimWasmVmdDtoToAnimation>[0]>(
          this.wasm.parseVmdAnimationJson(input),
          "motion.vmd"
        ),
        input.slice()
      );
    }
    if (this.wasm.parseMmdFormatJson != null) {
      return mmdAnimWasmVmdDtoToAnimation(
        parseWasmJsonResponse<Parameters<typeof mmdAnimWasmVmdDtoToAnimation>[0]>(
          this.wasm.parseMmdFormatJson(input, "motion.vmd"),
          "motion.vmd"
        ),
        input.slice()
      );
    }
    return { ...parseVmd(input), bytes: input.slice() };
  }

  loadVpd(bytes: ArrayBuffer | Uint8Array): MmdPose {
    const input = toUint8Array(bytes);
    return { ...parseVpd(input), bytes: input.slice() };
  }

  loadVpdAnimation(bytes: ArrayBuffer | Uint8Array, name?: string): MmdAnimation {
    return vpdPoseToAnimation(this.loadVpd(bytes), name);
  }

  parsePmmDocument(bytes: ArrayBuffer | Uint8Array): PmmParsedManifest {
    return this.parseWasmJson<PmmParsedManifest>(bytes, "project.pmm");
  }

  parseAccessory(
    bytes: ArrayBuffer | Uint8Array,
    fileName?: string
  ): AccessoryParsedManifest {
    return this.parseWasmJson<AccessoryParsedManifest>(bytes, fileName ?? "accessory.x");
  }

  private parseWasmJson<T>(bytes: ArrayBuffer | Uint8Array, fileName: string): T {
    const input = toUint8Array(bytes);
    if (this.wasm.parseMmdFormatJson == null) {
      throw new Error(`${fileName} parsing requires parseMmdFormatJson WASM export`);
    }
    return parseWasmJsonResponse<T>(this.wasm.parseMmdFormatJson(input, fileName), fileName);
  }
}
