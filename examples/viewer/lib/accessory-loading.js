import * as THREE from "three";
import { initCore, parseAccessory } from "../../../dist/parser/index.js";
import { dom, setStatus } from "./dom.js";
import { renderStillFrame } from "./playback.js";
import { state } from "./state.js";

let accessoryCore = undefined;
let accessoryCorePromise = undefined;

async function ensureAccessoryCore() {
  if (accessoryCore) return accessoryCore;
  if (!accessoryCorePromise) {
    accessoryCorePromise = initCore().catch((error) => {
      accessoryCorePromise = undefined;
      throw error;
    });
  }
  accessoryCore = await accessoryCorePromise;
  return accessoryCore;
}

export async function loadAccessoryFile(file) {
  try {
    setStatus(`Loading accessory: ${file.name}`, "loading");
    const core = await ensureAccessoryCore();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const manifest = parseAccessory(bytes, core, file.name);
    const group = buildAccessoryGroup(manifest, file.name);
    clearAccessory();
    state.scene.add(group);
    state.currentAccessory = group;
    setStatus("", "ready");
    renderStillFrame();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
  }
}

export function clearAccessory() {
  if (state.currentAccessory) {
    state.scene.remove(state.currentAccessory);
    disposeAccessoryGroup(state.currentAccessory);
    state.currentAccessory = undefined;
  }
}

function buildAccessoryGroup(manifest, name) {
  const group = new THREE.Group();
  group.name = name || "accessory";

  for (const meshSummary of manifest.meshSummaries) {
    const geometry = buildAccessoryGeometry(meshSummary);
    const materials = buildAccessoryMaterials(manifest.materials, meshSummary);
    const mesh = materials.length > 1
      ? new THREE.Mesh(geometry, materials)
      : new THREE.Mesh(geometry, materials[0] || new THREE.MeshStandardMaterial());
    mesh.name = `accessory-mesh`;
    group.add(mesh);
  }

  if (manifest.vacSettings) {
    applyVacPlacement(group, manifest.vacSettings);
  }

  return group;
}

function buildAccessoryGeometry(meshSummary) {
  const positions = [];
  const normals = [];
  const uvs = [];
  let currentMaterialIndex = -1;
  let currentGroupStart = 0;
  let vertexCount = 0;
  const groups = [];

  for (let faceIdx = 0; faceIdx < meshSummary.faceIndices.length; faceIdx++) {
    const posIndices = meshSummary.faceIndices[faceIdx];
    const normIndices = meshSummary.normalFaceIndices[faceIdx] || posIndices;
    const matIdx = meshSummary.materialIndices[faceIdx] ?? 0;

    if (matIdx !== currentMaterialIndex) {
      if (currentMaterialIndex >= 0 && vertexCount > currentGroupStart) {
        groups.push({ start: currentGroupStart, count: vertexCount - currentGroupStart, materialIndex: currentMaterialIndex });
      }
      currentMaterialIndex = matIdx;
      currentGroupStart = vertexCount;
    }

    // Triangulate: 3 verts = 1 triangle, 4 verts = 2 triangles (fan)
    const triSets = posIndices.length === 3
      ? [[0, 1, 2]]
      : posIndices.length >= 4
        ? triangulatePolygon(posIndices.length)
        : [];

    for (const [a, b, c] of triSets) {
      for (const i of [a, b, c]) {
        const pi = posIndices[i];
        const ni = normIndices[i] ?? pi;
        const pos = meshSummary.positions[pi] || [0, 0, 0];
        const norm = meshSummary.normals[ni] || [0, 1, 0];
        const uv = meshSummary.textureCoordinates[pi] || [0, 0];
        positions.push(pos[0], pos[1], pos[2]);
        normals.push(norm[0], norm[1], norm[2]);
        uvs.push(uv[0], uv[1]);
        vertexCount++;
      }
    }
  }

  if (vertexCount > currentGroupStart) {
    groups.push({ start: currentGroupStart, count: vertexCount - currentGroupStart, materialIndex: currentMaterialIndex >= 0 ? currentMaterialIndex : 0 });
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));

  for (const group of groups) {
    geometry.addGroup(group.start, group.count, group.materialIndex);
  }

  return geometry;
}

function triangulatePolygon(vertexCount) {
  const tris = [];
  for (let i = 1; i < vertexCount - 1; i++) {
    tris.push([0, i, i + 1]);
  }
  return tris;
}

function buildAccessoryMaterials(materials, meshSummary) {
  if (materials.length === 0) {
    return [new THREE.MeshStandardMaterial({ color: 0xcccccc })];
  }
  return materials.map((mat) => {
    const color = mat.faceColor
      ? new THREE.Color(mat.faceColor[0], mat.faceColor[1], mat.faceColor[2])
      : new THREE.Color(0xcccccc);
    const opacity = mat.faceColor ? mat.faceColor[3] : 1.0;
    const emissive = mat.emissiveColor
      ? new THREE.Color(mat.emissiveColor[0], mat.emissiveColor[1], mat.emissiveColor[2])
      : undefined;
    return new THREE.MeshStandardMaterial({
      color,
      emissive,
      roughness: mat.power != null ? Math.max(1.0 - mat.power / 100, 0) : 0.5,
      transparent: opacity < 1.0,
      opacity,
      side: THREE.DoubleSide
    });
  });
}

function applyVacPlacement(group, vac) {
  if (vac.scale != null) {
    group.scale.setScalar(vac.scale);
  }
  if (vac.position) {
    group.position.set(vac.position[0], vac.position[1], vac.position[2]);
  }
  if (vac.rotation) {
    const deg2rad = Math.PI / 180;
    group.rotation.set(
      vac.rotation[0] * deg2rad,
      vac.rotation[1] * deg2rad,
      vac.rotation[2] * deg2rad
    );
  }
}

function disposeAccessoryGroup(group) {
  for (const child of group.children) {
    if (child.geometry) child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of materials) {
      if (mat) mat.dispose();
    }
  }
}
