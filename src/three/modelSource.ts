export type ModelSource = string | File | ArrayBuffer | Uint8Array;

export const MODEL_SOURCE_STRING_UNRESOLVED = "MODEL_SOURCE_STRING_UNRESOLVED";

export function isModelSource(source: unknown): source is ModelSource {
  return (
    typeof source === "string" ||
    source instanceof ArrayBuffer ||
    source instanceof Uint8Array ||
    (typeof File !== "undefined" && source instanceof File)
  );
}

export async function readModelSourceBytes(source: ModelSource): Promise<Uint8Array> {
  if (source instanceof Uint8Array) {
    return source;
  }

  if (source instanceof ArrayBuffer) {
    return new Uint8Array(source);
  }

  if (typeof File !== "undefined" && source instanceof File) {
    return new Uint8Array(await source.arrayBuffer());
  }

  throw new TypeError(
    `${MODEL_SOURCE_STRING_UNRESOLVED}: string ModelSource requires a URL/file path resolution policy before bytes can be read`
  );
}
