import { disposeMmdModel } from "../../../dist/three/index.js";

import { disposeViewerPipelineModel } from "./viewer-pipeline.js";
import { disposePhysicsBackendForModel } from "./physics-backend.js";

export function disposeModelResources(model) {
  try {
    disposeViewerPipelineModel(model);
    disposeMmdModel(model);
  } finally {
    disposePhysicsBackendForModel(model);
  }
}

export function normalizeMaterials(material) {
  return Array.isArray(material) ? material : [material];
}
