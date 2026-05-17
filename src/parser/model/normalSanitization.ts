import type { Diagnostic } from "./modelTypes.js";

const fallbackNormal: readonly [number, number, number] = [0, 1, 0];
const normalEpsilon = 1e-12;

export function sanitizeNonFiniteModelNormals(
  positions: Float32Array,
  normals: Float32Array,
  indices: Uint16Array | Uint32Array,
  diagnostics: Diagnostic[]
): void {
  const vertexCount = positions.length / 3;
  if (normals.length !== positions.length || vertexCount === 0) {
    return;
  }

  const affected = new Uint8Array(vertexCount);
  let affectedCount = 0;
  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
    const offset = vertexIndex * 3;
    if (
      !Number.isFinite(normals[offset]) ||
      !Number.isFinite(normals[offset + 1]) ||
      !Number.isFinite(normals[offset + 2])
    ) {
      affected[vertexIndex] = 1;
      affectedCount += 1;
    }
  }

  if (affectedCount === 0) {
    return;
  }

  const accumulated = new Float32Array(normals.length);
  for (let indexOffset = 0; indexOffset + 2 < indices.length; indexOffset += 3) {
    const a = indices[indexOffset];
    const b = indices[indexOffset + 1];
    const c = indices[indexOffset + 2];
    if (
      a >= vertexCount ||
      b >= vertexCount ||
      c >= vertexCount ||
      (!affected[a] && !affected[b] && !affected[c])
    ) {
      continue;
    }

    const faceNormal = calculateFaceNormal(positions, a, b, c);
    if (faceNormal === undefined) {
      continue;
    }

    if (affected[a]) {
      addNormal(accumulated, a, faceNormal);
    }
    if (affected[b]) {
      addNormal(accumulated, b, faceNormal);
    }
    if (affected[c]) {
      addNormal(accumulated, c, faceNormal);
    }
  }

  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
    if (!affected[vertexIndex]) {
      continue;
    }
    const offset = vertexIndex * 3;
    const x = accumulated[offset];
    const y = accumulated[offset + 1];
    const z = accumulated[offset + 2];
    const length = Math.hypot(x, y, z);
    if (length > normalEpsilon && Number.isFinite(length)) {
      normals[offset] = x / length;
      normals[offset + 1] = y / length;
      normals[offset + 2] = z / length;
    } else {
      normals[offset] = fallbackNormal[0];
      normals[offset + 1] = fallbackNormal[1];
      normals[offset + 2] = fallbackNormal[2];
    }
  }

  diagnostics.push({
    level: "warning",
    code: "MODEL_NORMALS_SANITIZED",
    message: `${affectedCount} vertex normals contained non-finite values and were recomputed from neighbouring face normals.`
  });
}

function calculateFaceNormal(
  positions: Float32Array,
  a: number,
  b: number,
  c: number
): readonly [number, number, number] | undefined {
  const ao = a * 3;
  const bo = b * 3;
  const co = c * 3;
  const abx = positions[bo] - positions[ao];
  const aby = positions[bo + 1] - positions[ao + 1];
  const abz = positions[bo + 2] - positions[ao + 2];
  const acx = positions[co] - positions[ao];
  const acy = positions[co + 1] - positions[ao + 1];
  const acz = positions[co + 2] - positions[ao + 2];
  const x = aby * acz - abz * acy;
  const y = abz * acx - abx * acz;
  const z = abx * acy - aby * acx;
  const length = Math.hypot(x, y, z);
  if (length <= normalEpsilon || !Number.isFinite(length)) {
    return undefined;
  }
  return [x / length, y / length, z / length];
}

function addNormal(
  accumulated: Float32Array,
  vertexIndex: number,
  normal: readonly [number, number, number]
): void {
  const offset = vertexIndex * 3;
  accumulated[offset] += normal[0];
  accumulated[offset + 1] += normal[1];
  accumulated[offset + 2] += normal[2];
}
