import {
  createCustomBulletMmdPhysicsBackend,
  createDisabledMmdPhysicsBackend,
  loadCustomBulletMmdModule
} from "../../../dist/physics/index.js";

import { dom, setStatus } from "./dom.js";
import { state } from "./state.js";

export async function createPhysicsBackend() {
  const backend = createDeferredPhysicsBackend();
  state.physicsBackends.add(backend);
  if (!state.activePhysicsBackend) {
    state.activePhysicsBackend = backend;
  }
  return backend;
}

export async function ensurePhysicsBackendReady() {
  if (state.activeRuntimeMode === "worker") {
    return undefined;
  }
  if (state.physicsBackends.size === 0) {
    await createPhysicsBackend();
  }
  const backends = Array.from(state.physicsBackends);
  for (const backend of backends) {
    if (typeof backend.prepare === "function") {
      await backend.prepare();
    }
  }
  return state.activePhysicsBackend;
}

export function disposeActivePhysicsBackend() {
  for (const backend of state.physicsBackends) {
    if (!backend.disposed) {
      backend.dispose?.();
    }
  }
  state.physicsBackends.clear();
  state.activePhysicsBackend = undefined;
}

export function registerPhysicsBackendForModel(model, backend) {
  if (!model || !backend) {
    return;
  }
  state.physicsBackendByModel.set(model, backend);
}

export function releasePhysicsBackend(backend) {
  if (!backend) {
    return;
  }
  if (!backend.disposed) {
    backend.dispose?.();
  }
  state.physicsBackends.delete(backend);
  if (state.activePhysicsBackend === backend) {
    state.activePhysicsBackend = state.physicsBackends.values().next().value;
  }
}

export function disposePhysicsBackendForModel(model) {
  const backend = state.physicsBackendByModel.get(model);
  if (!backend) {
    return;
  }
  state.physicsBackendByModel.delete(model);
  releasePhysicsBackend(backend);
}

function createDeferredPhysicsBackend() {
  let backend;
  let loadPromise;
  let disposed = false;

  return {
    name: "deferred-custom-bullet-mmd",
    get disabled() {
      return !backend || backend.disabled;
    },
    get disposed() {
      return disposed || Boolean(backend?.disposed);
    },
    async prepare() {
      if (backend || disposed) {
        return backend;
      }
      loadPromise ??= createActivePhysicsBackend();
      const loadedBackend = await loadPromise;
      if (disposed) {
        loadedBackend?.dispose?.();
        return undefined;
      }
      backend = loadedBackend;
      return backend;
    },
    step(context) {
      return backend?.step(context) ?? { simulated: false };
    },
    reset(context) {
      backend?.reset?.(context);
    },
    dispose() {
      disposed = true;
      backend?.dispose?.();
    },
    diagnostics() {
      return backend?.diagnostics?.() ?? [];
    },
    debugRigidBodyWorldTransformsColumnMajor() {
      return backend?.debugRigidBodyWorldTransformsColumnMajor?.() ?? [];
    }
  };
}

async function createActivePhysicsBackend() {
  if (!state.physicsEnabled) {
    return createDisabledMmdPhysicsBackend({
      reason: "Physics disabled by viewer query parameter."
    });
  }
  if (!state.customBulletMmdModule) {
    setStatus("Loading Bullet MMD physics engine...", "loading");
  }
  state.customBulletMmdModule ??= await initCustomBulletMmdModuleSafely();
  if (!state.customBulletMmdModule) {
    return createDisabledMmdPhysicsBackend({
      reason: "Bullet MMD physics failed to load; physics simulation disabled."
    });
  }
  try {
    return createCustomBulletMmdPhysicsBackend(
      state.customBulletMmdModule,
      state.physicsTuningOptions
    );
  } catch (error) {
    reportPhysicsInitializationFailure("createCustomBulletMmdPhysicsBackend", error);
    return createDisabledMmdPhysicsBackend({
      reason: "Bullet MMD physics backend failed to initialize; physics simulation disabled."
    });
  }
}

async function initCustomBulletMmdModuleSafely() {
  try {
    state.customBulletMmdLoadPromise ??= loadCustomBulletMmdModule({
      scriptUrl: state.customBulletMmdScriptUrl
    });
    return await state.customBulletMmdLoadPromise;
  } catch (error) {
    state.customBulletMmdLoadPromise = undefined;
    reportPhysicsInitializationFailure("loadCustomBulletMmdModule", error);
    return undefined;
  }
}

function reportPhysicsInitializationFailure(phase, error) {
  const errorName = error instanceof Error && error.name ? error.name : "Error";
  const errorMessage = error instanceof Error ? error.message : String(error);
  const details = {
    phase,
    errorName,
    errorMessage,
    ...(error instanceof Error && error.stack ? { stack: error.stack } : {})
  };
  const message =
    errorName === "RangeError" && /allocation/i.test(errorMessage)
      ? "Physics unavailable: Bullet MMD could not allocate memory. Free a tab and reload to enable physics."
      : `Physics unavailable: ${errorName}: ${errorMessage}`;
  window.console?.error("[viewer] Bullet MMD initialization failed", details);
  setStatus(message, "error");
  if (dom.physicsErrorBanner) {
    dom.physicsErrorBanner.textContent = message;
    dom.physicsErrorBanner.hidden = false;
  }
}
