static char **g_mld_rigid_body_names_cache;
static char **g_mld_rigid_body_english_names_cache;
static uint32_t *g_mld_rigid_body_string_ptrs;
static float *g_mld_rigid_body_f32_table;
static int *g_mld_rigid_body_i32_table;
static char **g_mld_joint_names_cache;
static char **g_mld_joint_english_names_cache;
static uint32_t *g_mld_joint_string_ptrs;
static float *g_mld_joint_f32_table;
static int *g_mld_joint_i32_table;
static char **g_mld_soft_body_names_cache;
static char **g_mld_soft_body_english_names_cache;
static uint32_t *g_mld_soft_body_string_ptrs;
static float *g_mld_soft_body_f32_table;
static int *g_mld_soft_body_i32_table;
static int *g_mld_soft_body_anchor_offsets;
static int *g_mld_soft_body_anchor_i32_table;
static int *g_mld_soft_body_pinned_offsets;
static int *g_mld_soft_body_pinned_vertex_table;
static int g_mld_soft_body_anchor_count_cache;
static int g_mld_soft_body_pinned_count_cache;
static int g_mld_physics_tables_valid;

static void
yw_mmd_free_string_table(char **values, int count)
{
    if (!values) return;
    for (int i = 0; i < count; i++) {
        free(values[i]);
    }
    free(values);
}

void
yw_mmd_clear_physics_tables(void)
{
    yw_mmd_free_string_table(g_mld_rigid_body_names_cache, g_mld.meta_i32[YW_MMD_METADATA_RIGID_BODY_COUNT]);
    yw_mmd_free_string_table(g_mld_rigid_body_english_names_cache, g_mld.meta_i32[YW_MMD_METADATA_RIGID_BODY_COUNT]);
    yw_mmd_free_string_table(g_mld_joint_names_cache, g_mld.meta_i32[YW_MMD_METADATA_JOINT_COUNT]);
    yw_mmd_free_string_table(g_mld_joint_english_names_cache, g_mld.meta_i32[YW_MMD_METADATA_JOINT_COUNT]);
    yw_mmd_free_string_table(g_mld_soft_body_names_cache, g_mld.meta_i32[YW_MMD_METADATA_SOFT_BODY_COUNT]);
    yw_mmd_free_string_table(g_mld_soft_body_english_names_cache, g_mld.meta_i32[YW_MMD_METADATA_SOFT_BODY_COUNT]);
    g_mld_rigid_body_names_cache = NULL;
    g_mld_rigid_body_english_names_cache = NULL;
    g_mld_joint_names_cache = NULL;
    g_mld_joint_english_names_cache = NULL;
    g_mld_soft_body_names_cache = NULL;
    g_mld_soft_body_english_names_cache = NULL;
    free(g_mld_rigid_body_string_ptrs); g_mld_rigid_body_string_ptrs = NULL;
    free(g_mld_rigid_body_f32_table); g_mld_rigid_body_f32_table = NULL;
    free(g_mld_rigid_body_i32_table); g_mld_rigid_body_i32_table = NULL;
    free(g_mld_joint_string_ptrs); g_mld_joint_string_ptrs = NULL;
    free(g_mld_joint_f32_table); g_mld_joint_f32_table = NULL;
    free(g_mld_joint_i32_table); g_mld_joint_i32_table = NULL;
    free(g_mld_soft_body_string_ptrs); g_mld_soft_body_string_ptrs = NULL;
    free(g_mld_soft_body_f32_table); g_mld_soft_body_f32_table = NULL;
    free(g_mld_soft_body_i32_table); g_mld_soft_body_i32_table = NULL;
    free(g_mld_soft_body_anchor_offsets); g_mld_soft_body_anchor_offsets = NULL;
    free(g_mld_soft_body_anchor_i32_table); g_mld_soft_body_anchor_i32_table = NULL;
    free(g_mld_soft_body_pinned_offsets); g_mld_soft_body_pinned_offsets = NULL;
    free(g_mld_soft_body_pinned_vertex_table); g_mld_soft_body_pinned_vertex_table = NULL;
    g_mld_soft_body_anchor_count_cache = 0;
    g_mld_soft_body_pinned_count_cache = 0;
    g_mld_physics_tables_valid = 0;
}

static int
yw_mmd_fill_physics_tables(void)
{
    if (g_mld_physics_tables_valid) return 1;
    if (!g_mld.valid) return 0;

    int rb_count = g_mld.meta_i32[YW_MMD_METADATA_RIGID_BODY_COUNT];
    int joint_count = g_mld.meta_i32[YW_MMD_METADATA_JOINT_COUNT];
    int soft_count = g_mld.meta_i32[YW_MMD_METADATA_SOFT_BODY_COUNT];
    int anchor_total = 0;
    int pinned_total = 0;
    nanoem_unicode_string_factory_t *factory = yw_mmd_get_emst_factory();

    for (int i = 0; i < soft_count; i++) {
        const nanoem_model_soft_body_t *sb = g_mld.soft_bodies_arr ? g_mld.soft_bodies_arr[i] : NULL;
        nanoem_rsize_t count = 0;
        if (sb) {
            nanoemModelSoftBodyGetAllAnchorObjects(sb, &count);
            anchor_total += (int)count;
            nanoemModelSoftBodyGetAllPinnedVertexIndices(sb, &count);
            pinned_total += (int)count;
        }
    }
    g_mld_soft_body_anchor_count_cache = anchor_total;
    g_mld_soft_body_pinned_count_cache = pinned_total;

    g_mld_rigid_body_names_cache = rb_count > 0 ? (char **) calloc((size_t)rb_count, sizeof(char *)) : NULL;
    g_mld_rigid_body_english_names_cache = rb_count > 0 ? (char **) calloc((size_t)rb_count, sizeof(char *)) : NULL;
    g_mld_rigid_body_string_ptrs = rb_count > 0 ? (uint32_t *) calloc((size_t)rb_count * 2, sizeof(uint32_t)) : NULL;
    g_mld_rigid_body_f32_table = rb_count > 0 ? (float *) calloc((size_t)rb_count * 14, sizeof(float)) : NULL;
    g_mld_rigid_body_i32_table = rb_count > 0 ? (int *) calloc((size_t)rb_count * 5, sizeof(int)) : NULL;
    g_mld_joint_names_cache = joint_count > 0 ? (char **) calloc((size_t)joint_count, sizeof(char *)) : NULL;
    g_mld_joint_english_names_cache = joint_count > 0 ? (char **) calloc((size_t)joint_count, sizeof(char *)) : NULL;
    g_mld_joint_string_ptrs = joint_count > 0 ? (uint32_t *) calloc((size_t)joint_count * 2, sizeof(uint32_t)) : NULL;
    g_mld_joint_f32_table = joint_count > 0 ? (float *) calloc((size_t)joint_count * 24, sizeof(float)) : NULL;
    g_mld_joint_i32_table = joint_count > 0 ? (int *) calloc((size_t)joint_count * 3, sizeof(int)) : NULL;
    g_mld_soft_body_names_cache = soft_count > 0 ? (char **) calloc((size_t)soft_count, sizeof(char *)) : NULL;
    g_mld_soft_body_english_names_cache = soft_count > 0 ? (char **) calloc((size_t)soft_count, sizeof(char *)) : NULL;
    g_mld_soft_body_string_ptrs = soft_count > 0 ? (uint32_t *) calloc((size_t)soft_count * 2, sizeof(uint32_t)) : NULL;
    g_mld_soft_body_f32_table = soft_count > 0 ? (float *) calloc((size_t)soft_count * 23, sizeof(float)) : NULL;
    g_mld_soft_body_i32_table = soft_count > 0 ? (int *) calloc((size_t)soft_count * 14, sizeof(int)) : NULL;
    g_mld_soft_body_anchor_offsets = soft_count > 0 ? (int *) calloc((size_t)soft_count + 1, sizeof(int)) : NULL;
    g_mld_soft_body_anchor_i32_table = anchor_total > 0 ? (int *) calloc((size_t)anchor_total * 3, sizeof(int)) : NULL;
    g_mld_soft_body_pinned_offsets = soft_count > 0 ? (int *) calloc((size_t)soft_count + 1, sizeof(int)) : NULL;
    g_mld_soft_body_pinned_vertex_table = pinned_total > 0 ? (int *) calloc((size_t)pinned_total, sizeof(int)) : NULL;

    for (int i = 0; i < rb_count; i++) {
        const nanoem_model_rigid_body_t *rb = g_mld.rigid_bodies_arr ? g_mld.rigid_bodies_arr[i] : NULL;
        if (!rb) continue;
        const float *size = nanoemModelRigidBodyGetShapeSize(rb);
        const float *origin = nanoemModelRigidBodyGetOrigin(rb);
        const float *orientation = nanoemModelRigidBodyGetOrientation(rb);
        float *f = g_mld_rigid_body_f32_table + i * 14;
        int *iv = g_mld_rigid_body_i32_table + i * 5;
        g_mld_rigid_body_names_cache[i] = yw_mmd_extract_text(factory, nanoemModelRigidBodyGetName(rb, NANOEM_LANGUAGE_TYPE_JAPANESE));
        g_mld_rigid_body_english_names_cache[i] = yw_mmd_extract_text(factory, nanoemModelRigidBodyGetName(rb, NANOEM_LANGUAGE_TYPE_ENGLISH));
        g_mld_rigid_body_string_ptrs[i * 2 + 0] = (uint32_t)(uintptr_t)g_mld_rigid_body_names_cache[i];
        g_mld_rigid_body_string_ptrs[i * 2 + 1] = (uint32_t)(uintptr_t)g_mld_rigid_body_english_names_cache[i];
        f[0] = size[0]; f[1] = size[1]; f[2] = size[2];
        f[3] = origin[0]; f[4] = origin[1]; f[5] = origin[2];
        f[6] = orientation[0]; f[7] = orientation[1]; f[8] = orientation[2];
        f[9] = nanoemModelRigidBodyGetMass(rb);
        f[10] = nanoemModelRigidBodyGetLinearDamping(rb);
        f[11] = nanoemModelRigidBodyGetAngularDamping(rb);
        f[12] = nanoemModelRigidBodyGetRestitution(rb);
        f[13] = nanoemModelRigidBodyGetFriction(rb);
        iv[0] = yw_mmd_nullable_bone_index(nanoemModelRigidBodyGetBoneObject(rb));
        iv[1] = (int)nanoemModelRigidBodyGetCollisionGroupId(rb);
        iv[2] = (int)nanoemModelRigidBodyGetCollisionMask(rb);
        iv[3] = (int)nanoemModelRigidBodyGetShapeType(rb);
        iv[4] = (int)nanoemModelRigidBodyGetTransformType(rb);
    }

    for (int i = 0; i < joint_count; i++) {
        const nanoem_model_joint_t *joint = g_mld.joints_arr ? g_mld.joints_arr[i] : NULL;
        if (!joint) continue;
        const float *origin = nanoemModelJointGetOrigin(joint);
        const float *orientation = nanoemModelJointGetOrientation(joint);
        const float *linear_lower = nanoemModelJointGetLinearLowerLimit(joint);
        const float *linear_upper = nanoemModelJointGetLinearUpperLimit(joint);
        const float *angular_lower = nanoemModelJointGetAngularLowerLimit(joint);
        const float *angular_upper = nanoemModelJointGetAngularUpperLimit(joint);
        const float *linear_stiffness = nanoemModelJointGetLinearStiffness(joint);
        const float *angular_stiffness = nanoemModelJointGetAngularStiffness(joint);
        float *f = g_mld_joint_f32_table + i * 24;
        int *iv = g_mld_joint_i32_table + i * 3;
        g_mld_joint_names_cache[i] = yw_mmd_extract_text(factory, nanoemModelJointGetName(joint, NANOEM_LANGUAGE_TYPE_JAPANESE));
        g_mld_joint_english_names_cache[i] = yw_mmd_extract_text(factory, nanoemModelJointGetName(joint, NANOEM_LANGUAGE_TYPE_ENGLISH));
        g_mld_joint_string_ptrs[i * 2 + 0] = (uint32_t)(uintptr_t)g_mld_joint_names_cache[i];
        g_mld_joint_string_ptrs[i * 2 + 1] = (uint32_t)(uintptr_t)g_mld_joint_english_names_cache[i];
        f[0] = origin[0]; f[1] = origin[1]; f[2] = origin[2];
        f[3] = orientation[0]; f[4] = orientation[1]; f[5] = orientation[2];
        f[6] = linear_lower[0]; f[7] = linear_lower[1]; f[8] = linear_lower[2];
        f[9] = linear_upper[0]; f[10] = linear_upper[1]; f[11] = linear_upper[2];
        f[12] = angular_lower[0]; f[13] = angular_lower[1]; f[14] = angular_lower[2];
        f[15] = angular_upper[0]; f[16] = angular_upper[1]; f[17] = angular_upper[2];
        f[18] = linear_stiffness[0]; f[19] = linear_stiffness[1]; f[20] = linear_stiffness[2];
        f[21] = angular_stiffness[0]; f[22] = angular_stiffness[1]; f[23] = angular_stiffness[2];
        iv[0] = yw_mmd_nullable_rigid_body_index(nanoemModelJointGetRigidBodyAObject(joint));
        iv[1] = yw_mmd_nullable_rigid_body_index(nanoemModelJointGetRigidBodyBObject(joint));
        iv[2] = (int)nanoemModelJointGetType(joint);
    }

    int anchor_offset = 0;
    int pinned_offset = 0;
    for (int i = 0; i < soft_count; i++) {
        const nanoem_model_soft_body_t *sb = g_mld.soft_bodies_arr ? g_mld.soft_bodies_arr[i] : NULL;
        nanoem_rsize_t count = 0;
        float *f = g_mld_soft_body_f32_table + i * 23;
        int *iv = g_mld_soft_body_i32_table + i * 14;
        if (g_mld_soft_body_anchor_offsets) g_mld_soft_body_anchor_offsets[i] = anchor_offset;
        if (g_mld_soft_body_pinned_offsets) g_mld_soft_body_pinned_offsets[i] = pinned_offset;
        if (!sb) continue;
        g_mld_soft_body_names_cache[i] = yw_mmd_extract_text(factory, nanoemModelSoftBodyGetName(sb, NANOEM_LANGUAGE_TYPE_JAPANESE));
        g_mld_soft_body_english_names_cache[i] = yw_mmd_extract_text(factory, nanoemModelSoftBodyGetName(sb, NANOEM_LANGUAGE_TYPE_ENGLISH));
        g_mld_soft_body_string_ptrs[i * 2 + 0] = (uint32_t)(uintptr_t)g_mld_soft_body_names_cache[i];
        g_mld_soft_body_string_ptrs[i * 2 + 1] = (uint32_t)(uintptr_t)g_mld_soft_body_english_names_cache[i];
        int flags = 0;
        if (nanoemModelSoftBodyIsBendingConstraintsEnabled(sb)) flags |= 0x01;
        if (nanoemModelSoftBodyIsClustersEnabled(sb)) flags |= 0x02;
        if (nanoemModelSoftBodyIsRandomizeConstraintsNeeded(sb)) flags |= 0x04;
        iv[0] = yw_mmd_nullable_material_index(nanoemModelSoftBodyGetMaterialObject(sb));
        iv[1] = (int)nanoemModelSoftBodyGetCollisionGroupId(sb);
        iv[2] = (int)nanoemModelSoftBodyGetCollisionMask(sb);
        iv[3] = flags;
        iv[4] = (int)nanoemModelSoftBodyGetBendingConstraintsDistance(sb);
        iv[5] = (int)nanoemModelSoftBodyGetClusterCount(sb);
        iv[6] = (int)nanoemModelSoftBodyGetShapeType(sb);
        iv[7] = (int)nanoemModelSoftBodyGetAeroModel(sb);
        iv[8] = (int)nanoemModelSoftBodyGetVelocitySolverIterations(sb);
        iv[9] = (int)nanoemModelSoftBodyGetPositionsSolverIterations(sb);
        iv[10] = (int)nanoemModelSoftBodyGetDriftSolverIterations(sb);
        iv[11] = (int)nanoemModelSoftBodyGetClusterSolverIterations(sb);
        f[0] = nanoemModelSoftBodyGetTotalMass(sb);
        f[1] = nanoemModelSoftBodyGetCollisionMargin(sb);
        f[2] = nanoemModelSoftBodyGetVelocityCorrectionFactor(sb);
        f[3] = nanoemModelSoftBodyGetDampingCoefficient(sb);
        f[4] = nanoemModelSoftBodyGetDragCoefficient(sb);
        f[5] = nanoemModelSoftBodyGetLiftCoefficient(sb);
        f[6] = nanoemModelSoftBodyGetPressureCoefficient(sb);
        f[7] = nanoemModelSoftBodyGetVolumeConversationCoefficient(sb);
        f[8] = nanoemModelSoftBodyGetDynamicFrictionCoefficient(sb);
        f[9] = nanoemModelSoftBodyGetPoseMatchingCoefficient(sb);
        f[10] = nanoemModelSoftBodyGetRigidContactHardness(sb);
        f[11] = nanoemModelSoftBodyGetKineticContactHardness(sb);
        f[12] = nanoemModelSoftBodyGetSoftContactHardness(sb);
        f[13] = nanoemModelSoftBodyGetAnchorHardness(sb);
        f[14] = nanoemModelSoftBodyGetSoftVSRigidHardness(sb);
        f[15] = nanoemModelSoftBodyGetSoftVSKineticHardness(sb);
        f[16] = nanoemModelSoftBodyGetSoftVSSoftHardness(sb);
        f[17] = nanoemModelSoftBodyGetSoftVSRigidImpulseSplit(sb);
        f[18] = nanoemModelSoftBodyGetSoftVSKineticImpulseSplit(sb);
        f[19] = nanoemModelSoftBodyGetSoftVSSoftImpulseSplit(sb);
        f[20] = nanoemModelSoftBodyGetLinearStiffnessCoefficient(sb);
        f[21] = nanoemModelSoftBodyGetAngularStiffnessCoefficient(sb);
        f[22] = nanoemModelSoftBodyGetVolumeStiffnessCoefficient(sb);

        nanoem_model_soft_body_anchor_t *const *anchors = nanoemModelSoftBodyGetAllAnchorObjects(sb, &count);
        iv[12] = (int)count;
        for (int j = 0; anchors && j < (int)count; j++) {
            int *p = g_mld_soft_body_anchor_i32_table + (anchor_offset + j) * 3;
            p[0] = yw_mmd_nullable_rigid_body_index(nanoemModelSoftBodyAnchorGetRigidBodyObject(anchors[j]));
            p[1] = yw_mmd_nullable_vertex_index(nanoemModelSoftBodyAnchorGetVertexObject(anchors[j]));
            p[2] = nanoemModelSoftBodyAnchorIsNearEnabled(anchors[j]) ? 1 : 0;
        }
        anchor_offset += (int)count;

        const nanoem_u32_t *indices = nanoemModelSoftBodyGetAllPinnedVertexIndices(sb, &count);
        iv[13] = (int)count;
        for (int j = 0; indices && j < (int)count; j++) {
            g_mld_soft_body_pinned_vertex_table[pinned_offset + j] = (int)indices[j];
        }
        pinned_offset += (int)count;
    }
    if (g_mld_soft_body_anchor_offsets) g_mld_soft_body_anchor_offsets[soft_count] = anchor_offset;
    if (g_mld_soft_body_pinned_offsets) g_mld_soft_body_pinned_offsets[soft_count] = pinned_offset;
    g_mld_physics_tables_valid = 1;
    return 1;
}

const char *yw_mmd_label_name(int i) {
    const nanoem_model_label_t *label = g_mld.valid && g_mld.labels_arr && i >= 0 && i < g_mld.meta_i32[YW_MMD_METADATA_DISPLAY_FRAME_COUNT] ? g_mld.labels_arr[i] : NULL;
    return label ? yw_mmd_extract_text_static(yw_mmd_get_emst_factory(), nanoemModelLabelGetName(label, NANOEM_LANGUAGE_TYPE_JAPANESE)) : "";
}
const char *yw_mmd_label_english_name(int i) {
    const nanoem_model_label_t *label = g_mld.valid && g_mld.labels_arr && i >= 0 && i < g_mld.meta_i32[YW_MMD_METADATA_DISPLAY_FRAME_COUNT] ? g_mld.labels_arr[i] : NULL;
    return label ? yw_mmd_extract_text_static(yw_mmd_get_emst_factory(), nanoemModelLabelGetName(label, NANOEM_LANGUAGE_TYPE_ENGLISH)) : "";
}
int yw_mmd_label_is_special(int i) {
    const nanoem_model_label_t *label = g_mld.valid && g_mld.labels_arr && i >= 0 && i < g_mld.meta_i32[YW_MMD_METADATA_DISPLAY_FRAME_COUNT] ? g_mld.labels_arr[i] : NULL;
    return label && nanoemModelLabelIsSpecial(label) ? 1 : 0;
}
int yw_mmd_label_item_count(int i) {
    const nanoem_model_label_t *label = g_mld.valid && g_mld.labels_arr && i >= 0 && i < g_mld.meta_i32[YW_MMD_METADATA_DISPLAY_FRAME_COUNT] ? g_mld.labels_arr[i] : NULL;
    nanoem_rsize_t count = 0;
    if (label) nanoemModelLabelGetAllItemObjects(label, &count);
    return (int)count;
}
int yw_mmd_label_item_type(int i, int j) {
    const nanoem_model_label_t *label = g_mld.valid && g_mld.labels_arr && i >= 0 && i < g_mld.meta_i32[YW_MMD_METADATA_DISPLAY_FRAME_COUNT] ? g_mld.labels_arr[i] : NULL;
    nanoem_rsize_t count = 0;
    nanoem_model_label_item_t *const *items = label ? nanoemModelLabelGetAllItemObjects(label, &count) : NULL;
    if (!items || j < 0 || j >= (int)count) return 2;
    int type = (int)nanoemModelLabelItemGetType(items[j]);
    return type == NANOEM_MODEL_LABEL_ITEM_TYPE_BONE ? 0 : type == NANOEM_MODEL_LABEL_ITEM_TYPE_MORPH ? 1 : 2;
}
int yw_mmd_label_item_index(int i, int j) {
    const nanoem_model_label_t *label = g_mld.valid && g_mld.labels_arr && i >= 0 && i < g_mld.meta_i32[YW_MMD_METADATA_DISPLAY_FRAME_COUNT] ? g_mld.labels_arr[i] : NULL;
    nanoem_rsize_t count = 0;
    nanoem_model_label_item_t *const *items = label ? nanoemModelLabelGetAllItemObjects(label, &count) : NULL;
    if (!items || j < 0 || j >= (int)count) return -1;
    int type = (int)nanoemModelLabelItemGetType(items[j]);
    if (type == NANOEM_MODEL_LABEL_ITEM_TYPE_BONE) return yw_mmd_nullable_bone_index(nanoemModelLabelItemGetBoneObject(items[j]));
    if (type == NANOEM_MODEL_LABEL_ITEM_TYPE_MORPH) return yw_mmd_nullable_morph_index(nanoemModelLabelItemGetMorphObject(items[j]));
    return -1;
}

uint32_t *yw_mmd_rigid_body_string_ptrs_ptr(void) {
    return yw_mmd_fill_physics_tables() ? g_mld_rigid_body_string_ptrs : NULL;
}
float *yw_mmd_rigid_body_f32_table_ptr(void) {
    return yw_mmd_fill_physics_tables() ? g_mld_rigid_body_f32_table : NULL;
}
int *yw_mmd_rigid_body_i32_table_ptr(void) {
    return yw_mmd_fill_physics_tables() ? g_mld_rigid_body_i32_table : NULL;
}

const char *yw_mmd_rigid_body_name(int i) {
    const nanoem_model_rigid_body_t *rb = g_mld.valid && g_mld.rigid_bodies_arr && i >= 0 && i < g_mld.meta_i32[YW_MMD_METADATA_RIGID_BODY_COUNT] ? g_mld.rigid_bodies_arr[i] : NULL;
    return rb ? yw_mmd_extract_text_static(yw_mmd_get_emst_factory(), nanoemModelRigidBodyGetName(rb, NANOEM_LANGUAGE_TYPE_JAPANESE)) : "";
}
const char *yw_mmd_rigid_body_english_name(int i) {
    const nanoem_model_rigid_body_t *rb = g_mld.valid && g_mld.rigid_bodies_arr && i >= 0 && i < g_mld.meta_i32[YW_MMD_METADATA_RIGID_BODY_COUNT] ? g_mld.rigid_bodies_arr[i] : NULL;
    return rb ? yw_mmd_extract_text_static(yw_mmd_get_emst_factory(), nanoemModelRigidBodyGetName(rb, NANOEM_LANGUAGE_TYPE_ENGLISH)) : "";
}
float yw_mmd_rigid_body_f32(int i, int field) {
    const nanoem_model_rigid_body_t *rb = g_mld.valid && g_mld.rigid_bodies_arr && i >= 0 && i < g_mld.meta_i32[YW_MMD_METADATA_RIGID_BODY_COUNT] ? g_mld.rigid_bodies_arr[i] : NULL;
    if (!rb) return 0.0f;
    const float *size = nanoemModelRigidBodyGetShapeSize(rb);
    const float *origin = nanoemModelRigidBodyGetOrigin(rb);
    const float *orientation = nanoemModelRigidBodyGetOrientation(rb);
    switch (field) {
    case 0: return size[0]; case 1: return size[1]; case 2: return size[2];
    case 3: return origin[0]; case 4: return origin[1]; case 5: return origin[2];
    case 6: return orientation[0]; case 7: return orientation[1]; case 8: return orientation[2];
    case 9: return nanoemModelRigidBodyGetMass(rb);
    case 10: return nanoemModelRigidBodyGetLinearDamping(rb);
    case 11: return nanoemModelRigidBodyGetAngularDamping(rb);
    case 12: return nanoemModelRigidBodyGetRestitution(rb);
    case 13: return nanoemModelRigidBodyGetFriction(rb);
    default: return 0.0f;
    }
}
int yw_mmd_rigid_body_i32(int i, int field) {
    const nanoem_model_rigid_body_t *rb = g_mld.valid && g_mld.rigid_bodies_arr && i >= 0 && i < g_mld.meta_i32[YW_MMD_METADATA_RIGID_BODY_COUNT] ? g_mld.rigid_bodies_arr[i] : NULL;
    if (!rb) return field == 0 ? -1 : 0;
    switch (field) {
    case 0: return yw_mmd_nullable_bone_index(nanoemModelRigidBodyGetBoneObject(rb));
    case 1: return (int)nanoemModelRigidBodyGetCollisionGroupId(rb);
    case 2: return (int)nanoemModelRigidBodyGetCollisionMask(rb);
    case 3: return (int)nanoemModelRigidBodyGetShapeType(rb);
    case 4: return (int)nanoemModelRigidBodyGetTransformType(rb);
    default: return 0;
    }
}

uint32_t *yw_mmd_joint_string_ptrs_ptr(void) {
    return yw_mmd_fill_physics_tables() ? g_mld_joint_string_ptrs : NULL;
}
float *yw_mmd_joint_f32_table_ptr(void) {
    return yw_mmd_fill_physics_tables() ? g_mld_joint_f32_table : NULL;
}
int *yw_mmd_joint_i32_table_ptr(void) {
    return yw_mmd_fill_physics_tables() ? g_mld_joint_i32_table : NULL;
}

const char *yw_mmd_joint_name(int i) {
    const nanoem_model_joint_t *joint = g_mld.valid && g_mld.joints_arr && i >= 0 && i < g_mld.meta_i32[YW_MMD_METADATA_JOINT_COUNT] ? g_mld.joints_arr[i] : NULL;
    return joint ? yw_mmd_extract_text_static(yw_mmd_get_emst_factory(), nanoemModelJointGetName(joint, NANOEM_LANGUAGE_TYPE_JAPANESE)) : "";
}
const char *yw_mmd_joint_english_name(int i) {
    const nanoem_model_joint_t *joint = g_mld.valid && g_mld.joints_arr && i >= 0 && i < g_mld.meta_i32[YW_MMD_METADATA_JOINT_COUNT] ? g_mld.joints_arr[i] : NULL;
    return joint ? yw_mmd_extract_text_static(yw_mmd_get_emst_factory(), nanoemModelJointGetName(joint, NANOEM_LANGUAGE_TYPE_ENGLISH)) : "";
}
float yw_mmd_joint_f32(int i, int field) {
    const nanoem_model_joint_t *joint = g_mld.valid && g_mld.joints_arr && i >= 0 && i < g_mld.meta_i32[YW_MMD_METADATA_JOINT_COUNT] ? g_mld.joints_arr[i] : NULL;
    if (!joint) return 0.0f;
    const float *origin = nanoemModelJointGetOrigin(joint);
    const float *orientation = nanoemModelJointGetOrientation(joint);
    const float *linear_lower = nanoemModelJointGetLinearLowerLimit(joint);
    const float *linear_upper = nanoemModelJointGetLinearUpperLimit(joint);
    const float *angular_lower = nanoemModelJointGetAngularLowerLimit(joint);
    const float *angular_upper = nanoemModelJointGetAngularUpperLimit(joint);
    const float *linear_stiffness = nanoemModelJointGetLinearStiffness(joint);
    const float *angular_stiffness = nanoemModelJointGetAngularStiffness(joint);
    if (field >= 0 && field <= 2) return origin[field];
    if (field >= 3 && field <= 5) return orientation[field - 3];
    if (field >= 6 && field <= 8) return linear_lower[field - 6];
    if (field >= 9 && field <= 11) return linear_upper[field - 9];
    if (field >= 12 && field <= 14) return angular_lower[field - 12];
    if (field >= 15 && field <= 17) return angular_upper[field - 15];
    if (field >= 18 && field <= 20) return linear_stiffness[field - 18];
    if (field >= 21 && field <= 23) return angular_stiffness[field - 21];
    return 0.0f;
}
int yw_mmd_joint_i32(int i, int field) {
    const nanoem_model_joint_t *joint = g_mld.valid && g_mld.joints_arr && i >= 0 && i < g_mld.meta_i32[YW_MMD_METADATA_JOINT_COUNT] ? g_mld.joints_arr[i] : NULL;
    if (!joint) return field == 0 || field == 1 ? -1 : 0;
    if (field == 0) return yw_mmd_nullable_rigid_body_index(nanoemModelJointGetRigidBodyAObject(joint));
    if (field == 1) return yw_mmd_nullable_rigid_body_index(nanoemModelJointGetRigidBodyBObject(joint));
    if (field == 2) return (int)nanoemModelJointGetType(joint);
    return 0;
}

uint32_t *yw_mmd_soft_body_string_ptrs_ptr(void) {
    return yw_mmd_fill_physics_tables() ? g_mld_soft_body_string_ptrs : NULL;
}
float *yw_mmd_soft_body_f32_table_ptr(void) {
    return yw_mmd_fill_physics_tables() ? g_mld_soft_body_f32_table : NULL;
}
int *yw_mmd_soft_body_i32_table_ptr(void) {
    return yw_mmd_fill_physics_tables() ? g_mld_soft_body_i32_table : NULL;
}
int *yw_mmd_soft_body_anchor_offsets_ptr(void) {
    return yw_mmd_fill_physics_tables() ? g_mld_soft_body_anchor_offsets : NULL;
}
int *yw_mmd_soft_body_anchor_i32_table_ptr(void) {
    return yw_mmd_fill_physics_tables() ? g_mld_soft_body_anchor_i32_table : NULL;
}
int *yw_mmd_soft_body_pinned_offsets_ptr(void) {
    return yw_mmd_fill_physics_tables() ? g_mld_soft_body_pinned_offsets : NULL;
}
int *yw_mmd_soft_body_pinned_vertex_table_ptr(void) {
    return yw_mmd_fill_physics_tables() ? g_mld_soft_body_pinned_vertex_table : NULL;
}

const char *yw_mmd_soft_body_name(int i) {
    const nanoem_model_soft_body_t *sb = g_mld.valid && g_mld.soft_bodies_arr && i >= 0 && i < g_mld.meta_i32[YW_MMD_METADATA_SOFT_BODY_COUNT] ? g_mld.soft_bodies_arr[i] : NULL;
    return sb ? yw_mmd_extract_text_static(yw_mmd_get_emst_factory(), nanoemModelSoftBodyGetName(sb, NANOEM_LANGUAGE_TYPE_JAPANESE)) : "";
}
const char *yw_mmd_soft_body_english_name(int i) {
    const nanoem_model_soft_body_t *sb = g_mld.valid && g_mld.soft_bodies_arr && i >= 0 && i < g_mld.meta_i32[YW_MMD_METADATA_SOFT_BODY_COUNT] ? g_mld.soft_bodies_arr[i] : NULL;
    return sb ? yw_mmd_extract_text_static(yw_mmd_get_emst_factory(), nanoemModelSoftBodyGetName(sb, NANOEM_LANGUAGE_TYPE_ENGLISH)) : "";
}
int yw_mmd_soft_body_i32(int i, int field) {
    const nanoem_model_soft_body_t *sb = g_mld.valid && g_mld.soft_bodies_arr && i >= 0 && i < g_mld.meta_i32[YW_MMD_METADATA_SOFT_BODY_COUNT] ? g_mld.soft_bodies_arr[i] : NULL;
    nanoem_rsize_t count = 0;
    if (!sb) return field == 0 ? -1 : 0;
    switch (field) {
    case 0: return yw_mmd_nullable_material_index(nanoemModelSoftBodyGetMaterialObject(sb));
    case 1: return (int)nanoemModelSoftBodyGetCollisionGroupId(sb);
    case 2: return (int)nanoemModelSoftBodyGetCollisionMask(sb);
    case 3: {
        int flags = 0;
        if (nanoemModelSoftBodyIsBendingConstraintsEnabled(sb)) flags |= 0x01;
        if (nanoemModelSoftBodyIsClustersEnabled(sb)) flags |= 0x02;
        if (nanoemModelSoftBodyIsRandomizeConstraintsNeeded(sb)) flags |= 0x04;
        return flags;
    }
    case 4: return (int)nanoemModelSoftBodyGetBendingConstraintsDistance(sb);
    case 5: return (int)nanoemModelSoftBodyGetClusterCount(sb);
    case 6: return (int)nanoemModelSoftBodyGetShapeType(sb);
    case 7: return (int)nanoemModelSoftBodyGetAeroModel(sb);
    case 8: return (int)nanoemModelSoftBodyGetVelocitySolverIterations(sb);
    case 9: return (int)nanoemModelSoftBodyGetPositionsSolverIterations(sb);
    case 10: return (int)nanoemModelSoftBodyGetDriftSolverIterations(sb);
    case 11: return (int)nanoemModelSoftBodyGetClusterSolverIterations(sb);
    case 12: nanoemModelSoftBodyGetAllAnchorObjects(sb, &count); return (int)count;
    case 13: nanoemModelSoftBodyGetAllPinnedVertexIndices(sb, &count); return (int)count;
    default: return 0;
    }
}
float yw_mmd_soft_body_f32(int i, int field) {
    const nanoem_model_soft_body_t *sb = g_mld.valid && g_mld.soft_bodies_arr && i >= 0 && i < g_mld.meta_i32[YW_MMD_METADATA_SOFT_BODY_COUNT] ? g_mld.soft_bodies_arr[i] : NULL;
    if (!sb) return 0.0f;
    switch (field) {
    case 0: return nanoemModelSoftBodyGetTotalMass(sb);
    case 1: return nanoemModelSoftBodyGetCollisionMargin(sb);
    case 2: return nanoemModelSoftBodyGetVelocityCorrectionFactor(sb);
    case 3: return nanoemModelSoftBodyGetDampingCoefficient(sb);
    case 4: return nanoemModelSoftBodyGetDragCoefficient(sb);
    case 5: return nanoemModelSoftBodyGetLiftCoefficient(sb);
    case 6: return nanoemModelSoftBodyGetPressureCoefficient(sb);
    case 7: return nanoemModelSoftBodyGetVolumeConversationCoefficient(sb);
    case 8: return nanoemModelSoftBodyGetDynamicFrictionCoefficient(sb);
    case 9: return nanoemModelSoftBodyGetPoseMatchingCoefficient(sb);
    case 10: return nanoemModelSoftBodyGetRigidContactHardness(sb);
    case 11: return nanoemModelSoftBodyGetKineticContactHardness(sb);
    case 12: return nanoemModelSoftBodyGetSoftContactHardness(sb);
    case 13: return nanoemModelSoftBodyGetAnchorHardness(sb);
    case 14: return nanoemModelSoftBodyGetSoftVSRigidHardness(sb);
    case 15: return nanoemModelSoftBodyGetSoftVSKineticHardness(sb);
    case 16: return nanoemModelSoftBodyGetSoftVSSoftHardness(sb);
    case 17: return nanoemModelSoftBodyGetSoftVSRigidImpulseSplit(sb);
    case 18: return nanoemModelSoftBodyGetSoftVSKineticImpulseSplit(sb);
    case 19: return nanoemModelSoftBodyGetSoftVSSoftImpulseSplit(sb);
    case 20: return nanoemModelSoftBodyGetLinearStiffnessCoefficient(sb);
    case 21: return nanoemModelSoftBodyGetAngularStiffnessCoefficient(sb);
    case 22: return nanoemModelSoftBodyGetVolumeStiffnessCoefficient(sb);
    default: return 0.0f;
    }
}
int yw_mmd_soft_body_anchor_i32(int i, int j, int field) {
    const nanoem_model_soft_body_t *sb = g_mld.valid && g_mld.soft_bodies_arr && i >= 0 && i < g_mld.meta_i32[YW_MMD_METADATA_SOFT_BODY_COUNT] ? g_mld.soft_bodies_arr[i] : NULL;
    nanoem_rsize_t count = 0;
    nanoem_model_soft_body_anchor_t *const *anchors = sb ? nanoemModelSoftBodyGetAllAnchorObjects(sb, &count) : NULL;
    if (!anchors || j < 0 || j >= (int)count) return field == 0 || field == 1 ? -1 : 0;
    if (field == 0) return yw_mmd_nullable_rigid_body_index(nanoemModelSoftBodyAnchorGetRigidBodyObject(anchors[j]));
    if (field == 1) return yw_mmd_nullable_vertex_index(nanoemModelSoftBodyAnchorGetVertexObject(anchors[j]));
    if (field == 2) return nanoemModelSoftBodyAnchorIsNearEnabled(anchors[j]) ? 1 : 0;
    return 0;
}
int yw_mmd_soft_body_pinned_vertex(int i, int j) {
    const nanoem_model_soft_body_t *sb = g_mld.valid && g_mld.soft_bodies_arr && i >= 0 && i < g_mld.meta_i32[YW_MMD_METADATA_SOFT_BODY_COUNT] ? g_mld.soft_bodies_arr[i] : NULL;
    nanoem_rsize_t count = 0;
    const nanoem_u32_t *indices = sb ? nanoemModelSoftBodyGetAllPinnedVertexIndices(sb, &count) : NULL;
    return indices && j >= 0 && j < (int)count ? (int)indices[j] : -1;
}
