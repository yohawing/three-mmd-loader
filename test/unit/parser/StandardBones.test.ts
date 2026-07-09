import { describe, expect, it } from "vitest";
import {
  detectStandardBones,
  getStandardBoneDefinitions
} from "../../../src/parser/skeleton/index.js";
import type { BoneData } from "../../../src/parser/model/modelTypes.js";

function stubBone(name: string, englishName = ""): BoneData {
  return {
    name,
    englishName,
    parentIndex: -1,
    layer: 0,
    position: [0, 0, 0],
    tailIndex: -1,
    tailPosition: undefined,
    flags: {
      indexedTail: false,
      rotatable: true,
      translatable: true,
      visible: true,
      enabled: true,
      ik: false,
      appendLocal: false,
      appendRotate: false,
      appendTranslate: false,
      fixedAxis: false,
      localAxis: false,
      transformAfterPhysics: false,
      externalParentTransform: false
    }
  };
}

const fullStandardBones: BoneData[] = [
  stubBone("全ての親", "mother"),
  stubBone("センター", "center"),
  stubBone("上半身", "upper body"),
  stubBone("下半身", "lower body"),
  stubBone("首", "neck"),
  stubBone("頭", "head"),
  stubBone("左肩", "shoulder_L"),
  stubBone("左腕", "arm_L"),
  stubBone("左ひじ", "elbow_L"),
  stubBone("左手首", "wrist_L"),
  stubBone("右肩", "shoulder_R"),
  stubBone("右腕", "arm_R"),
  stubBone("右ひじ", "elbow_R"),
  stubBone("右手首", "wrist_R"),
  stubBone("左足", "leg_L"),
  stubBone("左ひざ", "knee_L"),
  stubBone("左足首", "ankle_L"),
  stubBone("右足", "leg_R"),
  stubBone("右ひざ", "knee_R"),
  stubBone("右足首", "ankle_R"),
  stubBone("左足ＩＫ", "leg IK_L"),
  stubBone("右足ＩＫ", "leg IK_R"),
  stubBone("左つま先ＩＫ", "toe IK_L"),
  stubBone("右つま先ＩＫ", "toe IK_R")
];

const semiStandardBones: BoneData[] = [
  stubBone("グルーブ", "groove"),
  stubBone("腰", "waist"),
  stubBone("上半身2", "upper body2"),
  stubBone("左腕捩", "arm twist_L"),
  stubBone("右腕捩", "arm twist_R"),
  stubBone("左手捩", "wrist twist_L"),
  stubBone("右手捩", "wrist twist_R"),
  stubBone("左肩P", "shoulder P_L"),
  stubBone("右肩P", "shoulder P_R"),
  stubBone("左足IK親", "leg IK parent_L"),
  stubBone("右足IK親", "leg IK parent_R"),
  stubBone("左足先EX", "toe EX_L"),
  stubBone("右足先EX", "toe EX_R"),
  stubBone("両目", "eyes"),
  stubBone("左目", "eye_L"),
  stubBone("右目", "eye_R")
];

describe("getStandardBoneDefinitions", () => {
  it("returns non-empty definitions with both tiers", () => {
    const defs = getStandardBoneDefinitions();
    expect(defs.length).toBeGreaterThan(0);
    expect(defs.some((d) => d.tier === "standard")).toBe(true);
    expect(defs.some((d) => d.tier === "semi-standard")).toBe(true);
  });
});

describe("detectStandardBones", () => {
  it("detects full standard skeleton from Japanese names", () => {
    const result = detectStandardBones(fullStandardBones);
    expect(result.hasStandardSkeleton).toBe(true);
    expect(result.standard.present.length).toBe(23);
    expect(result.standard.missing).toHaveLength(0);
  });

  it("detects semi-standard bones from Japanese names", () => {
    const bones = [...fullStandardBones, ...semiStandardBones];
    const result = detectStandardBones(bones);
    expect(result.hasSemiStandardSkeleton).toBe(true);
    expect(result.semiStandard.present.length).toBe(16);
    expect(result.semiStandard.missing).toHaveLength(0);
  });

  it("does not detect standard skeleton from empty bone list", () => {
    const result = detectStandardBones([]);
    expect(result.hasStandardSkeleton).toBe(false);
    expect(result.hasSemiStandardSkeleton).toBe(false);
    expect(result.standard.present).toHaveLength(0);
    expect(result.standard.missing.length).toBeGreaterThan(0);
  });

  it("does not detect standard skeleton from non-character bones", () => {
    const bones = [
      stubBone("bone1", "bone1"),
      stubBone("stage_floor", "stage_floor"),
      stubBone("light_point", "light_point")
    ];
    const result = detectStandardBones(bones);
    expect(result.hasStandardSkeleton).toBe(false);
    expect(result.hasSemiStandardSkeleton).toBe(false);
  });

  it("detects partial standard set and lists missing bones", () => {
    const partial = [
      stubBone("センター"),
      stubBone("上半身"),
      stubBone("下半身"),
      stubBone("首"),
      stubBone("頭")
    ];
    const result = detectStandardBones(partial);
    expect(result.standard.present.length).toBe(5);
    expect(result.standard.missing.length).toBe(18);
    expect(result.hasStandardSkeleton).toBe(false);
  });

  it("matches by English name when Japanese name is absent", () => {
    const bones = [
      stubBone("bone0", "center"),
      stubBone("bone1", "upper body"),
      stubBone("bone2", "lower body"),
      stubBone("bone3", "neck"),
      stubBone("bone4", "head"),
      stubBone("bone5", "shoulder_L"),
      stubBone("bone6", "arm_L"),
      stubBone("bone7", "elbow_L"),
      stubBone("bone8", "wrist_L"),
      stubBone("bone9", "shoulder_R"),
      stubBone("bone10", "arm_R"),
      stubBone("bone11", "elbow_R")
    ];
    const result = detectStandardBones(bones);
    expect(result.standard.present.length).toBe(12);
    for (const match of result.standard.present) {
      expect(match.matchedField).toBe("englishName");
    }
    expect(result.hasStandardSkeleton).toBe(true);
  });

  it("is case-insensitive for English names", () => {
    const bones = [stubBone("bone0", "Center"), stubBone("bone1", "NECK")];
    const result = detectStandardBones(bones);
    const centerMatch = result.standard.present.find((m) => m.entry.id === "center");
    const neckMatch = result.standard.present.find((m) => m.entry.id === "neck");
    expect(centerMatch).toBeDefined();
    expect(neckMatch).toBeDefined();
  });

  it("normalizes fullwidth characters in Japanese IK names", () => {
    const bones = [stubBone("左足IK")];
    const result = detectStandardBones(bones);
    const match = result.standard.present.find((m) => m.entry.id === "left-leg-ik");
    expect(match).toBeDefined();
    expect(match!.matchedField).toBe("name");
  });

  it("matches Japanese name placed in englishName field", () => {
    const bones = [stubBone("", "センター")];
    const result = detectStandardBones(bones);
    const match = result.standard.present.find((m) => m.entry.id === "center");
    expect(match).toBeDefined();
    expect(match!.matchedField).toBe("englishName");
  });

  it("reports bone indices in match results", () => {
    const bones = [
      stubBone("root"),
      stubBone("センター"),
      stubBone("上半身")
    ];
    const result = detectStandardBones(bones);
    const center = result.standard.present.find((m) => m.entry.id === "center");
    const upper = result.standard.present.find((m) => m.entry.id === "upper-body");
    expect(center?.boneIndex).toBe(1);
    expect(upper?.boneIndex).toBe(2);
  });

  it("matches alternative English name formats", () => {
    const bones = [
      stubBone("b0", "left shoulder"),
      stubBone("b1", "right arm"),
      stubBone("b2", "upperbody"),
      stubBone("b3", "lower_body")
    ];
    const result = detectStandardBones(bones);
    expect(result.standard.present.find((m) => m.entry.id === "left-shoulder")).toBeDefined();
    expect(result.standard.present.find((m) => m.entry.id === "right-arm")).toBeDefined();
    expect(result.standard.present.find((m) => m.entry.id === "upper-body")).toBeDefined();
    expect(result.standard.present.find((m) => m.entry.id === "lower-body")).toBeDefined();
  });
});
