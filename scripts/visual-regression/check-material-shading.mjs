#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { browserLaunchOptions, commonWebMimeTypes, isPathInside, startStaticServer } from "./render-shared.mjs";

const root = process.cwd();
const output = path.join(root, "test-results/visual/material-shading");
await mkdir(output, { recursive: true });
const server = await startStaticServer(url => {
  const file = path.resolve(root, `.${decodeURIComponent(url)}`);
  return isPathInside(file, root) ? file : undefined;
}, new Map([...commonWebMimeTypes, [".mjs", "text/javascript"]]));
let browser;
const errors = [];
try {
  const launch = browserLaunchOptions();
  browser = await chromium.launch({ ...launch, args: ["--enable-unsafe-webgpu", ...(launch.args ?? [])] });
  const page = await browser.newPage();
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("**/shading-probe", route => route.fulfill({
    contentType: "text/html",
    body: '<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/webgpu":"/node_modules/three/build/three.webgpu.js","three/tsl":"/node_modules/three/build/three.tsl.js"}}</script>'
  }));
  await page.goto(`${server.origin}/shading-probe`);
  const result = await page.evaluate(async () => {
    const { runMaterialShadingProbe } = await import("/scripts/visual-regression/material-shading-probe.mjs");
    return runMaterialShadingProbe();
  });
  if (process.argv.includes("--webgpu")) {
    const tsl = await page.evaluate(async () => {
      const { runTslShadowProbe } = await import("/scripts/visual-regression/tsl-shadow-probe.mjs");
      return runTslShadowProbe();
    });
    result.cases.push(...tsl.cases);
    result.failures.push(...tsl.failures);
    const reference = await page.evaluate(async () => {
      const { runReferenceShadowProbe } = await import("/scripts/visual-regression/reference-shadow-probe.mjs");
      return runReferenceShadowProbe();
    });
    result.cases.push(...reference.cases);
    result.failures.push(...reference.failures);
    // These mutations must fail actual receiver/caster readback, proving that
    // the new reference checks cannot pass with the old depth behavior.
    for (const mutation of [
      {name:'D3D9 raster center missing',file:'**/dist/three/mmd-shadow-projection.js',from:'1 / this.light.shadow.mapSize.x',to:'0 / this.light.shadow.mapSize.x'},
      {name:'reference mode1 scale',file:'**/dist/webgpu/shadow-visibility.js',from:'float(1500)',to:'float(150)'},
      {name:'reference raw depth reversed',file:'**/dist/webgpu/self-shadow-pass.js',from:'referencePosition.z.div(referencePosition.w)',to:'referencePosition.w.sub(referencePosition.z).div(referencePosition.w)'}
    ]) {
      const negative=await browser.newPage();
      await negative.route('**/shading-probe',route=>route.fulfill({contentType:'text/html',body:'<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/webgpu":"/node_modules/three/build/three.webgpu.js","three/tsl":"/node_modules/three/build/three.tsl.js"}}</script>'}));
      await negative.route(mutation.file,async route=>{
        const response=await route.fetch(),body=await response.text();
        if(!body.includes(mutation.from))throw Error(`Mutation anchor missing: ${mutation.name}`);
        await route.fulfill({response,body:body.replaceAll(mutation.from,mutation.to)});
      });
      await negative.goto(`${server.origin}/shading-probe`);
      const detected=await negative.evaluate(async()=>{
        const {runReferenceShadowProbe}=await import('/scripts/visual-regression/reference-shadow-probe.mjs');
        return (await runReferenceShadowProbe()).failures;
      });
      result.mutations.push({name:mutation.name,detected});
      if(!detected.length)result.failures.push(`Undetected mutation: ${mutation.name}`);
      await negative.close();
    }
  }
  await page.screenshot({ path: path.join(output, "probe.png") });
  await writeFile(path.join(output, "report.json"), JSON.stringify({ ...result, errors }, null, 2));
  if (errors.length || result.failures.length) throw new Error(JSON.stringify({ failures: result.failures, errors }));
  console.log(`Material shading: ${result.cases.length} rendering/bounds checks, ${result.mutations.length} detected regressions.`);
} finally {
  await browser?.close();
  await server.close();
}
