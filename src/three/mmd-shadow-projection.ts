import * as THREE from "three";
import { fitMmdSelfShadowDirectionalLightToBox } from "./shadow.js";

/** View-independent fitted orthographic projection for MMD self shadows. */
export class MmdShadowProjection {
  readonly matrix = new THREE.Matrix4();
  readonly sampleMatrix = new THREE.Matrix4();
  readonly mode = { value: 1 };
  readonly direction = new THREE.Vector3(-0.5, -1, 0.5); // authored LH travel direction
  readonly bounds = new THREE.Box3();
  private readonly stableLight = new THREE.DirectionalLight();
  private readonly stableFitOptions = { marginScale: 0.06, minNear: 0.02, minFarSpan: 2, maxFar: 80 };
  private readonly conversion = new THREE.Matrix4();
  private readonly originalCamera: THREE.OrthographicCamera;
  private readonly originalReversedDepth: boolean;
  private readonly originalUpdateProjection: THREE.OrthographicCamera["updateProjectionMatrix"];
  private readonly originalUpdateShadow: THREE.DirectionalLight["shadow"]["updateMatrices"];
  private readonly originalShadowMatrix = new THREE.Matrix4();
  private owners = 0;

  constructor(readonly light: THREE.DirectionalLight) {
    if (light.userData.mmdLightDirection) this.direction.fromArray(light.userData.mmdLightDirection);
    const camera = light.shadow.camera;
    this.originalCamera = camera.clone();
    this.originalReversedDepth = camera.reversedDepth;
    this.originalUpdateProjection = camera.updateProjectionMatrix;
    this.originalUpdateShadow = light.shadow.updateMatrices;
    this.originalShadowMatrix.copy(light.shadow.matrix);
    // The complete world->clip transform lives in projectionMatrix. Keeping the
    // view identity keeps raw-depth sampling independent of the raster backend.
    camera.matrixAutoUpdate = false;
    camera.matrixWorldAutoUpdate = false;
    camera.matrix.identity();
    camera.matrixWorld.identity();
    camera.matrixWorldInverse.identity();
    camera.updateProjectionMatrix = () => this.updateMatrices();
    light.shadow.updateMatrices = () => this.updateMatrices();
    light.userData.mmdShadowProjection = this;
  }

  retain(): void { this.owners++; }

  release(): void {
    if (this.owners === 0 || --this.owners > 0) return;
    const camera = this.light.shadow.camera;
    camera.copy(this.originalCamera, false);
    (camera as unknown as { _reversedDepth: boolean })._reversedDepth = this.originalReversedDepth;
    camera.updateProjectionMatrix = this.originalUpdateProjection;
    this.light.shadow.updateMatrices = this.originalUpdateShadow;
    this.light.shadow.matrix.copy(this.originalShadowMatrix);
    delete this.light.userData.mmdShadowProjection;
  }

  update(mode = 1): void {
    this.mode.value = mode === 2 ? 2 : 1;
    this.updateMatrices();
  }

  private updateMatrices(): void {
    if (!this.bounds.isEmpty()) {
      this.stableLight.position.set(-this.direction.x, -this.direction.y, this.direction.z);
      this.stableLight.target.position.set(0, 0, 0);
      fitMmdSelfShadowDirectionalLightToBox(this.stableLight, this.bounds, this.stableFitOptions);
    } else {
      // Library callers can configure the light's orthographic volume themselves.
      // Viewer bounds are optional; do not replace that volume with default extents.
      const source = this.light.shadow.camera;
      const camera = this.stableLight.shadow.camera;
      camera.left = source.left;
      camera.right = source.right;
      camera.top = source.top;
      camera.bottom = source.bottom;
      camera.near = source.near;
      camera.far = source.far;
      camera.updateProjectionMatrix();
      this.light.getWorldPosition(this.stableLight.position);
      this.light.target.getWorldPosition(this.stableLight.target.position);
      this.stableLight.updateMatrixWorld();
      this.stableLight.target.updateMatrixWorld();
      this.stableLight.shadow.updateMatrices(this.stableLight);
    }
    const camera = this.stableLight.shadow.camera;
    this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    // OpenGL depth -> backend-independent [0,1] raw depth.
    this.conversion.set(1,0,0,0, 0,1,0,0, 0,0,0.5,0.5, 0,0,0,1);
    this.matrix.premultiply(this.conversion);
    this.finishProjection();
  }

  private finishProjection(): void {
    this.conversion.set(0.5, 0, 0, 0.5, 0, -0.5, 0, 0.5, 0, 0, 1, 0, 0, 0, 0, 1);
    this.sampleMatrix.multiplyMatrices(this.conversion, this.matrix);
    const camera = this.light.shadow.camera;
    const gpu = camera.coordinateSystem === THREE.WebGPUCoordinateSystem;
    const reversed = camera.reversedDepth;
    this.conversion.set(1, 0, 0, 0, 0, 1, 0, 0,
      0, 0, reversed ? (gpu ? -1 : -2) : (gpu ? 1 : 2), reversed ? 1 : (gpu ? 0 : -1),
      0, 0, 0, 1);
    camera.projectionMatrix.multiplyMatrices(this.conversion, this.matrix);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    this.light.shadow.getFrustum().setFromProjectionMatrix(camera.projectionMatrix, camera.coordinateSystem, reversed);
    // Diagnostics and standard shadow coordinates still reflect raster space.
    this.conversion.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5,
      0, 0, gpu || reversed ? 1 : 0.5, gpu || reversed ? 0 : 0.5, 0, 0, 0, 1);
    this.light.shadow.matrix.multiplyMatrices(this.conversion, camera.projectionMatrix);
  }
}

export function getMmdShadowProjection(light: THREE.DirectionalLight): MmdShadowProjection {
  return light.userData.mmdShadowProjection ?? new MmdShadowProjection(light);
}
