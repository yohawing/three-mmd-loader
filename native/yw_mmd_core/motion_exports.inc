static char **g_mtn_bone_names_cache;
static char **g_mtn_morph_names_cache;
static char **g_mtn_constraint_names_cache;
static uint32_t *g_mtn_bone_name_ptrs;
static uint32_t *g_mtn_morph_name_ptrs;
static uint32_t *g_mtn_constraint_name_ptrs;
static int *g_mtn_bone_i32_table;
static int *g_mtn_bone_interpolation_table;
static float *g_mtn_bone_f32_table;
static int *g_mtn_morph_i32_table;
static float *g_mtn_morph_f32_table;
static int *g_mtn_camera_i32_table;
static int *g_mtn_camera_interpolation_table;
static float *g_mtn_camera_f32_table;
static int *g_mtn_light_i32_table;
static float *g_mtn_light_f32_table;
static int *g_mtn_self_shadow_i32_table;
static float *g_mtn_self_shadow_f32_table;
static int *g_mtn_model_i32_table;
static int *g_mtn_model_constraint_offsets;
static int *g_mtn_model_constraint_enabled;
static int g_mtn_constraint_count_cache;

static void yw_mmd_free_motion_strings(char **values, int count) {
    if (!values) return;
    for (int i = 0; i < count; i++) {
        free(values[i]);
    }
    free(values);
}

static void yw_mmd_clear_motion_tables(void) {
    yw_mmd_free_motion_strings(g_mtn_bone_names_cache, g_mtn.meta_i32[YW_MMD_MOTION_BONE_COUNT]);
    yw_mmd_free_motion_strings(g_mtn_morph_names_cache, g_mtn.meta_i32[YW_MMD_MOTION_MORPH_COUNT]);
    yw_mmd_free_motion_strings(g_mtn_constraint_names_cache, g_mtn_constraint_count_cache);
    g_mtn_bone_names_cache = NULL;
    g_mtn_morph_names_cache = NULL;
    g_mtn_constraint_names_cache = NULL;
    free(g_mtn_bone_name_ptrs); g_mtn_bone_name_ptrs = NULL;
    free(g_mtn_morph_name_ptrs); g_mtn_morph_name_ptrs = NULL;
    free(g_mtn_constraint_name_ptrs); g_mtn_constraint_name_ptrs = NULL;
    free(g_mtn_bone_i32_table); g_mtn_bone_i32_table = NULL;
    free(g_mtn_bone_interpolation_table); g_mtn_bone_interpolation_table = NULL;
    free(g_mtn_bone_f32_table); g_mtn_bone_f32_table = NULL;
    free(g_mtn_morph_i32_table); g_mtn_morph_i32_table = NULL;
    free(g_mtn_morph_f32_table); g_mtn_morph_f32_table = NULL;
    free(g_mtn_camera_i32_table); g_mtn_camera_i32_table = NULL;
    free(g_mtn_camera_interpolation_table); g_mtn_camera_interpolation_table = NULL;
    free(g_mtn_camera_f32_table); g_mtn_camera_f32_table = NULL;
    free(g_mtn_light_i32_table); g_mtn_light_i32_table = NULL;
    free(g_mtn_light_f32_table); g_mtn_light_f32_table = NULL;
    free(g_mtn_self_shadow_i32_table); g_mtn_self_shadow_i32_table = NULL;
    free(g_mtn_self_shadow_f32_table); g_mtn_self_shadow_f32_table = NULL;
    free(g_mtn_model_i32_table); g_mtn_model_i32_table = NULL;
    free(g_mtn_model_constraint_offsets); g_mtn_model_constraint_offsets = NULL;
    free(g_mtn_model_constraint_enabled); g_mtn_model_constraint_enabled = NULL;
    g_mtn_constraint_count_cache = 0;
}

static int yw_mmd_fill_motion_tables(nanoem_unicode_string_factory_t *factory) {
    int bone_count = g_mtn.meta_i32[YW_MMD_MOTION_BONE_COUNT];
    int morph_count = g_mtn.meta_i32[YW_MMD_MOTION_MORPH_COUNT];
    int camera_count = g_mtn.meta_i32[YW_MMD_MOTION_CAMERA_COUNT];
    int light_count = g_mtn.meta_i32[YW_MMD_MOTION_LIGHT_COUNT];
    int self_shadow_count = g_mtn.meta_i32[YW_MMD_MOTION_SELF_SHADOW_COUNT];
    int model_count = g_mtn.meta_i32[YW_MMD_MOTION_MODEL_COUNT];
    int constraint_count = 0;

    for (int i = 0; i < model_count; i++) {
        nanoem_rsize_t count = 0;
        const nanoem_motion_model_keyframe_t *kf = g_mtn.models_arr ? g_mtn.models_arr[i] : NULL;
        if (kf) {
            nanoemMotionModelKeyframeGetAllConstraintStateObjects(kf, &count);
            constraint_count += (int)count;
        }
    }
    g_mtn_constraint_count_cache = constraint_count;

    g_mtn_bone_names_cache = bone_count > 0 ? (char **) calloc((size_t)bone_count, sizeof(char *)) : NULL;
    g_mtn_bone_name_ptrs = bone_count > 0 ? (uint32_t *) calloc((size_t)bone_count, sizeof(uint32_t)) : NULL;
    g_mtn_bone_i32_table = bone_count > 0 ? (int *) calloc((size_t)bone_count * 2, sizeof(int)) : NULL;
    g_mtn_bone_f32_table = bone_count > 0 ? (float *) calloc((size_t)bone_count * 7, sizeof(float)) : NULL;
    g_mtn_bone_interpolation_table = bone_count > 0 ? (int *) calloc((size_t)bone_count * 16, sizeof(int)) : NULL;
    g_mtn_morph_names_cache = morph_count > 0 ? (char **) calloc((size_t)morph_count, sizeof(char *)) : NULL;
    g_mtn_morph_name_ptrs = morph_count > 0 ? (uint32_t *) calloc((size_t)morph_count, sizeof(uint32_t)) : NULL;
    g_mtn_morph_i32_table = morph_count > 0 ? (int *) calloc((size_t)morph_count, sizeof(int)) : NULL;
    g_mtn_morph_f32_table = morph_count > 0 ? (float *) calloc((size_t)morph_count, sizeof(float)) : NULL;
    g_mtn_camera_i32_table = camera_count > 0 ? (int *) calloc((size_t)camera_count * 3, sizeof(int)) : NULL;
    g_mtn_camera_f32_table = camera_count > 0 ? (float *) calloc((size_t)camera_count * 7, sizeof(float)) : NULL;
    g_mtn_camera_interpolation_table = camera_count > 0 ? (int *) calloc((size_t)camera_count * 24, sizeof(int)) : NULL;
    g_mtn_light_i32_table = light_count > 0 ? (int *) calloc((size_t)light_count, sizeof(int)) : NULL;
    g_mtn_light_f32_table = light_count > 0 ? (float *) calloc((size_t)light_count * 6, sizeof(float)) : NULL;
    g_mtn_self_shadow_i32_table = self_shadow_count > 0 ? (int *) calloc((size_t)self_shadow_count * 2, sizeof(int)) : NULL;
    g_mtn_self_shadow_f32_table = self_shadow_count > 0 ? (float *) calloc((size_t)self_shadow_count, sizeof(float)) : NULL;
    g_mtn_model_i32_table = model_count > 0 ? (int *) calloc((size_t)model_count * 4, sizeof(int)) : NULL;
    g_mtn_model_constraint_offsets = model_count > 0 ? (int *) calloc((size_t)model_count + 1, sizeof(int)) : NULL;
    g_mtn_constraint_names_cache = constraint_count > 0 ? (char **) calloc((size_t)constraint_count, sizeof(char *)) : NULL;
    g_mtn_constraint_name_ptrs = constraint_count > 0 ? (uint32_t *) calloc((size_t)constraint_count, sizeof(uint32_t)) : NULL;
    g_mtn_model_constraint_enabled = constraint_count > 0 ? (int *) calloc((size_t)constraint_count, sizeof(int)) : NULL;

    if ((bone_count > 0 && (!g_mtn_bone_names_cache || !g_mtn_bone_name_ptrs || !g_mtn_bone_i32_table || !g_mtn_bone_f32_table || !g_mtn_bone_interpolation_table)) ||
        (morph_count > 0 && (!g_mtn_morph_names_cache || !g_mtn_morph_name_ptrs || !g_mtn_morph_i32_table || !g_mtn_morph_f32_table)) ||
        (camera_count > 0 && (!g_mtn_camera_i32_table || !g_mtn_camera_f32_table || !g_mtn_camera_interpolation_table)) ||
        (light_count > 0 && (!g_mtn_light_i32_table || !g_mtn_light_f32_table)) ||
        (self_shadow_count > 0 && (!g_mtn_self_shadow_i32_table || !g_mtn_self_shadow_f32_table)) ||
        (model_count > 0 && (!g_mtn_model_i32_table || !g_mtn_model_constraint_offsets)) ||
        (constraint_count > 0 && (!g_mtn_constraint_names_cache || !g_mtn_constraint_name_ptrs || !g_mtn_model_constraint_enabled))) {
        yw_mmd_clear_motion_tables();
        return 0;
    }

    for (int i = 0; i < bone_count; i++) {
        const nanoem_motion_bone_keyframe_t *kf = g_mtn.bones_arr[i];
        const float *translation = nanoemMotionBoneKeyframeGetTranslation(kf);
        const float *orientation = nanoemMotionBoneKeyframeGetOrientation(kf);
        int *iv = g_mtn_bone_i32_table + i * 2;
        float *f = g_mtn_bone_f32_table + i * 7;
        int *interp = g_mtn_bone_interpolation_table + i * 16;
        g_mtn_bone_names_cache[i] = yw_mmd_extract_text(factory, nanoemMotionBoneKeyframeGetName(kf));
        if (!g_mtn_bone_names_cache[i]) {
            yw_mmd_clear_motion_tables();
            return 0;
        }
        g_mtn_bone_name_ptrs[i] = (uint32_t)(uintptr_t)g_mtn_bone_names_cache[i];
        iv[0] = (int)nanoemMotionKeyframeObjectGetFrameIndex(nanoemMotionBoneKeyframeGetKeyframeObject(kf));
        iv[1] = nanoemMotionBoneKeyframeIsPhysicsSimulationEnabled(kf) ? 1 : 0;
        f[0] = translation[0]; f[1] = translation[1]; f[2] = translation[2];
        f[3] = orientation[0]; f[4] = orientation[1]; f[5] = orientation[2]; f[6] = orientation[3];
        for (int channel = 0; channel < 4; channel++) {
            const nanoem_u8_t *p = nanoemMotionBoneKeyframeGetInterpolation(kf, (nanoem_motion_bone_keyframe_interpolation_type_t)channel);
            for (int component = 0; component < 4; component++) {
                interp[channel * 4 + component] = p ? (int)p[component] : 0;
            }
        }
    }

    for (int i = 0; i < morph_count; i++) {
        const nanoem_motion_morph_keyframe_t *kf = g_mtn.morphs_arr[i];
        g_mtn_morph_names_cache[i] = yw_mmd_extract_text(factory, nanoemMotionMorphKeyframeGetName(kf));
        if (!g_mtn_morph_names_cache[i]) {
            yw_mmd_clear_motion_tables();
            return 0;
        }
        g_mtn_morph_name_ptrs[i] = (uint32_t)(uintptr_t)g_mtn_morph_names_cache[i];
        g_mtn_morph_i32_table[i] = (int)nanoemMotionKeyframeObjectGetFrameIndex(nanoemMotionMorphKeyframeGetKeyframeObject(kf));
        g_mtn_morph_f32_table[i] = nanoemMotionMorphKeyframeGetWeight(kf);
    }

    for (int i = 0; i < camera_count; i++) {
        const nanoem_motion_camera_keyframe_t *kf = g_mtn.cameras_arr[i];
        const float *lookat = nanoemMotionCameraKeyframeGetLookAt(kf);
        const float *angle = nanoemMotionCameraKeyframeGetAngle(kf);
        int *iv = g_mtn_camera_i32_table + i * 3;
        float *f = g_mtn_camera_f32_table + i * 7;
        int *interp = g_mtn_camera_interpolation_table + i * 24;
        iv[0] = (int)nanoemMotionKeyframeObjectGetFrameIndex(nanoemMotionCameraKeyframeGetKeyframeObject(kf));
        iv[1] = nanoemMotionCameraKeyframeGetFov(kf);
        iv[2] = nanoemMotionCameraKeyframeIsPerspectiveView(kf) ? 1 : 0;
        f[0] = nanoemMotionCameraKeyframeGetDistance(kf);
        f[1] = lookat[0]; f[2] = lookat[1]; f[3] = lookat[2];
        f[4] = angle[0]; f[5] = angle[1]; f[6] = angle[2];
        for (int channel = 0; channel < 6; channel++) {
            const nanoem_u8_t *p = nanoemMotionCameraKeyframeGetInterpolation(kf, (nanoem_motion_camera_keyframe_interpolation_type_t)channel);
            for (int component = 0; component < 4; component++) {
                interp[channel * 4 + component] = p ? (int)p[component] : 0;
            }
        }
    }

    for (int i = 0; i < light_count; i++) {
        const nanoem_motion_light_keyframe_t *kf = g_mtn.lights_arr[i];
        const float *color = nanoemMotionLightKeyframeGetColor(kf);
        const float *direction = nanoemMotionLightKeyframeGetDirection(kf);
        float *f = g_mtn_light_f32_table + i * 6;
        g_mtn_light_i32_table[i] = (int)nanoemMotionKeyframeObjectGetFrameIndex(nanoemMotionLightKeyframeGetKeyframeObject(kf));
        f[0] = color[0]; f[1] = color[1]; f[2] = color[2];
        f[3] = direction[0]; f[4] = direction[1]; f[5] = direction[2];
    }

    for (int i = 0; i < self_shadow_count; i++) {
        const nanoem_motion_self_shadow_keyframe_t *kf = g_mtn.self_shadows_arr[i];
        int *iv = g_mtn_self_shadow_i32_table + i * 2;
        iv[0] = (int)nanoemMotionKeyframeObjectGetFrameIndex(nanoemMotionSelfShadowKeyframeGetKeyframeObject(kf));
        iv[1] = nanoemMotionSelfShadowKeyframeGetMode(kf);
        g_mtn_self_shadow_f32_table[i] = nanoemMotionSelfShadowKeyframeGetDistance(kf);
    }

    int constraint_offset = 0;
    for (int i = 0; i < model_count; i++) {
        const nanoem_motion_model_keyframe_t *kf = g_mtn.models_arr[i];
        nanoem_rsize_t count = 0;
        nanoem_motion_model_keyframe_constraint_state_t *const *states = nanoemMotionModelKeyframeGetAllConstraintStateObjects(kf, &count);
        int *iv = g_mtn_model_i32_table + i * 4;
        g_mtn_model_constraint_offsets[i] = constraint_offset;
        iv[0] = (int)nanoemMotionKeyframeObjectGetFrameIndex(nanoemMotionModelKeyframeGetKeyframeObject(kf));
        iv[1] = nanoemMotionModelKeyframeIsVisible(kf) ? 1 : 0;
        iv[2] = nanoemMotionModelKeyframeIsPhysicsSimulationEnabled(kf) ? 1 : 0;
        iv[3] = (int)count;
        for (int j = 0; states && j < (int)count; j++) {
            const nanoem_motion_model_keyframe_constraint_state_t *state = states[j];
            int index = constraint_offset + j;
            g_mtn_constraint_names_cache[index] = yw_mmd_extract_text(factory, nanoemMotionModelKeyframeConstraintStateGetBoneName(state));
            if (!g_mtn_constraint_names_cache[index]) {
                yw_mmd_clear_motion_tables();
                return 0;
            }
            g_mtn_constraint_name_ptrs[index] = (uint32_t)(uintptr_t)g_mtn_constraint_names_cache[index];
            g_mtn_model_constraint_enabled[index] = nanoemMotionModelKeyframeConstraintStateIsEnabled(state) ? 1 : 0;
        }
        constraint_offset += (int)count;
    }
    if (g_mtn_model_constraint_offsets) {
        g_mtn_model_constraint_offsets[model_count] = constraint_offset;
    }
    return 1;
}

int yw_mmd_motion_load(const nanoem_u8_t *data, nanoem_rsize_t length) {
    nanoem_status_t status = NANOEM_STATUS_SUCCESS;
    nanoem_unicode_string_factory_t *factory;
    nanoem_buffer_t *buffer;
    nanoem_rsize_t count = 0;
    int ok;

    yw_mmd_clear_motion_tables();
    yw_mmd_clear_mtn();
    if (!data || length == 0) return 0;
    factory = yw_mmd_get_emst_factory();
    if (!factory) return 0;
    buffer = nanoemBufferCreate(data, length, &status);
    g_mtn.motion = nanoemMotionCreate(factory, &status);
    if (!buffer || !g_mtn.motion || status != NANOEM_STATUS_SUCCESS) {
        nanoemBufferDestroy(buffer);
        yw_mmd_clear_mtn();
        return 0;
    }
    ok = nanoemMotionLoadFromBufferVMD(g_mtn.motion, buffer, 0, &status);
    nanoemBufferDestroy(buffer);
    if (!ok) {
        yw_mmd_clear_mtn();
        return 0;
    }
    g_mtn.bones_arr = nanoemMotionGetAllBoneKeyframeObjects(g_mtn.motion, &count);
    g_mtn.meta_i32[YW_MMD_MOTION_BONE_COUNT] = (int)count;
    g_mtn.morphs_arr = nanoemMotionGetAllMorphKeyframeObjects(g_mtn.motion, &count);
    g_mtn.meta_i32[YW_MMD_MOTION_MORPH_COUNT] = (int)count;
    g_mtn.cameras_arr = nanoemMotionGetAllCameraKeyframeObjects(g_mtn.motion, &count);
    g_mtn.meta_i32[YW_MMD_MOTION_CAMERA_COUNT] = (int)count;
    g_mtn.lights_arr = nanoemMotionGetAllLightKeyframeObjects(g_mtn.motion, &count);
    g_mtn.meta_i32[YW_MMD_MOTION_LIGHT_COUNT] = (int)count;
    g_mtn.self_shadows_arr = nanoemMotionGetAllSelfShadowKeyframeObjects(g_mtn.motion, &count);
    g_mtn.meta_i32[YW_MMD_MOTION_SELF_SHADOW_COUNT] = (int)count;
    g_mtn.models_arr = nanoemMotionGetAllModelKeyframeObjects(g_mtn.motion, &count);
    g_mtn.meta_i32[YW_MMD_MOTION_MODEL_COUNT] = (int)count;
    g_mtn.meta_i32[YW_MMD_MOTION_MAX_FRAME] = (int)nanoemMotionGetMaxFrameIndex(g_mtn.motion);
    g_mtn.meta_i32[YW_MMD_MOTION_STATUS] = status;
    yw_mmd_fill_motion_tables(factory);
    g_mtn.valid = 1;
    return 1;
}

void yw_mmd_motion_free(void) {
    yw_mmd_clear_motion_tables();
    yw_mmd_clear_mtn();
}

int yw_mmd_motion_metadata_i32(int field) {
    return field >= 0 && field < 8 ? g_mtn.meta_i32[field] : 0;
}

uint32_t *yw_mmd_motion_bone_name_ptrs_ptr(void) { return g_mtn_bone_name_ptrs; }
int *yw_mmd_motion_bone_i32_table_ptr(void) { return g_mtn_bone_i32_table; }
float *yw_mmd_motion_bone_f32_table_ptr(void) { return g_mtn_bone_f32_table; }
int *yw_mmd_motion_bone_interpolation_table_ptr(void) { return g_mtn_bone_interpolation_table; }
uint32_t *yw_mmd_motion_morph_name_ptrs_ptr(void) { return g_mtn_morph_name_ptrs; }
int *yw_mmd_motion_morph_i32_table_ptr(void) { return g_mtn_morph_i32_table; }
float *yw_mmd_motion_morph_f32_table_ptr(void) { return g_mtn_morph_f32_table; }
int *yw_mmd_motion_camera_i32_table_ptr(void) { return g_mtn_camera_i32_table; }
float *yw_mmd_motion_camera_f32_table_ptr(void) { return g_mtn_camera_f32_table; }
int *yw_mmd_motion_camera_interpolation_table_ptr(void) { return g_mtn_camera_interpolation_table; }
int *yw_mmd_motion_light_i32_table_ptr(void) { return g_mtn_light_i32_table; }
float *yw_mmd_motion_light_f32_table_ptr(void) { return g_mtn_light_f32_table; }
int *yw_mmd_motion_self_shadow_i32_table_ptr(void) { return g_mtn_self_shadow_i32_table; }
float *yw_mmd_motion_self_shadow_f32_table_ptr(void) { return g_mtn_self_shadow_f32_table; }
int *yw_mmd_motion_model_i32_table_ptr(void) { return g_mtn_model_i32_table; }
int *yw_mmd_motion_model_constraint_offsets_ptr(void) { return g_mtn_model_constraint_offsets; }
uint32_t *yw_mmd_motion_model_constraint_name_ptrs_ptr(void) { return g_mtn_constraint_name_ptrs; }
int *yw_mmd_motion_model_constraint_enabled_table_ptr(void) { return g_mtn_model_constraint_enabled; }

const char *yw_mmd_motion_model_name(void) {
    return g_mtn.valid && g_mtn.motion ? yw_mmd_extract_text_static(yw_mmd_get_emst_factory(), nanoemMotionGetTargetModelName(g_mtn.motion)) : "";
}

const char *yw_mmd_motion_bone_name(int i) {
    const nanoem_motion_bone_keyframe_t *kf = g_mtn.valid && g_mtn.bones_arr && i >= 0 && i < g_mtn.meta_i32[YW_MMD_MOTION_BONE_COUNT] ? g_mtn.bones_arr[i] : NULL;
    return kf ? yw_mmd_extract_text_static(yw_mmd_get_emst_factory(), nanoemMotionBoneKeyframeGetName(kf)) : "";
}
int yw_mmd_motion_bone_i32(int i, int field) {
    const nanoem_motion_bone_keyframe_t *kf = g_mtn.valid && g_mtn.bones_arr && i >= 0 && i < g_mtn.meta_i32[YW_MMD_MOTION_BONE_COUNT] ? g_mtn.bones_arr[i] : NULL;
    if (!kf) return 0;
    if (field == 0) return (int)nanoemMotionKeyframeObjectGetFrameIndex(nanoemMotionBoneKeyframeGetKeyframeObject(kf));
    if (field == 1) return nanoemMotionBoneKeyframeIsPhysicsSimulationEnabled(kf) ? 1 : 0;
    return 0;
}
float yw_mmd_motion_bone_f32(int i, int field) {
    const nanoem_motion_bone_keyframe_t *kf = g_mtn.valid && g_mtn.bones_arr && i >= 0 && i < g_mtn.meta_i32[YW_MMD_MOTION_BONE_COUNT] ? g_mtn.bones_arr[i] : NULL;
    if (!kf) return 0.0f;
    const float *translation = nanoemMotionBoneKeyframeGetTranslation(kf);
    const float *orientation = nanoemMotionBoneKeyframeGetOrientation(kf);
    if (field >= 0 && field < 3) return translation[field];
    if (field >= 3 && field < 7) return orientation[field - 3];
    return 0.0f;
}
int yw_mmd_motion_bone_interpolation(int i, int channel, int component) {
    const nanoem_motion_bone_keyframe_t *kf = g_mtn.valid && g_mtn.bones_arr && i >= 0 && i < g_mtn.meta_i32[YW_MMD_MOTION_BONE_COUNT] ? g_mtn.bones_arr[i] : NULL;
    const nanoem_u8_t *p = kf ? nanoemMotionBoneKeyframeGetInterpolation(kf, (nanoem_motion_bone_keyframe_interpolation_type_t)channel) : NULL;
    return p && component >= 0 && component < 4 ? (int)p[component] : 0;
}

const char *yw_mmd_motion_morph_name(int i) {
    const nanoem_motion_morph_keyframe_t *kf = g_mtn.valid && g_mtn.morphs_arr && i >= 0 && i < g_mtn.meta_i32[YW_MMD_MOTION_MORPH_COUNT] ? g_mtn.morphs_arr[i] : NULL;
    return kf ? yw_mmd_extract_text_static(yw_mmd_get_emst_factory(), nanoemMotionMorphKeyframeGetName(kf)) : "";
}
int yw_mmd_motion_morph_i32(int i, int field) {
    const nanoem_motion_morph_keyframe_t *kf = g_mtn.valid && g_mtn.morphs_arr && i >= 0 && i < g_mtn.meta_i32[YW_MMD_MOTION_MORPH_COUNT] ? g_mtn.morphs_arr[i] : NULL;
    return kf && field == 0 ? (int)nanoemMotionKeyframeObjectGetFrameIndex(nanoemMotionMorphKeyframeGetKeyframeObject(kf)) : 0;
}
float yw_mmd_motion_morph_f32(int i, int field) {
    const nanoem_motion_morph_keyframe_t *kf = g_mtn.valid && g_mtn.morphs_arr && i >= 0 && i < g_mtn.meta_i32[YW_MMD_MOTION_MORPH_COUNT] ? g_mtn.morphs_arr[i] : NULL;
    return kf && field == 0 ? nanoemMotionMorphKeyframeGetWeight(kf) : 0.0f;
}

int yw_mmd_motion_camera_i32(int i, int field) {
    const nanoem_motion_camera_keyframe_t *kf = g_mtn.valid && g_mtn.cameras_arr && i >= 0 && i < g_mtn.meta_i32[YW_MMD_MOTION_CAMERA_COUNT] ? g_mtn.cameras_arr[i] : NULL;
    if (!kf) return 0;
    if (field == 0) return (int)nanoemMotionKeyframeObjectGetFrameIndex(nanoemMotionCameraKeyframeGetKeyframeObject(kf));
    if (field == 1) return nanoemMotionCameraKeyframeGetFov(kf);
    if (field == 2) return nanoemMotionCameraKeyframeIsPerspectiveView(kf) ? 1 : 0;
    return 0;
}
float yw_mmd_motion_camera_f32(int i, int field) {
    const nanoem_motion_camera_keyframe_t *kf = g_mtn.valid && g_mtn.cameras_arr && i >= 0 && i < g_mtn.meta_i32[YW_MMD_MOTION_CAMERA_COUNT] ? g_mtn.cameras_arr[i] : NULL;
    if (!kf) return 0.0f;
    const float *lookat = nanoemMotionCameraKeyframeGetLookAt(kf);
    const float *angle = nanoemMotionCameraKeyframeGetAngle(kf);
    if (field == 0) return nanoemMotionCameraKeyframeGetDistance(kf);
    if (field >= 1 && field < 4) return lookat[field - 1];
    if (field >= 4 && field < 7) return angle[field - 4];
    return 0.0f;
}
int yw_mmd_motion_camera_interpolation(int i, int channel, int component) {
    const nanoem_motion_camera_keyframe_t *kf = g_mtn.valid && g_mtn.cameras_arr && i >= 0 && i < g_mtn.meta_i32[YW_MMD_MOTION_CAMERA_COUNT] ? g_mtn.cameras_arr[i] : NULL;
    const nanoem_u8_t *p = kf ? nanoemMotionCameraKeyframeGetInterpolation(kf, (nanoem_motion_camera_keyframe_interpolation_type_t)channel) : NULL;
    return p && component >= 0 && component < 4 ? (int)p[component] : 0;
}

int yw_mmd_motion_light_i32(int i, int field) {
    const nanoem_motion_light_keyframe_t *kf = g_mtn.valid && g_mtn.lights_arr && i >= 0 && i < g_mtn.meta_i32[YW_MMD_MOTION_LIGHT_COUNT] ? g_mtn.lights_arr[i] : NULL;
    return kf && field == 0 ? (int)nanoemMotionKeyframeObjectGetFrameIndex(nanoemMotionLightKeyframeGetKeyframeObject(kf)) : 0;
}
float yw_mmd_motion_light_f32(int i, int field) {
    const nanoem_motion_light_keyframe_t *kf = g_mtn.valid && g_mtn.lights_arr && i >= 0 && i < g_mtn.meta_i32[YW_MMD_MOTION_LIGHT_COUNT] ? g_mtn.lights_arr[i] : NULL;
    if (!kf) return 0.0f;
    const float *color = nanoemMotionLightKeyframeGetColor(kf);
    const float *direction = nanoemMotionLightKeyframeGetDirection(kf);
    if (field >= 0 && field < 3) return color[field];
    if (field >= 3 && field < 6) return direction[field - 3];
    return 0.0f;
}

int yw_mmd_motion_self_shadow_i32(int i, int field) {
    const nanoem_motion_self_shadow_keyframe_t *kf = g_mtn.valid && g_mtn.self_shadows_arr && i >= 0 && i < g_mtn.meta_i32[YW_MMD_MOTION_SELF_SHADOW_COUNT] ? g_mtn.self_shadows_arr[i] : NULL;
    if (!kf) return 0;
    if (field == 0) return (int)nanoemMotionKeyframeObjectGetFrameIndex(nanoemMotionSelfShadowKeyframeGetKeyframeObject(kf));
    if (field == 1) return nanoemMotionSelfShadowKeyframeGetMode(kf);
    return 0;
}
float yw_mmd_motion_self_shadow_f32(int i, int field) {
    const nanoem_motion_self_shadow_keyframe_t *kf = g_mtn.valid && g_mtn.self_shadows_arr && i >= 0 && i < g_mtn.meta_i32[YW_MMD_MOTION_SELF_SHADOW_COUNT] ? g_mtn.self_shadows_arr[i] : NULL;
    return kf && field == 0 ? nanoemMotionSelfShadowKeyframeGetDistance(kf) : 0.0f;
}

int yw_mmd_motion_model_i32(int i, int field) {
    const nanoem_motion_model_keyframe_t *kf = g_mtn.valid && g_mtn.models_arr && i >= 0 && i < g_mtn.meta_i32[YW_MMD_MOTION_MODEL_COUNT] ? g_mtn.models_arr[i] : NULL;
    nanoem_rsize_t count = 0;
    if (!kf) return 0;
    if (field == 0) return (int)nanoemMotionKeyframeObjectGetFrameIndex(nanoemMotionModelKeyframeGetKeyframeObject(kf));
    if (field == 1) return nanoemMotionModelKeyframeIsVisible(kf) ? 1 : 0;
    if (field == 2) return nanoemMotionModelKeyframeIsPhysicsSimulationEnabled(kf) ? 1 : 0;
    if (field == 3) {
        nanoemMotionModelKeyframeGetAllConstraintStateObjects(kf, &count);
        return (int)count;
    }
    return 0;
}
const char *yw_mmd_motion_model_constraint_name(int i, int j) {
    const nanoem_motion_model_keyframe_t *kf = g_mtn.valid && g_mtn.models_arr && i >= 0 && i < g_mtn.meta_i32[YW_MMD_MOTION_MODEL_COUNT] ? g_mtn.models_arr[i] : NULL;
    nanoem_rsize_t count = 0;
    nanoem_motion_model_keyframe_constraint_state_t *const *states = kf ? nanoemMotionModelKeyframeGetAllConstraintStateObjects(kf, &count) : NULL;
    const nanoem_motion_model_keyframe_constraint_state_t *state = states && j >= 0 && j < (int)count ? states[j] : NULL;
    return state ? yw_mmd_extract_text_static(yw_mmd_get_emst_factory(), nanoemMotionModelKeyframeConstraintStateGetBoneName(state)) : "";
}
int yw_mmd_motion_model_constraint_enabled(int i, int j) {
    const nanoem_motion_model_keyframe_t *kf = g_mtn.valid && g_mtn.models_arr && i >= 0 && i < g_mtn.meta_i32[YW_MMD_MOTION_MODEL_COUNT] ? g_mtn.models_arr[i] : NULL;
    nanoem_rsize_t count = 0;
    nanoem_motion_model_keyframe_constraint_state_t *const *states = kf ? nanoemMotionModelKeyframeGetAllConstraintStateObjects(kf, &count) : NULL;
    const nanoem_motion_model_keyframe_constraint_state_t *state = states && j >= 0 && j < (int)count ? states[j] : NULL;
    return state && nanoemMotionModelKeyframeConstraintStateIsEnabled(state) ? 1 : 0;
}
