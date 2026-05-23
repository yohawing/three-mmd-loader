const char *yw_mmd_morph_name(int i) {
    const nanoem_model_morph_t *morph = yw_mmd_morph_at(i);
    return morph ? yw_mmd_extract_text_static(yw_mmd_get_emst_factory(), nanoemModelMorphGetName(morph, NANOEM_LANGUAGE_TYPE_JAPANESE)) : "";
}
const char *yw_mmd_morph_english_name(int i) {
    const nanoem_model_morph_t *morph = yw_mmd_morph_at(i);
    return morph ? yw_mmd_extract_text_static(yw_mmd_get_emst_factory(), nanoemModelMorphGetName(morph, NANOEM_LANGUAGE_TYPE_ENGLISH)) : "";
}
int *yw_mmd_morph_i32_table_ptr(void) {
    return g_mld.valid ? g_mld.morph_i32_table : NULL;
}
uint32_t *yw_mmd_morph_string_ptrs_ptr(void) {
    return g_mld.valid ? g_mld.morph_string_ptrs : NULL;
}
uint32_t *yw_mmd_morph_offset_ptrs_ptr(void) {
    return g_mld.valid ? g_mld.morph_offset_ptrs : NULL;
}
int yw_mmd_morph_type(int i) {
    const nanoem_model_morph_t *morph = yw_mmd_morph_at(i);
    return morph ? (int)nanoemModelMorphGetType(morph) : -1;
}
int yw_mmd_morph_offset_count(int i) {
    return g_mld.valid && g_mld.morph_offset_counts && i >= 0 && i < g_mld.morph_count_p3 ? g_mld.morph_offset_counts[i] : 0;
}
float *yw_mmd_morph_offset_ptr(int i) {
    return g_mld.valid && g_mld.morph_offset_bufs && i >= 0 && i < g_mld.morph_count_p3 ? g_mld.morph_offset_bufs[i] : NULL;
}
float *yw_mmd_morph_dense_position_ptr(int i, int vertex_count) {
    if (!g_mld.valid || !g_mld.morph_offset_bufs || !g_mld.morph_offset_counts ||
        i < 0 || i >= g_mld.morph_count_p3 || vertex_count <= 0 ||
        yw_mmd_morph_type(i) != NANOEM_MODEL_MORPH_TYPE_VERTEX) {
        return NULL;
    }
    float *dense = yw_mmd_prepare_morph_dense_buffer((size_t)vertex_count * 3);
    float *sparse = g_mld.morph_offset_bufs[i];
    int count = g_mld.morph_offset_counts[i];
    if (!dense || !sparse) return NULL;
    for (int j = 0; j < count; j++) {
        float *p = sparse + j * 4;
        int vertex_index = (int)p[0];
        if (vertex_index < 0 || vertex_index >= vertex_count) continue;
        int base = vertex_index * 3;
        dense[base + 0] = p[1];
        dense[base + 1] = p[2];
        dense[base + 2] = -p[3];
    }
    return dense;
}
float *yw_mmd_morph_dense_uv_ptr(int i, int vertex_count) {
    if (!g_mld.valid || !g_mld.morph_offset_bufs || !g_mld.morph_offset_counts ||
        i < 0 || i >= g_mld.morph_count_p3 || vertex_count <= 0 ||
        yw_mmd_morph_type(i) != NANOEM_MODEL_MORPH_TYPE_TEXTURE) {
        return NULL;
    }
    float *dense = yw_mmd_prepare_morph_dense_buffer((size_t)vertex_count * 2);
    float *sparse = g_mld.morph_offset_bufs[i];
    int count = g_mld.morph_offset_counts[i];
    if (!dense || !sparse) return NULL;
    for (int j = 0; j < count; j++) {
        float *p = sparse + j * 5;
        int vertex_index = (int)p[0];
        if (vertex_index < 0 || vertex_index >= vertex_count) continue;
        int base = vertex_index * 2;
        dense[base + 0] = p[1];
        dense[base + 1] = p[2];
    }
    return dense;
}
float *yw_mmd_morph_dense_additional_uv_ptr(int i, int uv_index, int vertex_count) {
    int expected_type = NANOEM_MODEL_MORPH_TYPE_UVA1 + uv_index;
    if (!g_mld.valid || !g_mld.morph_offset_bufs || !g_mld.morph_offset_counts ||
        i < 0 || i >= g_mld.morph_count_p3 || uv_index < 0 || uv_index >= 4 || vertex_count <= 0 ||
        yw_mmd_morph_type(i) != expected_type) {
        return NULL;
    }
    float *dense = yw_mmd_prepare_morph_dense_buffer((size_t)vertex_count * 4);
    float *sparse = g_mld.morph_offset_bufs[i];
    int count = g_mld.morph_offset_counts[i];
    if (!dense || !sparse) return NULL;
    for (int j = 0; j < count; j++) {
        float *p = sparse + j * 5;
        int vertex_index = (int)p[0];
        if (vertex_index < 0 || vertex_index >= vertex_count) continue;
        int base = vertex_index * 4;
        dense[base + 0] = p[1];
        dense[base + 1] = p[2];
        dense[base + 2] = p[3];
        dense[base + 3] = p[4];
    }
    return dense;
}
