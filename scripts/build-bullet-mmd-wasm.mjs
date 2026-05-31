import { spawn } from "node:child_process";
import { copyFile, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "..");
const bulletRoot = join(root, "native", "third_party", "bullet3");
const bindings = join(root, "native", "bullet", "mmd_bindings.cc");
const outDir = join(root, "native", "bullet", "dist");
const buildDir = join(outDir, ".tmp", `mmd-${process.pid}-${Date.now().toString(36)}`);
const tmpJs = join(buildDir, "yw_mmd_bullet.js");
const tmpWasm = join(buildDir, "yw_mmd_bullet.wasm");
const responseFile = join(buildDir, "emcc-mmd-args.rsp");
const outJs = join(outDir, "yw_mmd_bullet.js");
const outWasm = join(outDir, "yw_mmd_bullet.wasm");

const sourceRoots = [
  join(bulletRoot, "src", "LinearMath"),
  join(bulletRoot, "src", "BulletCollision"),
  join(bulletRoot, "src", "BulletDynamics")
];

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function collectCppSources(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const sources = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      sources.push(...await collectCppSources(path));
    } else if (entry.isFile() && /\.(c|cc|cpp)$/i.test(entry.name)) {
      sources.push(path);
    }
  }
  return sources;
}

async function findFirstExisting(paths) {
  for (const path of paths) {
    if (await pathExists(path)) {
      return path;
    }
  }
  return undefined;
}

async function findFirstNestedExecutable(baseDir, platformRelativePaths) {
  if (!(await pathExists(baseDir))) {
    return undefined;
  }

  const entries = await readdir(baseDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    for (const relativePath of platformRelativePaths) {
      const candidate = join(baseDir, entry.name, relativePath);
      if (await pathExists(candidate)) {
        return candidate;
      }
    }
  }
  return undefined;
}

async function resolveEmsdkRoot() {
  const candidates = [
    process.env.EMSDK,
    join(root, "emsdk"),
    join(dirname(root), "emsdk")
  ].filter(Boolean);

  for (const candidate of candidates) {
    const resolved = resolve(candidate);
    if (await pathExists(join(resolved, "upstream", "emscripten"))) {
      return resolved;
    }
  }
  return undefined;
}

async function resolveEmscriptenCommand(emsdkRoot) {
  if (!emsdkRoot) {
    return { command: "em++", kind: "path" };
  }

  const emscriptenDir = join(emsdkRoot, "upstream", "emscripten");
  const command = process.platform === "win32"
    ? await findFirstExisting([
      join(emscriptenDir, "em++.bat"),
      join(emscriptenDir, "em++.cmd"),
      join(emscriptenDir, "em++.ps1")
    ])
    : await findFirstExisting([
      join(emscriptenDir, "em++"),
      join(emscriptenDir, "em++.py")
    ]);

  if (!command) {
    throw new Error(`Emscripten compiler was not found under ${emscriptenDir}.`);
  }
  return { command, kind: "emsdk" };
}

async function buildEnvironment(emsdkRoot) {
  const env = { ...process.env };
  if (!emsdkRoot) {
    return env;
  }

  const emscriptenDir = join(emsdkRoot, "upstream", "emscripten");
  env.EMSDK = emsdkRoot;
  env.PATH = [emsdkRoot, emscriptenDir, env.PATH].filter(Boolean).join(delimiter);

  const python = process.platform === "win32"
    ? await findFirstNestedExecutable(join(emsdkRoot, "python"), ["python.exe"])
    : await findFirstNestedExecutable(join(emsdkRoot, "python"), ["bin/python3", "bin/python"]);
  const node = process.platform === "win32"
    ? await findFirstNestedExecutable(join(emsdkRoot, "node"), [join("bin", "node.exe"), "node.exe"])
    : await findFirstNestedExecutable(join(emsdkRoot, "node"), [join("bin", "node")]);

  if (python) {
    env.EMSDK_PYTHON = python;
  }
  if (node) {
    env.EMSDK_NODE = node;
  }
  return env;
}

function spawnCommand(commandInfo, args, env) {
  let command = commandInfo.command;
  let commandArgs = args;
  let shell = false;

  if (process.platform === "win32" && command.toLowerCase().endsWith(".ps1")) {
    commandArgs = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", command, ...args];
    command = "powershell";
  } else if (process.platform === "win32" && /\.(bat|cmd)$/i.test(command)) {
    shell = true;
  }

  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: root,
      env,
      shell,
      stdio: "inherit"
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
      } else {
        reject(new Error(signal ? `${command} exited with signal ${signal}` : `${command} exited with code ${code}`));
      }
    });
  });
}

function quoteResponseArg(arg) {
  const normalized = arg.replaceAll("\\", "/");
  return /[\s"']/.test(normalized) ? `"${normalized.replaceAll('"', '\\"')}"` : normalized;
}

async function main() {
  if (!(await pathExists(join(bulletRoot, "src", "btBulletDynamicsCommon.h")))) {
    throw new Error("Bullet submodule is missing. Run git submodule update --init --recursive native/third_party/bullet3.");
  }

  const emsdkRoot = await resolveEmsdkRoot();
  const commandInfo = await resolveEmscriptenCommand(emsdkRoot);
  const env = await buildEnvironment(emsdkRoot);
  const sources = [bindings];
  for (const sourceRoot of sourceRoots) {
    sources.push(...await collectCppSources(sourceRoot));
  }

  const exportedFunctions = [
    "_yw_mmd_bullet_create_world",
    "_yw_mmd_bullet_destroy_world",
    "_yw_mmd_bullet_ensure_step_buffers",
    "_yw_mmd_bullet_begin_model",
    "_yw_mmd_bullet_add_rigid_body",
    "_yw_mmd_bullet_add_joint",
    "_yw_mmd_bullet_commit_model",
    "_yw_mmd_bullet_model_identity",
    "_yw_mmd_bullet_set_tuning",
    "_yw_mmd_bullet_reset_world",
    "_yw_mmd_bullet_reset_pose_sync",
    "_yw_mmd_bullet_step",
    "_yw_mmd_bullet_input_translations",
    "_yw_mmd_bullet_input_rotations",
    "_yw_mmd_bullet_input_world_matrices",
    "_yw_mmd_bullet_output_translations",
    "_yw_mmd_bullet_output_rotations",
    "_yw_mmd_bullet_output_world_matrices",
    "_yw_mmd_bullet_bone_physics_toggles",
    "_yw_mmd_bullet_updated_bone_indices",
    "_yw_mmd_bullet_debug_contact_count",
    "_yw_mmd_bullet_debug_contact_pair_count",
    "_yw_mmd_bullet_debug_contact_pairs",
    "_yw_mmd_bullet_debug_rigid_body_count",
    "_yw_mmd_bullet_debug_rigid_body_world_matrices"
  ];

  const args = [
    ...sources,
    "-I",
    join(bulletRoot, "src"),
    "-O3",
    "-DNDEBUG",
    "-Wno-deprecated",
    "-sMODULARIZE=1",
    "-sEXPORT_NAME=YwMmdBullet",
    "-sENVIRONMENT=web,node",
    "-sINITIAL_MEMORY=67108864",
    `-sEXPORTED_FUNCTIONS=${JSON.stringify(exportedFunctions)}`,
    "--post-js",
    join(scriptDir, "expose-memory.js"),
    "-o",
    tmpJs
  ];

  console.log(`Using ${commandInfo.kind === "emsdk" ? "emsdk" : "PATH"} Emscripten: ${commandInfo.command}`);
  console.log(`Compiling Bullet MMD build with ${sources.length} sources.`);

  await mkdir(buildDir, { recursive: true });
  try {
    await writeFile(responseFile, `${args.map(quoteResponseArg).join("\n")}\n`);
    await spawnCommand(commandInfo, [`@${responseFile}`], env);
    await mkdir(outDir, { recursive: true });
    await copyFile(tmpJs, outJs);
    await copyFile(tmpWasm, outWasm);
  } finally {
    await rm(buildDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  console.error("");
  console.error("Install and activate emsdk, set EMSDK, place emsdk under this repository or its parent, or put em++ on PATH.");
  process.exit(1);
});
