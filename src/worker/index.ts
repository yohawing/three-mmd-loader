import {
  buildShadowMmdSkinnedMesh as buildShadowMmdSkinnedMeshInternal,
  serializeMmdRuntimeModelDescriptor as serializeMmdRuntimeModelDescriptorInternal
} from "./modelDescriptor.js";
import { MmdRuntimeWorkerHost as MmdRuntimeWorkerHostInternal } from "./host.js";
import { MmdRuntimeWorkerEndpoint as MmdRuntimeWorkerEndpointInternal } from "./endpoint.js";
import { MmdRuntimeWorkerDispatcher as MmdRuntimeWorkerDispatcherInternal } from "./dispatcher.js";
export {
  MmdRuntimeWorkerPool,
  getDefaultMmdRuntimeWorkerPoolSize,
  resolveMmdRuntimeWorkerPoolSize
} from "./pool.js";
import {
  applyMmdRuntimePoseToMesh as applyMmdRuntimePoseToMeshInternal,
  createMmdRuntimePoseApplyScratch as createMmdRuntimePoseApplyScratchInternal
} from "./applyPose.js";
import { MmdRuntimeTransferablePosePool as MmdRuntimeTransferablePosePoolInternal } from "./transferablePool.js";
import {
  acquireMmdRuntimeSharedPoseWriteSlot as acquireMmdRuntimeSharedPoseWriteSlotInternal,
  createMmdRuntimeSharedPoseReadBuffer as createMmdRuntimeSharedPoseReadBufferInternal,
  createMmdRuntimeSharedPoseSlots as createMmdRuntimeSharedPoseSlotsInternal,
  publishMmdRuntimeSharedPose as publishMmdRuntimeSharedPoseInternal,
  readMmdRuntimeSharedPoseInto as readMmdRuntimeSharedPoseIntoInternal,
  releaseMmdRuntimeSharedPoseReadSlot as releaseMmdRuntimeSharedPoseReadSlotInternal,
  resetMmdRuntimeSharedPoseSlot as resetMmdRuntimeSharedPoseSlotInternal
} from "./sharedPose.js";
import {
  MMD_RUNTIME_POSE_PROTOCOL_VERSION as MMD_RUNTIME_POSE_PROTOCOL_VERSIONInternal,
  captureMmdRuntimePoseInto as captureMmdRuntimePoseIntoInternal,
  copyMmdRuntimePoseInto as copyMmdRuntimePoseIntoInternal,
  createMmdRuntimePoseBuffer as createMmdRuntimePoseBufferInternal,
  isCurrentMmdRuntimePose as isCurrentMmdRuntimePoseInternal
} from "./protocol.js";
export type {
  MmdRuntimeBoneDescriptor,
  MmdRuntimeModelDescriptor
} from "./modelDescriptor.js";
import type { MmdRuntimeWorkerHostOptions as MmdRuntimeWorkerHostOptionsInternal } from "./host.js";
import type { MmdRuntimeWorkerEndpointOptions as MmdRuntimeWorkerEndpointOptionsInternal } from "./endpoint.js";
export type {
  MmdRuntimeWorkerLease,
  MmdRuntimeWorkerPhysicalFactory,
  MmdRuntimeWorkerPoolOptions
} from "./pool.js";
export type { CustomBulletWorkerPhysicsConfig } from "./externalPhysics.js";
import type {
  MmdRuntimeWorkerCommandEnvelope as MmdRuntimeWorkerCommandEnvelopeInternal,
  MmdRuntimeWorkerEventEnvelope as MmdRuntimeWorkerEventEnvelopeInternal,
  MmdRuntimeWorkerMessagePort as MmdRuntimeWorkerMessagePortInternal,
  MmdRuntimeWorkerMultiplexedCommand as MmdRuntimeWorkerMultiplexedCommandInternal,
  MmdRuntimeWorkerMultiplexedEvent as MmdRuntimeWorkerMultiplexedEventInternal,
  MmdRuntimeWorkerMultiplexedMessagePort as MmdRuntimeWorkerMultiplexedMessagePortInternal
} from "./messages.js";
export type {
  MmdRuntimeWorkerCommand,
  MmdRuntimeWorkerEvent,
  MmdRuntimeWorkerRuntimeId
} from "./messages.js";
import type {
  MmdRuntimeWorkerDispatcherCommand as MmdRuntimeWorkerDispatcherCommandInternal,
  MmdRuntimeWorkerDispatcherMessagePort as MmdRuntimeWorkerDispatcherMessagePortInternal
} from "./dispatcher.js";
import type { MmdRuntimePoseApplyScratch as MmdRuntimePoseApplyScratchInternal } from "./applyPose.js";
export type { MmdRuntimePoseBuffer } from "./protocol.js";
export { WorkerMmdRuntime } from "./runtime.js";
import { createWorkerMmdRuntime as createWorkerMmdRuntimeInternal } from "./runtimeFactory.js";
/** @deprecated Use createWorkerMmdRuntimeFactory. Will be removed in 1.0.0. */
export const createWorkerMmdRuntime = createWorkerMmdRuntimeInternal;
export { createWorkerMmdRuntimeFactory } from "./runtimeFactory.js";
import type { WorkerMmdRuntimeFactoryOptions as WorkerMmdRuntimeFactoryOptionsInternal } from "./runtimeFactory.js";
/** @deprecated Use WorkerMmdRuntimeOptions. Will be removed in 1.0.0. */
export type WorkerMmdRuntimeFactoryOptions = WorkerMmdRuntimeFactoryOptionsInternal;
export type { WorkerMmdRuntimeFactory } from "./runtimeFactory.js";
export type {
  MmdRuntimeWorkerLike,
  WorkerMmdRuntimeOptions
} from "./runtimeConnection.js";
export type { MmdRuntimeSharedPoseSlot } from "./sharedPose.js";

/** @deprecated Use createWorkerMmdRuntimeFactory with ThreeMmdLoader. Low-level worker components will leave the public API in 1.0.0. */
export const buildShadowMmdSkinnedMesh = buildShadowMmdSkinnedMeshInternal;

/** @deprecated Use createWorkerMmdRuntimeFactory with ThreeMmdLoader. Low-level worker components will leave the public API in 1.0.0. */
export const serializeMmdRuntimeModelDescriptor = serializeMmdRuntimeModelDescriptorInternal;

/** @deprecated Use createWorkerMmdRuntimeFactory with ThreeMmdLoader. Low-level worker components will leave the public API in 1.0.0. */
export const MmdRuntimeWorkerHost = MmdRuntimeWorkerHostInternal;

/** @deprecated Use createWorkerMmdRuntimeFactory with ThreeMmdLoader. Low-level worker components will leave the public API in 1.0.0. */
export type MmdRuntimeWorkerHost = MmdRuntimeWorkerHostInternal;

/** @deprecated Use createWorkerMmdRuntimeFactory with ThreeMmdLoader. Low-level worker components will leave the public API in 1.0.0. */
export const MmdRuntimeWorkerEndpoint = MmdRuntimeWorkerEndpointInternal;

/** @deprecated Use createWorkerMmdRuntimeFactory with ThreeMmdLoader. Low-level worker components will leave the public API in 1.0.0. */
export type MmdRuntimeWorkerEndpoint = MmdRuntimeWorkerEndpointInternal;

/** @deprecated Use createWorkerMmdRuntimeFactory with ThreeMmdLoader. Low-level worker components will leave the public API in 1.0.0. */
export const MmdRuntimeWorkerDispatcher = MmdRuntimeWorkerDispatcherInternal;

/** @deprecated Use createWorkerMmdRuntimeFactory with ThreeMmdLoader. Low-level worker components will leave the public API in 1.0.0. */
export type MmdRuntimeWorkerDispatcher = MmdRuntimeWorkerDispatcherInternal;

/** @deprecated Use createWorkerMmdRuntimeFactory with ThreeMmdLoader. Low-level worker components will leave the public API in 1.0.0. */
export const applyMmdRuntimePoseToMesh = applyMmdRuntimePoseToMeshInternal;

/** @deprecated Use createWorkerMmdRuntimeFactory with ThreeMmdLoader. Low-level worker components will leave the public API in 1.0.0. */
export const createMmdRuntimePoseApplyScratch = createMmdRuntimePoseApplyScratchInternal;

/** @deprecated Use createWorkerMmdRuntimeFactory with ThreeMmdLoader. Low-level worker components will leave the public API in 1.0.0. */
export const MmdRuntimeTransferablePosePool = MmdRuntimeTransferablePosePoolInternal;

/** @deprecated Use createWorkerMmdRuntimeFactory with ThreeMmdLoader. Low-level worker components will leave the public API in 1.0.0. */
export type MmdRuntimeTransferablePosePool = MmdRuntimeTransferablePosePoolInternal;

/** @deprecated Use createWorkerMmdRuntimeFactory with ThreeMmdLoader. Low-level worker components will leave the public API in 1.0.0. */
export const acquireMmdRuntimeSharedPoseWriteSlot = acquireMmdRuntimeSharedPoseWriteSlotInternal;

/** @deprecated Use createWorkerMmdRuntimeFactory with ThreeMmdLoader. Low-level worker components will leave the public API in 1.0.0. */
export const createMmdRuntimeSharedPoseReadBuffer = createMmdRuntimeSharedPoseReadBufferInternal;

/** @deprecated Use createWorkerMmdRuntimeFactory with ThreeMmdLoader. Low-level worker components will leave the public API in 1.0.0. */
export const createMmdRuntimeSharedPoseSlots = createMmdRuntimeSharedPoseSlotsInternal;

/** @deprecated Use createWorkerMmdRuntimeFactory with ThreeMmdLoader. Low-level worker components will leave the public API in 1.0.0. */
export const publishMmdRuntimeSharedPose = publishMmdRuntimeSharedPoseInternal;

/** @deprecated Use createWorkerMmdRuntimeFactory with ThreeMmdLoader. Low-level worker components will leave the public API in 1.0.0. */
export const readMmdRuntimeSharedPoseInto = readMmdRuntimeSharedPoseIntoInternal;

/** @deprecated Use createWorkerMmdRuntimeFactory with ThreeMmdLoader. Low-level worker components will leave the public API in 1.0.0. */
export const releaseMmdRuntimeSharedPoseReadSlot = releaseMmdRuntimeSharedPoseReadSlotInternal;

/** @deprecated Use createWorkerMmdRuntimeFactory with ThreeMmdLoader. Low-level worker components will leave the public API in 1.0.0. */
export const resetMmdRuntimeSharedPoseSlot = resetMmdRuntimeSharedPoseSlotInternal;

/** @deprecated Use createWorkerMmdRuntimeFactory with ThreeMmdLoader. Low-level worker components will leave the public API in 1.0.0. */
export const MMD_RUNTIME_POSE_PROTOCOL_VERSION = MMD_RUNTIME_POSE_PROTOCOL_VERSIONInternal;

/** @deprecated Use createWorkerMmdRuntimeFactory with ThreeMmdLoader. Low-level worker components will leave the public API in 1.0.0. */
export const captureMmdRuntimePoseInto = captureMmdRuntimePoseIntoInternal;

/** @deprecated Use createWorkerMmdRuntimeFactory with ThreeMmdLoader. Low-level worker components will leave the public API in 1.0.0. */
export const copyMmdRuntimePoseInto = copyMmdRuntimePoseIntoInternal;

/** @deprecated Use createWorkerMmdRuntimeFactory with ThreeMmdLoader. Low-level worker components will leave the public API in 1.0.0. */
export const createMmdRuntimePoseBuffer = createMmdRuntimePoseBufferInternal;

/** @deprecated Use createWorkerMmdRuntimeFactory with ThreeMmdLoader. Low-level worker components will leave the public API in 1.0.0. */
export const isCurrentMmdRuntimePose = isCurrentMmdRuntimePoseInternal;

/** @deprecated Use createWorkerMmdRuntimeFactory with ThreeMmdLoader. Low-level worker components will leave the public API in 1.0.0. */
export type MmdRuntimeWorkerHostOptions = MmdRuntimeWorkerHostOptionsInternal;

/** @deprecated Use createWorkerMmdRuntimeFactory with ThreeMmdLoader. Low-level worker components will leave the public API in 1.0.0. */
export type MmdRuntimeWorkerEndpointOptions = MmdRuntimeWorkerEndpointOptionsInternal;

/** @deprecated Use createWorkerMmdRuntimeFactory with ThreeMmdLoader. Low-level worker components will leave the public API in 1.0.0. */
export type MmdRuntimeWorkerCommandEnvelope = MmdRuntimeWorkerCommandEnvelopeInternal;

/** @deprecated Use createWorkerMmdRuntimeFactory with ThreeMmdLoader. Low-level worker components will leave the public API in 1.0.0. */
export type MmdRuntimeWorkerEventEnvelope = MmdRuntimeWorkerEventEnvelopeInternal;

/** @deprecated Use createWorkerMmdRuntimeFactory with ThreeMmdLoader. Low-level worker components will leave the public API in 1.0.0. */
export type MmdRuntimeWorkerMessagePort = MmdRuntimeWorkerMessagePortInternal;

/** @deprecated Use createWorkerMmdRuntimeFactory with ThreeMmdLoader. Low-level worker components will leave the public API in 1.0.0. */
export type MmdRuntimeWorkerMultiplexedCommand = MmdRuntimeWorkerMultiplexedCommandInternal;

/** @deprecated Use createWorkerMmdRuntimeFactory with ThreeMmdLoader. Low-level worker components will leave the public API in 1.0.0. */
export type MmdRuntimeWorkerMultiplexedEvent = MmdRuntimeWorkerMultiplexedEventInternal;

/** @deprecated Use createWorkerMmdRuntimeFactory with ThreeMmdLoader. Low-level worker components will leave the public API in 1.0.0. */
export type MmdRuntimeWorkerMultiplexedMessagePort = MmdRuntimeWorkerMultiplexedMessagePortInternal;

/** @deprecated Use createWorkerMmdRuntimeFactory with ThreeMmdLoader. Low-level worker components will leave the public API in 1.0.0. */
export type MmdRuntimeWorkerDispatcherCommand = MmdRuntimeWorkerDispatcherCommandInternal;

/** @deprecated Use createWorkerMmdRuntimeFactory with ThreeMmdLoader. Low-level worker components will leave the public API in 1.0.0. */
export type MmdRuntimeWorkerDispatcherMessagePort = MmdRuntimeWorkerDispatcherMessagePortInternal;

/** @deprecated Use createWorkerMmdRuntimeFactory with ThreeMmdLoader. Low-level worker components will leave the public API in 1.0.0. */
export type MmdRuntimePoseApplyScratch = MmdRuntimePoseApplyScratchInternal;
