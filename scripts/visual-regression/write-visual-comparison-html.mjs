#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = JSON.parse(await readFile(options.report, "utf8"));
  const html = renderHtml({
    title: options.title,
    generatedAt: report.generatedAt,
    pass: report.pass,
    cases: report.cases,
    baselineDir: path.relative(path.dirname(options.output), options.baselineDir),
    currentDir: path.relative(path.dirname(options.output), options.currentDir),
    diffDir: path.relative(path.dirname(options.output), options.diffDir)
  });
  await writeFile(options.output, html);
  console.log(`Visual comparison HTML: ${path.relative(repoRoot, options.output)}`);
}

function renderHtml(view) {
  const sortedCases = [...view.cases].sort((a, b) => Number(a.pass) - Number(b.pass) || b.mean - a.mean);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(view.title)}</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, "Segoe UI", sans-serif; background: #101214; color: #e8eaed; }
    body { margin: 0; background: #101214; }
    header { padding: 24px 28px 18px; border-bottom: 1px solid #2a2f36; background: #171a1f; }
    main { padding: 22px 28px 40px; }
    h1 { margin: 0 0 10px; font-size: 24px; font-weight: 650; letter-spacing: 0; }
    h2 { margin: 24px 0 12px; font-size: 18px; letter-spacing: 0; }
    h3 { margin: 0; font-size: 16px; letter-spacing: 0; }
    .meta { color: #aab0bb; font-size: 13px; line-height: 1.5; }
    .summary { display: grid; grid-template-columns: repeat(4, minmax(130px, 1fr)); gap: 10px; margin: 18px 0 8px; }
    .stat { border: 1px solid #2a2f36; background: #171a1f; border-radius: 6px; padding: 12px; }
    .stat strong { display: block; font-size: 22px; color: #fff; }
    .stat span { color: #aab0bb; font-size: 12px; }
    .case { border-top: 1px solid #2a2f36; padding: 20px 0; }
    .case-head { display: flex; justify-content: space-between; gap: 16px; align-items: baseline; margin-bottom: 12px; }
    .metrics { display: flex; flex-wrap: wrap; gap: 8px; color: #c8ced8; font-size: 12px; }
    .badge { border: 1px solid #39414b; background: #1b2027; border-radius: 999px; padding: 4px 8px; }
    .badge.fail { border-color: #7f352f; background: #2b1715; color: #ffb3aa; }
    .badge.pass { border-color: #315b3c; background: #142118; color: #a7e0b4; }
    .frames { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    figure { margin: 0; border: 1px solid #2a2f36; background: #15181d; border-radius: 6px; overflow: hidden; }
    figcaption { padding: 8px 10px; color: #c8ced8; font-size: 12px; border-bottom: 1px solid #2a2f36; }
    img { display: block; width: 100%; height: auto; background: #08090a; }
    @media (max-width: 900px) {
      main, header { padding-left: 16px; padding-right: 16px; }
      .summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .frames { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(view.title)}</h1>
    <div class="meta">Generated ${escapeHtml(view.generatedAt)}</div>
    <div class="meta">Overall: ${view.pass ? "PASS" : "FAIL"}</div>
  </header>
  <main>
    <section class="summary">
      <div class="stat"><strong>${view.cases.length}</strong><span>cases</span></div>
      <div class="stat"><strong>${view.cases.filter(testCase => testCase.pass).length}</strong><span>passing</span></div>
      <div class="stat"><strong>${view.cases.filter(testCase => !testCase.pass).length}</strong><span>failing</span></div>
      <div class="stat"><strong>${formatMetric(Math.max(...view.cases.map(testCase => testCase.mean)))}</strong><span>worst mean</span></div>
    </section>
    <h2>Cases</h2>
    ${sortedCases.map(testCase => renderCase(testCase, view)).join("\n")}
  </main>
</body>
</html>
`;
}

function renderCase(testCase, view) {
  const statusClass = testCase.pass ? "pass" : "fail";
  return `<section class="case">
  <div class="case-head">
    <h3>${escapeHtml(testCase.case)}</h3>
    <div class="metrics">
      <span class="badge ${statusClass}">${testCase.pass ? "PASS" : "FAIL"}</span>
      <span class="badge">mean ${formatMetric(testCase.mean)} / ${formatMetric(testCase.thresholds.mean)}</span>
      <span class="badge">p95 ${formatMetric(testCase.p95)} / ${formatMetric(testCase.thresholds.p95)}</span>
      <span class="badge">max ${formatMetric(testCase.max)}</span>
    </div>
  </div>
  <div class="frames">
    <figure><figcaption>visual-baseline/generated-pmx</figcaption><img src="${escapeAttribute(pathToUrl(path.join(view.baselineDir, `${testCase.case}.png`)))}" alt="${escapeAttribute(testCase.case)} baseline"></figure>
    <figure><figcaption>WebGPU/TSL current</figcaption><img src="${escapeAttribute(pathToUrl(path.join(view.currentDir, `${testCase.case}.png`)))}" alt="${escapeAttribute(testCase.case)} current"></figure>
    <figure><figcaption>Diff heatmap</figcaption><img src="${escapeAttribute(pathToUrl(path.join(view.diffDir, `${testCase.case}.png`)))}" alt="${escapeAttribute(testCase.case)} diff"></figure>
  </div>
</section>`;
}

function pathToUrl(value) {
  return value.split(path.sep).map(encodeURIComponent).join("/");
}

function formatMetric(value) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(6) : "n/a";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char]);
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

function parseArgs(args) {
  const options = {
    title: "Visual Comparison",
    report: undefined,
    baselineDir: undefined,
    currentDir: undefined,
    diffDir: undefined,
    output: undefined
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--title") {
      options.title = requireValue(args, index += 1, arg);
    } else if (arg === "--report") {
      options.report = path.resolve(requireValue(args, index += 1, arg));
    } else if (arg === "--baseline-dir") {
      options.baselineDir = path.resolve(requireValue(args, index += 1, arg));
    } else if (arg === "--current-dir") {
      options.currentDir = path.resolve(requireValue(args, index += 1, arg));
    } else if (arg === "--diff-dir") {
      options.diffDir = path.resolve(requireValue(args, index += 1, arg));
    } else if (arg === "--output") {
      options.output = path.resolve(requireValue(args, index += 1, arg));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  for (const key of ["report", "baselineDir", "currentDir", "diffDir", "output"]) {
    if (options[key] === undefined) {
      throw new Error(`Missing required --${key.replace(/[A-Z]/g, char => `-${char.toLowerCase()}`)}`);
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
