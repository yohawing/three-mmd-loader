int
yw_mmd_model_load(const nanoem_u8_t *data, nanoem_rsize_t length, int format)
{
    yw_mmd_clear_mld();

    if (!data || length == 0) return 0;

    int actual_format = (format == 0)
        ? yw_mmd_detect_model_format(data, length)
        : format;
    if (actual_format == 0) return 0;

    nanoem_unicode_string_factory_t *factory = yw_mmd_get_emst_factory();
    if (!factory) return 0;

    nanoem_status_t status = NANOEM_STATUS_SUCCESS;
    nanoem_buffer_t *buffer = nanoemBufferCreate(data, length, &status);
    nanoem_model_t  *model  = nanoemModelCreate(factory, &status);
    if (!buffer || !model || status != NANOEM_STATUS_SUCCESS) {
        nanoemBufferDestroy(buffer);
        nanoemModelDestroy(model);
        return 0;
    }
    int ok = (actual_format == YW_MMD_MODEL_FORMAT_PMX)
        ? nanoemModelLoadFromBufferPMX(model, buffer, &status)
        : nanoemModelLoadFromBufferPMD(model, buffer, &status);
    nanoemBufferDestroy(buffer);
    if (!ok) { nanoemModelDestroy(model); return 0; }

    g_mld.model = model;

    yw_mmd_fill_header_metadata(data, length, actual_format,
                                g_mld.meta_f32, g_mld.meta_i32);
    g_mld.meta_i32[YW_MMD_METADATA_FORMAT] = actual_format;
    g_mld.meta_i32[YW_MMD_METADATA_STATUS] = status;

    nanoem_rsize_t count = 0;
#define FILL_COUNT(getter, key) \
    getter(model, &count); g_mld.meta_i32[key] = (int)count
    FILL_COUNT(nanoemModelGetAllVertexObjects,    YW_MMD_METADATA_VERTEX_COUNT);
    FILL_COUNT(nanoemModelGetAllMaterialObjects,  YW_MMD_METADATA_MATERIAL_COUNT);
    FILL_COUNT(nanoemModelGetAllBoneObjects,      YW_MMD_METADATA_BONE_COUNT);
    FILL_COUNT(nanoemModelGetAllMorphObjects,     YW_MMD_METADATA_MORPH_COUNT);
    FILL_COUNT(nanoemModelGetAllLabelObjects,     YW_MMD_METADATA_DISPLAY_FRAME_COUNT);
    FILL_COUNT(nanoemModelGetAllRigidBodyObjects, YW_MMD_METADATA_RIGID_BODY_COUNT);
    FILL_COUNT(nanoemModelGetAllJointObjects,     YW_MMD_METADATA_JOINT_COUNT);
    FILL_COUNT(nanoemModelGetAllSoftBodyObjects,  YW_MMD_METADATA_SOFT_BODY_COUNT);
#undef FILL_COUNT
    nanoemModelGetAllVertexIndices(model, &count);
    g_mld.meta_i32[YW_MMD_METADATA_FACE_COUNT] = (int)(count / 3);

    g_mld.name           = yw_mmd_extract_text(factory, nanoemModelGetName(model,    NANOEM_LANGUAGE_TYPE_JAPANESE));
    g_mld.english_name   = yw_mmd_extract_text(factory, nanoemModelGetName(model,    NANOEM_LANGUAGE_TYPE_ENGLISH));
    g_mld.comment        = yw_mmd_extract_text(factory, nanoemModelGetComment(model, NANOEM_LANGUAGE_TYPE_JAPANESE));
    g_mld.english_comment= yw_mmd_extract_text(factory, nanoemModelGetComment(model, NANOEM_LANGUAGE_TYPE_ENGLISH));

    nanoem_rsize_t vertex_count = 0, index_count = 0;
    nanoem_model_vertex_t *const *vertices =
        nanoemModelGetAllVertexObjects(model, &vertex_count);
    const nanoem_u32_t *raw_indices =
        nanoemModelGetAllVertexIndices(model, &index_count);

    int V = (int)vertex_count;
    int I = (int)index_count;
    int auv = g_mld.meta_i32[YW_MMD_METADATA_ADDITIONAL_UV_COUNT];

    g_mld.positions    = (float *)    malloc((size_t)V * 3 * sizeof(float));
    g_mld.normals      = (float *)    malloc((size_t)V * 3 * sizeof(float));
    g_mld.uvs          = (float *)    malloc((size_t)V * 2 * sizeof(float));
    g_mld.skin_indices = (uint16_t *) malloc((size_t)V * 4 * sizeof(uint16_t));
    g_mld.skin_weights = (float *)    malloc((size_t)V * 4 * sizeof(float));
    g_mld.edge_scale   = (float *)    malloc((size_t)V     * sizeof(float));
    g_mld.sdef_enabled = (float *)    malloc((size_t)V     * sizeof(float));
    g_mld.sdef_c       = (float *)    malloc((size_t)V * 3 * sizeof(float));
    g_mld.sdef_r0      = (float *)    malloc((size_t)V * 3 * sizeof(float));
    g_mld.sdef_r1      = (float *)    malloc((size_t)V * 3 * sizeof(float));
    g_mld.sdef_rw0     = (float *)    malloc((size_t)V * 3 * sizeof(float));
    g_mld.sdef_rw1     = (float *)    malloc((size_t)V * 3 * sizeof(float));
    g_mld.indices      = (uint32_t *) malloc((size_t)I     * sizeof(uint32_t));
    g_mld.additional_uvs = (auv > 0)
        ? (float *) malloc((size_t)V * 4 * (size_t)auv * sizeof(float))
        : NULL;

    if (!g_mld.positions || !g_mld.normals || !g_mld.uvs ||
        !g_mld.skin_indices || !g_mld.skin_weights || !g_mld.edge_scale ||
        !g_mld.sdef_enabled || !g_mld.sdef_c || !g_mld.sdef_r0 ||
        !g_mld.sdef_r1 || !g_mld.sdef_rw0 || !g_mld.sdef_rw1 ||
        !g_mld.indices || (auv > 0 && !g_mld.additional_uvs)) {
        yw_mmd_clear_mld();
        return 0;
    }
    memset(g_mld.skin_indices, 0, (size_t)V * 4 * sizeof(uint16_t));
    memset(g_mld.skin_weights, 0, (size_t)V * 4 * sizeof(float));
    memset(g_mld.sdef_enabled, 0, (size_t)V     * sizeof(float));
    memset(g_mld.sdef_c, 0, (size_t)V * 3 * sizeof(float));
    memset(g_mld.sdef_r0, 0, (size_t)V * 3 * sizeof(float));
    memset(g_mld.sdef_r1, 0, (size_t)V * 3 * sizeof(float));
    memset(g_mld.sdef_rw0, 0, (size_t)V * 3 * sizeof(float));
    memset(g_mld.sdef_rw1, 0, (size_t)V * 3 * sizeof(float));

    for (int i = 0; i < V; i++) {
        const nanoem_model_vertex_t *v = vertices[i];
        const float *pos = nanoemModelVertexGetOrigin(v);
        const float *nrm = nanoemModelVertexGetNormal(v);
        const float *uv  = nanoemModelVertexGetTexCoord(v);
        int p3 = i * 3;
        g_mld.positions[p3]   = pos[0];
        g_mld.positions[p3+1] = pos[1];
        g_mld.positions[p3+2] = pos[2];
        g_mld.normals  [p3]   = nrm[0];
        g_mld.normals  [p3+1] = nrm[1];
        g_mld.normals  [p3+2] = nrm[2];
        int p2 = i * 2;
        g_mld.uvs[p2]   = uv[0];
        g_mld.uvs[p2+1] = uv[1];
        g_mld.edge_scale[i] = nanoemModelVertexGetEdgeSize(v);

        for (int j = 0; j < auv; j++) {
            const float *auv_data = nanoemModelVertexGetAdditionalUV(v, (nanoem_rsize_t)j);
            int base = (j * V + i) * 4;
            g_mld.additional_uvs[base+0] = auv_data[0];
            g_mld.additional_uvs[base+1] = auv_data[1];
            g_mld.additional_uvs[base+2] = auv_data[2];
            g_mld.additional_uvs[base+3] = auv_data[3];
        }

        nanoem_model_vertex_type_t vtype = nanoemModelVertexGetType(v);
        int s4 = i * 4;
        switch (vtype) {
        case NANOEM_MODEL_VERTEX_TYPE_BDEF1:
            g_mld.skin_indices[s4]   = (uint16_t)yw_mmd_bone_index(nanoemModelVertexGetBoneObject(v, 0));
            g_mld.skin_weights[s4]   = 1.0f;
            break;
        case NANOEM_MODEL_VERTEX_TYPE_BDEF2:
        case NANOEM_MODEL_VERTEX_TYPE_SDEF: {
            float w0 = nanoemModelVertexGetBoneWeight(v, 0);
            g_mld.skin_indices[s4]   = (uint16_t)yw_mmd_bone_index(nanoemModelVertexGetBoneObject(v, 0));
            g_mld.skin_indices[s4+1] = (uint16_t)yw_mmd_bone_index(nanoemModelVertexGetBoneObject(v, 1));
            g_mld.skin_weights[s4]   = w0;
            g_mld.skin_weights[s4+1] = 1.0f - w0;
            if (vtype == NANOEM_MODEL_VERTEX_TYPE_SDEF) {
                const float *sc = nanoemModelVertexGetSdefC(v);
                const float *sr0= nanoemModelVertexGetSdefR0(v);
                const float *sr1= nanoemModelVertexGetSdefR1(v);
                g_mld.sdef_enabled[i] = 1.0f;
                memcpy(g_mld.sdef_c  + p3, sc,  3*sizeof(float));
                memcpy(g_mld.sdef_r0 + p3, sr0, 3*sizeof(float));
                memcpy(g_mld.sdef_r1 + p3, sr1, 3*sizeof(float));
                yw_mmd_compute_sdef_rw(sc, sr0, sr1, w0,
                                       g_mld.sdef_rw0 + p3,
                                       g_mld.sdef_rw1 + p3);
            }
            break;
        }
        case NANOEM_MODEL_VERTEX_TYPE_BDEF4:
        case NANOEM_MODEL_VERTEX_TYPE_QDEF:
            for (int k = 0; k < 4; k++) {
                g_mld.skin_indices[s4+k] = (uint16_t)yw_mmd_bone_index(nanoemModelVertexGetBoneObject(v, (nanoem_rsize_t)k));
                g_mld.skin_weights[s4+k] = nanoemModelVertexGetBoneWeight(v, (nanoem_rsize_t)k);
            }
            break;
        default:
            break;
        }
    }

    if (raw_indices && I > 0) {
        memcpy(g_mld.indices, raw_indices, (size_t)I * sizeof(uint32_t));
    }

    yw_mmd_fill_phase3_objects(model, factory);

    g_mld.vertex_count         = V;
    g_mld.index_count          = I;
    g_mld.additional_uv_count  = auv;
    g_mld.valid = 1;
    return 1;
}

int   yw_mmd_model_metadata_i32(int index) {
    return (g_mld.valid && index >= 0 && index < 32) ? g_mld.meta_i32[index] : 0;
}
float yw_mmd_model_metadata_f32(int index) {
    return (g_mld.valid && index >= 0 && index < 4)  ? g_mld.meta_f32[index] : 0.0f;
}

const char *yw_mmd_model_name(void)           { return g_mld.valid ? g_mld.name           : ""; }
const char *yw_mmd_model_english_name(void)   { return g_mld.valid ? g_mld.english_name   : ""; }
const char *yw_mmd_model_comment(void)        { return g_mld.valid ? g_mld.comment        : ""; }
const char *yw_mmd_model_english_comment(void){ return g_mld.valid ? g_mld.english_comment: ""; }

int yw_mmd_model_vertex_count(void)        { return g_mld.vertex_count; }
int yw_mmd_model_index_count(void)         { return g_mld.index_count;  }
int yw_mmd_model_additional_uv_count(void) { return g_mld.additional_uv_count; }

float    *yw_mmd_model_positions_ptr(void)    { return g_mld.positions; }
float    *yw_mmd_model_normals_ptr(void)      { return g_mld.normals; }
float    *yw_mmd_model_uvs_ptr(void)          { return g_mld.uvs; }
uint16_t *yw_mmd_model_skin_indices_ptr(void) { return g_mld.skin_indices; }
float    *yw_mmd_model_skin_weights_ptr(void) { return g_mld.skin_weights; }
float    *yw_mmd_model_edge_scale_ptr(void)   { return g_mld.edge_scale; }
float    *yw_mmd_model_sdef_enabled_ptr(void) { return g_mld.sdef_enabled; }
float    *yw_mmd_model_sdef_c_ptr(void)       { return g_mld.sdef_c; }
float    *yw_mmd_model_sdef_r0_ptr(void)      { return g_mld.sdef_r0; }
float    *yw_mmd_model_sdef_r1_ptr(void)      { return g_mld.sdef_r1; }
float    *yw_mmd_model_sdef_rw0_ptr(void)     { return g_mld.sdef_rw0; }
float    *yw_mmd_model_sdef_rw1_ptr(void)     { return g_mld.sdef_rw1; }
uint32_t *yw_mmd_model_indices_ptr(void)      { return g_mld.indices; }
float    *yw_mmd_model_additional_uvs_ptr(int uv_index) {
    if (!g_mld.valid || !g_mld.additional_uvs ||
        uv_index < 0 || uv_index >= g_mld.additional_uv_count) return NULL;
    return g_mld.additional_uvs + uv_index * g_mld.vertex_count * 4;
}

void yw_mmd_model_free(void) { yw_mmd_clear_mld(); }
