import type {
  MmdPhysicsDiagnostic,
  MmdPhysicsResetContext,
  MmdPhysicsStepResult,
  MmdPhysicsBackend
} from "./backend.js";
import type {
  MmdPhysicsStepContext
} from "./stepContext.js";

export interface DisabledMmdPhysicsBackendOptions {
  readonly name?: string;
  readonly reason?: string;
}

export class DisabledMmdPhysicsBackend implements MmdPhysicsBackend {
  readonly disabled = true;
  readonly name: string;
  private readonly diagnostic: MmdPhysicsDiagnostic | undefined;
  private disposedState = false;

  constructor(options: DisabledMmdPhysicsBackendOptions = {}) {
    this.name = options.name ?? "disabled";
    this.diagnostic = options.reason
      ? {
          level: "warning",
          code: "PHYSICS_BACKEND_DISABLED",
          message: options.reason
        }
      : undefined;
  }

  get disposed(): boolean {
    return this.disposedState;
  }

  step(_context: MmdPhysicsStepContext): MmdPhysicsStepResult {
    const diagnostics = this.diagnostics();
    return diagnostics.length > 0 ? { simulated: false, diagnostics } : { simulated: false };
  }

  reset(_context?: MmdPhysicsResetContext): void {
    // Disabled physics owns no simulation state.
  }

  dispose(): void {
    this.disposedState = true;
  }

  diagnostics(): readonly MmdPhysicsDiagnostic[] {
    const diagnostics: MmdPhysicsDiagnostic[] = [];
    if (this.diagnostic) {
      diagnostics.push(this.diagnostic);
    }
    if (this.disposedState) {
      diagnostics.push({
        level: "warning",
        code: "PHYSICS_BACKEND_DISPOSED",
        message: "Physics backend has been disposed."
      });
    }
    return diagnostics;
  }
}

export function createDisabledMmdPhysicsBackend(
  options: DisabledMmdPhysicsBackendOptions = {}
): MmdPhysicsBackend {
  return new DisabledMmdPhysicsBackend(options);
}
