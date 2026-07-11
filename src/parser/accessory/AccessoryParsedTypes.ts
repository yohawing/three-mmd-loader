export interface AccessoryParsedManifest {
  readonly format: string;
  readonly byteLength: number;
  readonly text: boolean;
  readonly header: string;
  readonly meshCount: number;
  readonly materialCount: number;
  readonly meshSummaries: readonly AccessoryMeshSummary[];
  readonly materials: readonly AccessoryMaterial[];
  readonly vacSettings?: AccessoryVacSettings;
  readonly textureReferences: readonly string[];
  readonly diagnostics: readonly AccessoryDiagnostic[];
}

export interface AccessoryMeshSummary {
  readonly vertexCount: number;
  readonly faceCount: number;
  readonly positions: readonly (readonly [number, number, number])[];
  readonly faceIndices: readonly (readonly number[])[];
  readonly normals: readonly (readonly [number, number, number])[];
  readonly normalFaceIndices: readonly (readonly number[])[];
  readonly textureCoordinates: readonly (readonly [number, number])[];
  readonly vertexColors: readonly AccessoryVertexColor[];
  readonly materialIndices: readonly number[];
  readonly materialStartIndex: number;
  readonly materialCount: number;
}

export interface AccessoryVertexColor {
  readonly index: number;
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly alpha: number;
}

export interface AccessoryMaterial {
  readonly name?: string;
  readonly faceColor?: readonly [number, number, number, number];
  readonly power?: number;
  readonly specularColor?: readonly [number, number, number];
  readonly emissiveColor?: readonly [number, number, number];
  readonly textureReferences: readonly string[];
}

export interface AccessoryVacSettings {
  readonly rawLines: readonly string[];
  readonly xFile?: string;
  readonly scale?: number;
  readonly position?: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number];
  readonly numericValues: readonly number[];
  readonly attachmentTarget?: string;
}

export interface AccessoryDiagnostic {
  readonly level: string;
  readonly code: string;
  readonly message: string;
}
