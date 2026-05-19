import { disposeMmdModel } from "../../../dist/three/index.js";

export function disposeModelResources(model) {
  disposeMmdModel(model);
}

export function normalizeMaterials(material) {
  return Array.isArray(material) ? material : [material];
}
