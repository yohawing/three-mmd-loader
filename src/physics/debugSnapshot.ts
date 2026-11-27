import type {
  MmdPhysicsDiagnostic,
  MmdPhysicsVector3Tuple,
  MmdPhysicsQuaternionTuple,
  MmdPhysicsMatrix4ColumnMajorTuple
} from "./backend.js";

export interface MmdPhysicsRigidBodyTransform {
  readonly rigidBodyIndex: number;
  readonly translation: MmdPhysicsVector3Tuple;
  readonly rotation: MmdPhysicsQuaternionTuple;
  readonly worldMatrixColumnMajor?: MmdPhysicsMatrix4ColumnMajorTuple;
}

export interface MmdPhysicsContact {
  readonly rigidBodyIndexA: number;
  readonly rigidBodyIndexB: number;
  readonly position?: MmdPhysicsVector3Tuple;
  readonly normal?: MmdPhysicsVector3Tuple;
  readonly distance?: number;
  readonly impulse?: number;
}

export interface MmdPhysicsDebugSnapshot {
  readonly rigidBodyTransforms?: readonly MmdPhysicsRigidBodyTransform[];
  readonly contacts?: readonly MmdPhysicsContact[];
}

export type MmdPhysicsDebugSnapshotNonFiniteMode = "throw" | "diagnostic";

export interface MmdPhysicsDebugSnapshotNormalizationOptions {
  readonly nonFinite?: MmdPhysicsDebugSnapshotNonFiniteMode;
}

export interface MmdPhysicsDebugSnapshotNormalizationResult {
  readonly snapshot: MmdPhysicsDebugSnapshot;
  readonly diagnostics: readonly MmdPhysicsDiagnostic[];
}

export interface MmdPhysicsDebugHooks {
  readonly captureRigidBodyTransforms?: boolean;
  readonly captureContacts?: boolean;
  onRigidBodyTransform?(transform: MmdPhysicsRigidBodyTransform): void;
  onContact?(contact: MmdPhysicsContact): void;
  onStepDebug?(snapshot: MmdPhysicsDebugSnapshot): void;
}

function compareNumbers(left: number, right: number): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareOptionalTuple(
  left: readonly number[] | undefined,
  right: readonly number[] | undefined
): number {
  if (!left && !right) {
    return 0;
  }
  if (!left) {
    return -1;
  }
  if (!right) {
    return 1;
  }
  const length = Math.min(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const result = compareNumbers(left[i] ?? 0, right[i] ?? 0);
    if (result !== 0) {
      return result;
    }
  }
  return compareNumbers(left.length, right.length);
}

function cloneVector3Tuple(
  tuple: MmdPhysicsVector3Tuple,
  diagnostics: MmdPhysicsDiagnostic[],
  path: string,
  nonFinite: MmdPhysicsDebugSnapshotNonFiniteMode
): MmdPhysicsVector3Tuple | undefined {
  const cloned: MmdPhysicsVector3Tuple = [tuple[0], tuple[1], tuple[2]];
  return pushNonFiniteDiagnostics(cloned, diagnostics, path, nonFinite) ? undefined : cloned;
}

function cloneQuaternionTuple(
  tuple: MmdPhysicsQuaternionTuple,
  diagnostics: MmdPhysicsDiagnostic[],
  path: string,
  nonFinite: MmdPhysicsDebugSnapshotNonFiniteMode
): MmdPhysicsQuaternionTuple | undefined {
  const cloned: MmdPhysicsQuaternionTuple = [tuple[0], tuple[1], tuple[2], tuple[3]];
  return pushNonFiniteDiagnostics(cloned, diagnostics, path, nonFinite) ? undefined : cloned;
}

function cloneMatrix4ColumnMajorTuple(
  tuple: MmdPhysicsMatrix4ColumnMajorTuple,
  diagnostics: MmdPhysicsDiagnostic[],
  path: string,
  nonFinite: MmdPhysicsDebugSnapshotNonFiniteMode
): MmdPhysicsMatrix4ColumnMajorTuple | undefined {
  const cloned: MmdPhysicsMatrix4ColumnMajorTuple = [
    tuple[0],
    tuple[1],
    tuple[2],
    tuple[3],
    tuple[4],
    tuple[5],
    tuple[6],
    tuple[7],
    tuple[8],
    tuple[9],
    tuple[10],
    tuple[11],
    tuple[12],
    tuple[13],
    tuple[14],
    tuple[15]
  ];
  return pushNonFiniteDiagnostics(cloned, diagnostics, path, nonFinite) ? undefined : cloned;
}

function pushNonFiniteDiagnostics(
  values: readonly number[],
  diagnostics: MmdPhysicsDiagnostic[],
  path: string,
  nonFinite: MmdPhysicsDebugSnapshotNonFiniteMode
): boolean {
  let hasNonFinite = false;
  for (let i = 0; i < values.length; i += 1) {
    if (Number.isFinite(values[i])) {
      continue;
    }

    hasNonFinite = true;
    const diagnostic: MmdPhysicsDiagnostic = {
      level: "error",
      code: "PHYSICS_DEBUG_SNAPSHOT_NON_FINITE",
      message: `Physics debug snapshot contains a non-finite number at ${path}[${i}].`
    };
    if (nonFinite === "throw") {
      throw new TypeError(diagnostic.message);
    }
    diagnostics.push(diagnostic);
  }
  return hasNonFinite;
}

function validateFiniteNumber(
  value: number,
  diagnostics: MmdPhysicsDiagnostic[],
  path: string,
  nonFinite: MmdPhysicsDebugSnapshotNonFiniteMode
): boolean {
  if (Number.isFinite(value)) {
    return true;
  }

  const diagnostic: MmdPhysicsDiagnostic = {
    level: "error",
    code: "PHYSICS_DEBUG_SNAPSHOT_NON_FINITE",
    message: `Physics debug snapshot contains a non-finite number at ${path}.`
  };
  if (nonFinite === "throw") {
    throw new TypeError(diagnostic.message);
  }
  diagnostics.push(diagnostic);
  return false;
}

function cloneRigidBodyTransform(
  transform: MmdPhysicsRigidBodyTransform,
  diagnostics: MmdPhysicsDiagnostic[],
  index: number,
  nonFinite: MmdPhysicsDebugSnapshotNonFiniteMode
): MmdPhysicsRigidBodyTransform | undefined {
  if (
    !validateFiniteNumber(
      transform.rigidBodyIndex,
      diagnostics,
      `rigidBodyTransforms[${index}].rigidBodyIndex`,
      nonFinite
    )
  ) {
    return undefined;
  }

  const translation = cloneVector3Tuple(
    transform.translation,
    diagnostics,
    `rigidBodyTransforms[${index}].translation`,
    nonFinite
  );
  const rotation = cloneQuaternionTuple(
    transform.rotation,
    diagnostics,
    `rigidBodyTransforms[${index}].rotation`,
    nonFinite
  );
  const worldMatrixColumnMajor = transform.worldMatrixColumnMajor
    ? cloneMatrix4ColumnMajorTuple(
        transform.worldMatrixColumnMajor,
        diagnostics,
        `rigidBodyTransforms[${index}].worldMatrixColumnMajor`,
        nonFinite
      )
    : undefined;

  if (!translation || !rotation || (transform.worldMatrixColumnMajor && !worldMatrixColumnMajor)) {
    return undefined;
  }

  return worldMatrixColumnMajor
    ? {
        rigidBodyIndex: transform.rigidBodyIndex,
        translation,
        rotation,
        worldMatrixColumnMajor
      }
    : {
        rigidBodyIndex: transform.rigidBodyIndex,
        translation,
        rotation
      };
}

function cloneContact(
  contact: MmdPhysicsContact,
  diagnostics: MmdPhysicsDiagnostic[],
  index: number,
  nonFinite: MmdPhysicsDebugSnapshotNonFiniteMode
): MmdPhysicsContact | undefined {
  if (
    !validateFiniteNumber(
      contact.rigidBodyIndexA,
      diagnostics,
      `contacts[${index}].rigidBodyIndexA`,
      nonFinite
    ) ||
    !validateFiniteNumber(
      contact.rigidBodyIndexB,
      diagnostics,
      `contacts[${index}].rigidBodyIndexB`,
      nonFinite
    )
  ) {
    return undefined;
  }

  const position = contact.position
    ? cloneVector3Tuple(contact.position, diagnostics, `contacts[${index}].position`, nonFinite)
    : undefined;
  const normal = contact.normal
    ? cloneVector3Tuple(contact.normal, diagnostics, `contacts[${index}].normal`, nonFinite)
    : undefined;

  if ((contact.position && !position) || (contact.normal && !normal)) {
    return undefined;
  }

  if (
    (contact.distance !== undefined &&
      !validateFiniteNumber(
        contact.distance,
        diagnostics,
        `contacts[${index}].distance`,
        nonFinite
      )) ||
    (contact.impulse !== undefined &&
      !validateFiniteNumber(contact.impulse, diagnostics, `contacts[${index}].impulse`, nonFinite))
  ) {
    return undefined;
  }

  return {
    rigidBodyIndexA: contact.rigidBodyIndexA,
    rigidBodyIndexB: contact.rigidBodyIndexB,
    ...(position ? { position } : {}),
    ...(normal ? { normal } : {}),
    ...(contact.distance !== undefined ? { distance: contact.distance } : {}),
    ...(contact.impulse !== undefined ? { impulse: contact.impulse } : {})
  };
}

export function normalizeMmdPhysicsDebugSnapshot(
  snapshot: MmdPhysicsDebugSnapshot,
  options: MmdPhysicsDebugSnapshotNormalizationOptions = {}
): MmdPhysicsDebugSnapshotNormalizationResult {
  const nonFinite = options.nonFinite ?? "throw";
  const diagnostics: MmdPhysicsDiagnostic[] = [];
  const rigidBodyTransforms = (snapshot.rigidBodyTransforms ?? [])
    .map((transform, index) => cloneRigidBodyTransform(transform, diagnostics, index, nonFinite))
    .filter((transform): transform is MmdPhysicsRigidBodyTransform => transform !== undefined)
    .sort((left, right) => compareNumbers(left.rigidBodyIndex, right.rigidBodyIndex));
  const contacts = (snapshot.contacts ?? [])
    .map((contact, index) => cloneContact(contact, diagnostics, index, nonFinite))
    .filter((contact): contact is MmdPhysicsContact => contact !== undefined)
    .sort(
      (left, right) =>
        compareNumbers(left.rigidBodyIndexA, right.rigidBodyIndexA) ||
        compareNumbers(left.rigidBodyIndexB, right.rigidBodyIndexB) ||
        compareOptionalTuple(left.position, right.position) ||
        compareOptionalTuple(left.normal, right.normal) ||
        compareNumbers(left.distance ?? 0, right.distance ?? 0) ||
        compareNumbers(left.impulse ?? 0, right.impulse ?? 0)
    );

  return {
    snapshot: {
      rigidBodyTransforms,
      contacts
    },
    diagnostics
  };
}
