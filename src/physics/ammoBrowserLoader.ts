import type { AmmoNamespace } from "./ammoMmdPhysicsBackend.js";

export interface AmmoBrowserLoaderOptions {
  readonly timeoutMs?: number;
}

type AmmoFactory = () => AmmoNamespace | Promise<AmmoNamespace>;
type AmmoCandidate = AmmoNamespace | AmmoFactory;

export async function loadAmmoNamespace(
  scriptUrl: string,
  options: AmmoBrowserLoaderOptions = {}
): Promise<AmmoNamespace> {
  const existingCandidate = getAmmoCandidate();
  if (existingCandidate) {
    return await initAmmoNamespace(existingCandidate);
  }

  await loadAmmoScript(scriptUrl, options.timeoutMs ?? 10000);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const candidate = getAmmoCandidate();
    if (candidate) {
      return await initAmmoNamespace(candidate);
    }
    if (attempt < 2) {
      await waitForAmmoGlobalRetry(attempt);
    }
  }
  throw new Error("Ammo is not available on globalThis, window, or self.");
}

function loadAmmoScript(scriptUrl: string, timeoutMs: number): Promise<void> {
  if (typeof document === "undefined" || typeof window === "undefined") {
    throw new Error("loadAmmoNamespace requires a browser document and window.");
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      settle(new Error(`Timed out loading ${scriptUrl}`));
    }, timeoutMs);

    const settle = (error?: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeoutId);
      window.removeEventListener("error", handleWindowError, { capture: true });
      script.removeEventListener("load", handleLoad);
      script.removeEventListener("error", handleScriptError);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    const handleWindowError = (event: ErrorEvent) => {
      if (!isAmmoScriptErrorEvent(event, scriptUrl)) {
        return;
      }
      event.preventDefault();
      settle(event.error instanceof Error ? event.error : new Error(event.message));
    };

    const handleLoad = () => {
      const queueLoadSettlement =
        typeof window.queueMicrotask === "function"
          ? window.queueMicrotask.bind(window)
          : (callback: VoidFunction) => window.setTimeout(callback, 0);
      queueLoadSettlement(() => settle());
    };

    const handleScriptError = () => {
      settle(new Error(`Failed to load ${scriptUrl}`));
    };

    window.addEventListener("error", handleWindowError, { capture: true });
    script.addEventListener("load", handleLoad);
    script.addEventListener("error", handleScriptError);
    script.async = true;
    script.src = scriptUrl;
    document.head.appendChild(script);
  });
}

function getAmmoCandidate(): AmmoCandidate | undefined {
  const globalScopes = [
    typeof globalThis !== "undefined" ? globalThis : undefined,
    typeof window !== "undefined" ? window : undefined,
    typeof globalThis !== "undefined" ? globalThis.self : undefined
  ];
  for (const scope of globalScopes) {
    const candidate = (scope as { Ammo?: AmmoCandidate } | undefined)?.Ammo;
    if (candidate) {
      return candidate;
    }
  }
  return undefined;
}

async function initAmmoNamespace(candidate: AmmoCandidate): Promise<AmmoNamespace> {
  if (typeof candidate === "function") {
    return await candidate();
  }
  return candidate;
}

function waitForAmmoGlobalRetry(attempt: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, attempt === 0 ? 0 : 16);
  });
}

function isAmmoScriptErrorEvent(event: ErrorEvent, scriptUrl: string): boolean {
  const filename = event.filename ?? "";
  const absoluteAmmoScriptUrl = new URL(scriptUrl, location.href).href;
  if (filename === absoluteAmmoScriptUrl || filename.endsWith(scriptUrl)) {
    return true;
  }
  const stack = typeof event.error?.stack === "string" ? event.error.stack : "";
  return stack.includes(absoluteAmmoScriptUrl) || stack.includes(scriptUrl);
}
