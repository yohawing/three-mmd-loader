import { createAmmoMmdPhysicsBackend, createDisabledMmdPhysicsBackend } from "../../../dist/physics/index.js";

import { dom, setStatus } from "./dom.js";
import { state } from "./state.js";

export async function createPhysicsBackend() {
  disposeActivePhysicsBackend();
  if (!state.ammoNamespace) {
    setStatus("Loading physics engine...", "loading");
  }
  state.ammoNamespace ??= await initAmmoNamespaceSafely();
  if (state.ammoNamespace) {
    try {
      state.activePhysicsBackend = createAmmoMmdPhysicsBackend(state.ammoNamespace);
    } catch (error) {
      reportAmmoInitializationFailure("createAmmoMmdPhysicsBackend", error);
      state.activePhysicsBackend = createDisabledPhysicsBackend(
        "Ammo.js physics backend failed to initialize; physics simulation disabled."
      );
    }
  } else {
    state.activePhysicsBackend = createDisabledPhysicsBackend(
      "Ammo.js failed to load; physics simulation disabled."
    );
  }
  return state.activePhysicsBackend;
}

export function disposeActivePhysicsBackend() {
  if (state.activePhysicsBackend && !state.activePhysicsBackend.disposed) {
    state.activePhysicsBackend.dispose?.();
  }
  state.activePhysicsBackend = undefined;
}

async function initAmmoNamespace() {
  const scriptLoaded = await loadAmmoScript();
  if (!scriptLoaded) {
    return undefined;
  }
  let ammoCandidate;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      ammoCandidate = getAmmoCandidate();
    } catch (error) {
      reportAmmoInitializationFailure("Ammo global", error);
      return undefined;
    }
    if (ammoCandidate) {
      break;
    }
    if (attempt < 2) {
      await waitForAmmoGlobalRetry(attempt);
    }
  }
  if (!ammoCandidate) {
    reportAmmoInitializationFailure(
      "Ammo global",
      new Error("Ammo is not available on globalThis, window, or self.")
    );
    return undefined;
  }
  try {
    if (typeof ammoCandidate === "function") {
      const result = ammoCandidate();
      return await Promise.resolve(result);
    }
    return ammoCandidate;
  } catch (error) {
    reportAmmoInitializationFailure("Ammo()", error);
    return undefined;
  }
}

function loadAmmoScript() {
  try {
    if (getAmmoCandidate()) {
      return Promise.resolve(true);
    }
  } catch (error) {
    reportAmmoInitializationFailure("Ammo global", error);
    return Promise.resolve(false);
  }

  state.ammoScriptLoadPromise ??= new Promise((resolve) => {
    const script = document.createElement("script");
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      settle(false, "ammo.js script load", new Error(`Timed out loading ${state.ammoScriptUrl}`));
    }, 10000);

    const settle = (loaded, phase, error) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeoutId);
      window.removeEventListener("error", handleWindowError, { capture: true });
      script.removeEventListener("load", handleLoad);
      script.removeEventListener("error", handleScriptError);
      if (!loaded && error) {
        reportAmmoInitializationFailure(phase, error);
      }
      resolve(loaded);
    };

    const handleWindowError = (event) => {
      if (!isAmmoScriptErrorEvent(event)) {
        return;
      }
      event.preventDefault();
      settle(false, "ammo.js script eval", event.error ?? new Error(event.message));
    };

    const handleLoad = () => {
      const queueLoadSettlement =
        typeof window.queueMicrotask === "function"
          ? window.queueMicrotask.bind(window)
          : (callback) => window.setTimeout(callback, 0);
      queueLoadSettlement(() => settle(true));
    };

    const handleScriptError = () => {
      settle(false, "ammo.js script load", new Error(`Failed to load ${state.ammoScriptUrl}`));
    };

    window.addEventListener("error", handleWindowError, { capture: true });
    script.addEventListener("load", handleLoad);
    script.addEventListener("error", handleScriptError);
    script.async = true;
    script.src = state.ammoScriptUrl;
    document.head.appendChild(script);
  });

  return state.ammoScriptLoadPromise;
}

function isAmmoScriptErrorEvent(event) {
  const filename = event.filename ?? "";
  const absoluteAmmoScriptUrl = new URL(state.ammoScriptUrl, location.href).href;
  if (filename === absoluteAmmoScriptUrl || filename.endsWith(state.ammoScriptUrl)) {
    return true;
  }
  const stack = typeof event.error?.stack === "string" ? event.error.stack : "";
  return stack.includes(absoluteAmmoScriptUrl) || stack.includes(state.ammoScriptUrl);
}

export function getAmmoCandidate() {
  const globalScopes = [
    typeof globalThis !== "undefined" ? globalThis : undefined,
    typeof window !== "undefined" ? window : undefined,
    typeof globalThis !== "undefined" ? globalThis.self : undefined
  ];
  for (const scope of globalScopes) {
    if (scope?.Ammo) {
      return scope.Ammo;
    }
  }
  return undefined;
}

function waitForAmmoGlobalRetry(attempt) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, attempt === 0 ? 0 : 16);
  });
}

async function initAmmoNamespaceSafely() {
  try {
    return await initAmmoNamespace();
  } catch (error) {
    reportAmmoInitializationFailure("initAmmoNamespace", error);
    return undefined;
  }
}

function createDisabledPhysicsBackend(reason) {
  return createDisabledMmdPhysicsBackend({ reason });
}

function reportAmmoInitializationFailure(phase, error) {
  const details = createAmmoInitializationErrorDetails(phase, error);
  window.console?.error("[viewer] Ammo initialization failed", details);
  showPhysicsUnavailableMessage(createPhysicsUnavailableMessage(details));
}

function createAmmoInitializationErrorDetails(phase, error) {
  const errorName = error instanceof Error && error.name ? error.name : "Error";
  const errorMessage = error instanceof Error ? error.message : String(error);
  const details = {
    phase,
    errorName,
    errorMessage
  };
  if (error instanceof Error && error.stack) {
    details.stack = error.stack;
  }
  return details;
}

function createPhysicsUnavailableMessage(details) {
  if (isAmmoMemoryAllocationFailure(details)) {
    return "Physics unavailable: Ammo could not allocate memory. Free a tab and reload to enable physics.";
  }
  return `Physics unavailable: ${details.errorName}: ${details.errorMessage}`;
}

function isAmmoMemoryAllocationFailure(details) {
  return details.errorName === "RangeError" && /allocation/i.test(details.errorMessage);
}

function showPhysicsUnavailableMessage(message) {
  setStatus(message, "error");
  if (dom.physicsErrorBanner) {
    dom.physicsErrorBanner.textContent = message;
    dom.physicsErrorBanner.hidden = false;
  }
}
