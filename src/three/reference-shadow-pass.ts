import * as THREE from "three";
import { attachMmdSdefSkinning } from "./material/material-sdef.js";
import { attachMmdReferenceShadow, type MmdReferenceShadowUniforms } from "./material/material-reference-shadow.js";
import { getMmdShadowProjection } from "./mmd-shadow-projection.js";
import { MMD_SELF_SHADOW_LAYER } from "./shadow.js";
import { castsMmdReferenceShadow } from "./material/material-shadow-casting.js";

interface Entry {
  mesh: THREE.Mesh;
  source: THREE.Material | THREE.Material[];
  depth: THREE.Material | THREE.Material[];
  sourceMaterials: THREE.Material[];
  depthMaterials: THREE.Material[];
}

/** R32F z/w color target, separate from the raster depth buffer, as in MMD. */
export class MmdWebGlReferenceShadowPass {
  readonly projection;
  readonly target: THREE.WebGLRenderTarget;
  readonly uniforms: MmdReferenceShadowUniforms;
  private readonly roots = new Map<THREE.Object3D, Entry[]>();
  private readonly clearColor = new THREE.Color();
  private disposed = false;

  get empty(): boolean { return this.roots.size === 0; }

  constructor(private readonly renderer: THREE.WebGLRenderer, readonly light: THREE.DirectionalLight) {
    this.projection = getMmdShadowProjection(light);
    this.projection.retain();
    const width = Math.max(1, Math.floor(light.shadow.mapSize.x));
    const height = Math.max(1, Math.floor(light.shadow.mapSize.y));
    this.target = new THREE.WebGLRenderTarget(width, height, {
      format: THREE.RedFormat, type: THREE.FloatType, minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter, depthBuffer: true, generateMipmaps: false
    });
    this.target.texture.name = "MMD R32F shadow z/w";
    this.uniforms = {
      mmdReferenceMap: { value: this.target.texture },
      mmdReferenceMatrix: { value: this.projection.sampleMatrix },
      mmdReferenceMode: this.projection.mode,
      mmdReferenceSampling: this.projection.sampling,
      mmdReferenceBias: this.projection.receiverBias,
      mmdReferenceNormalBias: this.projection.normalBias,
      mmdReferenceEnabled: { value: 0 },
      mmdReferenceSize: { value: new THREE.Vector2(width,height) }
    };
  }

  add(root: THREE.Object3D): void {
    if (this.roots.has(root)) return;
    const entries: Entry[] = [];
    root.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const source = mesh.material;
      const materials = Array.isArray(source) ? source : [source];
      const depth = materials.map(material => {
        if (material.userData.mmdMaterial) attachMmdReferenceShadow(material, this.uniforms);
        const caster = new THREE.MeshDepthMaterial({ side: material.side, blending: THREE.NoBlending });
        attachMmdSdefSkinning(caster);
        const compile = caster.onBeforeCompile.bind(caster);
        caster.onBeforeCompile = (shader, renderer) => {
          compile(shader, renderer);
          shader.uniforms.mmdReferenceMatrix = this.uniforms.mmdReferenceMatrix;
          shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
uniform mat4 mmdReferenceMatrix; varying vec4 vMmdDepth;`)
            .replace("#include <project_vertex>", `#include <project_vertex>
vMmdDepth = mmdReferenceMatrix * modelMatrix * vec4(transformed, 1.0);`);
          shader.fragmentShader = `varying vec4 vMmdDepth; void main() { gl_FragColor = vec4(vMmdDepth.z / vMmdDepth.w, 0.0, 0.0, 1.0); }`;
        };
        caster.customProgramCacheKey = () => "mmd-reference-depth-sdef";
        return caster;
      });
      entries.push({ mesh, source, depth: Array.isArray(source) ? depth : depth[0], sourceMaterials: materials, depthMaterials: depth });
    });
    this.roots.set(root, entries);
  }

  remove(root: THREE.Object3D): void {
    const entries = this.roots.get(root);
    if (!entries) return;
    for (const entry of entries) {
      for (const material of entry.depthMaterials) material.dispose();
    }
    this.roots.delete(root);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const root of this.roots.keys()) this.remove(root);
    this.uniforms.mmdReferenceEnabled.value = 0;
    this.target.dispose();
    this.projection.release();
  }

  render(scene: THREE.Scene, camera: THREE.Camera, enabled: boolean, mode: number, distance: number): void {
    this.uniforms.mmdReferenceEnabled.value = enabled ? 1 : 0;
    this.projection.update(camera, mode, distance);
    const renderer = this.renderer;
    const oldShadow = renderer.shadowMap.enabled;
    const oldTarget = renderer.getRenderTarget();
    const background = scene.background;
    const override = scene.overrideMaterial;
    renderer.getClearColor(this.clearColor);
    const alpha = renderer.getClearAlpha();
    renderer.shadowMap.enabled = false;
    try {
      if (enabled) {
        for (const entries of this.roots.values()) for (const entry of entries) {
          const source = entry.sourceMaterials;
          const depth = entry.depthMaterials;
          for (let i = 0; i < depth.length; i++) {
            depth[i].visible = entry.mesh.castShadow && castsMmdReferenceShadow(source[i]);
          }
          entry.mesh.material = entry.depth;
        }
        scene.background = null;
        scene.overrideMaterial = null;
        renderer.setRenderTarget(this.target);
        renderer.setClearColor(0xffffff, 1);
        this.light.shadow.camera.layers.set(MMD_SELF_SHADOW_LAYER);
        renderer.render(scene, this.light.shadow.camera);
      }
    } catch (error) {
      renderer.shadowMap.enabled = oldShadow;
      throw error;
    } finally {
      for (const entries of this.roots.values()) for (const entry of entries) entry.mesh.material = entry.source;
      scene.background = background;
      scene.overrideMaterial = override;
      renderer.setRenderTarget(oldTarget);
      renderer.setClearColor(this.clearColor, alpha);
    }
    try { renderer.render(scene, camera); }
    finally { renderer.shadowMap.enabled = oldShadow; }
  }
}
