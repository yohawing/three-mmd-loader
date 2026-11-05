import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type * as ViewerDom from "../../../examples/viewer/lib/dom.js";

vi.mock("../../../examples/viewer/lib/state.js", () => ({}));

function createControl() {
  const attributes = new Map<string, string>();
  const control = {
    value: "",
    hidden: true,
    options: [] as { value: string; textContent: string; remove(): void }[],
    classList: { toggle() {}, remove() {} },
    querySelector: () => null,
    querySelectorAll: () => control.options,
    prepend: (...options: typeof control.options) => control.options.unshift(...options),
    setAttribute: (key: string, value: string) => attributes.set(key, value),
    getAttribute: (key: string) => attributes.get(key),
    removeAttribute: (key: string) => attributes.delete(key)
  };
  return control;
}

describe("loaded file switcher", () => {
  let ui: typeof ViewerDom;
  beforeAll(async () => {
    vi.stubGlobal("document", {
      querySelector: () => null,
      createElement: () => ({ value: "", textContent: "", remove() {} })
    });
    ui = await import("../../../examples/viewer/lib/dom.js");
  });
  afterAll(() => vi.unstubAllGlobals());

  it("round-trips distinct paths containing spaces, underscores and percent signs", () => {
    const control = createControl();
    const paths = ["YYB/YYB 猫猫女仆.pmx", "YYB/YYB_猫猫女仆.pmx", "motions/100% dance.vmd"];
    ui.setLoadedFileSwitcherOptions(control, paths.map(value => ({ value, label: value })), paths[1]);
    expect(ui.loadedFileSwitcherValue(control)).toBe(paths[1]);
    expect(control.options.map(option => option.textContent)).toEqual(paths);
    expect(new Set(control.options.map(option => option.value)).size).toBe(paths.length);
    control.options.forEach((option, index) => {
      expect(option.value).not.toMatch(/\s/);
      control.value = option.value;
      expect(ui.loadedFileSwitcherValue(control)).toBe(paths[index]);
    });
    control.value = "";
    expect(ui.loadedFileSwitcherValue(control)).toBe(paths[1]);
  });

  it("replaces mappings on reload and clears selection on unload", () => {
    const control = createControl();
    ui.setLoadedFileSwitcherOptions(control, [{ value: "first file.pmx", label: "first" }]);
    ui.setLoadedFileSwitcherOptions(control, [{ value: "second file.pmx", label: "second" }]);
    expect(ui.loadedFileSwitcherValue(control)).toBe("second file.pmx");
    ui.clearLoadedFileSwitcher(control);
    expect(ui.loadedFileSwitcherValue(control)).toBe("");
    ui.setLoadedFileSwitcherOptions(control, []);
    expect(ui.loadedFileSwitcherValue(control)).toBe("");
  });

  it("preserves values of controls not populated by the loaded-file helper", () => {
    expect(ui.loadedFileSwitcherValue({ value: "preset%20name" })).toBe("preset%20name");
    expect(ui.loadedFileSwitcherValue(null)).toBe("");
  });
});
