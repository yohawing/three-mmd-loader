import type { BoneData } from "../model/modelTypes.js";

export interface StandardBoneEntry {
  readonly id: string;
  readonly japaneseName: string;
  readonly englishNames: readonly string[];
  readonly tier: "standard" | "semi-standard";
}

export interface StandardBoneDetectionResult {
  readonly standard: StandardBoneMatchResult;
  readonly semiStandard: StandardBoneMatchResult;
  readonly hasStandardSkeleton: boolean;
  readonly hasSemiStandardSkeleton: boolean;
}

export interface StandardBoneMatchResult {
  readonly present: readonly StandardBoneMatch[];
  readonly missing: readonly StandardBoneEntry[];
}

export interface StandardBoneMatch {
  readonly entry: StandardBoneEntry;
  readonly boneIndex: number;
  readonly matchedField: "name" | "englishName";
}

const standardBoneDefinitions: readonly StandardBoneEntry[] = [
  { id: "center", japaneseName: "センター", englishNames: ["center"], tier: "standard" },
  { id: "upper-body", japaneseName: "上半身", englishNames: ["upper body", "upper_body", "upperbody"], tier: "standard" },
  { id: "lower-body", japaneseName: "下半身", englishNames: ["lower body", "lower_body", "lowerbody"], tier: "standard" },
  { id: "neck", japaneseName: "首", englishNames: ["neck"], tier: "standard" },
  { id: "head", japaneseName: "頭", englishNames: ["head"], tier: "standard" },
  { id: "left-shoulder", japaneseName: "左肩", englishNames: ["shoulder_l", "left shoulder"], tier: "standard" },
  { id: "left-arm", japaneseName: "左腕", englishNames: ["arm_l", "left arm"], tier: "standard" },
  { id: "left-elbow", japaneseName: "左ひじ", englishNames: ["elbow_l", "left elbow"], tier: "standard" },
  { id: "left-wrist", japaneseName: "左手首", englishNames: ["wrist_l", "left wrist"], tier: "standard" },
  { id: "right-shoulder", japaneseName: "右肩", englishNames: ["shoulder_r", "right shoulder"], tier: "standard" },
  { id: "right-arm", japaneseName: "右腕", englishNames: ["arm_r", "right arm"], tier: "standard" },
  { id: "right-elbow", japaneseName: "右ひじ", englishNames: ["elbow_r", "right elbow"], tier: "standard" },
  { id: "right-wrist", japaneseName: "右手首", englishNames: ["wrist_r", "right wrist"], tier: "standard" },
  { id: "left-leg", japaneseName: "左足", englishNames: ["leg_l", "left leg"], tier: "standard" },
  { id: "left-knee", japaneseName: "左ひざ", englishNames: ["knee_l", "left knee"], tier: "standard" },
  { id: "left-ankle", japaneseName: "左足首", englishNames: ["ankle_l", "left ankle"], tier: "standard" },
  { id: "right-leg", japaneseName: "右足", englishNames: ["leg_r", "right leg"], tier: "standard" },
  { id: "right-knee", japaneseName: "右ひざ", englishNames: ["knee_r", "right knee"], tier: "standard" },
  { id: "right-ankle", japaneseName: "右足首", englishNames: ["ankle_r", "right ankle"], tier: "standard" },
  { id: "left-leg-ik", japaneseName: "左足ＩＫ", englishNames: ["leg ik_l", "left leg ik"], tier: "standard" },
  { id: "right-leg-ik", japaneseName: "右足ＩＫ", englishNames: ["leg ik_r", "right leg ik"], tier: "standard" },
  { id: "left-toe-ik", japaneseName: "左つま先ＩＫ", englishNames: ["toe ik_l", "left toe ik"], tier: "standard" },
  { id: "right-toe-ik", japaneseName: "右つま先ＩＫ", englishNames: ["toe ik_r", "right toe ik"], tier: "standard" },

  { id: "groove", japaneseName: "グルーブ", englishNames: ["groove"], tier: "semi-standard" },
  { id: "waist", japaneseName: "腰", englishNames: ["waist"], tier: "semi-standard" },
  { id: "upper-body-2", japaneseName: "上半身2", englishNames: ["upper body2", "upper_body_2", "upperbody2"], tier: "semi-standard" },
  { id: "left-arm-twist", japaneseName: "左腕捩", englishNames: ["arm twist_l", "left arm twist"], tier: "semi-standard" },
  { id: "right-arm-twist", japaneseName: "右腕捩", englishNames: ["arm twist_r", "right arm twist"], tier: "semi-standard" },
  { id: "left-wrist-twist", japaneseName: "左手捩", englishNames: ["wrist twist_l", "left wrist twist"], tier: "semi-standard" },
  { id: "right-wrist-twist", japaneseName: "右手捩", englishNames: ["wrist twist_r", "right wrist twist"], tier: "semi-standard" },
  { id: "left-shoulder-p", japaneseName: "左肩P", englishNames: ["shoulder p_l", "left shoulder p"], tier: "semi-standard" },
  { id: "right-shoulder-p", japaneseName: "右肩P", englishNames: ["shoulder p_r", "right shoulder p"], tier: "semi-standard" },
  { id: "left-leg-ik-parent", japaneseName: "左足IK親", englishNames: ["leg ik parent_l", "left leg ik parent"], tier: "semi-standard" },
  { id: "right-leg-ik-parent", japaneseName: "右足IK親", englishNames: ["leg ik parent_r", "right leg ik parent"], tier: "semi-standard" },
  { id: "left-toe-ex", japaneseName: "左足先EX", englishNames: ["toe ex_l", "left toe ex"], tier: "semi-standard" },
  { id: "right-toe-ex", japaneseName: "右足先EX", englishNames: ["toe ex_r", "right toe ex"], tier: "semi-standard" },
  { id: "eyes", japaneseName: "両目", englishNames: ["eyes", "both eyes"], tier: "semi-standard" },
  { id: "left-eye", japaneseName: "左目", englishNames: ["eye_l", "left eye"], tier: "semi-standard" },
  { id: "right-eye", japaneseName: "右目", englishNames: ["eye_r", "right eye"], tier: "semi-standard" }
];

const minimumStandardThreshold = 10;
const minimumSemiStandardThreshold = 3;

export function getStandardBoneDefinitions(): readonly StandardBoneEntry[] {
  return standardBoneDefinitions;
}

export function detectStandardBones(bones: readonly BoneData[]): StandardBoneDetectionResult {
  const nameIndex = new Map<string, number>();
  const englishNameIndex = new Map<string, number>();
  for (const [i, bone] of bones.entries()) {
    const normalizedName = normalizeForMatch(bone.name);
    const normalizedEnglish = normalizeForMatch(bone.englishName);
    if (!nameIndex.has(normalizedName)) {
      nameIndex.set(normalizedName, i);
    }
    if (normalizedEnglish !== "" && !englishNameIndex.has(normalizedEnglish)) {
      englishNameIndex.set(normalizedEnglish, i);
    }
  }

  const standardPresent: StandardBoneMatch[] = [];
  const standardMissing: StandardBoneEntry[] = [];
  const semiStandardPresent: StandardBoneMatch[] = [];
  const semiStandardMissing: StandardBoneEntry[] = [];

  for (const entry of standardBoneDefinitions) {
    const match = matchBone(entry, nameIndex, englishNameIndex);
    if (entry.tier === "standard") {
      if (match !== undefined) {
        standardPresent.push(match);
      } else {
        standardMissing.push(entry);
      }
    } else {
      if (match !== undefined) {
        semiStandardPresent.push(match);
      } else {
        semiStandardMissing.push(entry);
      }
    }
  }

  return {
    standard: { present: standardPresent, missing: standardMissing },
    semiStandard: { present: semiStandardPresent, missing: semiStandardMissing },
    hasStandardSkeleton: standardPresent.length >= minimumStandardThreshold,
    hasSemiStandardSkeleton: semiStandardPresent.length >= minimumSemiStandardThreshold
  };
}

function normalizeForMatch(name: string): string {
  return name.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[Ａ-Ｚａ-ｚ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .toLowerCase();
}

function matchBone(
  entry: StandardBoneEntry,
  nameIndex: Map<string, number>,
  englishNameIndex: Map<string, number>
): StandardBoneMatch | undefined {
  const jaNormalized = normalizeForMatch(entry.japaneseName);

  const nameHit = nameIndex.get(jaNormalized);
  if (nameHit !== undefined) {
    return { entry, boneIndex: nameHit, matchedField: "name" };
  }

  for (const englishName of entry.englishNames) {
    const enNormalized = normalizeForMatch(englishName);
    const englishHit = englishNameIndex.get(enNormalized);
    if (englishHit !== undefined) {
      return { entry, boneIndex: englishHit, matchedField: "englishName" };
    }
  }

  const jaInEnglishHit = englishNameIndex.get(jaNormalized);
  if (jaInEnglishHit !== undefined) {
    return { entry, boneIndex: jaInEnglishHit, matchedField: "englishName" };
  }

  return undefined;
}
