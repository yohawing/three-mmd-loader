import * as THREE from "three";
import type { ThreeMmdModel } from "./loaded-model.js";
import { createThreeBufferGeometry } from "./geometry.js";
import { createThreeMorphSplitGeometries } from "./geometry-split.js";
import type { LoaderMmdModelData } from "./internalModelData.js";
import { createThreeMmdMaterials } from "./materials.js";
import { createThreeSkeleton } from "./skeleton.js";
import { attachMmdSdefSkinning as attachMmdSdefSkinningInternal } from "./material/material-sdef.js";

export function createThreeMmdMesh(
  modelData: LoaderMmdModelData,
  options: Pick<ThreeMmdModel, "metadata" | "bones"> & { readonly morphSplit: boolean; readonly morphAttributes: boolean }
): THREE.SkinnedMesh {
  const splitGeometries = options.morphAttributes && options.morphSplit && shouldCreateMorphSplitMeshes(modelData)
    ? createThreeMorphSplitGeometries(modelData.geometry, modelData.materials, modelData.morphs)
    : [];
  const geometry = createThreeBufferGeometry(
    modelData.geometry,
    modelData.materials,
    splitGeometries.length > 0 ? [] : modelData.morphs,
    { morphAttributes: options.morphAttributes }
  );
  const materials = createThreeMmdMaterials(modelData.materials);
  if (geometry.userData.mmdSdef || geometry.userData.mmdQdef) {
    materials.forEach((material) => attachMmdSdefSkinningInternal(material));
  }
  const mesh = new THREE.SkinnedMesh(geometry, materials.length === 1 ? materials[0] : materials);
  const bodyMeshes = splitGeometries.map((split) => {
    const body = new THREE.SkinnedMesh(split.geometry, materials);
    body.name = `${modelData.metadata.englishName || modelData.metadata.name || "mmd"} material ${split.materialIndex}`;
    body.frustumCulled = mesh.frustumCulled;
    body.morphTargetDictionary = createMorphTargetDictionaryForIndices(
      modelData.morphs,
      split.morphTargetIndices
    );
    body.morphTargetInfluences = new Array(split.morphTargetIndices.length).fill(0);
    body.userData.mmdMorphSplitBody = {
      materialIndex: split.materialIndex,
      morphTargetIndices: split.morphTargetIndices,
      sourceVertexCount: split.sourceVertexCount,
      vertexCount: split.vertexCount,
      morphPositionAttributeCount: split.morphPositionAttributeCount
    };
    return body;
  });
  mesh.morphTargetDictionary = createMorphTargetDictionary(modelData.morphs);
  mesh.morphTargetInfluences = new Array(modelData.morphs.length).fill(0);
  bodyMeshes.forEach((body) => {
    attachMorphSplitInfluenceSync(mesh, body);
  });
  mesh.name = modelData.metadata.englishName || modelData.metadata.name;
  // Keep mmd* userData keys internal (outside semver) so consumers can rely on ThreeMmdModel.
  mesh.userData.mmdModel = {
    metadata: options.metadata,
    bones: options.bones,
    format: modelData.metadata.format,
    name: modelData.metadata.name,
    englishName: modelData.metadata.englishName,
    comment: modelData.metadata.comment,
    englishComment: modelData.metadata.englishComment,
    diagnostics: modelData.metadata.diagnostics.map((diagnostic) => ({ ...diagnostic })),
    rigidBodyCount: modelData.rigidBodies.length,
    jointCount: modelData.joints.length
  };
  mesh.userData.mmdPhysics = {
    rigidBodies: modelData.rigidBodies,
    joints: modelData.joints
  };
  mesh.userData.mmdMorphs = modelData.morphs.map((morph) => ({
    name: morph.name,
    englishName: morph.englishName,
    type: morph.type,
    boneOffsets: morph.boneOffsets.map((offset) => ({ ...offset })),
    groupOffsets: morph.groupOffsets.map((offset) => ({ ...offset })),
    flipOffsets: morph.flipOffsets?.map((offset) => ({ ...offset })),
    impulseOffsets: morph.impulseOffsets?.map((offset) => ({ ...offset }))
  }));
  mesh.userData.mmdIkChains = createRuntimeIkChains(modelData);
  if (bodyMeshes.length > 0) {
    mesh.userData.mmdMorphSplitBodyMeshes = bodyMeshes;
    mesh.userData.mmdMorphSplit = {
      sourceVertexCount: modelData.geometry.positions.length / 3,
      bodyMeshCount: bodyMeshes.length,
      splitVertexCount: bodyMeshes.reduce((sum, body) => {
        const position = body.geometry.getAttribute("position");
        return sum + (position?.count ?? 0);
      }, 0)
    };
  }

  const skeleton = createThreeSkeleton(modelData.skeleton);
  skeleton.bones.forEach((bone, index) => {
    const boneData = modelData.skeleton.bones[index];
    if (boneData) {
      bone.userData.mmdBoneName = boneData.name;
      bone.userData.mmdEnglishBoneName = boneData.englishName;
      bone.userData.mmdRestPosition = [...boneData.position];
      if (boneData.ikStateName !== undefined) {
        bone.userData.mmdIkStateName = boneData.ikStateName;
      }
    }
    if (boneData?.appendTransform) {
      bone.userData.mmdAppendTransform = boneData.appendTransform;
    }
    if (boneData?.flags) {
      bone.userData.mmdFlags = boneData.flags;
    }
    if (boneData?.layer !== undefined) {
      bone.userData.mmdLayer = boneData.layer;
    }
  });
  skeleton.bones.forEach((bone) => {
    if (!bone.parent) {
      mesh.add(bone);
    }
  });
  mesh.bind(skeleton);
  bodyMeshes.forEach((body) => {
    body.bind(skeleton, mesh.bindMatrix);
    attachMorphSplitInfluenceSync(mesh, body);
  });
  return mesh;
}

function createMorphTargetDictionaryForIndices(
  morphs: readonly LoaderMmdModelData["morphs"][number][],
  morphTargetIndices: Uint16Array | Uint32Array
): Record<string, number> {
  const dictionary: Record<string, number> = {};
  for (let localIndex = 0; localIndex < morphTargetIndices.length; localIndex += 1) {
    const morph = morphs[morphTargetIndices[localIndex] ?? -1];
    if (!morph) {
      continue;
    }
    const primaryName = morph.name || morph.englishName;
    const secondaryName = morph.englishName || morph.name;
    if (primaryName) {
      dictionary[primaryName] = localIndex;
    }
    if (secondaryName && dictionary[secondaryName] === undefined) {
      dictionary[secondaryName] = localIndex;
    }
  }
  return dictionary;
}

function attachMorphSplitInfluenceSync(
  source: THREE.SkinnedMesh,
  target: THREE.SkinnedMesh
): void {
  const split = target.userData.mmdMorphSplitBody as
    | { readonly morphTargetIndices?: Uint16Array | Uint32Array }
    | undefined;
  const morphTargetIndices = split?.morphTargetIndices;
  if (!morphTargetIndices || target.userData.mmdMorphSplitInfluenceSyncAttached) {
    return;
  }
  const previousOnBeforeRender = target.onBeforeRender.bind(target);
  target.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
    previousOnBeforeRender(renderer, scene, camera, geometry, material, group);
    const sourceInfluences = source.morphTargetInfluences;
    const targetInfluences = target.morphTargetInfluences;
    if (!sourceInfluences || !targetInfluences) {
      return;
    }
    for (let index = 0; index < morphTargetIndices.length; index += 1) {
      targetInfluences[index] = sourceInfluences[morphTargetIndices[index] ?? -1] ?? 0;
    }
  };
  target.userData.mmdMorphSplitInfluenceSyncAttached = true;
}

function shouldCreateMorphSplitMeshes(modelData: LoaderMmdModelData): boolean {
  const vertexCount = modelData.geometry.positions.length / 3;
  const groups = modelData.geometry.materialGroups?.length ?? modelData.materials.length;
  if (vertexCount <= 0 || groups <= 1) {
    return false;
  }
  const morphTargetCount = modelData.morphs.filter(
    (morph) => morph.type === "vertex" || morph.type === "uv" || morph.type === "additionalUv"
  ).length;
  if (morphTargetCount === 0) {
    return false;
  }
  const estimatedDenseBytes = vertexCount * morphTargetCount * 3 * Float32Array.BYTES_PER_ELEMENT;
  return estimatedDenseBytes >= 64 * 1024 * 1024;
}

function createRuntimeIkChains(modelData: LoaderMmdModelData): unknown[] {
  return modelData.skeleton.bones
    .map((bone, boneIndex) => {
      if (!bone.ik) {
        return null;
      }
      return {
        goalBoneIndex: boneIndex,
        effectorBoneIndex: bone.ik.targetIndex,
        iterationCount: bone.ik.loopCount,
        maxAnglePerIteration: bone.ik.limitAngle,
        links: bone.ik.links.map((link) => ({
          boneIndex: link.boneIndex,
          enabled: true,
          fixedAxis: createRuntimeIkLinkFixedAxis(modelData, link.boneIndex),
          localAxisBasis: createRuntimeIkLinkLocalAxisBasis(modelData, link.boneIndex),
          limitsKind:
            link.limits === undefined
              ? undefined
              : link.limits.kind === "pmdKnee"
                ? "pmdKnee"
                : "pmxLinkLimit",
          angleLimit: link.limits
            ? {
                minimumAngle: link.limits.lower,
                maximumAngle: link.limits.upper
              }
            : undefined
        }))
      };
    })
    .filter((chain): chain is NonNullable<typeof chain> => chain !== null);
}

function createRuntimeIkLinkFixedAxis(
  modelData: LoaderMmdModelData,
  boneIndex: number
): [number, number, number] | undefined {
  const bone = modelData.skeleton.bones[boneIndex];
  const fixedAxis = bone?.fixedAxis;
  if (
    !bone?.flags?.hasFixedAxis ||
    !fixedAxis ||
    !fixedAxis.every(Number.isFinite) ||
    Math.hypot(fixedAxis[0], fixedAxis[1], fixedAxis[2]) < 1e-12
  ) {
    return undefined;
  }
  return [fixedAxis[0], fixedAxis[1], fixedAxis[2]];
}

function createRuntimeIkLinkLocalAxisBasis(
  modelData: LoaderMmdModelData,
  boneIndex: number
): [number, number, number, number] | undefined {
  const bone = modelData.skeleton.bones[boneIndex];
  const localAxis = bone?.localAxis;
  if (!bone?.flags?.hasLocalAxis || !localAxis) {
    return undefined;
  }
  const x = new THREE.Vector3(...localAxis.x);
  const z = new THREE.Vector3(...localAxis.z);
  if (
    !localAxis.x.every(Number.isFinite) ||
    !localAxis.z.every(Number.isFinite) ||
    x.lengthSq() < 1e-12 ||
    z.lengthSq() < 1e-12
  ) {
    return undefined;
  }
  x.normalize();
  z.addScaledVector(x, -z.dot(x));
  if (z.lengthSq() < 1e-12) {
    return undefined;
  }
  z.normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  z.crossVectors(x, y).normalize();
  const basis = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(x, y, z)
  );
  return [basis.x, basis.y, basis.z, basis.w];
}

function createMorphTargetDictionary(
  morphs: readonly LoaderMmdModelData["morphs"][number][]
): Record<string, number> {
  const dictionary: Record<string, number> = {};
  morphs.forEach((morph, index) => {
    const primaryName = morph.name || morph.englishName;
    const secondaryName = morph.englishName || morph.name;
    if (primaryName) {
      dictionary[primaryName] = index;
    }
    if (secondaryName && dictionary[secondaryName] === undefined) {
      dictionary[secondaryName] = index;
    }
  });
  return dictionary;
}

export function normalizeMeshMaterials(
  material: THREE.Material | THREE.Material[]
): THREE.MeshToonMaterial[] {
  const materials = Array.isArray(material) ? material : [material];
  return materials.filter((candidate): candidate is THREE.MeshToonMaterial => {
    return candidate instanceof THREE.MeshToonMaterial;
  });
}
