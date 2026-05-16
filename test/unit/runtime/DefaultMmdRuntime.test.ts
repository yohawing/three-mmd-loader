import { describe, expect, it } from "vitest";

import { DefaultMmdRuntime } from "../../../src/index.js";

describe("DefaultMmdRuntime", () => {
  it("starts with a finite zero frame state by default", () => {
    const runtime = new DefaultMmdRuntime();

    expect(runtime.frameState()).toEqual({
      seconds: 0,
      frame: 0,
      frameRate: 30
    });
  });

  it("updates only the frame state when evaluated", () => {
    const runtime = new DefaultMmdRuntime({ frameRate: 60 });

    expect(runtime.evaluate(1.25)).toEqual({
      seconds: 1.25,
      frame: 75,
      frameRate: 60
    });
    expect(runtime.frameState()).toEqual({
      seconds: 1.25,
      frame: 75,
      frameRate: 60
    });
  });

  it("resets to zero seconds unless a seek time is provided", () => {
    const runtime = new DefaultMmdRuntime({ initialSeconds: 2 });

    expect(runtime.frameState()).toEqual({
      seconds: 2,
      frame: 60,
      frameRate: 30
    });
    expect(runtime.reset()).toEqual({
      seconds: 0,
      frame: 0,
      frameRate: 30
    });
    expect(runtime.reset(0.5)).toEqual({
      seconds: 0.5,
      frame: 15,
      frameRate: 30
    });
  });

  it("rejects non-finite frame state inputs", () => {
    const runtime = new DefaultMmdRuntime();

    expect(() => new DefaultMmdRuntime({ frameRate: 0 })).toThrow(RangeError);
    expect(() => new DefaultMmdRuntime({ frameRate: Number.POSITIVE_INFINITY })).toThrow(
      RangeError
    );
    expect(() => new DefaultMmdRuntime({ initialSeconds: Number.NaN })).toThrow(RangeError);
    expect(() => runtime.evaluate(Number.NEGATIVE_INFINITY)).toThrow(RangeError);
    expect(() => runtime.reset(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it("returns frame state snapshots", () => {
    const runtime = new DefaultMmdRuntime();
    const state = runtime.frameState() as { seconds: number };

    state.seconds = 10;

    expect(runtime.frameState()).toEqual({
      seconds: 0,
      frame: 0,
      frameRate: 30
    });
  });
});
