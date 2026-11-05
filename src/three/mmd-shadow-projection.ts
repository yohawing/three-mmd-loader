import * as THREE from "three";
import { fitMmdSelfShadowDirectionalLightToBox } from "./shadow.js";

/** MMD 9.32 compatibility or a view-independent fitted orthographic projection. */
export class MmdShadowProjection {
  readonly matrix = new THREE.Matrix4();
  readonly sampleMatrix = new THREE.Matrix4();
  readonly mode = { value: 1 };
  readonly direction = new THREE.Vector3(-0.5, -1, 0.5); // authored LH travel direction
  projectionMode: "mmd" | "stable" = "mmd";
  readonly bounds = new THREE.Box3();
  /** 0: MMD linear/ramp, 1: legacy nearest/ramp, 2: legacy binary, 3: native legacy bias. */
  readonly sampling = { value: 0 };
  readonly receiverBias = { value: 0 };
  readonly normalBias = { value: 0 };
  private readonly stableLight = new THREE.DirectionalLight();
  private readonly stableFitOptions = { marginScale: 0.06, minNear: 0.02, minFarSpan: 2, maxFar: 80 };
  distance = 0.01125;
  private viewCamera?: THREE.Camera;
  private readonly frame = new THREE.Matrix4();
  private readonly lightView = new THREE.Matrix4();
  private readonly projection = new THREE.Matrix4();
  private readonly conversion = new THREE.Matrix4();
  private readonly directionView = new THREE.Vector3();
  private readonly x = new THREE.Vector3();
  private readonly y = new THREE.Vector3();
  private readonly z = new THREE.Vector3();
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
    // view identity avoids decomposing MMD's projective warp as an affine camera.
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

  update(viewCamera: THREE.Camera, mode = 1, distance = 0.01125): void {
    this.viewCamera = viewCamera;
    this.mode.value = mode === 2 ? 2 : 1;
    this.distance = Number.isFinite(distance) ? Math.max(distance, 0) : 0.01125;
    this.updateMatrices();
  }

  private updateMatrices(): void {
    const view = this.viewCamera;
    if (!view) return;
    this.receiverBias.value = this.sampling.value === 0 ? 0 : -0.00035;
    this.normalBias.value = this.sampling.value === 0 ? 0 : 0.006;
    if ((this.projectionMode === "stable" || this.sampling.value === 3) && !this.bounds.isEmpty()) {
      this.stableLight.position.set(-this.direction.x, -this.direction.y, this.direction.z);
      this.stableLight.target.position.set(0, 0, 0);
      fitMmdSelfShadowDirectionalLightToBox(this.stableLight, this.bounds, this.stableFitOptions);
      if (this.sampling.value === 3) {
        const b = this.bounds, camera = this.stableLight.shadow.camera;
        this.receiverBias.value = -Math.max(b.max.x-b.min.x,b.max.y-b.min.y,b.max.z-b.min.z)*0.01/(camera.far-camera.near);
      }
    }
    if (this.projectionMode === "stable") {
      const camera = this.stableLight.shadow.camera;
      this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      // Orthographic OpenGL depth -> backend-independent [0,1] raw depth.
      this.conversion.set(1,0,0,0, 0,1,0,0, 0,0,0.5,0.5, 0,0,0,1);
      this.matrix.premultiply(this.conversion);
      this.finishProjection();
      return;
    }
    view.updateWorldMatrix(true, false);
    // Camera-space LH coordinates put MMD's view-offset/camera-distance target
    // at zero. This cancels the same translation in frameWorld and lightView.
    this.conversion.makeScale(1, 1, -1);
    this.frame.multiplyMatrices(this.conversion, view.matrixWorldInverse);
    this.directionView.set(this.direction.x, this.direction.y, -this.direction.z);
    const e = view.matrixWorldInverse.elements;
    const dx = this.directionView.x, dy = this.directionView.y, dz = this.directionView.z;
    this.directionView.set(e[0] * dx + e[4] * dy + e[8] * dz,
      e[1] * dx + e[5] * dy + e[9] * dz,
      -(e[2] * dx + e[6] * dy + e[10] * dz));
    const magnitude = this.directionView.length();
    this.z.copy(this.directionView);
    if (magnitude > 1e-12) this.z.multiplyScalar(1 / magnitude);
    else this.z.set(0, -1, 0);
    this.x.set(0, 0, 1).cross(this.z);
    // D3DXLookAtLH is singular for an exactly parallel up vector. Use a finite
    // limiting basis at the pole; all non-pole directions follow the reference.
    if (this.x.lengthSq() < 1e-20) this.x.set(0, 1, 0).cross(this.z);
    this.x.normalize();
    this.y.crossVectors(this.z, this.x);
    this.lightView.set(
      this.x.x, this.x.y, this.x.z, 0,
      this.y.x, this.y.y, this.y.z, 0,
      this.z.x, this.z.y, this.z.z, magnitude * 50,
      0, 0, 0, 1
    );
    const slope = -this.z.z;
    const edge = 1 - Math.abs(slope);
    const base = this.distance;
    const modeOne = this.mode.value !== 2;
    let scale: number, positive: number, negative: number;
    if (slope < -0.9 || slope > 0.9) {
      scale = base;
      positive = edge;
      negative = -edge;
    } else if (slope < -0.8) {
      scale = modeOne ? ((slope - 0.1) * 10 + 10) * base + base : (slope * 20 + 19) * base;
      positive = modeOne ? 4 * slope + 3.7 : 9 * slope + 8.2;
      negative = -9 * slope - 8.2;
    } else if (slope > 0.8) {
      scale = modeOne ? (10 - (slope + 0.1) * 10) * base + base : (19 - slope * 20) * base;
      positive = modeOne ? 3.7 - 4 * slope : 8.2 - 9 * slope;
      negative = 9 * slope - 8.2;
    } else {
      scale = base * (modeOne ? 2 : 3);
      positive = modeOne ? 0.5 : 1;
      negative = -1;
    }
    // Expanded S(z,2)*T(z,-1)*orientation*T(z,1)*S(z,.5), in
    // column-vector order. Store reference z/w, independent of backend Z mode.
    this.projection.set(scale, 0, 0, 0,
      0, scale, 0, negative,
      0, 0.5 * positive * scale, base * 0.15, 0,
      0, positive * scale, 0, 1);
    this.matrix.multiplyMatrices(this.lightView, this.frame).premultiply(this.projection);
    this.finishProjection();
  }

  private finishProjection(): void {
    this.conversion.set(0.5, 0, 0, 0.5, 0, -0.5, 0, 0.5, 0, 0, 1, 0, 0, 0, 0, 1);
    this.sampleMatrix.multiplyMatrices(this.conversion, this.matrix);
    const camera = this.light.shadow.camera;
    const gpu = camera.coordinateSystem === THREE.WebGPUCoordinateSystem;
    const reversed = camera.reversedDepth;
    // D3D9 samples viewport pixels at integer centers. Modern rasterizers
    // sample at +0.5, so shift only the caster raster by half a pixel. The
    // reference UV/depth matrix above must stay unchanged (MMD has no UV bias).
    const rasterOffsetX = this.projectionMode === "mmd" ? 1 / this.light.shadow.mapSize.x : 0;
    const rasterOffsetY = this.projectionMode === "mmd" ? -1 / this.light.shadow.mapSize.y : 0;
    this.conversion.set(1, 0, 0, rasterOffsetX, 0, 1, 0, rasterOffsetY,
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
