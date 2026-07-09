import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "../../..");

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(resolve(repoRoot, relativePath), "utf8");
}

function extractCodeBlockImports(markdown: string): string[] {
  const codeBlockRegex = /```ts\r?\n([\s\S]*?)```/g;
  const importRegex = /import\s+\{([^}]+)\}\s+from\s+"([^"]+)"/g;
  const imports: string[] = [];
  let block;
  while ((block = codeBlockRegex.exec(markdown)) !== null) {
    let match;
    while ((match = importRegex.exec(block[1])) !== null) {
      const names = match[1]
        .split(",")
        .map((n) => n.trim().replace(/^type\s+/, ""))
        .filter((n) => n.length > 0);
      for (const name of names) {
        imports.push(`${name} from "${match[2]}"`);
      }
    }
  }
  return imports;
}

async function collectExportedNames(entryFile: string, visited = new Set<string>()): Promise<Set<string>> {
  if (visited.has(entryFile)) return new Set();
  visited.add(entryFile);

  const source = await readRepoFile(entryFile);
  const names = new Set<string>();

  const starReExportRegex = /export\s+\*\s+from\s+"([^"]+)"/g;
  let match;
  while ((match = starReExportRegex.exec(source)) !== null) {
    const target = resolveRelativeImport(entryFile, match[1]);
    if (target) {
      const childNames = await collectExportedNames(target, visited);
      for (const name of childNames) names.add(name);
    }
  }

  const namedReExportRegex = /export\s+\{([^}]+)\}/g;
  while ((match = namedReExportRegex.exec(source)) !== null) {
    for (const name of match[1].split(",")) {
      const cleaned = name.trim().replace(/^type\s+/, "").replace(/\s+as\s+\S+/, "");
      if (cleaned.length > 0) names.add(cleaned);
    }
  }

  const declRegex = /export\s+(?:class|function|const|interface|type|enum)\s+(\w+)/g;
  while ((match = declRegex.exec(source)) !== null) {
    names.add(match[1]);
  }

  return names;
}

function resolveRelativeImport(fromFile: string, specifier: string): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const dir = dirname(fromFile);
  const resolved = specifier.replace(/\.js$/, ".ts");
  return `${dir}/${resolved}`.replace(/\\/g, "/");
}

const subpathEntryMap: Record<string, string> = {
  "@yohawing/three-mmd-loader": "src/index.ts",
  "@yohawing/three-mmd-loader/three": "src/three/index.ts",
  "@yohawing/three-mmd-loader/parser": "src/parser/index.ts",
  "@yohawing/three-mmd-loader/runtime": "src/runtime/index.ts",
  "@yohawing/three-mmd-loader/physics": "src/physics/index.ts",
  "@yohawing/three-mmd-loader/webgpu": "src/webgpu/index.ts"
};

async function verifyImports(readmePath: string): Promise<string[]> {
  const readme = await readRepoFile(readmePath);
  const imports = extractCodeBlockImports(readme);
  expect(imports.length).toBeGreaterThan(0);

  const exportCache = new Map<string, Set<string>>();
  const missing: string[] = [];

  for (const entry of imports) {
    const match = entry.match(/^(\S+) from "([^"]+)"$/);
    if (!match) continue;
    const [, name, pkg] = match;
    const entryFile = subpathEntryMap[pkg];
    if (!entryFile) {
      if (!pkg.startsWith("@yohawing")) continue;
      missing.push(entry);
      continue;
    }
    if (!exportCache.has(entryFile)) {
      exportCache.set(entryFile, await collectExportedNames(entryFile));
    }
    const names = exportCache.get(entryFile);
    if (!names) {
      missing.push(`${name} not resolved from ${entryFile}`);
      continue;
    }
    if (!names.has(name)) {
      missing.push(`${name} not exported from ${entryFile}`);
    }
  }
  return missing;
}

function extractRecipeCodeBlocks(markdown: string): string[] {
  const recipeSectionMatch = markdown.match(/##\s+(?:Recipes|レシピ)\r?\n([\s\S]*?)(?=\r?\n##\s+[^#]|$)/);
  if (!recipeSectionMatch) return [];
  const section = recipeSectionMatch[1];
  const blocks: string[] = [];
  const regex = /```ts\r?\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(section)) !== null) {
    blocks.push(match[1].trim());
  }
  return blocks;
}

describe("README recipe imports", () => {
  it("all imports in README.md reference public exports", async () => {
    const missing = await verifyImports("README.md");
    expect(missing).toEqual([]);
  });

  it("all imports in README.ja.md reference public exports", async () => {
    const missing = await verifyImports("docs/README.ja.md");
    expect(missing).toEqual([]);
  });

  it("both READMEs have the same recipe code blocks (ignoring comments)", async () => {
    const en = await readRepoFile("README.md");
    const ja = await readRepoFile("docs/README.ja.md");

    const stripComments = (code: string): string =>
      code.replace(/\/\/.*$/gm, "").replace(/\n{2,}/g, "\n").trim();

    const enBlocks = extractRecipeCodeBlocks(en).map(stripComments);
    const jaBlocks = extractRecipeCodeBlocks(ja).map(stripComments);
    expect(enBlocks.length).toBeGreaterThan(0);
    expect(enBlocks.length).toBe(jaBlocks.length);
    for (let i = 0; i < enBlocks.length; i++) {
      expect(enBlocks[i]).toBe(jaBlocks[i]);
    }
  });
});
