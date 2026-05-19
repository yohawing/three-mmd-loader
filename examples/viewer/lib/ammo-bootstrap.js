import { createAmmoMmdPhysicsBackend, createDisabledMmdPhysicsBackend, loadAmmoNamespace } from "../../../dist/physics/index.js";

import { dom, setStatus } from "./dom.js";
import { state } from "./state.js";

export async function createPhysicsBackend() {
  disposeActivePhysicsBackend();
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
    state.activePhysicsBackend = createAmmoMmdPhysicsBackend(state.ammoNamespace);
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
