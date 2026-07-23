import {
  createCustomBulletMmdPhysicsBackend,
  type CustomBulletMmdModule,
  type CustomBulletMmdPhysicsBackendOptions
} from "../physics/customBulletMmd.js";
import type { MmdPhysicsBackend } from "../physics/index.js";

const customBulletWorkerModulePath = "../physics/mmd/mmd_bullet.worker.mjs";

/** Structured-clone-safe configuration sent to a runtime worker. */
export interface CustomBulletWorkerPhysicsConfig {
  readonly kind: "custom-bullet-mmd";
  readonly moduleUrl?: string;
  readonly wasmUrl?: string;
  readonly options?: CustomBulletMmdPhysicsBackendOptions;
}

interface CustomBulletWorkerModuleFactoryOptions {
  readonly locateFile: (path: string, prefix: string) => string;
}

type CustomBulletWorkerModuleFactory = (
  options: CustomBulletWorkerModuleFactoryOptions
) => CustomBulletMmdModule | Promise<CustomBulletMmdModule>;

interface CustomBulletWorkerModuleNamespace {
  readonly default?: CustomBulletWorkerModuleFactory;
}

/**
 * Creates Custom Bullet inside the worker that calls this function.
 * The caller owns the returned backend and must call `dispose()` when its runtime is replaced or disposed.
 */
export async function createWorkerExternalPhysicsBackend(
  config: CustomBulletWorkerPhysicsConfig,
  baseUrl: string = import.meta.url
): Promise<MmdPhysicsBackend> {
  if (config.kind !== "custom-bullet-mmd") {
    throw new Error(`Unsupported worker external physics backend: ${String(config.kind)}`);
  }

  const moduleUrl = new URL(config.moduleUrl ?? customBulletWorkerModulePath, baseUrl).href;
  const wasmUrl = config.wasmUrl
    ? new URL(config.wasmUrl, baseUrl).href
    : new URL("./mmd_bullet.worker.wasm", moduleUrl).href;
  const namespace = await import(/* @vite-ignore */ moduleUrl) as CustomBulletWorkerModuleNamespace;
  if (typeof namespace.default !== "function") {
    throw new Error(`Custom Bullet worker module does not export a default factory: ${moduleUrl}`);
  }

  const module = await namespace.default({
    locateFile(path, prefix) {
      if (/\.wasm(?:$|[?#])/i.test(path)) {
        return wasmUrl;
      }
      return new URL(path, prefix || moduleUrl).href;
    }
  });
  return createCustomBulletMmdPhysicsBackend(module, config.options);
}
