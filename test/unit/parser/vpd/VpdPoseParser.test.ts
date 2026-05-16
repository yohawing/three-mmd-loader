import { describe, expect, it } from "vitest";

import { parseVpdPose } from "../../../../src/parser/vpd/index.js";

describe("parseVpdPose", () => {
  it("parses renderer-neutral VPD bone poses", () => {
    const pose = parseVpdPose(
      encodeVpd(`Vocaloid Pose Data file
test-model.pmx;
2;
Bone0{
center
0,0,0;
0,0,0,1;
}
Bone1{
left_arm
1.5,-2,3.25;
0.1,0.2,0.3,0.9;
}
`)
    );

    expect(pose).toEqual({
      format: "vpd",
      signature: "Vocaloid Pose Data file",
      encoding: "shift-jis",
      modelFile: "test-model.pmx",
      bonePoses: [
        {
          boneName: "center",
          translation: [0, 0, 0],
          rotation: [0, 0, 0, 1]
        },
        {
          boneName: "left_arm",
          translation: [1.5, -2, 3.25],
          rotation: [0.1, 0.2, 0.3, 0.9]
        }
      ]
    });
  });

  it("allows comments before and after VPD pose tuples", () => {
    const pose = parseVpdPose(
      encodeVpd(`Vocaloid Pose Data file
model.pmx;
1;
Bone0{
root
// translation
1,2,3; // local translation
// rotation
0,0,0,1; // local rotation
}
`)
    );

    expect(pose.bonePoses).toEqual([
      {
        boneName: "root",
        translation: [1, 2, 3],
        rotation: [0, 0, 0, 1]
      }
    ]);
  });

  it("keeps pose parsing independent from declared bone count validation", () => {
    const pose = parseVpdPose(
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

    expect(pose.bonePoses).toHaveLength(1);
  });

  it("rejects invalid VPD pose numeric tuples", () => {
    expect(() =>
      parseVpdPose(
        encodeVpd(`Vocaloid Pose Data file
model.pmx;
1;
Bone0{
root
0,not-a-number,0;
0,0,0,1;
}
`)
      )
    ).toThrow("Invalid VPD numeric tuple: 0,not-a-number,0");
  });

  it("rejects empty VPD pose tuple fields", () => {
    expect(() =>
      parseVpdPose(
        encodeVpd(`Vocaloid Pose Data file
model.pmx;
1;
Bone0{
root
1,,3;
0,0,0,1;
}
`)
      )
    ).toThrow("Invalid VPD numeric tuple: 1,,3");
  });

  it("rejects empty VPD pose tuples", () => {
    expect(() =>
      parseVpdPose(
        encodeVpd(`Vocaloid Pose Data file
model.pmx;
1;
Bone0{
root
;
0,0,0,1;
}
`)
      )
    ).toThrow("Invalid VPD numeric tuple:");
  });

  it("rejects incomplete VPD pose bone blocks", () => {
    expect(() =>
      parseVpdPose(
        encodeVpd(`Vocaloid Pose Data file
model.pmx;
1;
Bone0{
root
0,0,0;
}
`)
      )
    ).toThrow("Invalid VPD bone block");
  });
});

function encodeVpd(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}
