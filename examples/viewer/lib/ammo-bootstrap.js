import {
  createAmmoMmdPhysicsBackend,
  createCustomBulletMmdPhysicsBackend,
  createDisabledMmdPhysicsBackend,
  loadAmmoNamespace,
  loadCustomBulletMmdModule
} from "../../../dist/physics/index.js";

import { dom, setStatus } from "./dom.js";
import { state } from "./state.js";

export async function createPhysicsBackend() {
  disposeActivePhysicsBackend();
  if (state.physicsBackendKind === "custom-bullet-mmd") {
    if (!state.customBulletMmdModule) {
      setStatus("Loading custom Bullet MMD physics engine...", "loading");
    }
    state.customBulletMmdModule ??= await initCustomBulletMmdModuleSafely();
    if (!state.customBulletMmdModule) {
      state.activePhysicsBackend = createDisabledMmdPhysicsBackend({
        reason: "Custom Bullet MMD physics failed to load; physics simulation disabled."
      });
      return state.activePhysicsBackend;
    }
    try {
      state.activePhysicsBackend = createCustomBulletMmdPhysicsBackend(
        state.customBulletMmdModule,
        state.physicsTuningOptions
      );
    } catch (error) {
      reportAmmoInitializationFailure("createCustomBulletMmdPhysicsBackend", error);
      state.activePhysicsBackend = createDisabledMmdPhysicsBackend({
        reason: "Custom Bullet MMD physics backend failed to initialize; physics simulation disabled."
      });
    }
    return state.activePhysicsBackend;
  }
  if (!state.ammoNamespace) {
    setStatus("Loading physics engine...", "loading");
  }
  state.ammoNamespace ??= await initAmmoNamespaceSafely();
  if (!state.ammoNamespace) {
    state.activePhysicsBackend = createDisabledMmdPhysicsBackend({
      reason: "Ammo.js failed to load; physics simulation disabled."
    });
    return state.activePhysicsBackend;
  }
  try {
    state.activePhysicsBackend = createAmmoMmdPhysicsBackend(
      state.ammoNamespace,
      state.physicsTuningOptions
    );
  } catch (error) {
    reportAmmoInitializationFailure("createAmmoMmdPhysicsBackend", error);
    state.activePhysicsBackend = createDisabledMmdPhysicsBackend({
      reason: "Ammo.js physics backend failed to initialize; physics simulation disabled."
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

async function initAmmoNamespaceSafely() {
  try {
    state.ammoScriptLoadPromise ??= loadAmmoNamespace(state.ammoScriptUrl);
    return await state.ammoScriptLoadPromise;
  } catch (error) {
    state.ammoScriptLoadPromise = undefined;
    reportAmmoInitializationFailure("loadAmmoNamespace", error);
    return undefined;
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
    reportAmmoInitializationFailure("loadCustomBulletMmdModule", error);
    return undefined;
  }
}

function reportAmmoInitializationFailure(phase, error) {
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
      ? "Physics unavailable: Ammo could not allocate memory. Free a tab and reload to enable physics."
      : `Physics unavailable: ${errorName}: ${errorMessage}`;
  window.console?.error("[viewer] Ammo initialization failed", details);
  setStatus(message, "error");
  if (dom.physicsErrorBanner) {
    dom.physicsErrorBanner.textContent = message;
    dom.physicsErrorBanner.hidden = false;
  }
}
