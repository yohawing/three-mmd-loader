import {
  createCustomBulletMmdPhysicsBackend,
  createDisabledMmdPhysicsBackend,
  loadCustomBulletMmdModule
} from "../../../dist/physics/index.js";

import { dom, setStatus } from "./dom.js";
import { state } from "./state.js";

export async function createPhysicsBackend() {
  disposeActivePhysicsBackend();
  if (!state.physicsEnabled) {
    state.activePhysicsBackend = createDisabledMmdPhysicsBackend({
      reason: "Physics disabled by viewer query parameter."
    });
    return state.activePhysicsBackend;
  }
  if (!state.customBulletMmdModule) {
    setStatus("Loading Bullet MMD physics engine...", "loading");
  }
  state.customBulletMmdModule ??= await initCustomBulletMmdModuleSafely();
  if (!state.customBulletMmdModule) {
    state.activePhysicsBackend = createDisabledMmdPhysicsBackend({
      reason: "Bullet MMD physics failed to load; physics simulation disabled."
    });
    return state.activePhysicsBackend;
  }
  try {
    state.activePhysicsBackend = createCustomBulletMmdPhysicsBackend(
      state.customBulletMmdModule,
      state.physicsTuningOptions
    );
  } catch (error) {
    reportPhysicsInitializationFailure("createCustomBulletMmdPhysicsBackend", error);
    state.activePhysicsBackend = createDisabledMmdPhysicsBackend({
      reason: "Bullet MMD physics backend failed to initialize; physics simulation disabled."
    });
  }
  return state.activePhysicsBackend;
}

export function disposeActivePhysicsBackend() {
  if (state.activePhysicsBackend && !state.activePhysicsBackend.disposed) {
    state.activePhysicsBackend.dispose?.();
  }
  state.activePhysicsBackend = undefined;
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
