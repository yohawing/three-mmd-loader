import { describe, expect, it } from "vitest";

import { sampleMmdCameraTrack, sampleMmdCameraTrackInto, sampleMmdLightTrack } from "../../../src/index.js";
import type { VmdCameraFrame, VmdLightFrame } from "../../../src/parser/model/modelTypes.js";

describe("camera and light runtime sampling", () => {
  it("samples VMD camera frames with channel-specific interpolation", () => {
    const camera = sampleMmdCameraTrack(createCameraFrames(), 5);

    expect(camera).toEqual({
      distance: 15,
      position: [5, 10, 15],
      rotation: [0.5, 1, 1.5],
      fov: 52.5,
      perspective: true
    });
  });

  it("samples VMD camera frames into a caller-owned scratch object", () => {
    const target = {
      distance: 0,
      position: [0, 0, 0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      fov: 1,
      perspective: true
    };

    const camera = sampleMmdCameraTrackInto(createCameraFrames(), 5, target);

    expect(camera).toBe(target);
    expect(target).toEqual({
      distance: 15,
      position: [5, 10, 15],
      rotation: [0.5, 1, 1.5],
      fov: 52.5,
      perspective: true
    });
  });

  it("advances a caller-owned camera frame index hint during forward sampling", () => {
    const target = {
      distance: 0,
      position: [0, 0, 0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      fov: 1,
      perspective: true
    };
    const hint = { index: 0 };
    const frames = [
      ...createCameraFrames(),
      {
        ...createCameraFrames()[1],
        frame: 20,
        distance: 30,
        position: [20, 40, 60] as [number, number, number]
      }
    ];

    sampleMmdCameraTrackInto(frames, 15, target, hint);

    expect(hint.index).toBe(1);
    expect(target.distance).toBe(25);
    expect(target.position).toEqual([15, 30, 45]);
  });

  it("holds one-frame camera cuts until the next MMD frame", () => {
    const frames = createCameraFrames();
    const camera = sampleMmdCameraTrack(
      [
        frames[0],
        {
          ...frames[1],
          frame: 1
        }
      ],
      0.5
    );

    expect(camera).toMatchObject({
      distance: 10,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      fov: 45,
      perspective: true
    });
  });

  it("samples VMD light frames linearly", () => {
    const light = sampleMmdLightTrack(createLightFrames(), 5);

    expect(light).toEqual({
      color: [0.5, 0.25, 0.75],
      direction: [0, -0.5, 0.5]
    });
  });
});

function createCameraFrames(): VmdCameraFrame[] {
  const linearCurve: [number, number, number, number] = [0, 0, 1, 1];
  return [
    {
      frame: 0,
      distance: 10,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      fov: 45,
      perspective: true,
      interpolation: {
        distance: linearCurve,
        positionX: linearCurve,
        positionY: linearCurve,
        positionZ: linearCurve,
        rotation: linearCurve,
        fov: linearCurve
      }
    },
    {
      frame: 10,
      distance: 20,
      position: [10, 20, 30],
      rotation: [1, 2, 3],
      fov: 60,
      perspective: false,
      interpolation: {
        distance: linearCurve,
        positionX: linearCurve,
        positionY: linearCurve,
        positionZ: linearCurve,
        rotation: linearCurve,
        fov: linearCurve
      }
    }
  ];
}

function createLightFrames(): VmdLightFrame[] {
  return [
    {
      frame: 0,
      color: [0, 0, 1],
      direction: [1, 0, 0]
    },
    {
      frame: 10,
      color: [1, 0.5, 0.5],
      direction: [-1, -1, 1]
    }
  ];
}
