import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { ThreeMmdLoader } from "../../../src/index.js";
import {
  compareFocusedBoneMatrices,
  formatFocusedBoneMismatch,
  loadMmdDumperGoldenIkFixtures,
  readMmdDumperOracleDump
} from "../../helpers/mmdDumperOracle.js";

const goldenIkFixtures = await loadMmdDumperGoldenIkFixtures();

describe("MMDDumper golden IK oracle", () => {
  if (goldenIkFixtures.skipReason) {
    it.skip(goldenIkFixtures.skipReason, () => {});
    return;
  }

  for (const skippedCase of goldenIkFixtures.skippedCases) {
    it.skip(`${skippedCase.name}: ${skippedCase.reason}`, () => {});
  }

  for (const goldenCase of goldenIkFixtures.cases) {
    it(`stays within loose focused IK bounds for ${goldenCase.name}`, async () => {
      const loader = new ThreeMmdLoader({ runtime: { frameRate: 30, physics: "none" } });
      const model = await loader.loadModel(await readFile(goldenCase.modelPath));
      const motion = await loader.loadAnimation(await readFile(goldenCase.motionPath));
      const oracle = await readMmdDumperOracleDump(goldenCase.oraclePath, goldenCase.frames);
      const runtime = model.runtime;
      if (!runtime) {
        throw new Error("ThreeMmdLoader did not create a runtime");
      }

      runtime.setAnimation(motion.animation, model.mesh);

      const mismatches: string[] = [];
      for (const frame of goldenCase.frames) {
        runtime.evaluate(frame / 30, { physics: false });
        model.mesh.updateWorldMatrix(false, true);

        const comparisons = compareFocusedBoneMatrices(
          model.mesh,
          oracle,
          frame,
          goldenCase.watchBones,
          goldenCase.matrixEpsilon
        );
        expect(comparisons.length, `${goldenCase.name} frame=${frame} has no focused bones`).toBeGreaterThan(0);
        for (const comparison of comparisons) {
          if (!comparison.ok) {
            mismatches.push(formatFocusedBoneMismatch(goldenCase.name, frame, comparison));
          }
        }
      }

      expect(
        mismatches,
        mismatches.slice(0, 10).join("\n")
      ).toHaveLength(0);
    });
  }
});
