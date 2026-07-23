import { disposeMmdModel } from "../../../dist/three/index.js";

import { disposeViewerPipelineModel } from "./viewer-pipeline.js";

export function disposeModelResources(model) {
  disposeViewerPipelineModel(model);
  disposeMmdModel(model);
}

export function normalizeMaterials(material) {
  return Array.isArray(material) ? material : [material];
}
