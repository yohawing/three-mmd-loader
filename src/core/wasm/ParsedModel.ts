import type { parsePmd } from "../../parser/model/PmdModelParser.js";
import type { parsePmx } from "../../parser/model/PmxModelParser.js";
import type {
  DisplayFrameData,
  EmbeddedTextureData,
  GeometryBuffers,
  JointData,
  MaterialInfo,
  MmdModel,
  ModelMetadata,
  MorphData,
  RigidBodyData,
  SkeletonData,
  SoftBodyData
} from "../../parser/model/modelTypes.js";

type ParsedData = ReturnType<typeof parsePmx> | ReturnType<typeof parsePmd>;

export class ParsedModel implements MmdModel {
  constructor(private readonly parsed: ParsedData) {}

  metadata(): ModelMetadata {
    return this.parsed.metadata;
  }

  geometry(): GeometryBuffers {
    return this.parsed.geometry;
  }

  materials(): MaterialInfo[] {
    return this.parsed.materials;
  }

  skeleton(): SkeletonData {
    return this.parsed.skeleton;
  }

  morphs(): MorphData[] {
    return this.parsed.morphs;
  }

  displayFrames(): DisplayFrameData[] {
    return this.parsed.displayFrames;
  }

  rigidBodies(): RigidBodyData[] {
    return this.parsed.rigidBodies;
  }

  joints(): JointData[] {
    return this.parsed.joints;
  }

  softBodies(): SoftBodyData[] {
    return this.parsed.softBodies;
  }

  embeddedTextures(): EmbeddedTextureData[] {
    return [];
  }
}

export class DisposableParsedModel extends ParsedModel {
  private disposed = false;

  constructor(
    parsed: ParsedData,
    private readonly release: () => void
  ) {
    super(parsed);
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.release();
  }
}
