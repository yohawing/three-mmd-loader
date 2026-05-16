import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const PMX_FIXTURES = [
  "joint_orient_test.pmx",
  "test_1bone_cube.pmx",
  "test_append_bone.pmx",
  "test_basic_bone.pmx",
  "test_fix_axis.pmx",
  "test_given_bone_comprehensive.pmx",
  "test_semi_basic_bone.pmx"
] as const;

export const VMD_FIXTURES = [
  "joint_orient_test.vmd",
  "test_1bone_cube_motion.vmd",
  "test_append_bone.vmd"
] as const;

export function loadFixtureBytes(filename: string): Promise<Uint8Array> {
  return readFile(resolve("test/fixtures", filename));
}
