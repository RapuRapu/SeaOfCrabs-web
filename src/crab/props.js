import { createScatterLayer, attemptsFor } from './scatter.js';
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createNoise2D, createRandom, smoothstep } from '../noise.js';
import { applySeaside } from './seaside.js';
import { TIDE_MIDDLE, TIDE_AMPLITUDE } from './world.js';

const linearColor = (red, green, blue) => new THREE.Color().setRGB(red, green, blue, THREE.SRGBColorSpace);
const ROCK_BASE = linearColor(0.5, 0.43, 0.37);
const ROCK_SUNBLEACHED = linearColor(0.74, 0.66, 0.55);
const ROCK_TIDAL_ALGAE = linearColor(0.22, 0.27, 0.14);
const ROCK_SUBMERGED = linearColor(0.3, 0.26, 0.24);
const DRIFTWOOD = linearColor(0.66, 0.6, 0.52);
const DRIFTWOOD_CORE = linearColor(0.8, 0.7, 0.54);
const PEBBLE_COLORS = [linearColor(0.5, 0.48, 0.46), linearColor(0.72, 0.68, 0.6), linearColor(0.36, 0.33, 0.32), linearColor(0.62, 0.42, 0.3), linearColor(0.86, 0.84, 0.78), linearColor(0.44, 0.5, 0.5)];

const UP = new THREE.Vector3(0, 1, 0);
const volumeNoise = createNoise2D(67);
const lumpAt = (x, y, z, frequency) => (volumeNoise(x * frequency + 3.1, y * frequency) + volumeNoise(y * frequency + 7.7, z * frequency) + volumeNoise(z * frequency + 1.3, x * frequency + 5.2)) / 3;

function smoothIcosphere(detail) {
  const geometry = new THREE.IcosahedronGeometry(1, detail);
  geometry.deleteAttribute('normal');
  geometry.deleteAttribute('uv');
  return mergeVertices(geometry, 1e-4);
}

function buildBoulderGeometry(boulder, detail) {
  const geometry = smoothIcosphere(detail);
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const color = new THREE.Color();
  const point = new THREE.Vector3();
  const seedOffset = boulder.seed * 13.7;
  const facetRandom = createRandom(boulder.seed * 977);
  const stretchX = 0.78 + facetRandom() * 0.5;
  const stretchZ = 0.78 + facetRandom() * 0.5;
  const turn = facetRandom() * Math.PI * 2;
  const facets = Array.from({ length: 5 + Math.floor(facetRandom() * 6) }, () => {
    const direction = new THREE.Vector3(facetRandom() * 2 - 1, facetRandom() * 1.2 - 0.2, facetRandom() * 2 - 1).normalize();
    return { direction, reach: 0.6 + facetRandom() * 0.3 };
  });
  const highTideMark = TIDE_MIDDLE + TIDE_AMPLITUDE;
  const lowTideMark = TIDE_MIDDLE - TIDE_AMPLITUDE;
  for (let index = 0; index < positions.count; index++) {
    point.fromBufferAttribute(positions, index);
    const bulge = 1 + lumpAt(point.x + seedOffset, point.y, point.z, 0.9) * 0.42 + lumpAt(point.x, point.y + seedOffset, point.z, 2.3) * 0.16 + lumpAt(point.x, point.y, point.z + seedOffset, 5.5) * 0.05;
    for (const facet of facets) {
      const beyond = point.dot(facet.direction) - facet.reach;
      if (beyond > 0) point.addScaledVector(facet.direction, -beyond * 0.7);
    }
    point.multiplyScalar(bulge);
    point.y = Math.max(point.y, -0.42) * boulder.squash;
    point.x *= stretchX;
    point.z *= stretchZ;
    point.applyAxisAngle(UP, turn);
    point.multiplyScalar(boulder.radius);
    const worldY = boulder.y + point.y;
    const mottle = lumpAt(point.x + seedOffset, point.y, point.z, 0.35 / Math.sqrt(boulder.radius));
    color.copy(ROCK_BASE).lerp(ROCK_SUNBLEACHED, smoothstep(0.1, 0.9, point.y / (boulder.radius * boulder.squash)) * 0.7 + mottle * 0.3);
    color.lerp(ROCK_TIDAL_ALGAE, smoothstep(highTideMark + 0.9, highTideMark - 0.3, worldY) * smoothstep(lowTideMark - 1.2, lowTideMark + 0.6, worldY) * (0.6 + mottle * 0.4));
    color.lerp(ROCK_SUBMERGED, smoothstep(lowTideMark + 0.4, lowTideMark - 1.4, worldY) * 0.7);
    const groundShade = 0.55 + 0.45 * smoothstep(-0.3, 0.35, point.y / (boulder.radius * boulder.squash));
    colors[index * 3] = color.r * groundShade;
    colors[index * 3 + 1] = color.g * groundShade;
    colors[index * 3 + 2] = color.b * groundShade;
    positions.setXYZ(index, boulder.x + point.x, worldY, boulder.z + point.z);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function buildLogGeometry(log) {
  const radialSegments = 20;
  const lengthSegments = 48;
  const geometry = new THREE.CylinderGeometry(1, 1, 1, radialSegments, lengthSegments, false);
  geometry.deleteAttribute('uv');
  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal;
  const colors = new Float32Array(positions.count * 3);
  const color = new THREE.Color();
  const point = new THREE.Vector3();
  const cos = Math.cos(log.heading);
  const sin = Math.sin(log.heading);
  for (let index = 0; index < positions.count; index++) {
    point.fromBufferAttribute(positions, index);
    const along = point.y;
    const isEndCap = Math.abs(normals.getY(index)) > 0.5;
    const angle = Math.atan2(point.z, point.x);
    const radial = Math.hypot(point.x, point.z);
    const taper = 1 - 0.22 * (along + 0.5) + 0.1 * volumeNoise(along * 3 + log.seed, 0.5);
    const grooves = 1 + 0.07 * volumeNoise(Math.cos(angle) * 4 + log.seed, Math.sin(angle) * 4 + along * 0.7) + 0.035 * Math.sin(angle * 9 + along * 4);
    const radius = radial * log.radius * taper * grooves;
    const bendSideways = Math.sin((along + 0.5) * 2.4 + log.seed) * log.radius * 0.5;
    const localAlong = along * log.length;
    const localSide = Math.cos(angle) * radius + bendSideways;
    const localUp = Math.sin(angle) * radius;
    const streak = volumeNoise(angle * 3 + log.seed, along * 40);
    color.copy(DRIFTWOOD).multiplyScalar(0.82 + 0.3 * streak);
    if (isEndCap) color.copy(DRIFTWOOD_CORE).multiplyScalar(0.75 + 0.25 * Math.sin(radial * 26));
    const groundShade = 0.6 + 0.4 * smoothstep(-0.9, 0.2, Math.sin(angle));
    colors[index * 3] = color.r * groundShade;
    colors[index * 3 + 1] = color.g * groundShade;
    colors[index * 3 + 2] = color.b * groundShade;
    positions.setXYZ(index, log.x + cos * localAlong - sin * localSide, log.y + log.radius * 0.62 + localUp + (along + 0.5) * (log.rise || 0), log.z + sin * localAlong + cos * localSide);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

const LOOSE_PEBBLE_ATTEMPTS_PER_AREA = 0.0483;
const RING_PEBBLE_ATTEMPTS_PER_BOULDER = 60;
const PEBBLE_RADIUS = 110;
const PEBBLE_LAYER_SEED = 404;
const LOW_FLAT_HIGHEST = -1.3;
const LOW_FLAT_LOWEST = -3.4;
const LOW_FLAT_PEBBLE_CHANCE = 0.14;
const LOW_FLAT_SHELL_SHARE = 0.55;
const SHELL_COLORS = [linearColor(0.92, 0.86, 0.76), linearColor(0.95, 0.8, 0.72), linearColor(0.84, 0.82, 0.78), linearColor(0.62, 0.48, 0.4)];

function pebbleAt(world, random, x, z, aroundBoulder) {
  if (world.isInHold(x, z)) return null;
  const height = world.heightAt(x, z);
  const inPool = world.retained.levelAt(x, z) - height > 0.3;
  const onStrandLine = Math.abs(height - (TIDE_MIDDLE + TIDE_AMPLITUDE + 0.5)) < 0.5 || Math.abs(height - TIDE_MIDDLE) < 0.35;
  const onLowFlat = height < LOW_FLAT_HIGHEST && height > LOW_FLAT_LOWEST && !world.isOnReef(x, z);
  if (!aroundBoulder && !inPool && !onStrandLine && random() > (onLowFlat ? LOW_FLAT_PEBBLE_CHANCE : 0.045)) return null;
  if (world.boulders.some((boulder) => Math.hypot(x - boulder.x, z - boulder.z) < boulder.radius * 0.9)) return null;
  const size = 0.14 + random() * random() * 0.75;
  const transform = new THREE.Object3D();
  transform.position.set(x, height + size * 0.12, z);
  transform.rotation.set(random() * 0.16, random() * Math.PI * 2, random() * 0.16);
  transform.scale.set(size * (0.8 + random() * 0.6), size * (0.35 + random() * 0.3), size * (0.7 + random() * 0.5));
  transform.updateMatrix();
  const isShell = onLowFlat && random() < LOW_FLAT_SHELL_SHARE;
  if (isShell) transform.scale.y *= 0.55;
  if (isShell) transform.updateMatrix();
  const palette = isShell ? SHELL_COLORS : PEBBLE_COLORS;
  const color = new THREE.Color().copy(palette[Math.floor(random() * palette.length)]).multiplyScalar(0.75 + random() * 0.5);
  return { matrix: transform.matrix, color, sizeClass: size > 0.5 ? 1 : 0 };
}

function generatePebbles(world, quality, { minX, minZ, size, random, pointInside }) {
  const pebbles = [];
  for (const boulder of world.boulders) {
    if (boulder.x < minX || boulder.x >= minX + size || boulder.z < minZ || boulder.z >= minZ + size) continue;
    for (let attempt = 0; attempt < Math.round(RING_PEBBLE_ATTEMPTS_PER_BOULDER * quality.density); attempt++) {
      const angle = random() * Math.PI * 2;
      const distance = boulder.radius * (0.98 + random() * random() * 2.6);
      const pebble = pebbleAt(world, random, boulder.x + Math.cos(angle) * distance, boulder.z + Math.sin(angle) * distance, true);
      if (pebble) pebbles.push(pebble);
    }
  }
  for (let attempt = attemptsFor(random, LOOSE_PEBBLE_ATTEMPTS_PER_AREA * quality.density); attempt > 0; attempt--) {
    const [x, z] = pointInside();
    const pebble = pebbleAt(world, random, x, z, false);
    if (pebble) pebbles.push(pebble);
  }
  return pebbles;
}

function buildPebbles(world, quality) {
  const material = applySeaside(new THREE.MeshStandardMaterial({ roughness: 0.8, vertexColors: true }), { surface: 'rock', wetDarkening: 0.55, wetRoughness: 0.34, chromaticCaustics: quality.chromaticCaustics });
  const sizeClasses = [
    { detail: 1, castShadow: false, capacity: 0, mesh: null },
    { detail: 2, castShadow: true, capacity: 0, mesh: null },
  ];
  const group = new THREE.Group();
  const geometries = sizeClasses.map((sizeClass) => {
    const geometry = smoothIcosphere(sizeClass.detail);
    const pebblePositions = geometry.attributes.position;
    const pebblePoint = new THREE.Vector3();
    for (let index = 0; index < pebblePositions.count; index++) {
      pebblePoint.fromBufferAttribute(pebblePositions, index).multiplyScalar(1 + 0.12 * lumpAt(pebblePoint.x, pebblePoint.y, pebblePoint.z, 1.4));
      pebblePositions.setXYZ(index, pebblePoint.x, pebblePoint.y, pebblePoint.z);
    }
    geometry.computeVertexNormals();
    const undersideShade = new Float32Array(geometry.attributes.position.count * 3);
    for (let index = 0; index < geometry.attributes.position.count; index++) undersideShade.fill(0.5 + 0.5 * smoothstep(-0.55, 0.35, geometry.attributes.position.getY(index)), index * 3, index * 3 + 3);
    geometry.setAttribute('color', new THREE.BufferAttribute(undersideShade, 3));
    return geometry;
  });

  function show(pebbles) {
    sizeClasses.forEach((sizeClass, classIndex) => {
      const members = pebbles.filter((pebble) => pebble.sizeClass === classIndex);
      if (members.length > sizeClass.capacity) {
        if (sizeClass.mesh) {
          group.remove(sizeClass.mesh);
          sizeClass.mesh.dispose();
        }
        sizeClass.capacity = Math.ceil(members.length * 1.3);
        sizeClass.mesh = new THREE.InstancedMesh(geometries[classIndex], material, sizeClass.capacity);
        sizeClass.mesh.receiveShadow = true;
        sizeClass.mesh.castShadow = sizeClass.castShadow;
        sizeClass.mesh.frustumCulled = false;
        group.add(sizeClass.mesh);
      }
      members.forEach((pebble, index) => {
        sizeClass.mesh.setMatrixAt(index, pebble.matrix);
        sizeClass.mesh.setColorAt(index, pebble.color);
      });
      sizeClass.mesh.count = members.length;
      sizeClass.mesh.instanceMatrix.needsUpdate = true;
      if (sizeClass.mesh.instanceColor) sizeClass.mesh.instanceColor.needsUpdate = true;
    });
  }

  const layer = createScatterLayer({ seed: PEBBLE_LAYER_SEED, radius: PEBBLE_RADIUS, generate: (chunk) => generatePebbles(world, quality, chunk), onChange: show });
  return { group, layer };
}

export function createProps(scene, world, quality) {
  const boulderDetail = quality.density >= 1 ? 4 : quality.density >= 0.7 ? 3 : 2;
  const solidGeometries = [...world.boulders.map((boulder) => buildBoulderGeometry(boulder, boulder.radius > 9 ? boulderDetail + 1 : boulderDetail)), ...world.logs.map(buildLogGeometry)];
  const rockMaterial = applySeaside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 }), { surface: 'rock', wetDarkening: 0.55, wetRoughness: 0.3, chromaticCaustics: quality.chromaticCaustics });
  const solids = new THREE.Mesh(mergeGeometries(solidGeometries), rockMaterial);
  solids.castShadow = true;
  solids.receiveShadow = true;
  scene.add(solids);
  const pebbles = buildPebbles(world, quality);
  scene.add(pebbles.group);
  return { solids, follow: (x, z) => pebbles.layer.follow(x, z) };
}
