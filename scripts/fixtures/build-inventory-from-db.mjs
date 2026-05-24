#!/usr/bin/env node
// Build a fixture inventory (test/fixtures/fixtures.schema.json) from a local
// MMD asset SQLite database so a real-world model corpus can be run through the
// crash-smoke harness in scripts/check-fixtures.mjs.
//
// This is a local-only convenience: it emits the gitignored inventory that the
// corpus smoke consumes. The database path is never hardcoded — point it at
// your own asset DB via MMD_ASSET_DB or --db. The output (absolute local
// paths) defaults to the gitignored test/fixtures/fixtures.local.json.
//
// Models come from `assets` joined to `asset_urls` (url_kind='file',
// purpose='main_file'); motions/poses are discovered by scanning the motion
// directories referenced as url_kind='directory'. Nothing here parses the
// files — it only emits an inventory of on-disk paths.
//
// Usage:
//   MMD_ASSET_DB=/path/to/assets.sqlite node scripts/fixtures/build-inventory-from-db.mjs
//   node scripts/fixtures/build-inventory-from-db.mjs --db /path/to/assets.sqlite
//   node scripts/fixtures/build-inventory-from-db.mjs --out test/fixtures/fixtures.local.json
//   node scripts/fixtures/build-inventory-from-db.mjs --no-motions   # models only
//
// Environment:
//   MMD_ASSET_DB   path to the asset database (required unless --db is given)

import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..", "..");
const DEFAULT_DB = process.env.MMD_ASSET_DB;
const DEFAULT_OUT = resolve(projectRoot, "test", "fixtures", "fixtures.local.json");

const MODEL_EXTENSIONS = new Set([".pmx", ".pmd"]);
const MOTION_EXTENSIONS = new Set([".vmd", ".vpd"]);

function parseArgs(argv) {
  const args = { db: DEFAULT_DB, out: DEFAULT_OUT, motions: true };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--db") {
      args.db = argv[++i];
    } else if (value === "--out") {
      args.out = resolve(argv[++i]);
    } else if (value === "--no-motions") {
      args.motions = false;
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
    if (value === "--db" && (args.db === undefined || args.db === "")) {
      throw new Error("--db requires a path");
    }
  }
  return args;
}

function normalize(path) {
  return path.replaceAll("\\", "/");
}

// Longest common directory prefix across all collected absolute paths so the
// inventory can store short, readable basePath-relative entries.
function commonRoot(paths) {
  if (paths.length === 0) {
    return normalize(projectRoot);
  }
  const split = paths.map((path) => normalize(path).split("/"));
  const first = split[0];
  let length = first.length - 1; // exclude the filename segment
  for (const segments of split) {
    let i = 0;
    while (i < length && i < segments.length && segments[i] === first[i]) {
      i += 1;
    }
    length = i;
  }
  return first.slice(0, length).join("/");
}

function collectModels(db) {
  const rows = db
    .prepare(
      `SELECT u.url AS url
       FROM assets a
       JOIN asset_urls u ON u.asset_id = a.id
       WHERE a.asset_type = 'model'
         AND u.url_kind = 'file'
         AND u.purpose = 'main_file'`
    )
    .all();
  const models = [];
  const skipped = [];
  for (const { url } of rows) {
    const ext = extname(url).toLowerCase();
    if (!MODEL_EXTENSIONS.has(ext)) {
      skipped.push({ url, reason: `unsupported extension '${ext || "(none)"}'` });
      continue;
    }
    if (!existsSync(url)) {
      skipped.push({ url, reason: "missing on disk" });
      continue;
    }
    models.push({ url: normalize(url), ext });
  }
  return { models, skipped };
}

async function collectMotionsFromDirectories(db) {
  const rows = db
    .prepare(
      `SELECT u.url AS url
       FROM assets a
       JOIN asset_urls u ON u.asset_id = a.id
       WHERE a.asset_type = 'motion'
         AND u.url_kind IN ('file', 'directory')
         AND u.purpose = 'main_file'`
    )
    .all();
  const found = [];
  for (const { url } of rows) {
    const ext = extname(url).toLowerCase();
    if (MOTION_EXTENSIONS.has(ext)) {
      if (existsSync(url)) {
        found.push({ url: normalize(url), ext });
      }
      continue;
    }
    if (existsSync(url)) {
      await walkMotionDirectory(url, found);
    }
  }
  return found;
}

async function walkMotionDirectory(directory, found) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      await walkMotionDirectory(absolutePath, found);
      continue;
    }
    const ext = extname(entry.name).toLowerCase();
    if (entry.isFile() && MOTION_EXTENSIONS.has(ext)) {
      found.push({ url: normalize(absolutePath), ext });
    }
  }
}

function buildFixtureMap(entries, root, prefix) {
  const sorted = [...entries].sort((a, b) => a.url.localeCompare(b.url));
  const padding = String(sorted.length).length;
  const map = {};
  sorted.forEach((entry, index) => {
    const key = `${prefix}${String(index + 1).padStart(padding, "0")}`;
    const relativePath = relative(root, entry.url) || entry.url;
    map[key] = normalize(relativePath);
  });
  return map;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.db) {
    throw new Error("No asset database given. Set MMD_ASSET_DB or pass --db <path>.");
  }
  const dbPath = resolve(args.db);
  if (!existsSync(dbPath)) {
    throw new Error(`Asset database not found: ${dbPath}`);
  }

  const db = new DatabaseSync(dbPath, { readOnly: true });
  let models;
  let skipped;
  let motions = [];
  try {
    ({ models, skipped } = collectModels(db));
    if (args.motions) {
      motions = await collectMotionsFromDirectories(db);
    }
  } finally {
    db.close();
  }

  const allPaths = [...models, ...motions].map((entry) => entry.url);
  const root = commonRoot(allPaths);

  const pmx = buildFixtureMap(
    models.filter((entry) => entry.ext === ".pmx"),
    root,
    "pmx"
  );
  const pmd = buildFixtureMap(
    models.filter((entry) => entry.ext === ".pmd"),
    root,
    "pmd"
  );
  const vmd = buildFixtureMap(
    motions.filter((entry) => entry.ext === ".vmd"),
    root,
    "vmd"
  );
  const vpd = buildFixtureMap(
    motions.filter((entry) => entry.ext === ".vpd"),
    root,
    "vpd"
  );

  const inventory = {
    $schema: relative(dirname(args.out), resolve(projectRoot, "test/fixtures/fixtures.schema.json")).replaceAll("\\", "/"),
    schemaVersion: 1,
    basePath: root,
    paths: { releaseSmoke: { byExtension: { pmx, pmd, vmd, vpd } } },
    description: `Generated from ${normalize(dbPath)} on ${new Date().toISOString()}. Local corpus paths; do not commit.`
  };

  await mkdir(dirname(args.out), { recursive: true });
  await writeFile(args.out, `${JSON.stringify(inventory, null, 2)}\n`);

  console.log(`Inventory written: ${normalize(relative(projectRoot, args.out)) || args.out}`);
  console.log(`  basePath: ${root}`);
  console.log(
    `  pmx: ${Object.keys(pmx).length}, pmd: ${Object.keys(pmd).length}, ` +
      `vmd: ${Object.keys(vmd).length}, vpd: ${Object.keys(vpd).length}`
  );
  if (skipped.length > 0) {
    console.log(`  skipped ${skipped.length} model url(s):`);
    for (const item of skipped.slice(0, 10)) {
      console.log(`    - ${item.reason}: ${normalize(item.url)}`);
    }
    if (skipped.length > 10) {
      console.log(`    ... and ${skipped.length - 10} more`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
