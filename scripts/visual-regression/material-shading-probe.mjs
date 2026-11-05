import * as THREE from "three";
import { attachMmdMaterialFactors, attachMmdSphereTexture, syncMmdSpecularDirection } from "../../dist/three/index.js";
import { characterFramingBounds, copyCharacterBounds } from "../../examples/viewer/lib/character-framing.js";

// Independent pixel oracles from MikuDanceStudio 0e969951, skin_effect_sm3.fx:
// BShadowSphiaTexture_VS/PS: interpolate normal XY, v = .5 - y*.5,
// sphere weight = SphCMul.w + SphCAdd.w (1 + 0 at rest), then toon.
// Specular uses Eye = Place - Pos. No user-owned model or image is required.
export function runMaterialShadingProbe() {
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
  renderer.setSize(65, 65);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  globalThis.document.body.append(renderer.domElement);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 2;
  const scene = new THREE.Scene();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([-2, -2, 0, 2, -2, 0, 0, 2, 0], 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  let mesh = new THREE.Mesh(geometry);
  scene.add(mesh);
  const cases = [], mutations = [], failures = [];
  function texture(rows) {
    const result = new THREE.DataTexture(new Uint8Array(rows.flatMap(rgb => [...rgb, 255])), 1, rows.length);
    result.minFilter = result.magFilter = THREE.NearestFilter;
    result.generateMipmaps = false;
    result.needsUpdate = true;
    return result;
  }
  function render({ sphere, ambient = [0, 0, 0], diffuse = [0, 0, 0], specular = [0, 0, 0], toon, mutation, light = [0, 0, 1] }) {
    const material = new THREE.MeshToonMaterial({ gradientMap: toon });
    material.userData.mmdMaterial = { diffuse: [...diffuse, 1], ambient, specular, specularPower: 8 };
    attachMmdMaterialFactors(material);
    if (sphere) attachMmdSphereTexture(material, "add", sphere);
    if (light) syncMmdSpecularDirection(material, new THREE.Vector3(...light));
    if (mutation) {
      const compile = material.onBeforeCompile.bind(material);
      material.onBeforeCompile = (shader, renderer) => {
        compile(shader, renderer);
        shader.fragmentShader = mutation(shader.fragmentShader);
      };
      material.customProgramCacheKey = () => String(mutation);
    }
    mesh.material = material;
    renderer.render(scene, camera);
    const pixel = new Uint8Array(4);
    const gl = renderer.getContext();
    gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    material.dispose();
    return Array.from(pixel).slice(0, 3);
  }
  function check(name, options, expected, mutation) {
    const actual = render(options);
    const matches = value => value.every((v, i) => Math.abs(v - expected[i]) <= 2);
    cases.push({ name, expected, actual });
    if (!matches(actual)) failures.push(name);
    if (mutation) {
      const broken = render({ ...options, mutation });
      const detected = !matches(broken);
      mutations.push({ name, actual: broken, detected });
      if (!detected) failures.push(`${name}: mutation escaped`);
    }
  }
  const sphere = texture([[64, 32, 16]]);
  check("default MMD light direction illuminates a forward normal", { diffuse: [0.6, 0.6, 0.6], light: null }, [38, 38, 38]);
  const doubleSphere = shader => shader.replace(
    "ywMmdBase += ywMmdApplyAdd( ywMmdSphere, mmdSphereFactor );",
    "ywMmdBase += ywMmdApplyAdd( ywMmdSphere, mmdSphereFactor ) * 2.0;"
  );
  check("additive sphere has unit weight", { sphere, ambient: [0.1, 0.2, 0.3] }, [90, 83, 93], doubleSphere);
  const toon = texture([[128, 128, 128]]);
  check("toon grades sphere and base together", { sphere, ambient: [0.1, 0.2, 0.3], toon }, [45, 42, 46]);
  check("specular eye points toward camera", { specular: [0.2, 0.3, 0.4], light: [0.6, 0, 0.8] }, [33, 50, 67],
    shader => shader.replace("ywMmdEyeDir = normalize( vViewPosition )", "ywMmdEyeDir = normalize( -vViewPosition )"));
  const z = Math.sqrt(0.84);
  geometry.getAttribute("normal").setXYZ(0, z, 0.4, 0);
  geometry.getAttribute("normal").setXYZ(1, -z, 0.4, 0);
  geometry.getAttribute("normal").setXYZ(2, 0, 0.4, z);
  geometry.getAttribute("normal").needsUpdate = true;
  const stripes = texture(Array.from({ length: 16 }, (_, row) => [16 + row * 10, 40, 60]));
  check("sphere samples top-down image coordinates", { sphere: stripes }, [56, 40, 60],
    shader => shader.replace("0.5 - vMmdNormal.y * 0.5", "0.5 + vMmdNormal.y * 0.5"));
  check("sphere interpolates vertex normals without renormalizing", { sphere: stripes }, [56, 40, 60],
    shader => shader.replace("vec2( vMmdNormal.x * 0.5 + 0.5, 0.5 - vMmdNormal.y * 0.5 )",
      "vec2( ywMmdNormal.x * 0.5 + 0.5, 0.5 - ywMmdNormal.y * 0.5 )"));
  geometry.getAttribute("normal").array.forEach((value, index, array) => { array[index] = value * 0.5; });
  geometry.getAttribute("normal").needsUpdate = true;
  check("sphere preserves authored non-unit normal length", { sphere: stripes }, [76, 40, 60],
    shader => shader.replaceAll("vMmdNormal.x", "vNormal.x").replaceAll("vMmdNormal.y", "vNormal.y"));
  for (const scale of [0.1, 10]) {
    mesh.scale.setScalar(scale);
    check(`sphere normal length ignores model scale ${scale}`, { sphere: stripes }, [76, 40, 60]);
  }
  mesh.scale.setScalar(1);
  geometry.getAttribute("normal").setXYZ(0, 1, 0, 0);
  geometry.getAttribute("normal").setXYZ(1, 1, 0, 0);
  geometry.getAttribute("normal").setXYZ(2, 0, 0, 0.5);
  geometry.getAttribute("normal").needsUpdate = true;
  check("lighting normalizes after interpolating authored normals", { diffuse: [0.5, 0.5, 0.5] }, [57, 57, 57],
    shader => shader.replace("normalize( vMmdNormal )", "normalize( vNormal )"));
  scene.remove(mesh);
  mesh = new THREE.SkinnedMesh(geometry);
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute([0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0], 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute([0.5, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0.5, 0.5, 0, 0], 4));
  for (let i = 0; i < 3; i++) geometry.getAttribute("normal").setXYZ(i, 0, 1, 0);
  geometry.getAttribute("normal").needsUpdate = true;
  const bones = [new THREE.Bone(), new THREE.Bone()];
  mesh.add(...bones);
  mesh.bind(new THREE.Skeleton(bones));
  bones[0].rotation.z = Math.PI / 3;
  bones[1].rotation.z = -Math.PI / 3;
  scene.add(mesh);
  check("BDEF2 keeps blended normal length", { sphere: stripes }, [56, 40, 60],
    shader => shader.replaceAll("vMmdNormal.x", "vNormal.x").replaceAll("vMmdNormal.y", "vNormal.y"));

  // Reproduce the remote hidden geometry that previously expanded the shadow
  // camera to ~3600 units and removed the face shadow. No geometry is rewritten.
  const positions = [];
  for (let i = 0; i < 300; i++) positions.push(i % 3 - 1, i % 21, i % 5 - 2);
  positions.push(0, -30000, 0);
  const bodyGeometry = new THREE.BufferGeometry();
  bodyGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  bodyGeometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Uint16Array(301 * 4), 4));
  const bodyWeights = new Float32Array(301 * 4);
  for (let i = 0; i < 301; i++) bodyWeights[i * 4] = 1;
  bodyGeometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(bodyWeights, 4));
  const body = new THREE.SkinnedMesh(bodyGeometry);
  const bodyBone = new THREE.Bone();
  body.add(bodyBone);
  body.bind(new THREE.Skeleton([bodyBone]));
  characterFramingBounds(body);
  const shadowBounds = copyCharacterBounds(body, new THREE.Box3());
  const actual = [shadowBounds.min.y, shadowBounds.max.y];
  cases.push({ name: "shadow bounds exclude distant hidden vertices", expected: [0, 20], actual });
  if (actual[0] !== 0 || actual[1] !== 20 || bodyGeometry.getAttribute("position").getY(300) !== -30000) {
    failures.push("shadow bounds exclude distant hidden vertices");
  }
  bodyGeometry.dispose(); body.skeleton.dispose(); mesh.skeleton.dispose();
  scene.remove(mesh);
  mesh = new THREE.Mesh(geometry);
  mesh.receiveShadow = true;
  for (let i = 0; i < 3; i++) geometry.getAttribute("normal").setXYZ(i, 0, 0, 1);
  geometry.getAttribute("normal").needsUpdate = true;
  scene.add(mesh);
  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(0, 0, 2);
  light.castShadow = true;
  Object.assign(light.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 0.1, far: 10 });
  light.shadow.mapSize.set(256, 256);
  scene.add(light, light.target);
  // Cast a shadow while leaving receiver pixels visible to the test camera.
  const blocker = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  blocker.material.shadowSide = THREE.DoubleSide;
  blocker.position.z = 0.5;
  blocker.castShadow = true;
  scene.add(blocker);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;
  check("toon receiver displays cast shadow", { ambient: [0.6, 0.6, 0.6], toon }, [77, 77, 77]);
  blocker.visible = false;
  check("toon receiver is lit without occluder", { ambient: [0.6, 0.6, 0.6], toon }, [153, 153, 153]);
  blocker.visible = true;
  check("non-toon receiver retains only ambient in shadow", { ambient: [0.2, 0.2, 0.2], diffuse: [0.4, 0.4, 0.4] }, [51, 51, 51]);
  blocker.visible = false;
  check("non-toon receiver is lit without occluder", { ambient: [0.2, 0.2, 0.2], diffuse: [0.4, 0.4, 0.4] }, [153, 153, 153]);
  // At the MMD default light slope, this hair-like blocker projects onto the
  // face sample. A more frontal light misses it, reproducing the reported gap.
  blocker.visible = true;
  blocker.position.set(0.5, 1, 0.5);
  light.position.set(2, 4, 2);
  const hairShadowOptions = { ambient: [0.6, 0.6, 0.6], toon };
  const hairShadowName = "MMD default light casts a raised blocker onto the face";
  check(hairShadowName, hairShadowOptions, [77, 77, 77]);
  light.position.set(3, 3.1, 5);
  const wrongLightPixel = render(hairShadowOptions);
  const detected = wrongLightPixel.every(value => Math.abs(value - 153) <= 2);
  mutations.push({ name: hairShadowName, actual: wrongLightPixel, detected });
  if (!detected) failures.push(`${hairShadowName}: incorrect viewer light escaped`);
  blocker.geometry.dispose(); blocker.material.dispose(); light.shadow.dispose();
  geometry.dispose(); sphere.dispose(); toon.dispose(); stripes.dispose(); renderer.dispose();
  return { cases, mutations, failures };
}
