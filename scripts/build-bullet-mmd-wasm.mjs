import { spawn } from "node:child_process";
import { copyFile, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "..");
const physicsRoot = join(root, "native", "third_party", "mmd-anim", "crates", "mmd-anim-physics-bullet");
const bulletRoot = join(physicsRoot, "vendor", "bullet3");
const bindings = join(physicsRoot, "native", "mmd_bullet_api.cpp");
const outDir = join(root, "native", "mmd-anim-bullet", "dist");
const buildDir = join(outDir, ".tmp", `mmd-anim-${process.pid}-${Date.now().toString(36)}`);

const builds = [
  {
    name: "classic",
    scriptName: "mmd_bullet.js",
    environment: "web,node",
    extraArgs: []
  },
  {
    name: "module worker",
    scriptName: "mmd_bullet.worker.mjs",
    environment: "web,worker,node",
    extraArgs: ["-sEXPORT_ES6=1"]
  }
];

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
    throw new Error("mmd-anim's vendored Bullet source is missing. Run git submodule update --init --recursive native/third_party/mmd-anim.");
  }

  const emsdkRoot = await resolveEmsdkRoot();
  const commandInfo = await resolveEmscriptenCommand(emsdkRoot);
  const env = await buildEnvironment(emsdkRoot);
  const sources = [bindings];
  for (const sourceRoot of sourceRoots) {
    sources.push(...await collectCppSources(sourceRoot));
  }

  const exportedFunctions = [
    "_malloc",
    "_free",
    "_mmd_anim_bullet_world_create",
    "_mmd_anim_bullet_world_destroy",
    "_mmd_anim_bullet_world_reset",
    "_mmd_anim_bullet_world_settle_to_current",
    "_mmd_anim_bullet_world_step",
    "_mmd_anim_bullet_world_add_rigidbody",
    "_mmd_anim_bullet_world_get_rigidbody_count",
    "_mmd_anim_bullet_world_get_rigidbody_transform",
    "_mmd_anim_bullet_world_set_rigidbody_transform",
    "_mmd_anim_bullet_world_add_6dof_spring_joint",
    "_mmd_anim_bullet_world_get_constraint_count",
    "_mmd_anim_bullet_world_collect_contacts",
    "_mmd_anim_bullet_world_get_gravity",
    "_mmd_anim_bullet_world_set_gravity"
  ];

  console.log(`Using ${commandInfo.kind === "emsdk" ? "emsdk" : "PATH"} Emscripten: ${commandInfo.command}`);
  console.log(`Compiling mmd-anim Bullet classic and module-worker builds with ${sources.length} sources.`);

  await mkdir(buildDir, { recursive: true });
  try {
    await mkdir(outDir, { recursive: true });
    for (const build of builds) {
      const tmpScript = join(buildDir, build.scriptName);
      const tmpWasm = tmpScript.replace(/\.(?:m?js)$/i, ".wasm");
      const responseFile = join(buildDir, `emcc-mmd-${build.name.replaceAll(" ", "-")}-args.rsp`);
      const args = [
        ...sources,
        "-I",
        join(bulletRoot, "src"),
        "-O3",
        "-DNDEBUG",
        "-Wno-deprecated",
        "-sMODULARIZE=1",
        "-sEXPORT_NAME=MmdBullet",
        `-sENVIRONMENT=${build.environment}`,
        ...build.extraArgs,
        "-sINITIAL_MEMORY=67108864",
        `-sEXPORTED_FUNCTIONS=${JSON.stringify(exportedFunctions)}`,
        "--post-js",
        join(scriptDir, "expose-memory.js"),
        "-o",
        tmpScript
      ];

      await writeFile(responseFile, `${args.map(quoteResponseArg).join("\n")}\n`);
      console.log(`Compiling ${build.name} artifact: ${build.scriptName}`);
      await spawnCommand(commandInfo, [`@${responseFile}`], env);
      await copyFile(tmpScript, join(outDir, build.scriptName));
      await copyFile(tmpWasm, join(outDir, build.scriptName.replace(/\.(?:m?js)$/i, ".wasm")));
    }
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
