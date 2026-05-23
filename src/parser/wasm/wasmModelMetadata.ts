import type { YwMmdWasmModule } from "./generated/yw_mmd_core.js";
import type { ModelMetadata } from "../model/modelTypes.js";

export function parseWasmModelMetadata(
  wasm: YwMmdWasmModule,
  bytes: Uint8Array,
  format: "pmx" | "pmd"
): ModelMetadata {
  const dataPointer = wasm._malloc(bytes.byteLength);
  const f32Pointer = wasm._malloc(4 * 4);
  const i32Pointer = wasm._malloc(32 * 4);
  const formatNum = format === "pmx" ? 1 : 2;
  try {
    wasm.refreshMemoryViews();
    wasm.HEAPU8.set(bytes, dataPointer);
    const ok = wasm._yw_mmd_parse_model_metadata(
      dataPointer,
      bytes.byteLength,
      formatNum,
      f32Pointer,
      i32Pointer
    );
    wasm.refreshMemoryViews();
    if (ok !== 1) {
      const status = wasm.HEAP32[i32Pointer / 4 + 18];
      throw new Error(`nanoem metadata parse failed with status ${status}`);
    }
    const f32Base = f32Pointer / 4;
    const i32Base = i32Pointer / 4;
    const i32 = wasm.HEAP32;
    const encodingCode = i32[i32Base + 1];
    const name = readWasmString(wasm, () =>
      wasm._yw_mmd_get_model_name(dataPointer, bytes.byteLength, formatNum)
    );
    const englishName = readWasmString(wasm, () =>
      wasm._yw_mmd_get_model_english_name(dataPointer, bytes.byteLength, formatNum)
    );
    const comment = readWasmString(wasm, () =>
      wasm._yw_mmd_get_model_comment(dataPointer, bytes.byteLength, formatNum)
    );
    const englishComment = readWasmString(wasm, () =>
      wasm._yw_mmd_get_model_english_comment(dataPointer, bytes.byteLength, formatNum)
    );
    return {
      format,
      version: wasm.HEAPF32[f32Base],
      encoding: encodingCode === 0 ? "utf-16-le" : encodingCode === 1 ? "utf-8" : "shift-jis",
      name,
      englishName,
      comment,
      englishComment,
      counts: {
        vertices: i32[i32Base + 9],
        faces: i32[i32Base + 10],
        materials: i32[i32Base + 11],
        bones: i32[i32Base + 12],
        morphs: i32[i32Base + 13],
        displayFrames: i32[i32Base + 14],
        rigidBodies: i32[i32Base + 15],
        joints: i32[i32Base + 16],
        softBodies: i32[i32Base + 17]
      },
      indexSizes: {
        vertex: i32[i32Base + 2],
        texture: i32[i32Base + 3],
        material: i32[i32Base + 4],
        bone: i32[i32Base + 5],
        morph: i32[i32Base + 6],
        rigidBody: i32[i32Base + 7]
      },
      additionalUvCount: i32[i32Base + 8],
      diagnostics: []
    };
  } finally {
    wasm._free(i32Pointer);
    wasm._free(f32Pointer);
    wasm._free(dataPointer);
  }
}

function readWasmString(wasm: YwMmdWasmModule, getPointer: () => number): string {
  const pointer = getPointer();
  try {
    return pointer ? wasm.UTF8ToString(pointer) : "";
  } finally {
    if (pointer) {
      wasm._yw_mmd_free_string(pointer);
    }
  }
}
