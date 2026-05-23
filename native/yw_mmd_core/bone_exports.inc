const char *yw_mmd_bone_name(int i) {
    const nanoem_model_bone_t *bone = yw_mmd_bone_at(i);
    return bone ? yw_mmd_extract_text_static(yw_mmd_get_emst_factory(), nanoemModelBoneGetName(bone, NANOEM_LANGUAGE_TYPE_JAPANESE)) : "";
}
const char *yw_mmd_bone_english_name(int i) {
    const nanoem_model_bone_t *bone = yw_mmd_bone_at(i);
    return bone ? yw_mmd_extract_text_static(yw_mmd_get_emst_factory(), nanoemModelBoneGetName(bone, NANOEM_LANGUAGE_TYPE_ENGLISH)) : "";
}
float yw_mmd_bone_f32(int i, int field) {
    const nanoem_model_bone_t *bone = yw_mmd_bone_at(i);
    if (!bone) return 0.0f;
    const float *origin = nanoemModelBoneGetOrigin(bone);
    const float *tail = nanoemModelBoneGetDestinationOrigin(bone);
    const float *fixed = nanoemModelBoneGetFixedAxis(bone);
    const float *local_x = nanoemModelBoneGetLocalXAxis(bone);
    const float *local_z = nanoemModelBoneGetLocalZAxis(bone);
    switch (field) {
    case 0: return origin[0]; case 1: return origin[1]; case 2: return origin[2];
    case 3: return tail[0]; case 4: return tail[1]; case 5: return tail[2];
    case 6: return fixed[0]; case 7: return fixed[1]; case 8: return fixed[2];
    case 9: return local_x[0]; case 10: return local_x[1]; case 11: return local_x[2];
    case 12: return local_z[0]; case 13: return local_z[1]; case 14: return local_z[2];
    case 15: return nanoemModelBoneGetInherentCoefficient(bone);
    default: return 0.0f;
    }
}
int yw_mmd_bone_i32(int i, int field) {
    const nanoem_model_bone_t *bone = yw_mmd_bone_at(i);
    if (!bone) return field == 0 || field == 2 || field == 4 || field == 5 || field == 6 ? -1 : 0;
    const nanoem_model_constraint_t *constraint = nanoemModelBoneHasConstraint(bone) ? nanoemModelBoneGetConstraintObject(bone) : NULL;
    if (field == 0) return yw_mmd_nullable_bone_index(nanoemModelBoneGetParentBoneObject(bone));
    if (field == 1) return (int)nanoemModelBoneGetStageIndex(bone);
    if (field == 2) return nanoemModelBoneHasDestinationBone(bone) ? yw_mmd_nullable_bone_index(nanoemModelBoneGetTargetBoneObject(bone)) : -1;
    if (field == 3) {
        int bits = 0;
        if (nanoemModelBoneHasDestinationBone(bone)) bits |= 0x0001;
        if (nanoemModelBoneIsRotateable(bone)) bits |= 0x0002;
        if (nanoemModelBoneIsMovable(bone)) bits |= 0x0004;
        if (nanoemModelBoneIsVisible(bone)) bits |= 0x0008;
        if (nanoemModelBoneIsUserHandleable(bone)) bits |= 0x0010;
        if (nanoemModelBoneHasConstraint(bone)) bits |= 0x0020;
        if (nanoemModelBoneHasLocalInherent(bone)) bits |= 0x0080;
        if (nanoemModelBoneHasInherentOrientation(bone)) bits |= 0x0100;
        if (nanoemModelBoneHasInherentTranslation(bone)) bits |= 0x0200;
        if (nanoemModelBoneHasFixedAxis(bone)) bits |= 0x0400;
        if (nanoemModelBoneHasLocalAxes(bone)) bits |= 0x0800;
        if (nanoemModelBoneIsAffectedByPhysicsSimulation(bone)) bits |= 0x1000;
        if (nanoemModelBoneHasExternalParentBone(bone)) bits |= 0x2000;
        return bits;
    }
    if (field == 4) return yw_mmd_nullable_bone_index(nanoemModelBoneGetInherentParentBoneObject(bone));
    if (field == 5) return 0;
    if (field == 6) return constraint ? yw_mmd_nullable_bone_index(nanoemModelConstraintGetEffectorBoneObject(constraint)) : -1;
    if (field == 7) return constraint ? (int)nanoemModelConstraintGetNumIterations(constraint) : 0;
    if (field == 8) return g_mld.ik_link_counts && i >= 0 && i < g_mld.bone_count_p3 ? g_mld.ik_link_counts[i] : 0;
    return 0;
}
float yw_mmd_bone_ik_limit_angle(int i) {
    const nanoem_model_bone_t *bone = yw_mmd_bone_at(i);
    const nanoem_model_constraint_t *constraint = bone && nanoemModelBoneHasConstraint(bone) ? nanoemModelBoneGetConstraintObject(bone) : NULL;
    return constraint ? nanoemModelConstraintGetAngleLimit(constraint) : 0.0f;
}
int yw_mmd_bone_ik_link_count(int i) {
    return g_mld.valid && g_mld.ik_link_counts && i >= 0 && i < g_mld.bone_count_p3 ? g_mld.ik_link_counts[i] : 0;
}
float *yw_mmd_bone_ik_links_ptr(int i) {
    return g_mld.valid && g_mld.ik_links_buf && i >= 0 && i < g_mld.bone_count_p3 ? g_mld.ik_links_buf[i] : NULL;
}
