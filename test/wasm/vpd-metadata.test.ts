import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { initCore } from "../../src/parser/wasm/index.js";
import { existingOptionalPath, optionalLocalFixture } from "./localFixtureInventory.js";

const luminePmxPath = existingOptionalPath(
  optionalLocalFixture("pmx", "pmx002") ?? process.env.THREE_MMD_WASM_LUMINE_PMX
);
const luminePmxIt = luminePmxPath ? it : it.skip;

describe("@yw-mmd/core-wasm VPD metadata", () => {
  it("parses VPD bone pose blocks", async () => {
    const core = await initCore();
    const pose = core.loadVpd(createTestBonePoseVpd());

    expect(pose.metadata.boneCount).toBe(2);
    expect(pose.metadata.morphCount).toBe(0);
    expect(pose.metadata.modelFile).toContain(".osm");
    expect(Object.keys(pose.bones)).toEqual(["センター", "上半身"]);
    expect(pose.bones["センター"]?.translation).toEqual([0, 0, 3]);
    expect(pose.bones["上半身"]?.rotation[3]).toBeCloseTo(0.958242);
  });

  luminePmxIt("parses VPD morph blocks for a model fixture", async () => {
    const core = await initCore();
    const pose = core.loadVpd(
      new TextEncoder().encode(
        [
          "Vocaloid Pose Data file",
          "",
          "Lumine.osm;",
          "0;",
          "",
          "Morph0{irtB L B03",
          "  0.75;",
          "}"
        ].join("\n")
      )
    );
    const model = core.loadModel(
      await readFile(luminePmxPath!),
      {
        format: "pmx"
      }
    );
    const matchedMorphIndices = model
      .morphs()
      .map((morph, index) => (morph.englishName === "irtB L B03" ? index : -1))
      .filter((index) => index >= 0);
    expect(pose.metadata.morphCount).toBe(1);
    expect(pose.morphs["irtB L B03"]).toBe(0.75);
    expect(matchedMorphIndices.length).toBeGreaterThan(0);
  });

  it("accepts permissive VPD whitespace and comments before statements", async () => {
    const core = await initCore();
    const pose = core.loadVpd(
      new TextEncoder().encode(
        [
          "Vocaloid Pose Data file",
          "",
          "Whitespace.osm;",
          "1;",
          "",
          "Bone0 { Center",
          "  // position comment",
          "  1, 2, 3;",
          "  // rotation comment",
          "  0, 0, 0, 1;",
          "}",
          "",
          "Morph0 { smile",
          "  // weight comment",
          "  0.5;",
          "}"
        ].join("\n")
      )
    );

    expect(pose.metadata.boneCount).toBe(1);
    expect(pose.metadata.morphCount).toBe(1);
    expect(pose.bones.Center?.translation).toEqual([1, 2, 3]);
    expect(pose.bones.Center?.rotation).toEqual([0, 0, 0, 1]);
    expect(pose.morphs.smile).toBe(0.5);
  });

  it("reads VPD model statements without requiring an .osm extension", async () => {
    const core = await initCore();
    const pose = core.loadVpd(
      new TextEncoder().encode(
        [
          "Vocaloid Pose Data file",
          "",
          "// The first statement is consumed as the model name.",
          "Model.pmx;",
          "// The second statement is the declared bone count.",
          "0;"
        ].join("\n")
      )
    );

    expect(pose.metadata.modelFile).toBe("Model.pmx");
    expect(pose.metadata.boneCount).toBe(0);
    expect(pose.metadata.morphCount).toBe(0);
  });

  it("ignores mismatched VPD declared bone counts", async () => {
    const core = await initCore();
    const pose = core.loadVpd(
      new TextEncoder().encode(
        [
          "Vocaloid Pose Data file",
          "",
          "Permissive.osm;",
          "999;",
          "",
          "Bone0 { Center",
          "  1, 2, 3;",
          "  0, 0, 0, 1;",
          "}",
          "",
          "Bone1 { Upper",
          "  4, 5, 6;",
          "  0, 0.25, 0, 0.96875;",
          "}"
        ].join("\n")
      )
    );

    expect(pose.metadata.boneCount).toBe(2);
    expect(Object.keys(pose.bones)).toEqual(["Center", "Upper"]);
    expect(pose.bones.Center?.translation).toEqual([1, 2, 3]);
    expect(pose.bones.Upper?.rotation).toEqual([0, 0.25, 0, 0.96875]);
  });

  it("uses the last duplicate VPD bone and morph block", async () => {
    const core = await initCore();
    const pose = core.loadVpd(
      new TextEncoder().encode(
        [
          "Vocaloid Pose Data file",
          "",
          "Duplicates.osm;",
          "2;",
          "",
          "Bone0 { Center",
          "  1, 2, 3;",
          "  0, 0, 0, 1;",
          "}",
          "",
          "Bone1 { Center",
          "  4, 5, 6;",
          "  0, 0.5, 0, 0.875;",
          "}",
          "",
          "Morph0 { smile",
          "  0.25;",
          "}",
          "",
          "Morph1 { smile",
          "  0.75;",
          "}"
        ].join("\n")
      )
    );

    expect(pose.metadata.boneCount).toBe(1);
    expect(pose.metadata.morphCount).toBe(1);
    expect(Object.keys(pose.bones)).toEqual(["Center"]);
    expect(pose.bones.Center?.translation).toEqual([4, 5, 6]);
    expect(pose.bones.Center?.rotation).toEqual([0, 0.5, 0, 0.875]);
    expect(pose.morphs).toEqual({ smile: 0.75 });
  });

  it("rejects invalid VPD bone blocks instead of returning incomplete poses", async () => {
    const core = await initCore();
    expect(() =>
      core.loadVpd(
        new TextEncoder().encode(
          [
            "Vocaloid Pose Data file",
            "",
            "InvalidBone.osm;",
            "2;",
            "",
            "Bone0 { Good",
            "  1, 2, 3;",
            "  0, 0, 0, 1;",
            "}",
            "",
            "Bone1 { BadPosition",
            "  broken;",
            "  0, 0, 0, 1;",
            "}"
          ].join("\n")
        )
      )
    ).toThrow(/Invalid VPD numeric tuple/);
  });

  it("skips invalid VPD morph weights without rejecting valid bone poses", async () => {
    const core = await initCore();
    const pose = core.loadVpd(
      new TextEncoder().encode(
        [
          "Vocaloid Pose Data file",
          "",
          "PermissiveMorph.osm;",
          "1;",
          "",
          "Bone0 { Good",
          "  1, 2, 3;",
          "  0, 0, 0, 1;",
          "}",
          "",
          "Morph0 { goodMorph",
          "  0.25;",
          "}",
          "",
          "Morph1 { badMorph",
          "  nope;",
          "}"
        ].join("\n")
      )
    );

    expect(pose.metadata.boneCount).toBe(1);
    expect(pose.metadata.morphCount).toBe(1);
    expect(Object.keys(pose.bones)).toEqual(["Good"]);
    expect(pose.bones.Good?.translation).toEqual([1, 2, 3]);
    expect(pose.morphs).toEqual({ goodMorph: 0.25 });
  });

  it("converts VPD pose data into a one-frame animation", async () => {
    const core = await initCore();
    const animation = core.loadVpdAnimation(createTestBonePoseVpd(), "pose-animation");

    expect(animation.kind).toBe("vmd");
    expect(animation.metadata.modelName).toBe("pose-animation");
    expect(animation.metadata.counts.bones).toBe(2);
    expect(animation.metadata.counts.morphs).toBe(0);
    expect(animation.metadata.maxFrame).toBe(0);
    const centerTrack = animation.boneTracks["センター"];
    expect(centerTrack?.frames[0]).toBe(0);
    expect(Array.from(centerTrack?.translations.slice(0, 3) ?? [])).toEqual([0, 0, 3]);
  });

  luminePmxIt("converts VPD morph pose data into one-frame morph animation tracks", async () => {
    const core = await initCore();
    const animation = core.loadVpdAnimation(
      new TextEncoder().encode(
        [
          "Vocaloid Pose Data file",
          "",
          "Lumine.pmx;",
          "0;",
          "",
          "Morph0 { smile",
          "  0.25;",
          "}",
          "",
          "Morph1 { smile",
          "  0.75;",
          "}",
          "",
          "Morph2 { irtB L B03",
          "  0.5;",
          "}"
        ].join("\n")
      ),
      "vpd-morph-animation"
    );
    expect(animation.metadata.counts.bones).toBe(0);
    expect(animation.metadata.counts.morphs).toBe(2);
    expect(animation.metadata.maxFrame).toBe(0);
    expect(animation.morphTracks.smile?.frames[0]).toBe(0);
    expect(animation.morphTracks.smile?.weights[0]).toBeCloseTo(0.75);
    expect(animation.morphTracks["irtB L B03"]?.frames[0]).toBe(0);
    expect(animation.morphTracks["irtB L B03"]?.weights[0]).toBeCloseTo(0.5);
  });

  it("rejects broken VPD data", async () => {
    const core = await initCore();
    expect(() => core.loadVpd(new TextEncoder().encode("broken"))).toThrow(/Invalid VPD header/);
  });
});

function createTestBonePoseVpd(): Uint8Array {
  return encodeShiftJisForTest(
    [
      "Vocaloid Pose Data file",
      "",
      "Synthetic.osm;",
      "2;",
      "",
      "Bone0 { センター",
      "  0, 0, 3;",
      "  0, 0, 0, 1;",
      "}",
      "",
      "Bone1 { 上半身",
      "  0, 0, 0;",
      "  0, 0.285958, 0, 0.958242;",
      "}"
    ].join("\n")
  );
}

function encodeShiftJisForTest(text: string): Uint8Array {
  const mapped: number[] = [];
  const table: Record<string, number[]> = {
    セ: [0x83, 0x5a],
    ン: [0x83, 0x93],
    タ: [0x83, 0x5e],
    ー: [0x81, 0x5b],
    上: [0x8f, 0xe3],
    半: [0x94, 0xbc],
    身: [0x90, 0x67]
  };
  for (const char of text) {
    const code = char.charCodeAt(0);
    const bytes = table[char];
    if (code <= 0x7f) {
      mapped.push(code);
    } else if (bytes) {
      mapped.push(...bytes);
    } else {
      throw new Error(`Missing Shift_JIS test mapping for ${char}`);
    }
  }
  return new Uint8Array(mapped);
}
