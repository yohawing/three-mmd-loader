import { spawn } from "node:child_process";
import { copyFile, mkdir, readdir, rm, stat } from "node:fs/promises";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "..");
const outDir = join(root, "src", "parser", "wasm", "generated");
const buildDir = join(outDir, ".tmp", `${process.pid}-${Date.now().toString(36)}`);
const tmpFile = join(buildDir, "yw_mmd_core.js");
const outFile = join(outDir, "yw_mmd_core.js");
const outWasm = join(outDir, "yw_mmd_core.wasm");
const nanoemRoot = join(root, "native", "third_party", "nanoem");

const exportedFunctions = [
  "_malloc",
  "_free",
  "_yw_mmd_version",
  "_yw_mmd_health_check",
  "_yw_mmd_parse_model_metadata",
  "_yw_mmd_parse_model_metadata_to_cache",
  "_yw_mmd_metadata_f32",
  "_yw_mmd_metadata_i32",
  "_yw_mmd_parse_vmd_metadata",
  "_yw_mmd_motion_load",
  "_yw_mmd_motion_free",
  "_yw_mmd_motion_metadata_i32",
  "_yw_mmd_motion_model_name",
  "_yw_mmd_motion_bone_name_ptrs_ptr",
  "_yw_mmd_motion_bone_i32_table_ptr",
  "_yw_mmd_motion_bone_f32_table_ptr",
  "_yw_mmd_motion_bone_interpolation_table_ptr",
  "_yw_mmd_motion_bone_name",
  "_yw_mmd_motion_bone_i32",
  "_yw_mmd_motion_bone_f32",
  "_yw_mmd_motion_bone_interpolation",
  "_yw_mmd_motion_morph_name_ptrs_ptr",
  "_yw_mmd_motion_morph_i32_table_ptr",
  "_yw_mmd_motion_morph_f32_table_ptr",
  "_yw_mmd_motion_morph_name",
  "_yw_mmd_motion_morph_i32",
  "_yw_mmd_motion_morph_f32",
  "_yw_mmd_motion_camera_i32_table_ptr",
  "_yw_mmd_motion_camera_f32_table_ptr",
  "_yw_mmd_motion_camera_interpolation_table_ptr",
  "_yw_mmd_motion_camera_i32",
  "_yw_mmd_motion_camera_f32",
  "_yw_mmd_motion_camera_interpolation",
  "_yw_mmd_motion_light_i32_table_ptr",
  "_yw_mmd_motion_light_f32_table_ptr",
  "_yw_mmd_motion_light_i32",
  "_yw_mmd_motion_light_f32",
  "_yw_mmd_motion_self_shadow_i32_table_ptr",
  "_yw_mmd_motion_self_shadow_f32_table_ptr",
  "_yw_mmd_motion_self_shadow_i32",
  "_yw_mmd_motion_self_shadow_f32",
  "_yw_mmd_motion_model_i32_table_ptr",
  "_yw_mmd_motion_model_constraint_offsets_ptr",
  "_yw_mmd_motion_model_constraint_name_ptrs_ptr",
  "_yw_mmd_motion_model_constraint_enabled_table_ptr",
  "_yw_mmd_motion_model_i32",
  "_yw_mmd_motion_model_constraint_name",
  "_yw_mmd_motion_model_constraint_enabled",
  "_yw_mmd_get_model_name",
  "_yw_mmd_get_model_english_name",
  "_yw_mmd_get_model_comment",
  "_yw_mmd_get_model_english_comment",
  "_yw_mmd_free_string",
  "_yw_mmd_model_load",
  "_yw_mmd_model_metadata_i32",
  "_yw_mmd_model_metadata_f32",
  "_yw_mmd_model_name",
  "_yw_mmd_model_english_name",
  "_yw_mmd_model_comment",
  "_yw_mmd_model_english_comment",
  "_yw_mmd_model_vertex_count",
  "_yw_mmd_model_index_count",
  "_yw_mmd_model_additional_uv_count",
  "_yw_mmd_model_positions_ptr",
  "_yw_mmd_model_normals_ptr",
  "_yw_mmd_model_uvs_ptr",
  "_yw_mmd_model_skin_indices_ptr",
  "_yw_mmd_model_skin_weights_ptr",
  "_yw_mmd_model_edge_scale_ptr",
  "_yw_mmd_model_sdef_enabled_ptr",
  "_yw_mmd_model_sdef_c_ptr",
  "_yw_mmd_model_sdef_r0_ptr",
  "_yw_mmd_model_sdef_r1_ptr",
  "_yw_mmd_model_sdef_rw0_ptr",
  "_yw_mmd_model_sdef_rw1_ptr",
  "_yw_mmd_model_qdef_enabled_ptr",
  "_yw_mmd_model_indices_ptr",
  "_yw_mmd_model_additional_uvs_ptr",
  "_yw_mmd_model_free",
  "_yw_mmd_material_name",
  "_yw_mmd_material_english_name",
  "_yw_mmd_material_texture_path",
  "_yw_mmd_material_sphere_texture_path",
  "_yw_mmd_material_toon_texture_path",
  "_yw_mmd_material_f32_table_ptr",
  "_yw_mmd_material_i32_table_ptr",
  "_yw_mmd_material_string_ptrs_ptr",
  "_yw_mmd_material_f32",
  "_yw_mmd_material_i32",
  "_yw_mmd_bone_name",
  "_yw_mmd_bone_english_name",
  "_yw_mmd_bone_f32_table_ptr",
  "_yw_mmd_bone_i32_table_ptr",
  "_yw_mmd_bone_string_ptrs_ptr",
  "_yw_mmd_bone_f32",
  "_yw_mmd_bone_i32",
  "_yw_mmd_bone_ik_limit_angle",
  "_yw_mmd_bone_ik_link_count",
  "_yw_mmd_bone_ik_links_ptr",
  "_yw_mmd_morph_name",
  "_yw_mmd_morph_english_name",
  "_yw_mmd_morph_i32_table_ptr",
  "_yw_mmd_morph_string_ptrs_ptr",
  "_yw_mmd_morph_offset_ptrs_ptr",
  "_yw_mmd_morph_type",
  "_yw_mmd_morph_offset_count",
  "_yw_mmd_morph_offset_ptr",
  "_yw_mmd_morph_dense_position_ptr",
  "_yw_mmd_morph_dense_uv_ptr",
  "_yw_mmd_morph_dense_additional_uv_ptr",
  "_yw_mmd_label_name",
  "_yw_mmd_label_english_name",
  "_yw_mmd_label_is_special",
  "_yw_mmd_label_item_count",
  "_yw_mmd_label_item_type",
  "_yw_mmd_label_item_index",
  "_yw_mmd_rigid_body_string_ptrs_ptr",
  "_yw_mmd_rigid_body_f32_table_ptr",
  "_yw_mmd_rigid_body_i32_table_ptr",
  "_yw_mmd_rigid_body_name",
  "_yw_mmd_rigid_body_english_name",
  "_yw_mmd_rigid_body_f32",
  "_yw_mmd_rigid_body_i32",
  "_yw_mmd_joint_string_ptrs_ptr",
  "_yw_mmd_joint_f32_table_ptr",
  "_yw_mmd_joint_i32_table_ptr",
  "_yw_mmd_joint_name",
  "_yw_mmd_joint_english_name",
  "_yw_mmd_joint_f32",
  "_yw_mmd_joint_i32",
  "_yw_mmd_soft_body_string_ptrs_ptr",
  "_yw_mmd_soft_body_f32_table_ptr",
  "_yw_mmd_soft_body_i32_table_ptr",
  "_yw_mmd_soft_body_anchor_offsets_ptr",
  "_yw_mmd_soft_body_anchor_i32_table_ptr",
  "_yw_mmd_soft_body_pinned_offsets_ptr",
  "_yw_mmd_soft_body_pinned_vertex_table_ptr",
  "_yw_mmd_soft_body_name",
  "_yw_mmd_soft_body_english_name",
  "_yw_mmd_soft_body_i32",
  "_yw_mmd_soft_body_f32",
  "_yw_mmd_soft_body_anchor_i32",
  "_yw_mmd_soft_body_pinned_vertex"
];

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  }
  catch {
    return false;
  }
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
    commandArgs = [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      command,
      ...args
    ];
    command = "powershell";
  }
  else if (process.platform === "win32" && /\.(bat|cmd)$/i.test(command)) {
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
      }
      else {
        reject(new Error(signal ? `${command} exited with signal ${signal}` : `${command} exited with code ${code}`));
      }
    });
  });
}

function formatExportedFunctions(functions) {
  return `-sEXPORTED_FUNCTIONS=[${functions.map((name) => `'${name}'`).join(",")}]`;
}

async function main() {
  const emsdkRoot = await resolveEmsdkRoot();
  const commandInfo = await resolveEmscriptenCommand(emsdkRoot);
  const env = await buildEnvironment(emsdkRoot);
  const args = [
    join(root, "native", "yw_mmd_core.cc"),
    "-x",
    "c++",
    join(nanoemRoot, "nanoem", "nanoem.c"),
    "-x",
    "none",
    join(nanoemRoot, "nanoem", "ext", "emscripten.cc"),
    "-I",
    nanoemRoot,
    "-I",
    join(nanoemRoot, "nanoem"),
    "-O2",
    "-Wno-deprecated",
    "--bind",
    "-sMODULARIZE=1",
    "-sEXPORT_ES6=1",
    "-sENVIRONMENT=web,node",
    "-sALLOW_MEMORY_GROWTH=1",
    formatExportedFunctions(exportedFunctions),
    "-sEXPORTED_RUNTIME_METHODS=['UTF8ToString','ccall']",
    "--post-js",
    join(scriptDir, "expose-memory.js"),
    "-o",
    tmpFile
  ];

  console.log(`Using ${commandInfo.kind === "emsdk" ? "emsdk" : "PATH"} Emscripten: ${commandInfo.command}`);

  await mkdir(buildDir, { recursive: true });
  try {
    await spawnCommand(commandInfo, args, env);
    await mkdir(outDir, { recursive: true });
    await copyFile(tmpFile, outFile);
    await copyFile(join(buildDir, "yw_mmd_core.wasm"), outWasm);
  }
  finally {
    await rm(buildDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  console.error("");
  console.error("Emscripten is not installed as an npm dependency for this package.");
  console.error("Install and activate emsdk, set EMSDK, place emsdk under this repository or its parent, or put em++ on PATH.");
  process.exit(1);
});
