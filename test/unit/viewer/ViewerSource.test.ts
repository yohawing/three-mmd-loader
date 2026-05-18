import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("example viewer source", () => {
  it("clears model resources through the texture-aware dispose helper", async () => {
    const source = await readFile("examples/viewer/viewer.js", "utf8");

    expect(source).toContain("disposeModelResources(currentModel)");
    expect(source).toContain("disposeTexture(material.map");
    expect(source).toContain("disposeTexture(material.gradientMap");
    expect(source).toContain("disposeTexture(material.userData?.mmdSphereTexture");
    expect(source).toContain("...(model.outlineMeshes ?? [])");
    expect(source).toContain("...(model.renderOrderMeshes ?? [])");
  });

  it("surfaces texture diagnostics from loaded models", async () => {
    const source = await readFile("examples/viewer/viewer.js", "utf8");
    const styles = await readFile("examples/viewer/styles.css", "utf8");

    expect(source).toContain("reportTextureDiagnostics(currentModel)");
    expect(source).toContain("model.textureDiagnostics ?? []");
    expect(source).toContain('globalThis.console.warn("[mmd-viewer] texture diagnostics:"');
    expect(source).toContain('setStatus(');
    expect(source).toContain('"warning"');
    expect(source).toContain("topBar?.classList.toggle(\"is-warning\"");
    expect(styles).toContain(".top-bar.is-warning .status");
  });
});
