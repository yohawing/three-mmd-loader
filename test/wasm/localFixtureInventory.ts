import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type FixtureExtension =
  | "pmx"
  | "pmd"
  | "vmd"
  | "cameraVmd"
  | "backgroundPmx"
  | "backgroundPmd"
  | "vpd";

interface FixtureInventory {
  readonly basePath?: string;
  readonly paths?: {
    readonly releaseSmoke?: {
      readonly byExtension?: Partial<Record<FixtureExtension, Record<string, string>>>;
    };
  };
}

const localInventoryPath = resolve(
  process.env.THREE_MMD_WASM_FIXTURES_JSON ?? "test/fixtures/fixtures.local.json"
);

export function optionalLocalFixture(extension: FixtureExtension, key: string): string | undefined {
  if (!existsSync(localInventoryPath)) {
    return undefined;
  }

  const inventory = JSON.parse(readFileSync(localInventoryPath, "utf8")) as FixtureInventory;
  const fixturePath = inventory.paths?.releaseSmoke?.byExtension?.[extension]?.[key];
  if (!fixturePath) {
    return undefined;
  }

  const basePath = resolve(dirname(localInventoryPath), inventory.basePath ?? ".");
  return resolve(basePath, fixturePath);
}

export function existingOptionalPath(path: string | undefined): string | undefined {
  if (!path) {
    return undefined;
  }
  const resolved = resolve(path);
  return existsSync(resolved) ? resolved : undefined;
}
