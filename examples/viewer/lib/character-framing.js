import * as THREE from "three";

const outlierBounds = new WeakMap();

// Like Three's cached mesh bounds, this box is reused without allocations each frame.
export function copyCharacterBounds(mesh, target) {
  const localBounds = outlierBounds.get(mesh);
  return localBounds ? target.copy(localBounds).applyMatrix4(mesh.matrixWorld) : target.setFromObject(mesh);
}

export function characterFramingBounds(mesh) {
  const cachedBounds = outlierBounds.get(mesh);
  if (cachedBounds) {
    mesh.updateWorldMatrix(true, false);
    return cachedBounds.clone().applyMatrix4(mesh.matrixWorld);
  }
  const positions = mesh.geometry?.getAttribute("position");
  if (!mesh.isSkinnedMesh || !positions?.count) return new THREE.Box3().setFromObject(mesh);
  mesh.updateWorldMatrix(true, false);
  const axes = [[], [], []];
  const points = new Float64Array(positions.count * 3);
  const point = new THREE.Vector3();
  for (let i = 0; i < positions.count; i += 1) {
    mesh.getVertexPosition(i, point);
    points.set(point.toArray(), i * 3);
    axes[0].push(point.x);
    axes[1].push(point.y);
    axes[2].push(point.z);
  }
  // Some PMX authors hide unused pieces thousands of units away. Only framing
  // excludes extreme outliers; geometry and animation remain untouched.
  const limits = axes.map(values => {
    values.sort((a, b) => a - b);
    const low = values[Math.floor((values.length - 1) * 0.01)];
    const high = values[Math.ceil((values.length - 1) * 0.99)];
    const margin = Math.max(high - low, 0.001) * 100;
    return [low - margin, high + margin];
  });
  const bounds = new THREE.Box3();
  let excluded = false;
  for (let i = 0; i < positions.count; i += 1) {
    point.fromArray(points, i * 3);
    if (point.x < limits[0][0] || point.x > limits[0][1] ||
        point.y < limits[1][0] || point.y > limits[1][1] ||
        point.z < limits[2][0] || point.z > limits[2][1]) {
      excluded = true;
      continue;
    }
    bounds.expandByPoint(point);
  }
  if (excluded && !bounds.isEmpty()) outlierBounds.set(mesh, bounds.clone());
  else outlierBounds.delete(mesh);
  return bounds.isEmpty() ? new THREE.Box3().setFromObject(mesh) : bounds.applyMatrix4(mesh.matrixWorld);
}
