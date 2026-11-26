import * as THREE from 'three';
import { PLAY_BOUNDS, boundsWidth } from './worldBounds.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createNoise2D, createRandom, smoothstep } from '../noise.js';
import { applySeaside } from './seaside.js';
import { buildDenGeometry } from './reefCreatures.js';

export const MORAY_DEN_SCALE = 1.45;

const linearColor = (red, green, blue) => new THREE.Color().setRGB(red, green, blue, THREE.SRGBColorSpace);
const BRANCH_CORAL_PALETTES = [
  [linearColor(0.5, 0.26, 0.56), linearColor(0.86, 0.66, 0.92)],
  [linearColor(0.9, 0.42, 0.2), linearColor(1, 0.78, 0.5)],
  [linearColor(0.86, 0.4, 0.5), linearColor(1, 0.76, 0.8)],
  [linearColor(0.72, 0.64, 0.26), linearColor(0.96, 0.92, 0.6)],
];
const BRAIN_CORAL_PALETTES = [
  [linearColor(0.86, 0.7, 0.42), linearColor(0.46, 0.32, 0.18)],
  [linearColor(0.9, 0.62, 0.56), linearColor(0.5, 0.28, 0.26)],
  [linearColor(0.76, 0.74, 0.46), linearColor(0.38, 0.36, 0.2)],
];
const ROCK_GREY = linearColor(0.46, 0.43, 0.4);
const ROCK_PALE = linearColor(0.66, 0.62, 0.56);
const ROCK_ALGAE = linearColor(0.36, 0.4, 0.22);
const BARNACLE_SHELL = linearColor(0.9, 0.88, 0.8);
const BARNACLE_OPENING = linearColor(0.22, 0.2, 0.18);
const URCHIN_BODY = linearColor(0.14, 0.05, 0.16);
const URCHIN_SPINE_TIP = linearColor(0.42, 0.2, 0.5);

const UP = new THREE.Vector3(0, 1, 0);
const REEF_CHUNK_COUNT = 10;
const RUBBLE_HIGHEST_FLOOR = -2.6;
const RUBBLE_AREA_SCALE = 4.5;
const REEF_BUILD_REACH = 160;
const REEF_PIECES_PER_FRAME = 12;
const RUBBLE_WEST_REACH = 84;
const CORAL_TIP_TAPER = 0.42;
const CORAL_CAP_FLATTEN = 0.85;
const CORAL_JOINT_SINK = 1.2;
const REEF_CHUNK_SPAN = boundsWidth(PLAY_BOUNDS);
const reefPropNoise = createNoise2D(311);
const lumpAt = (x, y, z, frequency) => (reefPropNoise(x * frequency + 3.1, y * frequency) + reefPropNoise(y * frequency + 7.7, z * frequency) + reefPropNoise(z * frequency + 1.3, x * frequency + 5.2)) / 3;

function paintAll(geometry, colorAt) {
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const color = new THREE.Color();
  for (let index = 0; index < positions.count; index++) {
    colorAt(color, positions.getX(index), positions.getY(index), positions.getZ(index), index);
    colors.set([color.r, color.g, color.b], index * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  if (geometry.attributes.uv) geometry.deleteAttribute('uv');
  return geometry;
}

function orientedTube(start, direction, length, startRadius, endRadius, radialSegments) {
  const tube = new THREE.CylinderGeometry(endRadius, startRadius, length, radialSegments, 1, true).translate(0, length / 2, 0);
  tube.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, direction));
  return tube.translate(start.x, start.y, start.z);
}

function orientedCap(centre, direction, radius, radialSegments) {
  const cap = new THREE.SphereGeometry(radius, radialSegments, 2, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, CORAL_CAP_FLATTEN, 1);
  cap.deleteAttribute('uv');
  cap.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, direction));
  return cap.translate(centre.x, centre.y, centre.z);
}

function buildBranchCoral(prop, radialSegments) {
  const random = createRandom(Math.floor(prop.seed * 7) + 1);
  const [baseColor, tipColor] = BRANCH_CORAL_PALETTES[Math.floor(prop.tone * BRANCH_CORAL_PALETTES.length)];
  const scale = prop.radius;
  const tubes = [];
  const reach = scale * 1.25;
  const grow = (start, direction, length, radius, depth) => {
    const end = start.clone().addScaledVector(direction, length);
    const endRadius = radius * (depth === 0 ? CORAL_TIP_TAPER : 0.62);
    const tube = orientedTube(start, direction, length, radius, endRadius, radialSegments);
    tube.deleteAttribute('uv');
    tubes.push({ geometry: tube, endHeight: end.y + endRadius });
    if (depth === 0) {
      tubes.push({ geometry: orientedCap(end, direction, endRadius, radialSegments), endHeight: end.y + endRadius });
      return;
    }
    const forks = 2 + Math.floor(random() * 2);
    for (let fork = 0; fork < forks; fork++) {
      const turn = random() * Math.PI * 2;
      const spread = 0.35 + random() * 0.45;
      const next = direction.clone().applyAxisAngle(new THREE.Vector3(Math.cos(turn), 0, Math.sin(turn)), spread).normalize();
      next.y = Math.max(next.y, 0.25);
      grow(end.clone().addScaledVector(direction, -endRadius * CORAL_JOINT_SINK), next.normalize(), length * (0.7 + random() * 0.2), radius * 0.68, depth - 1);
    }
  };
  const trunks = 4 + Math.floor(random() * 2);
  for (let trunk = 0; trunk < trunks; trunk++) {
    const angle = (trunk / trunks) * Math.PI * 2 + random() * 0.8;
    const lean = 0.25 + random() * 0.5;
    const direction = new THREE.Vector3(Math.cos(angle) * lean, 1, Math.sin(angle) * lean).normalize();
    grow(new THREE.Vector3(Math.cos(angle) * 0.15 * scale, -0.2, Math.sin(angle) * 0.15 * scale), direction, reach * (0.42 + random() * 0.14), 0.15 * scale, 2);
  }
  const topHeight = Math.max(...tubes.map((tube) => tube.endHeight));
  const geometry = mergeGeometries(tubes.map((tube) => tube.geometry));
  return paintAll(geometry, (color, x, y) => color.copy(baseColor).lerp(tipColor, smoothstep(topHeight * 0.35, topHeight, y)));
}

function buildBrainCoral(prop, widthSegments, heightSegments) {
  const [ridgeColor, grooveColor] = BRAIN_CORAL_PALETTES[Math.floor(prop.tone * BRAIN_CORAL_PALETTES.length)];
  const geometry = new THREE.SphereGeometry(1, widthSegments, heightSegments, 0, Math.PI * 2, 0, Math.PI * 0.56);
  const positions = geometry.attributes.position;
  const grooves = new Float32Array(positions.count);
  const point = new THREE.Vector3();
  for (let index = 0; index < positions.count; index++) {
    point.fromBufferAttribute(positions, index);
    const meander = Math.sin(lumpAt(point.x + prop.seed, point.y * 1.3, point.z, 2.4) * 26);
    const groove = 1 - smoothstep(0.1, 0.55, Math.abs(meander));
    grooves[index] = groove;
    const lump = 1 + 0.1 * lumpAt(point.x, point.y + prop.seed, point.z, 1.2);
    point.multiplyScalar(lump * (1 - 0.06 * groove));
    positions.setXYZ(index, point.x * prop.radius, (point.y * 0.82 - 0.12) * prop.radius, point.z * prop.radius);
  }
  geometry.computeVertexNormals();
  return paintAll(geometry, (color, x, y, z, index) => color.copy(ridgeColor).lerp(grooveColor, grooves[index] * 0.85).multiplyScalar(0.7 + 0.3 * smoothstep(-0.1, 0.4, y / prop.radius)));
}

function buildBarnacleRock(prop, detail) {
  const random = createRandom(Math.floor(prop.seed * 13) + 5);
  const rock = mergeVertices(new THREE.IcosahedronGeometry(1, detail).deleteAttribute('normal').deleteAttribute('uv'), 1e-4);
  const positions = rock.attributes.position;
  const point = new THREE.Vector3();
  const surfacePoints = [];
  for (let index = 0; index < positions.count; index++) {
    point.fromBufferAttribute(positions, index);
    const bulge = 1 + lumpAt(point.x + prop.seed, point.y, point.z, 1.1) * 0.7 + lumpAt(point.x, point.y, point.z + prop.seed, 3) * 0.2;
    point.multiplyScalar(bulge);
    point.y = Math.max(point.y, -0.3) * 0.58;
    point.multiplyScalar(prop.radius);
    positions.setXYZ(index, point.x, point.y, point.z);
    if (point.y > prop.radius * 0.08) surfacePoints.push(point.clone());
  }
  rock.computeVertexNormals();
  paintAll(rock, (color, x, y, z) => color.copy(ROCK_GREY).lerp(ROCK_PALE, smoothstep(-0.1, 0.5, y / prop.radius) * 0.6 + 0.2 * lumpAt(x, y, z, 2)).lerp(ROCK_ALGAE, smoothstep(0.1, 0.4, lumpAt(x + 9, y, z, 1.4)) * 0.6));
  const pieces = [rock];
  const barnacleCount = Math.round(16 + prop.radius * 12);
  for (let barnacle = 0; barnacle < barnacleCount && surfacePoints.length; barnacle++) {
    const at = surfacePoints[Math.floor(random() * surfacePoints.length)];
    const size = 0.07 + random() * random() * 0.16;
    const normal = at.clone().setY(at.y * 1.6).normalize();
    const cone = new THREE.CylinderGeometry(size * 0.45, size, size * 0.9, 6, 1, true).translate(0, size * 0.4, 0);
    cone.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, normal)).translate(at.x, at.y, at.z);
    paintAll(cone, (color, x, y, z, index) => color.copy(BARNACLE_SHELL).lerp(BARNACLE_OPENING, index < 7 ? 0.7 : 0));
    pieces.push(cone);
  }
  return mergeGeometries(pieces);
}

function buildUrchin(prop, spineCount) {
  const body = mergeVertices(new THREE.IcosahedronGeometry(prop.radius * 0.55, 1).deleteAttribute('normal').deleteAttribute('uv'), 1e-4).scale(1, 0.72, 1).translate(0, prop.radius * 0.25, 0);
  body.computeVertexNormals();
  paintAll(body, (color) => color.copy(URCHIN_BODY));
  const pieces = [body];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let spine = 0; spine < spineCount; spine++) {
    const height = 1 - (spine / (spineCount - 1)) * 1.25;
    const ring = Math.sqrt(Math.max(0, 1 - height * height));
    const direction = new THREE.Vector3(Math.cos(spine * golden + prop.seed) * ring, height, Math.sin(spine * golden + prop.seed) * ring).normalize();
    const start = direction.clone().multiplyScalar(prop.radius * 0.4).add(new THREE.Vector3(0, prop.radius * 0.25, 0));
    const length = prop.radius * (0.95 + 0.25 * Math.sin(spine * 7.3));
    const needle = orientedTube(start, direction, length, prop.radius * 0.05, prop.radius * 0.006, 3);
    paintAll(needle, (color, x, y, z) => color.copy(URCHIN_BODY).lerp(URCHIN_SPINE_TIP, smoothstep(prop.radius * 0.5, prop.radius * 1.3, Math.hypot(x, y - prop.radius * 0.25, z))));
    pieces.push(needle);
  }
  return mergeGeometries(pieces);
}

function buildRubble(world, quality) {
  const random = createRandom(8080);
  const wanted = Math.round(300 * RUBBLE_AREA_SCALE * quality.density);
  const pieces = [];
  const palette = [ROCK_GREY, ROCK_PALE, BRANCH_CORAL_PALETTES[2][1], BRAIN_CORAL_PALETTES[0][0], linearColor(0.9, 0.86, 0.78)];
  for (let attempt = 0; attempt < wanted * 20 && pieces.length < wanted; attempt++) {
    const x = THREE.MathUtils.lerp(PLAY_BOUNDS.minX + 2, PLAY_BOUNDS.maxX - 2, random());
    const z = 46 + random() * (66 + RUBBLE_WEST_REACH);
    if (!world.isOnReef(x, z) || !world.isWalkable(x, z)) continue;
    const height = world.heightAt(x, z);
    if (height < -3.6 || height > RUBBLE_HIGHEST_FLOOR) continue;
    const size = 0.16 + random() * random() * 0.6;
    const seed = random() * 50;
    const indexed = mergeVertices(new THREE.IcosahedronGeometry(1, 0).deleteAttribute('uv').deleteAttribute('normal'), 1e-4);
    const positions = indexed.attributes.position;
    const point = new THREE.Vector3();
    for (let index = 0; index < positions.count; index++) {
      point.fromBufferAttribute(positions, index).multiplyScalar(1 + 0.22 * lumpAt(point.x + seed, point.y, point.z, 1.7));
      positions.setXYZ(index, point.x, point.y, point.z);
    }
    indexed.scale(size * (0.8 + random() * 0.5), size * (0.45 + random() * 0.3), size * (0.7 + random() * 0.4)).rotateY(random() * Math.PI * 2).translate(x, height + size * 0.05, z);
    const tint = palette[Math.floor(random() * palette.length)].clone().multiplyScalar(0.6 + random() * 0.3);
    indexed.computeVertexNormals();
    pieces.push(paintAll(indexed, (color, pointX, pointY, pointZ) => color.copy(tint).multiplyScalar(0.8 + 0.3 * lumpAt(pointX, pointY, pointZ, 4))));
  }
  return pieces;
}

export function createReefProps(scene, world, quality) {
  const detailed = quality.density >= 1;
  const builders = {
    branchCoral: (prop) => buildBranchCoral(prop, detailed ? 6 : 5),
    brainCoral: (prop) => (detailed ? buildBrainCoral(prop, 34, 11) : quality.density >= 0.7 ? buildBrainCoral(prop, 28, 9) : buildBrainCoral(prop, 22, 7)),
    barnacleRock: (prop) => buildBarnacleRock(prop, 2),
    urchin: (prop) => buildUrchin(prop, detailed ? 28 : 20),
  };
  const chunkBuilders = Array.from({ length: REEF_CHUNK_COUNT }, () => []);
  const chunkOf = (x) => THREE.MathUtils.clamp(Math.floor(((x + REEF_CHUNK_SPAN / 2) / REEF_CHUNK_SPAN) * REEF_CHUNK_COUNT), 0, REEF_CHUNK_COUNT - 1);
  for (const [kind, props] of Object.entries(world.reefProps)) {
    for (const prop of props) chunkBuilders[chunkOf(prop.x)].push(() => builders[kind](prop).rotateY(prop.heading).translate(prop.x, prop.y - 0.1, prop.z));
  }
  for (const den of world.morayDens) {
    chunkBuilders[chunkOf(den.x)].push(() => mergeVertices(buildDenGeometry(), 1e-4).scale(MORAY_DEN_SCALE, MORAY_DEN_SCALE, MORAY_DEN_SCALE).translate(den.x, world.heightAt(den.x, den.z), den.z));
  }
  for (const piece of buildRubble(world, quality)) {
    piece.computeBoundingBox();
    chunkBuilders[chunkOf(piece.boundingBox.min.x)].push(() => piece);
  }
  const material = applySeaside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, side: THREE.DoubleSide }), { surface: null, wetDarkening: 0.5, wetRoughness: 0.32, causticStrength: 1.4, chromaticCaustics: quality.chromaticCaustics });
  const meshes = [];
  const built = new Set();
  let reefVisible = true;

  let job = null;

  function finishChunk(index, pieces) {
    built.add(index);
    if (!pieces.length) return;
    const mesh = new THREE.Mesh(mergeGeometries(pieces), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.visible = reefVisible;
    scene.add(mesh);
    meshes.push(mesh);
  }

  function follow(x, { piecesPerFrame = REEF_PIECES_PER_FRAME } = {}) {
    if (!job) {
      const wanted = [chunkOf(x), chunkOf(x - REEF_BUILD_REACH), chunkOf(x + REEF_BUILD_REACH)].find((index) => !built.has(index));
      if (wanted === undefined) return;
      job = { index: wanted, pieces: [], next: 0 };
    }
    const builders = chunkBuilders[job.index];
    const end = Math.min(builders.length, job.next + piecesPerFrame);
    for (; job.next < end; job.next++) job.pieces.push(builders[job.next]());
    if (job.next >= builders.length) {
      finishChunk(job.index, job.pieces);
      job = null;
    }
  }

  function buildAround(x) {
    while (true) {
      follow(x, { piecesPerFrame: Infinity });
      if (!job && [chunkOf(x), chunkOf(x - REEF_BUILD_REACH), chunkOf(x + REEF_BUILD_REACH)].every((index) => built.has(index))) return;
    }
  }

  function setVisible(visible) {
    reefVisible = visible;
    for (const mesh of meshes) mesh.visible = visible;
  }

  return { meshes, setVisible, follow, buildAround };
}
