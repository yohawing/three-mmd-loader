#!/usr/bin/env node
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await rm(options.report, { force: true });
  const computeStatus = await runNode("compute-metrics.mjs", [
    "--profile",
    "generated-pmx",
    "--baseline-dir",
    options.baselineDir,
    "--current-dir",
    options.currentDir,
    "--diff-dir",
    options.diffDir,
    "--report",
    options.report
  ]);

  const reportExists = existsSync(options.report);
  if (reportExists) {
    const htmlStatus = await runNode("write-visual-comparison-html.mjs", [
      "--title",
      options.title,
      "--report",
      options.report,
      "--baseline-dir",
      options.baselineDir,
      "--current-dir",
      options.currentDir,
      "--diff-dir",
      options.diffDir,
      "--output",
      options.output
    ]);
    if (htmlStatus !== 0) {
      process.exitCode = htmlStatus;
      return;
    }
  }

  if (!reportExists) {
    process.exitCode = computeStatus === 0 ? 1 : computeStatus;
    return;
  }
  if (computeStatus !== 0 && !options.failOnMismatch) {
    console.log("Visual differences were found; report mode leaves exit status 0. Pass --fail-on-mismatch to gate on them.");
    return;
  }
  process.exitCode = computeStatus;
}

function runNode(scriptName, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, scriptName), ...args], {
      cwd: repoRoot,
      stdio: "inherit",
      windowsHide: true
    });
    child.on("error", reject);
    child.on("close", code => {
      resolve(code ?? 1);
    });
  });
}

function parseArgs(args) {
  const options = {
    baselineDir: path.join(repoRoot, "test", "fixtures", "visual-baselines", "generated-pmx"),
    currentDir: path.join(repoRoot, "test-results", "visual", "generated-pmx-webgpu", "current"),
    diffDir: path.join(repoRoot, "test-results", "visual", "generated-pmx-webgpu", "diff"),
    report: path.join(repoRoot, "test-results", "visual", "generated-pmx-webgpu", "report.json"),
    output: path.join(repoRoot, "test-results", "visual", "generated-pmx-webgpu", "index.html"),
    title: "Generated PMX WebGPU vs visual-baselines/generated-pmx",
    failOnMismatch: false
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--baseline-dir") {
      options.baselineDir = path.resolve(requireValue(args, index += 1, arg));
    } else if (arg === "--current-dir") {
      options.currentDir = path.resolve(requireValue(args, index += 1, arg));
    } else if (arg === "--diff-dir") {
      options.diffDir = path.resolve(requireValue(args, index += 1, arg));
    } else if (arg === "--report") {
      options.report = path.resolve(requireValue(args, index += 1, arg));
    } else if (arg === "--output") {
      options.output = path.resolve(requireValue(args, index += 1, arg));
    } else if (arg === "--title") {
      options.title = requireValue(args, index += 1, arg);
    } else if (arg === "--fail-on-mismatch") {
      options.failOnMismatch = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function requireValue(args, index, flag) {
  const value = args[index];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

await main();
