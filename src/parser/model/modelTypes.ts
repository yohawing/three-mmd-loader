export type MmdModelFormat = "pmx" | "pmd" | "auto";

export interface InitCoreOptions {
  wasmUrl?: string | URL;
}

export interface LoadModelOptions {
  format?: MmdModelFormat;
}

export interface ModelMetadata {
  format: "pmx" | "pmd";
  version: number;
  encoding: "utf-8" | "utf-16-le" | "shift-jis" | "unknown";
  name: string;
  englishName: string;
  comment: string;
  englishComment: string;
  counts: {
    vertices: number;
    faces: number;
    materials: number;
    bones: number;
    morphs: number;
    displayFrames: number;
    rigidBodies: number;
    joints: number;
    softBodies: number;
  };
  indexSizes: {
    vertex: number;
    texture: number;
    material: number;
    bone: number;
    morph: number;
    rigidBody: number;
  };
  additionalUvCount: number;
  diagnostics: Diagnostic[];
}

export interface Diagnostic {
  level: "warning" | "error";
  code: string;
  message: string;
}

export interface GeometryBuffers {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  additionalUvs: Float32Array[];
  indices: Uint16Array | Uint32Array;
  edgeScale?: Float32Array;
  materialGroups?: GeometryMaterialGroup[];
  skinIndices: Uint16Array;
  skinWeights: Float32Array;
  sdef?: SdefGeometryBuffers;
}

export interface GeometryMaterialGroup {
  start: number;
  count: number;
  materialIndex: number;
}

export interface SdefGeometryBuffers {
  enabled: Float32Array;
  c: Float32Array;
  r0: Float32Array;
  r1: Float32Array;
  rw0: Float32Array;
  rw1: Float32Array;
}

export interface MaterialInfo {
  name: string;
  englishName: string;
  texturePath: string;
  textureInfo?: MaterialTextureInfo;
  sphereTexturePath: string;
  sphereTextureInfo?: MaterialTextureInfo;
  sphereMode: "none" | "multiply" | "add" | "subTexture";
  toonTexturePath: string;
  toonTextureInfo?: MaterialTextureInfo;
  sharedToonIndex: number | undefined;
  diffuse: [number, number, number, number];
  specular: [number, number, number];
  specularPower: number;
  ambient: [number, number, number];
  evaluatedTransparency?: number;
  edgeColor: [number, number, number, number];
  edgeSize: number;
  flags: MaterialFlags;
  faceCount: number;
}

export interface MaterialTextureInfo {
  noMipmap: boolean;
  invertY: boolean;
  samplingMode: number;
  imageIndex: number;
}

export interface EmbeddedTextureData {
  path: string;
  mimeType: string | undefined;
  data: Uint8Array;
}

export interface MaterialRuntimeState {
  diffuse: [number, number, number, number];
  specular: [number, number, number];
  specularPower: number;
  ambient: [number, number, number];
  edgeColor: [number, number, number, number];
  edgeSize: number;
  textureFactor: [number, number, number, number];
  sphereTextureFactor: [number, number, number, number];
  toonTextureFactor: [number, number, number, number];
}

export interface MaterialFlags {
  doubleSided: boolean;
  groundShadow: boolean;
  selfShadowMap: boolean;
  selfShadow: boolean;
  edge: boolean;
  vertexColor: boolean;
  pointDraw: boolean;
  lineDraw: boolean;
}

export interface SkeletonData {
  bones: BoneData[];
}

export interface BoneData {
  name: string;
  englishName: string;
  parentIndex: number;
  layer: number;
  position: [number, number, number];
  tailIndex: number;
  tailPosition: [number, number, number] | undefined;
  flags: BoneFlags;
  appendTransform?: BoneAppendTransform;
  fixedAxis?: [number, number, number];
  localAxis?: {
    x: [number, number, number];
    z: [number, number, number];
  };
  externalParentKey?: number;
  ikStateName?: string;
  ik?: BoneIk;
}

export interface BoneFlags {
  indexedTail: boolean;
  rotatable: boolean;
  translatable: boolean;
  visible: boolean;
  enabled: boolean;
  ik: boolean;
  appendLocal: boolean;
  appendRotate: boolean;
  appendTranslate: boolean;
  fixedAxis: boolean;
  localAxis: boolean;
  transformAfterPhysics: boolean;
  externalParentTransform: boolean;
}

export interface BoneAppendTransform {
  parentIndex: number;
  weight: number;
}

export interface BoneIk {
  targetIndex: number;
  loopCount: number;
  limitAngle: number;
  links: BoneIkLink[];
}

export interface BoneIkLink {
  boneIndex: number;
  limits?: {
    kind?: "pmdKnee";
    lower: [number, number, number];
    upper: [number, number, number];
  };
}

export interface MorphData {
  name: string;
  englishName: string;
  type:
    | "base"
    | "group"
    | "vertex"
    | "bone"
    | "uv"
    | "additionalUv"
    | "material"
    | "flip"
    | "impulse"
    | "unknown";
  vertexOffsets: Array<{
    vertexIndex: number;
    position: [number, number, number];
  }>;
  densePositionOffsets?: Float32Array;
  groupOffsets: Array<{
    morphIndex: number;
    weight: number;
  }>;
  boneOffsets: Array<{
    boneIndex: number;
    translation: [number, number, number];
    rotation: [number, number, number, number];
  }>;
  uvOffsets: Array<{
    vertexIndex: number;
    uv: [number, number, number, number];
  }>;
  denseUvOffsets?: Float32Array;
  additionalUvOffsets: Array<{
    vertexIndex: number;
    uvIndex: number;
    uv: [number, number, number, number];
  }>;
  denseAdditionalUvOffsets?: Array<Float32Array | undefined>;
  materialOffsets: MaterialMorphOffset[];
  flipOffsets?: Array<{
    morphIndex: number;
    weight: number;
  }>;
  impulseOffsets?: Array<{
    rigidBodyIndex: number;
    local: boolean;
    velocity: [number, number, number];
    torque: [number, number, number];
  }>;
}

export interface MaterialMorphOffset {
  materialIndex: number;
  operation: "multiply" | "add";
  diffuse: [number, number, number, number];
  specular: [number, number, number];
  specularPower: number;
  ambient: [number, number, number];
  edgeColor: [number, number, number, number];
  edgeSize: number;
  textureFactor: [number, number, number, number];
  sphereTextureFactor: [number, number, number, number];
  toonTextureFactor: [number, number, number, number];
}

export interface RigidBodyData {
  name: string;
  englishName: string;
  boneIndex: number;
  group: number;
  mask: number;
  shape: "sphere" | "box" | "capsule" | "unknown";
  size: [number, number, number];
  position: [number, number, number];
  rotation: [number, number, number];
  mass: number;
  linearDamping: number;
  angularDamping: number;
  restitution: number;
  friction: number;
  mode: "static" | "dynamic" | "dynamicBone" | "unknown";
}

export interface JointData {
  name: string;
  englishName: string;
  type:
    | "generic6dofSpring"
    | "generic6dof"
    | "point2point"
    | "coneTwist"
    | "slider"
    | "hinge"
    | "unknown";
  rigidBodyIndexA: number;
  rigidBodyIndexB: number;
  position: [number, number, number];
  rotation: [number, number, number];
  translationLowerLimit: [number, number, number];
  translationUpperLimit: [number, number, number];
  rotationLowerLimit: [number, number, number];
  rotationUpperLimit: [number, number, number];
  springTranslationFactor: [number, number, number];
  springRotationFactor: [number, number, number];
}

export interface SoftBodyData {
  name: string;
  englishName: string;
  type: "triMesh" | "rope" | "unknown";
  materialIndex: number;
  collisionGroup: number;
  collisionMask: number;
  flags: number;
  bendingConstraintsDistance: number;
  clusterCount: number;
  totalMass: number;
  collisionMargin: number;
  aeroModel:
    | "vertexPoint"
    | "vertexTwoSided"
    | "vertexOneSided"
    | "faceTwoSided"
    | "faceOneSided"
    | "unknown";
  config: {
    velocityCorrectionFactor: number;
    dampingCoefficient: number;
    dragCoefficient: number;
    liftCoefficient: number;
    pressureCoefficient: number;
    volumeConversationCoefficient: number;
    dynamicFrictionCoefficient: number;
    poseMatchingCoefficient: number;
    rigidContactHardness: number;
    kineticContactHardness: number;
    softContactHardness: number;
    anchorHardness: number;
  };
  cluster: {
    softVsRigidHardness: number;
    softVsKineticHardness: number;
    softVsSoftHardness: number;
    softVsRigidImpulseSplit: number;
    softVsKineticImpulseSplit: number;
    softVsSoftImpulseSplit: number;
  };
  iteration: {
    velocity: number;
    position: number;
    drift: number;
    cluster: number;
  };
  material: {
    linearStiffnessCoefficient: number;
    angularStiffnessCoefficient: number;
    volumeStiffnessCoefficient: number;
  };
  anchors: Array<{
    rigidBodyIndex: number;
    vertexIndex: number;
    nearMode: boolean;
  }>;
  pinnedVertexIndices: number[];
}

export interface DisplayFrameData {
  name: string;
  englishName: string;
  special: boolean;
  frames: DisplayFrameElementData[];
}

export interface DisplayFrameElementData {
  type: "bone" | "morph" | "unknown";
  index: number;
}

export interface MmdAnimation {
  readonly kind: "vmd";
  readonly bytes: Uint8Array;
  readonly metadata: VmdMetadata;
  readonly boneTracks: Record<string, VmdBoneFrame[]>;
  readonly morphTracks: Record<string, VmdMorphFrame[]>;
  readonly cameraFrames: VmdCameraFrame[];
  readonly lightFrames: VmdLightFrame[];
  readonly selfShadowFrames: VmdSelfShadowFrame[];
  readonly propertyFrames: VmdPropertyFrame[];
}

export interface MmdAnimationSpan {
  readonly animation: MmdAnimation;
  readonly startFrame?: number;
  readonly endFrame?: number;
  readonly offsetFrame?: number;
  readonly weight?: number;
  readonly easeInFrameTime?: number;
  readonly easeOutFrameTime?: number;
  readonly easingFunction?: (t: number) => number;
}

export interface MmdCompositeAnimationOptions {
  readonly name?: string;
  readonly spans: readonly MmdAnimationSpan[];
}

export interface MmdPose {
  readonly kind: "vpd";
  readonly bytes: Uint8Array;
  readonly metadata: VpdMetadata;
  readonly bones: Record<string, VpdBonePose>;
  readonly morphs: Record<string, number>;
}

export interface VmdMetadata {
  modelName: string;
  counts: {
    bones: number;
    morphs: number;
    cameras: number;
    lights: number;
    selfShadows: number;
    properties: number;
  };
  maxFrame: number;
}

export interface VmdBoneFrame {
  frame: number;
  translation: [number, number, number];
  rotation: [number, number, number, number];
  interpolation?: VmdBoneInterpolation;
  /** Babylon-MMD-compatible per-bone physics toggle parsed from VMD interpolation metadata. */
  physicsToggle?: number;
}

export interface VmdMorphFrame {
  frame: number;
  weight: number;
}

export interface VmdCameraFrame {
  frame: number;
  distance: number;
  position: [number, number, number];
  rotation: [number, number, number];
  fov: number;
  perspective: boolean;
  interpolation?: VmdCameraInterpolation;
}

export type VmdInterpolationCurve = [number, number, number, number];

export interface VmdBoneInterpolation {
  translationX: VmdInterpolationCurve;
  translationY: VmdInterpolationCurve;
  translationZ: VmdInterpolationCurve;
  rotation: VmdInterpolationCurve;
}

export interface VmdCameraInterpolation {
  distance: VmdInterpolationCurve;
  positionX: VmdInterpolationCurve;
  positionY: VmdInterpolationCurve;
  positionZ: VmdInterpolationCurve;
  rotation: VmdInterpolationCurve;
  fov: VmdInterpolationCurve;
}

export interface VmdLightFrame {
  frame: number;
  color: [number, number, number];
  direction: [number, number, number];
}

export interface VmdSelfShadowFrame {
  frame: number;
  mode: number;
  distance: number;
}

export interface VmdPropertyFrame {
  frame: number;
  visible: boolean;
  physicsSimulation: boolean;
  ikStates: VmdIkState[];
}

export interface VmdIkState {
  boneName: string;
  enabled: boolean;
}

export interface CameraState {
  distance: number;
  position: [number, number, number];
  rotation: [number, number, number];
  fov: number;
  perspective: boolean;
}

export interface LightState {
  color: [number, number, number];
  direction: [number, number, number];
}

export interface VpdMetadata {
  modelFile: string;
  boneCount: number;
  morphCount: number;
}

export interface VpdBonePose {
  name: string;
  translation: [number, number, number];
  rotation: [number, number, number, number];
}

export interface MmdModel {
  metadata(): ModelMetadata;
  geometry(): GeometryBuffers;
  materials(): MaterialInfo[];
  skeleton(): SkeletonData;
  morphs(): MorphData[];
  displayFrames(): DisplayFrameData[];
  rigidBodies(): RigidBodyData[];
  joints(): JointData[];
  softBodies(): SoftBodyData[];
  embeddedTextures(): EmbeddedTextureData[];
}

export interface MmdCore {
  version(): string;
  healthCheck(): boolean;
  loadModel(bytes: ArrayBuffer | Uint8Array, options?: LoadModelOptions): MmdModel;
  loadVmd(bytes: ArrayBuffer | Uint8Array): MmdAnimation;
  loadVpd(bytes: ArrayBuffer | Uint8Array): MmdPose;
  loadVpdAnimation(bytes: ArrayBuffer | Uint8Array, name?: string): MmdAnimation;
}
