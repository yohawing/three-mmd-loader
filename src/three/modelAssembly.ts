import { detectModelFormat } from "../parser/index.js";
import { parsePmd } from "../parser/model/PmdModelParser.js";
import { parsePmx } from "../parser/model/PmxModelParser.js";
import type { ParsedPmd } from "../parser/model/PmdModelParser.js";
import type { ParsedPmx } from "../parser/model/PmxModelParser.js";
import type { BoneData, MmdModel, SkeletonData } from "../parser/model/modelTypes.js";
import { createLoaderMmdModelData } from "./internalModelData.js";
import type { LoaderMmdModelData } from "./internalModelData.js";
import type { ThreeMmdSkeletonBone, ThreeMmdSkeletonData } from "./skeleton.js";

export type ParsedMmdModel = ParsedPmx | ParsedPmd;

export function parseLoaderMmdModelData(bytes: Uint8Array): LoaderMmdModelData {
  const format = detectModelFormat(bytes);
  const parsed = format === "pmx" ? parsePmx(bytes) : parsePmd(bytes);
  return createLoaderMmdModelData({
    coordinateSystem: "mmd-right-handed-y-up",
    metadata: {
      format: parsed.metadata.format,
      version: parsed.metadata.version,
      encoding: parsed.metadata.encoding,
      name: parsed.metadata.name,
      englishName: parsed.metadata.englishName,
      comment: parsed.metadata.comment,
      englishComment: parsed.metadata.englishComment,
      diagnostics: parsed.metadata.diagnostics
    },
    geometry: parsed.geometry,
    materials: parsed.materials,
    morphs: parsed.morphs,
    skeleton: createThreeMmdSkeletonData(parsed.skeleton),
    displayFrames: parsed.displayFrames,
    rigidBodies: parsed.rigidBodies,
    joints: parsed.joints,
    softBodies: parsed.softBodies
  });
}

export function createLoaderMmdModelDataFromModel(model: MmdModel): LoaderMmdModelData {
  const metadata = model.metadata();
  return createLoaderMmdModelData({
    coordinateSystem: "mmd-right-handed-y-up",
    metadata: {
      format: metadata.format,
      version: metadata.version,
      encoding: metadata.encoding,
      name: metadata.name,
      englishName: metadata.englishName,
      comment: metadata.comment,
      englishComment: metadata.englishComment,
      diagnostics: metadata.diagnostics
    },
    geometry: model.geometry(),
    materials: model.materials(),
    morphs: model.morphs(),
    skeleton: createThreeMmdSkeletonData(model.skeleton()),
    displayFrames: model.displayFrames(),
    rigidBodies: model.rigidBodies(),
    joints: model.joints(),
    softBodies: model.softBodies()
  });
}

function createThreeMmdSkeletonData(skeleton: SkeletonData): ThreeMmdSkeletonData {
  return {
    bones: skeleton.bones.map(createThreeMmdSkeletonBone)
  };
}

function createThreeMmdSkeletonBone(bone: BoneData): ThreeMmdSkeletonBone {
  return {
    name: bone.name,
    englishName: bone.englishName,
    parentIndex: bone.parentIndex,
    position: [...bone.position],
    layer: bone.layer,
    flags: {
      appendLocal: bone.flags.appendLocal,
      appendRotate: bone.flags.appendRotate,
      appendTranslate: bone.flags.appendTranslate,
      transformAfterPhysics: bone.flags.transformAfterPhysics,
      hasLocalAxis: bone.flags.localAxis,
      hasFixedAxis: bone.flags.fixedAxis
    },
    appendTransform:
      bone.appendTransform === undefined
        ? undefined
        : {
            parentIndex: bone.appendTransform.parentIndex,
            weight: bone.appendTransform.weight
          },
    fixedAxis: bone.fixedAxis === undefined ? undefined : [...bone.fixedAxis],
    localAxis:
      bone.localAxis === undefined
        ? undefined
        : {
            x: [...bone.localAxis.x],
            z: [...bone.localAxis.z]
          },
    ik:
      bone.ik === undefined
        ? undefined
        : {
            targetIndex: bone.ik.targetIndex,
            loopCount: bone.ik.loopCount,
            limitAngle: bone.ik.limitAngle,
            links: bone.ik.links.map((link) => ({
              boneIndex: link.boneIndex,
              limits:
                link.limits === undefined
                  ? undefined
                  : {
                      kind: link.limits.kind,
                      lower: [...link.limits.lower],
                      upper: [...link.limits.upper]
                    }
            }))
          }
  };
}
