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

export class WasmMmdRuntimeInstance {
    free(): void;
    [Symbol.dispose](): void;
    copyIkEnabled(out: Uint8Array): boolean;
    copyMorphWeights(out: Float32Array): boolean;
    copySkinningMatrices(out: Float32Array): boolean;
    copyWorldMatrices(out: Float32Array): boolean;
    evaluateClipFrame(clip: WasmMmdClip, frame: number): void;
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

export function wasm_wrapper_version(): number;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmmmdclip_free: (a: number, b: number) => void;
    readonly __wbg_wasmmmdmodel_free: (a: number, b: number) => void;
    readonly __wbg_wasmmmdruntimeinstance_free: (a: number, b: number) => void;
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
    readonly wasmmmdruntimeinstance_copyIkEnabled: (a: number, b: number, c: number, d: any) => number;
    readonly wasmmmdruntimeinstance_copyMorphWeights: (a: number, b: number, c: number, d: any) => number;
    readonly wasmmmdruntimeinstance_copySkinningMatrices: (a: number, b: number, c: number, d: any) => number;
    readonly wasmmmdruntimeinstance_copyWorldMatrices: (a: number, b: number, c: number, d: any) => number;
    readonly wasmmmdruntimeinstance_evaluateClipFrame: (a: number, b: number, c: number) => void;
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
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
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
