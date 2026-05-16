import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type * as THREE from "three";

const mmdThreeAxisSigns = [1, 1, -1, 1] as const;

export interface OracleDump {
  readonly frames: readonly OracleFrame[];
}

export interface OracleFrame {
  readonly frame: number;
  readonly seconds: number;
  readonly stages: Record<string, OracleStage | undefined>;
}

export interface OracleStage {
  readonly worldMatricesColumnMajor: readonly number[];
}

export interface ParityMetrics {
  frameCount: number;
  componentCount: number;
  finite: boolean;
  maxAbsError: number;
  sumAbsError: number;
  meanAbsError: number;
  worst?: {
    readonly frame: number;
    readonly stage: string;
    readonly component: number;
    readonly candidate: number;
    readonly oracle: number;
    readonly absError: number;
  };
}

export function extractMmdWorldMatrices(mesh: THREE.SkinnedMesh): number[] {
  mesh.updateWorldMatrix(false, true);
  const matrices: number[] = [];

  for (const bone of mesh.skeleton.bones) {
    const elements = bone.matrixWorld.elements;
    for (let column = 0; column < 4; column += 1) {
      for (let row = 0; row < 4; row += 1) {
        matrices.push(mmdThreeAxisSigns[row] * elements[column * 4 + row] * mmdThreeAxisSigns[column]);
      }
    }
  }

  return matrices;
}

export function loadOracleDump(filename: string): OracleDump {
  const content = readFileSync(resolve("data", "unittest", "oracles", filename), "utf8");
  return JSON.parse(content) as OracleDump;
}

export function createParityMetrics(): ParityMetrics {
  return {
    frameCount: 0,
    componentCount: 0,
    finite: true,
    maxAbsError: 0,
    sumAbsError: 0,
    meanAbsError: 0
  };
}

export function compareWithOracle(
  candidate: readonly number[],
  oracle: readonly number[],
  metrics: ParityMetrics,
  context: { readonly frame: number; readonly stage: string }
): ParityMetrics {
  if (candidate.length !== oracle.length) {
    throw new Error(`Runtime parity matrix length mismatch: candidate=${candidate.length} oracle=${oracle.length}`);
  }

  metrics.frameCount += 1;
  for (let component = 0; component < oracle.length; component += 1) {
    const candidateValue = candidate[component] ?? Number.NaN;
    const oracleValue = oracle[component] ?? Number.NaN;
    if (!Number.isFinite(candidateValue) || !Number.isFinite(oracleValue)) {
      metrics.finite = false;
    }

    const absError = Math.abs(candidateValue - oracleValue);
    metrics.componentCount += 1;
    metrics.sumAbsError += absError;
    metrics.meanAbsError = metrics.sumAbsError / metrics.componentCount;

    if (absError > metrics.maxAbsError || !metrics.worst) {
      metrics.maxAbsError = absError;
      metrics.worst = {
        frame: context.frame,
        stage: context.stage,
        component,
        candidate: candidateValue,
        oracle: oracleValue,
        absError
      };
    }
  }

  return metrics;
}
