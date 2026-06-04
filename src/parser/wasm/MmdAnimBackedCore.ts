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
import { parsePmx, type ParsedPmx } from "../model/PmxModelParser.js";
import { parseVmd } from "../vmd/index.js";
import { parseVpd, vpdPoseToAnimation } from "../vpd/index.js";
import { ParsedModel } from "./ParsedModel.js";

export interface MmdAnimWasmExports {
  parsePmxModelJson(data: Uint8Array): string;
  wasm_wrapper_version(): number;
}

class MmdAnimPmxModel implements MmdModel {
  private readonly _metadata: ModelMetadata;
  private readonly _geometry: GeometryBuffers;
  private readonly _skeleton: SkeletonData;
  private readonly _materials: MaterialInfo[];

  constructor(
    private readonly j: Record<string, unknown>,
    fallbackParsed?: ParsedPmx
  ) {
    const rawMeta = (j["metadata"] ?? {}) as Record<string, unknown>;
    const topDiagnostics = (j["diagnostics"] as Diagnostic[] | undefined) ?? [];
    const metaDiagnostics = (rawMeta["diagnostics"] as Diagnostic[] | undefined) ?? [];
    const adapterDiagnostics = buildAdapterDiagnostics(j);
    this._metadata = {
      ...(rawMeta as unknown as ModelMetadata),
      diagnostics: [...metaDiagnostics, ...topDiagnostics, ...adapterDiagnostics]
    };
    this._geometry = buildGeometry((j["geometry"] ?? {}) as Record<string, unknown>, fallbackParsed);
    this._skeleton = normalizeSkeleton((j["skeleton"] ?? { bones: [] }) as SkeletonData);
    this._materials = normalizeMaterials(
      (this.j["materials"] ?? []) as MaterialInfo[],
      fallbackParsed
    );
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

function buildGeometry(g: Record<string, unknown>, fallbackParsed: ParsedPmx | undefined): GeometryBuffers {
  const positions = toF32(g["positions"]);
  const vertexCount = positions.length / 3;
  const rawIndices = (g["indices"] ?? []) as readonly number[];
  const indices: Uint16Array | Uint32Array =
    vertexCount <= 65535
      ? Uint16Array.from(rawIndices)
      : Uint32Array.from(rawIndices);
  const rawAdditionalUvs = (g["additionalUvs"] ?? []) as readonly (readonly number[])[];
  return {
    positions,
    normals: toF32(g["normals"]),
    uvs: toF32(g["uvs"]),
    additionalUvs: rawAdditionalUvs.map((set) => Float32Array.from(set)),
    indices,
    edgeScale: g["edgeScale"] != null ? toF32(g["edgeScale"]) : undefined,
    materialGroups: g["materialGroups"] as GeometryBuffers["materialGroups"],
    skinIndices: Uint16Array.from((g["skinIndices"] ?? []) as readonly number[]),
    skinWeights: toF32(g["skinWeights"]),
    sdef: buildSdef(g["sdef"]) ?? fallbackParsed?.geometry.sdef,
    qdef: buildQdef(g["qdef"]) ?? fallbackParsed?.geometry.qdef
  };
}

function toF32(value: unknown): Float32Array {
  return value != null ? Float32Array.from(value as readonly number[]) : new Float32Array(0);
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

function normalizeMaterials(
  materials: readonly MaterialInfo[],
  fallbackParsed: ParsedPmx | undefined
): MaterialInfo[] {
  return materials.map((material, index) => {
    const fallbackMaterial = fallbackParsed?.materials[index];
    return {
      ...material,
      sharedToonIndex:
        material.sharedToonIndex ?? fallbackMaterial?.sharedToonIndex ?? undefined,
      toonTexturePath: material.toonTexturePath || fallbackMaterial?.toonTexturePath || ""
    };
  });
}

function buildSdef(value: unknown): GeometryBuffers["sdef"] {
  if (value == null) {
    return undefined;
  }
  const sdef = value as Record<string, unknown>;
  return {
    enabled: toF32(sdef["enabled"]),
    c: toF32(sdef["c"]),
    r0: toF32(sdef["r0"]),
    r1: toF32(sdef["r1"]),
    rw0: toF32(sdef["rw0"]),
    rw1: toF32(sdef["rw1"])
  };
}

function buildQdef(value: unknown): GeometryBuffers["qdef"] {
  if (value == null) {
    return undefined;
  }
  const qdef = value as Record<string, unknown>;
  return {
    enabled: toF32(qdef["enabled"])
  };
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
      message: "PMX fixed-axis bone constraints are parsed but not enforced by the runtime adapter."
    });
  }
  if (bones.some((bone) => bone.flags?.["localAxis"] === true)) {
    diagnostics.push({
      level: "warning",
      code: "BONE_LOCAL_AXIS_CONSTRAINTS_UNSUPPORTED",
      message: "PMX local-axis bone constraints are parsed but not enforced by the runtime adapter."
    });
  }
  return diagnostics;
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
      const json = JSON.parse(this.wasm.parsePmxModelJson(input)) as Record<string, unknown>;
      // mmd-anim currently omits SDEF/QDEF buffers and some toon fields from the JSON ABI.
      // Keep the TS parser fallback load-time only until the wasm ABI covers those fields.
      return new MmdAnimPmxModel(json, parsePmx(input));
    }
    return new ParsedModel(parsePmd(input));
  }

  loadVmd(bytes: ArrayBuffer | Uint8Array): MmdAnimation {
    const input = toUint8Array(bytes);
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
