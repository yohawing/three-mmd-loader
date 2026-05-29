export interface YwMmdWasmModule {
  HEAPU8: Uint8Array;
  HEAPU16: Uint16Array;
  HEAP32: Int32Array;
  HEAPF32: Float32Array;
  _malloc(size: number): number;
  _free(pointer: number): void;
  _yw_mmd_version(): number;
  _yw_mmd_health_check(): number;
  _yw_mmd_parse_model_metadata(
    dataPointer: number,
    dataLength: number,
    format: number,
    f32Pointer: number,
    i32Pointer: number
  ): number;
  _yw_mmd_parse_model_metadata_to_cache(
    dataPointer: number,
    dataLength: number,
    format: number
  ): number;
  _yw_mmd_metadata_f32(index: number): number;
  _yw_mmd_metadata_i32(index: number): number;
  _yw_mmd_parse_vmd_metadata?(dataPointer: number, dataLength: number, i32Pointer: number): number;
  _yw_mmd_motion_load?: (dataPointer: number, dataLength: number) => number;
  _yw_mmd_motion_free?: () => void;
  _yw_mmd_motion_metadata_i32?: (field: number) => number;
  _yw_mmd_motion_model_name?: () => number;
  _yw_mmd_motion_bone_name_ptrs_ptr?: () => number;
  _yw_mmd_motion_bone_i32_table_ptr?: () => number;
  _yw_mmd_motion_bone_f32_table_ptr?: () => number;
  _yw_mmd_motion_bone_interpolation_table_ptr?: () => number;
  _yw_mmd_motion_bone_name?: (i: number) => number;
  _yw_mmd_motion_bone_i32?: (i: number, field: number) => number;
  _yw_mmd_motion_bone_f32?: (i: number, field: number) => number;
  _yw_mmd_motion_bone_interpolation?: (i: number, channel: number, component: number) => number;
  _yw_mmd_motion_morph_name_ptrs_ptr?: () => number;
  _yw_mmd_motion_morph_i32_table_ptr?: () => number;
  _yw_mmd_motion_morph_f32_table_ptr?: () => number;
  _yw_mmd_motion_morph_name?: (i: number) => number;
  _yw_mmd_motion_morph_i32?: (i: number, field: number) => number;
  _yw_mmd_motion_morph_f32?: (i: number, field: number) => number;
  _yw_mmd_motion_camera_i32_table_ptr?: () => number;
  _yw_mmd_motion_camera_f32_table_ptr?: () => number;
  _yw_mmd_motion_camera_interpolation_table_ptr?: () => number;
  _yw_mmd_motion_camera_i32?: (i: number, field: number) => number;
  _yw_mmd_motion_camera_f32?: (i: number, field: number) => number;
  _yw_mmd_motion_camera_interpolation?: (i: number, channel: number, component: number) => number;
  _yw_mmd_motion_light_i32_table_ptr?: () => number;
  _yw_mmd_motion_light_f32_table_ptr?: () => number;
  _yw_mmd_motion_light_i32?: (i: number, field: number) => number;
  _yw_mmd_motion_light_f32?: (i: number, field: number) => number;
  _yw_mmd_motion_self_shadow_i32_table_ptr?: () => number;
  _yw_mmd_motion_self_shadow_f32_table_ptr?: () => number;
  _yw_mmd_motion_self_shadow_i32?: (i: number, field: number) => number;
  _yw_mmd_motion_self_shadow_f32?: (i: number, field: number) => number;
  _yw_mmd_motion_model_i32_table_ptr?: () => number;
  _yw_mmd_motion_model_constraint_offsets_ptr?: () => number;
  _yw_mmd_motion_model_constraint_name_ptrs_ptr?: () => number;
  _yw_mmd_motion_model_constraint_enabled_table_ptr?: () => number;
  _yw_mmd_motion_model_i32?: (i: number, field: number) => number;
  _yw_mmd_motion_model_constraint_name?: (i: number, j: number) => number;
  _yw_mmd_motion_model_constraint_enabled?: (i: number, j: number) => number;
  _yw_mmd_get_model_name(dataPointer: number, dataLength: number, format: number): number;
  _yw_mmd_get_model_english_name(dataPointer: number, dataLength: number, format: number): number;
  _yw_mmd_get_model_comment(dataPointer: number, dataLength: number, format: number): number;
  _yw_mmd_get_model_english_comment(dataPointer: number, dataLength: number, format: number): number;
  _yw_mmd_free_string(pointer: number): void;
  // Phase 2: unified model load + geometry blob
  _yw_mmd_model_load?(dataPointer: number, dataLength: number, format: number): number;
  _yw_mmd_model_metadata_i32(index: number): number;
  _yw_mmd_model_metadata_f32(index: number): number;
  _yw_mmd_model_name(): number;
  _yw_mmd_model_english_name(): number;
  _yw_mmd_model_comment(): number;
  _yw_mmd_model_english_comment(): number;
  _yw_mmd_model_vertex_count(): number;
  _yw_mmd_model_index_count(): number;
  _yw_mmd_model_additional_uv_count(): number;
  _yw_mmd_model_positions_ptr(): number;
  _yw_mmd_model_normals_ptr(): number;
  _yw_mmd_model_uvs_ptr(): number;
  _yw_mmd_model_skin_indices_ptr(): number;
  _yw_mmd_model_skin_weights_ptr(): number;
  _yw_mmd_model_edge_scale_ptr(): number;
  _yw_mmd_model_sdef_enabled_ptr(): number;
  _yw_mmd_model_sdef_c_ptr(): number;
  _yw_mmd_model_sdef_r0_ptr(): number;
  _yw_mmd_model_sdef_r1_ptr(): number;
  _yw_mmd_model_sdef_rw0_ptr(): number;
  _yw_mmd_model_sdef_rw1_ptr(): number;
  _yw_mmd_model_qdef_enabled_ptr(): number;
  _yw_mmd_model_indices_ptr(): number;
  _yw_mmd_model_additional_uvs_ptr(uvIndex: number): number;
  _yw_mmd_model_free(): void;
  // Phase 3: nanoem-backed non-geometry model data getters
  _yw_mmd_material_name?: (i: number) => number;
  _yw_mmd_material_english_name?: (i: number) => number;
  _yw_mmd_material_texture_path?: (i: number) => number;
  _yw_mmd_material_sphere_texture_path?: (i: number) => number;
  _yw_mmd_material_toon_texture_path?: (i: number) => number;
  _yw_mmd_material_f32_table_ptr?: () => number;
  _yw_mmd_material_i32_table_ptr?: () => number;
  _yw_mmd_material_string_ptrs_ptr?: () => number;
  _yw_mmd_material_f32?: (i: number, field: number) => number;
  _yw_mmd_material_i32?: (i: number, field: number) => number;
  _yw_mmd_bone_name?: (i: number) => number;
  _yw_mmd_bone_english_name?: (i: number) => number;
  _yw_mmd_bone_f32_table_ptr?: () => number;
  _yw_mmd_bone_i32_table_ptr?: () => number;
  _yw_mmd_bone_string_ptrs_ptr?: () => number;
  _yw_mmd_bone_f32?: (i: number, field: number) => number;
  _yw_mmd_bone_i32?: (i: number, field: number) => number;
  _yw_mmd_bone_ik_limit_angle?: (i: number) => number;
  _yw_mmd_bone_ik_link_count?: (i: number) => number;
  _yw_mmd_bone_ik_links_ptr?: (i: number) => number;
  _yw_mmd_morph_name?: (i: number) => number;
  _yw_mmd_morph_english_name?: (i: number) => number;
  _yw_mmd_morph_i32_table_ptr?: () => number;
  _yw_mmd_morph_string_ptrs_ptr?: () => number;
  _yw_mmd_morph_offset_ptrs_ptr?: () => number;
  _yw_mmd_morph_type?: (i: number) => number;
  _yw_mmd_morph_offset_count?: (i: number) => number;
  _yw_mmd_morph_offset_ptr?: (i: number) => number;
  _yw_mmd_morph_dense_position_ptr?: (i: number, vertexCount: number) => number;
  _yw_mmd_morph_dense_uv_ptr?: (i: number, vertexCount: number) => number;
  _yw_mmd_morph_dense_additional_uv_ptr?: (
    i: number,
    uvIndex: number,
    vertexCount: number
  ) => number;
  _yw_mmd_label_name?: (i: number) => number;
  _yw_mmd_label_english_name?: (i: number) => number;
  _yw_mmd_label_is_special?: (i: number) => number;
  _yw_mmd_label_item_count?: (i: number) => number;
  _yw_mmd_label_item_type?: (i: number, j: number) => number;
  _yw_mmd_label_item_index?: (i: number, j: number) => number;
  _yw_mmd_rigid_body_string_ptrs_ptr?: () => number;
  _yw_mmd_rigid_body_f32_table_ptr?: () => number;
  _yw_mmd_rigid_body_i32_table_ptr?: () => number;
  _yw_mmd_rigid_body_name?: (i: number) => number;
  _yw_mmd_rigid_body_english_name?: (i: number) => number;
  _yw_mmd_rigid_body_f32?: (i: number, field: number) => number;
  _yw_mmd_rigid_body_i32?: (i: number, field: number) => number;
  _yw_mmd_joint_string_ptrs_ptr?: () => number;
  _yw_mmd_joint_f32_table_ptr?: () => number;
  _yw_mmd_joint_i32_table_ptr?: () => number;
  _yw_mmd_joint_name?: (i: number) => number;
  _yw_mmd_joint_english_name?: (i: number) => number;
  _yw_mmd_joint_f32?: (i: number, field: number) => number;
  _yw_mmd_joint_i32?: (i: number, field: number) => number;
  _yw_mmd_soft_body_string_ptrs_ptr?: () => number;
  _yw_mmd_soft_body_f32_table_ptr?: () => number;
  _yw_mmd_soft_body_i32_table_ptr?: () => number;
  _yw_mmd_soft_body_anchor_offsets_ptr?: () => number;
  _yw_mmd_soft_body_anchor_i32_table_ptr?: () => number;
  _yw_mmd_soft_body_pinned_offsets_ptr?: () => number;
  _yw_mmd_soft_body_pinned_vertex_table_ptr?: () => number;
  _yw_mmd_soft_body_name?: (i: number) => number;
  _yw_mmd_soft_body_english_name?: (i: number) => number;
  _yw_mmd_soft_body_i32?: (i: number, field: number) => number;
  _yw_mmd_soft_body_f32?: (i: number, field: number) => number;
  _yw_mmd_soft_body_anchor_i32?: (i: number, j: number, field: number) => number;
  _yw_mmd_soft_body_pinned_vertex?: (i: number, j: number) => number;
  ccall(
    ident: string,
    returnType: "number" | "string" | null,
    argTypes: Array<"number" | "string" | "array">,
    args: unknown[]
  ): number | string | null;
  UTF8ToString(pointer: number): string;
  refreshMemoryViews(): void;
}

export default function createYwMmdCoreModule(options?: {
  locateFile?: (path: string, prefix: string) => string;
}): Promise<YwMmdWasmModule>;
