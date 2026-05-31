import type { AmmoNamespace } from "./ammoMmdPhysicsBackend.js";
import { loadAmmoNamespace, type AmmoBrowserLoaderOptions } from "./ammoBrowserLoader.js";

export const customBulletAmmoScriptPath = "./ammo/yw_bullet_ammo.js";

export interface CustomBulletAmmoLoaderOptions extends AmmoBrowserLoaderOptions {
  readonly baseUrl?: string;
  readonly scriptUrl?: string;
}

export function resolveCustomBulletAmmoScriptUrl(baseUrl: string = import.meta.url): string {
  return new URL(customBulletAmmoScriptPath, baseUrl).href;
}

export async function loadCustomBulletAmmoNamespace(
  options: CustomBulletAmmoLoaderOptions = {}
): Promise<AmmoNamespace> {
  return await loadAmmoNamespace(
    options.scriptUrl ?? resolveCustomBulletAmmoScriptUrl(options.baseUrl),
    options
  );
}
