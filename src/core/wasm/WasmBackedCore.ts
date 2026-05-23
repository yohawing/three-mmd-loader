import { toUint8Array } from "../../parser/binary/index.js";
import { createModelDiagnostics } from "../../parser/model/diagnostics.js";
import type { YwMmdWasmModule } from "../../parser/wasm/generated/yw_mmd_core.js";
import { parsePmd } from "../../parser/model/PmdModelParser.js";
import { parsePmx, type ParsedPmx } from "../../parser/model/PmxModelParser.js";
import { detectModelFormat } from "../../parser/formatDetection.js";
import type {
  BoneData,
  BoneFlags,
  BoneIk,
  BoneIkLink,
  DisplayFrameData,
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
  SoftBodyData,
  VmdBoneInterpolation,
  VmdBoneFrame,
  VmdCameraInterpolation,
  VmdInterpolationCurve
} from "../../parser/model/modelTypes.js";
import { parseVmd } from "../../parser/vmd/index.js";
import { parseVpd, vpdPoseToAnimation } from "../../parser/vpd/index.js";
import { createParsedModelFromBytes } from "./createParsedModel.js";
import { parseWasmModelMetadata } from "./wasmModelMetadata.js";
import { ParsedModel } from "./ParsedModel.js";

const vmdShiftJisDecoder = new TextDecoder("shift-jis");

export class WasmBackedCore implements MmdCore {
  private readonly coreVersion: string;

  constructor(private readonly wasm: YwMmdWasmModule) {
    this.coreVersion = wasm.UTF8ToString(wasm._yw_mmd_version());
  }

  version(): string {
    return this.coreVersion;
  }

  healthCheck(): boolean {
    return this.coreVersion.length > 0;
  }

  loadModel(
    bytes: ArrayBuffer | Uint8Array,
    options: { format?: "pmx" | "pmd" | "auto" } = {}
  ): MmdModel {
    const input = toUint8Array(bytes);
    const format =
      options.format === "auto" || !options.format ? detectModelFormat(input) : options.format;
    if (typeof this.wasm._yw_mmd_model_load === "function") {
      return this.loadModelPhase2(input, format);
    }
    return createParsedModelFromBytes(
      input,
      format,
      parseWasmModelMetadata(this.wasm, input, format)
    );
  }

  private loadModelPhase2(input: Uint8Array, format: "pmx" | "pmd"): MmdModel {
    const modelLoad = this.wasm._yw_mmd_model_load;
    if (typeof modelLoad !== "function") {
      return createParsedModelFromBytes(
        input,
        format,
        parseWasmModelMetadata(this.wasm, input, format)
      );
    }
    const formatNum = format === "pmx" ? 1 : 2;
    const dataPtr = this.wasm._malloc(input.byteLength);
    if (!dataPtr) {
      throw new Error("Failed to allocate Wasm memory for model bytes");
    }

    try {
      this.wasm.refreshMemoryViews();
      this.wasm.HEAPU8.set(input, dataPtr);

      const ok = modelLoad(dataPtr, input.byteLength, formatNum);
      if (!ok) {
        throw new Error("yw_mmd_model_load failed");
      }

      this.wasm.refreshMemoryViews();

      const i32 = this.wasm._yw_mmd_model_metadata_i32.bind(this.wasm);
      const f32 = this.wasm._yw_mmd_model_metadata_f32.bind(this.wasm);
      const encodingCode = i32(1);
      const metadata: ModelMetadata = {
        format,
        version: f32(0),
        encoding: encodingCode === 0 ? "utf-16-le" : encodingCode === 1 ? "utf-8" : "shift-jis",
        name: this.wasm.UTF8ToString(this.wasm._yw_mmd_model_name()),
        englishName: this.wasm.UTF8ToString(this.wasm._yw_mmd_model_english_name()),
        comment: this.wasm.UTF8ToString(this.wasm._yw_mmd_model_comment()),
        englishComment: this.wasm.UTF8ToString(this.wasm._yw_mmd_model_english_comment()),
        counts: {
          vertices: i32(9),
          faces: i32(10),
          materials: i32(11),
          bones: i32(12),
          morphs: i32(13),
          displayFrames: i32(14),
          rigidBodies: i32(15),
          joints: i32(16),
          softBodies: i32(17)
        },
        indexSizes: {
          vertex: i32(2),
          texture: i32(3),
          material: i32(4),
          bone: i32(5),
          morph: i32(6),
          rigidBody: i32(7)
        },
        additionalUvCount: i32(8),
        diagnostics: []
      };

      const vertexCount = this.wasm._yw_mmd_model_vertex_count();
      const indexCount = this.wasm._yw_mmd_model_index_count();
      const auvCount = this.wasm._yw_mmd_model_additional_uv_count();
      const heap = this.wasm.HEAPU8.buffer;

      const readF32 = (ptr: number, n: number) =>
        ptr ? new Float32Array(heap, ptr, n).slice() : new Float32Array(n);
      const readU16 = (ptr: number, n: number) =>
        ptr ? new Uint16Array(heap, ptr, n).slice() : new Uint16Array(n);

      const positions = readF32(this.wasm._yw_mmd_model_positions_ptr(), vertexCount * 3);
      const normals = readF32(this.wasm._yw_mmd_model_normals_ptr(), vertexCount * 3);
      const uvs = readF32(this.wasm._yw_mmd_model_uvs_ptr(), vertexCount * 2);
      const skinIndices = readU16(this.wasm._yw_mmd_model_skin_indices_ptr(), vertexCount * 4);
      const skinWeights = readF32(this.wasm._yw_mmd_model_skin_weights_ptr(), vertexCount * 4);
      const edgeScale = readF32(this.wasm._yw_mmd_model_edge_scale_ptr(), vertexCount);
      const sdefEnabled = readF32(this.wasm._yw_mmd_model_sdef_enabled_ptr(), vertexCount);
      const hasSdef = sdefEnabled.some((value) => value !== 0);

      const indicesU32Ptr = this.wasm._yw_mmd_model_indices_ptr();
      let indices: Uint16Array | Uint32Array;
      if (vertexCount <= 65535) {
        const u32view = new Uint32Array(heap, indicesU32Ptr, indexCount);
        indices = Uint16Array.from(u32view);
      } else {
        indices = new Uint32Array(heap, indicesU32Ptr, indexCount).slice();
      }

      const additionalUvs: Float32Array[] = [];
      for (let j = 0; j < auvCount; j++) {
        const pointer = this.wasm._yw_mmd_model_additional_uvs_ptr(j);
        additionalUvs.push(readF32(pointer, vertexCount * 4));
      }

      const sdef = hasSdef
        ? {
            enabled: sdefEnabled,
            c: readF32(this.wasm._yw_mmd_model_sdef_c_ptr(), vertexCount * 3),
            r0: readF32(this.wasm._yw_mmd_model_sdef_r0_ptr(), vertexCount * 3),
            r1: readF32(this.wasm._yw_mmd_model_sdef_r1_ptr(), vertexCount * 3),
            rw0: readF32(this.wasm._yw_mmd_model_sdef_rw0_ptr(), vertexCount * 3),
            rw1: readF32(this.wasm._yw_mmd_model_sdef_rw1_ptr(), vertexCount * 3)
          }
        : undefined;

      const usePhase3 = typeof this.wasm._yw_mmd_material_name === "function";
      const parsed = usePhase3
        ? this.readModelDataFromWasm(metadata)
        : format === "pmx"
          ? parsePmx(input, { skipGeometry: true })
          : parsePmd(input, { skipGeometry: true });
      parsed.metadata = {
        ...metadata,
        diagnostics: parsed.metadata.diagnostics
      };
      parsed.geometry = {
        positions,
        normals,
        uvs,
        additionalUvs,
        indices,
        edgeScale,
        skinIndices,
        skinWeights,
        sdef
      };

      if (hasSdef) {
        const sdefCount = Array.from(sdefEnabled).filter((value) => value !== 0).length;
        parsed.metadata.diagnostics.push({
          level: "warning",
          code: "SDEF_SKINNING_FALLBACK",
          message: `${sdefCount} PMX SDEF vertices preserved SDEF parameters but are currently rendered with BDEF2-compatible weights.`
        });
      }

      return new ParsedModel(parsed);
    } finally {
      this.wasm._yw_mmd_model_free();
      this.wasm._free(dataPtr);
    }
  }

  private readModelDataFromWasm(metadata: ModelMetadata): ParsedPmx {
    const wasm = this.wasm;
    let heap = wasm.HEAPU8.buffer;
    const refreshHeap = () => {
      wasm.refreshMemoryViews();
      heap = wasm.HEAPU8.buffer;
    };
    const readString = (ptr: number) => (ptr ? wasm.UTF8ToString(ptr) : "");
    const readDenseF32 = (ptr: number, length: number) => {
      if (!ptr) {
        return undefined;
      }
      refreshHeap();
      return new Float32Array(heap, ptr, length).slice();
    };

    const materials: MaterialInfo[] = [];
    for (let i = 0; i < metadata.counts.materials; i++) {
      const f = (field: number) => wasm._yw_mmd_material_f32!(i, field);
      const iv = (field: number) => wasm._yw_mmd_material_i32!(i, field);
      const flagBits = iv(0);
      const sharedToonIndex = iv(2);
      materials.push({
        name: readString(wasm._yw_mmd_material_name!(i)),
        englishName: readString(wasm._yw_mmd_material_english_name!(i)),
        texturePath: readString(wasm._yw_mmd_material_texture_path!(i)),
        sphereTexturePath: readString(wasm._yw_mmd_material_sphere_texture_path!(i)),
        sphereMode: toSphereMode(iv(1)),
        toonTexturePath: readString(wasm._yw_mmd_material_toon_texture_path!(i)),
        sharedToonIndex: sharedToonIndex >= 0 ? sharedToonIndex : undefined,
        diffuse: [f(0), f(1), f(2), f(3)],
        specular: [f(4), f(5), f(6)],
        specularPower: f(7),
        ambient: [f(8), f(9), f(10)],
        edgeColor: [f(11), f(12), f(13), f(14)],
        edgeSize: f(15),
        flags: {
          doubleSided: (flagBits & 0x01) !== 0,
          groundShadow: (flagBits & 0x02) !== 0,
          selfShadowMap: (flagBits & 0x04) !== 0,
          selfShadow: (flagBits & 0x08) !== 0,
          edge: (flagBits & 0x10) !== 0,
          vertexColor: (flagBits & 0x20) !== 0,
          pointDraw: (flagBits & 0x40) !== 0,
          lineDraw: (flagBits & 0x80) !== 0
        },
        evaluatedTransparency: iv(4),
        faceCount: iv(3)
      });
    }

    const bones: BoneData[] = [];
    for (let i = 0; i < metadata.counts.bones; i++) {
      const bf = (field: number) => wasm._yw_mmd_bone_f32!(i, field);
      const bi = (field: number) => wasm._yw_mmd_bone_i32!(i, field);
      const flagBits = bi(3);
      const flags: BoneFlags = {
        indexedTail: (flagBits & 0x0001) !== 0,
        rotatable: (flagBits & 0x0002) !== 0,
        translatable: (flagBits & 0x0004) !== 0,
        visible: (flagBits & 0x0008) !== 0,
        enabled: (flagBits & 0x0010) !== 0,
        ik: (flagBits & 0x0020) !== 0,
        appendLocal: (flagBits & 0x0080) !== 0,
        appendRotate: (flagBits & 0x0100) !== 0,
        appendTranslate: (flagBits & 0x0200) !== 0,
        fixedAxis: (flagBits & 0x0400) !== 0,
        localAxis: (flagBits & 0x0800) !== 0,
        transformAfterPhysics: (flagBits & 0x1000) !== 0,
        externalParentTransform: (flagBits & 0x2000) !== 0
      };
      const appendParentIndex = bi(4);
      let ik: BoneIk | undefined;
      if (flags.ik) {
        const linkCount = wasm._yw_mmd_bone_ik_link_count!(i);
        const linksPtr = wasm._yw_mmd_bone_ik_links_ptr!(i);
        const links: BoneIkLink[] = [];
        if (linksPtr && linkCount > 0) {
          const data = new Float32Array(heap, linksPtr, linkCount * 8);
          for (let j = 0; j < linkCount; j++) {
            const base = j * 8;
            const hasLimits = data[base + 1] !== 0;
            links.push({
              boneIndex: Math.round(data[base]),
              limits: hasLimits
                ? {
                    lower: [data[base + 2], data[base + 3], data[base + 4]],
                    upper: [data[base + 5], data[base + 6], data[base + 7]]
                  }
                : undefined
            });
          }
        }
        ik = {
          targetIndex: bi(6),
          loopCount: bi(7),
          limitAngle: wasm._yw_mmd_bone_ik_limit_angle!(i),
          links
        };
      }
      const externalParentKey = bi(5);
      bones.push({
        name: readString(wasm._yw_mmd_bone_name!(i)),
        englishName: readString(wasm._yw_mmd_bone_english_name!(i)),
        parentIndex: bi(0),
        layer: bi(1),
        position: [bf(0), bf(1), bf(2)],
        tailIndex: flags.indexedTail ? bi(2) : -1,
        tailPosition: flags.indexedTail ? undefined : [bf(3), bf(4), bf(5)],
        flags,
        appendTransform:
          (flags.appendRotate || flags.appendTranslate) && appendParentIndex >= 0
            ? { parentIndex: appendParentIndex, weight: bf(15) }
            : undefined,
        fixedAxis: flags.fixedAxis ? [bf(6), bf(7), bf(8)] : undefined,
        localAxis: flags.localAxis
          ? { x: [bf(9), bf(10), bf(11)], z: [bf(12), bf(13), bf(14)] }
          : undefined,
        externalParentKey:
          flags.externalParentTransform && externalParentKey >= 0 ? externalParentKey : undefined,
        ik
      });
    }
    const skeleton: SkeletonData = { bones };

    const morphs: MorphData[] = [];
    for (let i = 0; i < metadata.counts.morphs; i++) {
      const nanoemType = wasm._yw_mmd_morph_type!(i);
      const count = wasm._yw_mmd_morph_offset_count!(i);
      const ptr = wasm._yw_mmd_morph_offset_ptr!(i);
      const morph: MorphData = {
        name: readString(wasm._yw_mmd_morph_name!(i)),
        englishName: readString(wasm._yw_mmd_morph_english_name!(i)),
        type: toMorphType(nanoemType),
        vertexOffsets: [],
        groupOffsets: [],
        boneOffsets: [],
        uvOffsets: [],
        additionalUvOffsets: [],
        materialOffsets: [],
        flipOffsets: [],
        impulseOffsets: []
      };
      const stride = morphStride(nanoemType);
      if (ptr && count > 0 && stride > 0) {
        readMorphOffsets(morph, nanoemType, new Float32Array(heap, ptr, count * stride), count);
      }
      if (nanoemType === 1 && typeof wasm._yw_mmd_morph_dense_position_ptr === "function") {
        morph.densePositionOffsets = readDenseF32(
          wasm._yw_mmd_morph_dense_position_ptr(i, metadata.counts.vertices),
          metadata.counts.vertices * 3
        );
      } else if (nanoemType === 3 && typeof wasm._yw_mmd_morph_dense_uv_ptr === "function") {
        morph.denseUvOffsets = readDenseF32(
          wasm._yw_mmd_morph_dense_uv_ptr(i, metadata.counts.vertices),
          metadata.counts.vertices * 2
        );
      } else if (
        nanoemType >= 4 &&
        nanoemType <= 7 &&
        typeof wasm._yw_mmd_morph_dense_additional_uv_ptr === "function"
      ) {
        const uvIndex = nanoemType - 4;
        if (uvIndex < metadata.additionalUvCount) {
          morph.denseAdditionalUvOffsets = [];
          morph.denseAdditionalUvOffsets[uvIndex] = readDenseF32(
            wasm._yw_mmd_morph_dense_additional_uv_ptr(i, uvIndex, metadata.counts.vertices),
            metadata.counts.vertices * 4
          );
        }
      }
      morphs.push(morph);
    }

    const displayFrames: DisplayFrameData[] = [];
    for (let i = 0; i < metadata.counts.displayFrames; i++) {
      const count = wasm._yw_mmd_label_item_count!(i);
      const frames: DisplayFrameData["frames"] = [];
      for (let j = 0; j < count; j++) {
        const type = wasm._yw_mmd_label_item_type!(i, j);
        frames.push({
          type: type === 0 ? "bone" : type === 1 ? "morph" : "unknown",
          index: wasm._yw_mmd_label_item_index!(i, j)
        });
      }
      displayFrames.push({
        name: readString(wasm._yw_mmd_label_name!(i)),
        englishName: readString(wasm._yw_mmd_label_english_name!(i)),
        special: wasm._yw_mmd_label_is_special!(i) !== 0,
        frames
      });
    }

    const rigidBodies = this.readRigidBodiesFromWasm(readString);
    const joints = this.readJointsFromWasm(readString);
    const softBodies = this.readSoftBodiesFromWasm(readString);
    const diagnostics = createModelDiagnostics(
      materials,
      morphs,
      skeleton,
      rigidBodies,
      joints,
      displayFrames
    );
    if (softBodies.length > 0) {
      diagnostics.push({
        level: "warning",
        code: "PMX_SOFT_BODY_UNSUPPORTED",
        message: `${softBodies.length} PMX soft bodies are parsed but are not simulated by the current runtime.`
      });
    }

    return {
      metadata: { ...metadata, diagnostics },
      geometry: {
        positions: new Float32Array(0),
        normals: new Float32Array(0),
        uvs: new Float32Array(0),
        additionalUvs: [],
        indices: new Uint16Array(0),
        skinIndices: new Uint16Array(0),
        skinWeights: new Float32Array(0)
      },
      materials,
      skeleton,
      morphs,
      displayFrames,
      rigidBodies,
      joints,
      softBodies
    };
  }

  private readRigidBodiesFromWasm(readString: (ptr: number) => string): RigidBodyData[] {
    const rigidBodies: RigidBodyData[] = [];
    for (let i = 0; i < this.wasm._yw_mmd_model_metadata_i32(15); i++) {
      const f = (field: number) => this.wasm._yw_mmd_rigid_body_f32!(i, field);
      const iv = (field: number) => this.wasm._yw_mmd_rigid_body_i32!(i, field);
      rigidBodies.push({
        name: readString(this.wasm._yw_mmd_rigid_body_name!(i)),
        englishName: readString(this.wasm._yw_mmd_rigid_body_english_name!(i)),
        boneIndex: iv(0),
        group: iv(1),
        mask: iv(2),
        shape: toRigidBodyShape(iv(3)),
        size: [f(0), f(1), f(2)],
        position: [f(3), f(4), f(5)],
        rotation: [f(6), f(7), f(8)],
        mass: f(9),
        linearDamping: f(10),
        angularDamping: f(11),
        restitution: f(12),
        friction: f(13),
        mode: toRigidBodyMode(iv(4))
      });
    }
    return rigidBodies;
  }

  private readJointsFromWasm(readString: (ptr: number) => string): JointData[] {
    const joints: JointData[] = [];
    for (let i = 0; i < this.wasm._yw_mmd_model_metadata_i32(16); i++) {
      const f = (field: number) => this.wasm._yw_mmd_joint_f32!(i, field);
      const iv = (field: number) => this.wasm._yw_mmd_joint_i32!(i, field);
      joints.push({
        name: readString(this.wasm._yw_mmd_joint_name!(i)),
        englishName: readString(this.wasm._yw_mmd_joint_english_name!(i)),
        type: toJointType(iv(2)),
        rigidBodyIndexA: iv(0),
        rigidBodyIndexB: iv(1),
        position: [f(0), f(1), f(2)],
        rotation: [f(3), f(4), f(5)],
        translationLowerLimit: [f(6), f(7), f(8)],
        translationUpperLimit: [f(9), f(10), f(11)],
        rotationLowerLimit: [f(12), f(13), f(14)],
        rotationUpperLimit: [f(15), f(16), f(17)],
        springTranslationFactor: [f(18), f(19), f(20)],
        springRotationFactor: [f(21), f(22), f(23)]
      });
    }
    return joints;
  }

  private readSoftBodiesFromWasm(readString: (ptr: number) => string): SoftBodyData[] {
    const softBodies: SoftBodyData[] = [];
    for (let i = 0; i < this.wasm._yw_mmd_model_metadata_i32(17); i++) {
      const f = (field: number) => this.wasm._yw_mmd_soft_body_f32!(i, field);
      const iv = (field: number) => this.wasm._yw_mmd_soft_body_i32!(i, field);
      const anchors: SoftBodyData["anchors"] = [];
      for (let j = 0; j < iv(12); j++) {
        anchors.push({
          rigidBodyIndex: this.wasm._yw_mmd_soft_body_anchor_i32!(i, j, 0),
          vertexIndex: this.wasm._yw_mmd_soft_body_anchor_i32!(i, j, 1),
          nearMode: this.wasm._yw_mmd_soft_body_anchor_i32!(i, j, 2) !== 0
        });
      }
      const pinnedVertexIndices: number[] = [];
      for (let j = 0; j < iv(13); j++) {
        pinnedVertexIndices.push(this.wasm._yw_mmd_soft_body_pinned_vertex!(i, j));
      }
      softBodies.push({
        name: readString(this.wasm._yw_mmd_soft_body_name!(i)),
        englishName: readString(this.wasm._yw_mmd_soft_body_english_name!(i)),
        type: toSoftBodyType(iv(6)),
        materialIndex: iv(0),
        collisionGroup: iv(1),
        collisionMask: iv(2),
        flags: iv(3),
        bendingConstraintsDistance: iv(4),
        clusterCount: iv(5),
        totalMass: f(0),
        collisionMargin: f(1),
        aeroModel: toSoftBodyAeroModel(iv(7)),
        config: {
          velocityCorrectionFactor: f(2),
          dampingCoefficient: f(3),
          dragCoefficient: f(4),
          liftCoefficient: f(5),
          pressureCoefficient: f(6),
          volumeConversationCoefficient: f(7),
          dynamicFrictionCoefficient: f(8),
          poseMatchingCoefficient: f(9),
          rigidContactHardness: f(10),
          kineticContactHardness: f(11),
          softContactHardness: f(12),
          anchorHardness: f(13)
        },
        cluster: {
          softVsRigidHardness: f(14),
          softVsKineticHardness: f(15),
          softVsSoftHardness: f(16),
          softVsRigidImpulseSplit: f(17),
          softVsKineticImpulseSplit: f(18),
          softVsSoftImpulseSplit: f(19)
        },
        iteration: {
          velocity: iv(8),
          position: iv(9),
          drift: iv(10),
          cluster: iv(11)
        },
        material: {
          linearStiffnessCoefficient: f(20),
          angularStiffnessCoefficient: f(21),
          volumeStiffnessCoefficient: f(22)
        },
        anchors,
        pinnedVertexIndices
      });
    }
    return softBodies;
  }

  loadVmd(bytes: ArrayBuffer | Uint8Array): MmdAnimation {
    const input = toUint8Array(bytes);
    const wasmAnimation = this.loadVmdFromWasm(input);
    if (wasmAnimation) {
      return wasmAnimation;
    }
    const parsed = parseVmd(input);
    return {
      ...parsed,
      bytes: input.slice(),
    };
  }

  private loadVmdFromWasm(input: Uint8Array): MmdAnimation | undefined {
    const motionLoad = this.wasm._yw_mmd_motion_load;
    if (
      typeof motionLoad !== "function" ||
      typeof this.wasm._yw_mmd_motion_free !== "function" ||
      typeof this.wasm._yw_mmd_motion_metadata_i32 !== "function"
    ) {
      return undefined;
    }
    const dataPtr = this.wasm._malloc(input.byteLength);
    if (!dataPtr) {
      if (dataPtr) this.wasm._free(dataPtr);
      throw new Error("Failed to allocate Wasm memory for VMD bytes");
    }
    try {
      this.wasm.refreshMemoryViews();
      this.wasm.HEAPU8.set(input, dataPtr);
      const ok = motionLoad(dataPtr, input.byteLength);
      this.wasm.refreshMemoryViews();
      if (!ok) {
        return undefined;
      }
      return this.readVmdFromLoadedWasm(input);
    } finally {
      this.wasm._yw_mmd_motion_free?.();
      this.wasm._free(dataPtr);
    }
  }

  private readVmdFromLoadedWasm(input: Uint8Array): MmdAnimation {
    const wasm = this.wasm;
    const i32 = wasm._yw_mmd_motion_metadata_i32!;
    const readString = (ptr: number) => (ptr ? wasm.UTF8ToString(ptr) : "");
    const counts = {
      bones: i32(0),
      morphs: i32(1),
      cameras: i32(2),
      lights: i32(3),
      selfShadows: i32(4),
      properties: i32(5)
    };
    const metadata = {
      modelName: readString(wasm._yw_mmd_motion_model_name!()),
      counts,
      maxFrame: i32(6)
    };
    const boneTracks: MmdAnimation["boneTracks"] = {};
    const bonePhysicsToggles = readVmdBonePhysicsToggleQueues(input);
    for (let i = 0; i < counts.bones; i++) {
      const name = readString(wasm._yw_mmd_motion_bone_name!(i));
      const frame = wasm._yw_mmd_motion_bone_i32!(i, 0);
      const boneFrame: VmdBoneFrame = {
        frame,
        translation: [
          wasm._yw_mmd_motion_bone_f32!(i, 0),
          wasm._yw_mmd_motion_bone_f32!(i, 1),
          wasm._yw_mmd_motion_bone_f32!(i, 2)
        ] as [number, number, number],
        rotation: [
          wasm._yw_mmd_motion_bone_f32!(i, 3),
          wasm._yw_mmd_motion_bone_f32!(i, 4),
          wasm._yw_mmd_motion_bone_f32!(i, 5),
          wasm._yw_mmd_motion_bone_f32!(i, 6)
        ] as [number, number, number, number],
        interpolation: readWasmBoneInterpolation(wasm, i)
      };
      const physicsToggle = consumeVmdBonePhysicsToggle(bonePhysicsToggles, name, frame);
      if (physicsToggle !== undefined) {
        boneFrame.physicsToggle = physicsToggle;
      }
      (boneTracks[name] ??= []).push(boneFrame);
    }

    const morphTracks: MmdAnimation["morphTracks"] = {};
    for (let i = 0; i < counts.morphs; i++) {
      const name = readString(wasm._yw_mmd_motion_morph_name!(i));
      (morphTracks[name] ??= []).push({
        frame: wasm._yw_mmd_motion_morph_i32!(i, 0),
        weight: wasm._yw_mmd_motion_morph_f32!(i, 0)
      });
    }

    const cameraFrames: MmdAnimation["cameraFrames"] = [];
    for (let i = 0; i < counts.cameras; i++) {
      cameraFrames.push({
        frame: wasm._yw_mmd_motion_camera_i32!(i, 0),
        distance: wasm._yw_mmd_motion_camera_f32!(i, 0),
        position: [
          wasm._yw_mmd_motion_camera_f32!(i, 1),
          wasm._yw_mmd_motion_camera_f32!(i, 2),
          wasm._yw_mmd_motion_camera_f32!(i, 3)
        ],
        rotation: [
          wasm._yw_mmd_motion_camera_f32!(i, 4),
          wasm._yw_mmd_motion_camera_f32!(i, 5),
          wasm._yw_mmd_motion_camera_f32!(i, 6)
        ],
        interpolation: readWasmCameraInterpolation(wasm, i),
        fov: wasm._yw_mmd_motion_camera_i32!(i, 1),
        perspective: wasm._yw_mmd_motion_camera_i32!(i, 2) !== 0
      });
    }

    const lightFrames: MmdAnimation["lightFrames"] = [];
    for (let i = 0; i < counts.lights; i++) {
      lightFrames.push({
        frame: wasm._yw_mmd_motion_light_i32!(i, 0),
        color: [
          wasm._yw_mmd_motion_light_f32!(i, 0),
          wasm._yw_mmd_motion_light_f32!(i, 1),
          wasm._yw_mmd_motion_light_f32!(i, 2)
        ],
        direction: [
          wasm._yw_mmd_motion_light_f32!(i, 3),
          wasm._yw_mmd_motion_light_f32!(i, 4),
          wasm._yw_mmd_motion_light_f32!(i, 5)
        ]
      });
    }

    const selfShadowFrames: MmdAnimation["selfShadowFrames"] = [];
    for (let i = 0; i < counts.selfShadows; i++) {
      selfShadowFrames.push({
        frame: wasm._yw_mmd_motion_self_shadow_i32!(i, 0),
        mode: wasm._yw_mmd_motion_self_shadow_i32!(i, 1),
        distance: wasm._yw_mmd_motion_self_shadow_f32!(i, 0)
      });
    }

    const propertyFrames: MmdAnimation["propertyFrames"] = [];
    for (let i = 0; i < counts.properties; i++) {
      const ikStates = [];
      const ikCount = wasm._yw_mmd_motion_model_i32!(i, 3);
      for (let j = 0; j < ikCount; j++) {
        ikStates.push({
          boneName: readString(wasm._yw_mmd_motion_model_constraint_name!(i, j)),
          enabled: wasm._yw_mmd_motion_model_constraint_enabled!(i, j) !== 0
        });
      }
      propertyFrames.push({
        frame: wasm._yw_mmd_motion_model_i32!(i, 0),
        visible: wasm._yw_mmd_motion_model_i32!(i, 1) !== 0,
        physicsSimulation: wasm._yw_mmd_motion_model_i32!(i, 2) !== 0,
        ikStates
      });
    }

    sortWasmTracks(boneTracks);
    sortWasmTracks(morphTracks);
    cameraFrames.sort((a, b) => a.frame - b.frame);
    lightFrames.sort((a, b) => a.frame - b.frame);
    selfShadowFrames.sort((a, b) => a.frame - b.frame);
    propertyFrames.sort((a, b) => a.frame - b.frame);

    return {
      kind: "vmd",
      bytes: input.slice(),
      metadata,
      boneTracks,
      morphTracks,
      cameraFrames,
      lightFrames,
      selfShadowFrames,
      propertyFrames
    };
  }

  loadVpd(bytes: ArrayBuffer | Uint8Array): MmdPose {
    const input = toUint8Array(bytes);
    return { ...parseVpd(input), bytes: input.slice() };
  }

  loadVpdAnimation(bytes: ArrayBuffer | Uint8Array, name?: string): MmdAnimation {
    return vpdPoseToAnimation(this.loadVpd(bytes), name);
  }
}

function toSphereMode(mode: number): MaterialInfo["sphereMode"] {
  return mode === 1 ? "multiply" : mode === 2 ? "add" : mode === 3 ? "subTexture" : "none";
}

function toMorphType(type: number): MorphData["type"] {
  switch (type) {
    case 0:
      return "group";
    case 1:
      return "vertex";
    case 2:
      return "bone";
    case 3:
      return "uv";
    case 4:
    case 5:
    case 6:
    case 7:
      return "additionalUv";
    case 8:
      return "material";
    case 9:
      return "flip";
    case 10:
      return "impulse";
    default:
      return "unknown";
  }
}

function morphStride(type: number): number {
  switch (type) {
    case 0:
    case 9:
      return 2;
    case 1:
      return 4;
    case 2:
    case 10:
      return 8;
    case 3:
    case 4:
    case 5:
    case 6:
    case 7:
      return 5;
    case 8:
      return 30;
    default:
      return 0;
  }
}

function readMorphOffsets(
  morph: MorphData,
  type: number,
  data: Float32Array,
  count: number
): void {
  for (let i = 0; i < count; i++) {
    switch (type) {
      case 0:
        morph.groupOffsets.push({ morphIndex: Math.round(data[i * 2]), weight: data[i * 2 + 1] });
        break;
      case 1: {
        const base = i * 4;
        morph.vertexOffsets.push({
          vertexIndex: Math.round(data[base]),
          position: [data[base + 1], data[base + 2], data[base + 3]]
        });
        break;
      }
      case 2: {
        const base = i * 8;
        morph.boneOffsets.push({
          boneIndex: Math.round(data[base]),
          translation: [data[base + 1], data[base + 2], data[base + 3]],
          rotation: [data[base + 4], data[base + 5], data[base + 6], data[base + 7]]
        });
        break;
      }
      case 3: {
        const base = i * 5;
        morph.uvOffsets.push({
          vertexIndex: Math.round(data[base]),
          uv: [data[base + 1], data[base + 2], data[base + 3], data[base + 4]]
        });
        break;
      }
      case 4:
      case 5:
      case 6:
      case 7: {
        const base = i * 5;
        morph.additionalUvOffsets.push({
          vertexIndex: Math.round(data[base]),
          uvIndex: type - 4,
          uv: [data[base + 1], data[base + 2], data[base + 3], data[base + 4]]
        });
        break;
      }
      case 8: {
        const base = i * 30;
        morph.materialOffsets.push({
          materialIndex: Math.round(data[base]),
          operation: data[base + 1] === 0 ? "multiply" : "add",
          diffuse: [data[base + 2], data[base + 3], data[base + 4], data[base + 5]],
          specular: [data[base + 6], data[base + 7], data[base + 8]],
          specularPower: data[base + 9],
          ambient: [data[base + 10], data[base + 11], data[base + 12]],
          edgeColor: [data[base + 13], data[base + 14], data[base + 15], data[base + 16]],
          edgeSize: data[base + 17],
          textureFactor: [data[base + 18], data[base + 19], data[base + 20], data[base + 21]],
          sphereTextureFactor: [
            data[base + 22],
            data[base + 23],
            data[base + 24],
            data[base + 25]
          ],
          toonTextureFactor: [data[base + 26], data[base + 27], data[base + 28], data[base + 29]]
        });
        break;
      }
      case 9:
        morph.flipOffsets?.push({
          morphIndex: Math.round(data[i * 2]),
          weight: data[i * 2 + 1]
        });
        break;
      case 10: {
        const base = i * 8;
        morph.impulseOffsets?.push({
          rigidBodyIndex: Math.round(data[base]),
          local: data[base + 1] !== 0,
          velocity: [data[base + 2], data[base + 3], data[base + 4]],
          torque: [data[base + 5], data[base + 6], data[base + 7]]
        });
        break;
      }
    }
  }
}

function toRigidBodyShape(value: number): RigidBodyData["shape"] {
  return value === 0 ? "sphere" : value === 1 ? "box" : value === 2 ? "capsule" : "unknown";
}

function toRigidBodyMode(value: number): RigidBodyData["mode"] {
  return value === 0 ? "static" : value === 1 ? "dynamic" : value === 2 ? "dynamicBone" : "unknown";
}

function toJointType(value: number): JointData["type"] {
  switch (value) {
    case 0:
      return "generic6dofSpring";
    case 1:
      return "generic6dof";
    case 2:
      return "point2point";
    case 3:
      return "coneTwist";
    case 4:
      return "slider";
    case 5:
      return "hinge";
    default:
      return "unknown";
  }
}

function toSoftBodyType(value: number): SoftBodyData["type"] {
  return value === 0 ? "triMesh" : value === 1 ? "rope" : "unknown";
}

function toSoftBodyAeroModel(value: number): SoftBodyData["aeroModel"] {
  switch (value) {
    case 0:
      return "vertexPoint";
    case 1:
      return "vertexTwoSided";
    case 2:
      return "vertexOneSided";
    case 3:
      return "faceTwoSided";
    case 4:
      return "faceOneSided";
    default:
      return "unknown";
  }
}

function readWasmBoneInterpolation(wasm: YwMmdWasmModule, index: number): VmdBoneInterpolation {
  const read = wasm._yw_mmd_motion_bone_interpolation!;
  return {
    translationX: readWasmInterpolationCurve((component) => read(index, 0, component)),
    translationY: readWasmInterpolationCurve((component) => read(index, 1, component)),
    translationZ: readWasmInterpolationCurve((component) => read(index, 2, component)),
    rotation: readWasmInterpolationCurve((component) => read(index, 3, component))
  };
}

function readWasmCameraInterpolation(wasm: YwMmdWasmModule, index: number): VmdCameraInterpolation {
  const read = wasm._yw_mmd_motion_camera_interpolation!;
  return {
    positionX: readWasmInterpolationCurve((component) => read(index, 0, component)),
    positionY: readWasmInterpolationCurve((component) => read(index, 1, component)),
    positionZ: readWasmInterpolationCurve((component) => read(index, 2, component)),
    rotation: readWasmInterpolationCurve((component) => read(index, 3, component)),
    distance: readWasmInterpolationCurve((component) => read(index, 4, component)),
    fov: readWasmInterpolationCurve((component) => read(index, 5, component))
  };
}

function readWasmInterpolationCurve(read: (component: number) => number): VmdInterpolationCurve {
  return normalizeWasmInterpolationCurve([read(0), read(1), read(2), read(3)]);
}

function normalizeWasmInterpolationCurve(
  values: [number, number, number, number]
): VmdInterpolationCurve {
  return values.map((value) => Math.min(Math.max(value / 127, 0), 1)) as VmdInterpolationCurve;
}

function sortWasmTracks<T extends { frame: number }>(tracks: Record<string, T[]>): void {
  Object.values(tracks).forEach((frames) => {
    frames.sort((a, b) => a.frame - b.frame);
  });
}

function readVmdBonePhysicsToggleQueues(bytes: Uint8Array): Map<string, number[]> {
  const queues = new Map<string, number[]>();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 30 + 20;
  if (bytes.byteLength < offset + 4) {
    return queues;
  }
  const boneCount = view.getUint32(offset, true);
  offset += 4;
  for (let i = 0; i < boneCount; i++) {
    if (offset + 15 + 4 + 7 * 4 + 64 > bytes.byteLength) {
      return queues;
    }
    const name = readVmdShiftJisText(bytes, offset, 15);
    offset += 15;
    const frame = view.getUint32(offset, true);
    offset += 4 + 7 * 4;
    const physicsToggle = readVmdBonePhysicsToggle(bytes[offset + 2] ?? 0, bytes[offset + 3] ?? 0);
    offset += 64;
    if (physicsToggle !== undefined) {
      const key = `${name}\0${frame}`;
      let queue = queues.get(key);
      if (!queue) {
        queue = [];
        queues.set(key, queue);
      }
      queue.push(physicsToggle);
    }
  }
  for (const queue of queues.values()) {
    queue.reverse();
  }
  return queues;
}

function consumeVmdBonePhysicsToggle(
  queues: Map<string, number[]>,
  name: string,
  frame: number
): number | undefined {
  return queues.get(`${name}\0${frame}`)?.pop();
}

function readVmdBonePhysicsToggle(highByte: number, lowByte: number): number | undefined {
  const physicsInfo = (highByte << 8) | lowByte;
  if (physicsInfo === 0x0000) {
    return 1;
  }
  if (physicsInfo === 0x630f) {
    return 0;
  }
  return undefined;
}

function readVmdShiftJisText(bytes: Uint8Array, offset: number, byteLength: number): string {
  const field = bytes.subarray(offset, offset + byteLength);
  const end = field.indexOf(0);
  return vmdShiftJisDecoder.decode(end >= 0 ? field.subarray(0, end) : field).trim();
}
