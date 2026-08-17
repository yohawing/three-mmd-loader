import type {
  MmdDirectBufferPhysicsBackend,
  MmdPhysicsDiagnostic,
  MmdPhysicsResetContext,
  MmdPhysicsStepBufferLayout,
  MmdPhysicsStepBuffers,
  MmdPhysicsStepContext,
  MmdPhysicsStepResult
} from "./index.js";
import {
  createMmdAnimBulletPhysicsBackend,
  type MmdAnimBulletContactPoint,
  type MmdAnimBulletPhysicsBackend,
  type MmdAnimBulletModule
} from "./mmdAnimBullet.js";

export const customBulletMmdScriptPath = "./mmd/mmd_bullet.js";

export interface CustomBulletMmdLoaderOptions {
  readonly baseUrl?: string;
  readonly scriptUrl?: string;
  readonly timeoutMs?: number;
}

export interface CustomBulletMmdPhysicsBackendOptions {
  readonly fixedTimeStep?: number;
  readonly maxSubSteps?: number;
}

/** mmd-anim Bullet module exposed through the stable Custom Bullet API name. */
export type CustomBulletMmdModule = MmdAnimBulletModule;

export interface CustomBulletMmdPhysicsBackend extends MmdDirectBufferPhysicsBackend {
  debugContactCount(): number;
  debugPhysicsContacts(): readonly MmdAnimBulletContactPoint[];
}

type CustomBulletMmdFactory = (
  options?: { locateFile?: (path: string, prefix: string) => string }
) => CustomBulletMmdModule | Promise<CustomBulletMmdModule>;

export function resolveCustomBulletMmdScriptUrl(baseUrl: string = import.meta.url): string {
  return new URL(customBulletMmdScriptPath, baseUrl).href;
}

export async function loadCustomBulletMmdModule(
  options: CustomBulletMmdLoaderOptions = {}
): Promise<CustomBulletMmdModule> {
  const scriptUrl = options.scriptUrl ?? resolveCustomBulletMmdScriptUrl(options.baseUrl);
  if (typeof document === "undefined" || typeof window === "undefined") {
    throw new Error("loadCustomBulletMmdModule requires a browser document and window.");
  }
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    const timeout = window.setTimeout(
      () => reject(new Error(`Timed out loading ${scriptUrl}`)),
      options.timeoutMs ?? 10000
    );
    script.async = true;
    script.src = scriptUrl;
    script.onload = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    script.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error(`Failed to load ${scriptUrl}`));
    };
    document.head.appendChild(script);
  });
  const factory = (globalThis as { MmdBullet?: CustomBulletMmdFactory }).MmdBullet;
  if (typeof factory !== "function") {
    throw new Error("MmdBullet is not available on globalThis.");
  }
  return factory();
}

export function createCustomBulletMmdPhysicsBackend(
  module: CustomBulletMmdModule,
  options: CustomBulletMmdPhysicsBackendOptions = {}
): CustomBulletMmdPhysicsBackend {
  return new CustomBulletMmdCompatibilityBackend(module, options);
}

class CustomBulletMmdCompatibilityBackend implements CustomBulletMmdPhysicsBackend {
  readonly name = "custom-bullet-mmd";
  readonly disabled = false;
  private readonly backend: MmdAnimBulletPhysicsBackend;
  private stepBuffers: MmdPhysicsStepBuffers | undefined;
  private stepBufferBoneCount = -1;

  constructor(
    module: CustomBulletMmdModule,
    options: CustomBulletMmdPhysicsBackendOptions
  ) {
    this.backend = createMmdAnimBulletPhysicsBackend(module, options);
  }

  get disposed(): boolean {
    return this.backend.disposed;
  }

  acquireStepBuffers(layout: MmdPhysicsStepBufferLayout): MmdPhysicsStepBuffers {
    if (!this.stepBuffers || this.stepBufferBoneCount !== layout.boneCount) {
      this.stepBuffers = {
        inputTranslations: new Float32Array(layout.translationValueCount),
        inputRotations: new Float32Array(layout.rotationValueCount),
        inputWorldMatricesColumnMajor: new Float32Array(layout.worldMatrixValueCount),
        outputTranslations: new Float32Array(layout.translationValueCount),
        outputRotations: new Float32Array(layout.rotationValueCount),
        outputWorldMatricesColumnMajor: new Float32Array(layout.worldMatrixValueCount),
        bonePhysicsToggles: new Uint8Array(layout.boneCount),
        updatedBoneIndices: new Uint32Array(layout.boneCount)
      };
      this.stepBufferBoneCount = layout.boneCount;
    }
    return this.stepBuffers;
  }

  step(context: MmdPhysicsStepContext): MmdPhysicsStepResult {
    return this.backend.step(context);
  }

  reset(context?: MmdPhysicsResetContext): void {
    this.backend.reset?.(context);
  }

  dispose(): void {
    this.backend.dispose?.();
    this.stepBuffers = undefined;
    this.stepBufferBoneCount = -1;
  }

  diagnostics(): readonly MmdPhysicsDiagnostic[] {
    return this.backend.diagnostics?.() ?? [];
  }

  debugContactCount(): number {
    return this.backend.debugContactCount();
  }

  debugPhysicsContacts(): readonly MmdAnimBulletContactPoint[] {
    return this.backend.debugPhysicsContacts();
  }
}
