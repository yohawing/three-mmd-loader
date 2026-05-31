import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "..");
const require = createRequire(import.meta.url);

const requiredSurface = [
  "btDefaultCollisionConfiguration",
  "btCollisionDispatcher",
  "btDbvtBroadphase",
  "btSequentialImpulseConstraintSolver",
  "btDiscreteDynamicsWorld",
  "btVector3",
  "btQuaternion",
  "btTransform",
  "btDefaultMotionState",
  "btRigidBodyConstructionInfo",
  "btRigidBody",
  "btBoxShape",
  "btCapsuleShape",
  "btSphereShape",
  "btGeneric6DofConstraint",
  "btGeneric6DofSpringConstraint"
];

async function loadNpmAmmo() {
  const module = await import("ammo.js");
  const candidate = module.default ?? module;
  return typeof candidate === "function" ? await candidate() : candidate;
}

async function loadScriptAmmo(scriptPath) {
  const resolved = resolve(scriptPath);
  const source = await readFile(resolved, "utf8");
  const sandbox = {
    Ammo: undefined,
    Module: undefined,
    console,
    globalThis: undefined,
    self: undefined,
    window: undefined,
    print: console.log,
    printErr: console.error,
    process,
    require,
    __dirname: dirname(resolved),
    __filename: resolved,
    module: { exports: {} },
    exports: {}
  };
  sandbox.ArrayBuffer = ArrayBuffer;
  sandbox.DataView = DataView;
  sandbox.Int8Array = Int8Array;
  sandbox.Int16Array = Int16Array;
  sandbox.Int32Array = Int32Array;
  sandbox.Uint8Array = Uint8Array;
  sandbox.Uint16Array = Uint16Array;
  sandbox.Uint32Array = Uint32Array;
  sandbox.Float32Array = Float32Array;
  sandbox.Float64Array = Float64Array;
  sandbox.Promise = Promise;
  sandbox.TextDecoder = TextDecoder;
  sandbox.TextEncoder = TextEncoder;
  sandbox.URL = URL;
  sandbox.WebAssembly = WebAssembly;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.window = sandbox;

  vm.runInNewContext(source, sandbox, { filename: resolved });
  const candidate =
    sandbox.module.exports && Object.keys(sandbox.module.exports).length > 0
      ? sandbox.module.exports
      : sandbox.Ammo ?? sandbox.Module;
  if (typeof candidate === "function") {
    return await candidate({
      locateFile(file) {
        return pathToFileURL(join(dirname(resolved), file)).href;
      }
    });
  }
  return candidate;
}

function assertSurface(label, Ammo) {
  const missing = requiredSurface.filter((name) => typeof Ammo?.[name] !== "function");
  if (missing.length > 0) {
    throw new Error(`${label} is missing Ammo surface: ${missing.join(", ")}`);
  }
}

function createWorld(Ammo) {
  const collisionConfiguration = new Ammo.btDefaultCollisionConfiguration();
  const dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration);
  const broadphase = new Ammo.btDbvtBroadphase();
  const solver = new Ammo.btSequentialImpulseConstraintSolver();
  const world = new Ammo.btDiscreteDynamicsWorld(
    dispatcher,
    broadphase,
    solver,
    collisionConfiguration
  );
  world.setGravity(new Ammo.btVector3(0, -9.8, 0));
  return world;
}

function simulateSphere(Ammo) {
  const world = createWorld(Ammo);
  const transform = new Ammo.btTransform();
  transform.setIdentity();
  transform.setOrigin(new Ammo.btVector3(0, 10, 0));
  if (Ammo.btQuaternion && transform.setRotation) {
    transform.setRotation(new Ammo.btQuaternion(0, 0, 0, 1));
  }
  const motionState = new Ammo.btDefaultMotionState(transform);
  const shape = new Ammo.btSphereShape(1);
  const inertia = new Ammo.btVector3(0, 0, 0);
  shape.calculateLocalInertia(1, inertia);
  const info = new Ammo.btRigidBodyConstructionInfo(1, motionState, shape, inertia);
  const body = new Ammo.btRigidBody(info);
  world.addRigidBody(body);
  for (let i = 0; i < 60; i += 1) {
    world.stepSimulation(1 / 60, 1, 1 / 60);
  }

  const out = new Ammo.btTransform();
  body.getMotionState().getWorldTransform(out);
  return out.getOrigin().y();
}

function compareNumbers(label, left, right) {
  const delta = Math.abs(left - right);
  console.log(`${label}: npm=${left.toFixed(6)} custom=${right.toFixed(6)} delta=${delta.toExponential(3)}`);
  if (!Number.isFinite(left) || !Number.isFinite(right) || delta > 1e-3) {
    throw new Error(`${label} diverged beyond tolerance.`);
  }
}

const customPath = process.argv[2] ?? join(root, "dist", "physics", "ammo", "yw_bullet_ammo.js");
const npmAmmo = await loadNpmAmmo();
const customAmmo = await loadScriptAmmo(customPath);

assertSurface("npm ammo.js", npmAmmo);
assertSurface("custom Bullet Ammo", customAmmo);
compareNumbers("sphere step y", simulateSphere(npmAmmo), simulateSphere(customAmmo));
console.log("Bullet Ammo comparison passed.");
