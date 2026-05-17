import { stat } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const sharedToonTextureUrls = Array.from(
  { length: 10 },
  (_, index) =>
    new URL(`../../../src/three/assets/mmd/toon${String(index + 1).padStart(2, "0")}.bmp`, import.meta.url)
);

describe("MMD bundled assets", () => {
  it("includes the shared toon BMP source assets", async () => {
    await Promise.all(
      sharedToonTextureUrls.map(async (url) => {
        const fileStat = await stat(url);

        expect(fileStat.isFile()).toBe(true);
      })
    );
  });
});
