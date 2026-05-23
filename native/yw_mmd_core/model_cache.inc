static void
yw_mmd_fill_phase3_materials(nanoem_model_t *model, nanoem_unicode_string_factory_t *factory)
{
    nanoem_rsize_t tex_cnt = 0, mat_cnt = 0;
    g_mld.textures_arr = nanoemModelGetAllTextureObjects(model, &tex_cnt);
    g_mld.texture_count_p3 = (int)tex_cnt;
    g_mld.materials_arr = nanoemModelGetAllMaterialObjects(model, &mat_cnt);
    g_mld.material_count_p3 = (int)mat_cnt;
    if (mat_cnt == 0) return;
    g_mld.mat_diffuse_tex_path = (char **) calloc(mat_cnt, sizeof(char *));
    g_mld.mat_sphere_tex_path = (char **) calloc(mat_cnt, sizeof(char *));
    g_mld.mat_toon_tex_path = (char **) calloc(mat_cnt, sizeof(char *));
    if (!g_mld.mat_diffuse_tex_path || !g_mld.mat_sphere_tex_path || !g_mld.mat_toon_tex_path) {
        return;
    }
    for (int i = 0; i < (int)mat_cnt; i++) {
        const nanoem_model_material_t *mat = g_mld.materials_arr[i];
        const nanoem_model_texture_t *dtex = nanoemModelMaterialGetDiffuseTextureObject(mat);
        const nanoem_model_texture_t *stex = nanoemModelMaterialGetSphereMapTextureObject(mat);
        const nanoem_model_texture_t *ttex = nanoemModelMaterialIsToonShared(mat) ? NULL : nanoemModelMaterialGetToonTextureObject(mat);
        g_mld.mat_diffuse_tex_path[i] = dtex ? yw_mmd_extract_text(factory, nanoemModelTextureGetPath(dtex)) : yw_mmd_copy_string("");
        g_mld.mat_sphere_tex_path[i] = stex ? yw_mmd_extract_text(factory, nanoemModelTextureGetPath(stex)) : yw_mmd_copy_string("");
        g_mld.mat_toon_tex_path[i] = ttex ? yw_mmd_extract_text(factory, nanoemModelTextureGetPath(ttex)) : yw_mmd_copy_string("");
    }
}

static void
yw_mmd_fill_phase3_bones(nanoem_model_t *model)
{
    nanoem_rsize_t bone_cnt = 0;
    g_mld.bones_arr = nanoemModelGetAllBoneObjects(model, &bone_cnt);
    g_mld.bone_count_p3 = (int)bone_cnt;
    if (bone_cnt == 0) return;
    g_mld.ik_link_counts = (int *) calloc(bone_cnt, sizeof(int));
    g_mld.ik_links_buf = (float **) calloc(bone_cnt, sizeof(float *));
    if (!g_mld.ik_link_counts || !g_mld.ik_links_buf) {
        return;
    }
    for (int i = 0; i < (int)bone_cnt; i++) {
        const nanoem_model_bone_t *bone = g_mld.bones_arr[i];
        if (!nanoemModelBoneHasConstraint(bone)) continue;
        const nanoem_model_constraint_t *constraint = nanoemModelBoneGetConstraintObject(bone);
        nanoem_rsize_t link_cnt = 0;
        nanoem_model_constraint_joint_t *const *joints = nanoemModelConstraintGetAllJointObjects(constraint, &link_cnt);
        g_mld.ik_link_counts[i] = (int)link_cnt;
        if (link_cnt == 0) continue;
        float *buf = (float *) malloc((size_t)link_cnt * 8 * sizeof(float));
        if (!buf) {
            g_mld.ik_link_counts[i] = 0;
            continue;
        }
        g_mld.ik_links_buf[i] = buf;
        for (int j = 0; j < (int)link_cnt; j++) {
            const nanoem_model_constraint_joint_t *joint = joints[j];
            const nanoem_model_bone_t *link_bone = nanoemModelConstraintJointGetBoneObject(joint);
            int has_limit = nanoemModelConstraintJointHasAngleLimit(joint) ? 1 : 0;
            float *p = buf + j * 8;
            p[0] = (float)yw_mmd_nullable_bone_index(link_bone);
            p[1] = (float)has_limit;
            if (has_limit) {
                const float *lower = nanoemModelConstraintJointGetLowerLimit(joint);
                const float *upper = nanoemModelConstraintJointGetUpperLimit(joint);
                p[2] = lower[0]; p[3] = lower[1]; p[4] = lower[2];
                p[5] = upper[0]; p[6] = upper[1]; p[7] = upper[2];
            }
            else {
                p[2] = p[3] = p[4] = p[5] = p[6] = p[7] = 0.0f;
            }
        }
    }
}

static float *
yw_mmd_alloc_morph_offsets(nanoem_rsize_t count, int stride)
{
    return count > 0 && stride > 0 ? (float *) malloc((size_t)count * (size_t)stride * sizeof(float)) : NULL;
}

static float *
yw_mmd_prepare_morph_dense_buffer(size_t length)
{
    if (length == 0) return NULL;
    if (g_mld.morph_dense_capacity < length) {
        float *next = (float *) realloc(g_mld.morph_dense_buf, length * sizeof(float));
        if (!next) return NULL;
        g_mld.morph_dense_buf = next;
        g_mld.morph_dense_capacity = length;
    }
    memset(g_mld.morph_dense_buf, 0, length * sizeof(float));
    return g_mld.morph_dense_buf;
}

static void
yw_mmd_fill_phase3_morphs(nanoem_model_t *model)
{
    nanoem_rsize_t morph_cnt = 0;
    g_mld.morphs_arr = nanoemModelGetAllMorphObjects(model, &morph_cnt);
    g_mld.morph_count_p3 = (int)morph_cnt;
    if (morph_cnt == 0) return;
    g_mld.morph_offset_counts = (int *) calloc(morph_cnt, sizeof(int));
    g_mld.morph_offset_bufs = (float **) calloc(morph_cnt, sizeof(float *));
    if (!g_mld.morph_offset_counts || !g_mld.morph_offset_bufs) {
        return;
    }
    for (int i = 0; i < (int)morph_cnt; i++) {
        const nanoem_model_morph_t *morph = g_mld.morphs_arr[i];
        nanoem_model_morph_type_t type = nanoemModelMorphGetType(morph);
        nanoem_rsize_t count = 0;
        float *buf = NULL;
        switch (type) {
        case NANOEM_MODEL_MORPH_TYPE_GROUP: {
            nanoem_model_morph_group_t *const *items = nanoemModelMorphGetAllGroupMorphObjects(morph, &count);
            buf = yw_mmd_alloc_morph_offsets(count, 2);
            for (int j = 0; buf && j < (int)count; j++) {
                buf[j * 2 + 0] = (float)yw_mmd_nullable_morph_index(nanoemModelMorphGroupGetMorphObject(items[j]));
                buf[j * 2 + 1] = nanoemModelMorphGroupGetWeight(items[j]);
            }
            break;
        }
        case NANOEM_MODEL_MORPH_TYPE_FLIP: {
            nanoem_model_morph_flip_t *const *items = nanoemModelMorphGetAllFlipMorphObjects(morph, &count);
            buf = yw_mmd_alloc_morph_offsets(count, 2);
            for (int j = 0; buf && j < (int)count; j++) {
                buf[j * 2 + 0] = (float)yw_mmd_nullable_morph_index(nanoemModelMorphFlipGetMorphObject(items[j]));
                buf[j * 2 + 1] = nanoemModelMorphFlipGetWeight(items[j]);
            }
            break;
        }
        case NANOEM_MODEL_MORPH_TYPE_VERTEX: {
            nanoem_model_morph_vertex_t *const *items = nanoemModelMorphGetAllVertexMorphObjects(morph, &count);
            buf = yw_mmd_alloc_morph_offsets(count, 4);
            for (int j = 0; buf && j < (int)count; j++) {
                const float *pos = nanoemModelMorphVertexGetPosition(items[j]);
                buf[j * 4 + 0] = (float)yw_mmd_nullable_vertex_index(nanoemModelMorphVertexGetVertexObject(items[j]));
                buf[j * 4 + 1] = pos[0]; buf[j * 4 + 2] = pos[1]; buf[j * 4 + 3] = pos[2];
            }
            break;
        }
        case NANOEM_MODEL_MORPH_TYPE_BONE: {
            nanoem_model_morph_bone_t *const *items = nanoemModelMorphGetAllBoneMorphObjects(morph, &count);
            buf = yw_mmd_alloc_morph_offsets(count, 8);
            for (int j = 0; buf && j < (int)count; j++) {
                const float *translation = nanoemModelMorphBoneGetTranslation(items[j]);
                const float *orientation = nanoemModelMorphBoneGetOrientation(items[j]);
                float *p = buf + j * 8;
                p[0] = (float)yw_mmd_nullable_bone_index(nanoemModelMorphBoneGetBoneObject(items[j]));
                p[1] = translation[0]; p[2] = translation[1]; p[3] = translation[2];
                p[4] = orientation[0]; p[5] = orientation[1]; p[6] = orientation[2]; p[7] = orientation[3];
            }
            break;
        }
        case NANOEM_MODEL_MORPH_TYPE_TEXTURE:
        case NANOEM_MODEL_MORPH_TYPE_UVA1:
        case NANOEM_MODEL_MORPH_TYPE_UVA2:
        case NANOEM_MODEL_MORPH_TYPE_UVA3:
        case NANOEM_MODEL_MORPH_TYPE_UVA4: {
            nanoem_model_morph_uv_t *const *items = nanoemModelMorphGetAllUVMorphObjects(morph, &count);
            buf = yw_mmd_alloc_morph_offsets(count, 5);
            for (int j = 0; buf && j < (int)count; j++) {
                const float *pos = nanoemModelMorphUVGetPosition(items[j]);
                float *p = buf + j * 5;
                p[0] = (float)yw_mmd_nullable_vertex_index(nanoemModelMorphUVGetVertexObject(items[j]));
                p[1] = pos[0]; p[2] = pos[1]; p[3] = pos[2]; p[4] = pos[3];
            }
            break;
        }
        case NANOEM_MODEL_MORPH_TYPE_MATERIAL: {
            nanoem_model_morph_material_t *const *items = nanoemModelMorphGetAllMaterialMorphObjects(morph, &count);
            buf = yw_mmd_alloc_morph_offsets(count, 30);
            for (int j = 0; buf && j < (int)count; j++) {
                const nanoem_model_morph_material_t *item = items[j];
                const float *diffuse = nanoemModelMorphMaterialGetDiffuseColor(item);
                const float *specular = nanoemModelMorphMaterialGetSpecularColor(item);
                const float *ambient = nanoemModelMorphMaterialGetAmbientColor(item);
                const float *edge = nanoemModelMorphMaterialGetEdgeColor(item);
                const float *tex = nanoemModelMorphMaterialGetDiffuseTextureBlend(item);
                const float *sphere = nanoemModelMorphMaterialGetSphereMapTextureBlend(item);
                const float *toon = nanoemModelMorphMaterialGetToonTextureBlend(item);
                float *p = buf + j * 30;
                p[0] = (float)yw_mmd_nullable_material_index(nanoemModelMorphMaterialGetMaterialObject(item));
                p[1] = (float)nanoemModelMorphMaterialGetOperationType(item);
                p[2] = diffuse[0]; p[3] = diffuse[1]; p[4] = diffuse[2]; p[5] = nanoemModelMorphMaterialGetDiffuseOpacity(item);
                p[6] = specular[0]; p[7] = specular[1]; p[8] = specular[2]; p[9] = nanoemModelMorphMaterialGetSpecularPower(item);
                p[10] = ambient[0]; p[11] = ambient[1]; p[12] = ambient[2];
                p[13] = edge[0]; p[14] = edge[1]; p[15] = edge[2]; p[16] = nanoemModelMorphMaterialGetEdgeOpacity(item);
                p[17] = nanoemModelMorphMaterialGetEdgeSize(item);
                p[18] = tex[0]; p[19] = tex[1]; p[20] = tex[2]; p[21] = tex[3];
                p[22] = sphere[0]; p[23] = sphere[1]; p[24] = sphere[2]; p[25] = sphere[3];
                p[26] = toon[0]; p[27] = toon[1]; p[28] = toon[2]; p[29] = toon[3];
            }
            break;
        }
        case NANOEM_MODEL_MORPH_TYPE_IMPULUSE: {
            nanoem_model_morph_impulse_t *const *items = nanoemModelMorphGetAllImpulseMorphObjects(morph, &count);
            buf = yw_mmd_alloc_morph_offsets(count, 8);
            for (int j = 0; buf && j < (int)count; j++) {
                const float *velocity = nanoemModelMorphImpulseGetVelocity(items[j]);
                const float *torque = nanoemModelMorphImpulseGetTorque(items[j]);
                float *p = buf + j * 8;
                p[0] = (float)yw_mmd_nullable_rigid_body_index(nanoemModelMorphImpulseGetRigidBodyObject(items[j]));
                p[1] = nanoemModelMorphImpulseIsLocal(items[j]) ? 1.0f : 0.0f;
                p[2] = velocity[0]; p[3] = velocity[1]; p[4] = velocity[2];
                p[5] = torque[0]; p[6] = torque[1]; p[7] = torque[2];
            }
            break;
        }
        default:
            break;
        }
        g_mld.morph_offset_counts[i] = buf ? (int)count : 0;
        g_mld.morph_offset_bufs[i] = buf;
    }
}

static void
yw_mmd_fill_phase3_objects(nanoem_model_t *model, nanoem_unicode_string_factory_t *factory)
{
    nanoem_rsize_t count = 0;
    yw_mmd_fill_phase3_materials(model, factory);
    yw_mmd_fill_phase3_bones(model);
    yw_mmd_fill_phase3_morphs(model);
    g_mld.labels_arr = nanoemModelGetAllLabelObjects(model, &count);
    g_mld.rigid_bodies_arr = nanoemModelGetAllRigidBodyObjects(model, &count);
    g_mld.joints_arr = nanoemModelGetAllJointObjects(model, &count);
    g_mld.soft_bodies_arr = nanoemModelGetAllSoftBodyObjects(model, &count);
}

