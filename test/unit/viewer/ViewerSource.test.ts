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

  it("keeps same-folder PMX variants in a switcher instead of reloading them during folder drops", async () => {
    const source = await readFile("examples/viewer/viewer.js", "utf8");
    const html = await readFile("examples/viewer/index.html", "utf8");
    const styles = await readFile("examples/viewer/styles.css", "utf8");

    expect(html).toContain('id="model-switcher"');
    expect(html).not.toContain('id="model-name"');
    expect(html).toContain('aria-label="Selected model"');
    expect(source).toContain("const modelSwitcher = document.querySelector(\"#model-switcher\")");
    expect(source).not.toContain("const modelNameText = document.querySelector(\"#model-name\")");
    expect(source).toContain("let currentFolderTextureMap");
    expect(source).toContain("let currentFolderPmxFiles = []");
    expect(source).toContain("currentFolderPmxFiles = [createModelSwitcherEntry(source, label)]");
    expect(source).toContain("currentFolderTextureMap = textureMap");
    expect(source).toContain("currentFolderPmxFiles = modelFiles");
    expect(source).toContain("updateModelSwitcher(modelFile)");
    expect(source).toContain("async function switchFolderModel(modelFile)");
    expect(source).toContain('setStatus(`Switching to ${modelFile.name}`, "loading")');
    expect(source).toContain("createModelLoader({ textureMap: currentFolderTextureMap })");
    expect(source).toContain("modelSwitcher.hidden = currentFolderPmxFiles.length === 0");
    expect(source).toContain("preserveModelSwitcher: true");
    expect(styles).toContain(".loaded-files > select");

    const dropHandler = source.slice(
      source.indexOf("async function handleDroppedFiles"),
      source.indexOf("async function collectDroppedFiles")
    );
    expect(dropHandler).toContain("await loadModelFolder(files)");
    expect(dropHandler).toContain("if (!shouldLoadModelFolder)");
  });
});
