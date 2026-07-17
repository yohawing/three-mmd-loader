#!/usr/bin/env node
const THREE = await import("three/webgpu");
const TSL = await import("three/tsl");

const material = new THREE.MeshToonNodeMaterial();
const requiredThreeExports = [
  "WebGPURenderer",
  "StorageBufferAttribute",
  "MeshToonNodeMaterial",
  "MeshBasicNodeMaterial",
  "NodeMaterial",
  "ShadowNodeMaterial",
  "SkinningNode"
];
const requiredTslExports = [
  "Fn",
  "attributeArray",
  "instanceIndex",
  "shadow",
  "positionLocal",
  "normalLocal",
  "normalView",
  "vertexStage",
  "skinning",
  "attribute",
  "reference",
  "referenceBuffer",
  "materialColor",
  "uniform",
  "texture",
  "uv"
];
const requiredMaterialSlots = [
  "colorNode",
  "fragmentNode",
  "outputNode",
  "positionNode",
  "normalNode",
  "receivedShadowNode",
  "receivedShadowPositionNode",
  "castShadowNode",
  "castShadowPositionNode"
];

const report = {
  three: checkProperties(THREE, requiredThreeExports),
  tsl: checkProperties(TSL, requiredTslExports),
  materialSlots: checkProperties(material, requiredMaterialSlots),
  materialNodeSlots: Object.keys(material).filter(key => key.endsWith("Node")).sort()
};

console.log(JSON.stringify(report, null, 2));

const missing = [
  ...report.three.missing.map(name => `three/webgpu:${name}`),
  ...report.tsl.missing.map(name => `three/tsl:${name}`),
  ...report.materialSlots.missing.map(name => `MeshToonNodeMaterial:${name}`)
];
if (missing.length > 0) {
  throw new Error(`Missing required WebGPU/TSL API surface: ${missing.join(", ")}`);
}

function checkProperties(target, names) {
  return {
    present: names.filter(name => name in target),
    missing: names.filter(name => !(name in target))
  };
}
