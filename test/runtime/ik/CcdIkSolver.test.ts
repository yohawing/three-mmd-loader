import { describe, expect, it } from "vitest";

import { CcdIkSolver, type CcdIkBone, type MutableQuatTuple } from "../../../src/runtime/index.js";

const IDENTITY: MutableQuatTuple = [0, 0, 0, 1];

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

    expect(result.iterationCount).toBe(3);
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
          { parentIndex: 2, translation: [1, 0, 0] },
          { parentIndex: 0, translation: [2, 0, 0] }
        ],
        pose: { rotations: [[...IDENTITY], [...IDENTITY], [...IDENTITY]] },
        chains: []
      })
    ).toThrow("CCD IK bones must be ordered parents before children");

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
  });
});
