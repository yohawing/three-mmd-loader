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
