static int
yw_mmd_detect_model_format(const nanoem_u8_t *data, nanoem_rsize_t length)
{
    if (length >= 4 && data[0] == 'P' && data[1] == 'M' && data[2] == 'X' && data[3] == ' ') {
        return YW_MMD_MODEL_FORMAT_PMX;
    }
    if (length >= 3 && data[0] == 'P' && data[1] == 'm' && data[2] == 'd') {
        return YW_MMD_MODEL_FORMAT_PMD;
    }
    return 0;
}

static float
yw_mmd_read_f32le(const nanoem_u8_t *data)
{
    float value;
    memcpy(&value, data, sizeof(value));
    return value;
}

static void
yw_mmd_fill_header_metadata(const nanoem_u8_t *data, nanoem_rsize_t length, int format, float *out_f32, int *out_i32)
{
    out_i32[YW_MMD_METADATA_FORMAT] = format;
    if (format == YW_MMD_MODEL_FORMAT_PMX && length >= 17) {
        out_f32[0] = yw_mmd_read_f32le(data + 4);
        out_i32[YW_MMD_METADATA_ENCODING] = data[9] == 0 ? 0 : 1;
        out_i32[YW_MMD_METADATA_ADDITIONAL_UV_COUNT] = data[10];
        out_i32[YW_MMD_METADATA_VERTEX_INDEX_SIZE] = data[11];
        out_i32[YW_MMD_METADATA_TEXTURE_INDEX_SIZE] = data[12];
        out_i32[YW_MMD_METADATA_MATERIAL_INDEX_SIZE] = data[13];
        out_i32[YW_MMD_METADATA_BONE_INDEX_SIZE] = data[14];
        out_i32[YW_MMD_METADATA_MORPH_INDEX_SIZE] = data[15];
        out_i32[YW_MMD_METADATA_RIGID_BODY_INDEX_SIZE] = data[16];
    }
    else if (format == YW_MMD_MODEL_FORMAT_PMD && length >= 7) {
        out_f32[0] = yw_mmd_read_f32le(data + 3);
        out_i32[YW_MMD_METADATA_ENCODING] = 2;
        out_i32[YW_MMD_METADATA_VERTEX_INDEX_SIZE] = 2;
        out_i32[YW_MMD_METADATA_TEXTURE_INDEX_SIZE] = 4;
        out_i32[YW_MMD_METADATA_MATERIAL_INDEX_SIZE] = 2;
        out_i32[YW_MMD_METADATA_BONE_INDEX_SIZE] = 2;
        out_i32[YW_MMD_METADATA_MORPH_INDEX_SIZE] = 2;
        out_i32[YW_MMD_METADATA_RIGID_BODY_INDEX_SIZE] = 4;
    }
}

const char *
yw_mmd_version(void)
{
    return "0.0.0+nanoem";
}

int
yw_mmd_health_check(void)
{
    const nanoem_u8_t data[4] = { 1, 2, 3, 4 };
    nanoem_status_t status = NANOEM_STATUS_SUCCESS;
    nanoem_buffer_t *buffer = nanoemBufferCreate(data, sizeof(data), &status);
    int ok = buffer != 0 && status == NANOEM_STATUS_SUCCESS && nanoemBufferGetLength(buffer) == sizeof(data);
    nanoemBufferDestroy(buffer);
    return ok ? 1 : 0;
}

int
yw_mmd_parse_model_metadata(const nanoem_u8_t *data, nanoem_rsize_t length, int requested_format, float *out_f32, int *out_i32)
{
    nanoem_status_t status = NANOEM_STATUS_SUCCESS;
    nanoem_unicode_string_factory_t *factory;
    nanoem_buffer_t *buffer;
    nanoem_model_t *model;
    nanoem_rsize_t count = 0;
    int format;
    int ok;

    if (!data || length == 0 || !out_f32 || !out_i32) {
        return 0;
    }
    memset(out_f32, 0, sizeof(float) * 4);
    memset(out_i32, 0, sizeof(int) * 32);

    format = requested_format == YW_MMD_MODEL_FORMAT_AUTO ? yw_mmd_detect_model_format(data, length) : requested_format;
    if (format == 0) {
        return 0;
    }
    yw_mmd_fill_header_metadata(data, length, format, out_f32, out_i32);

    factory = yw_mmd_get_emst_factory();
    if (!factory) {
        out_i32[YW_MMD_METADATA_STATUS] = NANOEM_STATUS_ERROR_MALLOC_FAILED;
        return 0;
    }
    buffer = nanoemBufferCreate(data, length, &status);
    model = nanoemModelCreate(factory, &status);
    if (!buffer || !model || status != NANOEM_STATUS_SUCCESS) {
        out_i32[YW_MMD_METADATA_STATUS] = status;
        nanoemBufferDestroy(buffer);
        nanoemModelDestroy(model);
        return 0;
    }

    ok = format == YW_MMD_MODEL_FORMAT_PMX ? nanoemModelLoadFromBufferPMX(model, buffer, &status)
                                           : nanoemModelLoadFromBufferPMD(model, buffer, &status);
    if (ok) {
        nanoemModelGetAllVertexObjects(model, &count);
        out_i32[YW_MMD_METADATA_VERTEX_COUNT] = (int) count;
        nanoemModelGetAllVertexIndices(model, &count);
        out_i32[YW_MMD_METADATA_FACE_COUNT] = (int) (count / 3);
        nanoemModelGetAllMaterialObjects(model, &count);
        out_i32[YW_MMD_METADATA_MATERIAL_COUNT] = (int) count;
        nanoemModelGetAllBoneObjects(model, &count);
        out_i32[YW_MMD_METADATA_BONE_COUNT] = (int) count;
        nanoemModelGetAllMorphObjects(model, &count);
        out_i32[YW_MMD_METADATA_MORPH_COUNT] = (int) count;
        nanoemModelGetAllLabelObjects(model, &count);
        out_i32[YW_MMD_METADATA_DISPLAY_FRAME_COUNT] = (int) count;
        nanoemModelGetAllRigidBodyObjects(model, &count);
        out_i32[YW_MMD_METADATA_RIGID_BODY_COUNT] = (int) count;
        nanoemModelGetAllJointObjects(model, &count);
        out_i32[YW_MMD_METADATA_JOINT_COUNT] = (int) count;
        nanoemModelGetAllSoftBodyObjects(model, &count);
        out_i32[YW_MMD_METADATA_SOFT_BODY_COUNT] = (int) count;
    }
    out_i32[YW_MMD_METADATA_STATUS] = status;

    nanoemBufferDestroy(buffer);
    nanoemModelDestroy(model);
    return ok ? 1 : 0;
}

int
yw_mmd_parse_model_metadata_to_cache(const nanoem_u8_t *data, nanoem_rsize_t length, int requested_format)
{
    return yw_mmd_parse_model_metadata(data, length, requested_format, g_yw_mmd_metadata_f32, g_yw_mmd_metadata_i32);
}

float
yw_mmd_metadata_f32(int index)
{
    return index >= 0 && index < 4 ? g_yw_mmd_metadata_f32[index] : 0;
}

int
yw_mmd_metadata_i32(int index)
{
    return index >= 0 && index < 32 ? g_yw_mmd_metadata_i32[index] : 0;
}

int
yw_mmd_parse_vmd_metadata(const nanoem_u8_t *data, nanoem_rsize_t length, int *out_i32)
{
    nanoem_status_t status = NANOEM_STATUS_SUCCESS;
    nanoem_unicode_string_factory_t *factory;
    nanoem_buffer_t *buffer;
    nanoem_motion_t *motion;
    nanoem_rsize_t count = 0;
    int ok;

    if (!data || length == 0 || !out_i32) {
        return 0;
    }
    memset(out_i32, 0, sizeof(int) * 8);

    factory = yw_mmd_get_emst_factory();
    if (!factory) {
        out_i32[YW_MMD_MOTION_STATUS] = NANOEM_STATUS_ERROR_MALLOC_FAILED;
        return 0;
    }
    buffer = nanoemBufferCreate(data, length, &status);
    motion = nanoemMotionCreate(factory, &status);
    if (!buffer || !motion || status != NANOEM_STATUS_SUCCESS) {
        out_i32[YW_MMD_MOTION_STATUS] = status;
        nanoemBufferDestroy(buffer);
        nanoemMotionDestroy(motion);
        return 0;
    }

    ok = nanoemMotionLoadFromBufferVMD(motion, buffer, 0, &status);
    if (ok) {
        nanoemMotionGetAllBoneKeyframeObjects(motion, &count);
        out_i32[YW_MMD_MOTION_BONE_COUNT] = (int) count;
        nanoemMotionGetAllMorphKeyframeObjects(motion, &count);
        out_i32[YW_MMD_MOTION_MORPH_COUNT] = (int) count;
        nanoemMotionGetAllCameraKeyframeObjects(motion, &count);
        out_i32[YW_MMD_MOTION_CAMERA_COUNT] = (int) count;
        nanoemMotionGetAllLightKeyframeObjects(motion, &count);
        out_i32[YW_MMD_MOTION_LIGHT_COUNT] = (int) count;
        nanoemMotionGetAllSelfShadowKeyframeObjects(motion, &count);
        out_i32[YW_MMD_MOTION_SELF_SHADOW_COUNT] = (int) count;
        nanoemMotionGetAllModelKeyframeObjects(motion, &count);
        out_i32[YW_MMD_MOTION_MODEL_COUNT] = (int) count;
        out_i32[YW_MMD_MOTION_MAX_FRAME] = (int) nanoemMotionGetMaxFrameIndex(motion);
    }
    out_i32[YW_MMD_MOTION_STATUS] = status;

    nanoemBufferDestroy(buffer);
    nanoemMotionDestroy(motion);
    return ok ? 1 : 0;
}

static char *
yw_mmd_copy_string(const char *value)
{
    const char *source = value ? value : "";
    size_t length = strlen(source);
    char *copy = (char *) malloc(length + 1);
    if (copy) {
        memcpy(copy, source, length + 1);
    }
    return copy;
}

static char *
yw_mmd_empty_string(void)
{
    return yw_mmd_copy_string("");
}

static char *
yw_mmd_get_model_text(const nanoem_u8_t *data, nanoem_rsize_t length, int requested_format, int text_kind, nanoem_language_type_t language)
{
    nanoem_status_t status = NANOEM_STATUS_SUCCESS;
    nanoem_unicode_string_factory_t *factory;
    nanoem_buffer_t *buffer;
    nanoem_model_t *model;
    const nanoem_unicode_string_t *text = 0;
    nanoem_u8_t stack_buffer[4096];
    nanoem_rsize_t text_length = 0;
    int format;
    int ok;

    if (!data || length == 0) {
        return yw_mmd_empty_string();
    }
    format = requested_format == YW_MMD_MODEL_FORMAT_AUTO ? yw_mmd_detect_model_format(data, length) : requested_format;
    if (format == 0) {
        return yw_mmd_empty_string();
    }
    factory = yw_mmd_get_emst_factory();
    if (!factory) {
        return yw_mmd_empty_string();
    }
    buffer = nanoemBufferCreate(data, length, &status);
    model = nanoemModelCreate(factory, &status);
    if (!buffer || !model || status != NANOEM_STATUS_SUCCESS) {
        nanoemBufferDestroy(buffer);
        nanoemModelDestroy(model);
        return yw_mmd_empty_string();
    }
    ok = format == YW_MMD_MODEL_FORMAT_PMX ? nanoemModelLoadFromBufferPMX(model, buffer, &status)
                                           : nanoemModelLoadFromBufferPMD(model, buffer, &status);
    if (!ok || status != NANOEM_STATUS_SUCCESS) {
        nanoemBufferDestroy(buffer);
        nanoemModelDestroy(model);
        return yw_mmd_empty_string();
    }

    text = text_kind == 0 ? nanoemModelGetName(model, language) : nanoemModelGetComment(model, language);
    if (!text) {
        nanoemBufferDestroy(buffer);
        nanoemModelDestroy(model);
        return yw_mmd_empty_string();
    }
    memset(stack_buffer, 0, sizeof(stack_buffer));
#ifdef __EMSCRIPTEN__
    nanoemUnicodeStringFactoryToUtf8OnStackEMST(
        factory,
        text,
        &text_length,
        (char *)stack_buffer,
        sizeof(stack_buffer),
        &status);
#else
    {
        nanoem_u8_t *utf8 = nanoemUnicodeStringFactoryGetByteArray(factory, text, &text_length, &status);
        if (utf8) {
            size_t copy_len = text_length < sizeof(stack_buffer) - 1 ? text_length : sizeof(stack_buffer) - 1;
            memcpy(stack_buffer, utf8, copy_len);
            stack_buffer[copy_len] = '\0';
            nanoemUnicodeStringFactoryDestroyByteArray(factory, utf8);
        }
    }
#endif

    char *result = status == NANOEM_STATUS_SUCCESS ? yw_mmd_copy_string((const char *) stack_buffer) : yw_mmd_empty_string();
    nanoemBufferDestroy(buffer);
    nanoemModelDestroy(model);
    return result ? result : yw_mmd_empty_string();
}

char *
yw_mmd_get_model_name(const nanoem_u8_t *data, nanoem_rsize_t length, int format)
{
    return yw_mmd_get_model_text(data, length, format, 0, NANOEM_LANGUAGE_TYPE_JAPANESE);
}

char *
yw_mmd_get_model_english_name(const nanoem_u8_t *data, nanoem_rsize_t length, int format)
{
    return yw_mmd_get_model_text(data, length, format, 0, NANOEM_LANGUAGE_TYPE_ENGLISH);
}

char *
yw_mmd_get_model_comment(const nanoem_u8_t *data, nanoem_rsize_t length, int format)
{
    return yw_mmd_get_model_text(data, length, format, 1, NANOEM_LANGUAGE_TYPE_JAPANESE);
}

char *
yw_mmd_get_model_english_comment(const nanoem_u8_t *data, nanoem_rsize_t length, int format)
{
    return yw_mmd_get_model_text(data, length, format, 1, NANOEM_LANGUAGE_TYPE_ENGLISH);
}

void
yw_mmd_free_string(char *str)
{
    free(str);
}
