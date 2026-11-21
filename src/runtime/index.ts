import {
  mmdAnimWasmVmdDtoToAnimation as mmdAnimWasmVmdDtoToAnimationInternal,
  mmdAnimWasmVpdDtoToPose as mmdAnimWasmVpdDtoToPoseInternal
} from "./mmdAnimWasmParser.js";
import {
  CcdIkSolver as CcdIkSolverInternal,
  type CcdIkBone as CcdIkBoneInternal,
  type CcdIkChain as CcdIkChainInternal,
  type CcdIkLink as CcdIkLinkInternal,
  type CcdIkLinkAngleLimit as CcdIkLinkAngleLimitInternal,
  type CcdIkPose as CcdIkPoseInternal,
  type CcdIkPreparedChain as CcdIkPreparedChainInternal,
  type CcdIkPreparedSolveInput as CcdIkPreparedSolveInputInternal,
  type CcdIkSolveInput as CcdIkSolveInputInternal,
  type CcdIkSolveResult as CcdIkSolveResultInternal,
  type MutableQuatTuple as MutableQuatTupleInternal,
  type QuatTuple as QuatTupleInternal,
  type Vec3Tuple as Vec3TupleInternal
} from "./ik/CcdIkSolver.js";
import {
  createCcdIkSolveInputFromMmdIk as createCcdIkSolveInputFromMmdIkInternal,
  mmdIkChainToCcdIkChain as mmdIkChainToCcdIkChainInternal,
  type CreateCcdIkSolveInputFromMmdIkInput as CreateCcdIkSolveInputFromMmdIkInputInternal,
  type MmdIkRuntimeBone as MmdIkRuntimeBoneInternal,
  type MmdIkRuntimeChain as MmdIkRuntimeChainInternal,
  type MmdIkRuntimeLink as MmdIkRuntimeLinkInternal
} from "./ik/MmdIkChain.js";
export { DefaultMmdRuntime } from "./core.js";
export type { MmdHostRigDefinition, MmdHostRigPose, MmdAnimRuntimeWasmHostRig, MmdAnimRuntimeWasmHostRigConstructor } from "./hostRig.js";
export {
  MmdAnimRuntime,
  createMmdAnimWasmCameraTrack,
  createMmdAnimWasmLightTrack,
  exportMmdAnimWasmFormatBytes,
  exportMmdAnimWasmVmdAnimationJsonBytes,
  exportMmdAnimWasmVpdPoseJsonBytes,
  parseMmdAnimWasmFormatJson,
  sampleMmdAnimWasmCameraTrackInto,
  sampleMmdAnimWasmLightTrackInto
} from "./mmdAnimRuntime.js";
export { loadMmdAnimWasmVmd, loadMmdAnimWasmVpd } from "./mmdAnimWasmParser.js";
export { sampleMmdCameraTrack, sampleMmdCameraTrackInto, sampleMmdLightTrack, sampleMmdLightTrackInto, sampleMmdSelfShadowTrack, sampleMmdSelfShadowTrackInto } from "./sceneTrackSampling.js";
export type { CameraState, LightState, SelfShadowState, VmdCameraFrame, VmdLightFrame, VmdSelfShadowFrame } from "../parser/model/modelTypes.js";
export type {
  MmdAnimRuntimeOptions,
  MmdAnimRuntimeWasmCameraTrack,
  MmdAnimRuntimeWasmClip,
  MmdAnimRuntimeWasmLightTrack,
  MmdAnimRuntimeWasmModel,
  MmdAnimRuntimeWasmModule,
  MmdAnimRuntimeWasmRuntimeInstance
} from "./mmdAnimRuntime.js";
export type { MmdMorphOverrides, DefaultMmdRuntimeOptions, MmdFrameState, MmdRuntime, MmdRuntimeAsyncEvaluateOptions, MmdRuntimeAsyncTickOptions, MmdRuntimeDebugStageState, MmdRuntimeDebugState, MmdRuntimeEvaluateOptions, MmdRuntimeTickOptions } from "./types.js";

// Deprecated in 0.9.0, removed in 1.0.0
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. Use loadMmdAnimWasmVmd. */
export const mmdAnimWasmVmdDtoToAnimation = mmdAnimWasmVmdDtoToAnimationInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. Use loadMmdAnimWasmVpd. */
export const mmdAnimWasmVpdDtoToPose = mmdAnimWasmVpdDtoToPoseInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. DefaultMmdRuntime and MmdAnimRuntime solve IK internally. No replacement. */
export const CcdIkSolver = CcdIkSolverInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. DefaultMmdRuntime and MmdAnimRuntime solve IK internally. No replacement. */
export type CcdIkSolver = CcdIkSolverInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. DefaultMmdRuntime and MmdAnimRuntime solve IK internally. No replacement. */
export type CcdIkBone = CcdIkBoneInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. DefaultMmdRuntime and MmdAnimRuntime solve IK internally. No replacement. */
export type CcdIkChain = CcdIkChainInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. DefaultMmdRuntime and MmdAnimRuntime solve IK internally. No replacement. */
export type CcdIkLink = CcdIkLinkInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. DefaultMmdRuntime and MmdAnimRuntime solve IK internally. No replacement. */
export type CcdIkLinkAngleLimit = CcdIkLinkAngleLimitInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. DefaultMmdRuntime and MmdAnimRuntime solve IK internally. No replacement. */
export type CcdIkPose = CcdIkPoseInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. DefaultMmdRuntime and MmdAnimRuntime solve IK internally. No replacement. */
export type CcdIkPreparedChain = CcdIkPreparedChainInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. DefaultMmdRuntime and MmdAnimRuntime solve IK internally. No replacement. */
export type CcdIkPreparedSolveInput = CcdIkPreparedSolveInputInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. DefaultMmdRuntime and MmdAnimRuntime solve IK internally. No replacement. */
export type CcdIkSolveInput = CcdIkSolveInputInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. DefaultMmdRuntime and MmdAnimRuntime solve IK internally. No replacement. */
export type CcdIkSolveResult = CcdIkSolveResultInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. DefaultMmdRuntime and MmdAnimRuntime solve IK internally. No replacement. */
export type MutableQuatTuple = MutableQuatTupleInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. DefaultMmdRuntime and MmdAnimRuntime solve IK internally. No replacement. */
export type QuatTuple = QuatTupleInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. DefaultMmdRuntime and MmdAnimRuntime solve IK internally. No replacement. */
export type Vec3Tuple = Vec3TupleInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. DefaultMmdRuntime and MmdAnimRuntime solve IK internally. No replacement. */
export const createCcdIkSolveInputFromMmdIk = createCcdIkSolveInputFromMmdIkInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. DefaultMmdRuntime and MmdAnimRuntime solve IK internally. No replacement. */
export const mmdIkChainToCcdIkChain = mmdIkChainToCcdIkChainInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. DefaultMmdRuntime and MmdAnimRuntime solve IK internally. No replacement. */
export type CreateCcdIkSolveInputFromMmdIkInput = CreateCcdIkSolveInputFromMmdIkInputInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. DefaultMmdRuntime and MmdAnimRuntime solve IK internally. No replacement. */
export type MmdIkRuntimeBone = MmdIkRuntimeBoneInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. DefaultMmdRuntime and MmdAnimRuntime solve IK internally. No replacement. */
export type MmdIkRuntimeChain = MmdIkRuntimeChainInternal;
/** @deprecated Internal helper; will be removed from the public API in 1.0.0. DefaultMmdRuntime and MmdAnimRuntime solve IK internally. No replacement. */
export type MmdIkRuntimeLink = MmdIkRuntimeLinkInternal;
