import type { MaterialRuntimeState } from "../parser/model/modelTypes.js";
import * as THREE from "three/webgpu";
import * as TSL from "three/tsl";

import { mmdMaterialDepthWrite, mmdMaterialSuppressesColorAtAlpha } from "../three/material/material-metadata.js";
import { clampColor } from "../three/utils.js";

export const MMD_TSL_DEFAULT_LIGHT_COLOR = 154 / 255;
export const MMD_TSL_DEFAULT_TOON_COORD_OFFSET = 0.45;

const defaultLightDirection = new THREE.Vector3(0.5, 1.0, 1.0).normalize();

interface MmdTslSourceRenderFlags {
  readonly transparent: boolean;
  readonly depthWrite: boolean;
}

interface ShadowLightNode extends THREE.Node {
  readonly shadowNode: THREE.Node<"vec4"> | null;
}

class MmdTslLightingModel extends THREE.LightingModel {
  private readonly shadowTint = TSL.vec3(1, 1, 1).toVar("mmdShadowTint");

  override direct({ lightNode }: Parameters<THREE.LightingModel["direct"]>[0]): void {
    const shadowNode = (lightNode as ShadowLightNode).shadowNode;
    if (shadowNode !== null) {
      this.shadowTint.mulAssign(shadowNode.rgb);
    }
  }

  override finish(builder: Parameters<THREE.LightingModel["finish"]>[0]): void {
    const { outgoingLight } = (builder as unknown as {
      readonly context: { readonly outgoingLight: unknown };
    }).context;
    const typedOutgoingLight = outgoingLight as {
      readonly rgb: { assign(value: THREE.Node): void };
    };
    typedOutgoingLight.rgb.assign(TSL.diffuseColor.rgb.mul(this.shadowTint));
  }
}

// MMD color nodes already include direct and ambient lighting. Keep Three's light
// traversal only for shadow sampling instead of applying ToonLightingModel again.
class MmdTslToonNodeMaterial extends THREE.MeshToonNodeMaterial {
  override setupOutgoingLight(): THREE.Node {
    return TSL.diffuseColor.rgb;
  }

  override setupLightingModel(): MmdTslLightingModel {
    return new MmdTslLightingModel();
  }
}

export interface MmdTslMaterialCoreOptions {
  readonly diffuse?: readonly [number, number, number];
  readonly ambient?: readonly [number, number, number];
  readonly specular?: readonly [number, number, number];
  readonly specularPower?: number;
  readonly lightColor?: readonly [number, number, number];
  readonly lightDirection?: THREE.Vector3;
  readonly toonCoordinateOffset?: number;
  readonly textureFactor?: readonly [number, number, number, number];
  readonly sphereTextureFactor?: readonly [number, number, number, number];
  readonly toonTextureFactor?: readonly [number, number, number, number];
  readonly shadowTint?: readonly [number, number, number];
  readonly diffuseMap?: THREE.Texture;
  readonly toonMap?: THREE.Texture;
  readonly sphereMap?: THREE.Texture;
  readonly sphereMode?: "none" | "multiply" | "add" | "subTexture";
  readonly gammaSpaceComposite?: boolean;
  /**
   * When true, emit gamma-space composite RGB directly and pair the renderer with
   * `outputColorSpace = LinearSRGBColorSpace`. Reproduces legacy WebGL gamma-space
   * framebuffer blending (no material EOTF before the framebuffer). Default false
   * keeps experimental linear output via sRGBTransferEOTF + SRGBColorSpace.
   */
  readonly legacySrgbFramebuffer?: boolean;
}

export interface MmdTslMaterialUniforms {
  readonly diffuse: THREE.Vector3;
  readonly ambient: THREE.Vector3;
  readonly specular: THREE.Vector3;
  readonly specularPower: ReturnType<typeof TSL.float> & { value: number };
  readonly toonCoordinateOffset: ReturnType<typeof TSL.float> & { value: number };
  readonly lightColor: THREE.Vector3;
  readonly lightDirection: THREE.Vector3;
  readonly shadowTint: THREE.Vector3;
  readonly textureFactor: THREE.Vector4;
  readonly sphereTextureFactor: THREE.Vector4;
  readonly toonTextureFactor: THREE.Vector4;
}

export function createMmdTslToonMaterial(options: MmdTslMaterialCoreOptions = {}): THREE.MeshToonNodeMaterial {
  const material = new MmdTslToonNodeMaterial({ color: 0xffffff });
  const uniforms = createMmdTslMaterialUniforms(options);
  material.userData.mmdTslMaterialUniforms = uniforms;
  material.colorNode = createMmdTslBaseColorNode({ ...options, uniforms });
  if (options.diffuseMap) {
    material.opacityNode = (TSL.materialOpacity as unknown as {
      mul(node: THREE.Node): THREE.Node;
    }).mul(TSL.texture(options.diffuseMap).sample(TSL.uv()).a);
  }
  material.positionNode = TSL.positionLocal;
  material.normalNode = TSL.normalLocal;
  material.receivedShadowNode = createMmdTslReceivedShadowNode({ ...options, uniforms });
  material.castShadowNode = TSL.vec4(1, 1, 1, 1);
  material.castShadowPositionNode = TSL.positionLocal;
  return material;
}

export function createMmdTslBaseColorNode(options: MmdTslMaterialCoreOptions & {
  readonly uniforms?: MmdTslMaterialUniforms;
} = {}) {
  const uniforms = options.uniforms ?? createMmdTslMaterialUniforms(options);
  const diffuse = TSL.uniform(uniforms.diffuse);
  const ambient = TSL.uniform(uniforms.ambient);
  const specular = TSL.uniform(uniforms.specular);
  const specularPower = uniforms.specularPower;
  const toonCoordinateOffset = uniforms.toonCoordinateOffset;
  const lightColor = TSL.uniform(uniforms.lightColor);
  const textureFactor = TSL.uniform(uniforms.textureFactor);
  const sphereTextureFactor = TSL.uniform(uniforms.sphereTextureFactor);
  const toonTextureFactor = TSL.uniform(uniforms.toonTextureFactor);
  const lightDirectionNode = TSL.uniform(uniforms.lightDirection);
  const cameraViewMatrix = TSL.cameraViewMatrix as unknown as {
    transformDirection(direction: THREE.Node<"vec3">): THREE.Node<"vec3">;
  };
  const normalView = TSL.normalize(TSL.normalView);
  const lightDirectionView = TSL.normalize(
    cameraViewMatrix.transformDirection(lightDirectionNode as unknown as THREE.Node<"vec3">)
  );
  const halfDirection = TSL.normalize(TSL.positionViewDirection.add(lightDirectionView));
  const signedDot = TSL.dot(normalView, lightDirectionView);
  const lambert = TSL.max(0, signedDot);
  const toonCoordinate = TSL.clamp(
    signedDot.mul(0.5).add(toonCoordinateOffset),
    0,
    1
  );
  const textureMul = TSL.mix(TSL.vec3(1, 1, 1), textureFactor.rgb, textureFactor.a);
  const sampledToon = options.toonMap
    ? TSL.texture(options.toonMap).sample(TSL.vec2(0, toonCoordinate)).rgb
    : TSL.vec3(1, 1, 1);
  const toonMul = TSL.mix(TSL.vec3(1, 1, 1), sampledToon.mul(toonTextureFactor.rgb), toonTextureFactor.a);
  const sphereUv = TSL.normalView.xy.mul(0.5).add(TSL.vec2(0.5, 0.5));
  const sampledSphere = options.sphereMap
    ? TSL.texture(options.sphereMap).sample(sphereUv).rgb
    : TSL.vec3(1, 1, 1);
  const diffuseTexture = options.diffuseMap
    ? TSL.texture(options.diffuseMap).sample(TSL.uv()).rgb
    : TSL.vec3(1, 1, 1);
  // GLSL MMD path re-encodes only SRGBColorSpace samples (diffuse/sphere) before the
  // gamma-space composite. Toon ramps are NoColorSpace: sampled RGB is already the
  // authored ramp and must not be OETF-encoded again when gammaSpaceComposite is on
  // solely because a toon map is present.
  const compositeDiffuseTexture =
    options.gammaSpaceComposite === true && options.diffuseMap
      ? TSL.sRGBTransferOETF(diffuseTexture) as ReturnType<typeof TSL.vec3>
      : diffuseTexture;
  const compositeSphere =
    options.gammaSpaceComposite === true && options.sphereMap
      ? TSL.sRGBTransferOETF(sampledSphere) as ReturnType<typeof TSL.vec3>
      : sampledSphere;
  const litBase = options.toonMap
    ? TSL.clamp(diffuse.mul(lightColor).add(ambient), 0, 1)
    : TSL.clamp(ambient.add(lambert.mul(diffuse).mul(lightColor)), 0, 1);
  const baseComposite = litBase.mul(compositeDiffuseTexture).mul(textureMul).mul(toonMul);
  const sphereComposite =
    options.sphereMode === "multiply"
      ? baseComposite.mul(TSL.mix(TSL.vec3(1, 1, 1), compositeSphere.mul(sphereTextureFactor.rgb), sphereTextureFactor.a))
      : options.sphereMode === "add"
        // GoldenOracle full.fx and the MMD-generated baseline add the sampled sphere once.
        // The WebGL injection keeps its separate apitrace SphC weight contract.
        ? baseComposite.add(compositeSphere.mul(sphereTextureFactor.rgb).mul(sphereTextureFactor.a))
        : options.sphereMode === "subTexture"
          ? TSL.mix(baseComposite, compositeSphere, sphereTextureFactor.a)
          : baseComposite;
  const specularGate = specularPower.greaterThan(0).select(1, 0);
  const specularComposite = TSL.pow(TSL.max(0, TSL.dot(halfDirection, normalView)), specularPower)
    .mul(specular)
    .mul(lightColor)
    .mul(specularGate);
  // MMD composes in gamma space then always converts back to linear for Three's output
  // encode (ywMmdGammaToLinear), whether or not any texture contributed.
  const gammaComposite = TSL.clamp(sphereComposite.add(specularComposite), 0, 1);
  // legacySrgbFramebuffer: skip EOTF so alpha blending happens in gamma space, matching
  // the legacy WebGL MMD framebuffer path when paired with LinearSRGBColorSpace.
  if (options.legacySrgbFramebuffer === true) {
    return gammaComposite as ReturnType<typeof TSL.vec3>;
  }
  return TSL.sRGBTransferEOTF(gammaComposite) as ReturnType<typeof TSL.vec3>;
}

export function createMmdTslReceivedShadowNode(options: MmdTslMaterialCoreOptions & {
  readonly uniforms?: MmdTslMaterialUniforms;
} = {}) {
  const uniforms = options.uniforms ?? createMmdTslMaterialUniforms(options);
  const toonTextureFactor = TSL.uniform(uniforms.toonTextureFactor);
  const sampledSelfShadowTint = options.toonMap
    ? TSL.texture(options.toonMap).sample(TSL.vec2(0, 0)).rgb
    : TSL.uniform(uniforms.shadowTint);
  const selfShadowTint = options.toonMap
    ? TSL.mix(TSL.vec3(1, 1, 1), sampledSelfShadowTint.mul(toonTextureFactor.rgb), toonTextureFactor.a)
    : sampledSelfShadowTint;
  return TSL.Fn<[ReturnType<typeof TSL.vec4>], unknown>(
    ([shadow]) => TSL.mix(TSL.vec4(selfShadowTint, 1), TSL.vec4(1, 1, 1, 1), shadow.r)
  ) as unknown as () => THREE.Node;
}

export function syncMmdTslMaterialState(
  material: THREE.Material,
  state: MaterialRuntimeState
): void {
  const uniforms = material.userData.mmdTslMaterialUniforms as MmdTslMaterialUniforms | undefined;
  if (!uniforms) {
    return;
  }
  uniforms.diffuse.set(clampColor(state.diffuse[0]), clampColor(state.diffuse[1]), clampColor(state.diffuse[2]));
  uniforms.ambient.set(clampColor(state.ambient[0]), clampColor(state.ambient[1]), clampColor(state.ambient[2]));
  uniforms.specular.set(clampColor(state.specular[0]), clampColor(state.specular[1]), clampColor(state.specular[2]));
  uniforms.specularPower.value = state.specularPower;
  uniforms.textureFactor.set(
    state.textureFactor[0],
    state.textureFactor[1],
    state.textureFactor[2],
    state.textureFactor[3]
  );
  uniforms.sphereTextureFactor.set(
    state.sphereTextureFactor[0],
    state.sphereTextureFactor[1],
    state.sphereTextureFactor[2],
    state.sphereTextureFactor[3]
  );
  uniforms.toonTextureFactor.set(
    state.toonTextureFactor[0],
    state.toonTextureFactor[1],
    state.toonTextureFactor[2],
    state.toonTextureFactor[3]
  );
  const previousVisible = material.visible;
  const previousColorWrite = material.colorWrite;
  const previousTransparent = material.transparent;
  const previousDepthWrite = material.depthWrite;
  material.opacity = clampColor(state.diffuse[3]);
  const materialUserData = material.userData as {
    mmdMaterial?: {
      readonly flags?: Parameters<typeof mmdMaterialSuppressesColorAtAlpha>[1];
      readonly transparencyMode?: Parameters<typeof mmdMaterialDepthWrite>[0];
    };
    readonly mmdTslSourceRenderFlags?: MmdTslSourceRenderFlags;
  };
  const flags = materialUserData.mmdMaterial?.flags;
  const suppressColor = mmdMaterialSuppressesColorAtAlpha(material.opacity, flags);
  const transparencyMode = materialUserData.mmdMaterial?.transparencyMode;
  const sourceRenderFlags = materialUserData.mmdTslSourceRenderFlags;
  const usesAlphaBlend = transparencyMode === "alphaBlend";
  material.visible = material.opacity > 0 || suppressColor;
  material.colorWrite = !suppressColor;
  material.transparent = usesAlphaBlend || material.opacity < 1 || sourceRenderFlags?.transparent === true;
  material.depthWrite = transparencyMode
    ? mmdMaterialDepthWrite(transparencyMode)
    : sourceRenderFlags?.depthWrite ?? !material.transparent;
  if (
    material.visible !== previousVisible ||
    material.colorWrite !== previousColorWrite ||
    material.transparent !== previousTransparent ||
    material.depthWrite !== previousDepthWrite
  ) {
    material.needsUpdate = true;
  }
}

function createMmdTslMaterialUniforms(options: MmdTslMaterialCoreOptions): MmdTslMaterialUniforms {
  return {
    diffuse: vectorFromTuple(options.diffuse ?? [1, 1, 1]),
    ambient: vectorFromTuple(options.ambient ?? [0, 0, 0]),
    specular: vectorFromTuple(options.specular ?? [0, 0, 0]),
    specularPower: TSL.uniform(options.specularPower ?? 0, "float") as unknown as ReturnType<typeof TSL.float> & { value: number },
    toonCoordinateOffset: TSL.uniform(options.toonCoordinateOffset ?? MMD_TSL_DEFAULT_TOON_COORD_OFFSET, "float") as unknown as ReturnType<typeof TSL.float> & { value: number },
    lightColor: vectorFromTuple(options.lightColor ?? [
      MMD_TSL_DEFAULT_LIGHT_COLOR,
      MMD_TSL_DEFAULT_LIGHT_COLOR,
      MMD_TSL_DEFAULT_LIGHT_COLOR
    ]),
    lightDirection: (options.lightDirection ?? defaultLightDirection).clone(),
    shadowTint: vectorFromTuple(options.shadowTint ?? [1, 1, 1]),
    textureFactor: vector4FromTuple(options.textureFactor ?? [1, 1, 1, 1]),
    sphereTextureFactor: vector4FromTuple(options.sphereTextureFactor ?? [0, 0, 0, 0]),
    toonTextureFactor: vector4FromTuple(options.toonTextureFactor ?? [1, 1, 1, 1])
  };
}

function vectorFromTuple(value: readonly [number, number, number]): THREE.Vector3 {
  return new THREE.Vector3(value[0], value[1], value[2]);
}

function vector4FromTuple(value: readonly [number, number, number, number]): THREE.Vector4 {
  return new THREE.Vector4(value[0], value[1], value[2], value[3]);
}
