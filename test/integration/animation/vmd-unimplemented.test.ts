import { describe, expect, it } from "vitest";

import { ThreeMmdLoader } from "../../../src/index.js";
import { VMD_FIXTURES, loadFixtureBytes } from "../../helpers/fixtures.js";

describe("VMD animation loading", () => {
  it("loads fixture bytes into animation data", async () => {
    const loader = new ThreeMmdLoader();
    const bytes = await loadFixtureBytes(VMD_FIXTURES[0]);

    const loaded = await loader.loadAnimation(bytes);

    expect(Object.keys(loaded.animation.boneTracks).length).toBeGreaterThan(0);
    expect(loaded.source).toBe(bytes);
  });
});
