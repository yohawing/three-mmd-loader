import { describe, expect, it } from "vitest";

import { ThreeMmdLoader } from "../../src/index.js";
import { VMD_FIXTURES, loadFixtureBytes } from "../helpers/fixtures.js";

describe("VMD animation loading migration state", () => {
  it("rejects loadAnimation with the current not implemented message", async () => {
    const loader = new ThreeMmdLoader();
    const bytes = await loadFixtureBytes(VMD_FIXTURES[0]);

    await expect(loader.loadAnimation(bytes)).rejects.toThrow(/not implemented/i);
  });
});
