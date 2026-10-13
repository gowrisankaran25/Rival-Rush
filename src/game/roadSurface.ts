import * as THREE from 'three';
import { roadCenter, roadElevation, roadHeading, roadPitch } from './math';

export function createHighwayRoadTexture(maxAnisotropy = 8): THREE.CanvasTexture {
  if (typeof document === 'undefined') {
    const dummy = { width: 1, height: 1 } as unknown as HTMLCanvasElement;
    const dummyTex = new THREE.CanvasTexture(dummy);
    dummyTex.wrapS = THREE.RepeatWrapping;
    dummyTex.wrapT = THREE.RepeatWrapping;
    dummyTex.anisotropy = Math.min(8, maxAnisotropy);
    return dummyTex;
  }
  const width = 2048;
  const height = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  // 1. Rich dark highway asphalt base
  ctx.fillStyle = '#22252a';
  ctx.fillRect(0, 0, width, height);

  // 2. Aggregate mineral grain and stochastic asphalt micro-noise
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  let seed = 123456789;
  for (let i = 0; i < data.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const grain = ((seed >>> 8) / 16777216 - 0.5) * 16;
    data[i] = Math.min(255, Math.max(0, data[i] + grain));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + grain));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + grain));
  }
  ctx.putImageData(imgData, 0, 0);

  // 3. Subtle wheel-path tire tracks in each of the 3 lanes
  const drawWheelTracks = (laneCenterX: number, halfTrackWidth = 110) => {
    const trackWidth = 75;
    for (const offset of [-halfTrackWidth, halfTrackWidth]) {
      const grad = ctx.createLinearGradient(
        laneCenterX + offset - trackWidth,
        0,
        laneCenterX + offset + trackWidth,
        0,
      );
      grad.addColorStop(0, 'rgba(15, 17, 20, 0)');
      grad.addColorStop(0.5, 'rgba(15, 17, 20, 0.45)');
      grad.addColorStop(1, 'rgba(15, 17, 20, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(laneCenterX + offset - trackWidth, 0, trackWidth * 2, height);
    }
  };

  // Lane centers: Left ~429 px, Center ~1043 px, Right ~1657 px
  drawWheelTracks(429);
  drawWheelTracks(1043);
  drawWheelTracks(1657);

  // 4. Shoulder rumble strip patterns outside the edge lines
  ctx.fillStyle = 'rgba(17, 19, 22, 0.65)';
  for (let y = 0; y < height; y += 32) {
    ctx.fillRect(25, y, 65, 16);
    ctx.fillRect(1985, y, 65, 16);
  }

  // 5. Solid outer edge road markings (crisp highway retro-reflective white)
  ctx.fillStyle = '#f8fafc';
  // Left solid edge line (width ~20 px)
  ctx.fillRect(106, 0, 20, height);
  // Right solid edge line (width ~20 px)
  ctx.fillRect(1950, 0, 20, height);

  // 6. Dashed lane divider lines separating the 3 lanes
  // Standard highway dash length (3.5m dash out of 12m repeat cycle = ~300 px)
  const dashLength = 300;
  ctx.fillStyle = '#ffffff';

  // Divider 1 (between Lane 0 and Lane 1)
  ctx.fillRect(724, 0, 16, dashLength);

  // Divider 2 (between Lane 1 and Lane 2)
  ctx.fillRect(1338, 0, 16, dashLength);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, maxAnisotropy);
  return texture;
}

export function createRoadStrip(
  width: number,
  segments: number,
  centerOffset = 0,
  uvWidth = Math.max(1, width / 9),
  uvMeters = 12,
): THREE.BufferGeometry {
  const positions = new Float32Array((segments + 1) * 2 * 3);
  const normals = new Float32Array((segments + 1) * 2 * 3);
  const uvs = new Float32Array((segments + 1) * 2 * 2);
  const indices: number[] = [];

  for (let index = 0; index <= segments; index += 1) {
    // The road bends only in the horizontal plane, so every vertex normal is
    // permanently world-up. Recomputing normals as the ribbon moves is wasted.
    normals[index * 6 + 1] = 1;
    normals[index * 6 + 4] = 1;
    const uvOffset = index * 4;
    uvs[uvOffset] = 0;
    uvs[uvOffset + 1] = index / segments;
    uvs[uvOffset + 2] = 1;
    uvs[uvOffset + 3] = index / segments;
    if (index < segments) {
      const vertex = index * 2;
      indices.push(vertex, vertex + 1, vertex + 2, vertex + 2, vertex + 1, vertex + 3);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.userData.width = width;
  geometry.userData.centerOffset = centerOffset;
  geometry.userData.uvWidth = uvWidth;
  geometry.userData.uvMeters = uvMeters;
  return geometry;
}

export function updateRoadStrip(
  geometry: THREE.BufferGeometry,
  start: number,
  length: number,
): void {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  const segments = position.count / 2 - 1;
  const halfWidth = geometry.userData.width / 2;
  const centerOffset = geometry.userData.centerOffset as number;
  const uvWidth = geometry.userData.uvWidth as number;
  const uvMeters = geometry.userData.uvMeters as number;
  const isShoulder = geometry.userData.isShoulder === true;
  const baseElevationOffset = isShoulder ? -0.055 : 0;
  const normal = geometry.getAttribute('normal') as THREE.BufferAttribute;

  for (let index = 0; index <= segments; index += 1) {
    const distance = start + (index / segments) * length;
    const center = roadCenter(distance);
    const elevation = roadElevation(distance) + baseElevationOffset;
    const heading = roadHeading(distance);
    const pitch = roadPitch(distance);
    const sideX = Math.cos(heading);
    const sideZ = -Math.sin(heading);
    const vertex = index * 2;
    position.setXYZ(
      vertex,
      center + sideX * (centerOffset - halfWidth),
      elevation,
      -distance + sideZ * (centerOffset - halfWidth),
    );
    position.setXYZ(
      vertex + 1,
      center + sideX * (centerOffset + halfWidth),
      elevation,
      -distance + sideZ * (centerOffset + halfWidth),
    );

    // Compute surface normal taking pitch and heading into account
    const normX = -Math.sin(heading) * Math.sin(pitch) || 0;
    const normY = Math.cos(pitch);
    const normZ = -Math.cos(heading) * Math.sin(pitch) || 0;
    normal.setXYZ(vertex, normX, normY, normZ);
    normal.setXYZ(vertex + 1, normX, normY, normZ);

    uv.setXY(vertex, 0, distance / uvMeters);
    uv.setXY(vertex + 1, uvWidth, distance / uvMeters);
  }

  position.needsUpdate = true;
  normal.needsUpdate = true;
  uv.needsUpdate = true;
  geometry.computeBoundingSphere();
}
