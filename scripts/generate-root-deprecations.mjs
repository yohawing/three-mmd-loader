import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const entries = ["parser", "runtime", "three", "physics"];
const barrel = (entry) => `./${entry}/index.js`;

export function generateRootDeprecations() {
  const keep = JSON.parse(readFileSync(resolve(root, "scripts/root-entry-keep.json"), "utf8"));
  const kept = new Set([...keep.values, ...keep.types]);
  const paths = entries.map((entry) => resolve(root, "src", entry, "index.ts"));
  const program = ts.createProgram(paths, { module: ts.ModuleKind.NodeNext, skipLibCheck: true });
  const checker = program.getTypeChecker();
  const imports = [];
  const aliases = [];
  const exports = [];
  const seen = new Set();
  for (const [i, entry] of entries.entries()) {
    const module = checker.getSymbolAtLocation(program.getSourceFile(paths[i]));
    const names = [];
    for (const symbol of checker.getExportsOfModule(module).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      const { name } = symbol;
      const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
      if (seen.has(name) || kept.has(name)) continue;
      seen.add(name);
      if ([symbol, target].some((s) => s.getJsDocTags(checker).some((tag) => tag.name === "deprecated"))) continue;
      const value = Boolean(target.flags & ts.SymbolFlags.Value);
      const prefix = value ? "" : "type ";
      names.push(`  ${prefix}${name} as ${name}_`);
      exports.push(`  ${prefix}${name}`);
      const doc = `/** @deprecated Import from "@yohawing/three-mmd-loader/${entry}". Removed from the root entry in 1.0.0. */`;
      if (value) aliases.push(doc, `export const ${name} = ${name}_;`, "");
      if (target.flags & ts.SymbolFlags.Type) {
        const parameters = target.declarations.find((d) => d.typeParameters)?.typeParameters ?? [];
        const list = (items) => items.length ? `<${items.join(", ")}>` : "";
        aliases.push(doc, `export type ${name}${list(parameters.map((p) => p.getText()))} = ${name}_${list(parameters.map((p) => p.name.text))};`, "");
      }
    }
    if (names.length) imports.push(`import {\n${names.join(",\n")}\n} from "${barrel(entry)}";`);
  }
  const header = "// generated — do not edit. Run node scripts/generate-root-deprecations.mjs.";
  return {
    deprecated: [header, ...imports, "", ...aliases].join("\n"),
    index: [header, ...entries.map((entry) => `export * from "${barrel(entry)}";`),
      "", `export {\n${exports.join(",\n")}\n} from "./root-deprecated.js";`, ""].join("\n")
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { deprecated, index } = generateRootDeprecations();
  writeFileSync(resolve(root, "src/root-deprecated.ts"), deprecated);
  writeFileSync(resolve(root, "src/index.ts"), index);
}
