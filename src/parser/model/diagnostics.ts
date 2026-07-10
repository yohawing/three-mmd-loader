import type {
  Diagnostic,
  DisplayFrameData,
  JointData,
  MaterialInfo,
  MorphData,
  RigidBodyData,
  SkeletonData
} from "./modelTypes.js";

export function createModelDiagnostics(
  materials: readonly MaterialInfo[],
  morphs: readonly MorphData[],
  skeleton?: SkeletonData,
  rigidBodies: readonly RigidBodyData[] = [],
  joints: readonly JointData[] = [],
  displayFrames: readonly DisplayFrameData[] = []
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (
    materials.some(
      (material) =>
        material.flags.vertexColor || material.flags.pointDraw || material.flags.lineDraw
    )
  ) {
    diagnostics.push({
      level: "warning",
      code: "MATERIAL_DRAW_FLAG_UNSUPPORTED",
      message:
        "Vertex-color, point-draw, or line-draw material flags were parsed but are not rendered by the current adapter."
    });
  }
  const unsupportedMorphTypes = new Set(
    morphs
      .map((morph) => morph.type)
      .filter(
        (
          type
        ): type is Exclude<
          MorphData["type"],
          | "base"
          | "group"
          | "vertex"
          | "bone"
          | "uv"
          | "additionalUv"
          | "material"
          | "flip"
          | "impulse"
        > =>
          type !== "base" &&
          type !== "group" &&
          type !== "vertex" &&
          type !== "bone" &&
          type !== "uv" &&
          type !== "additionalUv" &&
          type !== "material" &&
          type !== "flip" &&
          type !== "impulse"
      )
  );
  if (unsupportedMorphTypes.size > 0) {
    diagnostics.push({
      level: "warning",
      code: "MORPH_TYPE_UNSUPPORTED",
      message: `Unsupported morph types are present: ${Array.from(unsupportedMorphTypes).join(", ")}.`
    });
  }
  if (morphs.some((morph) => morph.type === "impulse")) {
    diagnostics.push({
      level: "warning",
      code: "IMPULSE_MORPH_EXTERNAL_PHYSICS_ONLY",
      message:
        "PMX impulse morph offsets are parsed and forwarded to external physics backends; the built-in provisional physics backend does not simulate them."
    });
  }
  const ikLinksWithLimits =
    skeleton?.bones.flatMap(
      (bone) => bone.ik?.links.filter((link) => link.limits !== undefined) ?? []
    ) ?? [];
  if (ikLinksWithLimits.some((link) => link.limits?.kind === "pmdKnee")) {
    diagnostics.push({
      level: "warning",
      code: "IK_PMD_KNEE_LIMITS_APPROXIMATE",
      message:
        "PMD-style knee IK link limits are applied as an approximate Euler clamp in the current runtime IK solver."
    });
  }
  if (ikLinksWithLimits.some((link) => link.limits?.kind !== "pmdKnee")) {
    diagnostics.push({
      level: "warning",
      code: "IK_PMX_LINK_LIMITS_APPROXIMATE",
      message:
        "PMX IK link limits are applied with an MMD axis-limit approximation; native parity still depends on local-axis and solver convergence details."
    });
  }
  if (skeleton?.bones.some((bone) => bone.flags.fixedAxis)) {
    diagnostics.push({
      level: "warning",
      code: "BONE_FIXED_AXIS_CONSTRAINTS_UNSUPPORTED",
      message:
        "Fixed-axis metadata is applied to IK links, but non-IK fixed-axis bone behavior is not yet enforced by the runtime."
    });
  }
  if (skeleton?.bones.some((bone) => bone.flags.localAxis)) {
    diagnostics.push({
      level: "warning",
      code: "BONE_LOCAL_AXIS_CONSTRAINTS_UNSUPPORTED",
      message:
        "Local-axis metadata is applied to IK link limits, but non-IK local-axis bone behavior is not yet enforced by the runtime."
    });
  }
  if (skeleton?.bones.some((bone) => bone.flags.externalParentTransform)) {
    diagnostics.push({
      level: "warning",
      code: "BONE_EXTERNAL_PARENT_TRANSFORM_REQUIRES_PROVIDER",
      message:
        "External-parent bone metadata is parsed, but runtime playback requires an externalParentTransforms provider to supply keyed parent matrices."
    });
  }
  if (rigidBodies.some((body) => body.shape === "unknown" || body.mode === "unknown")) {
    diagnostics.push({
      level: "warning",
      code: "RIGID_BODY_TYPE_UNSUPPORTED",
      message:
        "Unknown MMD rigid-body shape or mode values were parsed but cannot be simulated by the current physics backends."
    });
  }
  if (joints.some((joint) => joint.type === "unknown")) {
    diagnostics.push({
      level: "warning",
      code: "JOINT_TYPE_UNSUPPORTED",
      message:
        "Unknown PMX joint type values were parsed but cannot be mapped to the current physics backend constraints."
    });
  }
  if (
    displayFrames.some((displayFrame) =>
      displayFrame.frames.some((frame) => frame.type === "unknown")
    )
  ) {
    diagnostics.push({
      level: "warning",
      code: "DISPLAY_FRAME_TYPE_UNSUPPORTED",
      message:
        "Unknown display-frame entry types were parsed but cannot be mapped to bone or morph display items."
    });
  }
  return diagnostics;
}
