import type {
  MmdPhysicsDiagnostic
} from "./backend.js";

export function pushStepContextDiagnostic(
  diagnostics: MmdPhysicsDiagnostic[],
  code: string,
  message: string
): void {
  diagnostics.push({
    level: "error",
    code,
    message
  });
}

export function pushMissingStepContextDiagnostic(diagnostics: MmdPhysicsDiagnostic[], path: string): void {
  pushStepContextDiagnostic(
    diagnostics,
    "PHYSICS_STEP_CONTEXT_MISSING_REQUIRED",
    `MMD physics step context is missing required ${path}.`
  );
}

export function validateContextFiniteNumber(
  value: number,
  diagnostics: MmdPhysicsDiagnostic[],
  path: string
): void {
  if (Number.isFinite(value)) {
    return;
  }
  pushStepContextDiagnostic(
    diagnostics,
    "PHYSICS_STEP_CONTEXT_NON_FINITE",
    `MMD physics step context contains a non-finite number at ${path}.`
  );
}

export function validateIntegerIndex(
  value: number | undefined,
  maxExclusive: number,
  diagnostics: MmdPhysicsDiagnostic[],
  path: string,
  allowMinusOne = false
): void {
  if (value === undefined || (allowMinusOne && value === -1)) {
    return;
  }
  if (Number.isInteger(value) && value >= 0 && value < maxExclusive) {
    return;
  }
  pushStepContextDiagnostic(
    diagnostics,
    "PHYSICS_STEP_CONTEXT_INVALID_REFERENCE",
    `MMD physics step context contains an invalid reference at ${path}: ${String(value)}.`
  );
}

export function validateUniqueIndex(
  value: number,
  maxExclusive: number,
  seen: Set<number>,
  diagnostics: MmdPhysicsDiagnostic[],
  path: string
): void {
  if (!Number.isInteger(value) || value < 0 || value >= maxExclusive) {
    pushStepContextDiagnostic(
      diagnostics,
      "PHYSICS_STEP_CONTEXT_INVALID_INDEX",
      `MMD physics step context contains an invalid index at ${path}: ${String(value)}.`
    );
    return;
  }
  if (seen.has(value)) {
    pushStepContextDiagnostic(
      diagnostics,
      "PHYSICS_STEP_CONTEXT_DUPLICATE_INDEX",
      `MMD physics step context contains a duplicate index at ${path}: ${value}.`
    );
    return;
  }
  seen.add(value);
}

export function validateTuple(
  values: readonly number[] | undefined,
  expectedLength: number,
  diagnostics: MmdPhysicsDiagnostic[],
  path: string
): void {
  if (!values) {
    return;
  }
  if (values.length !== expectedLength) {
    pushStepContextDiagnostic(
      diagnostics,
      "PHYSICS_STEP_CONTEXT_INVALID_LENGTH",
      `MMD physics step context ${path} must have length ${expectedLength}; got ${values.length}.`
    );
    return;
  }
  for (let i = 0; i < values.length; i += 1) {
    validateContextFiniteNumber(values[i] ?? Number.NaN, diagnostics, `${path}[${i}]`);
  }
}

export function pushInvalidValueDiagnostic(
  diagnostics: MmdPhysicsDiagnostic[],
  path: string,
  value: unknown
): void {
  pushStepContextDiagnostic(
    diagnostics,
    "PHYSICS_STEP_CONTEXT_INVALID_VALUE",
    `MMD physics step context contains an invalid value at ${path}: ${String(value)}.`
  );
}

export function validateEnumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  diagnostics: MmdPhysicsDiagnostic[],
  path: string
): value is T {
  if (allowed.includes(value as T)) {
    return true;
  }
  pushInvalidValueDiagnostic(diagnostics, path, value);
  return false;
}
