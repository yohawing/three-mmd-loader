// Run on each revision: node --experimental-strip-types scripts/bench-render-sync.mjs
import * as THREE from "three";
import { syncRuntimeMeshForRender } from "../src/runtime/renderSync.ts";

const ticks = 80;
console.log(`${process.version}, Three r${THREE.REVISION}; median of 11 batches of ${ticks} ticks`);
for (const [meshes, distinct] of [[1, 1], [35, 1], [35, 3], [35, 35]]) {
  const root = new THREE.Group();
  const bones = Array.from({ length: 512 }, () => new THREE.Bone());
  bones.forEach((bone, i) => {
    bone.position.y = 0.02;
    const parent = i === 0 ? root : bones[Math.floor((i - 1) / 2)];
    parent.add(bone);
  });
  root.updateMatrixWorld(true);
  const skeletons = Array.from({ length: distinct }, () => new THREE.Skeleton(bones));
  for (let i = 0; i < meshes; i++) {
    const mesh = new THREE.SkinnedMesh();
    mesh.bind(skeletons[i % distinct], new THREE.Matrix4());
    root.add(mesh);
  }

  function batch() {
    const start = performance.now();
    for (let tick = 0; tick < ticks; tick++) {
      bones[1].rotation.z = tick * 0.01;
      syncRuntimeMeshForRender(root);
    }
    return (performance.now() - start) * 1000 / ticks;
  }

  batch();
  batch();
  const samples = Array.from({ length: 11 }, batch).sort((a, b) => a - b);
  let calls = 0;
  for (const skeleton of skeletons) {
    const update = skeleton.update.bind(skeleton);
    skeleton.update = () => { calls++; update(); };
  }
  syncRuntimeMeshForRender(root);
  console.log(`${meshes} meshes / ${distinct} skeletons: ${calls} updates, ${samples[5].toFixed(1)} us/tick`);
}
