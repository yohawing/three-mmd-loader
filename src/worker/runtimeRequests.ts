import type { MmdFrameState } from "../runtime/types.js";

export interface SettledRequest {
  readonly epoch: number;
  readonly resolve: (state: MmdFrameState) => void;
  readonly reject: (error: Error) => void;
  readonly signal: AbortSignal | undefined;
  readonly onAbort: (() => void) | undefined;
}

export interface ReadyWaiter {
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
}

export function createAbortError(): Error {
  const error = new Error("MMD runtime settled request was aborted");
  error.name = "AbortError";
  return error;
}
