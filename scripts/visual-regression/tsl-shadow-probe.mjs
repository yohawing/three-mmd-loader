import * as THREE from "three/webgpu";
import * as TSL from "three/tsl";
import { createMmdTslToonMaterial } from "../../dist/webgpu/material-core.js";

export async function runTslShadowProbe() {
  const renderer = new THREE.WebGPURenderer({ antialias: false });
  await renderer.init();
  if (!renderer.backend.isWebGPUBackend) throw new Error("Native WebGPU is required; fallback does not validate this probe.");
  renderer.setSize(65, 65);
  globalThis.document.body.append(renderer.domElement);
  const target = new THREE.RenderTarget(65, 65);
  target.texture.colorSpace = THREE.SRGBColorSpace;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 2;
  const geometry = new THREE.PlaneGeometry(2, 2);
  const mesh = new THREE.Mesh(geometry);
  const scene = new THREE.Scene();
  scene.add(mesh);
  const toon = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
  toon.needsUpdate = true;
  const cases = [], failures = [];
  // Use the same independent MikuDanceStudio pixel oracles as the GLSL probe.
  async function check(name, options, expected) {
    const material = createMmdTslToonMaterial({
      diffuse: [0, 0, 0], ambient: [0, 0, 0], specular: [0, 0, 0],
      sphereTextureFactor: [1, 1, 1, 1],
      specularPower: 8, lightColor: [1, 1, 1], lightDirection: new THREE.Vector3(0, 0, 1),
      ...options
    });
    mesh.material = material;
    renderer.setRenderTarget(target);
    await renderer.renderAsync(scene, camera);
    const actual = Array.from(await renderer.readRenderTargetPixelsAsync(target, 32, 32, 1, 1)).slice(0, 3);
    cases.push({ name, actual, expected });
    if (actual.some((channel, i) => Math.abs(channel - expected[i]) > 2)) failures.push(name);
    material.dispose();
  }
  const sphere = new THREE.DataTexture(new Uint8Array([64, 32, 16, 255]), 1, 1);
  await check("TSL default MMD light direction illuminates a forward normal", {
    diffuse: [0.6, 0.6, 0.6], lightDirection: undefined, lightColor: [154 / 255, 154 / 255, 154 / 255]
  }, [38, 38, 38]);
  sphere.needsUpdate = true;
  const sphereOptions = { sphereMap: sphere, sphereMode: "add", ambient: [0.1, 0.2, 0.3] };
  await check("TSL additive sphere has unit weight", sphereOptions, [90, 83, 93]);
  await check("TSL toon grades sphere and base together", { ...sphereOptions, toonMap: toon }, [45, 42, 46]);
  await check("TSL specular eye points toward camera", { specular: [0.2, 0.3, 0.4], lightDirection: new THREE.Vector3(0.6, 0, 0.8) }, [33, 50, 67]);
  const stripes = new THREE.DataTexture(new Uint8Array(Array.from({ length: 16 }, (_, row) => [16 + row * 10, 40, 60, 255]).flat()), 1, 16);
  stripes.minFilter = stripes.magFilter = THREE.NearestFilter;
  stripes.needsUpdate = true;
  const normals = geometry.getAttribute("normal");
  for (const length of [1, 0.5]) {
    for (let i = 0; i < normals.count; i++) normals.setXYZ(i, 0, 0.4 * length, Math.sqrt(0.84) * length);
    normals.needsUpdate = true;
    for (const scale of [0.1, 1, 10]) {
      mesh.scale.setScalar(scale);
      await check(`TSL sphere normal length ${length}, scale ${scale}`, { sphereMap: stripes, sphereMode: "add" }, [length === 1 ? 56 : 76, 40, 60]);
    }
  }
  mesh.scale.setScalar(1);
  for (let i = 0; i < normals.count; i++) normals.setXYZ(i, 0, 0, 1);
  normals.needsUpdate = true;
  for (const useToon of [true, false]) {
    const visibility = TSL.uniform(1);
    const material = createMmdTslToonMaterial({
      diffuse: [0.4, 0.4, 0.4], ambient: [0.2, 0.2, 0.2],
      specular: [0, 0, 0], lightColor: [1, 1, 1], lightDirection: new THREE.Vector3(0, 0, 1),
      toonMap: useToon ? toon : undefined,
      dedicatedShadowVisibilityNode: visibility
    });
    material.userData.mmdTslMaterialUniforms.dedicatedShadowEnabled.value = 1;
    mesh.material = material;
    for (const factor of [1, 0]) {
      visibility.value = factor;
      renderer.setRenderTarget(target);
      await renderer.renderAsync(scene, camera);
      const bytes = await renderer.readRenderTargetPixelsAsync(target, 32, 32, 1, 1);
      const actual = Array.from(bytes).slice(0, 3);
      const value = factor ? 153 : useToon ? 77 : 51;
      const name = `TSL ${useToon ? "toon" : "non-toon"} visibility ${factor}`;
      cases.push({ name, actual, expected: [value, value, value] });
      if (actual.some(channel => Math.abs(channel - value) > 2)) failures.push(name);
    }
    material.dispose();
  }
  geometry.dispose(); sphere.dispose(); stripes.dispose(); toon.dispose(); target.dispose(); renderer.dispose();
  return { cases, failures };
}
