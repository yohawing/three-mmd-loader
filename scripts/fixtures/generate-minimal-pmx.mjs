import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TextEncoder } from "node:util";
import { PNG } from "pngjs";

const DEFAULT_OUTPUT = "test/fixtures/generated/minimal-loader-smoke.pmx";
const REST_POSE_OUTPUT_DIR = "test/fixtures/generated/rest-pose";
const VISUAL_OUTPUT_DIR = "test/fixtures/generated/visual";
const SKINNING_OUTPUT_DIR = "test/fixtures/generated/skinning";
const SELF_SHADOW_OUTPUT_DIR = "test/fixtures/generated/self-shadow";
const BASE_BONE_FLAGS = 0x001e;
const REST_POSE_CASES = {
  "append-rotate-parent": {
    englishName: "RestPoseAppendRotateParent",
    comment: "Rest pose fixture with appendRotate parent metadata.",
    bones: [
      bone("センター", "center", [0, 0, 0], -1),
      bone("付与元", "appendSource", [0, 0.8, 0], 0),
      bone("腰", "waist", [0, 1.2, 0], 1, {
        flags: BASE_BONE_FLAGS | 0x0100,
        appendTransform: { parent: 1, weight: 1 }
      })
    ],
    watchBone: "腰"
  },
  "append-local": {
    englishName: "RestPoseAppendLocal",
    comment: "Rest pose fixture with local appendRotate metadata.",
    bones: [
      bone("センター", "center", [0, 0, 0], -1),
      bone("付与元", "appendSource", [0, 0.8, 0], 0),
      bone("腰", "waist", [0, 1.2, 0], 1, {
        flags: BASE_BONE_FLAGS | 0x0080 | 0x0100,
        appendTransform: { parent: 1, weight: 1 }
      })
    ],
    watchBone: "腰"
  },
  "ik-chain": {
    englishName: "RestPoseIkChain",
    comment: "Rest pose fixture with an MMD-style leg IK chain.",
    bones: [
      bone("センター", "center", [0, 0, 0], -1),
      bone("腰", "waist", [0, 0.8, 0], 0),
      bone("上半身", "upperBody", [0, 1.4, 0], 1),
      bone("左足", "leftLeg", [0, 0.6, 0], 1),
      bone("左足先", "leftFootTip", [0, 0.1, 0], 3),
      bone("左足IK", "leftLegIk", [0.45, 0.3, 0], 0, {
        flags: BASE_BONE_FLAGS | 0x0020,
        ik: {
          target: 4,
          loopCount: 8,
          limitAngle: Math.PI,
          links: [{ bone: 3 }]
        }
      })
    ],
    torsoBones: ["センター", "腰", "上半身"],
    ikLinkBone: "左足"
  },
  "fixed-local-axis": {
    englishName: "RestPoseFixedLocalAxis",
    comment: "Rest pose fixture with fixedAxis and localAxis bone metadata.",
    bones: [
      bone("センター", "center", [0, 0, 0], -1),
      bone("腰", "waist", [0, 0.8, 0], 0, {
        flags: BASE_BONE_FLAGS | 0x0400 | 0x0800,
        fixedAxis: [0, 1, 0],
        localAxis: {
          x: [1, 0, 0],
          z: [0, 0, 1]
        }
      }),
      bone("上半身", "upperBody", [0, 1.4, 0], 1)
    ],
    watchBone: "腰"
  },
  "transform-after-physics": {
    englishName: "RestPoseTransformAfterPhysics",
    comment: "Rest pose fixture with a transformAfterPhysics bone.",
    bones: [
      bone("センター", "center", [0, 0, 0], -1),
      bone("腰", "waist", [0, 0.8, 0], 0, {
        flags: BASE_BONE_FLAGS | 0x1000
      }),
      bone("上半身", "upperBody", [0, 1.4, 0], 1)
    ],
    watchBone: "腰"
  }
};

// PMX weight types: 0=BDEF1, 1=BDEF2, 2=BDEF4, 3=SDEF, 4=QDEF
const SKINNING_CASES = {
  "bdef1-single-bone-quad": {
    englishName: "SkinningBdef1SingleBoneQuad",
    comment: "BDEF1 skinning fixture: all vertices fully weighted to one bone.",
    bones: [
      bone("root", "root", [0, 0, 0], -1),
      bone("tip", "tip", [0, 1, 0], 0)
    ],
    geometry: singleBoneQuadGeometry(0),
    faceVertexCount: 6
  },
  "bdef2-two-bone-strip": {
    englishName: "SkinningBdef2TwoBoneStrip",
    comment: "BDEF2 skinning fixture: cylinder weighted between two bones.",
    bones: [
      bone("lower", "lower", [0, 0, 0], -1),
      bone("upper", "upper", [0, 1, 0], 0)
    ],
    geometry: cylinderGeometry({ radius: 0.25, height: 1, rings: 4, segments: 8, bone0: 0, bone1: 1, skinType: 1 }),
    faceVertexCount: 4 * 8 * 6
  },
  "bdef4-twist-cylinder": {
    englishName: "SkinningBdef4TwistCylinder",
    comment: "BDEF4 skinning fixture: cylinder with four-bone blend.",
    bones: [
      bone("bone0", "bone0", [0, 0, 0], -1),
      bone("bone1", "bone1", [0, 0.33, 0], 0),
      bone("bone2", "bone2", [0, 0.67, 0], 1),
      bone("bone3", "bone3", [0, 1, 0], 2)
    ],
    geometry: cylinderGeometry({ radius: 0.25, height: 1, rings: 6, segments: 8, bone0: 0, bone1: 1, bone2: 2, bone3: 3, skinType: 2 }),
    faceVertexCount: 6 * 8 * 6
  },
  "sdef-two-bone-elbow": {
    englishName: "SkinningSdefTwoBoneElbow",
    comment: "SDEF skinning fixture: cylinder with SDEF parameters for two bones.",
    bones: [
      bone("lowerArm", "lowerArm", [0, 0, 0], -1),
      bone("upperArm", "upperArm", [0, 1, 0], 0)
    ],
    geometry: cylinderGeometry({ radius: 0.25, height: 1, rings: 4, segments: 8, bone0: 0, bone1: 1, skinType: 3 }),
    faceVertexCount: 4 * 8 * 6
  },
  "qdef-twist-cylinder": {
    englishName: "SkinningQdefTwistCylinder",
    comment: "QDEF skinning fixture: cylinder parsed as dual-quaternion blend (BDEF4 fallback).",
    bones: [
      bone("bone0", "bone0", [0, 0, 0], -1),
      bone("bone1", "bone1", [0, 0.33, 0], 0),
      bone("bone2", "bone2", [0, 0.67, 0], 1),
      bone("bone3", "bone3", [0, 1, 0], 2)
    ],
    geometry: cylinderGeometry({ radius: 0.25, height: 1, rings: 6, segments: 8, bone0: 0, bone1: 1, bone2: 2, bone3: 3, skinType: 4 }),
    faceVertexCount: 6 * 8 * 6
  },
  "mixed-deform-types": {
    englishName: "SkinningMixedDeformTypes",
    comment: "Mixed skinning fixture: BDEF1, BDEF2, BDEF4, SDEF, and QDEF vertices in one PMX.",
    bones: [
      bone("bone0", "bone0", [0, 0, 0], -1),
      bone("bone1", "bone1", [0, 0.33, 0], 0),
      bone("bone2", "bone2", [0, 0.67, 0], 1),
      bone("bone3", "bone3", [0, 1, 0], 2)
    ],
    geometry: mixedSkinGeometry(),
    faceVertexCount: 5 * 6
  }
};

const VISUAL_CASES = {
  "mmd-diffuse-lit-box": {
    name: "generated visual diffuse lit box",
    englishName: "GeneratedVisualDiffuseLitBox",
    comment: "redistribution-safe PMX visual fixture for basic diffuse lighting",
    englishComment: "A plain lit PMX box catches basic material color and lighting regressions.",
    geometry: transformGeometry(
      boxGeometry({
        min: [-0.46, 0.12, -0.28],
        max: [0.46, 1.04, 0.28],
        bone: 0,
        normalMode: "corner"
      }),
      { rotateY: -0.36, rotateX: 0.08, translate: [0.03, 0, 0] }
    ),
    materials: [
      material("mat_diffuse_lit", "DiffuseLit", {
        diffuse: [0.31, 0.56, 0.85, 1],
        specular: [0.03, 0.03, 0.04],
        ambient: [0.1, 0.18, 0.3],
        edgeColor: [0, 0, 0, 1],
        edgeSize: 1.8,
        flags: 0x11,
        faceVertexCount: 36,
        comment: "basic diffuse lit material"
      })
    ]
  },
  "mmd-toon-ramp-lit-box": {
    name: "generated visual toon ramp lit box",
    englishName: "GeneratedVisualToonRampLitBox",
    comment: "redistribution-safe PMX visual fixture for custom toon ramp lighting",
    englishComment: "A PMX box with a custom toon texture catches toon gradient regressions.",
    geometry: transformGeometry(
      boxGeometry({
        min: [-0.46, 0.12, -0.28],
        max: [0.46, 1.04, 0.28],
        bone: 0,
        normalMode: "corner"
      }),
      { rotateY: 0.38, rotateX: -0.06, translate: [0.03, 0, 0] }
    ),
    textures: ["toon-three-step-warm.png"],
    assets: [
      {
        path: "toon-three-step-warm.png",
        bytes: () => toonRampPng()
      }
    ],
    materials: [
      material("mat_toon_ramp", "ToonRamp", {
        diffuse: [0.94, 0.56, 0.22, 1],
        specular: [0.04, 0.02, 0.01],
        ambient: [0.32, 0.16, 0.06],
        edgeColor: [0, 0, 0, 1],
        edgeSize: 1.8,
        flags: 0x11,
        toonTextureIndex: 0,
        faceVertexCount: 36,
        comment: "custom toon ramp material"
      })
    ]
  },
  "mmd-alpha-blend-overlap": {
    name: "generated visual alpha blend overlap",
    englishName: "GeneratedVisualAlphaBlendOverlap",
    comment: "redistribution-safe PMX visual fixture for transparent overlap blending",
    englishComment: "Two overlapping translucent PMX materials catch alpha blending and material ordering regressions.",
    geometry: mergeGeometries([
      transformGeometry(
        boxGeometry({
          min: [-0.55, 0.18, -0.18],
          max: [0.24, 1.0, 0.18],
          bone: 0,
          normalMode: "corner"
        }),
        { rotateY: 0.16, translate: [-0.08, 0, -0.1] }
      ),
      transformGeometry(
        boxGeometry({
          min: [-0.24, 0.34, -0.16],
          max: [0.55, 1.16, 0.16],
          bone: 0,
          normalMode: "corner"
        }),
        { rotateY: -0.16, translate: [0.08, 0, -0.28] }
      )
    ]),
    materials: [
      material("mat_alpha_red", "AlphaRed", {
        diffuse: [1, 0.1, 0.08, 0.55],
        specular: [0.03, 0.01, 0.01],
        ambient: [0.3, 0.04, 0.03],
        edgeColor: [0, 0, 0, 0],
        edgeSize: 0,
        flags: 0x01,
        faceVertexCount: 36,
        comment: "front translucent red material"
      }),
      material("mat_alpha_blue", "AlphaBlue", {
        diffuse: [0.08, 0.22, 1, 0.58],
        specular: [0.01, 0.02, 0.04],
        ambient: [0.03, 0.07, 0.3],
        edgeColor: [0, 0, 0, 0],
        edgeSize: 0,
        flags: 0x01,
        faceVertexCount: 36,
        comment: "back translucent blue material"
      })
    ]
  },
  "mmd-texture-uv-orientation-plane": {
    name: "generated visual texture uv orientation plane",
    englishName: "GeneratedVisualTextureUvOrientationPlane",
    comment: "redistribution-safe PMX visual fixture for diffuse texture UV orientation",
    englishComment: "A textured PMX plane with asymmetric corner colors catches U/V orientation regressions.",
    geometry: transformGeometry(
      singleBoneQuadGeometry(0),
      { translate: [0, 0.08, 0] }
    ),
    textures: ["uv-orientation.png"],
    assets: [
      {
        path: "uv-orientation.png",
        bytes: () => uvOrientationPng()
      }
    ],
    materials: [
      material("mat_uv_orientation", "UvOrientation", {
        diffuse: [1, 1, 1, 1],
        specular: [0.02, 0.02, 0.02],
        ambient: [0.35, 0.35, 0.35],
        edgeColor: [0, 0, 0, 1],
        edgeSize: 1.5,
        flags: 0x11,
        textureIndex: 0,
        faceVertexCount: 6,
        comment: "asymmetric diffuse texture for PMX UV orientation"
      })
    ]
  },
  "mmd-sphere-texture-multiply": {
    name: "generated visual sphere texture multiply",
    englishName: "GeneratedVisualSphereTextureMultiply",
    comment: "redistribution-safe PMX visual fixture for multiply sphere texture shading",
    englishComment: "A rounded PMX box with a multiply sphere texture catches sphere-map shader regressions.",
    geometry: transformGeometry(
      boxGeometry({
        min: [-0.46, 0.12, -0.28],
        max: [0.46, 1.04, 0.28],
        bone: 0,
        normalMode: "corner"
      }),
      { rotateY: -0.44, rotateX: 0.08, translate: [0.03, 0, 0] }
    ),
    textures: ["sphere-radial-multiply.png"],
    assets: [
      {
        path: "sphere-radial-multiply.png",
        bytes: () => sphereRadialPng([108, 164, 238], [18, 34, 74])
      }
    ],
    materials: [
      material("mat_sphere_multiply", "SphereMultiply", {
        diffuse: [0.76, 0.86, 1, 1],
        specular: [0.03, 0.04, 0.06],
        ambient: [0.24, 0.29, 0.36],
        edgeColor: [0, 0, 0, 1],
        edgeSize: 1.8,
        flags: 0x11,
        sphereTextureIndex: 0,
        sphereMode: 1,
        faceVertexCount: 36,
        comment: "multiply sphere texture material"
      })
    ]
  },
  "mmd-sphere-texture-add": {
    name: "generated visual sphere texture add",
    englishName: "GeneratedVisualSphereTextureAdd",
    comment: "redistribution-safe PMX visual fixture for additive sphere texture shading",
    englishComment: "A rounded PMX box with an additive sphere texture catches sphere-map shader regressions.",
    geometry: transformGeometry(
      boxGeometry({
        min: [-0.46, 0.12, -0.28],
        max: [0.46, 1.04, 0.28],
        bone: 0,
        normalMode: "corner"
      }),
      { rotateY: 0.42, rotateX: -0.06, translate: [0.03, 0, 0] }
    ),
    textures: ["sphere-radial-add.png"],
    assets: [
      {
        path: "sphere-radial-add.png",
        bytes: () => sphereRadialPng([255, 190, 76], [18, 12, 6])
      }
    ],
    materials: [
      material("mat_sphere_add", "SphereAdd", {
        diffuse: [0.36, 0.62, 0.36, 1],
        specular: [0.02, 0.04, 0.02],
        ambient: [0.1, 0.2, 0.1],
        edgeColor: [0, 0, 0, 1],
        edgeSize: 1.8,
        flags: 0x11,
        sphereTextureIndex: 0,
        sphereMode: 2,
        faceVertexCount: 36,
        comment: "additive sphere texture material"
      })
    ]
  },
  "mmd-material-order-body-outline-interleave": {
    name: "generated visual material order body outline interleave",
    englishName: "GeneratedVisualMaterialOrderBodyOutlineInterleave",
    comment: "redistribution-safe PMX visual fixture for material body/outline render order",
    englishComment: "Two overlapping angled translucent edged boxes with separate PMX materials.",
    geometry: mergeGeometries([
      transformGeometry(
        boxGeometry({
          min: [-0.62, 0.1, -0.34],
          max: [0.34, 1.0, 0.34],
          bone: 0,
          normalMode: "corner"
        }),
        { rotateY: 0.72, rotateX: -0.08, translate: [-0.08, 0, 0.02] }
      ),
      transformGeometry(
        boxGeometry({
          min: [-0.18, 0.35, -0.3],
          max: [0.78, 1.25, 0.38],
          bone: 0,
          normalMode: "corner"
        }),
        { rotateY: -0.78, rotateX: 0.06, translate: [0.1, 0, 0.04] }
      )
    ]),
    materials: [
      material("mat_red_order0", "RedOrder0", {
        diffuse: [1, 0.12, 0.08, 0.55],
        specular: [0.05, 0.02, 0.02],
        ambient: [0.35, 0.06, 0.04],
        edgeColor: [0, 0, 0, 1],
        edgeSize: 2.5,
        flags: 0x11,
        faceVertexCount: 36,
        comment: "material 0: translucent red thin box with edge"
      }),
      material("mat_blue_order1", "BlueOrder1", {
        diffuse: [0.08, 0.22, 1, 0.55],
        specular: [0.02, 0.03, 0.06],
        ambient: [0.04, 0.08, 0.35],
        edgeColor: [0, 0, 0, 1],
        edgeSize: 2.5,
        flags: 0x11,
        faceVertexCount: 36,
        comment: "material 1: translucent blue thin box with edge"
      })
    ]
  },
  "mmd-outline-normal-silhouette": {
    name: "generated visual outline normal silhouette",
    englishName: "GeneratedVisualOutlineNormalSilhouette",
    comment: "redistribution-safe PMX visual fixture for outline normal/depth visibility",
    englishComment: "One rotated translucent edged box that should show a continuous black silhouette.",
    geometry: transformGeometry(
      boxGeometry({ min: [-0.42, 0.18, -0.22], max: [0.42, 1.02, 0.22], bone: 0 }),
      { rotateY: -0.48, translate: [0.06, 0, 0] }
    ),
    materials: [
      material("mat_outline_silhouette", "OutlineSilhouette", {
        diffuse: [0.25, 0.78, 0.36, 0.52],
        specular: [0.03, 0.04, 0.03],
        ambient: [0.08, 0.28, 0.12],
        edgeColor: [0, 0, 0, 1],
        edgeSize: 2.5,
        flags: 0x11,
        faceVertexCount: 36,
        comment: "single rotated translucent box for outline normal visibility"
      })
    ]
  },
  "mmd-texture-alpha-used-uv-cutout": {
    name: "generated visual texture alpha used uv cutout",
    englishName: "GeneratedVisualTextureAlphaUsedUvCutout",
    comment: "redistribution-safe PMX visual fixture for geometry-aware texture alpha",
    englishComment: "Opaque PMX material whose used UVs sample an alpha cutout texture.",
    geometry: transformGeometry(
      boxGeometry({
        min: [-0.46, 0.12, -0.08],
        max: [0.46, 1.04, 0.08],
        bone: 0,
        normalMode: "corner"
      }),
      { rotateY: -0.32, rotateX: 0.04, translate: [0.02, 0, 0] }
    ),
    textures: ["texture-alpha-cutout.png"],
    assets: [
      {
        path: "texture-alpha-cutout.png",
        bytes: () => alphaCutoutPng()
      }
    ],
    materials: [
      material("mat_alpha_cutout", "AlphaCutout", {
        diffuse: [1, 1, 1, 1],
        specular: [0.03, 0.03, 0.03],
        ambient: [0.35, 0.35, 0.35],
        edgeColor: [0, 0, 0, 1],
        edgeSize: 2.5,
        flags: 0x11,
        textureIndex: 0,
        faceVertexCount: 36,
        comment: "opaque PMX material using alpha cutout texture"
      })
    ]
  },
  "mmd-texture-alpha-atlas-padding-ignored": {
    name: "generated visual texture alpha atlas padding ignored",
    englishName: "GeneratedVisualTextureAlphaAtlasPaddingIgnored",
    comment: "redistribution-safe PMX visual fixture for geometry-aware atlas alpha padding",
    englishComment: "Opaque PMX material whose texture has transparent unused atlas padding.",
    geometry: transformGeometry(
      boxGeometry({
        min: [-0.46, 0.12, -0.08],
        max: [0.46, 1.04, 0.08],
        bone: 0,
        normalMode: "corner",
        uvRect: [0.34, 0.34, 0.66, 0.66]
      }),
      { rotateY: 0.28, rotateX: -0.04, translate: [0.02, 0, 0] }
    ),
    textures: ["texture-atlas-padding.png"],
    assets: [
      {
        path: "texture-atlas-padding.png",
        bytes: () => atlasPaddingPng()
      }
    ],
    materials: [
      material("mat_atlas_padding", "AtlasPadding", {
        diffuse: [1, 1, 1, 1],
        specular: [0.03, 0.03, 0.03],
        ambient: [0.35, 0.35, 0.35],
        edgeColor: [0, 0, 0, 1],
        edgeSize: 2.5,
        flags: 0x11,
        textureIndex: 0,
        faceVertexCount: 36,
        comment: "opaque PMX material using only opaque texture atlas region"
      })
    ]
  },
  "mmd-material-morph-alpha-opaque-depth": {
    name: "generated visual material morph alpha opaque depth",
    englishName: "GeneratedVisualMaterialMorphAlphaOpaqueDepth",
    comment: "redistribution-safe PMX visual fixture for inactive alpha material morphs",
    englishComment: "Opaque foreground material has an alpha material morph but must render opaque at rest.",
    geometry: mergeGeometries([
      transformGeometry(
        boxGeometry({
          min: [-0.5, 0.14, -0.12],
          max: [0.5, 1.04, 0.12],
          bone: 0,
          normalMode: "corner"
        }),
        { rotateY: 0.12, translate: [0.1, 0, -0.08] }
      ),
      transformGeometry(
        boxGeometry({
          min: [-0.42, 0.28, -0.08],
          max: [0.42, 0.9, 0.08],
          bone: 0,
          normalMode: "corner"
        }),
        { rotateY: -0.18, translate: [-0.28, 0.03, -0.36] }
      )
    ]),
    materials: [
      material("mat_depth_back", "DepthBack", {
        diffuse: [0.08, 0.26, 0.95, 1],
        specular: [0.02, 0.03, 0.08],
        ambient: [0.03, 0.08, 0.32],
        edgeColor: [0, 0, 0, 1],
        edgeSize: 1.8,
        flags: 0x11,
        faceVertexCount: 36,
        comment: "opaque blue background material"
      }),
      material("mat_alpha_morph_foreground", "AlphaMorphForeground", {
        diffuse: [0.62, 0.04, 0.03, 1],
        specular: [0.04, 0.005, 0.005],
        ambient: [0.22, 0.015, 0.012],
        edgeColor: [0, 0, 0, 1],
        edgeSize: 1.8,
        flags: 0x11,
        faceVertexCount: 36,
        comment: "opaque foreground material with inactive alpha material morph"
      })
    ],
    morphs: [
      {
        name: "foreground_hide",
        englishName: "ForegroundHide",
        panel: 4,
        type: "material",
        offsets: [
          {
            materialIndex: 1,
            operation: "add",
            diffuse: [0, 0, 0, -1]
          }
        ]
      }
    ]
  },
  "mmd-png-hair-shadow-alpha-morph-blend": {
    name: "generated visual png hair shadow alpha morph blend",
    englishName: "GeneratedVisualPngHairShadowAlphaMorphBlend",
    comment: "redistribution-safe PMX visual fixture for PNG hair shadow alpha with alpha morphs",
    englishComment: "A PNG hair shadow overlay has an inactive alpha material morph and must render alpha-blended at rest.",
    geometry: mergeGeometries([
      transformGeometry(
        boxGeometry({
          min: [-0.48, 0.16, -0.1],
          max: [0.48, 1.02, 0.1],
          bone: 0,
          normalMode: "corner"
        }),
        { rotateY: 0.08, translate: [0.02, 0, -0.22] }
      ),
      transformGeometry(
        boxGeometry({
          min: [-0.42, 0.34, -0.06],
          max: [0.42, 0.9, 0.06],
          bone: 0,
          normalMode: "corner"
        }),
        { rotateY: -0.1, translate: [-0.04, 0.02, -0.36] }
      )
    ]),
    textures: ["png-hair-shadow-alpha.png"],
    assets: [
      {
        path: "png-hair-shadow-alpha.png",
        bytes: () => softAlphaOverlayPng([184, 70, 88])
      }
    ],
    materials: [
      material("mat_hair_base_png", "PngHairBase", {
        diffuse: [0.95, 0.82, 0.28, 1],
        specular: [0.05, 0.04, 0.02],
        ambient: [0.32, 0.24, 0.08],
        edgeColor: [0, 0, 0, 1],
        edgeSize: 1.8,
        flags: 0x11,
        faceVertexCount: 36,
        comment: "opaque hair-colored background material"
      }),
      material("mat_png_hairshadow", "PngHairshadow", {
        diffuse: [1, 1, 1, 1],
        specular: [0.02, 0.01, 0.01],
        ambient: [0.28, 0.1, 0.12],
        edgeColor: [0, 0, 0, 1],
        edgeSize: 0,
        flags: 0x00,
        textureIndex: 0,
        faceVertexCount: 36,
        comment: "PNG hairshadow overlay with inactive alpha material morph"
      })
    ],
    morphs: [
      {
        name: "png_hairshadow_hide",
        englishName: "PngHairshadowHide",
        panel: 4,
        type: "material",
        offsets: [
          {
            materialIndex: 1,
            operation: "add",
            diffuse: [0, 0, 0, -1]
          }
        ]
      }
    ]
  },
  "mmd-tga-regular-hair-alpha-opaque": {
    name: "generated visual tga regular hair alpha opaque",
    englishName: "GeneratedVisualTgaRegularHairAlphaOpaque",
    comment: "redistribution-safe PMX visual fixture for regular TGA material alpha metadata",
    englishComment: "A regular shadow-casting TGA hair material has texture alpha but must stay opaque.",
    geometry: transformGeometry(
      boxGeometry({
        min: [-0.48, 0.16, -0.1],
        max: [0.48, 1.02, 0.1],
        bone: 0,
        normalMode: "corner"
      }),
      { rotateY: -0.16, translate: [0.02, 0, -0.18] }
    ),
    textures: ["tga-regular-hair-alpha.tga"],
    assets: [
      {
        path: "tga-regular-hair-alpha.tga",
        bytes: () => softAlphaOverlayTga([72, 148, 84])
      }
    ],
    materials: [
      material("mat_tga_regular_hair", "TgaRegularHair", {
        diffuse: [1, 1, 1, 1],
        specular: [0.03, 0.04, 0.02],
        ambient: [0.12, 0.3, 0.13],
        edgeColor: [0, 0, 0, 1],
        edgeSize: 1.8,
        flags: 0x1f,
        textureIndex: 0,
        faceVertexCount: 36,
        comment: "regular shadow-casting TGA material should ignore texture alpha at rest"
      })
    ]
  },
  "mmd-tga-hair-shadow-overlay-alpha-blend": {
    name: "generated visual tga hair shadow overlay alpha blend",
    englishName: "GeneratedVisualTgaHairShadowOverlayAlphaBlend",
    comment: "redistribution-safe PMX visual fixture for TGA hair shadow overlay alpha",
    englishComment: "A TGA hairshadow overlay must use geometry-aware alpha and render alpha-blended.",
    geometry: mergeGeometries([
      transformGeometry(
        boxGeometry({
          min: [-0.48, 0.16, -0.1],
          max: [0.48, 1.02, 0.1],
          bone: 0,
          normalMode: "corner"
        }),
        { rotateY: 0.12, translate: [0.02, 0, -0.22] }
      ),
      transformGeometry(
        boxGeometry({
          min: [-0.42, 0.34, -0.06],
          max: [0.42, 0.9, 0.06],
          bone: 0,
          normalMode: "corner"
        }),
        { rotateY: -0.08, translate: [-0.04, 0.02, -0.36] }
      )
    ]),
    textures: ["tga-hair-shadow-alpha.tga"],
    assets: [
      {
        path: "tga-hair-shadow-alpha.tga",
        bytes: () => softAlphaOverlayTga([68, 58, 116])
      }
    ],
    materials: [
      material("mat_hair_base_tga", "TgaHairBase", {
        diffuse: [0.94, 0.78, 0.24, 1],
        specular: [0.05, 0.04, 0.02],
        ambient: [0.32, 0.23, 0.08],
        edgeColor: [0, 0, 0, 1],
        edgeSize: 1.8,
        flags: 0x11,
        faceVertexCount: 36,
        comment: "opaque hair-colored background material"
      }),
      material("mat_tga_hairshadow", "TgaHairshadow", {
        diffuse: [1, 1, 1, 1],
        specular: [0.01, 0.01, 0.02],
        ambient: [0.1, 0.09, 0.18],
        edgeColor: [0, 0, 0, 1],
        edgeSize: 0,
        flags: 0x00,
        textureIndex: 0,
        faceVertexCount: 36,
        comment: "TGA hairshadow overlay should alpha blend"
      })
    ]
  }
};

const SELF_SHADOW_CASES = {
  "mmd-self-shadow-body-on": selfShadowBodyCase({
    receiverFlags: 0x09,
    casterFlags: 0x05,
    customToonTexture: true,
    comment: "self shadow body fixture: an in-model protruding caster casts onto the model body"
  }),
  "mmd-self-shadow-body-caster-off": selfShadowBodyCase({
    receiverFlags: 0x09,
    casterFlags: 0x01,
    customToonTexture: true,
    comment: "self shadow body fixture with visible protruding caster disabled for shadow map"
  }),
  "mmd-self-shadow-body-black-toon-on": selfShadowBodyCase({
    receiverFlags: 0x09,
    casterFlags: 0x05,
    customToonTexture: true,
    comment: "self shadow body fixture using a black-bottom toon texture to catch black self-shadow collapse"
  }),
  "mmd-self-shadow-body-black-toon-caster-off": selfShadowBodyCase({
    receiverFlags: 0x09,
    casterFlags: 0x01,
    customToonTexture: true,
    comment: "black-toon self shadow body fixture with visible protruding caster disabled for shadow map"
  }),
  "mmd-self-shadow-on": selfShadowCase({
    receiverFlags: 0x09,
    casterFlags: 0x05,
    probeCaster: false,
    probeReceiver: false,
    comment: "self shadow positive fixture: caster draws to shadow map and receiver receives"
  }),
  "mmd-self-shadow-caster-flag-off-mixed": selfShadowCase({
    receiverFlags: 0x09,
    casterFlags: 0x01,
    probeCaster: true,
    probeReceiver: false,
    comment: "material-level caster fixture: visible caster must not cast even though another material casts"
  }),
  "mmd-self-shadow-receiver-flag-off-mixed": selfShadowCase({
    receiverFlags: 0x01,
    casterFlags: 0x05,
    probeCaster: false,
    probeReceiver: true,
    comment: "material-level receiver fixture: visible receiver must not receive even though another material receives"
  }),
  "mmd-self-shadow-sdef-depth": selfShadowSdefCase()
};

export function generateMinimalPmx() {
  return generatePmx({
    name: "generated minimal loader smoke",
    englishName: "GeneratedMinimalLoaderSmoke",
    comment: "redistribution-safe fixture generated by scripts/fixtures/generate-minimal-pmx.mjs",
    englishComment: "Generated tetrahedron-like PMX with one material, three bones, and one vertex morph.",
    bones: [
      bone("center", "center", [0, 0, 0], -1, { tail: [0, 0.8, 0] }),
      bone("upperBody", "upperBody", [0, 0.8, 0], 0, { tail: [0, 0.55, 0] }),
      bone("head", "head", [0, 1.35, 0], 1, { tail: [0, 0.25, 0] })
    ],
    morphs: true,
    geometry: defaultGeometry(),
    materials: [defaultMaterial()],
    textures: []
  });
}

export function generateRestPosePmx(caseId) {
  const restCase = REST_POSE_CASES[caseId];
  if (!restCase) {
    throw new Error(`Unknown rest pose PMX case: ${caseId}`);
  }
  return generatePmx({
    name: `generated rest pose ${caseId}`,
    englishName: restCase.englishName,
    comment: "redistribution-safe rest pose regression fixture",
    englishComment: restCase.comment,
    bones: restCase.bones,
    morphs: false,
    geometry: defaultGeometry(),
    materials: [defaultMaterial()],
    textures: []
  });
}

export function generateVisualPmx(caseId) {
  const visualCase = VISUAL_CASES[caseId];
  if (!visualCase) {
    throw new Error(`Unknown visual PMX case: ${caseId}`);
  }
  return generatePmx({
    name: visualCase.name,
    englishName: visualCase.englishName,
    comment: visualCase.comment,
    englishComment: visualCase.englishComment,
    bones: [bone("center", "center", [0, 0, 0], -1, { tail: [0, 1, 0] })],
    morphs: visualCase.morphs ?? false,
    geometry: visualCase.geometry,
    materials: visualCase.materials,
    textures: visualCase.textures ?? [],
    textEncoding: "utf16le",
    indexSizes: {
      vertex: 4,
      texture: 4,
      material: 4,
      bone: 4,
      morph: 4,
      rigidBody: 4
    }
  });
}

export function restPoseCaseIds() {
  return Object.keys(REST_POSE_CASES);
}

export function visualCaseIds() {
  return Object.keys(VISUAL_CASES);
}

export function restPoseCaseMetadata(caseId) {
  const restCase = REST_POSE_CASES[caseId];
  if (!restCase) {
    throw new Error(`Unknown rest pose PMX case: ${caseId}`);
  }
  return { ...restCase };
}

export function generateSkinningPmx(caseId) {
  const skinCase = SKINNING_CASES[caseId];
  if (!skinCase) {
    throw new Error(`Unknown skinning PMX case: ${caseId}`);
  }
  return generatePmx({
    name: `generated skinning ${caseId}`,
    englishName: skinCase.englishName,
    comment: "redistribution-safe skinning fixture generated by scripts/fixtures/generate-minimal-pmx.mjs",
    englishComment: skinCase.comment,
    bones: skinCase.bones,
    morphs: false,
    geometry: skinCase.geometry,
    materials: [
      material("mat_body", "BodyMaterial", {
        diffuse: [0.9, 0.42, 0.12, 1],
        specular: [0.6, 0.3, 0.1],
        specularPower: 20,
        ambient: [0.3, 0.14, 0.04],
        flags: 0x11,
        edgeColor: [0.1, 0.05, 0.02, 1],
        edgeSize: 1.2,
        faceVertexCount: skinCase.faceVertexCount,
        comment: `skinning fixture material for ${caseId}`
      })
    ],
    textures: []
  });
}

export function skinningCaseIds() {
  return Object.keys(SKINNING_CASES);
}

export function generateSelfShadowPmx(caseId) {
  const shadowCase = SELF_SHADOW_CASES[caseId];
  if (!shadowCase) {
    throw new Error(`Unknown self-shadow PMX case: ${caseId}`);
  }
  return generatePmx({
    name: `generated self shadow ${caseId}`,
    englishName: shadowCase.englishName,
    comment: "redistribution-safe self shadow visual fixture",
    englishComment: shadowCase.comment,
    bones: shadowCase.bones,
    morphs: false,
    geometry: shadowCase.geometry,
    materials: shadowCase.materials,
    textures: shadowCase.textures ?? [],
    textEncoding: "utf16le",
    indexSizes: {
      vertex: 4,
      texture: 4,
      material: 4,
      bone: 4,
      morph: 4,
      rigidBody: 4
    }
  });
}

export function selfShadowCaseIds() {
  return Object.keys(SELF_SHADOW_CASES);
}

function generatePmx({
  name,
  englishName,
  comment,
  englishComment,
  bones,
  morphs,
  geometry,
  materials,
  textures,
  textEncoding = "utf8",
  indexSizes = defaultIndexSizes()
}) {
  const writer = new BinaryWriter(textEncoding);

  writer.bytes(new TextEncoder().encode("PMX "));
  writer.f32(2.0);
  writer.u8(8);
  writer.u8(textEncoding === "utf16le" ? 0 : 1);
  writer.u8(0);
  writer.u8(indexSizes.vertex);
  writer.u8(indexSizes.texture);
  writer.u8(indexSizes.material);
  writer.u8(indexSizes.bone);
  writer.u8(indexSizes.morph);
  writer.u8(indexSizes.rigidBody);

  writer.text(name);
  writer.text(englishName);
  writer.text(comment);
  writer.text(englishComment);

  writeVertices(writer, geometry.vertices, indexSizes);
  writeFaces(writer, geometry.indices, indexSizes);
  writeTextures(writer, textures);
  writeMaterials(writer, materials, indexSizes);
  writeBones(writer, bones, indexSizes);
  writeMorphs(writer, morphs, indexSizes);
  writeDisplayFrames(writer, bones, morphs, indexSizes);
  writer.i32(0);
  writer.i32(0);

  return writer.toUint8Array();
}

async function main() {
  if (process.argv.includes("--list-rest-pose-cases")) {
    console.log(restPoseCaseIds().join("\n"));
    return;
  }

  if (process.argv.includes("--list-visual-cases")) {
    console.log(visualCaseIds().join("\n"));
    return;
  }

  if (process.argv.includes("--list-self-shadow-cases")) {
    console.log(selfShadowCaseIds().join("\n"));
    return;
  }

  if (process.argv.includes("--all-rest-pose")) {
    const outputArgIndex = process.argv.indexOf("--output-dir");
    const outputDir =
      outputArgIndex >= 0 && process.argv[outputArgIndex + 1] !== undefined
        ? process.argv[outputArgIndex + 1]
        : REST_POSE_OUTPUT_DIR;
    for (const caseId of restPoseCaseIds()) {
      const outputPath = resolve(outputDir, `${caseId}.pmx`);
      const bytes = generateRestPosePmx(caseId);
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, bytes);
      console.log(`wrote ${bytes.byteLength} bytes to ${outputPath}`);
    }
    return;
  }

  if (process.argv.includes("--all-visual")) {
    const outputArgIndex = process.argv.indexOf("--output-dir");
    const outputDir =
      outputArgIndex >= 0 && process.argv[outputArgIndex + 1] !== undefined
        ? process.argv[outputArgIndex + 1]
        : VISUAL_OUTPUT_DIR;
    for (const caseId of visualCaseIds()) {
      const outputPath = resolve(outputDir, `${caseId}.pmx`);
      const bytes = await writeVisualPmx(caseId, outputPath);
      console.log(`wrote ${bytes.byteLength} bytes to ${outputPath}`);
    }
    return;
  }

  if (process.argv.includes("--all-skinning")) {
    const outputArgIndex = process.argv.indexOf("--output-dir");
    const outputDir =
      outputArgIndex >= 0 && process.argv[outputArgIndex + 1] !== undefined
        ? process.argv[outputArgIndex + 1]
        : SKINNING_OUTPUT_DIR;
    for (const caseId of skinningCaseIds()) {
      const outputPath = resolve(outputDir, `${caseId}.pmx`);
      const bytes = generateSkinningPmx(caseId);
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, bytes);
      console.log(`wrote ${bytes.byteLength} bytes to ${outputPath}`);
    }
    return;
  }

  if (process.argv.includes("--all-self-shadow")) {
    const outputArgIndex = process.argv.indexOf("--output-dir");
    const outputDir =
      outputArgIndex >= 0 && process.argv[outputArgIndex + 1] !== undefined
        ? process.argv[outputArgIndex + 1]
        : SELF_SHADOW_OUTPUT_DIR;
    for (const caseId of selfShadowCaseIds()) {
      const outputPath = resolve(outputDir, `${caseId}.pmx`);
      const bytes = generateSelfShadowPmx(caseId);
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, bytes);
      await writeSelfShadowAssets(caseId, dirname(outputPath));
      console.log(`wrote ${bytes.byteLength} bytes to ${outputPath}`);
    }
    return;
  }

  const caseArgIndex = process.argv.indexOf("--case");
  const visualCaseArgIndex = process.argv.indexOf("--visual-case");
  const skinningCaseArgIndex = process.argv.indexOf("--skinning-case");
  const selfShadowCaseArgIndex = process.argv.indexOf("--self-shadow-case");
  const outputArgIndex = process.argv.indexOf("--output");
  const outputPath =
    outputArgIndex >= 0 && process.argv[outputArgIndex + 1] !== undefined
      ? process.argv[outputArgIndex + 1]
      : DEFAULT_OUTPUT;
  const absoluteOutput = resolve(outputPath);
  const bytes =
    selfShadowCaseArgIndex >= 0 && process.argv[selfShadowCaseArgIndex + 1] !== undefined
      ? generateSelfShadowPmx(process.argv[selfShadowCaseArgIndex + 1])
      : skinningCaseArgIndex >= 0 && process.argv[skinningCaseArgIndex + 1] !== undefined
      ? generateSkinningPmx(process.argv[skinningCaseArgIndex + 1])
      : visualCaseArgIndex >= 0 && process.argv[visualCaseArgIndex + 1] !== undefined
      ? generateVisualPmx(process.argv[visualCaseArgIndex + 1])
      : caseArgIndex >= 0 && process.argv[caseArgIndex + 1] !== undefined
      ? generateRestPosePmx(process.argv[caseArgIndex + 1])
      : generateMinimalPmx();

  await mkdir(dirname(absoluteOutput), { recursive: true });
  await writeFile(absoluteOutput, bytes);
  if (visualCaseArgIndex >= 0 && process.argv[visualCaseArgIndex + 1] !== undefined) {
    await writeVisualAssets(process.argv[visualCaseArgIndex + 1], dirname(absoluteOutput));
  }
  if (selfShadowCaseArgIndex >= 0 && process.argv[selfShadowCaseArgIndex + 1] !== undefined) {
    await writeSelfShadowAssets(process.argv[selfShadowCaseArgIndex + 1], dirname(absoluteOutput));
  }
  console.log(`wrote ${bytes.byteLength} bytes to ${outputPath}`);
}

async function writeVisualPmx(caseId, outputPath) {
  const bytes = generateVisualPmx(caseId);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, bytes);
  await writeVisualAssets(caseId, dirname(outputPath));
  return bytes;
}

async function writeVisualAssets(caseId, outputDir) {
  const visualCase = VISUAL_CASES[caseId];
  if (!visualCase) {
    throw new Error(`Unknown visual PMX case: ${caseId}`);
  }
  for (const asset of visualCase.assets ?? []) {
    await writeFile(resolve(outputDir, asset.path), asset.bytes());
  }
}

async function writeSelfShadowAssets(caseId, outputDir) {
  const shadowCase = SELF_SHADOW_CASES[caseId];
  if (!shadowCase) {
    throw new Error(`Unknown self-shadow PMX case: ${caseId}`);
  }
  for (const asset of shadowCase.assets ?? []) {
    await writeFile(resolve(outputDir, asset.path), asset.bytes());
  }
}

function defaultIndexSizes() {
  return {
    vertex: 1,
    texture: 1,
    material: 1,
    bone: 1,
    morph: 1,
    rigidBody: 1
  };
}

function defaultGeometry() {
  return {
    vertices: [
    { position: [-0.4, 0, -0.25], uv: [0, 1], bone: 0 },
    { position: [0.4, 0, -0.25], uv: [1, 1], bone: 0 },
    { position: [0, 1.1, 0], uv: [0.5, 0], bone: 1 },
    { position: [0, 1.55, 0.25], uv: [0.5, 0.5], bone: 2 }
    ],
    indices: [
      0, 1, 2,
      0, 2, 3,
      1, 3, 2,
      0, 3, 1
    ]
  };
}

function boxGeometry({ min, max, bone, normalMode = "face", uvRect = [0, 0, 1, 1] }) {
  const [minX, minY, minZ] = min;
  const [maxX, maxY, maxZ] = max;
  const [u0, v0, u1, v1] = uvRect;
  const center = [(minX + maxX) * 0.5, (minY + maxY) * 0.5, (minZ + maxZ) * 0.5];
  const faces = [
    {
      normal: [0, 0, 1],
      corners: [
        [minX, minY, maxZ],
        [maxX, minY, maxZ],
        [maxX, maxY, maxZ],
        [minX, maxY, maxZ]
      ]
    },
    {
      normal: [0, 0, -1],
      corners: [
        [maxX, minY, minZ],
        [minX, minY, minZ],
        [minX, maxY, minZ],
        [maxX, maxY, minZ]
      ]
    },
    {
      normal: [-1, 0, 0],
      corners: [
        [minX, minY, minZ],
        [minX, minY, maxZ],
        [minX, maxY, maxZ],
        [minX, maxY, minZ]
      ]
    },
    {
      normal: [1, 0, 0],
      corners: [
        [maxX, minY, maxZ],
        [maxX, minY, minZ],
        [maxX, maxY, minZ],
        [maxX, maxY, maxZ]
      ]
    },
    {
      normal: [0, 1, 0],
      corners: [
        [minX, maxY, maxZ],
        [maxX, maxY, maxZ],
        [maxX, maxY, minZ],
        [minX, maxY, minZ]
      ]
    },
    {
      normal: [0, -1, 0],
      corners: [
        [minX, minY, minZ],
        [maxX, minY, minZ],
        [maxX, minY, maxZ],
        [minX, minY, maxZ]
      ]
    }
  ];
  const vertices = [];
  const indices = [];
  for (const face of faces) {
    const base = vertices.length;
    vertices.push(
      { position: face.corners[0], normal: boxNormal(face.corners[0], center, face.normal, normalMode), uv: [u0, v1], bone },
      { position: face.corners[1], normal: boxNormal(face.corners[1], center, face.normal, normalMode), uv: [u1, v1], bone },
      { position: face.corners[2], normal: boxNormal(face.corners[2], center, face.normal, normalMode), uv: [u1, v0], bone },
      { position: face.corners[3], normal: boxNormal(face.corners[3], center, face.normal, normalMode), uv: [u0, v0], bone }
    );
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { vertices, indices };
}

function boxNormal(corner, center, faceNormal, normalMode) {
  if (normalMode !== "corner") {
    return faceNormal;
  }
  return normalizeVector([
    corner[0] - center[0],
    corner[1] - center[1],
    corner[2] - center[2]
  ]);
}

function normalizeVector(value) {
  const length = Math.hypot(value[0], value[1], value[2]) || 1;
  return [value[0] / length, value[1] / length, value[2] / length];
}

// Simple quad fully weighted to one bone (BDEF1)
function singleBoneQuadGeometry(boneIndex) {
  return {
    vertices: [
      { position: [-0.3, 0, 0], normal: [0, 0, 1], uv: [0, 1], skin: { type: 0, bones: [boneIndex], weights: [1] } },
      { position: [0.3, 0, 0], normal: [0, 0, 1], uv: [1, 1], skin: { type: 0, bones: [boneIndex], weights: [1] } },
      { position: [0.3, 1, 0], normal: [0, 0, 1], uv: [1, 0], skin: { type: 0, bones: [boneIndex], weights: [1] } },
      { position: [-0.3, 1, 0], normal: [0, 0, 1], uv: [0, 0], skin: { type: 0, bones: [boneIndex], weights: [1] } }
    ],
    indices: [0, 1, 2, 0, 2, 3]
  };
}

// Cylinder with smooth skinning between 2 or 4 bones
function cylinderGeometry({ radius, height, rings, segments, bone0, bone1, bone2, bone3, skinType }) {
  const vertices = [];
  const indices = [];
  const hasFour = bone2 !== undefined && bone3 !== undefined;
  const joint = [0, height * 0.5, 0]; // midpoint between bone0 and bone1

  for (let ring = 0; ring <= rings; ring++) {
    const t = ring / rings;
    const y = height * t;

    for (let seg = 0; seg < segments; seg++) {
      const angle = (seg / segments) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const normal = normalizeVector([Math.cos(angle), 0, Math.sin(angle)]);
      const uv = [seg / segments, 1 - t];

      let skin;
      if (skinType === 0) {
        skin = { type: 0, bones: [bone0], weights: [1] };
      } else if (skinType === 1) {
        // BDEF2: blend bone0 and bone1 by height
        skin = { type: 1, bones: [bone0, bone1], weights: [1 - t, t] };
      } else if (skinType === 3) {
        // SDEF: two-bone with rotation center at joint
        skin = {
          type: 3,
          bones: [bone0, bone1],
          weights: [1 - t, t],
          sdefC: [...joint],
          sdefR0: [...joint],
          sdefR1: [...joint]
        };
      } else {
        // BDEF4 (type 2) or QDEF (type 4): blend across 4 bones
        const b0 = bone0, b1 = bone1, b2 = hasFour ? bone2 : bone0, b3 = hasFour ? bone3 : bone1;
        // Smooth weight distribution across 4 bones
        const w0 = Math.max(0, 1 - t * rings / 2);
        const w1 = Math.max(0, t * rings / 2 < 1 ? t * rings / 2 : 2 - t * rings / 2);
        const w2 = Math.max(0, t * rings / 2 - 1 < 1 ? Math.max(0, t * rings / 2 - 1) : 2 - (t * rings / 2 - 1));
        const w3 = Math.max(0, t * rings / 2 - 2);
        const wSum = w0 + w1 + w2 + w3 || 1;
        skin = {
          type: skinType,
          bones: [b0, b1, b2, b3],
          weights: [w0 / wSum, w1 / wSum, w2 / wSum, w3 / wSum]
        };
      }

      vertices.push({ position: [x, y, z], normal, uv, skin });
    }
  }

  // Triangulate rings
  for (let ring = 0; ring < rings; ring++) {
    for (let seg = 0; seg < segments; seg++) {
      const a = ring * segments + seg;
      const b = ring * segments + (seg + 1) % segments;
      const c = (ring + 1) * segments + seg;
      const d = (ring + 1) * segments + (seg + 1) % segments;
      indices.push(a, b, c, b, d, c);
    }
  }

  return { vertices, indices };
}

// One PMX with 5 quads: one quad per deform type (BDEF1, BDEF2, BDEF4, SDEF, QDEF)
function mixedSkinGeometry() {
  const joint = [0, 0.5, 0];
  const sections = [
    // BDEF1: fully on bone 0
    [
      { position: [-0.3, 0, 0.8], normal: [0, 0, 1], uv: [0, 1], skin: { type: 0, bones: [0], weights: [1] } },
      { position: [0.3, 0, 0.8], normal: [0, 0, 1], uv: [1, 1], skin: { type: 0, bones: [0], weights: [1] } },
      { position: [0.3, 0.5, 0.8], normal: [0, 0, 1], uv: [1, 0], skin: { type: 0, bones: [0], weights: [1] } },
      { position: [-0.3, 0.5, 0.8], normal: [0, 0, 1], uv: [0, 0], skin: { type: 0, bones: [0], weights: [1] } }
    ],
    // BDEF2: blend bone 0 and bone 1
    [
      { position: [-0.3, 0, 0.3], normal: [0, 0, 1], uv: [0, 1], skin: { type: 1, bones: [0, 1], weights: [0.8, 0.2] } },
      { position: [0.3, 0, 0.3], normal: [0, 0, 1], uv: [1, 1], skin: { type: 1, bones: [0, 1], weights: [0.8, 0.2] } },
      { position: [0.3, 0.5, 0.3], normal: [0, 0, 1], uv: [1, 0], skin: { type: 1, bones: [0, 1], weights: [0.4, 0.6] } },
      { position: [-0.3, 0.5, 0.3], normal: [0, 0, 1], uv: [0, 0], skin: { type: 1, bones: [0, 1], weights: [0.4, 0.6] } }
    ],
    // BDEF4: blend four bones
    [
      { position: [-0.3, 0, -0.2], normal: [0, 0, 1], uv: [0, 1], skin: { type: 2, bones: [0, 1, 2, 3], weights: [0.6, 0.2, 0.1, 0.1] } },
      { position: [0.3, 0, -0.2], normal: [0, 0, 1], uv: [1, 1], skin: { type: 2, bones: [0, 1, 2, 3], weights: [0.6, 0.2, 0.1, 0.1] } },
      { position: [0.3, 0.5, -0.2], normal: [0, 0, 1], uv: [1, 0], skin: { type: 2, bones: [0, 1, 2, 3], weights: [0.1, 0.1, 0.2, 0.6] } },
      { position: [-0.3, 0.5, -0.2], normal: [0, 0, 1], uv: [0, 0], skin: { type: 2, bones: [0, 1, 2, 3], weights: [0.1, 0.1, 0.2, 0.6] } }
    ],
    // SDEF: two-bone with C/R0/R1
    [
      { position: [-0.3, 0, -0.7], normal: [0, 0, 1], uv: [0, 1], skin: { type: 3, bones: [0, 1], weights: [0.9, 0.1], sdefC: [...joint], sdefR0: [...joint], sdefR1: [...joint] } },
      { position: [0.3, 0, -0.7], normal: [0, 0, 1], uv: [1, 1], skin: { type: 3, bones: [0, 1], weights: [0.9, 0.1], sdefC: [...joint], sdefR0: [...joint], sdefR1: [...joint] } },
      { position: [0.3, 0.5, -0.7], normal: [0, 0, 1], uv: [1, 0], skin: { type: 3, bones: [0, 1], weights: [0.1, 0.9], sdefC: [...joint], sdefR0: [...joint], sdefR1: [...joint] } },
      { position: [-0.3, 0.5, -0.7], normal: [0, 0, 1], uv: [0, 0], skin: { type: 3, bones: [0, 1], weights: [0.1, 0.9], sdefC: [...joint], sdefR0: [...joint], sdefR1: [...joint] } }
    ],
    // QDEF: four-bone dual quaternion (same binary as BDEF4)
    [
      { position: [-0.3, 0, -1.2], normal: [0, 0, 1], uv: [0, 1], skin: { type: 4, bones: [0, 1, 2, 3], weights: [0.6, 0.2, 0.1, 0.1] } },
      { position: [0.3, 0, -1.2], normal: [0, 0, 1], uv: [1, 1], skin: { type: 4, bones: [0, 1, 2, 3], weights: [0.6, 0.2, 0.1, 0.1] } },
      { position: [0.3, 0.5, -1.2], normal: [0, 0, 1], uv: [1, 0], skin: { type: 4, bones: [0, 1, 2, 3], weights: [0.1, 0.1, 0.2, 0.6] } },
      { position: [-0.3, 0.5, -1.2], normal: [0, 0, 1], uv: [0, 0], skin: { type: 4, bones: [0, 1, 2, 3], weights: [0.1, 0.1, 0.2, 0.6] } }
    ]
  ];

  const vertices = [];
  const indices = [];
  for (const section of sections) {
    const base = vertices.length;
    vertices.push(...section);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { vertices, indices };
}

function mergeGeometries(geometries) {
  const vertices = [];
  const indices = [];
  for (const geometry of geometries) {
    const base = vertices.length;
    vertices.push(...geometry.vertices);
    indices.push(...geometry.indices.map((index) => index + base));
  }
  return { vertices, indices };
}

function selfShadowCase({ receiverFlags, casterFlags, probeCaster, probeReceiver, comment }) {
  const geometries = [
    boxGeometry({
      min: [-0.9, -0.04, -0.55],
      max: [0.9, 0.02, 0.55],
      bone: 0,
      normalMode: "face"
    }),
    transformGeometry(
      boxGeometry({
        min: [-0.16, 0.02, -0.08],
        max: [0.16, 1.0, 0.08],
        bone: 0,
        normalMode: "corner"
      }),
      { rotateY: 0.48, rotateX: -0.08, translate: [-0.22, 0, -0.04] }
    )
  ];
  const materials = [
    material("mat_receiver", "Receiver", {
      diffuse: [0.86, 0.86, 0.82, 1],
      specular: [0.02, 0.02, 0.02],
      ambient: [0.28, 0.28, 0.26],
      edgeColor: [0, 0, 0, 0],
      edgeSize: 0,
      toonShared: 0,
      toonTextureIndex: 0,
      flags: receiverFlags,
      faceVertexCount: 36,
      comment: "receiver material under self-shadow test"
    }),
    material("mat_visible_caster", "VisibleCaster", {
      diffuse: [0.9, 0.34, 0.18, 1],
      specular: [0.04, 0.02, 0.01],
      ambient: [0.28, 0.1, 0.06],
      edgeColor: [0, 0, 0, 0],
      edgeSize: 0,
      toonShared: 0,
      toonTextureIndex: 0,
      flags: casterFlags,
      faceVertexCount: 36,
      comment: "visible caster material under self-shadow test"
    })
  ];

  if (probeCaster) {
    geometries.push(
      transformGeometry(
        boxGeometry({
          min: [-0.04, 0.02, -0.04],
          max: [0.04, 0.16, 0.04],
          bone: 0,
          normalMode: "corner"
        }),
        { translate: [2.8, 0, 1.8] }
      )
    );
    materials.push(material("mat_probe_caster", "ProbeCaster", {
      diffuse: [0.2, 0.2, 0.2, 1],
      specular: [0, 0, 0],
      ambient: [0.05, 0.05, 0.05],
      edgeColor: [0, 0, 0, 0],
      edgeSize: 0,
      toonShared: 0,
      toonTextureIndex: 0,
      flags: 0x05,
      faceVertexCount: 36,
      comment: "off-camera material that may cast shadows"
    }));
  }

  if (probeReceiver) {
    geometries.push(
      transformGeometry(
        boxGeometry({
          min: [-0.06, -0.04, -0.06],
          max: [0.06, 0.02, 0.06],
          bone: 0,
          normalMode: "face"
        }),
        { translate: [-2.8, 0, -1.8] }
      )
    );
    materials.push(material("mat_probe_receiver", "ProbeReceiver", {
      diffuse: [0.7, 0.7, 0.7, 1],
      specular: [0, 0, 0],
      ambient: [0.2, 0.2, 0.2],
      edgeColor: [0, 0, 0, 0],
      edgeSize: 0,
      toonShared: 0,
      toonTextureIndex: 0,
      flags: 0x09,
      faceVertexCount: 36,
      comment: "off-camera material that may receive shadows"
    }));
  }

  return {
    englishName: "GeneratedSelfShadow",
    comment,
    bones: [bone("center", "center", [0, 0, 0], -1, { tail: [0, 1, 0] })],
    geometry: mergeGeometries(geometries),
    textures: ["self-shadow-black-toon.png"],
    assets: [
      {
        path: "self-shadow-black-toon.png",
        bytes: () => selfShadowBlackToonPng()
      }
    ],
    materials
  };
}

function selfShadowBodyCase({ receiverFlags, casterFlags, comment, customToonTexture = false }) {
  const body = transformGeometry(
    boxGeometry({
      min: [-0.55, 0.28, -0.42],
      max: [0.55, 0.34, 0.42],
      bone: 0,
      normalMode: "face"
    }),
    { rotateY: 0.08 }
  );
  const protrudingCaster = transformGeometry(
    boxGeometry({
      min: [-0.1, 0.34, -0.06],
      max: [0.1, 1.0, 0.06],
      bone: 0,
      normalMode: "corner"
    }),
    { rotateY: 0.42, rotateX: -0.08, translate: [0.08, 0, -0.02] }
  );

  return {
    englishName: "GeneratedSelfShadowBody",
    comment,
    bones: [bone("center", "center", [0, 0, 0], -1, { tail: [0, 1, 0] })],
    geometry: mergeGeometries([body, protrudingCaster]),
    textures: customToonTexture ? ["self-shadow-black-toon.png"] : [],
    assets: customToonTexture
      ? [
          {
            path: "self-shadow-black-toon.png",
            bytes: () => selfShadowBlackToonPng()
          }
        ]
      : [],
    materials: [
      material("mat_body_receiver", "BodyReceiver", {
        diffuse: [0.92, 0.78, 0.58, 1],
        specular: [0.04, 0.03, 0.02],
        ambient: [0.32, 0.22, 0.14],
        edgeColor: [0, 0, 0, 0],
        edgeSize: 0,
        ...(customToonTexture ? { toonShared: 0, toonTextureIndex: 0 } : {}),
        flags: receiverFlags,
        faceVertexCount: body.indices.length,
        comment: "body receiver material for in-model self-shadow test"
      }),
      material("mat_protruding_caster", "ProtrudingCaster", {
        diffuse: [0.36, 0.44, 0.78, 1],
        specular: [0.02, 0.03, 0.06],
        ambient: [0.1, 0.12, 0.24],
        edgeColor: [0, 0, 0, 0],
        edgeSize: 0,
        ...(customToonTexture ? { toonShared: 0, toonTextureIndex: 0 } : {}),
        flags: casterFlags,
        faceVertexCount: protrudingCaster.indices.length,
        comment: "visible in-model caster material for self-shadow test"
      })
    ]
  };
}

function selfShadowSdefCase() {
  const receiver = boxGeometry({
    min: [-0.9, -0.04, -0.55],
    max: [0.9, 0.02, 0.55],
    bone: 0,
    normalMode: "face"
  });
  const caster = transformGeometry(
    cylinderGeometry({
      radius: 0.13,
      height: 1.0,
      rings: 5,
      segments: 12,
      bone0: 0,
      bone1: 1,
      skinType: 3
    }),
    { rotateY: 0.48, rotateX: -0.08, translate: [-0.18, 0.02, -0.04] }
  );
  return {
    englishName: "GeneratedSelfShadowSdefDepth",
    comment: "self shadow fixture requiring SDEF-compatible shadow depth material",
    bones: [
      bone("lowerArm", "lowerArm", [0, 0, 0], -1, { tail: [0, 1, 0] }),
      bone("upperArm", "upperArm", [0, 1, 0], 0, { tail: [0, 0.4, 0] })
    ],
    geometry: mergeGeometries([receiver, caster]),
    materials: [
      material("mat_receiver", "Receiver", {
        diffuse: [0.86, 0.86, 0.82, 1],
        specular: [0.02, 0.02, 0.02],
        ambient: [0.28, 0.28, 0.26],
        edgeColor: [0, 0, 0, 0],
        edgeSize: 0,
        flags: 0x09,
        faceVertexCount: receiver.indices.length,
        comment: "receiver material for SDEF shadow depth test"
      }),
      material("mat_sdef_caster", "SdefCaster", {
        diffuse: [0.18, 0.45, 0.86, 1],
        specular: [0.02, 0.03, 0.05],
        ambient: [0.06, 0.14, 0.28],
        edgeColor: [0, 0, 0, 0],
        edgeSize: 0,
        flags: 0x05,
        faceVertexCount: caster.indices.length,
        comment: "SDEF caster material for shadow depth test"
      })
    ]
  };
}

function transformGeometry(geometry, transform) {
  const cosX = Math.cos(transform.rotateX ?? 0);
  const sinX = Math.sin(transform.rotateX ?? 0);
  const cosY = Math.cos(transform.rotateY ?? 0);
  const sinY = Math.sin(transform.rotateY ?? 0);
  const translate = transform.translate ?? [0, 0, 0];
  return {
    vertices: geometry.vertices.map((vertex) => ({
      ...vertex,
      position: rotateXThenYThenTranslate(vertex.position, cosX, sinX, cosY, sinY, translate),
      normal: rotateXThenYThenTranslate(vertex.normal ?? [0, 0, 1], cosX, sinX, cosY, sinY, [0, 0, 0])
    })),
    indices: [...geometry.indices]
  };
}

function rotateXThenYThenTranslate(value, cosX, sinX, cosY, sinY, translate) {
  const [x, y, z] = value;
  const rotatedY = y * cosX - z * sinX;
  const rotatedZ = y * sinX + z * cosX;
  return [
    x * cosY + rotatedZ * sinY + translate[0],
    rotatedY + translate[1],
    -x * sinY + rotatedZ * cosY + translate[2]
  ];
}

function alphaCutoutPng() {
  const size = 96;
  const png = new PNG({ width: size, height: size });
  const center = (size - 1) * 0.5;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const u = x / (size - 1);
      const v = y / (size - 1);
      const stripe = Math.abs(u - v) < 0.09;
      const dx = x - center;
      const dy = y - center;
      const circle = Math.hypot(dx, dy) < size * 0.22;
      const transparent = stripe || circle;
      png.data[index] = 45;
      png.data[index + 1] = 158;
      png.data[index + 2] = 76;
      png.data[index + 3] = transparent ? 0 : 255;
    }
  }
  return PNG.sync.write(png);
}

function atlasPaddingPng() {
  const size = 96;
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const u = x / (size - 1);
      const v = y / (size - 1);
      const usedRegion = u >= 0.3 && u <= 0.7 && v >= 0.3 && v <= 0.7;
      png.data[index] = usedRegion ? 238 : 120;
      png.data[index + 1] = usedRegion ? 179 : 84;
      png.data[index + 2] = usedRegion ? 64 : 180;
      png.data[index + 3] = usedRegion ? 255 : 0;
    }
  }
  return PNG.sync.write(png);
}

function uvOrientationPng() {
  const size = 96;
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const u = x / (size - 1);
      const v = y / (size - 1);
      const left = u < 0.5;
      const top = v < 0.5;
      const border = x < 5 || y < 5 || x >= size - 5 || y >= size - 5;
      const color = border
        ? [20, 20, 20]
        : left && top
        ? [230, 48, 54]
        : !left && top
        ? [48, 94, 230]
        : left
        ? [42, 178, 84]
        : [238, 196, 54];
      png.data[index] = color[0];
      png.data[index + 1] = color[1];
      png.data[index + 2] = color[2];
      png.data[index + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

function sphereRadialPng(centerColor, edgeColor) {
  const size = 96;
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const u = x / (size - 1) - 0.5;
      const v = y / (size - 1) - 0.5;
      const t = Math.min(1, Math.hypot(u, v) * 1.75);
      png.data[index] = Math.round(centerColor[0] * (1 - t) + edgeColor[0] * t);
      png.data[index + 1] = Math.round(centerColor[1] * (1 - t) + edgeColor[1] * t);
      png.data[index + 2] = Math.round(centerColor[2] * (1 - t) + edgeColor[2] * t);
      png.data[index + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

function toonRampPng() {
  const width = 16;
  const height = 16;
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    const t = y / (height - 1);
    const color = t < 0.34
      ? [255, 244, 172]
      : t < 0.72
      ? [226, 142, 62]
      : [112, 58, 38];
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      png.data[index] = color[0];
      png.data[index + 1] = color[1];
      png.data[index + 2] = color[2];
      png.data[index + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

function softAlphaOverlayPng(color) {
  const size = 96;
  const png = new PNG({ width: size, height: size });
  writeSoftAlphaPixels(png.data, size, size, color);
  return PNG.sync.write(png);
}

function selfShadowBlackToonPng() {
  const size = 32;
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y += 1) {
    const t = y / (size - 1);
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      if (t < 0.35) {
        png.data[index] = 255;
        png.data[index + 1] = 255;
        png.data[index + 2] = 255;
      } else if (t < 0.7) {
        png.data[index] = 198;
        png.data[index + 1] = 166;
        png.data[index + 2] = 128;
      } else {
        png.data[index] = 4;
        png.data[index + 1] = 4;
        png.data[index + 2] = 4;
      }
      png.data[index + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

function softAlphaOverlayTga(color) {
  const width = 96;
  const height = 96;
  const header = new Uint8Array(18);
  header[2] = 2;
  header[12] = width & 0xff;
  header[13] = (width >> 8) & 0xff;
  header[14] = height & 0xff;
  header[15] = (height >> 8) & 0xff;
  header[16] = 32;
  header[17] = 0x28;
  const rgba = new Uint8Array(width * height * 4);
  writeSoftAlphaPixels(rgba, width, height, color);
  const bytes = new Uint8Array(header.length + rgba.length);
  bytes.set(header, 0);
  for (let index = 0; index < width * height; index += 1) {
    const source = index * 4;
    const target = header.length + source;
    bytes[target] = rgba[source + 2];
    bytes[target + 1] = rgba[source + 1];
    bytes[target + 2] = rgba[source];
    bytes[target + 3] = rgba[source + 3];
  }
  return bytes;
}

function writeSoftAlphaPixels(data, width, height, color) {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const u = x / (width - 1);
      const v = y / (height - 1);
      const band = Math.exp(-Math.pow((v - (0.28 + u * 0.38)) / 0.13, 2));
      const fade = Math.max(0, 1 - Math.abs(u - 0.5) * 1.35);
      const alpha = Math.round(205 * band * fade);
      data[index] = color[0];
      data[index + 1] = color[1];
      data[index + 2] = color[2];
      data[index + 3] = alpha;
    }
  }
}

function writeVertices(writer, vertices, indexSizes) {
  writer.i32(vertices.length);
  for (const vertex of vertices) {
    writer.vec3(vertex.position);
    writer.vec3(vertex.normal ?? [0, 0, 1]);
    writer.vec2(vertex.uv);
    const skin = vertex.skin;
    if (!skin) {
      // Legacy path: BDEF1 using vertex.bone
      writer.u8(0);
      writer.index(vertex.bone ?? 0, indexSizes.bone);
    } else {
      const { type, bones, weights, sdefC, sdefR0, sdefR1 } = skin;
      writer.u8(type);
      switch (type) {
        case 0: // BDEF1
          writer.index(bones[0], indexSizes.bone);
          break;
        case 1: // BDEF2
        case 3: // SDEF
          writer.index(bones[0], indexSizes.bone);
          writer.index(bones[1], indexSizes.bone);
          writer.f32(weights[0]);
          if (type === 3) {
            writer.vec3(sdefC ?? [0, 0, 0]);
            writer.vec3(sdefR0 ?? [0, 0, 0]);
            writer.vec3(sdefR1 ?? [0, 0, 0]);
          }
          break;
        case 2: // BDEF4
        case 4: // QDEF
          for (let i = 0; i < 4; i++) writer.index(bones[i] ?? 0, indexSizes.bone);
          for (let i = 0; i < 4; i++) writer.f32(weights[i] ?? 0);
          break;
        default:
          throw new Error(`Unsupported PMX vertex weight type in fixture: ${type}`);
      }
    }
    writer.f32(vertex.edgeScale ?? 1);
  }
}

function writeFaces(writer, indices, indexSizes) {
  writer.i32(indices.length);
  for (const index of indices) {
    writer.vertexIndex(index, indexSizes.vertex);
  }
}

function writeTextures(writer, textures) {
  writer.i32(textures.length);
  for (const texture of textures) {
    writer.text(texture);
  }
}

function defaultMaterial() {
  return material("mat_body", "BodyMaterial", {
    diffuse: [0.65, 0.72, 0.85, 1],
    specular: [0.08, 0.08, 0.08],
    ambient: [0.25, 0.25, 0.28],
    flags: 0x01,
    edgeColor: [0, 0, 0, 1],
    edgeSize: 0,
    faceVertexCount: 12,
    comment: "single deterministic material without texture references"
  });
}

function material(name, englishName, options) {
  return {
    name,
    englishName,
    specularPower: 8,
    textureIndex: -1,
    sphereTextureIndex: -1,
    sphereMode: 0,
    toonShared: 0,
    toonTextureIndex: -1,
    ...options
  };
}

function writeMaterials(writer, materials, indexSizes) {
  writer.i32(materials.length);
  for (const material of materials) {
    writer.text(material.name);
    writer.text(material.englishName);
    writer.vec4(material.diffuse);
    writer.vec3(material.specular);
    writer.f32(material.specularPower);
    writer.vec3(material.ambient);
    writer.u8(material.flags);
    writer.vec4(material.edgeColor);
    writer.f32(material.edgeSize);
    writer.index(material.textureIndex, indexSizes.texture);
    writer.index(material.sphereTextureIndex, indexSizes.texture);
    writer.u8(material.sphereMode);
    writer.u8(material.toonShared);
    if (material.toonShared) {
      writer.u8(material.toonTextureIndex);
    } else {
      writer.index(material.toonTextureIndex, indexSizes.texture);
    }
    writer.text(material.comment);
    writer.i32(material.faceVertexCount);
  }
}

function writeBones(writer, bones, indexSizes) {
  writer.i32(bones.length);
  for (const bone of bones) {
    writer.text(bone.name);
    writer.text(bone.englishName);
    writer.vec3(bone.position);
    writer.index(bone.parent, indexSizes.bone);
    writer.i32(0);
    writer.u16(bone.flags ?? BASE_BONE_FLAGS);
    writer.vec3(bone.tail ?? [0, 0.4, 0]);
    if (bone.appendTransform) {
      writer.index(bone.appendTransform.parent, indexSizes.bone);
      writer.f32(bone.appendTransform.weight);
    }
    if (bone.fixedAxis) {
      writer.vec3(bone.fixedAxis);
    }
    if (bone.localAxis) {
      writer.vec3(bone.localAxis.x);
      writer.vec3(bone.localAxis.z);
    }
    if (bone.ik) {
      writer.index(bone.ik.target, indexSizes.bone);
      writer.i32(bone.ik.loopCount);
      writer.f32(bone.ik.limitAngle);
      writer.i32(bone.ik.links.length);
      for (const link of bone.ik.links) {
        writer.index(link.bone, indexSizes.bone);
        writer.u8(link.limits ? 1 : 0);
        if (link.limits) {
          writer.vec3(link.limits.lower);
          writer.vec3(link.limits.upper);
        }
      }
    }
  }
}

function writeMorphs(writer, enabled, indexSizes) {
  if (Array.isArray(enabled)) {
    writer.i32(enabled.length);
    for (const morph of enabled) {
      writeCustomMorph(writer, morph, indexSizes);
    }
    return;
  }
  if (!enabled) {
    writer.i32(0);
    return;
  }
  writer.i32(1);
  writer.text("tiny_raise");
  writer.text("TinyRaise");
  writer.u8(1);
  writer.u8(1);
  writer.i32(1);
  writer.index(3, indexSizes.vertex);
  writer.vec3([0, 0.05, 0]);
}

function countMorphs(enabled) {
  if (Array.isArray(enabled)) {
    return enabled.length;
  }
  return enabled ? 1 : 0;
}

function writeCustomMorph(writer, morph, indexSizes) {
  writer.text(morph.name);
  writer.text(morph.englishName);
  writer.u8(morph.panel ?? 4);
  switch (morph.type) {
    case "material":
      writer.u8(8);
      writer.i32(morph.offsets.length);
      for (const offset of morph.offsets) {
        writer.index(offset.materialIndex, indexSizes.material);
        writer.u8(offset.operation === "multiply" ? 0 : 1);
        writer.vec4(offset.diffuse ?? [0, 0, 0, 0]);
        writer.vec3(offset.specular ?? [0, 0, 0]);
        writer.f32(offset.specularPower ?? 0);
        writer.vec3(offset.ambient ?? [0, 0, 0]);
        writer.vec4(offset.edgeColor ?? [0, 0, 0, 0]);
        writer.f32(offset.edgeSize ?? 0);
        writer.vec4(offset.textureFactor ?? [0, 0, 0, 0]);
        writer.vec4(offset.sphereTextureFactor ?? [0, 0, 0, 0]);
        writer.vec4(offset.toonTextureFactor ?? [0, 0, 0, 0]);
      }
      return;
    default:
      throw new Error(`Unsupported custom PMX morph type: ${morph.type}`);
  }
}

function writeDisplayFrames(writer, bones, morphs, indexSizes) {
  writer.i32(2);
  writer.text("Root");
  writer.text("Root");
  writer.u8(1);
  writer.i32(bones.length);
  for (let boneIndex = 0; boneIndex < bones.length; boneIndex += 1) {
    writer.u8(0);
    writer.index(boneIndex, indexSizes.bone);
  }

  writer.text("表情");
  writer.text("Exp");
  writer.u8(1);
  const morphCount = countMorphs(morphs);
  writer.i32(morphCount);
  for (let morphIndex = 0; morphIndex < morphCount; morphIndex += 1) {
    writer.u8(1);
    writer.index(morphIndex, indexSizes.morph);
  }
}

function bone(name, englishName, position, parent, options = {}) {
  return {
    name,
    englishName,
    position,
    parent,
    ...options
  };
}

class BinaryWriter {
  #bytes = [];
  #encoder = new TextEncoder();
  #textEncoding;

  constructor(textEncoding = "utf8") {
    this.#textEncoding = textEncoding;
  }

  bytes(value) {
    this.#bytes.push(...value);
  }

  u8(value) {
    this.#bytes.push(value & 0xff);
  }

  i8(value) {
    this.u8(value);
  }

  vertexIndex(value, size) {
    switch (size) {
      case 1:
        this.u8(value);
        break;
      case 2:
        this.u16(value);
        break;
      case 4:
        this.i32(value);
        break;
      default:
        throw new Error(`Unsupported PMX vertex index size: ${size}`);
    }
  }

  index(value, size) {
    switch (size) {
      case 1:
        this.i8(value);
        break;
      case 2:
        this.i16(value);
        break;
      case 4:
        this.i32(value);
        break;
      default:
        throw new Error(`Unsupported PMX index size: ${size}`);
    }
  }

  u16(value) {
    const buffer = new ArrayBuffer(2);
    new DataView(buffer).setUint16(0, value, true);
    this.bytes(new Uint8Array(buffer));
  }

  i16(value) {
    const buffer = new ArrayBuffer(2);
    new DataView(buffer).setInt16(0, value, true);
    this.bytes(new Uint8Array(buffer));
  }

  i32(value) {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setInt32(0, value, true);
    this.bytes(new Uint8Array(buffer));
  }

  f32(value) {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setFloat32(0, value, true);
    this.bytes(new Uint8Array(buffer));
  }

  vec2(value) {
    this.f32(value[0]);
    this.f32(value[1]);
  }

  vec3(value) {
    this.f32(value[0]);
    this.f32(value[1]);
    this.f32(value[2]);
  }

  vec4(value) {
    this.f32(value[0]);
    this.f32(value[1]);
    this.f32(value[2]);
    this.f32(value[3]);
  }

  text(value) {
    const encoded =
      this.#textEncoding === "utf16le" ? encodeUtf16Le(value) : this.#encoder.encode(value);
    this.i32(encoded.byteLength);
    this.bytes(encoded);
  }

  toUint8Array() {
    return new Uint8Array(this.#bytes);
  }
}

function encodeUtf16Le(value) {
  const encoded = new Uint8Array(value.length * 2);
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    encoded[index * 2] = code & 0xff;
    encoded[index * 2 + 1] = code >> 8;
  }
  return encoded;
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
const modulePath = fileURLToPath(import.meta.url);

if (entryPath === modulePath) {
  await main();
}
