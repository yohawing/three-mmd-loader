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
    const rawMeta = (j["metadata"] ?? {}) as Record<string, unknown>;
    const topDiagnostics = (j["diagnostics"] as Diagnostic[] | undefined) ?? [];
    const metaDiagnostics = (rawMeta["diagnostics"] as Diagnostic[] | undefined) ?? [];
    const adapterDiagnostics = buildAdapterDiagnostics(j);
    this._metadata = {
      ...(rawMeta as unknown as ModelMetadata),
      diagnostics: [...metaDiagnostics, ...topDiagnostics, ...adapterDiagnostics]
    };
    this._geometry = geometry;
    this._skeleton = normalizeSkeleton((j["skeleton"] ?? { bones: [] }) as SkeletonData);
    this._materials = normalizeMaterials((this.j["materials"] ?? []) as MaterialInfo[]);
  }

  metadata(): ModelMetadata      { return this._metadata; }
  geometry(): GeometryBuffers    { return this._geometry; }
  materials(): MaterialInfo[]    { return this._materials; }
  skeleton(): SkeletonData       { return this._skeleton; }
  morphs(): MorphData[]          { return (this.j["morphs"] ?? []) as MorphData[]; }
  displayFrames(): DisplayFrameData[] { return (this.j["displayFrames"] ?? []) as DisplayFrameData[]; }
  rigidBodies(): RigidBodyData[] { return (this.j["rigidBodies"] ?? []) as RigidBodyData[]; }
  joints(): JointData[]          { return (this.j["joints"] ?? []) as JointData[]; }
  softBodies(): SoftBodyData[]   { return (this.j["softBodies"] ?? []) as SoftBodyData[]; }
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

function normalizeSkeleton(skeleton: SkeletonData): SkeletonData {
  return {
    bones: skeleton.bones.map((bone) => ({
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
              links: bone.ik.links.map((link) => ({
                ...link,
                limits: link.limits ?? undefined
              }))
            }
    }))
  };
}

function normalizeMaterials(materials: readonly MaterialInfo[]): MaterialInfo[] {
  return materials.map((material) => ({
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
  const skeleton = (j["skeleton"] ?? {}) as Record<string, unknown>;
  const bones = (skeleton["bones"] ?? []) as readonly {
    flags?: Record<string, unknown>;
    ik?: { links?: readonly { limits?: unknown }[] } | null;
  }[];
  const diagnostics: Diagnostic[] = [];
  if (bones.some((bone) => bone.ik?.links?.some((link) => link.limits != null))) {
    diagnostics.push({
      level: "warning",
      code: "IK_PMX_LINK_LIMITS_APPROXIMATE",
      message: "PMX IK link limits are parsed but are approximated by the runtime solver."
    });
  }
  if (bones.some((bone) => bone.flags?.["fixedAxis"] === true)) {
    diagnostics.push({
      level: "warning",
      code: "BONE_FIXED_AXIS_CONSTRAINTS_UNSUPPORTED",
      message:
        "Fixed-axis metadata is applied to IK links, but non-IK fixed-axis bone behavior is not yet enforced by the runtime."
    });
  }
  if (bones.some((bone) => bone.flags?.["localAxis"] === true)) {
    diagnostics.push({
      level: "warning",
      code: "BONE_LOCAL_AXIS_CONSTRAINTS_UNSUPPORTED",
      message:
        "Local-axis metadata is applied to IK link limits, but non-IK local-axis bone behavior is not yet enforced by the runtime."
    });
  }
  return diagnostics;
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
          const json = JSON.parse(parsedHandle.nonGeometryJson()) as Record<string, unknown>;
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
        const json = JSON.parse(this.wasm.parsePmxModelNonGeometryJson(input)) as Record<string, unknown>;
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
      return mmdAnimWasmVmdDtoToAnimation(JSON.parse(this.wasm.parseVmdAnimationJson(input)), input.slice());
    }
    if (this.wasm.parseMmdFormatJson != null) {
      return mmdAnimWasmVmdDtoToAnimation(JSON.parse(this.wasm.parseMmdFormatJson(input, "motion.vmd")), input.slice());
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
}
