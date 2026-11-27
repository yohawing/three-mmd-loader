import type * as THREE from "three";
import type { MmdCore } from "../parser/model/modelTypes.js";
import type { MmdRuntimeOptions, MmdRuntime } from "../runtime/index.js";
import type { ThreeMmdTextureLoader } from "./materials.js";
import type { LoaderPerformanceOptions } from "./performance.js";
import type { ModelSourceFetch } from "./modelSource.js";
import type { TextureMap, TextureResolver } from "./textures.js";
import type { ThreeMmdModelSourceDescriptor } from "./loaded-model.js";

export interface ThreeMmdLoaderOptions {
  /** Resolves MMD-relative texture paths when loading model materials. */
  readonly textureResolver?: TextureResolver;
  /** Maps MMD-relative texture paths to browser-loadable texture sources. */
  readonly textureMap?: TextureMap;
  /** Overrides the default Three.js texture loader for ordinary textures. */
  readonly textureLoader?: ThreeMmdTextureLoader;
  /** Overrides the texture loader used for DDS textures. */
  readonly ddsLoader?: ThreeMmdTextureLoader;
  /** Enables geometry-aware texture alpha checks. Defaults to off, except when outlines require it internally. */
  readonly geometryAwareAlpha?: boolean;
  /** Options forwarded to the per-model runtime. */
  readonly runtime?: MmdRuntimeOptions;
  /** Creates a per-model runtime. When omitted, the bundled mmd-anim runtime is used for PMX. */
  readonly runtimeFactory?: (context: ThreeMmdRuntimeFactoryContext) => MmdRuntime;
  /** Parser core override. When omitted, the loader uses the TypeScript parser core. */
  readonly core?: MmdCore | Promise<MmdCore>;
  /** Overrides fetch for string ModelSource values. */
  readonly fetch?: ModelSourceFetch;
  /** Enables load-time performance marks and diagnostics. */
  readonly performance?: boolean | LoaderPerformanceOptions;
  /** Receives recoverable parser-core failures before falling back to the TypeScript parser. */
  readonly onCoreFallback?: (event: ThreeMmdCoreFallbackEvent) => void;
}

export interface ThreeMmdRuntimeFactoryContext {
  readonly modelBytes: Uint8Array;
  readonly mesh: THREE.SkinnedMesh;
  readonly source: ThreeMmdModelSourceDescriptor;
}

export interface ThreeMmdCoreFallbackEvent {
  readonly operation: "initCore" | "loadModel" | "loadVmd";
  readonly error: unknown;
}

export interface ThreeMmdLoadModelOptions {
  /** Creates MMD outline proxy meshes. Defaults to true. */
  readonly outline?: boolean;
  /**
   * @deprecated Use outline instead. This alias will be removed in 1.0.0.
   */
  readonly outlines?: boolean;
  /** Applies MMD-compatible per-material render ordering with proxy meshes. Defaults to true. */
  readonly materialRenderOrder?: boolean;
  /**
   * @deprecated Use materialRenderOrder instead. This alias will be removed in 1.0.0.
   */
  readonly renderOrderProxies?: boolean;
  /** Splits large sparse morph geometry into per-material body meshes. Defaults to true. */
  readonly morphSplit?: boolean;
  /** Creates dense Three.js morph attributes. Defaults to true. */
  readonly morphAttributes?: boolean;
  /** Applies frustum culling to the base mesh and generated proxy meshes. */
  readonly frustumCulled?: boolean;
  /** Overrides fetch for this string ModelSource load. */
  readonly fetch?: ModelSourceFetch;
  /** Cancels this string ModelSource fetch when supported by the host fetch implementation. */
  readonly signal?: AbortSignal;
}

export type ThreeMmdCoreDiagnostic =
  | {
      readonly kind: "provided";
    }
  | {
      readonly kind: "wasm";
    }
  | {
      readonly kind: "fallback";
      readonly operation: ThreeMmdCoreFallbackEvent["operation"];
      readonly reason: string;
    };

const deprecatedApiWarnings = new Set<string>();

export function warnDeprecatedLoadModelOptions(options: ThreeMmdLoadModelOptions): void {
  if (options.outlines !== undefined) {
    warnDeprecatedApi("ThreeMmdLoadModelOptions.outlines", "outline");
  }
  if (options.renderOrderProxies !== undefined) {
    warnDeprecatedApi("ThreeMmdLoadModelOptions.renderOrderProxies", "materialRenderOrder");
  }
}

export function validateLoadModelOptions(options: ThreeMmdLoadModelOptions): void {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new TypeError("ThreeMmdLoader.loadModel options must be an object");
  }
  if (options.fetch !== undefined && typeof options.fetch !== "function") {
    throw new TypeError("ThreeMmdLoader.loadModel fetch must be a function");
  }
  if (options.morphSplit !== undefined && typeof options.morphSplit !== "boolean") {
    throw new TypeError("ThreeMmdLoader.loadModel morphSplit must be a boolean");
  }
  if (options.morphAttributes !== undefined && typeof options.morphAttributes !== "boolean") {
    throw new TypeError("ThreeMmdLoader.loadModel morphAttributes must be a boolean");
  }
}

export function warnDeprecatedApi(name: string, replacement: string): void {
  if (deprecatedApiWarnings.has(name)) {
    return;
  }
  deprecatedApiWarnings.add(name);
  globalThis.console?.warn?.(
    `[three-mmd-loader] ${name} is deprecated and will be removed in the next breaking release. Use ${replacement} instead.`
  );
}

export function normalizeLoaderPerformanceOptions(
  performanceOptions: ThreeMmdLoaderOptions["performance"]
): LoaderPerformanceOptions {
  if (performanceOptions === true) {
    return { enabled: true };
  }
  if (performanceOptions && typeof performanceOptions === "object") {
    return performanceOptions;
  }
  return {};
}

export function validateLoaderOptions(options: ThreeMmdLoaderOptions): void {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new TypeError("ThreeMmdLoader options must be an object");
  }

  if (options.textureResolver !== undefined) {
    if (typeof options.textureResolver !== "object" || options.textureResolver === null) {
      throw new TypeError("ThreeMmdLoader textureResolver must be an object");
    }
    if (typeof options.textureResolver.resolve !== "function") {
      throw new TypeError("ThreeMmdLoader textureResolver.resolve must be a function");
    }
  }

  if (options.textureMap !== undefined) {
    if (
      typeof options.textureMap !== "object" ||
      options.textureMap === null ||
      Array.isArray(options.textureMap)
    ) {
      throw new TypeError("ThreeMmdLoader textureMap must be an object");
    }
    for (const [path, value] of Object.entries(options.textureMap)) {
      if (!isTextureMapValue(value)) {
        throw new TypeError(
          `ThreeMmdLoader textureMap entry "${path}" must be a string, URL, or Blob`
        );
      }
    }
  }

  if (options.textureLoader !== undefined) {
    if (typeof options.textureLoader !== "object" || options.textureLoader === null) {
      throw new TypeError("ThreeMmdLoader textureLoader must be an object");
    }
    if (typeof options.textureLoader.load !== "function") {
      throw new TypeError("ThreeMmdLoader textureLoader.load must be a function");
    }
  }

  if (options.ddsLoader !== undefined) {
    if (typeof options.ddsLoader !== "object" || options.ddsLoader === null) {
      throw new TypeError("ThreeMmdLoader ddsLoader must be an object");
    }
    if (typeof options.ddsLoader.load !== "function") {
      throw new TypeError("ThreeMmdLoader ddsLoader.load must be a function");
    }
  }

  if (
    options.runtime !== undefined &&
    (typeof options.runtime !== "object" || options.runtime === null)
  ) {
    throw new TypeError("ThreeMmdLoader runtime options must be an object");
  }

  if (
    options.core !== undefined &&
    (typeof options.core !== "object" || options.core === null || Array.isArray(options.core))
  ) {
    throw new TypeError("ThreeMmdLoader core must be an object or Promise-like object");
  }

  if (options.onCoreFallback !== undefined && typeof options.onCoreFallback !== "function") {
    throw new TypeError("ThreeMmdLoader onCoreFallback must be a function");
  }

  if (options.runtimeFactory !== undefined && typeof options.runtimeFactory !== "function") {
    throw new TypeError("ThreeMmdLoader runtimeFactory must be a function");
  }

  if (options.fetch !== undefined && typeof options.fetch !== "function") {
    throw new TypeError("ThreeMmdLoader fetch must be a function");
  }

  if (
    options.performance !== undefined &&
    typeof options.performance !== "boolean" &&
    (typeof options.performance !== "object" ||
      options.performance === null ||
      Array.isArray(options.performance))
  ) {
    throw new TypeError("ThreeMmdLoader performance must be a boolean or options object");
  }

  if (
    typeof options.performance === "object" &&
    options.performance !== null &&
    options.performance.onMeasure !== undefined &&
    typeof options.performance.onMeasure !== "function"
  ) {
    throw new TypeError("ThreeMmdLoader performance.onMeasure must be a function");
  }
}

function isTextureMapValue(value: unknown): value is TextureMap[string] {
  return (
    typeof value === "string" ||
    value instanceof URL ||
    (typeof Blob !== "undefined" && value instanceof Blob)
  );
}
