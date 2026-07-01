import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("runtime hot path allocation guards", () => {
  it("keeps append transform hot paths free of source-level allocation patterns", async () => {
    const source = await readFile("src/runtime/append.ts", "utf8");
    const hotPathBodies = [
      extractFunctionBody(source, "applyAppendTransforms"),
      extractFunctionBody(source, "reapplyAppendTransformsForSources"),
      extractFunctionBody(source, "resetVectorScratchArray"),
      extractFunctionBody(source, "resetQuaternionScratchArray")
    ];
    const forbiddenPatterns: Array<readonly [string, RegExp]> = [
      ["new THREE.Vector3", /new\s+THREE\.Vector3\s*\(/],
      ["new THREE.Quaternion", /new\s+THREE\.Quaternion\s*\(/],
      ["new THREE.Matrix4", /new\s+THREE\.Matrix4\s*\(/],
      ["new Float32Array", /new\s+Float32Array\s*\(/],
      ["new Uint8Array", /new\s+Uint8Array\s*\(/],
      ["new Array", /new\s+Array\s*\(/],
      ["new Set", /new\s+Set\b/],
      ["empty array literal", /\[\s*\]/],
      [".map(", /\.map\s*\(/],
      [".filter(", /\.filter\s*\(/],
      [".slice(", /\.slice\s*\(/],
      ["appendTransformOrder()", /appendTransformOrder\s*\(/],
      ["prepareVector3ScratchArray()", /prepareVector3ScratchArray\s*\(/],
      ["prepareQuaternionScratchArray()", /prepareQuaternionScratchArray\s*\(/]
    ];

    expectNoForbiddenPatterns(hotPathBodies, forbiddenPatterns, "append hot paths");
  });

  it("keeps applyMmdAnimation bone sampling hot paths free of source-level allocation patterns", async () => {
    const source = await readFile("src/runtime/animation.ts", "utf8");
    const hotPathBodies = [
      extractFunctionBody(source, "applyMmdAnimation"),
      extractFunctionBody(source, "sampleBoneTrackInto"),
      extractFunctionBody(source, "samplePackedBoneTrackInto"),
      extractFunctionBody(source, "readPackedBoneFrameInto"),
      extractFunctionBody(source, "readInterpolatedPackedBoneFrameInto"),
      extractFunctionBody(source, "interpolatePackedCurve"),
      extractFunctionBody(source, "slerpPackedRotationInto"),
      extractFunctionBody(source, "normalizeSampleRotationInto"),
      extractFunctionBody(source, "copyPreAppendTransforms"),
      extractFunctionBody(source, "clearNumberRecord")
    ];
    const forbiddenPatterns: Array<readonly [string, RegExp]> = [
      ["new THREE.Vector3", /new\s+THREE\.Vector3\s*\(/],
      ["new THREE.Quaternion", /new\s+THREE\.Quaternion\s*\(/],
      ["new THREE.Matrix4", /new\s+THREE\.Matrix4\s*\(/],
      ["new Float32Array", /new\s+Float32Array\s*\(/],
      ["new Uint8Array", /new\s+Uint8Array\s*\(/],
      ["new Array", /new\s+Array\s*\(/],
      ["new Set", /new\s+Set\b/],
      ["empty array literal", /\[\s*\]/],
      [".map(", /\.map\s*\(/],
      [".filter(", /\.filter\s*\(/],
      [".slice(", /\.slice\s*\(/],
      ["allocating slerp()", /\bslerp\s*\(/],
      ["allocating interpolateBezier()", /\binterpolateBezier\s*\(/],
      ["allocating sampleBoneTrack()", /\bsampleBoneTrack\s*\(/]
    ];

    expectNoForbiddenPatterns(hotPathBodies, forbiddenPatterns, "applyMmdAnimation hot paths");
  });

  it("keeps IK apply entry points free of source-level allocation patterns", async () => {
    const solverSource = await readFile("src/runtime/ik/CcdIkSolver.ts", "utf8");
    const bridgeSource = await readFile("src/runtime/ik-bridge.ts", "utf8");
    const hotPathBodies = [
      extractMethodBody(solverSource, "applyPrepared"),
      extractMethodBody(solverSource, "runPrepared"),
      extractFunctionBody(solverSource, "solveChain"),
      extractFunctionBody(solverSource, "solvePlaneLink"),
      extractFunctionBody(solverSource, "composeWorldMatrices"),
      extractFunctionBody(solverSource, "composeWorldMatrix"),
      extractFunctionBody(solverSource, "composeWorldMatrixInOrder"),
      extractFunctionBody(solverSource, "composeColumnMajorMatrixInto"),
      extractFunctionBody(bridgeSource, "solvePreparedIk")
    ];
    const forbiddenPatterns: Array<readonly [string, RegExp]> = [
      ["new Float32Array", /new\s+Float32Array\s*\(/],
      ["new Uint8Array", /new\s+Uint8Array\s*\(/],
      ["new Array", /new\s+Array\s*\(/],
      [".map(", /\.map\s*\(/],
      [".filter(", /\.filter\s*\(/],
      [".slice(", /\.slice\s*\(/],
      ["normalizeQuaternion()", /\bnormalizeQuaternion\s*\(/]
    ];

    expectNoForbiddenPatterns(hotPathBodies, forbiddenPatterns, "IK apply entry points");
    expect(bridgeSource, "solvePreparedIk must avoid result-allocating solvePrepared()").not.toMatch(
      /\.solvePrepared\s*\(/
    );
    expect(bridgeSource).toMatch(/\.applyPrepared\s*\(/);
  });

  it("keeps selected IK helper allocations out of chain solve loops", async () => {
    const solverSource = await readFile("src/runtime/ik/CcdIkSolver.ts", "utf8");
    const hotPathBodies = [
      extractFunctionBody(solverSource, "solveChain"),
      extractFunctionBody(solverSource, "solvePlaneLink")
    ];
    const forbiddenPatterns: Array<readonly [string, RegExp]> = [
      ["matrixTranslation()", /\bmatrixTranslation\s*\(/],
      ["subtractVectors()", /\bsubtractVectors\s*\(/],
      ["toLinkLimits()", /\btoLinkLimits\s*\(/],
      ["transformDirectionByInverseMatrix()", /\btransformDirectionByInverseMatrix\s*\(/],
      ["normalizeVector()", /\bnormalizeVector\s*\(/],
      ["crossVectors()", /\bcrossVectors\s*\(/],
      ["stablePerpendicularAxis()", /\bstablePerpendicularAxis\s*\(/]
    ];

    expectNoForbiddenPatterns(
      hotPathBodies,
      forbiddenPatterns,
      "selected IK helper allocation slice"
    );
  });
});

function extractFunctionBody(source: string, name: string): string {
  const declaration = new RegExp(`(?:export\\s+)?function\\s+${name}\\b`).exec(source);
  expect(declaration).not.toBeNull();
  const declarationIndex = declaration?.index ?? -1;
  const bodyStart = findBodyStartAfterSignature(source, declarationIndex);
  expect(bodyStart).toBeGreaterThanOrEqual(0);

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(bodyStart + 1, index);
      }
    }
  }
  throw new Error(`Could not extract ${name} body`);
}

function extractMethodBody(source: string, name: string): string {
  const declaration = new RegExp(`(?:^|\\n)\\s*(?:public\\s+|private\\s+|protected\\s+)?${name}\\s*\\(`).exec(source);
  expect(declaration).not.toBeNull();
  const declarationIndex = declaration?.index ?? -1;
  const bodyStart = findBodyStartAfterSignature(source, declarationIndex);
  expect(bodyStart).toBeGreaterThanOrEqual(0);

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(bodyStart + 1, index);
      }
    }
  }
  throw new Error(`Could not extract ${name} body`);
}

function findBodyStartAfterSignature(source: string, declarationIndex: number): number {
  const parameterStart = source.indexOf("(", declarationIndex);
  expect(parameterStart).toBeGreaterThanOrEqual(0);

  let depth = 0;
  for (let index = parameterStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        return source.indexOf("{", index);
      }
    }
  }
  return -1;
}

function expectNoForbiddenPatterns(
  bodies: readonly string[],
  patterns: readonly (readonly [string, RegExp])[],
  label: string
): void {
  for (const body of bodies) {
    for (const [patternLabel, pattern] of patterns) {
      expect(body, `${patternLabel} must stay out of ${label}`).not.toMatch(pattern);
    }
  }
}
