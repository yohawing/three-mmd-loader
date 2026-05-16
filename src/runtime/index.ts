export * from "./ik/index.js";

export interface MmdFrameState {
  readonly seconds: number;
  readonly frame: number;
  readonly frameRate: number;
}

export interface MmdRuntime {
  evaluate(seconds: number): MmdFrameState;
  reset(seconds?: number): MmdFrameState;
  frameState(): MmdFrameState;
}

export interface DefaultMmdRuntimeOptions {
  readonly frameRate?: number;
  readonly initialSeconds?: number;
}

export class DefaultMmdRuntime implements MmdRuntime {
  private readonly frameRate: number;
  private state: MmdFrameState;

  constructor(options: DefaultMmdRuntimeOptions = {}) {
    this.frameRate = normalizeFrameRate(options.frameRate ?? 30);
    this.state = createFrameState(options.initialSeconds ?? 0, this.frameRate);
  }

  evaluate(seconds: number): MmdFrameState {
    this.state = createFrameState(seconds, this.frameRate);
    return this.frameState();
  }

  reset(seconds = 0): MmdFrameState {
    this.state = createFrameState(seconds, this.frameRate);
    return this.frameState();
  }

  frameState(): MmdFrameState {
    return { ...this.state };
  }
}

function normalizeFrameRate(frameRate: number): number {
  if (!Number.isFinite(frameRate) || frameRate <= 0) {
    throw new RangeError("MMD runtime frameRate must be a finite positive number");
  }
  return frameRate;
}

function createFrameState(seconds: number, frameRate: number): MmdFrameState {
  if (!Number.isFinite(seconds)) {
    throw new RangeError("MMD runtime seconds must be finite");
  }
  return {
    seconds,
    frame: seconds * frameRate,
    frameRate
  };
}
