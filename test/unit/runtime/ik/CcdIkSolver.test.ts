import { describe, expect, it } from "vitest";

import {
  CcdIkSolver,
  createCcdIkSolveInputFromMmdIk,
  mmdIkChainToCcdIkChain,
  type CcdIkBone,
  type MutableQuatTuple,
  type MmdIkRuntimeChain
} from "../../../../src/runtime/index.js";

const IDENTITY: MutableQuatTuple = [0, 0, 0, 1];

function eulerXyzToQuaternionForTest(euler: readonly [number, number, number]): MutableQuatTuple {
  const halfX = euler[0] * 0.5;
  const halfY = euler[1] * 0.5;
  const halfZ = euler[2] * 0.5;
  const sx = Math.sin(halfX);
  const cx = Math.cos(halfX);
  const sy = Math.sin(halfY);
  const cy = Math.cos(halfY);
  const sz = Math.sin(halfZ);
  const cz = Math.cos(halfZ);
  const rotation: MutableQuatTuple = [
    sx * cy * cz + cx * sy * sz,
    cx * sy * cz - sx * cy * sz,
    cx * cy * sz + sx * sy * cz,
    cx * cy * cz - sx * sy * sz
  ];
  const length = Math.hypot(...rotation);
  return [rotation[0] / length, rotation[1] / length, rotation[2] / length, rotation[3] / length];
}

function rotateVectorForTest(
  vector: readonly [number, number, number],
  rotation: readonly [number, number, number, number]
): [number, number, number] {
  const [qx, qy, qz, qw] = rotation;
  const [vx, vy, vz] = vector;
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return [
    vx + qw * tx + qy * tz - qz * ty,
    vy + qw * ty + qz * tx - qx * tz,
    vz + qw * tz + qx * ty - qy * tx
  ];
}

describe("CcdIkSolver", () => {
  it("solves a simple finite one-link CCD chain", () => {
    const bones: CcdIkBone[] = [
      { parentIndex: -1, translation: [0, 0, 0] },
      { parentIndex: 0, translation: [1, 0, 0] },
      { parentIndex: 1, translation: [1, 0, 0] },
      { parentIndex: 0, translation: [1, 1, 0] }
    ];
    const rotations: MutableQuatTuple[] = [
      [...IDENTITY],
      [...IDENTITY],
      [...IDENTITY],
      [...IDENTITY]
    ];
    const solver = new CcdIkSolver();

    const result = solver.solve({
      bones,
      pose: { rotations },
      chains: [
        {
          goalBoneIndex: 3,
          effectorBoneIndex: 2,
          links: [{ boneIndex: 1 }],
          iterationCount: 4,
          maxAnglePerIteration: Math.PI
        }
      ]
    });

    expect(result.chainCount).toBe(1);
    expect(result.iterationCount).toBeGreaterThan(0);
    expect(result.finalDistances[0]).toBeLessThan(1e-5);
    for (const rotation of rotations) {
      expect(rotation.every(Number.isFinite)).toBe(true);
    }
    expect(rotations[1][2]).toBeCloseTo(Math.SQRT1_2, 5);
    expect(rotations[1][3]).toBeCloseTo(Math.SQRT1_2, 5);
  });

  it("treats an omitted maxAnglePerIteration as unlimited", () => {
    const bones: CcdIkBone[] = [
      { parentIndex: -1, translation: [0, 0, 0] },
      { parentIndex: 0, translation: [1, 0, 0] },
      { parentIndex: 1, translation: [1, 0, 0] },
      { parentIndex: 0, translation: [1, 1, 0] }
    ];
    const rotations: MutableQuatTuple[] = [
      [...IDENTITY],
      [...IDENTITY],
      [...IDENTITY],
      [...IDENTITY]
    ];

    const result = new CcdIkSolver().solve({
      bones,
      pose: { rotations },
      chains: [
        {
          goalBoneIndex: 3,
          effectorBoneIndex: 2,
          links: [{ boneIndex: 1 }],
          iterationCount: 4
        }
      ]
    });

    expect(result.finalDistances[0]).toBeLessThan(1e-5);
    expect(rotations[1][2]).toBeCloseTo(Math.SQRT1_2, 5);
    expect(rotations[1][3]).toBeCloseTo(Math.SQRT1_2, 5);
  });

  it("stops solving when the effector is already within tolerance", () => {
    const bones: CcdIkBone[] = [
      { parentIndex: -1, translation: [0, 0, 0] },
      { parentIndex: 0, translation: [1, 0, 0] },
      { parentIndex: 0, translation: [1, 0, 0] }
    ];
    const rotations: MutableQuatTuple[] = [[...IDENTITY], [...IDENTITY], [...IDENTITY]];

    const result = new CcdIkSolver().solve({
      bones,
      pose: { rotations },
      chains: [
        {
          goalBoneIndex: 2,
          effectorBoneIndex: 1,
          links: [{ boneIndex: 0 }],
          iterationCount: 8,
          tolerance: 1e-5
        }
      ]
    });

    expect(result.iterationCount).toBe(0);
    expect(result.finalDistances[0]).toBe(0);
    expect(rotations).toEqual([[...IDENTITY], [...IDENTITY], [...IDENTITY]]);
  });

  it("uses Saba-compatible zero-endpoint detection for single-axis limits", () => {
    const bones: CcdIkBone[] = [
      { parentIndex: -1, translation: [0, 0, 0] },
      { parentIndex: 0, translation: [1, 0, 0] },
      { parentIndex: -1, translation: [0, 0, -1] }
    ];
    const rotations: MutableQuatTuple[] = [[...IDENTITY], [...IDENTITY], [...IDENTITY]];

    const result = new CcdIkSolver().solve({
      bones,
      pose: { rotations },
      chains: [
        {
          goalBoneIndex: 2,
          effectorBoneIndex: 1,
          links: [
            {
              boneIndex: 0,
              angleLimit: {
                minimumAngle: [-0.1, 0, 0],
                maximumAngle: [0.1, Math.PI / 2, 0]
              }
            }
          ],
          iterationCount: 8,
          maxAnglePerIteration: Math.PI
        }
      ]
    });

    expect(result.finalDistances[0]).toBeCloseTo(Math.SQRT2, 5);
    expect(Math.abs(rotations[0][0])).toBeGreaterThan(0);
    expect(rotations[0][1]).toBeCloseTo(0, 5);
  });

  it("matches Saba plane-link behavior for base pose rotations", () => {
    const bones: CcdIkBone[] = [
      { parentIndex: -1, translation: [0, 0, 0] },
      { parentIndex: 0, translation: [0, 1, 0] },
      { parentIndex: -1, translation: [0, 0, 1] }
    ];
    const baseRotation = eulerXyzToQuaternionForTest([0, 0, Math.PI / 4]);
    const rotations: MutableQuatTuple[] = [[...baseRotation], [...IDENTITY], [...IDENTITY]];

    new CcdIkSolver().solve({
      bones,
      pose: { rotations },
      chains: [
        {
          goalBoneIndex: 2,
          effectorBoneIndex: 1,
          links: [
            {
              boneIndex: 0,
              angleLimit: {
                minimumAngle: [-Math.PI, 0, 0],
                maximumAngle: [Math.PI, 0, 0]
              }
            }
          ],
          iterationCount: 4,
          maxAnglePerIteration: Math.PI
        }
      ]
    });

    expect(rotations[0][2]).toBeCloseTo(0, 5);
    expect(Math.abs(rotations[0][0])).toBeGreaterThan(0);
  });

  it("solves a two-bone single-axis plane chain in one analytic step", () => {
    const bones: CcdIkBone[] = [
      { parentIndex: -1, translation: [0, 0, 0] },
      { parentIndex: 0, translation: [1, 0, 0] },
      { parentIndex: 1, translation: [1, 0, 0] },
      { parentIndex: -1, translation: [1, 1, 0] }
    ];
    const rotations: MutableQuatTuple[] = [
      [...IDENTITY],
      [...IDENTITY],
      [...IDENTITY],
      [...IDENTITY]
    ];

    const result = new CcdIkSolver().solve({
      bones,
      pose: { rotations },
      chains: [
        {
          goalBoneIndex: 3,
          effectorBoneIndex: 2,
          links: [
            {
              boneIndex: 1,
              angleLimit: {
                minimumAngle: [0, 0, -Math.PI],
                maximumAngle: [0, 0, Math.PI]
              }
            },
            { boneIndex: 0 }
          ],
          iterationCount: 200,
          maxAnglePerIteration: Math.PI
        }
      ]
    });

    expect(result.iterationCount).toBe(1);
    expect(result.finalDistances[0]).toBeLessThan(1e-5);
    expect(Math.abs(rotations[0][2])).toBeGreaterThan(0);
    expect(Math.abs(rotations[1][2])).toBeGreaterThan(0);
  });

  it("preserves a two-bone analytic middle bone base rotation", () => {
    const baseRotation = eulerXyzToQuaternionForTest([0.2, 0, 0]);
    const bones: CcdIkBone[] = [
      { parentIndex: -1, translation: [0, 0, 0] },
      { parentIndex: 0, translation: [1, 0, 0] },
      { parentIndex: 1, translation: [1, 0, 0] },
      { parentIndex: -1, translation: [1, 1, 0] }
    ];
    const rotations: MutableQuatTuple[] = [
      [...IDENTITY],
      [...baseRotation],
      [...IDENTITY],
      [...IDENTITY]
    ];

    const result = new CcdIkSolver().solve({
      bones,
      pose: { rotations },
      chains: [
        {
          goalBoneIndex: 3,
          effectorBoneIndex: 2,
          links: [
            {
              boneIndex: 1,
              angleLimit: {
                minimumAngle: [0, 0, -Math.PI],
                maximumAngle: [0, 0, Math.PI]
              }
            },
            { boneIndex: 0 }
          ],
          iterationCount: 200,
          maxAnglePerIteration: Math.PI
        }
      ]
    });

    expect(result.iterationCount).toBe(1);
    expect(Math.abs(rotations[1][0])).toBeGreaterThan(0.05);
  });

  it("falls back to constrained CCD when a two-bone root link has an angle limit", () => {
    const bones: CcdIkBone[] = [
      { parentIndex: -1, translation: [0, 0, 0] },
      { parentIndex: 0, translation: [1, 0, 0] },
      { parentIndex: 1, translation: [1, 0, 0] },
      { parentIndex: -1, translation: [0, 2, 0] }
    ];
    const rotations: MutableQuatTuple[] = [
      [...IDENTITY],
      [...IDENTITY],
      [...IDENTITY],
      [...IDENTITY]
    ];

    const result = new CcdIkSolver().solve({
      bones,
      pose: { rotations },
      chains: [
        {
          goalBoneIndex: 3,
          effectorBoneIndex: 2,
          links: [
            {
              boneIndex: 1,
              angleLimit: {
                minimumAngle: [0, 0, -Math.PI],
                maximumAngle: [0, 0, Math.PI]
              }
            },
            {
              boneIndex: 0,
              angleLimit: {
                minimumAngle: [0, 0, 0],
                maximumAngle: [0, 0, 0]
              }
            }
          ],
          iterationCount: 8,
          maxAnglePerIteration: Math.PI
        }
      ]
    });

    expect(result.iterationCount).toBeGreaterThan(1);
    expect(result.finalDistances[0]).toBeGreaterThan(0.5);
    expect(rotations[0][2]).toBeCloseTo(0, 5);
  });

  it("solves an exact 180-degree link rotation with a stable fallback axis", () => {
    const bones: CcdIkBone[] = [
      { parentIndex: -1, translation: [0, 0, 0] },
      { parentIndex: 0, translation: [1, 0, 0] },
      { parentIndex: 1, translation: [1, 0, 0] }
    ];
    const rotations: MutableQuatTuple[] = [[...IDENTITY], [...IDENTITY], [...IDENTITY]];
    const solver = new CcdIkSolver();

    const result = solver.solve({
      bones,
      pose: { rotations },
      chains: [
        {
          goalBoneIndex: 0,
          effectorBoneIndex: 2,
          links: [{ boneIndex: 1 }],
          iterationCount: 2,
          maxAnglePerIteration: Math.PI
        }
      ]
    });

    expect(result.finalDistances[0]).toBeLessThan(1e-5);
    expect(rotations[1].every(Number.isFinite)).toBe(true);
    expect(Math.abs(rotations[1][3])).toBeLessThan(1e-5);
  });

  it("keeps disabled IK links from mutating their local rotations", () => {
    const bones: CcdIkBone[] = [
      { parentIndex: -1, translation: [0, 0, 0] },
      { parentIndex: 0, translation: [1, 0, 0] },
      { parentIndex: 1, translation: [1, 0, 0] },
      { parentIndex: 0, translation: [1, 1, 0] }
    ];
    const rotations: MutableQuatTuple[] = [
      [...IDENTITY],
      [...IDENTITY],
      [...IDENTITY],
      [...IDENTITY]
    ];
    const solver = new CcdIkSolver();

    const result = solver.solve({
      bones,
      pose: { rotations },
      chains: [
        {
          goalBoneIndex: 3,
          effectorBoneIndex: 2,
          links: [{ boneIndex: 1, enabled: false }],
          iterationCount: 3,
          maxAnglePerIteration: Math.PI
        }
      ]
    });

    expect(result.iterationCount).toBeGreaterThan(0);
    expect(result.iterationCount).toBeLessThanOrEqual(3);
    expect(result.finalDistances[0]).toBeCloseTo(Math.SQRT2, 5);
    expect(rotations).toEqual([[...IDENTITY], [...IDENTITY], [...IDENTITY], [...IDENTITY]]);
  });

  it("stores solved link rotations in parent-local space", () => {
    const rootZ90: MutableQuatTuple = [0, 0, Math.SQRT1_2, Math.SQRT1_2];
    const bones: CcdIkBone[] = [
      { parentIndex: -1, translation: [0, 0, 0] },
      { parentIndex: 0, translation: [1, 0, 0] },
      { parentIndex: 1, translation: [1, 0, 0] },
      { parentIndex: 0, translation: [1, 1, 0] }
    ];
    const rotations: MutableQuatTuple[] = [
      [...rootZ90],
      [...IDENTITY],
      [...IDENTITY],
      [...IDENTITY]
    ];
    const solver = new CcdIkSolver();

    const result = solver.solve({
      bones,
      pose: { rotations },
      chains: [
        {
          goalBoneIndex: 3,
          effectorBoneIndex: 2,
          links: [{ boneIndex: 1 }],
          iterationCount: 4,
          maxAnglePerIteration: Math.PI
        }
      ]
    });

    expect(result.finalDistances[0]).toBeLessThan(1e-5);
    expect(rotations[0]).toEqual(rootZ90);
    expect(rotations[1][2]).toBeCloseTo(Math.SQRT1_2, 5);
    expect(rotations[1][3]).toBeCloseTo(Math.SQRT1_2, 5);
  });

  it("processes IK links in the supplied chain order", () => {
    const solve = (linkOrder: readonly number[]) => {
      const bones: CcdIkBone[] = [
        { parentIndex: -1, translation: [0, 0, 0] },
        { parentIndex: 0, translation: [1, 0, 0] },
        { parentIndex: 1, translation: [1, 0, 0] },
        { parentIndex: 2, translation: [1, 0, 0] },
        { parentIndex: 0, translation: [1.5, 1.5, 0] }
      ];
      const rotations: MutableQuatTuple[] = [
        [...IDENTITY],
        [...IDENTITY],
        [...IDENTITY],
        [...IDENTITY],
        [...IDENTITY]
      ];
      const result = new CcdIkSolver().solve({
        bones,
        pose: { rotations },
        chains: [
          {
            goalBoneIndex: 4,
            effectorBoneIndex: 3,
            links: linkOrder.map((boneIndex) => ({ boneIndex })),
            iterationCount: 1,
            maxAnglePerIteration: Math.PI
          }
        ]
      });
      return { result, rotations };
    };

    const childThenParent = solve([2, 1]);
    const parentThenChild = solve([1, 2]);

    expect(childThenParent.result.finalDistances[0]).not.toBeCloseTo(
      parentThenChild.result.finalDistances[0]
    );
    expect(Math.abs(childThenParent.rotations[1][2])).toBeGreaterThan(0);
    expect(Math.abs(childThenParent.rotations[2][2])).toBeGreaterThan(0);
    expect(Math.abs(parentThenChild.rotations[1][2])).toBeGreaterThan(0);
    expect(parentThenChild.rotations[2]).toEqual([...IDENTITY]);
  });

  it("solves when a parent bone appears after its child in the source order", () => {
    const bones: CcdIkBone[] = [
      { parentIndex: 1, translation: [1, 0, 0] },
      { parentIndex: -1, translation: [0, 0, 0] },
      { parentIndex: 0, translation: [1, 0, 0] },
      { parentIndex: 1, translation: [1, 1, 0] }
    ];
    const rotations: MutableQuatTuple[] = [
      [...IDENTITY],
      [...IDENTITY],
      [...IDENTITY],
      [...IDENTITY]
    ];

    const result = new CcdIkSolver().solve({
      bones,
      pose: { rotations },
      chains: [
        {
          goalBoneIndex: 3,
          effectorBoneIndex: 2,
          links: [{ boneIndex: 0 }],
          iterationCount: 4,
          maxAnglePerIteration: Math.PI
        }
      ]
    });

    expect(result.finalDistances[0]).toBeLessThan(1e-5);
    expect(rotations[0][2]).toBeCloseTo(Math.SQRT1_2, 5);
    expect(rotations[0][3]).toBeCloseTo(Math.SQRT1_2, 5);
  });

  it("respects maxAnglePerIteration as a per-link rotation clamp", () => {
    const solve = (maxAnglePerIteration: number) => {
      const bones: CcdIkBone[] = [
        { parentIndex: -1, translation: [0, 0, 0] },
        { parentIndex: 0, translation: [1, 0, 0] },
        { parentIndex: 1, translation: [1, 0, 0] },
        { parentIndex: 0, translation: [1, 1, 0] }
      ];
      const rotations: MutableQuatTuple[] = [
        [...IDENTITY],
        [...IDENTITY],
        [...IDENTITY],
        [...IDENTITY]
      ];
      const result = new CcdIkSolver().solve({
        bones,
        pose: { rotations },
        chains: [
          {
            goalBoneIndex: 3,
            effectorBoneIndex: 2,
            links: [{ boneIndex: 1 }],
            iterationCount: 1,
            maxAnglePerIteration
          }
        ]
      });
      return { result, rotations };
    };

    const clamped = solve(Math.PI / 8);
    const unclamped = solve(Math.PI);

    expect(clamped.result.finalDistances[0]).toBeGreaterThan(0.5);
    expect(clamped.result.finalDistances[0]).toBeGreaterThan(unclamped.result.finalDistances[0]);
    expect(clamped.rotations[1][2]).toBeCloseTo(Math.sin(Math.PI / 16), 5);
    expect(clamped.rotations[1][3]).toBeCloseTo(Math.cos(Math.PI / 16), 5);
    expect(unclamped.result.finalDistances[0]).toBeLessThan(1e-5);
  });

  it("clamps solved link rotations to the configured local angle limit", () => {
    const bones: CcdIkBone[] = [
      { parentIndex: -1, translation: [0, 0, 0] },
      { parentIndex: 0, translation: [1, 0, 0] },
      { parentIndex: 1, translation: [1, 0, 0] },
      { parentIndex: 0, translation: [1, 1, 0] }
    ];
    const rotations: MutableQuatTuple[] = [
      [...IDENTITY],
      [...IDENTITY],
      [...IDENTITY],
      [...IDENTITY]
    ];

    const result = new CcdIkSolver().solve({
      bones,
      pose: { rotations },
      chains: [
        {
          goalBoneIndex: 3,
          effectorBoneIndex: 2,
          links: [
            {
              boneIndex: 1,
              angleLimit: {
                minimumAngle: [-Math.PI, -Math.PI, 0],
                maximumAngle: [Math.PI, Math.PI, Math.PI / 4]
              }
            }
          ],
          iterationCount: 4,
          maxAnglePerIteration: Math.PI
        }
      ]
    });

    expect(result.finalDistances[0]).toBeGreaterThan(0.5);
    expect(rotations[1][0]).toBeCloseTo(0, 5);
    expect(rotations[1][1]).toBeCloseTo(0, 5);
    expect(rotations[1][2]).toBeCloseTo(Math.sin(Math.PI / 8), 5);
    expect(rotations[1][3]).toBeCloseTo(Math.cos(Math.PI / 8), 5);
  });

  it("preserves multi-axis XYZ Euler rotations inside the configured angle limit", () => {
    const euler = [0.3, 0.4, 0.5] as const;
    const rotation = eulerXyzToQuaternionForTest(euler);
    const targetPosition = rotateVectorForTest([1, 1e-7, 0], rotation);
    const bones: CcdIkBone[] = [
      { parentIndex: -1, translation: [0, 0, 0] },
      { parentIndex: 0, translation: [1, 0, 0] },
      { parentIndex: -1, translation: targetPosition }
    ];
    const rotations: MutableQuatTuple[] = [[...rotation], [...IDENTITY], [...IDENTITY]];

    new CcdIkSolver().solve({
      bones,
      pose: { rotations },
      chains: [
        {
          goalBoneIndex: 2,
          effectorBoneIndex: 1,
          links: [
            {
              boneIndex: 0,
              angleLimit: {
                minimumAngle: [euler[0] - 0.01, euler[1] - 0.01, euler[2] - 0.01],
                maximumAngle: [euler[0] + 0.01, euler[1] + 0.01, euler[2] + 0.01]
              }
            }
          ],
          iterationCount: 1,
          tolerance: 0
        }
      ]
    });

    for (let axis = 0; axis < rotation.length; axis++) {
      expect(Math.abs(rotations[0][axis] - rotation[axis])).toBeLessThanOrEqual(1e-6);
    }
  });

  it("creates a CCD solve input from an MMD IK runtime chain", () => {
    const bones: CcdIkBone[] = [
      { parentIndex: -1, translation: [0, 0, 0] },
      { parentIndex: 0, translation: [1, 0, 0] },
      { parentIndex: 1, translation: [1, 0, 0] },
      { parentIndex: 0, translation: [1, 1, 0] }
    ];
    const rotations: MutableQuatTuple[] = [
      [...IDENTITY],
      [...IDENTITY],
      [...IDENTITY],
      [...IDENTITY]
    ];
    const chain: MmdIkRuntimeChain = {
      boneIndex: 3,
      targetBoneIndex: 2,
      links: [
        {
          boneIndex: 1,
          angleLimit: {
            minimumAngle: [-Math.PI, -Math.PI, 0],
            maximumAngle: [Math.PI, Math.PI, Math.PI / 4]
          }
        }
      ],
      iterationCount: 4,
      maxAnglePerIteration: Math.PI,
      tolerance: 1e-6
    };

    expect(mmdIkChainToCcdIkChain(chain)).toEqual({
      goalBoneIndex: 3,
      effectorBoneIndex: 2,
      links: [
        {
          boneIndex: 1,
          enabled: undefined,
          angleLimit: {
            minimumAngle: [-Math.PI, -Math.PI, 0],
            maximumAngle: [Math.PI, Math.PI, Math.PI / 4]
          }
        }
      ],
      iterationCount: 4,
      maxAnglePerIteration: Math.PI,
      tolerance: 1e-6
    });

    const input = createCcdIkSolveInputFromMmdIk({
      bones,
      pose: { rotations },
      chains: [chain]
    });
    const result = new CcdIkSolver().solve(input);

    expect(result.chainCount).toBe(1);
    expect(input.bones).toEqual(bones);
    expect(input.bones).not.toBe(bones);
    expect(result.finalDistances[0]).toBeGreaterThan(0.5);
    expect(rotations[1][2]).toBeCloseTo(Math.sin(Math.PI / 8), 5);
  });

  it("returns a finite distance without mutating pose when iterationCount is zero", () => {
    const bones: CcdIkBone[] = [
      { parentIndex: -1, translation: [0, 0, 0] },
      { parentIndex: 0, translation: [1, 0, 0] },
      { parentIndex: 1, translation: [1, 0, 0] },
      { parentIndex: 0, translation: [1, 1, 0] }
    ];
    const rotations: MutableQuatTuple[] = [
      [...IDENTITY],
      [...IDENTITY],
      [...IDENTITY],
      [...IDENTITY]
    ];

    const result = new CcdIkSolver().solve({
      bones,
      pose: { rotations },
      chains: [
        {
          goalBoneIndex: 3,
          effectorBoneIndex: 2,
          links: [{ boneIndex: 1 }],
          iterationCount: 0,
          maxAnglePerIteration: Math.PI
        }
      ]
    });

    expect(result.iterationCount).toBe(0);
    expect(result.finalDistances[0]).toBeCloseTo(Math.SQRT2, 5);
    expect(rotations).toEqual([[...IDENTITY], [...IDENTITY], [...IDENTITY], [...IDENTITY]]);
  });

  it("rejects non-finite input before mutating pose", () => {
    const rotations: MutableQuatTuple[] = [[...IDENTITY]];
    const solver = new CcdIkSolver();

    expect(() =>
      solver.solve({
        bones: [{ parentIndex: -1, translation: [0, Number.NaN, 0] }],
        pose: { rotations },
        chains: []
      })
    ).toThrow(RangeError);
    expect(rotations).toEqual([[...IDENTITY]]);
  });

  it("rejects invalid skeleton and pose shapes before solving", () => {
    const solver = new CcdIkSolver();

    expect(() =>
      solver.solve({
        bones: [
          { parentIndex: -1, translation: [0, 0, 0] },
          { parentIndex: 1, translation: [1, 0, 0] },
          { parentIndex: 0, translation: [2, 0, 0] }
        ],
        pose: { rotations: [[...IDENTITY], [...IDENTITY], [...IDENTITY]] },
        chains: []
      })
    ).toThrow("CCD IK bone cannot parent itself");

    expect(() =>
      solver.solve({
        bones: [{ parentIndex: -1, translation: [0, 0, 0] }],
        pose: { rotations: [] },
        chains: []
      })
    ).toThrow("CCD IK pose rotation count must match bone count");

    expect(() =>
      solver.solve({
        bones: [{ parentIndex: -1, translation: [0, 0, 0] }],
        pose: { rotations: [[0, 0, Number.NaN, 1]] },
        chains: []
      })
    ).toThrow("CCD IK pose rotation must be finite");
  });

  it("rejects invalid chain configuration before solving", () => {
    const bones: CcdIkBone[] = [
      { parentIndex: -1, translation: [0, 0, 0] },
      { parentIndex: 0, translation: [1, 0, 0] }
    ];
    const rotations: MutableQuatTuple[] = [[...IDENTITY], [...IDENTITY]];
    const solver = new CcdIkSolver();

    expect(() =>
      solver.solve({
        bones,
        pose: { rotations },
        chains: [{ goalBoneIndex: 2, effectorBoneIndex: 1, links: [], iterationCount: 1 }]
      })
    ).toThrow("CCD IK goalBoneIndex is out of range");

    expect(() =>
      solver.solve({
        bones,
        pose: { rotations },
        chains: [{ goalBoneIndex: 0, effectorBoneIndex: -1, links: [], iterationCount: 1 }]
      })
    ).toThrow("CCD IK effectorBoneIndex is out of range");

    expect(() =>
      solver.solve({
        bones,
        pose: { rotations },
        chains: [
          { goalBoneIndex: 0, effectorBoneIndex: 1, links: [{ boneIndex: 2 }], iterationCount: 1 }
        ]
      })
    ).toThrow("CCD IK link boneIndex is out of range");

    expect(() =>
      solver.solve({
        bones,
        pose: { rotations },
        chains: [{ goalBoneIndex: 0, effectorBoneIndex: 1, links: [], iterationCount: -1 }]
      })
    ).toThrow("CCD IK iterationCount must be a finite non-negative number");

    expect(() =>
      solver.solve({
        bones,
        pose: { rotations },
        chains: [
          {
            goalBoneIndex: 0,
            effectorBoneIndex: 1,
            links: [],
            iterationCount: 1,
            maxAnglePerIteration: Number.POSITIVE_INFINITY
          }
        ]
      })
    ).toThrow("CCD IK maxAnglePerIteration must be finite when provided");

    expect(() =>
      solver.solve({
        bones,
        pose: { rotations },
        chains: [
          { goalBoneIndex: 0, effectorBoneIndex: 1, links: [], iterationCount: 1, tolerance: -1 }
        ]
      })
    ).toThrow("CCD IK tolerance must be a finite non-negative number");

    expect(() =>
      solver.solve({
        bones,
        pose: { rotations },
        chains: [
          {
            goalBoneIndex: 0,
            effectorBoneIndex: 1,
            links: [
              {
                boneIndex: 0,
                angleLimit: {
                  minimumAngle: [0, 1, 0],
                  maximumAngle: [0, 0, 0]
                }
              }
            ],
            iterationCount: 1
          }
        ]
      })
    ).toThrow("CCD IK link angle limit minimum must not exceed maximum");
  });
});
