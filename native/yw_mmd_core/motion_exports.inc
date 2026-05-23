int yw_mmd_motion_load(const nanoem_u8_t *data, nanoem_rsize_t length) {
    nanoem_status_t status = NANOEM_STATUS_SUCCESS;
    nanoem_unicode_string_factory_t *factory;
    nanoem_buffer_t *buffer;
    nanoem_rsize_t count = 0;
    int ok;

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
    g_mtn.valid = 1;
    return 1;
}

void yw_mmd_motion_free(void) {
    yw_mmd_clear_mtn();
}

int yw_mmd_motion_metadata_i32(int field) {
    return field >= 0 && field < 8 ? g_mtn.meta_i32[field] : 0;
}

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
