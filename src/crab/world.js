import * as THREE from 'three';
import { createNoise2D, createRandom, fractalNoise, smoothstep, lerp } from '../noise.js';
import { WORLD_SIZE, applySeaside } from './seaside.js';

export const PLAY_HALF_SIZE = 118;
export const DEEP_WATER_HEIGHT = -6.2;
export const TIDE_MIDDLE = -0.9;
export const TIDE_AMPLITUDE = 1.7;
export const TIDE_PERIOD_SECONDS = 480;

const VISUAL_HALF_SIZE = 190;
const BEACH_SLOPE = 0.055;
const COLLISION_CELLS = 384;
const RETAINED_CELLS = 256;
const NO_RETAINED_WATER = -100;
const MAX_WALKABLE_SLOPE = 1.25;
const RETAINED_BELOW_CREST = 0.5;
const SHORE_DILATION_CELLS = 6;

const POOLS = [
  { x: 18, z: 8, radiusX: 34, radiusZ: 26, floor: -3.5, crest: 0.2, seed: 3.1 },
  { x: -56, z: 34, radiusX: 14, radiusZ: 11, floor: -4.1, crest: -0.85, seed: 8.4 },
  { x: 78, z: 44, radiusX: 11, radiusZ: 9, floor: -4.4, crest: -1.3, seed: 12.7 },
  { x: -50, z: 80, radiusX: 12, radiusZ: 9, floor: -5.4, crest: -1.5, seed: 17.2, onReef: true },
  { x: 20, z: 97, radiusX: 10, radiusZ: 7.5, floor: -5.8, crest: -1.4, seed: 21.9, onReef: true },
  { x: 70, z: 68, radiusX: 9, radiusZ: 8, floor: -5.2, crest: -1.6, seed: 26.3, onReef: true },
];

const REEF_INNER_EDGE_Z = 54;
const REEF_OUTER_EDGE_Z = 106;
const REEF_DROP_LENGTH = 3;
const REEF_EDGE_RAGGEDNESS = 3.2;
const REEF_FLAT_HEIGHT = -2.8;
const REEF_HIGHEST = -1.2;

const BOULDERS = [
  { x: -34, z: -52, radius: 10.5, squash: 0.74, seed: 1 },
  { x: -46, z: -44, radius: 6.2, squash: 0.8, seed: 2 },
  { x: -25, z: -60, radius: 4.4, squash: 0.7, seed: 3 },
  { x: -18, z: 16, radius: 7.5, squash: 0.7, seed: 4 },
  { x: -10, z: 27, radius: 4.6, squash: 0.62, seed: 5 },
  { x: 52, z: -6, radius: 8.6, squash: 0.78, seed: 6 },
  { x: 58, z: 8, radius: 5.2, squash: 0.66, seed: 7 },
  { x: 30, z: 38, radius: 6.4, squash: 0.6, seed: 8 },
  { x: 8, z: -20, radius: 4.8, squash: 0.64, seed: 9 },
  { x: 22, z: 6, radius: 3.6, squash: 0.7, seed: 10 },
  { x: -70, z: 6, radius: 7.8, squash: 0.72, seed: 11 },
  { x: -62, z: 50, radius: 5.4, squash: 0.6, seed: 12 },
  { x: 84, z: 30, radius: 6.8, squash: 0.74, seed: 13 },
  { x: 96, z: -40, radius: 9.4, squash: 0.8, seed: 14 },
  { x: 40, z: 78, radius: 8.8, squash: 0.85, seed: 15 },
  { x: -20, z: 88, radius: 11.5, squash: 0.9, seed: 16 },
  { x: -92, z: 74, radius: 9.2, squash: 0.85, seed: 17 },
  { x: -84, z: -62, radius: 6.6, squash: 0.76, seed: 19 },
  { x: 104, z: 84, radius: 12.5, squash: 0.95, seed: 20 },
];

const DRIFT_LOGS = [
  { x: 28, z: -58, length: 44, radius: 3.1, heading: 0.32, seed: 5 },
  { x: -66, z: -22, length: 28, radius: 2.2, heading: -0.9, seed: 9 },
];

const sandNoise = createNoise2D(7);
const poolNoise = createNoise2D(23);
const reefNoise = createNoise2D(131);

const reefInnerEdgeAt = (x) => REEF_INNER_EDGE_Z + 6 * reefNoise(x * 0.035, 1.7);
const reefOuterEdgeAt = (x) => REEF_OUTER_EDGE_Z + 4 * reefNoise(x * 0.05, 9.3) + 1.6 * reefNoise(x * 0.17, 4.1);

export function reefShareAt(x, z) {
  return smoothstep(reefInnerEdgeAt(x) - 8, reefInnerEdgeAt(x) + 4, z) * (1 - smoothstep(reefOuterEdgeAt(x), reefOuterEdgeAt(x) + 1.5, z));
}

export function isOnReef(x, z) {
  return reefShareAt(x, z) > 0.5;
}

function reefHeight(x, z, beach) {
  const outerEdge = reefOuterEdgeAt(x);
  let flat = REEF_FLAT_HEIGHT + 1.3 * fractalNoise(reefNoise, x * 0.035, z * 0.035, 3) + 0.4 * fractalNoise(reefNoise, x * 0.11 + 30, z * 0.11, 2);
  flat += 0.55 * smoothstep(outerEdge - 12, outerEdge - 3, z) * (0.6 + 0.4 * reefNoise(x * 0.09, 5.5));
  flat = Math.min(flat, REEF_HIGHEST - 0.1 * reefNoise(x * 0.3, z * 0.3));
  const ragged = REEF_EDGE_RAGGEDNESS * fractalNoise(reefNoise, x * 0.14 + 70, z * 0.14, 3);
  const dropShare = smoothstep(outerEdge + ragged, outerEdge + ragged + REEF_DROP_LENGTH * 2.2, z);
  return lerp(flat, Math.min(beach, DEEP_WATER_HEIGHT - 5), dropShare);
}

function beachHeight(x, z) {
  const broad = fractalNoise(sandNoise, x * 0.011, z * 0.011, 3) * 1.5;
  const hummocks = fractalNoise(sandNoise, x * 0.045 + 40, z * 0.045, 2) * 0.32;
  let height = -z * BEACH_SLOPE + broad + hummocks;
  height += smoothstep(-74, -128, z) * (6.5 + 3.5 * fractalNoise(sandNoise, x * 0.02, 9.5, 2));
  height -= smoothstep(82, 126, z) * 7.5;
  const reefBlend = smoothstep(reefInnerEdgeAt(x) - 8, reefInnerEdgeAt(x) + 4, z);
  return reefBlend > 0 ? lerp(height, reefHeight(x, z, height), reefBlend) : height;
}

function poolShape(pool, x, z) {
  const offsetX = x - pool.x;
  const offsetZ = z - pool.z;
  const angle = Math.atan2(offsetZ, offsetX);
  const outline = 1 + 0.2 * poolNoise(Math.cos(angle) * 1.4 + pool.seed, Math.sin(angle) * 1.4) + 0.07 * poolNoise(Math.cos(angle) * 4 + pool.seed, Math.sin(angle) * 4 + 3);
  return Math.hypot(offsetX / pool.radiusX, offsetZ / pool.radiusZ) / outline;
}

export function heightAt(x, z) {
  let height = beachHeight(x, z);
  for (const pool of POOLS) {
    const rimDistance = poolShape(pool, x, z);
    if (rimDistance > 1.45) continue;
    const crest = Math.max(pool.crest + 0.22 * poolNoise(x * 0.09, z * 0.09), height);
    const floor = pool.floor + 0.55 * fractalNoise(poolNoise, x * 0.06 + pool.seed, z * 0.06, 2);
    const basin = lerp(floor, crest, smoothstep(0.38, 1, rimDistance));
    height = lerp(basin, height, smoothstep(1, 1.45, rimDistance));
  }
  return height;
}

function buildCollisionField() {
  const cellSize = WORLD_SIZE / COLLISION_CELLS;
  const samplesPerSide = COLLISION_CELLS + 1;
  const heights = new Float32Array(samplesPerSide * samplesPerSide);
  for (let row = 0; row < samplesPerSide; row++) {
    for (let column = 0; column < samplesPerSide; column++) {
      heights[row * samplesPerSide + column] = heightAt(column * cellSize - WORLD_SIZE / 2, row * cellSize - WORLD_SIZE / 2);
    }
  }
  function sample(x, z) {
    const gridX = Math.min(COLLISION_CELLS - 0.001, Math.max(0, (x + WORLD_SIZE / 2) / cellSize));
    const gridZ = Math.min(COLLISION_CELLS - 0.001, Math.max(0, (z + WORLD_SIZE / 2) / cellSize));
    const column = Math.floor(gridX);
    const row = Math.floor(gridZ);
    const blendX = gridX - column;
    const blendZ = gridZ - row;
    const index = row * samplesPerSide + column;
    const near = heights[index] * (1 - blendX) + heights[index + 1] * blendX;
    const far = heights[index + samplesPerSide] * (1 - blendX) + heights[index + samplesPerSide + 1] * blendX;
    return near * (1 - blendZ) + far * blendZ;
  }
  return { sample };
}

function buildRetainedWater() {
  const cellSize = WORLD_SIZE / RETAINED_CELLS;
  const cellCount = RETAINED_CELLS * RETAINED_CELLS;
  const levels = new Float32Array(cellCount).fill(NO_RETAINED_WATER);
  const submerged = new Float32Array(cellCount);
  const cellCenter = (index) => (index + 0.5) * cellSize - WORLD_SIZE / 2;
  const insideMargin = (cell) => {
    const column = cell % RETAINED_CELLS;
    const row = (cell - column) / RETAINED_CELLS;
    return column > 1 && row > 1 && column < RETAINED_CELLS - 2 && row < RETAINED_CELLS - 2;
  };
  const cellHeight = (cell) => {
    const column = cell % RETAINED_CELLS;
    return heightAt(cellCenter(column), cellCenter((cell - column) / RETAINED_CELLS));
  };
  const pools = [];
  for (const pool of POOLS) {
    const retainedLevel = pool.crest - RETAINED_BELOW_CREST;
    const startColumn = Math.floor((pool.x + WORLD_SIZE / 2) / cellSize);
    const startRow = Math.floor((pool.z + WORLD_SIZE / 2) / cellSize);
    const pending = [startRow * RETAINED_CELLS + startColumn];
    let shoreline = [];
    while (pending.length) {
      const cell = pending.pop();
      if (levels[cell] > NO_RETAINED_WATER || !insideMargin(cell)) continue;
      const column = cell % RETAINED_CELLS;
      const outsideReefRim = pool.onReef && poolShape(pool, cellCenter(column), cellCenter((cell - column) / RETAINED_CELLS)) > 1;
      if (outsideReefRim || cellHeight(cell) > retainedLevel + 0.05) {
        shoreline.push(cell);
        continue;
      }
      levels[cell] = retainedLevel;
      submerged[cell] = 1;
      pending.push(cell + 1, cell - 1, cell + RETAINED_CELLS, cell - RETAINED_CELLS);
    }
    for (let ring = 0; ring < SHORE_DILATION_CELLS; ring++) {
      const nextShoreline = [];
      for (const cell of shoreline) {
        if (levels[cell] > NO_RETAINED_WATER || !insideMargin(cell) || cellHeight(cell) < retainedLevel) continue;
        levels[cell] = retainedLevel;
        nextShoreline.push(cell + 1, cell - 1, cell + RETAINED_CELLS, cell - RETAINED_CELLS);
      }
      shoreline = nextShoreline;
    }
    pools.push({ ...pool, retainedLevel });
  }

  const blurredField = (field) => {
    let current = field;
    for (let pass = 0; pass < 3; pass++) {
      const blurred = new Float32Array(cellCount);
      for (let row = 3; row < RETAINED_CELLS - 3; row++) {
        for (let column = 3; column < RETAINED_CELLS - 3; column++) {
          let sum = 0;
          for (let offsetRow = -2; offsetRow <= 2; offsetRow++) {
            for (let offsetColumn = -2; offsetColumn <= 2; offsetColumn++) sum += current[(row + offsetRow) * RETAINED_CELLS + column + offsetColumn];
          }
          blurred[row * RETAINED_CELLS + column] = sum / 25;
        }
      }
      current = blurred;
    }
    return current;
  };
  const influence = blurredField(submerged);
  const weightedLevel = blurredField(submerged.map((isSubmerged, cell) => (isSubmerged ? levels[cell] : 0)));

  const packed = new Uint16Array(cellCount * 4);
  for (let cell = 0; cell < cellCount; cell++) {
    packed[cell * 4] = THREE.DataUtils.toHalfFloat(levels[cell]);
    packed[cell * 4 + 1] = THREE.DataUtils.toHalfFloat(influence[cell]);
    packed[cell * 4 + 2] = THREE.DataUtils.toHalfFloat(influence[cell] > 0.001 ? weightedLevel[cell] / influence[cell] : NO_RETAINED_WATER);
  }
  const texture = new THREE.DataTexture(packed, RETAINED_CELLS, RETAINED_CELLS, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  function levelAt(x, z) {
    const column = Math.floor((x + WORLD_SIZE / 2) / cellSize);
    const row = Math.floor((z + WORLD_SIZE / 2) / cellSize);
    if (column < 0 || row < 0 || column >= RETAINED_CELLS || row >= RETAINED_CELLS) return NO_RETAINED_WATER;
    return levels[row * RETAINED_CELLS + column];
  }
  return { texture, levelAt, pools };
}

const linearColor = (red, green, blue) => new THREE.Color().setRGB(red, green, blue, THREE.SRGBColorSpace);
const DRY_SAND = linearColor(0.9, 0.78, 0.58);
const BLEACHED_SAND = linearColor(0.96, 0.9, 0.76);
const TIDAL_SAND = linearColor(0.8, 0.68, 0.5);
const POOL_SAND = linearColor(0.82, 0.76, 0.56);
const POOL_ALGAE = linearColor(0.36, 0.44, 0.2);
const POOL_CORALLINE = linearColor(0.8, 0.5, 0.52);
const DEEP_SILT = linearColor(0.5, 0.52, 0.42);
const REEF_LIMESTONE = linearColor(0.6, 0.57, 0.5);
const REEF_CORALLINE = linearColor(0.8, 0.46, 0.5);
const REEF_TURF = linearColor(0.36, 0.4, 0.22);
const REEF_SAND = linearColor(0.88, 0.82, 0.66);
const REEF_LIP = linearColor(0.86, 0.8, 0.7);
const reefColor = new THREE.Color();

function buildTerrainMesh(ground, boulders, logs, quality) {
  const cellsPerSide = Math.round((VISUAL_HALF_SIZE * 2) / quality.terrainCellSize);
  const cellSize = (VISUAL_HALF_SIZE * 2) / cellsPerSide;
  const samplesPerSide = cellsPerSide + 1;
  const positions = new Float32Array(samplesPerSide * samplesPerSide * 3);
  const colors = new Float32Array(samplesPerSide * samplesPerSide * 3);
  const heights = new Float32Array(samplesPerSide * samplesPerSide);
  const tintNoise = createNoise2D(91);
  const color = new THREE.Color();
  for (let row = 0; row < samplesPerSide; row++) {
    for (let column = 0; column < samplesPerSide; column++) {
      const x = column * cellSize - VISUAL_HALF_SIZE;
      const z = row * cellSize - VISUAL_HALF_SIZE;
      const height = heightAt(x, z);
      const index = row * samplesPerSide + column;
      heights[index] = height;
      positions[index * 3] = x;
      positions[index * 3 + 1] = height;
      positions[index * 3 + 2] = z;

      const patch = fractalNoise(tintNoise, x * 0.05, z * 0.05, 3);
      color.copy(DRY_SAND).lerp(BLEACHED_SAND, smoothstep(2.5, 7, height) * 0.8 + patch * 0.15);
      color.lerp(TIDAL_SAND, smoothstep(1.2, -1.2, height) * 0.75);
      const reefShare = reefShareAt(x, z) * (1 - smoothstep(-4, -7, height));
      if (reefShare > 0) {
        const reefPatch = fractalNoise(tintNoise, x * 0.21 + 70, z * 0.21, 3);
        reefColor.copy(REEF_LIMESTONE).lerp(REEF_CORALLINE, smoothstep(0.12, 0.42, reefPatch) * 0.5);
        reefColor.lerp(REEF_TURF, smoothstep(-0.05, 0.35, -reefPatch) * 0.75);
        reefColor.lerp(REEF_SAND, smoothstep(-3.1, -3.5, height) * 0.7);
        color.lerp(reefColor, reefShare * 0.9);
      }
      const outerEdge = reefOuterEdgeAt(x);
      const lipShare = smoothstep(outerEdge - 3, outerEdge - 0.5, z) * (1 - smoothstep(outerEdge - 0.5, outerEdge + 0.5, z));
      color.lerp(REEF_LIP, lipShare * 0.7 * smoothstep(40, 60, z));
      color.multiplyScalar(1 - 0.55 * smoothstep(outerEdge, outerEdge + 2.5, z) * smoothstep(40, 60, z));
      const submergedInPool = ground.retained.levelAt(x, z) - height;
      if (submergedInPool > 0) {
        const poolDepth = smoothstep(0, 2.2, submergedInPool);
        color.lerp(POOL_SAND, poolDepth * 0.8);
        color.lerp(POOL_ALGAE, smoothstep(0.25, 0.6, patch) * poolDepth * 0.55);
        color.lerp(POOL_CORALLINE, smoothstep(0.2, 0.5, -patch) * poolDepth * 0.55);
      }
      color.lerp(DEEP_SILT, smoothstep(-3.5, -8, height) * (submergedInPool > 0 ? 0 : 0.8));

      let contactShade = 1;
      for (const boulder of boulders) {
        const distance = Math.hypot(x - boulder.x, z - boulder.z);
        contactShade *= 1 - 0.5 * smoothstep(boulder.radius * 1.3, boulder.radius * 0.7, distance);
      }
      for (const log of logs) {
        const along = THREE.MathUtils.clamp((x - log.x) * Math.cos(log.heading) + (z - log.z) * Math.sin(log.heading), -log.length / 2, log.length / 2);
        const distance = Math.hypot(x - log.x - Math.cos(log.heading) * along, z - log.z - Math.sin(log.heading) * along);
        contactShade *= 1 - 0.45 * smoothstep(log.radius * 1.8, log.radius * 0.6, distance);
      }
      colors[index * 3] = color.r * contactShade;
      colors[index * 3 + 1] = color.g * contactShade;
      colors[index * 3 + 2] = color.b * contactShade;
    }
  }
  const normals = new Float32Array(samplesPerSide * samplesPerSide * 3);
  const normal = new THREE.Vector3();
  for (let row = 0; row < samplesPerSide; row++) {
    for (let column = 0; column < samplesPerSide; column++) {
      const index = row * samplesPerSide + column;
      const west = heights[row * samplesPerSide + Math.max(0, column - 1)];
      const east = heights[row * samplesPerSide + Math.min(cellsPerSide, column + 1)];
      const north = heights[Math.max(0, row - 1) * samplesPerSide + column];
      const south = heights[Math.min(cellsPerSide, row + 1) * samplesPerSide + column];
      normal.set(west - east, 2 * cellSize, north - south).normalize();
      normals[index * 3] = normal.x;
      normals[index * 3 + 1] = normal.y;
      normals[index * 3 + 2] = normal.z;
    }
  }
  const indices = new Uint32Array(cellsPerSide * cellsPerSide * 6);
  let write = 0;
  for (let row = 0; row < cellsPerSide; row++) {
    for (let column = 0; column < cellsPerSide; column++) {
      const corner = row * samplesPerSide + column;
      indices[write++] = corner;
      indices[write++] = corner + samplesPerSide;
      indices[write++] = corner + 1;
      indices[write++] = corner + 1;
      indices[write++] = corner + samplesPerSide;
      indices[write++] = corner + samplesPerSide + 1;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  const material = applySeaside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 }), { surface: 'sand', wetDarkening: 0.6, wetRoughness: 0.42, wetGloss: 0.42, chromaticCaustics: quality.chromaticCaustics });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = quality.terrainShadows;
  return mesh;
}

const REEF_PROP_KINDS = [
  { kind: 'brainCoral', count: 30, radius: [1.0, 2.3], blockShare: 0.95 },
  { kind: 'barnacleRock', count: 26, radius: [0.9, 2.0], blockShare: 0.95 },
  { kind: 'branchCoral', count: 72, radius: [0.8, 2.0], blockShare: 0.7 },
  { kind: 'urchin', count: 40, radius: [0.5, 0.75], blockShare: 1.6 },
];
const REEF_PROP_CLEARANCE = 2.2;
export const LOBSTER_LAIR = { x: -62, z: 96, territoryRadius: 13 };
const REEF_PROP_KEEP_CLEAR = [{ x: 14, z: 57, radius: 5 }, { x: LOBSTER_LAIR.x, z: LOBSTER_LAIR.z, radius: 9 }];
const MORAY_DEN_COUNT = 4;
const MORAY_DEN_SPACING = 30;

function placeReefProps(sampleHeight, boulders) {
  const random = createRandom(5150);
  const placed = [];
  const props = {};
  for (const definition of REEF_PROP_KINDS) {
    props[definition.kind] = [];
    for (let attempt = 0; attempt < definition.count * 60 && props[definition.kind].length < definition.count; attempt++) {
      const x = (random() * 2 - 1) * (PLAY_HALF_SIZE - 6);
      const z = REEF_INNER_EDGE_Z - 4 + random() * (REEF_OUTER_EDGE_Z - REEF_INNER_EDGE_Z + 4);
      const radius = lerp(definition.radius[0], definition.radius[1], random());
      if (!isOnReef(x, z) || z > reefOuterEdgeAt(x) - 2) continue;
      const height = sampleHeight(x, z);
      if (height < -3.4 || height > REEF_HIGHEST + 0.2) continue;
      if (boulders.some((boulder) => Math.hypot(x - boulder.x, z - boulder.z) < boulder.radius + radius + 2)) continue;
      if (REEF_PROP_KEEP_CLEAR.some((spot) => Math.hypot(x - spot.x, z - spot.z) < spot.radius + radius)) continue;
      if (placed.some((other) => Math.hypot(x - other.x, z - other.z) < other.radius + radius + REEF_PROP_CLEARANCE)) continue;
      const prop = { kind: definition.kind, x, z, y: height, radius, blockRadius: radius * definition.blockShare, heading: random() * Math.PI * 2, seed: random() * 1000, tone: random() };
      placed.push(prop);
      props[definition.kind].push(prop);
    }
  }
  return props;
}

function placeMorayDens(props) {
  const dens = [];
  const hosts = [...props.barnacleRock, ...props.brainCoral].sort((first, second) => first.seed - second.seed);
  const everyProp = Object.values(props).flat();
  for (const host of hosts) {
    if (dens.length >= MORAY_DEN_COUNT) break;
    for (let turn = 0; turn < 8; turn++) {
      const angle = host.heading + turn * (Math.PI / 4);
      const x = host.x + Math.cos(angle) * (host.radius + 1.3);
      const z = host.z + Math.sin(angle) * (host.radius + 1.3);
      if (!isOnReef(x, z) || z < 66 || z > reefOuterEdgeAt(x) - 4) continue;
      if (everyProp.some((prop) => prop !== host && Math.hypot(prop.x - x, prop.z - z) < prop.radius + 1.6)) continue;
      if (dens.some((den) => Math.hypot(den.x - x, den.z - z) < MORAY_DEN_SPACING)) continue;
      if (Math.hypot(x - LOBSTER_LAIR.x, z - LOBSTER_LAIR.z) < LOBSTER_LAIR.territoryRadius + 6) continue;
      dens.push({ x, z, host });
      break;
    }
  }
  return dens;
}

export const CAMP = { x: -88, z: -62, radius: 36 };
export const CAT_LAIR = { x: -97, z: -63, territoryRadius: 17 };

export const CAMP_PROPS = [
  { kind: 'campfire', x: -101, z: -46, radius: 8 },
  { kind: 'barrel', x: -68, z: -76, radius: 6, height: 18 },
  { kind: 'barrelLying', x: -60, z: -52, radius: 5.5, length: 17, heading: 0.5 },
  { kind: 'crate', x: -112, z: -72, size: 13, heading: 0.25 },
  { kind: 'bottle', x: -79, z: -40, length: 7, radius: 1.6, heading: 1.1 },
  { kind: 'bottle', x: -66, z: -86, length: 7, radius: 1.6, heading: -0.4 },
  { kind: 'cutlass', x: -67, z: -37, height: 17, heading: 0.3 },
  { kind: 'boot', x: -113, z: -45, length: 14, heading: 0.9 },
  { kind: 'hat', x: -90, z: -35, radius: 7.5, heading: 0.6 },
  { kind: 'tent', x: -99, z: -93, width: 42, height: 22, heading: 0 },
  { kind: 'chest', x: -103, z: -70, width: 12, depth: 8, height: 7, heading: -0.35 },
  { kind: 'rope', x: -55, z: -66, radius: 5 },
];

const CAMP_BLOCKERS = {
  campfire: (prop) => [{ x: prop.x, z: prop.z, radius: prop.radius + 1.2 }],
  barrel: (prop) => [{ x: prop.x, z: prop.z, radius: prop.radius + 0.6 }],
  barrelLying: (prop) => [-0.5, -0.25, 0, 0.25, 0.5].map((share) => ({ x: prop.x + Math.sin(prop.heading) * prop.length * share, z: prop.z + Math.cos(prop.heading) * prop.length * share, radius: prop.radius + 0.4 })),
  crate: (prop) => [{ x: prop.x, z: prop.z, radius: prop.size * 0.72 }],
  bottle: (prop) => [-0.35, 0, 0.35].map((share) => ({ x: prop.x + Math.sin(prop.heading) * prop.length * share, z: prop.z + Math.cos(prop.heading) * prop.length * share, radius: prop.radius + 0.5 })),
  cutlass: (prop) => [{ x: prop.x, z: prop.z, radius: 1.6 }],
  boot: (prop) => [-0.35, 0, 0.3].map((share) => ({ x: prop.x + Math.sin(prop.heading) * prop.length * share, z: prop.z + Math.cos(prop.heading) * prop.length * share, radius: 4 })),
  hat: (prop) => [{ x: prop.x, z: prop.z, radius: prop.radius }],
  tent: (prop) => Array.from({ length: 23 }, (_, index) => ({ x: prop.x - prop.width / 2 + (index / 22) * prop.width, z: prop.z, radius: 2.2 })),
  chest: (prop) => [-0.3, 0.3].map((share) => ({ x: prop.x + Math.cos(prop.heading) * prop.width * share, z: prop.z - Math.sin(prop.heading) * prop.width * share, radius: 5 })),
  rope: (prop) => [{ x: prop.x, z: prop.z, radius: prop.radius + 0.5 }],
};

export const HOLD = { x: 74, z: -66, halfLength: 42, halfWidth: 28, entranceAngle: Math.PI * 0.6, entranceHalfAngle: 0.22 };
export const COOK_SPOT = { x: 101, z: -60, territoryRadius: 20 };

export const HOLD_PROPS = [
  { kind: 'crate', x: 47, z: -78, size: 9, heading: 0.4 },
  { kind: 'crate', x: 60, z: -86, size: 7, heading: -0.2 },
  { kind: 'sack', x: 44, z: -57, radius: 3.6, heading: 0.3 },
  { kind: 'sack', x: 53, z: -48, radius: 3.2, heading: 1.2 },
  { kind: 'sack', x: 80, z: -84, radius: 3.4, heading: 2.0 },
  { kind: 'barrel', x: 92, z: -86, radius: 4.2, height: 12 },
  { kind: 'lantern', x: 71, z: -66, height: 16 },
  { kind: 'hearth', x: 107, z: -75, radius: 5 },
  { kind: 'choppingBlock', x: 89, z: -46, radius: 3.4 },
  { kind: 'fishBones', x: 59, z: -63, length: 8, heading: 0.8 },
  { kind: 'onions', x: 66, z: -80, radius: 2.2 },
];

const COOK_STATION_GAP = { hearth: 8, choppingBlock: 8.5, barrel: 11 };
const COOK_ACTIVITY = { hearth: 'grumble', choppingBlock: 'chop', barrel: 'chop' };

export const COOK_STATIONS = HOLD_PROPS.filter((prop) => COOK_ACTIVITY[prop.kind]).map((prop) => {
  const towardCenterX = HOLD.x - prop.x;
  const towardCenterZ = HOLD.z - prop.z;
  const length = Math.hypot(towardCenterX, towardCenterZ);
  const distance = prop.radius + COOK_STATION_GAP[prop.kind];
  const x = prop.x + (towardCenterX / length) * distance;
  const z = prop.z + (towardCenterZ / length) * distance;
  return { x, z, heading: Math.atan2(prop.x - x, prop.z - z), activity: COOK_ACTIVITY[prop.kind] };
});

export const HOLD_EXIT = { x: HOLD.x + Math.cos(HOLD.entranceAngle) * (HOLD.halfLength + 6), z: HOLD.z + Math.sin(HOLD.entranceAngle) * (HOLD.halfWidth + 6) };

const HOLD_WALL_STEP = 0.07;

export function holdWallDiscs() {
  const discs = [];
  for (let angle = 0; angle < Math.PI * 2; angle += HOLD_WALL_STEP) {
    const fromEntrance = Math.abs(Math.atan2(Math.sin(angle - HOLD.entranceAngle), Math.cos(angle - HOLD.entranceAngle)));
    if (fromEntrance < HOLD.entranceHalfAngle) continue;
    discs.push({ x: HOLD.x + Math.cos(angle) * HOLD.halfLength, z: HOLD.z + Math.sin(angle) * HOLD.halfWidth, radius: 1.8, angle });
  }
  return discs;
}

const HOLD_BLOCKERS = {
  crate: (prop) => [{ x: prop.x, z: prop.z, radius: prop.size * 0.72 }],
  sack: (prop) => [{ x: prop.x, z: prop.z, radius: prop.radius + 0.4 }],
  barrel: (prop) => [{ x: prop.x, z: prop.z, radius: prop.radius + 0.6 }],
  lantern: (prop) => [{ x: prop.x, z: prop.z, radius: 1.6 }],
  hearth: (prop) => [{ x: prop.x, z: prop.z, radius: prop.radius + 1 }],
  choppingBlock: (prop) => [{ x: prop.x, z: prop.z, radius: prop.radius + 0.5 }],
  fishBones: (prop) => [-0.4, 0, 0.4].map((share) => ({ x: prop.x + Math.cos(prop.heading) * prop.length * share, z: prop.z - Math.sin(prop.heading) * prop.length * share, radius: 1.3 })),
  onions: (prop) => [{ x: prop.x, z: prop.z, radius: prop.radius + 0.6 }],
};

export function isInHold(x, z) {
  const dx = (x - HOLD.x) / HOLD.halfLength;
  const dz = (z - HOLD.z) / HOLD.halfWidth;
  return dx * dx + dz * dz < 0.92;
}

export function isInCamp(x, z) {
  return Math.hypot(x - CAMP.x, z - CAMP.z) < CAMP.radius && z > -91;
}

function buildWalkability(ground, boulders, logs, reefProps) {
  const cellsPerSide = WORLD_SIZE;
  const walkable = new Uint8Array(cellsPerSide * cellsPerSide);
  for (let row = 0; row < cellsPerSide; row++) {
    for (let column = 0; column < cellsPerSide; column++) {
      const x = column + 0.5 - WORLD_SIZE / 2;
      const z = row + 0.5 - WORLD_SIZE / 2;
      if (Math.abs(x) > PLAY_HALF_SIZE || Math.abs(z) > PLAY_HALF_SIZE) continue;
      const height = ground.heightAt(x, z);
      if (height < DEEP_WATER_HEIGHT) continue;
      const slope = Math.hypot(ground.heightAt(x + 0.6, z) - ground.heightAt(x - 0.6, z), ground.heightAt(x, z + 0.6) - ground.heightAt(x, z - 0.6)) / 1.2;
      if (slope > MAX_WALKABLE_SLOPE) continue;
      walkable[row * cellsPerSide + column] = 1;
    }
  }
  const blockDisc = (centerX, centerZ, radius) => {
    for (let row = Math.floor(centerZ - radius + WORLD_SIZE / 2); row <= Math.ceil(centerZ + radius + WORLD_SIZE / 2); row++) {
      for (let column = Math.floor(centerX - radius + WORLD_SIZE / 2); column <= Math.ceil(centerX + radius + WORLD_SIZE / 2); column++) {
        if (row < 0 || column < 0 || row >= cellsPerSide || column >= cellsPerSide) continue;
        if (Math.hypot(column + 0.5 - WORLD_SIZE / 2 - centerX, row + 0.5 - WORLD_SIZE / 2 - centerZ) < radius) walkable[row * cellsPerSide + column] = 0;
      }
    }
  };
  for (const boulder of boulders) blockDisc(boulder.x, boulder.z, boulder.radius * 0.92 + 0.6);
  for (const log of logs) {
    for (let along = -log.length / 2; along <= log.length / 2; along += 1) blockDisc(log.x + Math.cos(log.heading) * along, log.z + Math.sin(log.heading) * along, log.radius + 0.5);
  }
  for (const prop of Object.values(reefProps).flat()) blockDisc(prop.x, prop.z, prop.blockRadius);
  for (const prop of CAMP_PROPS) for (const disc of CAMP_BLOCKERS[prop.kind](prop)) blockDisc(disc.x, disc.z, disc.radius);
  for (const prop of HOLD_PROPS) for (const disc of HOLD_BLOCKERS[prop.kind](prop)) blockDisc(disc.x, disc.z, disc.radius);
  for (const disc of holdWallDiscs()) blockDisc(disc.x, disc.z, disc.radius);
  blockDisc(COOK_SPOT.x + 2, COOK_SPOT.z - 1, 3.2);
  return walkable;
}

export function createWorld(quality) {
  const collisionField = buildCollisionField();
  const retained = buildRetainedWater();
  const ground = { heightAt: collisionField.sample, retained };
  const boulders = BOULDERS.map((boulder) => ({ ...boulder, y: collisionField.sample(boulder.x, boulder.z) - boulder.radius * boulder.squash * 0.22 }));
  const logs = DRIFT_LOGS.map((log) => ({ ...log, y: collisionField.sample(log.x, log.z) }));
  const reefProps = placeReefProps(collisionField.sample, boulders);
  const morayDens = placeMorayDens(reefProps);
  const terrainMesh = buildTerrainMesh(ground, boulders, logs, quality);
  const walkable = buildWalkability(ground, boulders, logs, reefProps);

  function isWalkable(x, z) {
    const column = Math.floor(x + WORLD_SIZE / 2);
    const row = Math.floor(z + WORLD_SIZE / 2);
    if (column < 0 || row < 0 || column >= WORLD_SIZE || row >= WORLD_SIZE) return false;
    return walkable[row * WORLD_SIZE + column] === 1;
  }

  function waterLevelAt(x, z, seaLevel) {
    return Math.max(seaLevel, retained.levelAt(x, z));
  }

  function blockCircle(x, z, radius) {
    const blocked = [];
    for (let row = Math.floor(z - radius + WORLD_SIZE / 2); row <= Math.ceil(z + radius + WORLD_SIZE / 2); row++) {
      for (let column = Math.floor(x - radius + WORLD_SIZE / 2); column <= Math.ceil(x + radius + WORLD_SIZE / 2); column++) {
        if (column < 0 || row < 0 || column >= WORLD_SIZE || row >= WORLD_SIZE) continue;
        const index = row * WORLD_SIZE + column;
        if (walkable[index] === 1 && Math.hypot(column + 0.5 - WORLD_SIZE / 2 - x, row + 0.5 - WORLD_SIZE / 2 - z) < radius) {
          walkable[index] = 0;
          blocked.push(index);
        }
      }
    }
    return blocked;
  }

  function unblockCells(blocked) {
    for (const index of blocked) walkable[index] = 1;
  }

  function randomSpot(random, accept, attempts = 400) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      const x = (random() * 2 - 1) * PLAY_HALF_SIZE;
      const z = (random() * 2 - 1) * PLAY_HALF_SIZE;
      if (!isWalkable(x, z)) continue;
      const height = collisionField.sample(x, z);
      if (accept(x, z, height)) return { x, z, y: height };
    }
    return null;
  }

  return { ground, heightAt: collisionField.sample, retained, pools: retained.pools, boulders, logs, reefProps, morayDens, campProps: CAMP_PROPS, holdProps: HOLD_PROPS, isInHold, isInCamp, terrainMesh, walkable, isWalkable, isOnReef, waterLevelAt, randomSpot, createRandom, blockCircle, unblockCells };
}

const GULL_TERRITORY_EDGE_Z = -92;
const HIGH_TIDE_MARK = TIDE_MIDDLE + TIDE_AMPLITUDE;

export const HOME_BEACH_ENEMIES = [
  { kind: 'sandHopper', count: 10, packSize: [3, 4], accept: (world, x, z, height) => height > HIGH_TIDE_MARK + 0.6 && z > -74 && !isInCamp(x, z) && Math.hypot(x - HOLD.x, z - HOLD.z) > HOLD.halfLength + 6 && Math.hypot(x - CAMP.x, z - CAMP.z) > CAMP.radius + 8 && world.retained.levelAt(x, z) < height },
  { kind: 'shoreCrab', count: 4, accept: (world, x, z, height) => { if (isOnReef(x, z)) return false; const depth = world.retained.levelAt(x, z) - height; return depth > 0.3 && depth < 1.6; } },
  { kind: 'gull', count: 1, accept: (world, x, z) => z < -97 && z > -103 && Math.abs(x) < 40, territory: (x, z) => z < GULL_TERRITORY_EDGE_Z },
  { kind: 'rivalHermit', count: 3, accept: (world, x, z, height) => !isOnReef(x, z) && height > HIGH_TIDE_MARK && height < HIGH_TIDE_MARK + 3 && z > -74 && !isInCamp(x, z) && Math.hypot(x - HOLD.x, z - HOLD.z) > HOLD.halfLength + 6 && Math.hypot(x - CAMP.x, z - CAMP.z) > CAMP.radius + 8 && world.retained.levelAt(x, z) < height },
  { kind: 'rivalHermit', count: 1, accept: (world, x, z, height) => isOnReef(x, z) && height > -2 && awayFromLair(x, z, 6) },
];

const awayFromLair = (x, z, margin) => Math.hypot(x - LOBSTER_LAIR.x, z - LOBSTER_LAIR.z) > LOBSTER_LAIR.territoryRadius + margin;

export const REEF_ENEMIES = [
  { kind: 'moray', count: MORAY_DEN_COUNT, spotsFrom: (world) => world.morayDens, accept: () => true },
  { kind: 'octopus', count: 2, accept: (world, x, z, height) => isOnReef(x, z) && z > 68 && height < -2.5 && awayFromLair(x, z, 4) },
  { kind: 'mantisShrimp', count: 4, accept: (world, x, z, height) => isOnReef(x, z) && z > 64 && height > -3.2 && awayFromLair(x, z, 4) },
  { kind: 'giantLobster', count: 1, spotsFrom: () => [LOBSTER_LAIR], accept: (world, x, z) => !awayFromLair(x, z, -LOBSTER_LAIR.territoryRadius + 4), territory: (x, z) => !awayFromLair(x, z, 0) },
];

const awayFromCatLair = (x, z, margin) => Math.hypot(x - CAT_LAIR.x, z - CAT_LAIR.z) > CAT_LAIR.territoryRadius + margin;

export const CAMP_ENEMIES = [
  { kind: 'rat', count: 4, packSize: [2, 2], accept: (world, x, z) => isInCamp(x, z) && awayFromCatLair(x, z, 2) },
  { kind: 'shipCat', count: 1, spotsFrom: () => [CAT_LAIR], accept: (world, x, z) => !awayFromCatLair(x, z, -CAT_LAIR.territoryRadius + 5), territory: (x, z) => !awayFromCatLair(x, z, 0) },
];

const awayFromCook = (x, z, margin) => Math.hypot(x - COOK_SPOT.x, z - COOK_SPOT.z) > COOK_SPOT.territoryRadius + margin;

export const HOLD_ENEMIES = [
  { kind: 'cockroach', count: 6, packSize: [3, 3], accept: (world, x, z) => isInHold(x, z) && awayFromCook(x, z, -8) },
  { kind: 'rat', count: 2, packSize: [2, 2], accept: (world, x, z) => isInHold(x, z) && awayFromCook(x, z, -6) },
  { kind: 'cook', count: 1, spotsFrom: () => [COOK_SPOT], accept: (world, x, z) => Math.hypot(x - COOK_SPOT.x, z - COOK_SPOT.z) < 1, territory: (x, z) => isInHold(x, z), stations: COOK_STATIONS, exit: HOLD_EXIT },
];
