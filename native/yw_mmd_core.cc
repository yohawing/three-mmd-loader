#include "nanoem/nanoem.h"
#ifdef __EMSCRIPTEN__
#include "nanoem/ext/emscripten.h"
#endif
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

/* forward declarations for helpers defined later in this file */
static char *yw_mmd_copy_string(const char *value);
static int   yw_mmd_detect_model_format(const nanoem_u8_t *data, nanoem_rsize_t length);
static void  yw_mmd_fill_header_metadata(const nanoem_u8_t *data, nanoem_rsize_t length, int format, float *out_f32, int *out_i32);

enum {
    YW_MMD_MODEL_FORMAT_AUTO = 0,
    YW_MMD_MODEL_FORMAT_PMX = 1,
    YW_MMD_MODEL_FORMAT_PMD = 2
};

enum {
    YW_MMD_METADATA_FORMAT = 0,
    YW_MMD_METADATA_ENCODING = 1,
    YW_MMD_METADATA_VERTEX_INDEX_SIZE = 2,
    YW_MMD_METADATA_TEXTURE_INDEX_SIZE = 3,
    YW_MMD_METADATA_MATERIAL_INDEX_SIZE = 4,
    YW_MMD_METADATA_BONE_INDEX_SIZE = 5,
    YW_MMD_METADATA_MORPH_INDEX_SIZE = 6,
    YW_MMD_METADATA_RIGID_BODY_INDEX_SIZE = 7,
    YW_MMD_METADATA_ADDITIONAL_UV_COUNT = 8,
    YW_MMD_METADATA_VERTEX_COUNT = 9,
    YW_MMD_METADATA_FACE_COUNT = 10,
    YW_MMD_METADATA_MATERIAL_COUNT = 11,
    YW_MMD_METADATA_BONE_COUNT = 12,
    YW_MMD_METADATA_MORPH_COUNT = 13,
    YW_MMD_METADATA_DISPLAY_FRAME_COUNT = 14,
    YW_MMD_METADATA_RIGID_BODY_COUNT = 15,
    YW_MMD_METADATA_JOINT_COUNT = 16,
    YW_MMD_METADATA_SOFT_BODY_COUNT = 17,
    YW_MMD_METADATA_STATUS = 18
};

enum {
    YW_MMD_MOTION_BONE_COUNT = 0,
    YW_MMD_MOTION_MORPH_COUNT = 1,
    YW_MMD_MOTION_CAMERA_COUNT = 2,
    YW_MMD_MOTION_LIGHT_COUNT = 3,
    YW_MMD_MOTION_SELF_SHADOW_COUNT = 4,
    YW_MMD_MOTION_MODEL_COUNT = 5,
    YW_MMD_MOTION_MAX_FRAME = 6,
    YW_MMD_MOTION_STATUS = 7
};

static float g_yw_mmd_metadata_f32[4];
static int g_yw_mmd_metadata_i32[32];

/* Module-level EMST factory (lazy-initialized, never destroyed).
   emscripten.cc uses nanoem_calloc/nanoem_free for the opaque struct which
   skips C++ constructors/destructors on the embedded val members.  Creating
   and destroying the factory on every call therefore leaks emval handles and
   can leave vals in an invalid state.  Keeping a single instance alive for
   the module's lifetime avoids both problems. */
static nanoem_unicode_string_factory_t *g_emst_factory = NULL;

static nanoem_unicode_string_factory_t *
yw_mmd_get_emst_factory(void)
{
    if (!g_emst_factory) {
        nanoem_status_t status = NANOEM_STATUS_SUCCESS;
#ifdef __EMSCRIPTEN__
        g_emst_factory = nanoemUnicodeStringFactoryCreateEMST();
#else
        g_emst_factory = nanoemUnicodeStringFactoryCreate(&status);
#endif
    }
    return g_emst_factory;
}

/* -- Phase-2 unified model load cache ------------------------------------ */
static struct {
    /* parsed nanoem model (kept alive until yw_mmd_model_free) */
    nanoem_model_t *model;

    /* metadata */
    int    meta_i32[32];
    float  meta_f32[4];
    char  *name;
    char  *english_name;
    char  *comment;
    char  *english_comment;

    /* flat geometry buffers (malloc'd) */
    float    *positions;    /* vertex_count * 3 */
    float    *normals;      /* vertex_count * 3 */
    float    *uvs;          /* vertex_count * 2 */
    uint16_t *skin_indices; /* vertex_count * 4 */
    float    *skin_weights; /* vertex_count * 4 */
    float    *edge_scale;   /* vertex_count */
    float    *sdef_enabled; /* vertex_count  (0.0 or 1.0) */
    float    *sdef_c;       /* vertex_count * 3 */
    float    *sdef_r0;      /* vertex_count * 3 */
    float    *sdef_r1;      /* vertex_count * 3 */
    float    *sdef_rw0;     /* vertex_count * 3 (pre-computed) */
    float    *sdef_rw1;     /* vertex_count * 3 (pre-computed) */
    uint32_t *indices;      /* index_count */
    float    *additional_uvs; /* vertex_count * 4 * additional_uv_count
                                  layout: [uvSet0[v0..vN-1], uvSet1[v0..vN-1], ...] */
    int vertex_count;
    int index_count;
    int additional_uv_count;

    /* Phase-3 model data cache. Object pointer arrays are owned by nanoem model. */
    nanoem_model_texture_t *const     *textures_arr;
    nanoem_model_material_t *const    *materials_arr;
    nanoem_model_bone_t *const        *bones_arr;
    nanoem_model_morph_t *const       *morphs_arr;
    nanoem_model_label_t *const       *labels_arr;
    nanoem_model_rigid_body_t *const  *rigid_bodies_arr;
    nanoem_model_joint_t *const       *joints_arr;
    nanoem_model_soft_body_t *const   *soft_bodies_arr;
    char **mat_diffuse_tex_path;
    char **mat_sphere_tex_path;
    char **mat_toon_tex_path;
    int    *ik_link_counts;
    float **ik_links_buf;
    int    *morph_offset_counts;
    float **morph_offset_bufs;
    float  *morph_dense_buf;
    size_t  morph_dense_capacity;
    int material_count_p3;
    int bone_count_p3;
    int morph_count_p3;
    int texture_count_p3;
    int valid;
} g_mld;  /* model load data */

static struct {
    nanoem_motion_t *motion;
    nanoem_motion_bone_keyframe_t *const *bones_arr;
    nanoem_motion_morph_keyframe_t *const *morphs_arr;
    nanoem_motion_camera_keyframe_t *const *cameras_arr;
    nanoem_motion_light_keyframe_t *const *lights_arr;
    nanoem_motion_self_shadow_keyframe_t *const *self_shadows_arr;
    nanoem_motion_model_keyframe_t *const *models_arr;
    int meta_i32[8];
    int valid;
} g_mtn;

/* nanoem string -> malloc'd UTF-8 C string. Falls back to an empty string. */
static char *
yw_mmd_extract_text(nanoem_unicode_string_factory_t *factory,
                    const nanoem_unicode_string_t *text)
{
    if (!text) return yw_mmd_copy_string("");
    nanoem_u8_t stack_buf[4096];
    nanoem_rsize_t text_len = 0;
    nanoem_status_t st = NANOEM_STATUS_SUCCESS;
    memset(stack_buf, 0, sizeof(stack_buf));
#ifdef __EMSCRIPTEN__
    nanoemUnicodeStringFactoryToUtf8OnStackEMST(
        factory, text, &text_len, (char *)stack_buf, sizeof(stack_buf), &st);
#else
    {
        nanoem_u8_t *utf8 = nanoemUnicodeStringFactoryGetByteArray(
            factory, text, &text_len, &st);
        if (utf8) {
            size_t n = text_len < sizeof(stack_buf) - 1 ? text_len : sizeof(stack_buf) - 1;
            memcpy(stack_buf, utf8, n);
            stack_buf[n] = '\0';
            nanoemUnicodeStringFactoryDestroyByteArray(factory, utf8);
        }
    }
#endif
    return yw_mmd_copy_string(st == NANOEM_STATUS_SUCCESS ? (const char *)stack_buf : "");
}

static const char *
yw_mmd_extract_text_static(nanoem_unicode_string_factory_t *factory,
                           const nanoem_unicode_string_t *text)
{
    static char buffers[8][4096];
    static int next_buffer = 0;
    char *buffer = buffers[next_buffer++ & 7];
    nanoem_rsize_t text_len = 0;
    nanoem_status_t st = NANOEM_STATUS_SUCCESS;
    memset(buffer, 0, 4096);
    if (!text) return buffer;
#ifdef __EMSCRIPTEN__
    nanoemUnicodeStringFactoryToUtf8OnStackEMST(
        factory, text, &text_len, buffer, 4096, &st);
#else
    {
        nanoem_u8_t *utf8 = nanoemUnicodeStringFactoryGetByteArray(factory, text, &text_len, &st);
        if (utf8) {
            size_t n = text_len < 4095 ? text_len : 4095;
            memcpy(buffer, utf8, n);
            buffer[n] = '\0';
            nanoemUnicodeStringFactoryDestroyByteArray(factory, utf8);
        }
    }
#endif
    if (st != NANOEM_STATUS_SUCCESS) buffer[0] = '\0';
    return buffer;
}

/* free and zero all g_mld members */
static void
yw_mmd_clear_mld(void)
{
    if (g_mld.model) { nanoemModelDestroy(g_mld.model); g_mld.model = NULL; }
    free(g_mld.name);           g_mld.name           = NULL;
    free(g_mld.english_name);   g_mld.english_name   = NULL;
    free(g_mld.comment);        g_mld.comment        = NULL;
    free(g_mld.english_comment);g_mld.english_comment= NULL;
    free(g_mld.positions);      g_mld.positions      = NULL;
    free(g_mld.normals);        g_mld.normals        = NULL;
    free(g_mld.uvs);            g_mld.uvs            = NULL;
    free(g_mld.skin_indices);   g_mld.skin_indices   = NULL;
    free(g_mld.skin_weights);   g_mld.skin_weights   = NULL;
    free(g_mld.edge_scale);     g_mld.edge_scale     = NULL;
    free(g_mld.sdef_enabled);   g_mld.sdef_enabled   = NULL;
    free(g_mld.sdef_c);         g_mld.sdef_c         = NULL;
    free(g_mld.sdef_r0);        g_mld.sdef_r0        = NULL;
    free(g_mld.sdef_r1);        g_mld.sdef_r1        = NULL;
    free(g_mld.sdef_rw0);       g_mld.sdef_rw0       = NULL;
    free(g_mld.sdef_rw1);       g_mld.sdef_rw1       = NULL;
    free(g_mld.indices);        g_mld.indices        = NULL;
    free(g_mld.additional_uvs); g_mld.additional_uvs = NULL;
    if (g_mld.mat_diffuse_tex_path) {
        for (int i = 0; i < g_mld.material_count_p3; i++) {
            free(g_mld.mat_diffuse_tex_path[i]);
            free(g_mld.mat_sphere_tex_path ? g_mld.mat_sphere_tex_path[i] : NULL);
            free(g_mld.mat_toon_tex_path ? g_mld.mat_toon_tex_path[i] : NULL);
        }
        free(g_mld.mat_diffuse_tex_path);
        free(g_mld.mat_sphere_tex_path);
        free(g_mld.mat_toon_tex_path);
        g_mld.mat_diffuse_tex_path = NULL;
        g_mld.mat_sphere_tex_path = NULL;
        g_mld.mat_toon_tex_path = NULL;
    }
    if (g_mld.ik_links_buf) {
        for (int i = 0; i < g_mld.bone_count_p3; i++) {
            free(g_mld.ik_links_buf[i]);
        }
        free(g_mld.ik_links_buf);
        g_mld.ik_links_buf = NULL;
    }
    free(g_mld.ik_link_counts); g_mld.ik_link_counts = NULL;
    if (g_mld.morph_offset_bufs) {
        for (int i = 0; i < g_mld.morph_count_p3; i++) {
            free(g_mld.morph_offset_bufs[i]);
        }
        free(g_mld.morph_offset_bufs);
        g_mld.morph_offset_bufs = NULL;
    }
    free(g_mld.morph_offset_counts); g_mld.morph_offset_counts = NULL;
    free(g_mld.morph_dense_buf); g_mld.morph_dense_buf = NULL;
    g_mld.morph_dense_capacity = 0;
    g_mld.textures_arr = NULL;
    g_mld.materials_arr = NULL;
    g_mld.bones_arr = NULL;
    g_mld.morphs_arr = NULL;
    g_mld.labels_arr = NULL;
    g_mld.rigid_bodies_arr = NULL;
    g_mld.joints_arr = NULL;
    g_mld.soft_bodies_arr = NULL;
    memset(g_mld.meta_i32, 0, sizeof(g_mld.meta_i32));
    memset(g_mld.meta_f32, 0, sizeof(g_mld.meta_f32));
    g_mld.vertex_count = 0;
    g_mld.index_count  = 0;
    g_mld.additional_uv_count = 0;
    g_mld.material_count_p3 = 0;
    g_mld.bone_count_p3 = 0;
    g_mld.morph_count_p3 = 0;
    g_mld.texture_count_p3 = 0;
    g_mld.valid = 0;
}

static void
yw_mmd_clear_mtn(void)
{
    if (g_mtn.motion) {
        nanoemMotionDestroy(g_mtn.motion);
        g_mtn.motion = NULL;
    }
    g_mtn.bones_arr = NULL;
    g_mtn.morphs_arr = NULL;
    g_mtn.cameras_arr = NULL;
    g_mtn.lights_arr = NULL;
    g_mtn.self_shadows_arr = NULL;
    g_mtn.models_arr = NULL;
    memset(g_mtn.meta_i32, 0, sizeof(g_mtn.meta_i32));
    g_mtn.valid = 0;
}

/* SDEF rw0/rw1 precompute. Matches the TypeScript PMX parser. */
static void
yw_mmd_compute_sdef_rw(const float *c, const float *r0, const float *r1, float w0,
                        float *rw0_out, float *rw1_out)
{
    float w1 = 1.0f - w0;
    float rw[3] = { r0[0]*w0 + r1[0]*w1,
                    r0[1]*w0 + r1[1]*w1,
                    r0[2]*w0 + r1[2]*w1 };
    float ar0[3] = { c[0]+r0[0]-rw[0], c[1]+r0[1]-rw[1], c[2]+r0[2]-rw[2] };
    float ar1[3] = { c[0]+r1[0]-rw[0], c[1]+r1[1]-rw[1], c[2]+r1[2]-rw[2] };
    rw0_out[0] = (c[0]+ar0[0]) * 0.5f;
    rw0_out[1] = (c[1]+ar0[1]) * 0.5f;
    rw0_out[2] = (c[2]+ar0[2]) * 0.5f;
    rw1_out[0] = (c[0]+ar1[0]) * 0.5f;
    rw1_out[1] = (c[1]+ar1[1]) * 0.5f;
    rw1_out[2] = (c[2]+ar1[2]) * 0.5f;
}

static int
yw_mmd_bone_index(const nanoem_model_bone_t *bone)
{
    if (!bone) return 0;
    return nanoemModelObjectGetIndex(nanoemModelBoneGetModelObject(bone));
}

static int
yw_mmd_nullable_bone_index(const nanoem_model_bone_t *bone)
{
    return bone ? nanoemModelObjectGetIndex(nanoemModelBoneGetModelObject(bone)) : -1;
}

static int
yw_mmd_nullable_morph_index(const nanoem_model_morph_t *morph)
{
    return morph ? nanoemModelObjectGetIndex(nanoemModelMorphGetModelObject(morph)) : -1;
}

static int
yw_mmd_nullable_material_index(const nanoem_model_material_t *material)
{
    return material ? nanoemModelObjectGetIndex(nanoemModelMaterialGetModelObject(material)) : -1;
}

static int
yw_mmd_nullable_rigid_body_index(const nanoem_model_rigid_body_t *rigid_body)
{
    return rigid_body ? nanoemModelObjectGetIndex(nanoemModelRigidBodyGetModelObject(rigid_body)) : -1;
}

static int
yw_mmd_nullable_vertex_index(const nanoem_model_vertex_t *vertex)
{
    return vertex ? nanoemModelObjectGetIndex(nanoemModelVertexGetModelObject(vertex)) : -1;
}

static const nanoem_model_material_t *
yw_mmd_material_at(int i)
{
    return g_mld.valid && g_mld.materials_arr && i >= 0 && i < g_mld.material_count_p3 ? g_mld.materials_arr[i] : NULL;
}

static const nanoem_model_bone_t *
yw_mmd_bone_at(int i)
{
    return g_mld.valid && g_mld.bones_arr && i >= 0 && i < g_mld.bone_count_p3 ? g_mld.bones_arr[i] : NULL;
}

static const nanoem_model_morph_t *
yw_mmd_morph_at(int i)
{
    return g_mld.valid && g_mld.morphs_arr && i >= 0 && i < g_mld.morph_count_p3 ? g_mld.morphs_arr[i] : NULL;
}

#include "yw_mmd_core/model_cache.inc"

extern "C" {

#include "yw_mmd_core/model_exports.inc"
#include "yw_mmd_core/material_exports.inc"
#include "yw_mmd_core/bone_exports.inc"
#include "yw_mmd_core/morph_exports.inc"
#include "yw_mmd_core/label_physics_exports.inc"
#include "yw_mmd_core/motion_exports.inc"
#include "yw_mmd_core/metadata_exports.inc"

} /* extern "C" */
