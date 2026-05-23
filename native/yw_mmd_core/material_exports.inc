const char *yw_mmd_material_name(int i) {
    const nanoem_model_material_t *mat = yw_mmd_material_at(i);
    return mat ? yw_mmd_extract_text_static(yw_mmd_get_emst_factory(), nanoemModelMaterialGetName(mat, NANOEM_LANGUAGE_TYPE_JAPANESE)) : "";
}
const char *yw_mmd_material_english_name(int i) {
    const nanoem_model_material_t *mat = yw_mmd_material_at(i);
    return mat ? yw_mmd_extract_text_static(yw_mmd_get_emst_factory(), nanoemModelMaterialGetName(mat, NANOEM_LANGUAGE_TYPE_ENGLISH)) : "";
}
const char *yw_mmd_material_texture_path(int i) {
    return g_mld.valid && g_mld.mat_diffuse_tex_path && i >= 0 && i < g_mld.material_count_p3 && g_mld.mat_diffuse_tex_path[i] ? g_mld.mat_diffuse_tex_path[i] : "";
}
const char *yw_mmd_material_sphere_texture_path(int i) {
    return g_mld.valid && g_mld.mat_sphere_tex_path && i >= 0 && i < g_mld.material_count_p3 && g_mld.mat_sphere_tex_path[i] ? g_mld.mat_sphere_tex_path[i] : "";
}
const char *yw_mmd_material_toon_texture_path(int i) {
    return g_mld.valid && g_mld.mat_toon_tex_path && i >= 0 && i < g_mld.material_count_p3 && g_mld.mat_toon_tex_path[i] ? g_mld.mat_toon_tex_path[i] : "";
}
float yw_mmd_material_f32(int i, int field) {
    const nanoem_model_material_t *mat = yw_mmd_material_at(i);
    if (!mat) return 0.0f;
    const float *diffuse = nanoemModelMaterialGetDiffuseColor(mat);
    const float *specular = nanoemModelMaterialGetSpecularColor(mat);
    const float *ambient = nanoemModelMaterialGetAmbientColor(mat);
    const float *edge = nanoemModelMaterialGetEdgeColor(mat);
    switch (field) {
    case 0: return diffuse[0]; case 1: return diffuse[1]; case 2: return diffuse[2]; case 3: return nanoemModelMaterialGetDiffuseOpacity(mat);
    case 4: return specular[0]; case 5: return specular[1]; case 6: return specular[2]; case 7: return nanoemModelMaterialGetSpecularPower(mat);
    case 8: return ambient[0]; case 9: return ambient[1]; case 10: return ambient[2];
    case 11: return edge[0]; case 12: return edge[1]; case 13: return edge[2]; case 14: return nanoemModelMaterialGetEdgeOpacity(mat);
    case 15: return nanoemModelMaterialGetEdgeSize(mat);
    default: return 0.0f;
    }
}
int yw_mmd_material_i32(int i, int field) {
    const nanoem_model_material_t *mat = yw_mmd_material_at(i);
    if (!mat) return 0;
    if (field == 0) {
        int bits = 0;
        if (nanoemModelMaterialIsCullingDisabled(mat)) bits |= 0x01;
        if (nanoemModelMaterialIsCastingShadowEnabled(mat)) bits |= 0x02;
        if (nanoemModelMaterialIsCastingShadowMapEnabled(mat)) bits |= 0x04;
        if (nanoemModelMaterialIsShadowMapEnabled(mat)) bits |= 0x08;
        if (nanoemModelMaterialIsEdgeEnabled(mat)) bits |= 0x10;
        if (nanoemModelMaterialIsVertexColorEnabled(mat)) bits |= 0x20;
        if (nanoemModelMaterialIsPointDrawEnabled(mat)) bits |= 0x40;
        if (nanoemModelMaterialIsLineDrawEnabled(mat)) bits |= 0x80;
        return bits;
    }
    if (field == 1) return (int)nanoemModelMaterialGetSphereMapTextureType(mat);
    if (field == 2) return nanoemModelMaterialIsToonShared(mat) ? (int)nanoemModelMaterialGetToonTextureIndex(mat) : -1;
    if (field == 3) return (int)(nanoemModelMaterialGetNumVertexIndices(mat) / 3);
    if (field == 4) {
        /* evaluatedTransparency: bits[5:4] encode transparency hint
           0x00 = opaque (full diffuse alpha, no diffuse texture)
           0x10 = alphaBlend (diffuse alpha < 1)
           0x30 = undetermined (has diffuse texture, needs texture-scan) */
        if (nanoemModelMaterialGetDiffuseOpacity(mat) < 1.0f) return 0x10;
        if (g_mld.mat_diffuse_tex_path && i < g_mld.material_count_p3) {
            const char *tp = g_mld.mat_diffuse_tex_path[i];
            if (tp && tp[0] != '\0') return 0x30;
        }
        return 0x00;
    }
    return 0;
}
