#!/usr/bin/env node
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const workDir = await mkdtemp(join(tmpdir(), "three-mmd-loader-types-"));

try {
  const packOutput = execFileSync("npm", ["pack", "--json", "--pack-destination", workDir], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"]
  });
  const [packedPackage] = JSON.parse(packOutput);
  if (!packedPackage?.filename) {
    throw new Error("npm pack did not report a package filename");
  }

  const packagePath = join(workDir, packedPackage.filename);
  await writeFile(
    join(workDir, "package.json"),
    JSON.stringify(
      {
        private: true,
        type: "module",
        dependencies: {
          "@yohawing/three-mmd-loader": `file:${packagePath.replaceAll("\\", "/")}`,
          three: "^0.176.0"
        },
        devDependencies: {
          typescript: "^5.8.3"
        }
      },
      null,
      2
    )
  );
  await writeFile(
    join(workDir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          skipLibCheck: false,
          noEmit: true
        },
        include: ["consumer.ts"]
      },
      null,
      2
    )
  );
  await writeFile(
    join(workDir, "consumer.ts"),
    `import { ThreeMmdLoader, type ThreeMmdAnimation, type ThreeMmdModel } from "@yohawing/three-mmd-loader";
import { parsePmxMetadata } from "@yohawing/three-mmd-loader/parser";
import { DefaultMmdRuntime, exportMmdAnimWasmVmdAnimationJsonBytes, loadMmdAnimWasmVmd, parseMmdAnimWasmFormatJson } from "@yohawing/three-mmd-loader/runtime";
import {
  applyMmdCameraStateToThreeCamera,
  applyMmdLightStateToThreeDirectionalLight,
  configureMmdSelfShadowDirectionalLight,
  createMmdTextureMapFromFiles,
  createThreeSkeleton,
  disposeMmdModel,
  findMmdModelFiles,
  findMmdMotionFiles,
  fitMmdSelfShadowDirectionalLightToBox,
  MMD_SELF_SHADOW_LAYER
} from "@yohawing/three-mmd-loader/three";
import {
  MMD_TSL_DEFAULT_LIGHT_COLOR,
  createMmdTslToonMaterial,
  syncMmdTslMaterialState,
  type MmdTslMaterialAssemblyOptions,
  type MmdTslMaterialCoreOptions,
  type MmdTslMaterialUniforms
} from "@yohawing/three-mmd-loader/webgpu";
import { createCustomBulletMmdPhysicsBackend, createDisabledMmdPhysicsBackend, loadCustomBulletMmdModule } from "@yohawing/three-mmd-loader/physics";

const loader: ThreeMmdLoader = new ThreeMmdLoader();
const runtime: DefaultMmdRuntime = new DefaultMmdRuntime();
const physics = createDisabledMmdPhysicsBackend();
declare const model: ThreeMmdModel;
declare const animation: ThreeMmdAnimation;
declare const parserWasm: { parseMmdFormatJson(data: Uint8Array, fileName?: string | null): string };
declare const exporterWasm: { exportVmdAnimationJsonBytes(json: string): Uint8Array };
declare const webgpuCoreOptions: MmdTslMaterialCoreOptions;
declare const webgpuAssemblyOptions: MmdTslMaterialAssemblyOptions;
declare const webgpuUniforms: MmdTslMaterialUniforms;
model.root.add(model.mesh);
model.setAnimation(animation);
model.update(0);
model.diagnostics.textures.forEach((diagnostic) => void diagnostic.code);
model.diagnostics.materials.forEach((diag) => void diag.finalTransparencyMode);
model.diagnostics.performance.forEach((m) => void m.durationMs);
const parsed: unknown = parseMmdAnimWasmFormatJson(parserWasm, new Uint8Array(), "motion.vmd");
const runtimeAnimation = loadMmdAnimWasmVmd(parserWasm, new Uint8Array(), "motion.vmd");
const exported: Uint8Array = exportMmdAnimWasmVmdAnimationJsonBytes(exporterWasm, "{}");

void loader;
void runtime;
void physics;
void parsed;
void runtimeAnimation;
void exported;
void parsePmxMetadata;
void createThreeSkeleton;
void applyMmdCameraStateToThreeCamera;
void applyMmdLightStateToThreeDirectionalLight;
void configureMmdSelfShadowDirectionalLight;
void fitMmdSelfShadowDirectionalLightToBox;
void MMD_SELF_SHADOW_LAYER;
void disposeMmdModel;
void findMmdModelFiles;
void findMmdMotionFiles;
void createMmdTextureMapFromFiles;
void MMD_TSL_DEFAULT_LIGHT_COLOR;
void createMmdTslToonMaterial;
void syncMmdTslMaterialState;
void webgpuCoreOptions;
void webgpuAssemblyOptions;
void webgpuUniforms;
void createCustomBulletMmdPhysicsBackend;
void loadCustomBulletMmdModule;
`
  );

  execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: workDir,
    stdio: "inherit"
  });
  execFileSync("npx", ["tsc", "--noEmit"], {
    cwd: workDir,
    stdio: "inherit"
  });
} finally {
  await rm(workDir, { recursive: true, force: true });
}
