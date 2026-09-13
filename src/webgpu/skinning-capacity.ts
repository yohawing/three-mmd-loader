import type * as THREE from "three/webgpu";

// Three's TSL SkinningNode sends one mat4 per skeleton bone, including bones
// with no vertex weights. The legacy WebGLRenderer uses a bone texture instead.
const bytesPerBoneMatrix = 16 * Float32Array.BYTES_PER_ELEMENT;

export function validateMmdTslSkinningCapacity(
  mesh: THREE.SkinnedMesh,
  renderer: THREE.WebGPURenderer
): void {
  const backend = renderer.backend as unknown as {
    readonly isWebGPUBackend?: boolean;
    readonly device?: { readonly limits: { readonly maxUniformBufferBindingSize: number } };
  };
  let maxBytes: number | undefined;
  if (backend.isWebGPUBackend === true) {
    maxBytes = backend.device?.limits.maxUniformBufferBindingSize;
  } else {
    const context = renderer.getContext() as WebGL2RenderingContext;
    maxBytes = context.getParameter(context.MAX_UNIFORM_BLOCK_SIZE) as number;
  }
  if (typeof maxBytes !== "number" || !Number.isFinite(maxBytes) || maxBytes < bytesPerBoneMatrix) {
    throw new Error("Cannot check TSL bone capacity. Initialize the renderer before attaching a model.");
  }
  const maxBones = Math.floor(maxBytes / bytesPerBoneMatrix);
  const boneCount = mesh.skeleton.bones.length;
  if (boneCount > maxBones) {
    const error = new RangeError(
      `This model has ${boneCount} bones, but this TSL renderer supports at most ${maxBones}. ` +
      "Use the non-TSL WebGL renderer to display this model."
    );
    error.name = "MmdTslSkinningCapacityError";
    throw error;
  }
}
