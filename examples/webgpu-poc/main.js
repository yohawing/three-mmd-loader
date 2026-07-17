import * as THREE from "three";
import * as TSL from "three/tsl";
import { MMD_SELF_SHADOW_LAYER, ThreeMmdLoader, createThreeBufferGeometry } from "/dist/three/index.js";
import {
  computeMmdTslSparsePositionMorphs,
  createMmdTslShadowCaster,
  createMmdTslToonMaterial,
  enableMmdTslSparsePositionMorphs,
  replaceMmdModelMaterialsWithTsl,
  syncMmdTslMaterialState
} from "/dist/webgpu/index.js";

const viewport = document.querySelector("#viewport");
const statusElement = document.querySelector("#status");
const params = new URL(window.location.href).searchParams;
const backend = normalizeBackend(params.get("backend"));
const sceneMode = normalizeSceneMode(params.get("scene"));

const modelUrl = params.get("model") ?? "/test/fixtures/generated/minimal-loader-smoke.pmx";
const motionUrl = params.get("motion");
const spinModel = params.get("spin") !== "0";
const enableModelShadows = params.get("shadow") === "1";
const enableWebglOutline = params.get("outline") === "1";
const viewMode = params.get("view") ?? "auto";
const requestedPixelRatio = normalizePixelRatio(params.get("pixelRatio"));
const debugSkinning = params.get("debug") === "skinning";
const flatMaterial = params.get("flat") === "1";
const startedAt = window.performance.now();

let renderer;
let scene;
let camera;
let model;
let computeStatus = "none";

setStatus(createLoadingStatus());

try {
  await init();
  setStatus(createReadyStatus());
} catch (error) {
  console.error(error);
  setStatus(`backend=${backend}\nmodel=${modelUrl}\nerror=${error instanceof Error ? error.message : String(error)}`);
}

async function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x15171a);

  camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
  camera.position.set(0, 1.25, 5);
  camera.lookAt(0, 1, 0);

  const ambient = new THREE.HemisphereLight(0xffffff, 0x29313a, 1.5);
  scene.add(ambient);

  const light = new THREE.DirectionalLight(0xffffff, 2.4);
  light.position.set(-2, 4, 3);
  light.castShadow =
    sceneMode === "node-slots" ||
    sceneMode === "node-shadow-toon" ||
    sceneMode === "node-shadow-materials" ||
    sceneMode === "node-mmd-core" ||
    sceneMode === "node-mmd-factors" ||
    sceneMode === "node-mmd-texture" ||
    sceneMode === "node-mmd-toon" ||
    sceneMode === "node-mmd-sphere" ||
    sceneMode === "node-mmd-gamma" ||
    enableModelShadows;
  light.shadow.mapSize.set(512, 512);
  if (enableModelShadows && viewMode === "self-shadow-body") {
    configureSelfShadowBodyLight(light);
  }
  scene.add(light);
  scene.add(light.target);

  const grid = new THREE.GridHelper(4, 8, 0x5a6470, 0x2b323a);
  grid.position.y = -0.01;
  scene.add(grid);

  renderer = backend === "webgl"
    ? new THREE.WebGLRenderer({ antialias: true })
    : new THREE.WebGPURenderer({
        antialias: true,
        forceWebGL: backend === "forcewebgl"
      });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setPixelRatio(requestedPixelRatio ?? Math.min(window.devicePixelRatio, 2));
  viewport.append(renderer.domElement);
  resize();
  window.addEventListener("resize", resize);

  if (typeof renderer.init === "function") {
    await renderer.init();
  }
  if (enableModelShadows) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.BasicShadowMap;
    renderer.shadowMap.transmitted = true;
  }

  if (sceneMode === "compute-attribute") {
    await createComputeAttributeScene(scene, renderer);
    camera.position.set(0, 0, 3);
    camera.lookAt(0, 0, 0);
  } else if (sceneMode === "compute-position-morph") {
    createComputePositionMorphScene(scene, renderer);
    camera.position.set(0, 0, 3);
    camera.lookAt(0, 0, 0);
  } else if (sceneMode === "compute-uv-morph") {
    createComputeUvMorphScene(scene, renderer);
    camera.position.set(0, 0, 3);
    camera.lookAt(0, 0, 0);
  } else if (sceneMode === "ordering" || sceneMode === "draw-index") {
    scene.add(createOrderingMesh({ nodeDrawIndex: sceneMode === "draw-index" }));
    camera.position.set(0, 0, 4);
    camera.lookAt(0, 0, 0);
  } else if (
    sceneMode === "node-slots" ||
    sceneMode === "node-shadow-toon" ||
    sceneMode === "node-shadow-materials" ||
    sceneMode === "node-mmd-core" ||
    sceneMode === "node-mmd-factors" ||
    sceneMode === "node-mmd-texture" ||
    sceneMode === "node-mmd-toon" ||
    sceneMode === "node-mmd-sphere" ||
    sceneMode === "node-mmd-gamma"
  ) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.BasicShadowMap;
    renderer.shadowMap.transmitted = true;
    if (sceneMode === "node-shadow-materials") {
      createMaterialShadowScene(scene);
      camera.position.set(2.2, 1.8, 3.1);
      camera.lookAt(0, 0.35, 0);
    } else if (
      sceneMode === "node-mmd-core" ||
      sceneMode === "node-mmd-factors" ||
      sceneMode === "node-mmd-texture" ||
      sceneMode === "node-mmd-toon" ||
      sceneMode === "node-mmd-sphere" ||
      sceneMode === "node-mmd-gamma"
    ) {
      createMmdCoreScene(scene, {
        syncFactors: sceneMode === "node-mmd-factors" || sceneMode === "node-mmd-sphere",
        diffuseMap: sceneMode === "node-mmd-texture" ? createPocCheckerTexture() : undefined,
        toonMap: sceneMode === "node-mmd-toon" ? createPocToonTexture() : undefined,
        sphereMap: sceneMode === "node-mmd-sphere" ? createPocSphereTexture() : undefined,
        gammaSpaceComposite: sceneMode === "node-mmd-gamma"
      });
      camera.position.set(2.2, 1.6, 3.0);
      camera.lookAt(0, 0.45, 0);
    } else {
      createNodeSlotScene(scene, { toonShadow: sceneMode === "node-shadow-toon" });
      camera.position.set(2.4, 1.8, 3.2);
      camera.lookAt(0, 0.45, 0);
    }
  } else {
    const loader = new ThreeMmdLoader({
      runtime: { physics: "none" }
    });
    model = await loader.loadModel(modelUrl, {
      outline: enableWebglOutline,
      materialRenderOrder: false,
      frustumCulled: false
    });
    if (motionUrl !== null) {
      const animation = await loader.loadAnimation(motionUrl);
      model.setAnimation(animation);
      model.update(0, { physics: false });
    }
    if (
      sceneMode === "node-skinning" ||
      sceneMode === "node-custom-skinning" ||
      sceneMode === "node-sdef-skinning" ||
      sceneMode === "node-qdef-skinning" ||
      sceneMode === "node-mmd-model" ||
      sceneMode === "node-mmd-outline-groups"
    ) {
      if (sceneMode === "node-mmd-model" || sceneMode === "node-mmd-outline-groups") {
        replaceModelMaterialsWithMmdTslMaterials(model.mesh, {
          appendOutlineGroups: sceneMode === "node-mmd-outline-groups",
          forceOutlineGroups: sceneMode === "node-mmd-outline-groups"
        });
      } else {
        replaceModelMaterialsWithNodeMaterials(model.mesh, {
          customSkinning: sceneMode === "node-custom-skinning" || sceneMode === "node-sdef-skinning",
          sdefSkinning: sceneMode === "node-sdef-skinning",
          qdefSkinning: sceneMode === "node-qdef-skinning",
          debugSkinning,
          flatMaterial
        });
      }
    } else if (flatMaterial) {
      replaceModelMaterialsWithFlatMaterials(model.mesh);
    }
    if (enableModelShadows) {
      model.mesh.receiveShadow = true;
      if (sceneMode === "node-mmd-model" || sceneMode === "node-mmd-outline-groups") {
        createMmdTslShadowCaster(model.mesh);
        light.shadow.camera.layers.set(MMD_SELF_SHADOW_LAYER);
        renderer.shadowMap.transmitted = false;
      } else {
        model.mesh.castShadow = true;
      }
    }
    model.root.position.y = 0;
    scene.add(model.root);
    if (viewMode === "self-shadow-body") {
      frameSelfShadowBodyView();
    } else {
      frameModel(model.root);
    }
  }

  renderer.setAnimationLoop(render);
}

function render() {
  const elapsed = (window.performance.now() - startedAt) / 1000;
  if (model !== undefined) {
    if (spinModel) {
      model.root.rotation.y = Math.sin(elapsed * 0.35) * 0.18;
    }
    model.update(0, { physics: false });
    if (model.mesh.userData.webgpuPocDisablesStandardSkinning) {
      model.mesh.skeleton.update();
    }
  }
  renderer.render(scene, camera);
}

function resize() {
  const width = Math.max(viewport.clientWidth, 1);
  const height = Math.max(viewport.clientHeight, 1);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

function frameModel(root) {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  if (bounds.isEmpty()) {
    return;
  }
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  root.position.sub(sphere.center);
  root.position.y += Math.max(sphere.radius * 0.45, 0.5);
  camera.position.set(0, Math.max(sphere.radius * 0.85, 1), Math.max(sphere.radius * 3.1, 4));
  camera.lookAt(0, Math.max(sphere.radius * 0.45, 0.5), 0);
}

function frameSelfShadowBodyView() {
  camera.fov = 24;
  camera.near = 0.1;
  camera.far = 20;
  camera.position.set(0.02, 0.62, 3.1);
  camera.lookAt(-0.02, 0.55, 0.04);
  camera.updateProjectionMatrix();
}

function configureSelfShadowBodyLight(light) {
  light.intensity = 2.25;
  light.position.set(1.8, 3.4, 2.2);
  light.target.position.set(0, 0, 0);
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.bias = -0.0005;
  light.shadow.normalBias = 0.01;
  light.shadow.camera.left = -1.8;
  light.shadow.camera.right = 1.8;
  light.shadow.camera.top = 2.0;
  light.shadow.camera.bottom = -0.6;
  light.shadow.camera.near = 0.1;
  light.shadow.camera.far = 8;
  light.shadow.camera.updateProjectionMatrix();
}

function normalizeBackend(value) {
  const normalized = value?.toLowerCase();
  return normalized === "webgpu" || normalized === "webgl" ? normalized : "forcewebgl";
}

function normalizePixelRatio(value) {
  if (value === null) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 4) : undefined;
}

function createReadyStatus() {
  const meshCount = countMeshes(scene);
  const primaryMesh =
    model?.mesh ??
    scene.getObjectByName("compute-attribute-triangle") ??
    scene.getObjectByName("compute-position-morph-triangle") ??
    scene.getObjectByName("compute-uv-morph-triangle") ??
    scene.getObjectByName("ordering-overlap") ??
    scene.getObjectByName("node-mmd-gamma-cube") ??
    scene.getObjectByName("node-mmd-sphere-cube") ??
    scene.getObjectByName("node-mmd-toon-cube") ??
    scene.getObjectByName("node-mmd-texture-cube") ??
    scene.getObjectByName("node-mmd-factors-cube") ??
    scene.getObjectByName("node-mmd-core-cube") ??
    scene.getObjectByName("node-shadow-materials") ??
    scene.getObjectByName("node-slot-cube");
  const materialCount = Array.isArray(primaryMesh?.material) ? primaryMesh.material.length : 1;
  const groupCount = primaryMesh?.geometry.groups.length ?? 0;
  const shadowCaster = findTslShadowCaster(scene);
  const shadowGroupCount = shadowCaster?.geometry.groups.length ?? 0;
  return [
    `backend=${backend}`,
    `scene=${sceneMode}`,
    `model=${modelUrl}`,
    `motion=${motionUrl ?? "none"}`,
    `spin=${spinModel ? "1" : "0"}`,
    `flat=${flatMaterial ? "1" : "0"}`,
    `outline=${enableWebglOutline ? "1" : "0"}`,
    `pixelRatio=${requestedPixelRatio ?? "device"}`,
    `meshes=${meshCount}`,
    `materials=${materialCount}`,
    `groups=${groupCount}`,
    `shadowGroups=${shadowGroupCount}`,
    `rendererBackend=${renderer.backend?.isWebGPUBackend === true ? "native-webgpu" : backend}`,
    `compute=${computeStatus}`,
    "ready"
  ].join("\n");
}

function findTslShadowCaster(object) {
  if (object.userData?.mmdTslShadowCaster) {
    return object;
  }
  for (const child of object.children) {
    const match = findTslShadowCaster(child);
    if (match) return match;
  }
  return undefined;
}

function countMeshes(object) {
  let count = object.isMesh ? 1 : 0;
  for (const child of object.children) {
    count += countMeshes(child);
  }
  return count;
}

async function createComputeAttributeScene(targetScene, activeRenderer) {
  if (activeRenderer.backend?.isWebGPUBackend !== true) {
    throw new Error("compute-attribute requires the native WebGPU backend");
  }

  const computedPositions = TSL.attributeArray(3, "vec3");
  const computedPosition = TSL.instanceIndex.equal(0).select(
    TSL.vec3(-0.9, -0.65, 0),
    TSL.instanceIndex.equal(1).select(
      TSL.vec3(0.9, -0.65, 0),
      TSL.vec3(0, 0.9, 0)
    )
  );
  const computePositions = TSL.Fn(() => {
    computedPositions.element(TSL.instanceIndex).assign(computedPosition);
  })().compute(3);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(9, 3));
  geometry.setIndex([0, 1, 2]);
  const material = new THREE.MeshBasicNodeMaterial({
    color: 0x32e875,
    side: THREE.DoubleSide
  });
  material.positionNode = computedPositions.toAttribute();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "compute-attribute-triangle";
  mesh.frustumCulled = false;
  targetScene.add(mesh);

  await activeRenderer.computeAsync(computePositions);
  computeStatus = "storage-to-attribute";
}

function createComputePositionMorphScene(targetScene, activeRenderer) {
  if (activeRenderer.backend?.isWebGPUBackend !== true) {
    throw new Error("compute-position-morph requires the native WebGPU backend");
  }
  const geometry = createThreeBufferGeometry(
    {
      positions: new Float32Array([-4.9, -0.65, 0, -3.1, -0.65, 0, -4, 0.9, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      uvs: new Float32Array(6),
      indices: new Uint16Array([0, 1, 2]),
      skinIndices: new Uint16Array(12),
      skinWeights: new Float32Array(12)
    },
    [],
    [{
      vertexOffsets: [
        { vertexIndex: 0, position: [4, 0, 0] },
        { vertexIndex: 1, position: [4, 0, 0] },
        { vertexIndex: 2, position: [4, 0, 0] }
      ]
    }]
  );
  const material = new THREE.MeshBasicNodeMaterial({
    color: 0x32e875,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "compute-position-morph-triangle";
  mesh.frustumCulled = false;
  mesh.morphTargetInfluences = [1];
  if (!enableMmdTslSparsePositionMorphs(mesh)) {
    throw new Error("compute position morph was not enabled");
  }
  computeMmdTslSparsePositionMorphs(activeRenderer, mesh);
  targetScene.add(mesh);
  computeStatus = "sparse-position-morph";
}

function createComputeUvMorphScene(targetScene, activeRenderer) {
  if (activeRenderer.backend?.isWebGPUBackend !== true) {
    throw new Error("compute-uv-morph requires the native WebGPU backend");
  }
  const geometry = createThreeBufferGeometry(
    {
      positions: new Float32Array([-0.9, -0.65, 0, 0.9, -0.65, 0, 0, 0.9, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      uvs: new Float32Array(6),
      additionalUvs: [new Float32Array(12)],
      indices: new Uint16Array([0, 1, 2]),
      skinIndices: new Uint16Array(12),
      skinWeights: new Float32Array(12)
    },
    [],
    [{
      uvOffsets: [0, 1, 2].map(vertexIndex => ({ vertexIndex, uv: [1, 0] })),
      additionalUvOffsets: [0, 1, 2].map(vertexIndex =>
        ({ vertexIndex, uvIndex: 0, uv: [0.25, 0.5, 0.75, 1] }))
    }]
  );
  const texture = new THREE.DataTexture(new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]), 2, 1);
  texture.colorSpace = THREE.NoColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  const material = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  material.colorNode = TSL.texture(texture).sample(TSL.uv()).rgb;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "compute-uv-morph-triangle";
  mesh.frustumCulled = false;
  mesh.morphTargetInfluences = [1];
  if (!enableMmdTslSparsePositionMorphs(mesh)) {
    throw new Error("compute UV morph was not enabled");
  }
  computeMmdTslSparsePositionMorphs(activeRenderer, mesh);
  targetScene.add(mesh);
  computeStatus = "sparse-uv-morph";
}

function replaceModelMaterialsWithNodeMaterials(mesh, options = {}) {
  const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const nodeMaterials = sourceMaterials.map((sourceMaterial, index) => {
    const MaterialClass = options.flatMaterial ? THREE.MeshBasicNodeMaterial : THREE.MeshToonNodeMaterial;
    const material = new MaterialClass({
      color: sourceMaterial.color ?? new THREE.Color(0xffffff),
      side: sourceMaterial.side,
      transparent: sourceMaterial.transparent,
      opacity: sourceMaterial.opacity
    });
    const sdefEnabled = mesh.geometry.getAttribute("matricesSdefEnabled");
    const qdefEnabled = mesh.geometry.getAttribute("matricesQdefEnabled");
    if (options.debugSkinning) {
      material.colorNode = sdefEnabled
        ? TSL.mix(TSL.color(0x3f8cff), TSL.color(0xff4d8d), TSL.attribute("matricesSdefEnabled", "float"))
        : qdefEnabled
          ? TSL.mix(TSL.color(0x68d391), TSL.color(0xffb703), TSL.attribute("matricesQdefEnabled", "float"))
          : TSL.color(index === 0 ? 0x84d4ff : 0xffd166);
    }
    material.positionNode = options.sdefSkinning
      ? createSdefSkinningPositionNode(mesh)
      : options.qdefSkinning
        ? createQdefSkinningPositionNode(mesh)
      : options.customSkinning
        ? createLinearSkinningPositionNode(mesh)
        : TSL.positionLocal;
    if (!options.flatMaterial) {
      material.normalNode = options.sdefSkinning
        ? createSdefSkinningNormalNode(mesh)
        : options.qdefSkinning
          ? createQdefSkinningNormalNode(mesh)
          : TSL.normalLocal;
    }
    return material;
  });
  mesh.material = Array.isArray(mesh.material) ? nodeMaterials : nodeMaterials[0];
  if (options.customSkinning || options.sdefSkinning || options.qdefSkinning) {
    mesh.isSkinnedMesh = false;
    mesh.userData.webgpuPocDisablesStandardSkinning = true;
  }
  mesh.name = options.sdefSkinning
    ? "node-sdef-skinning-model"
    : options.qdefSkinning
      ? "node-qdef-skinning-model"
    : options.customSkinning
      ? "node-custom-skinning-model"
      : "node-skinning-model";
}

function replaceModelMaterialsWithFlatMaterials(mesh) {
  const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const flatMaterials = sourceMaterials.map((sourceMaterial) => new THREE.MeshBasicMaterial({
    color: sourceMaterial.color ?? new THREE.Color(0xffffff),
    side: sourceMaterial.side,
    transparent: sourceMaterial.transparent,
    opacity: sourceMaterial.opacity
  }));
  mesh.material = Array.isArray(mesh.material) ? flatMaterials : flatMaterials[0];
}

function replaceModelMaterialsWithMmdTslMaterials(mesh, options = {}) {
  replaceMmdModelMaterialsWithTsl(mesh, options);
  mesh.name = "node-mmd-model";
}

function createLinearSkinningPositionNode(mesh) {
  const context = createSkinningNodeContext(mesh);
  const skinInfluence = createWeightedBoneMatrix(context);
  const skinVertex = context.bindMatrixNode.mul(TSL.vec4(context.positionNode, 1));
  return context.bindMatrixInverseNode.mul(skinInfluence.mul(skinVertex)).xyz;
}

function createSdefSkinningPositionNode(mesh) {
  const context = createSkinningNodeContext(mesh);
  const skinInfluence = createWeightedBoneMatrix(context);
  const skinVertex = context.bindMatrixNode.mul(TSL.vec4(context.positionNode, 1));
  const linearSkinned = skinInfluence.mul(skinVertex);

  const sdefRotation = quaternionToRotationMatrix(
    slerpQuaternion(
      rotationMatrixToQuaternion(TSL.mat3(context.boneMatX)),
      rotationMatrixToQuaternion(TSL.mat3(context.boneMatY)),
      context.skinWeightNode.y
    )
  );
  const sdefCenter = TSL.attribute("matricesSdefC", "vec3");
  const sdefRw0 = TSL.attribute("matricesSdefRW0", "vec3");
  const sdefRw1 = TSL.attribute("matricesSdefRW1", "vec3");
  const sdefOffset = context.boneMatX.mul(TSL.vec4(sdefRw0, 1)).xyz.mul(context.skinWeightNode.x)
    .add(context.boneMatY.mul(TSL.vec4(sdefRw1, 1)).xyz.mul(context.skinWeightNode.y));
  const sdefSkinned = TSL.vec4(
    sdefRotation.mul(skinVertex.xyz).sub(sdefRotation.mul(sdefCenter)).add(sdefOffset),
    1
  );
  const useLinear = TSL.float(1).sub(TSL.step(0.5, TSL.attribute("matricesSdefEnabled", "float")));
  const skinned = TSL.mix(sdefSkinned, linearSkinned, useLinear);
  return context.bindMatrixInverseNode.mul(skinned).xyz;
}

function createSdefSkinningNormalNode(mesh) {
  const context = createSkinningNodeContext(mesh);
  const skinInfluence = createWeightedBoneMatrix(context);
  const rawNormal = TSL.normalGeometry;
  const linearSkinMatrix = context.bindMatrixInverseNode.mul(skinInfluence).mul(context.bindMatrixNode);
  const linearNormal = linearSkinMatrix.mul(TSL.vec4(rawNormal, 0)).xyz;
  const sdefRotation = quaternionToRotationMatrix(
    slerpQuaternion(
      rotationMatrixToQuaternion(TSL.mat3(context.boneMatX)),
      rotationMatrixToQuaternion(TSL.mat3(context.boneMatY)),
      context.skinWeightNode.y
    )
  );
  const sdefNormal = sdefRotation.mul(rawNormal);
  const useLinear = TSL.float(1).sub(TSL.step(0.5, TSL.attribute("matricesSdefEnabled", "float")));
  return TSL.mix(sdefNormal, linearNormal, useLinear);
}

function createQdefSkinningPositionNode(mesh) {
  const context = createSkinningNodeContext(mesh);
  const skinInfluence = createWeightedBoneMatrix(context);
  const skinVertex = context.bindMatrixNode.mul(TSL.vec4(context.positionNode, 1));
  const linearSkinned = skinInfluence.mul(skinVertex);
  const qdefSkinned = applyDualQuaternion(
    blendDualQuaternions([
      matrixToDualQuaternion(context.boneMatX),
      matrixToDualQuaternion(context.boneMatY),
      matrixToDualQuaternion(context.boneMatZ),
      matrixToDualQuaternion(context.boneMatW)
    ], context.skinWeightNode),
    skinVertex.xyz
  );
  const useQdef = TSL.step(0.5, TSL.attribute("matricesQdefEnabled", "float"));
  const skinned = TSL.mix(linearSkinned, TSL.vec4(qdefSkinned, 1), useQdef);
  return context.bindMatrixInverseNode.mul(skinned).xyz;
}

function createQdefSkinningNormalNode(mesh) {
  const context = createSkinningNodeContext(mesh);
  const rawNormal = TSL.normalGeometry;
  const linearSkinMatrix = context.bindMatrixInverseNode.mul(createWeightedBoneMatrix(context)).mul(context.bindMatrixNode);
  const linearNormal = linearSkinMatrix.mul(TSL.vec4(rawNormal, 0)).xyz;
  const blended = blendDualQuaternions([
    matrixToDualQuaternion(context.boneMatX),
    matrixToDualQuaternion(context.boneMatY),
    matrixToDualQuaternion(context.boneMatZ),
    matrixToDualQuaternion(context.boneMatW)
  ], context.skinWeightNode);
  const qdefNormal = rotateByQuaternion(blended.real, rawNormal);
  const useQdef = TSL.step(0.5, TSL.attribute("matricesQdefEnabled", "float"));
  return TSL.mix(linearNormal, qdefNormal, useQdef);
}

function createSkinningNodeContext(mesh) {
  const skinIndexNode = TSL.attribute("skinIndex", "uvec4");
  const skinWeightNode = TSL.attribute("skinWeight", "vec4");
  const bindMatrixNode = TSL.reference("bindMatrix", "mat4", mesh);
  const bindMatrixInverseNode = TSL.reference("bindMatrixInverse", "mat4", mesh);
  const boneMatricesNode = TSL.referenceBuffer(
    "skeleton.boneMatrices",
    "mat4",
    mesh.skeleton.bones.length,
    mesh
  );
  return {
    positionNode: TSL.positionGeometry,
    skinIndexNode,
    skinWeightNode,
    bindMatrixNode,
    bindMatrixInverseNode,
    boneMatX: boneMatricesNode.element(skinIndexNode.x),
    boneMatY: boneMatricesNode.element(skinIndexNode.y),
    boneMatZ: boneMatricesNode.element(skinIndexNode.z),
    boneMatW: boneMatricesNode.element(skinIndexNode.w)
  };
}

function createWeightedBoneMatrix(context) {
  return TSL.add(
    context.boneMatX.mul(context.skinWeightNode.x),
    context.boneMatY.mul(context.skinWeightNode.y),
    context.boneMatZ.mul(context.skinWeightNode.z),
    context.boneMatW.mul(context.skinWeightNode.w)
  );
}

function rotationMatrixToQuaternion(matrix) {
  const m0 = matrix.element(0);
  const m1 = matrix.element(1);
  const m2 = matrix.element(2);
  const trace = m0.x.add(m1.y).add(m2.z);

  const traceSqrt = TSL.sqrt(TSL.max(trace.add(1), 0));
  const traceS = TSL.float(0.5).div(TSL.max(traceSqrt, 0.000001));
  const traceQuat = TSL.vec4(
    m1.z.sub(m2.y).mul(traceS),
    m2.x.sub(m0.z).mul(traceS),
    m0.y.sub(m1.x).mul(traceS),
    TSL.float(0.25).div(traceS)
  );

  const xSqrt = TSL.sqrt(TSL.max(TSL.float(1).add(m0.x).sub(m1.y).sub(m2.z), 0));
  const xS = TSL.float(2).mul(TSL.max(xSqrt, 0.000001));
  const xQuat = TSL.vec4(
    TSL.float(0.25).mul(xS),
    m0.y.add(m1.x).div(xS),
    m2.x.add(m0.z).div(xS),
    m1.z.sub(m2.y).div(xS)
  );

  const ySqrt = TSL.sqrt(TSL.max(TSL.float(1).add(m1.y).sub(m0.x).sub(m2.z), 0));
  const yS = TSL.float(2).mul(TSL.max(ySqrt, 0.000001));
  const yQuat = TSL.vec4(
    m0.y.add(m1.x).div(yS),
    TSL.float(0.25).mul(yS),
    m1.z.add(m2.y).div(yS),
    m2.x.sub(m0.z).div(yS)
  );

  const zSqrt = TSL.sqrt(TSL.max(TSL.float(1).add(m2.z).sub(m0.x).sub(m1.y), 0));
  const zS = TSL.float(2).mul(TSL.max(zSqrt, 0.000001));
  const zQuat = TSL.vec4(
    m2.x.add(m0.z).div(zS),
    m1.z.add(m2.y).div(zS),
    TSL.float(0.25).mul(zS),
    m0.y.sub(m1.x).div(zS)
  );

  const zOrYQuat = m1.y.greaterThan(m2.z).select(yQuat, zQuat);
  const xyzQuat = m0.x.greaterThan(m1.y).and(m0.x.greaterThan(m2.z)).select(xQuat, zOrYQuat);
  return trace.greaterThan(0).select(traceQuat, xyzQuat);
}

function slerpQuaternion(q0, q1, t) {
  const cosTheta = TSL.dot(q0, q1);
  const correctedQ1 = TSL.mix(q1.negate(), q1, TSL.step(0, cosTheta));
  const absCosTheta = TSL.abs(cosTheta);
  const theta = TSL.acos(absCosTheta);
  const sinTheta = TSL.max(TSL.sin(theta), 0.000001);
  const w0 = TSL.sin(TSL.float(1).sub(t).mul(theta)).div(sinTheta);
  const w1 = TSL.sin(t.mul(theta)).div(sinTheta);
  const spherical = q0.mul(w0).add(correctedQ1.mul(w1));
  const linear = TSL.normalize(TSL.mix(q0, correctedQ1, t));
  return TSL.mix(spherical, linear, TSL.step(0.999999, absCosTheta));
}

function quaternionToRotationMatrix(q) {
  const xx = q.x.mul(q.x);
  const yy = q.y.mul(q.y);
  const zz = q.z.mul(q.z);
  const xy = q.x.mul(q.y);
  const zw = q.z.mul(q.w);
  const zx = q.z.mul(q.x);
  const yw = q.y.mul(q.w);
  const yz = q.y.mul(q.z);
  const xw = q.x.mul(q.w);
  return TSL.mat3(
    TSL.vec3(TSL.float(1).sub(TSL.float(2).mul(yy.add(zz))), TSL.float(2).mul(xy.add(zw)), TSL.float(2).mul(zx.sub(yw))),
    TSL.vec3(TSL.float(2).mul(xy.sub(zw)), TSL.float(1).sub(TSL.float(2).mul(zz.add(xx))), TSL.float(2).mul(yz.add(xw))),
    TSL.vec3(TSL.float(2).mul(zx.add(yw)), TSL.float(2).mul(yz.sub(xw)), TSL.float(1).sub(TSL.float(2).mul(yy.add(xx))))
  );
}

function matrixToDualQuaternion(matrix) {
  const real = rotationMatrixToQuaternion(TSL.mat3(matrix));
  const translation = matrix.element(3).xyz;
  const dual = TSL.vec4(
    translation.x.mul(real.w).add(translation.y.mul(real.z)).sub(translation.z.mul(real.y)),
    translation.y.mul(real.w).add(translation.z.mul(real.x)).sub(translation.x.mul(real.z)),
    translation.z.mul(real.w).add(translation.x.mul(real.y)).sub(translation.y.mul(real.x)),
    TSL.dot(translation, real.xyz).negate()
  ).mul(0.5);
  return { real, dual };
}

function blendDualQuaternions(dualQuaternions, weights) {
  let reference = dualQuaternions[0].real;
  reference = weights.y.greaterThan(weights.x).and(weights.y.greaterThanEqual(weights.z)).and(weights.y.greaterThanEqual(weights.w))
    .select(dualQuaternions[1].real, reference);
  reference = weights.z.greaterThanEqual(weights.x).and(weights.z.greaterThanEqual(weights.y)).and(weights.z.greaterThanEqual(weights.w))
    .select(dualQuaternions[2].real, reference);
  reference = weights.w.greaterThanEqual(weights.x).and(weights.w.greaterThanEqual(weights.y)).and(weights.w.greaterThanEqual(weights.z))
    .select(dualQuaternions[3].real, reference);

  const corrected = dualQuaternions.map((dualQuaternion) => {
    const flip = TSL.dot(reference, dualQuaternion.real).lessThan(0);
    return {
      real: flip.select(dualQuaternion.real.negate(), dualQuaternion.real),
      dual: flip.select(dualQuaternion.dual.negate(), dualQuaternion.dual)
    };
  });

  const real = corrected[0].real.mul(weights.x)
    .add(corrected[1].real.mul(weights.y))
    .add(corrected[2].real.mul(weights.z))
    .add(corrected[3].real.mul(weights.w));
  const dual = corrected[0].dual.mul(weights.x)
    .add(corrected[1].dual.mul(weights.y))
    .add(corrected[2].dual.mul(weights.z))
    .add(corrected[3].dual.mul(weights.w));
  const inverseLength = TSL.float(1).div(TSL.max(TSL.length(real), 0.000001));
  return {
    real: real.mul(inverseLength),
    dual: dual.mul(inverseLength)
  };
}

function applyDualQuaternion(dualQuaternion, position) {
  const rotated = rotateByQuaternion(dualQuaternion.real, position);
  const translation = dualQuaternion.real.w.mul(dualQuaternion.dual.xyz)
    .sub(dualQuaternion.dual.w.mul(dualQuaternion.real.xyz))
    .sub(TSL.cross(dualQuaternion.dual.xyz, dualQuaternion.real.xyz))
    .mul(2);
  return rotated.add(translation);
}

function rotateByQuaternion(quaternion, vector) {
  const t = TSL.cross(quaternion.xyz, vector).mul(2);
  return vector.add(t.mul(quaternion.w)).add(TSL.cross(quaternion.xyz, t));
}

function createOrderingMesh(options = {}) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([
      -1.35, -1, 0,
      1.35, -1, 0,
      1.35, 1, 0,
      -1.35, 1, 0
    ], 3)
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.clearGroups();
  geometry.addGroup(0, 6, 0);
  geometry.addGroup(0, 6, 1);

  const materials = options.nodeDrawIndex
    ? createDrawIndexMaterials()
    : [
        new THREE.MeshBasicMaterial({
          color: 0xff3b30,
          transparent: true,
          opacity: 0.55,
          depthWrite: true,
          side: THREE.DoubleSide
        }),
        new THREE.MeshBasicMaterial({
          color: 0x1fc36b,
          transparent: true,
          opacity: 0.55,
          depthWrite: true,
          side: THREE.DoubleSide
        })
      ];
  const mesh = new THREE.Mesh(geometry, materials);
  mesh.name = "ordering-overlap";
  return mesh;
}

function createDrawIndexMaterials() {
  return [0, 1].map(() => {
    const material = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      opacity: 0.85,
      depthWrite: true,
      side: THREE.DoubleSide
    });
    material.colorNode = TSL.drawIndex.equal(TSL.uint(0))
      .select(TSL.color(0xff3b30), TSL.color(0x1fc36b));
    return material;
  });
}

function createNodeSlotScene(targetScene, options = {}) {
  const material = new THREE.MeshToonNodeMaterial({
    color: 0xffffff
  });
  material.colorNode = TSL.color(0x3f8cff);
  material.positionNode = TSL.positionLocal;
  material.normalNode = TSL.normalLocal;
  material.receivedShadowNode = options.toonShadow
    ? TSL.Fn(([shadow]) => shadow.mul(TSL.vec4(1, 0.18, 0.18, 1)))
    : TSL.Fn(([shadow]) => shadow);
  material.castShadowNode = TSL.vec4(1, 1, 1, 1);
  material.castShadowPositionNode = TSL.positionLocal;

  const cube = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), material);
  cube.name = "node-slot-cube";
  cube.position.y = 0.75;
  cube.castShadow = true;
  cube.receiveShadow = true;
  targetScene.add(cube);

  const planeMaterial = new THREE.MeshToonNodeMaterial({
    color: 0xd8dde5
  });
  planeMaterial.receivedShadowNode = options.toonShadow
    ? TSL.Fn(([shadow]) => shadow.mul(TSL.vec4(1, 0.12, 0.12, 1)))
    : TSL.Fn(([shadow]) => shadow);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), planeMaterial);
  plane.rotation.x = -Math.PI / 2;
  plane.receiveShadow = true;
  targetScene.add(plane);
}

function createMaterialShadowScene(targetScene) {
  const geometry = createTwoBoxGeometry();
  const casterMaterial = new THREE.MeshToonNodeMaterial({ color: 0xff4438 });
  casterMaterial.colorNode = TSL.color(0xff4438);
  casterMaterial.positionNode = TSL.positionLocal;
  casterMaterial.normalNode = TSL.normalLocal;
  casterMaterial.castShadowNode = TSL.vec4(1, 0, 0, 1);
  casterMaterial.castShadowPositionNode = TSL.positionLocal;

  const excludedMaterial = new THREE.MeshToonNodeMaterial({ color: 0x35d07f });
  excludedMaterial.colorNode = TSL.color(0x35d07f);
  excludedMaterial.positionNode = TSL.positionLocal;
  excludedMaterial.normalNode = TSL.normalLocal;
  excludedMaterial.castShadowNode = TSL.Fn(() => {
    TSL.Discard();
    return TSL.vec4(0, 1, 0, 1);
  })();
  excludedMaterial.castShadowPositionNode = TSL.positionLocal;

  const mesh = new THREE.Mesh(geometry, [casterMaterial, excludedMaterial]);
  mesh.name = "node-shadow-materials";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  targetScene.add(mesh);

  const planeMaterial = new THREE.MeshToonNodeMaterial({ color: 0xd9dee6 });
  planeMaterial.receivedShadowNode = TSL.Fn(([shadow]) => shadow.mul(TSL.vec4(1, 0.16, 0.16, 1)));
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), planeMaterial);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = -0.02;
  plane.receiveShadow = true;
  targetScene.add(plane);
}

function createMmdCoreScene(targetScene, options = {}) {
  const material = createMmdTslToonMaterial({
    diffuse: [1.0, 0.42, 0.32],
    ambient: [0.18, 0.06, 0.05],
    shadowTint: [1, 0.2, 0.2],
    diffuseMap: options.diffuseMap,
    toonMap: options.toonMap,
    sphereMap: options.sphereMap,
    sphereMode: options.sphereMap ? "add" : "none",
    gammaSpaceComposite: options.gammaSpaceComposite
  });
  if (options.syncFactors) {
    syncMmdTslMaterialState(material, createPocMaterialRuntimeState({
      diffuse: options.sphereMap ? [0.55, 0.55, 0.58, 1] : [0.72, 0.9, 1.0, 1],
      ambient: options.sphereMap ? [0.02, 0.02, 0.03] : [0.02, 0.12, 0.18],
      textureFactor: options.sphereMap ? [1, 1, 1, 1] : [0.35, 0.7, 1.0, 1],
      sphereTextureFactor: options.sphereMap ? [0.75, 0.2, 0.95, 0.85] : [0.0, 0.22, 0.35, 0.65],
      toonTextureFactor: options.sphereMap ? [1, 1, 1, 1] : [0.55, 0.9, 1.0, 1]
    }));
  }

  const cube = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), material);
  cube.name = options.diffuseMap
    ? "node-mmd-texture-cube"
    : options.toonMap
      ? "node-mmd-toon-cube"
      : options.sphereMap
        ? "node-mmd-sphere-cube"
        : options.gammaSpaceComposite
          ? "node-mmd-gamma-cube"
    : options.syncFactors
      ? "node-mmd-factors-cube"
      : "node-mmd-core-cube";
  cube.position.y = 0.75;
  cube.castShadow = true;
  cube.receiveShadow = true;
  targetScene.add(cube);

  const planeMaterial = createMmdTslToonMaterial({
    diffuse: [0.75, 0.78, 0.82],
    ambient: [0.12, 0.13, 0.15],
    shadowTint: [1, 0.18, 0.18]
  });
  if (options.syncFactors) {
    syncMmdTslMaterialState(planeMaterial, createPocMaterialRuntimeState({
      diffuse: [0.28, 0.7, 0.95, 1],
      ambient: [0.02, 0.09, 0.14],
      textureFactor: [0.65, 0.9, 1.0, 1],
      sphereTextureFactor: [0.0, 0.12, 0.2, 0.5],
      toonTextureFactor: [0.55, 0.95, 1.0, 1]
    }));
  }
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), planeMaterial);
  plane.rotation.x = -Math.PI / 2;
  plane.receiveShadow = true;
  targetScene.add(plane);
}

function createPocCheckerTexture() {
  const data = new Uint8Array([
    32, 112, 255, 255,
    255, 224, 64, 255,
    255, 224, 64, 255,
    32, 112, 255, 255
  ]);
  const texture = new THREE.DataTexture(data, 2, 2, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

function createPocToonTexture() {
  const data = new Uint8Array([
    32, 80, 170, 255,
    48, 130, 220, 255,
    96, 190, 255, 255,
    210, 245, 255, 255
  ]);
  const texture = new THREE.DataTexture(data, 1, 4, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

function createPocSphereTexture() {
  const data = new Uint8Array([
    255, 64, 224, 255,
    64, 32, 255, 255,
    255, 220, 64, 255,
    64, 255, 220, 255
  ]);
  const texture = new THREE.DataTexture(data, 2, 2, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

function createPocMaterialRuntimeState(overrides = {}) {
  return {
    diffuse: overrides.diffuse ?? [1, 1, 1, 1],
    specular: [0, 0, 0],
    specularPower: 0,
    ambient: overrides.ambient ?? [0, 0, 0],
    edgeColor: [0, 0, 0, 1],
    edgeSize: 1,
    textureFactor: overrides.textureFactor ?? [1, 1, 1, 1],
    sphereTextureFactor: overrides.sphereTextureFactor ?? [0, 0, 0, 0],
    toonTextureFactor: overrides.toonTextureFactor ?? [1, 1, 1, 1]
  };
}

function createTwoBoxGeometry() {
  const positions = [];
  const indices = [];
  const normals = [];
  const groups = [];
  appendBox(positions, normals, indices, groups, { x: -0.52, y: 0.45, z: 0, materialIndex: 0 });
  appendBox(positions, normals, indices, groups, { x: 0.52, y: 0.45, z: 0, materialIndex: 1 });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.clearGroups();
  for (const group of groups) {
    geometry.addGroup(group.start, group.count, group.materialIndex);
  }
  return geometry;
}

function appendBox(positions, normals, indices, groups, options) {
  const halfWidth = 0.28;
  const halfHeight = 0.45;
  const halfDepth = 0.28;
  const startIndex = indices.length;
  const faces = [
    { normal: [0, 0, 1], corners: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
    { normal: [0, 0, -1], corners: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
    { normal: [1, 0, 0], corners: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
    { normal: [-1, 0, 0], corners: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
    { normal: [0, 1, 0], corners: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
    { normal: [0, -1, 0], corners: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] }
  ];

  for (const face of faces) {
    const vertexOffset = positions.length / 3;
    for (const corner of face.corners) {
      positions.push(
        options.x + corner[0] * halfWidth,
        options.y + corner[1] * halfHeight,
        options.z + corner[2] * halfDepth
      );
      normals.push(...face.normal);
    }
    indices.push(vertexOffset, vertexOffset + 1, vertexOffset + 2, vertexOffset, vertexOffset + 2, vertexOffset + 3);
  }

  groups.push({
    start: startIndex,
    count: indices.length - startIndex,
    materialIndex: options.materialIndex
  });
}

function normalizeSceneMode(value) {
  const normalized = value?.toLowerCase();
  return normalized === "ordering" ||
    normalized === "compute-attribute" ||
    normalized === "compute-position-morph" ||
    normalized === "compute-uv-morph" ||
    normalized === "draw-index" ||
    normalized === "node-slots" ||
    normalized === "node-shadow-toon" ||
    normalized === "node-shadow-materials" ||
    normalized === "node-mmd-core" ||
    normalized === "node-mmd-factors" ||
    normalized === "node-mmd-texture" ||
    normalized === "node-mmd-toon" ||
    normalized === "node-mmd-sphere" ||
    normalized === "node-mmd-gamma" ||
    normalized === "node-mmd-model" ||
    normalized === "node-mmd-outline-groups" ||
    normalized === "node-skinning" ||
    normalized === "node-custom-skinning" ||
    normalized === "node-sdef-skinning" ||
    normalized === "node-qdef-skinning"
    ? normalized
    : "model";
}

function setStatus(message) {
  statusElement.textContent = message;
}

function createLoadingStatus() {
  return [
    `backend=${backend}`,
    `scene=${sceneMode}`,
    `model=${modelUrl}`,
    `motion=${motionUrl ?? "none"}`,
    `spin=${spinModel ? "1" : "0"}`,
    `flat=${flatMaterial ? "1" : "0"}`,
    "loading"
  ].join("\n");
}
