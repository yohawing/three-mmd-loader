import { describe, expect, it } from "vitest";

import { parseVpd } from "../../../src/parser/vpd/index.js";

describe("parseVpd", () => {
  it("parses a minimal UTF-8 VPD pose into the shared MMD pose shape", () => {
    const pose = parseVpd(`Vocaloid Pose Data file
model.pmx;
1;
Bone0{
center
1,2,3;
0,0,0,1;
}
`);

    expect(pose.kind).toBe("vpd");
    expect((pose.metadata as { readonly format?: string }).format).toBe("vpd");
    expect(pose.metadata.modelFile).toBe("model.pmx");
    expect(pose.bones.center).toEqual({
      name: "center",
      translation: [1, 2, 3],
      rotation: [0, 0, 0, 1]
    });
    expect(pose.morphs).toEqual({});
  });
});
