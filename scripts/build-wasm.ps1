$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")

if ($env:EMSDK) {
  $emsdk = Resolve-Path $env:EMSDK
}
elseif (Test-Path (Join-Path $root "emsdk")) {
  $emsdk = Resolve-Path (Join-Path $root "emsdk")
}
elseif (Test-Path (Join-Path (Split-Path $root -Parent) "emsdk")) {
  $emsdk = Resolve-Path (Join-Path (Split-Path $root -Parent) "emsdk")
}
else {
  Write-Error "emsdk not found. Set EMSDK or place emsdk under $root or its parent."
  exit 1
}

$emcc = Join-Path $emsdk "upstream\emscripten\emcc.ps1"
$emsdkPython = Join-Path $emsdk "python\3.13.3_64bit\python.exe"
$emsdkNode = Join-Path $emsdk "node\22.16.0_64bit\bin\node.exe"
$outDir = Join-Path $PSScriptRoot "..\src\parser\wasm\generated"
$tmpDir = Join-Path $outDir ".tmp"
$buildId = [System.Guid]::NewGuid().ToString("N")
$buildDir = Join-Path $tmpDir $buildId
$tmpFile = Join-Path $buildDir "yw_mmd_core.js"
$outFile = Join-Path $outDir "yw_mmd_core.js"
$outWasm = Join-Path $outDir "yw_mmd_core.wasm"
$nanoemRoot = Join-Path $root "native\third_party\nanoem"

New-Item -ItemType Directory -Force -Path $outDir | Out-Null
New-Item -ItemType Directory -Force -Path $buildDir | Out-Null

$env:EMSDK = $emsdk
$env:EMSDK_PYTHON = $emsdkPython
$env:EMSDK_NODE = $emsdkNode
$env:PATH = "$emsdk;$emsdk\upstream\emscripten;$env:PATH"

& $emcc `
  (Join-Path $root "native\yw_mmd_core.cc") `
  (Join-Path $nanoemRoot "nanoem\nanoem.c") `
  (Join-Path $nanoemRoot "nanoem\ext\emscripten.cc") `
  -I $nanoemRoot `
  -I (Join-Path $nanoemRoot "nanoem") `
  -O2 `
  "--bind" `
  "-sMODULARIZE=1" `
  "-sEXPORT_ES6=1" `
  "-sENVIRONMENT=web,node" `
  "-sALLOW_MEMORY_GROWTH=1" `
  "-sEXPORTED_FUNCTIONS=['_malloc','_free','_yw_mmd_version','_yw_mmd_health_check','_yw_mmd_parse_model_metadata','_yw_mmd_parse_model_metadata_to_cache','_yw_mmd_metadata_f32','_yw_mmd_metadata_i32','_yw_mmd_parse_vmd_metadata','_yw_mmd_motion_load','_yw_mmd_motion_free','_yw_mmd_motion_metadata_i32','_yw_mmd_motion_model_name','_yw_mmd_motion_bone_name','_yw_mmd_motion_bone_i32','_yw_mmd_motion_bone_f32','_yw_mmd_motion_bone_interpolation','_yw_mmd_motion_morph_name','_yw_mmd_motion_morph_i32','_yw_mmd_motion_morph_f32','_yw_mmd_motion_camera_i32','_yw_mmd_motion_camera_f32','_yw_mmd_motion_camera_interpolation','_yw_mmd_motion_light_i32','_yw_mmd_motion_light_f32','_yw_mmd_motion_self_shadow_i32','_yw_mmd_motion_self_shadow_f32','_yw_mmd_motion_model_i32','_yw_mmd_motion_model_constraint_name','_yw_mmd_motion_model_constraint_enabled','_yw_mmd_get_model_name','_yw_mmd_get_model_english_name','_yw_mmd_get_model_comment','_yw_mmd_get_model_english_comment','_yw_mmd_free_string','_yw_mmd_model_load','_yw_mmd_model_metadata_i32','_yw_mmd_model_metadata_f32','_yw_mmd_model_name','_yw_mmd_model_english_name','_yw_mmd_model_comment','_yw_mmd_model_english_comment','_yw_mmd_model_vertex_count','_yw_mmd_model_index_count','_yw_mmd_model_additional_uv_count','_yw_mmd_model_positions_ptr','_yw_mmd_model_normals_ptr','_yw_mmd_model_uvs_ptr','_yw_mmd_model_skin_indices_ptr','_yw_mmd_model_skin_weights_ptr','_yw_mmd_model_edge_scale_ptr','_yw_mmd_model_sdef_enabled_ptr','_yw_mmd_model_sdef_c_ptr','_yw_mmd_model_sdef_r0_ptr','_yw_mmd_model_sdef_r1_ptr','_yw_mmd_model_sdef_rw0_ptr','_yw_mmd_model_sdef_rw1_ptr','_yw_mmd_model_indices_ptr','_yw_mmd_model_additional_uvs_ptr','_yw_mmd_model_free','_yw_mmd_material_name','_yw_mmd_material_english_name','_yw_mmd_material_texture_path','_yw_mmd_material_sphere_texture_path','_yw_mmd_material_toon_texture_path','_yw_mmd_material_f32_table_ptr','_yw_mmd_material_i32_table_ptr','_yw_mmd_material_string_ptrs_ptr','_yw_mmd_material_f32','_yw_mmd_material_i32','_yw_mmd_bone_name','_yw_mmd_bone_english_name','_yw_mmd_bone_f32_table_ptr','_yw_mmd_bone_i32_table_ptr','_yw_mmd_bone_string_ptrs_ptr','_yw_mmd_bone_f32','_yw_mmd_bone_i32','_yw_mmd_bone_ik_limit_angle','_yw_mmd_bone_ik_link_count','_yw_mmd_bone_ik_links_ptr','_yw_mmd_morph_name','_yw_mmd_morph_english_name','_yw_mmd_morph_i32_table_ptr','_yw_mmd_morph_string_ptrs_ptr','_yw_mmd_morph_offset_ptrs_ptr','_yw_mmd_morph_type','_yw_mmd_morph_offset_count','_yw_mmd_morph_offset_ptr','_yw_mmd_morph_dense_position_ptr','_yw_mmd_morph_dense_uv_ptr','_yw_mmd_morph_dense_additional_uv_ptr','_yw_mmd_label_name','_yw_mmd_label_english_name','_yw_mmd_label_is_special','_yw_mmd_label_item_count','_yw_mmd_label_item_type','_yw_mmd_label_item_index','_yw_mmd_rigid_body_name','_yw_mmd_rigid_body_english_name','_yw_mmd_rigid_body_f32','_yw_mmd_rigid_body_i32','_yw_mmd_joint_name','_yw_mmd_joint_english_name','_yw_mmd_joint_f32','_yw_mmd_joint_i32','_yw_mmd_soft_body_name','_yw_mmd_soft_body_english_name','_yw_mmd_soft_body_i32','_yw_mmd_soft_body_f32','_yw_mmd_soft_body_anchor_i32','_yw_mmd_soft_body_pinned_vertex']" `
  "-sEXPORTED_RUNTIME_METHODS=['UTF8ToString','ccall']" `
  "--post-js" (Join-Path $PSScriptRoot "expose-memory.js") `
  -o $tmpFile

if ($LASTEXITCODE -ne 0) {
  Remove-Item -Recurse -Force -Path $buildDir -ErrorAction SilentlyContinue
  exit $LASTEXITCODE
}

$mutex = New-Object System.Threading.Mutex($false, "Global\yw_mmd_core_wasm_build")
try {
  $null = $mutex.WaitOne()
  Copy-Item -Force -Path $tmpFile -Destination $outFile
  Copy-Item -Force -Path (Join-Path $buildDir "yw_mmd_core.wasm") -Destination $outWasm
}
finally {
  $mutex.ReleaseMutex()
  $mutex.Dispose()
  Remove-Item -Recurse -Force -Path $buildDir -ErrorAction SilentlyContinue
}
