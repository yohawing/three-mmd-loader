/* tslint:disable */
/* eslint-disable */

export class WasmMmdClip {
    free(): void;
    [Symbol.dispose](): void;
    firstFrame(): number;
    static fromVmdBytesForModel(model: WasmMmdModel, data: Uint8Array): WasmMmdClip;
    hasFrames(): boolean;
    lastFrame(): number;
    constructor(bone_tracks_u32: Uint32Array, bone_keyframe_frames: Uint32Array, bone_keyframe_values: Float32Array, morph_tracks_u32: Uint32Array, morph_keyframe_frames: Uint32Array, morph_keyframe_weights: Float32Array, property_frames: Uint32Array, property_ik_enabled: Uint8Array, property_ik_count: number);
}

export class WasmMmdModel {
    free(): void;
    [Symbol.dispose](): void;
    boneCount(): number;
    static fromPmxBytes(data: Uint8Array): WasmMmdModel;
    ikCount(): number;
    morphCount(): number;
    constructor(parent_indices: Int32Array, rest_positions_xyz: Float32Array);
    static withAppend(parent_indices: Int32Array, rest_positions_xyz: Float32Array, append_u32: Uint32Array, append_ratios: Float32Array): WasmMmdModel;
    static withAppendAndInverseBind(parent_indices: Int32Array, rest_positions_xyz: Float32Array, inverse_bind_matrices: Float32Array, append_u32: Uint32Array, append_ratios: Float32Array): WasmMmdModel;
    static withFull(parent_indices: Int32Array, rest_positions_xyz: Float32Array, inverse_bind_matrices: Float32Array, ik_solvers_u32: Uint32Array, ik_solver_limit_angles: Float32Array, ik_links_u32: Uint32Array, ik_link_limits: Float32Array, append_u32: Uint32Array, append_ratios: Float32Array): WasmMmdModel;
    static withFullAndTransformOrder(parent_indices: Int32Array, rest_positions_xyz: Float32Array, inverse_bind_matrices: Float32Array, transform_orders: Int32Array, ik_solvers_u32: Uint32Array, ik_solver_limit_angles: Float32Array, ik_links_u32: Uint32Array, ik_link_limits: Float32Array, append_u32: Uint32Array, append_ratios: Float32Array): WasmMmdModel;
    static withIk(parent_indices: Int32Array, rest_positions_xyz: Float32Array, ik_solvers_u32: Uint32Array, ik_solver_limit_angles: Float32Array, ik_links_u32: Uint32Array, ik_link_limits: Float32Array): WasmMmdModel;
    static withInverseBind(parent_indices: Int32Array, rest_positions_xyz: Float32Array, inverse_bind_matrices: Float32Array): WasmMmdModel;
    static withMorphs(parent_indices: Int32Array, rest_positions_xyz: Float32Array, inverse_bind_matrices: Float32Array, transform_orders: Int32Array, ik_solvers_u32: Uint32Array, ik_solver_limit_angles: Float32Array, ik_links_u32: Uint32Array, ik_link_limits: Float32Array, append_u32: Uint32Array, append_ratios: Float32Array, morph_count: number, bone_morph_u32: Uint32Array, bone_morph_f32: Float32Array, group_morph_u32: Uint32Array, group_morph_ratios: Float32Array): WasmMmdModel;
}

export class WasmMmdRuntimeBatchEvaluation {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    boneCount(): number;
    copyMorphWeights(out: Float32Array): boolean;
    copyWorldMatrices(out: Float32Array): boolean;
    frameCount(): number;
    morphCount(): number;
    morphWeightF32Len(): number;
    morphWeights(): Float32Array;
    morphWeightsView(): Float32Array;
    worldMatrices(): Float32Array;
    worldMatricesView(): Float32Array;
    worldMatrixF32Len(): number;
}

export class WasmMmdRuntimeInstance {
    free(): void;
    [Symbol.dispose](): void;
    clipFrameBatchMorphWeightF32Len(frame_count: number): number;
    clipFrameBatchWorldMatrixF32Len(frame_count: number): number;
    copyIkEnabled(out: Uint8Array): boolean;
    copyMorphWeights(out: Float32Array): boolean;
    copySkinningMatrices(out: Float32Array): boolean;
    copyWorldMatrices(out: Float32Array): boolean;
    evaluateClipFrame(clip: WasmMmdClip, frame: number): void;
    evaluateClipFrameBatch(clip: WasmMmdClip, start_frame: number, frame_step: number, frame_count: number, worker_count: number): WasmMmdRuntimeBatchEvaluation;
    evaluateClipFrameWithIkOptions(clip: WasmMmdClip, frame: number, ik_tolerance: number, ik_max_iterations_cap: number): void;
    evaluateRestPose(): void;
    static forModel(model: WasmMmdModel): WasmMmdRuntimeInstance;
    ikEnabled(): Uint8Array;
    ikEnabledLen(): number;
    /**
     * Direct typed-array view over the internal IK-enabled cache.
     * Subject to the same invalidation contract as `worldMatricesView`.
     */
    ikEnabledView(): Uint8Array;
    morphWeightLen(): number;
    morphWeights(): Float32Array;
    /**
     * Direct typed-array view over the internal morph-weights cache.
     * Subject to the same invalidation contract as `worldMatricesView`.
     */
    morphWeightsView(): Float32Array;
    constructor(model: WasmMmdModel, morph_count: number);
    skinningMatrices(): Float32Array;
    /**
     * Direct typed-array view over the internal skinning-matrices cache.
     * Subject to the same invalidation contract as `worldMatricesView`.
     */
    skinningMatricesView(): Float32Array;
    skinningMatrixF32Len(): number;
    static withCounts(model: WasmMmdModel, morph_count: number, ik_count: number): WasmMmdRuntimeInstance;
    worldMatrices(): Float32Array;
    /**
     * Direct typed-array view over the internal world-matrices cache.
     *
     * **Caution**: The returned `Float32Array` is invalidated by the next
     * evaluation call (`evaluateRestPose` / `evaluateClipFrame`) and may be
     * invalidated by Wasm memory growth. Callers that need persistent buffers
     * should use `worldMatrices()` (copy) or `copyWorldMatrices()` instead.
     */
    worldMatricesView(): Float32Array;
    worldMatrixF32Len(): number;
}

/**
 * Typed-array geometry DTO for one parsed PMX model.
 *
 * All getter methods return **owned copies** (no wasm-memory lifetime coupling).
 *
 * Strides: positions/normals/sdefC/R0/R1/Rw0/Rw1 — vertex_count×3;
 *   uvs — vertex_count×2; additionalUvs — additional_uv_count×vertex_count×4;
 *   indices — face_count×3 (u32); materialGroups — group_count×3
 *   ([start, count, materialIndex], u32); skinIndices/skinWeights — vertex_count×4;
 *   edgeScale/sdefEnabled/qdefEnabled — vertex_count×1.
 */
export class WasmPmxGeometry {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    additionalUvCount(): number;
    /**
     * Copy of additional UV coordinates (additional_uv_count×vertex_count×4, f32).
     */
    additionalUvs(): Float32Array;
    /**
     * Copy of per-vertex edge scale (vertex_count×1, f32).
     */
    edgeScale(): Float32Array;
    faceCount(): number;
    /**
     * Parse PMX bytes and return the geometry DTO. All returned arrays are copies.
     */
    static fromPmxBytes(data: Uint8Array): WasmPmxGeometry;
    /**
     * Copy of triangle indices (face_count×3, u32). u32 because PMX allows >65535 vertices.
     */
    indices(): Uint32Array;
    materialGroupCount(): number;
    /**
     * Copy of material groups (group_count×3, [start, count, materialIndex], u32).
     */
    materialGroups(): Uint32Array;
    /**
     * Copy of normals (vertex_count×3, XYZ, f32).
     */
    normals(): Float32Array;
    /**
     * Copy of positions (vertex_count×3, XYZ, f32).
     */
    positions(): Float32Array;
    /**
     * Copy of QDEF active flags (vertex_count×1, u8; 1=QDEF, 0=other).
     */
    qdefEnabled(): Uint8Array;
    /**
     * Copy of SDEF C vectors (vertex_count×3, XYZ, f32).
     */
    sdefC(): Float32Array;
    /**
     * Copy of SDEF active flags (vertex_count×1, u8; 1=SDEF, 0=other).
     */
    sdefEnabled(): Uint8Array;
    /**
     * Copy of SDEF R0 vectors (vertex_count×3, XYZ, f32).
     */
    sdefR0(): Float32Array;
    /**
     * Copy of SDEF R1 vectors (vertex_count×3, XYZ, f32).
     */
    sdefR1(): Float32Array;
    /**
     * Copy of SDEF Rw0 vectors (vertex_count×3, XYZ, f32). Pre-computed from R0/R1/C/weight.
     */
    sdefRw0(): Float32Array;
    /**
     * Copy of SDEF Rw1 vectors (vertex_count×3, XYZ, f32). Pre-computed from R0/R1/C/weight.
     */
    sdefRw1(): Float32Array;
    /**
     * Copy of bone skin indices (vertex_count×4, u32). 4 bones per vertex, 0-padded.
     */
    skinIndices(): Uint32Array;
    /**
     * Copy of bone skin weights (vertex_count×4, f32). 4 weights per vertex.
     */
    skinWeights(): Float32Array;
    /**
     * Copy of derived per-vertex skinning mode names.
     *
     * Values match the C ABI `mmd_runtime_parse_pmx_skinning_modes_json`
     * payload: `bdef1`, `bdef2`, `bdef4`, `sdef`, or `qdef`.
     */
    skinningModes(): string[];
    /**
     * Copy of UV coordinates (vertex_count×2, UV, f32).
     */
    uvs(): Float32Array;
    vertexCount(): number;
}

/**
 * Parsed PMX handle for the split loader ABI.
 *
 * Use this when both non-geometry JSON and geometry typed arrays are needed
 * for the same PMX bytes. The PMX parser runs once; getters return owned
 * copies and the handle can be freed immediately after those copies are made.
 */
export class WasmPmxParsedModel {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Return copied geometry typed arrays for this parsed PMX model.
     */
    geometry(): WasmPmxGeometry;
    /**
     * Return JSON with all model data except geometry.
     */
    nonGeometryJson(): string;
    /**
     * Parse PMX bytes once and expose split non-geometry JSON plus geometry DTO getters.
     */
    static parse(data: Uint8Array): WasmPmxParsedModel;
}

export class WasmVmdCameraTrack {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    frameCount(): number;
    static fromVmdBytes(data: Uint8Array): WasmVmdCameraTrack;
    /**
     * Sample the camera track into a caller-owned `Float32Array`.
     *
     * Writes `[distance, position.x, position.y, position.z, rotation.x,
     * rotation.y, rotation.z, fov, perspective]` to `out`.
     * `perspective` is encoded as `1.0` when enabled, otherwise `0.0`.
     * Returns `false` when `out.length < 9`.
     */
    sample(frame: number, out: Float32Array): boolean;
}

export class WasmVmdLightTrack {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    frameCount(): number;
    static fromVmdBytes(data: Uint8Array): WasmVmdLightTrack;
    /**
     * Sample the light track into a caller-owned `Float32Array`.
     *
     * Writes `[color.r, color.g, color.b, direction.x, direction.y,
     * direction.z]` to `out`. Returns `false` when `out.length < 6`.
     */
    sample(frame: number, out: Float32Array): boolean;
}

export class WasmVmdSelfShadowTrack {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    frameCount(): number;
    static fromVmdBytes(data: Uint8Array): WasmVmdSelfShadowTrack;
    /**
     * Sample the self-shadow track into a caller-owned `Float32Array`.
     *
     * Writes `[mode, distance]` to `out`. `mode` is encoded as a float.
     * Returns `false` when `out.length < 2`.
     */
    sample(frame: number, out: Float32Array): boolean;
}

export function exportAccessoryManifestBytes(data: Uint8Array, file_name?: string | null): Uint8Array;

export function exportMmdFormatBytes(data: Uint8Array, file_name?: string | null): Uint8Array;

export function exportPmdModelBytes(data: Uint8Array): Uint8Array;

export function exportPmdModelJsonBytes(json: string): Uint8Array;

export function exportPmxFromParts(metadata_json: string, positions_xyz: Float32Array, normals_xyz: Float32Array, uvs_xy: Float32Array, indices: Uint32Array, skin_indices: Uint32Array, skin_weights: Float32Array, edge_scale: Float32Array): Uint8Array;

export function exportPmxModelBytes(data: Uint8Array): Uint8Array;

export function exportPmxModelJsonBytes(json: string): Uint8Array;

export function exportVmdAnimationBytes(data: Uint8Array): Uint8Array;

export function exportVmdAnimationJsonBytes(json: string): Uint8Array;

export function exportVpdPoseBytes(data: Uint8Array): Uint8Array;

export function exportVpdPoseJsonBytes(json: string): Uint8Array;

export function parseMmdFormatJson(data: Uint8Array, file_name?: string | null): string;

export function parsePmxModelJson(data: Uint8Array): string;

/**
 * Parse PMX bytes and return a JSON string with all model data **except** the
 * geometry section (vertex positions, normals, UVs, indices, skinning data).
 *
 * Each non-geometry field is serialized individually — no geometry JSON is
 * constructed. Use `parsePmxModelJson` when full-model JSON is required.
 */
export function parsePmxModelNonGeometryJson(data: Uint8Array): string;

export function parseVmdAnimationJson(data: Uint8Array): string;

/**
 * Sample VMD camera bytes into a caller-owned `Float32Array`.
 *
 * Writes `[distance, position.x, position.y, position.z, rotation.x,
 * rotation.y, rotation.z, fov, perspective]` to `out`.
 * `perspective` is encoded as `1.0` when enabled, otherwise `0.0`.
 * Returns `false` when `out.length < 9`.
 */
export function sampleVmdCamera(data: Uint8Array, frame: number, out: Float32Array): boolean;

/**
 * Sample VMD light bytes into a caller-owned `Float32Array`.
 *
 * Writes `[color.r, color.g, color.b, direction.x, direction.y,
 * direction.z]` to `out`. Returns `false` when `out.length < 6`.
 */
export function sampleVmdLight(data: Uint8Array, frame: number, out: Float32Array): boolean;

/**
 * Sample VMD self-shadow bytes into a caller-owned `Float32Array`.
 *
 * Writes `[mode, distance]` to `out`. `mode` is encoded as a float.
 * Returns `false` when `out.length < 2`.
 */
export function sampleVmdSelfShadow(data: Uint8Array, frame: number, out: Float32Array): boolean;

export function wasm_wrapper_version(): number;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmmmdclip_free: (a: number, b: number) => void;
    readonly __wbg_wasmmmdmodel_free: (a: number, b: number) => void;
    readonly __wbg_wasmmmdruntimebatchevaluation_free: (a: number, b: number) => void;
    readonly __wbg_wasmmmdruntimeinstance_free: (a: number, b: number) => void;
    readonly __wbg_wasmpmxgeometry_free: (a: number, b: number) => void;
    readonly __wbg_wasmpmxparsedmodel_free: (a: number, b: number) => void;
    readonly __wbg_wasmvmdcameratrack_free: (a: number, b: number) => void;
    readonly __wbg_wasmvmdlighttrack_free: (a: number, b: number) => void;
    readonly __wbg_wasmvmdselfshadowtrack_free: (a: number, b: number) => void;
    readonly exportAccessoryManifestBytes: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly exportMmdFormatBytes: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly exportPmdModelBytes: (a: number, b: number) => [number, number, number, number];
    readonly exportPmdModelJsonBytes: (a: number, b: number) => [number, number, number, number];
    readonly exportPmxFromParts: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number) => [number, number, number, number];
    readonly exportPmxModelBytes: (a: number, b: number) => [number, number, number, number];
    readonly exportPmxModelJsonBytes: (a: number, b: number) => [number, number, number, number];
    readonly exportVmdAnimationBytes: (a: number, b: number) => [number, number, number, number];
    readonly exportVmdAnimationJsonBytes: (a: number, b: number) => [number, number, number, number];
    readonly exportVpdPoseBytes: (a: number, b: number) => [number, number, number, number];
    readonly exportVpdPoseJsonBytes: (a: number, b: number) => [number, number, number, number];
    readonly parseMmdFormatJson: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly parsePmxModelJson: (a: number, b: number) => [number, number, number, number];
    readonly parsePmxModelNonGeometryJson: (a: number, b: number) => [number, number, number, number];
    readonly parseVmdAnimationJson: (a: number, b: number) => [number, number, number, number];
    readonly sampleVmdCamera: (a: number, b: number, c: number, d: any) => [number, number, number];
    readonly sampleVmdLight: (a: number, b: number, c: number, d: any) => [number, number, number];
    readonly sampleVmdSelfShadow: (a: number, b: number, c: number, d: any) => [number, number, number];
    readonly wasm_wrapper_version: () => number;
    readonly wasmmmdclip_firstFrame: (a: number) => number;
    readonly wasmmmdclip_fromVmdBytesForModel: (a: number, b: number, c: number) => [number, number, number];
    readonly wasmmmdclip_hasFrames: (a: number) => number;
    readonly wasmmmdclip_lastFrame: (a: number) => number;
    readonly wasmmmdclip_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number, q: number) => [number, number, number];
    readonly wasmmmdmodel_boneCount: (a: number) => number;
    readonly wasmmmdmodel_fromPmxBytes: (a: number, b: number) => [number, number, number];
    readonly wasmmmdmodel_ikCount: (a: number) => number;
    readonly wasmmmdmodel_morphCount: (a: number) => number;
    readonly wasmmmdmodel_new: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly wasmmmdmodel_withAppend: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number];
    readonly wasmmmdmodel_withAppendAndInverseBind: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number];
    readonly wasmmmdmodel_withFull: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number, q: number, r: number) => [number, number, number];
    readonly wasmmmdmodel_withFullAndTransformOrder: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number, q: number, r: number, s: number, t: number) => [number, number, number];
    readonly wasmmmdmodel_withIk: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => [number, number, number];
    readonly wasmmmdmodel_withInverseBind: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly wasmmmdmodel_withMorphs: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number, q: number, r: number, s: number, t: number, u: number, v: number, w: number, x: number, y: number, z: number, a1: number, b1: number, c1: number) => [number, number, number];
    readonly wasmmmdruntimebatchevaluation_boneCount: (a: number) => number;
    readonly wasmmmdruntimebatchevaluation_copyMorphWeights: (a: number, b: number, c: number, d: any) => number;
    readonly wasmmmdruntimebatchevaluation_copyWorldMatrices: (a: number, b: number, c: number, d: any) => number;
    readonly wasmmmdruntimebatchevaluation_frameCount: (a: number) => number;
    readonly wasmmmdruntimebatchevaluation_morphCount: (a: number) => number;
    readonly wasmmmdruntimebatchevaluation_morphWeightF32Len: (a: number) => number;
    readonly wasmmmdruntimebatchevaluation_morphWeights: (a: number) => [number, number];
    readonly wasmmmdruntimebatchevaluation_morphWeightsView: (a: number) => any;
    readonly wasmmmdruntimebatchevaluation_worldMatrices: (a: number) => [number, number];
    readonly wasmmmdruntimebatchevaluation_worldMatricesView: (a: number) => any;
    readonly wasmmmdruntimebatchevaluation_worldMatrixF32Len: (a: number) => number;
    readonly wasmmmdruntimeinstance_clipFrameBatchMorphWeightF32Len: (a: number, b: number) => number;
    readonly wasmmmdruntimeinstance_clipFrameBatchWorldMatrixF32Len: (a: number, b: number) => number;
    readonly wasmmmdruntimeinstance_copyIkEnabled: (a: number, b: number, c: number, d: any) => number;
    readonly wasmmmdruntimeinstance_copyMorphWeights: (a: number, b: number, c: number, d: any) => number;
    readonly wasmmmdruntimeinstance_copySkinningMatrices: (a: number, b: number, c: number, d: any) => number;
    readonly wasmmmdruntimeinstance_copyWorldMatrices: (a: number, b: number, c: number, d: any) => number;
    readonly wasmmmdruntimeinstance_evaluateClipFrame: (a: number, b: number, c: number) => void;
    readonly wasmmmdruntimeinstance_evaluateClipFrameBatch: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly wasmmmdruntimeinstance_evaluateClipFrameWithIkOptions: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly wasmmmdruntimeinstance_evaluateRestPose: (a: number) => void;
    readonly wasmmmdruntimeinstance_forModel: (a: number) => number;
    readonly wasmmmdruntimeinstance_ikEnabled: (a: number) => [number, number];
    readonly wasmmmdruntimeinstance_ikEnabledLen: (a: number) => number;
    readonly wasmmmdruntimeinstance_ikEnabledView: (a: number) => any;
    readonly wasmmmdruntimeinstance_morphWeightLen: (a: number) => number;
    readonly wasmmmdruntimeinstance_morphWeights: (a: number) => [number, number];
    readonly wasmmmdruntimeinstance_morphWeightsView: (a: number) => any;
    readonly wasmmmdruntimeinstance_new: (a: number, b: number) => number;
    readonly wasmmmdruntimeinstance_skinningMatrices: (a: number) => [number, number];
    readonly wasmmmdruntimeinstance_skinningMatricesView: (a: number) => any;
    readonly wasmmmdruntimeinstance_skinningMatrixF32Len: (a: number) => number;
    readonly wasmmmdruntimeinstance_withCounts: (a: number, b: number, c: number) => number;
    readonly wasmmmdruntimeinstance_worldMatrices: (a: number) => [number, number];
    readonly wasmmmdruntimeinstance_worldMatricesView: (a: number) => any;
    readonly wasmmmdruntimeinstance_worldMatrixF32Len: (a: number) => number;
    readonly wasmpmxgeometry_additionalUvCount: (a: number) => number;
    readonly wasmpmxgeometry_additionalUvs: (a: number) => [number, number];
    readonly wasmpmxgeometry_edgeScale: (a: number) => [number, number];
    readonly wasmpmxgeometry_faceCount: (a: number) => number;
    readonly wasmpmxgeometry_fromPmxBytes: (a: number, b: number) => [number, number, number];
    readonly wasmpmxgeometry_indices: (a: number) => [number, number];
    readonly wasmpmxgeometry_materialGroupCount: (a: number) => number;
    readonly wasmpmxgeometry_materialGroups: (a: number) => [number, number];
    readonly wasmpmxgeometry_normals: (a: number) => [number, number];
    readonly wasmpmxgeometry_positions: (a: number) => [number, number];
    readonly wasmpmxgeometry_qdefEnabled: (a: number) => [number, number];
    readonly wasmpmxgeometry_sdefC: (a: number) => [number, number];
    readonly wasmpmxgeometry_sdefEnabled: (a: number) => [number, number];
    readonly wasmpmxgeometry_sdefR0: (a: number) => [number, number];
    readonly wasmpmxgeometry_sdefR1: (a: number) => [number, number];
    readonly wasmpmxgeometry_sdefRw0: (a: number) => [number, number];
    readonly wasmpmxgeometry_sdefRw1: (a: number) => [number, number];
    readonly wasmpmxgeometry_skinIndices: (a: number) => [number, number];
    readonly wasmpmxgeometry_skinWeights: (a: number) => [number, number];
    readonly wasmpmxgeometry_skinningModes: (a: number) => [number, number];
    readonly wasmpmxgeometry_uvs: (a: number) => [number, number];
    readonly wasmpmxgeometry_vertexCount: (a: number) => number;
    readonly wasmpmxparsedmodel_geometry: (a: number) => number;
    readonly wasmpmxparsedmodel_nonGeometryJson: (a: number) => [number, number, number, number];
    readonly wasmpmxparsedmodel_parse: (a: number, b: number) => [number, number, number];
    readonly wasmvmdcameratrack_frameCount: (a: number) => number;
    readonly wasmvmdcameratrack_fromVmdBytes: (a: number, b: number) => [number, number, number];
    readonly wasmvmdcameratrack_sample: (a: number, b: number, c: any) => [number, number, number];
    readonly wasmvmdlighttrack_frameCount: (a: number) => number;
    readonly wasmvmdlighttrack_fromVmdBytes: (a: number, b: number) => [number, number, number];
    readonly wasmvmdlighttrack_sample: (a: number, b: number, c: any) => [number, number, number];
    readonly wasmvmdselfshadowtrack_frameCount: (a: number) => number;
    readonly wasmvmdselfshadowtrack_fromVmdBytes: (a: number, b: number) => [number, number, number];
    readonly wasmvmdselfshadowtrack_sample: (a: number, b: number, c: any) => [number, number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_drop_slice: (a: number, b: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
