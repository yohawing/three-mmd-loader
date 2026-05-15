import { describe, expect, it } from "vitest";

import { parseVpdMetadata } from "../../../src/parser/index.js";
import { parseVpdPoseInventory } from "../../../src/parser/vpd/index.js";

describe("parseVpdMetadata", () => {
  it("parses VPD pose metadata and declared bone blocks", () => {
    const metadata = parseVpdMetadata(
      encodeVpd(`Vocaloid Pose Data file
test-model.pmx;
2;
Bone0{
center
0,0,0;
0,0,0,1;
}
Bone1{
arm
1,2,3;
0,0,0,1;
}
`)
    );

    expect(metadata).toMatchObject({
      format: "vpd",
      signature: "Vocaloid Pose Data file",
      encoding: "shift-jis",
      modelFile: "test-model.pmx",
      boneCount: 2
    });
    expect(metadata.trailingCharacters).toBeGreaterThan(0);
  });

  it("allows comments and whitespace around VPD header statements", () => {
    const metadata = parseVpdMetadata(
      encodeVpd(`Vocaloid Pose Data file
// comment
 model.pmx ;
// another comment
 1 ;
Bone0{
root
0,0,0;
0,0,0,1;
}
`)
    );

    expect(metadata.modelFile).toBe("model.pmx");
    expect(metadata.boneCount).toBe(1);
  });

  it("preserves spaces inside the VPD model file statement", () => {
    const metadata = parseVpdMetadata(
      encodeVpd(`Vocaloid Pose Data file
Sour Miku White.pmx;
0;
`)
    );

    expect(metadata.modelFile).toBe("Sour Miku White.pmx");
  });

  it("rejects invalid VPD signatures", () => {
    expect(() => parseVpdMetadata(encodeVpd("not a vpd file"))).toThrow("Invalid VPD signature");
  });

  it("rejects missing VPD header statement terminators", () => {
    expect(() => parseVpdMetadata(encodeVpd("Vocaloid Pose Data file\nmodel.pmx"))).toThrow(
      "Missing VPD model file statement terminator"
    );
  });

  it("rejects invalid VPD bone counts", () => {
    expect(() => parseVpdMetadata(encodeVpd("Vocaloid Pose Data file\nmodel.pmx;\nnope;"))).toThrow(
      "Invalid VPD bone count: nope"
    );
    expect(() => parseVpdMetadata(encodeVpd("Vocaloid Pose Data file\nmodel.pmx;\n2abc;"))).toThrow(
      "Invalid VPD bone count: 2abc"
    );
  });

  it("rejects mismatched declared and parsed VPD bone counts", () => {
    expect(() =>
      parseVpdMetadata(
        encodeVpd(`Vocaloid Pose Data file
model.pmx;
2;
Bone0{
root
0,0,0;
0,0,0,1;
}
`)
      )
    ).toThrow("VPD bone count mismatch: declared 2, parsed 1");
  });

  it("rejects incomplete VPD bone blocks instead of counting broken pose text", () => {
    expect(() =>
      parseVpdMetadata(
        encodeVpd(`Vocaloid Pose Data file
model.pmx;
1;
Bone0{
root
0,0,0;
}
`)
      )
    ).toThrow("VPD bone count mismatch: declared 1, parsed 0");
  });
});

describe("parseVpdPoseInventory", () => {
  it("parses renderer-neutral VPD bone block inventory", () => {
    const inventory = parseVpdPoseInventory(
      encodeVpd(`Vocaloid Pose Data file
test-model.pmx;
2;
Bone0{
center
0,0,0;
0,0,0,1;
}
Bone12{
left_arm
1,2,3;
0,0,0,1;
}
`)
    );

    expect(inventory).toMatchObject({
      format: "vpd",
      signature: "Vocaloid Pose Data file",
      encoding: "shift-jis",
      modelFile: "test-model.pmx",
      declaredBoneCount: 2,
      parsedBoneCount: 2,
      boneCountMismatch: null
    });
    expect(inventory.poseTextOffset).toBeGreaterThan(0);
    expect(inventory.trailingCharacters).toBeGreaterThan(0);
    expect(inventory.boneBlocks).toEqual([
      expect.objectContaining({
        blockIndex: 0,
        boneName: "center"
      }),
      expect.objectContaining({
        blockIndex: 12,
        boneName: "left_arm"
      })
    ]);
  });

  it("reports VPD bone block offsets and ranges in decoded text", () => {
    const source = `Vocaloid Pose Data file
model.pmx;
1;
Bone3{
root
0,0,0;
0,0,0,1;
}
`;
    const inventory = parseVpdPoseInventory(encodeVpd(source));
    const block = inventory.boneBlocks[0];

    expect(block).toBeDefined();
    expect(block.offset).toBe(source.indexOf("Bone3{"));
    expect(block.textLength).toBe(source.indexOf("\n}", block.offset) + 2 - block.offset);
    expect(block.range).toEqual({
      start: block.offset,
      end: block.offset + block.textLength
    });
  });

  it("counts VPD bone blocks with full-line comments before tuples", () => {
    const inventory = parseVpdPoseInventory(
      encodeVpd(`Vocaloid Pose Data file
model.pmx;
1;
Bone0{
root
// translation
1,2,3;
// rotation
0,0,0,1;
}
`)
    );

    expect(inventory.boneCountMismatch).toBeNull();
    expect(inventory.boneBlocks).toEqual([
      expect.objectContaining({
        blockIndex: 0,
        boneName: "root"
      })
    ]);
  });

  it("keeps declared and parsed VPD bone count mismatches as inventory data", () => {
    const inventory = parseVpdPoseInventory(
      encodeVpd(`Vocaloid Pose Data file
model.pmx;
2;
Bone0{
root
0,0,0;
0,0,0,1;
}
`)
    );

    expect(inventory.declaredBoneCount).toBe(2);
    expect(inventory.parsedBoneCount).toBe(1);
    expect(inventory.boneCountMismatch).toEqual({
      declared: 2,
      parsed: 1
    });
  });

  it("does not count incomplete VPD bone blocks in the pose inventory", () => {
    const inventory = parseVpdPoseInventory(
      encodeVpd(`Vocaloid Pose Data file
model.pmx;
1;
Bone0{
root
0,0,0;
}
`)
    );

    expect(inventory.parsedBoneCount).toBe(0);
    expect(inventory.boneBlocks).toEqual([]);
    expect(inventory.boneCountMismatch).toEqual({
      declared: 1,
      parsed: 0
    });
  });
});

function encodeVpd(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}
