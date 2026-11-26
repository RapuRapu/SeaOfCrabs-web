import * as THREE from 'three';
import { createNoise2D, createRandom, fractalNoise, smoothstep, lerp } from '../noise.js';
import { WORLD_BOUNDS, PLAY_BOUNDS, boundsWidth, boundsDepth } from './worldBounds.js';
import { createTerrain } from './terrain.js';

export { WORLD_BOUNDS, PLAY_BOUNDS };
export const DEEP_WATER_HEIGHT = -6.2;
export const TIDE_MIDDLE = -0.9;
export const TIDE_AMPLITUDE = 1.7;
export const TIDE_PERIOD_SECONDS = 480;

const BEACH_SLOPE = 0.055;
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
export const reefOuterEdgeAt = (x) => REEF_OUTER_EDGE_Z + 4 * reefNoise(x * 0.05, 9.3) + 1.6 * reefNoise(x * 0.17, 4.1);

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

const COLLISION_CELL_SIZE = 256 / 384;
const COLLISION_CHUNK_CELLS = 48;
const RETAINED_CELL_SIZE = 1;
const WALK_CHUNK_CELLS = 32;

function buildCollisionField() {
  const cellSize = COLLISION_CELL_SIZE;
  const columns = Math.round(boundsWidth(WORLD_BOUNDS) / cellSize);
  const rows = Math.round(boundsDepth(WORLD_BOUNDS) / cellSize);
  const chunkColumns = Math.ceil(columns / COLLISION_CHUNK_CELLS);
  const chunkRows = Math.ceil(rows / COLLISION_CHUNK_CELLS);
  const samplesPerChunkSide = COLLISION_CHUNK_CELLS + 1;
  const chunks = new Array(chunkColumns * chunkRows).fill(null);

  function computeChunk(chunkColumn, chunkRow) {
    const heights = new Float32Array(samplesPerChunkSide * samplesPerChunkSide);
    for (let localRow = 0; localRow < samplesPerChunkSide; localRow++) {
      const z = (chunkRow * COLLISION_CHUNK_CELLS + localRow) * cellSize + WORLD_BOUNDS.minZ;
      for (let localColumn = 0; localColumn < samplesPerChunkSide; localColumn++) {
        heights[localRow * samplesPerChunkSide + localColumn] = heightAt((chunkColumn * COLLISION_CHUNK_CELLS + localColumn) * cellSize + WORLD_BOUNDS.minX, z);
      }
    }
    return heights;
  }

  function chunkHeights(chunkColumn, chunkRow) {
    const index = chunkRow * chunkColumns + chunkColumn;
    return chunks[index] || (chunks[index] = computeChunk(chunkColumn, chunkRow));
  }

  function sample(x, z) {
    const gridX = Math.min(columns - 0.001, Math.max(0, (x - WORLD_BOUNDS.minX) / cellSize));
    const gridZ = Math.min(rows - 0.001, Math.max(0, (z - WORLD_BOUNDS.minZ) / cellSize));
    const column = Math.floor(gridX);
    const row = Math.floor(gridZ);
    const blendX = gridX - column;
    const blendZ = gridZ - row;
    const chunkColumn = Math.floor(column / COLLISION_CHUNK_CELLS);
    const chunkRow = Math.floor(row / COLLISION_CHUNK_CELLS);
    const heights = chunkHeights(chunkColumn, chunkRow);
    const index = (row - chunkRow * COLLISION_CHUNK_CELLS) * samplesPerChunkSide + (column - chunkColumn * COLLISION_CHUNK_CELLS);
    const near = heights[index] * (1 - blendX) + heights[index + 1] * blendX;
    const far = heights[index + samplesPerChunkSide] * (1 - blendX) + heights[index + samplesPerChunkSide + 1] * blendX;
    return near * (1 - blendZ) + far * blendZ;
  }

  function prepareAround(x, z, radius, maximumChunks) {
    let computed = 0;
    const span = COLLISION_CHUNK_CELLS * cellSize;
    const firstColumn = Math.max(0, Math.floor((x - radius - WORLD_BOUNDS.minX) / span));
    const lastColumn = Math.min(chunkColumns - 1, Math.floor((x + radius - WORLD_BOUNDS.minX) / span));
    const firstRow = Math.max(0, Math.floor((z - radius - WORLD_BOUNDS.minZ) / span));
    const lastRow = Math.min(chunkRows - 1, Math.floor((z + radius - WORLD_BOUNDS.minZ) / span));
    for (let chunkRow = firstRow; chunkRow <= lastRow; chunkRow++) {
      for (let chunkColumn = firstColumn; chunkColumn <= lastColumn; chunkColumn++) {
        if (chunks[chunkRow * chunkColumns + chunkColumn]) continue;
        if (computed >= maximumChunks) return computed;
        chunkHeights(chunkColumn, chunkRow);
        computed++;
      }
    }
    return computed;
  }

  const computedChunkCount = () => chunks.filter(Boolean).length;
  return { sample, prepareAround, computedChunkCount };
}

function createCellGrid(bounds, cellSize) {
  const columns = Math.round(boundsWidth(bounds) / cellSize);
  const rows = Math.round(boundsDepth(bounds) / cellSize);
  return {
    columns,
    rows,
    cellSize,
    cellCount: columns * rows,
    columnOf: (x) => Math.floor((x - bounds.minX) / cellSize),
    rowOf: (z) => Math.floor((z - bounds.minZ) / cellSize),
    centerX: (column) => (column + 0.5) * cellSize + bounds.minX,
    centerZ: (row) => (row + 0.5) * cellSize + bounds.minZ,
    contains: (column, row) => column >= 0 && row >= 0 && column < columns && row < rows,
  };
}

function buildRetainedWater() {
  const grid = createCellGrid(WORLD_BOUNDS, RETAINED_CELL_SIZE);
  const { columns, rows, cellCount } = grid;
  const levels = new Float32Array(cellCount).fill(NO_RETAINED_WATER);
  const submerged = new Float32Array(cellCount);
  const insideMargin = (cell) => {
    const column = cell % columns;
    const row = (cell - column) / columns;
    return column > 1 && row > 1 && column < columns - 2 && row < rows - 2;
  };
  const cellHeight = (cell) => {
    const column = cell % columns;
    return heightAt(grid.centerX(column), grid.centerZ((cell - column) / columns));
  };
  const pools = [];
  const touchedAreas = [];
  for (const pool of POOLS) {
    const retainedLevel = pool.crest - RETAINED_BELOW_CREST;
    const pending = [grid.rowOf(pool.z) * columns + grid.columnOf(pool.x)];
    const area = { firstColumn: Infinity, lastColumn: -Infinity, firstRow: Infinity, lastRow: -Infinity };
    const touch = (cell) => {
      const column = cell % columns;
      const row = (cell - column) / columns;
      area.firstColumn = Math.min(area.firstColumn, column);
      area.lastColumn = Math.max(area.lastColumn, column);
      area.firstRow = Math.min(area.firstRow, row);
      area.lastRow = Math.max(area.lastRow, row);
    };
    let shoreline = [];
    while (pending.length) {
      const cell = pending.pop();
      if (levels[cell] > NO_RETAINED_WATER || !insideMargin(cell)) continue;
      const column = cell % columns;
      const outsideReefRim = pool.onReef && poolShape(pool, grid.centerX(column), grid.centerZ((cell - column) / columns)) > 1;
      if (outsideReefRim || cellHeight(cell) > retainedLevel + 0.05) {
        shoreline.push(cell);
        continue;
      }
      levels[cell] = retainedLevel;
      submerged[cell] = 1;
      touch(cell);
      pending.push(cell + 1, cell - 1, cell + columns, cell - columns);
    }
    for (let ring = 0; ring < SHORE_DILATION_CELLS; ring++) {
      const nextShoreline = [];
      for (const cell of shoreline) {
        if (levels[cell] > NO_RETAINED_WATER || !insideMargin(cell) || cellHeight(cell) < retainedLevel) continue;
        levels[cell] = retainedLevel;
        touch(cell);
        nextShoreline.push(cell + 1, cell - 1, cell + columns, cell - columns);
      }
      shoreline = nextShoreline;
    }
    if (Number.isFinite(area.firstColumn)) touchedAreas.push(area);
    pools.push({ ...pool, retainedLevel });
  }

  const BLUR_PASSES = 3;
  const BLUR_RADIUS = 2;
  const blurReach = BLUR_PASSES * BLUR_RADIUS;
  const blurAreas = touchedAreas.map((area) => ({
    firstColumn: Math.max(3, area.firstColumn - blurReach),
    lastColumn: Math.min(columns - 4, area.lastColumn + blurReach),
    firstRow: Math.max(3, area.firstRow - blurReach),
    lastRow: Math.min(rows - 4, area.lastRow + blurReach),
  }));
  const blurredField = (field) => {
    let current = field;
    for (let pass = 0; pass < BLUR_PASSES; pass++) {
      const blurred = new Float32Array(cellCount);
      for (const area of blurAreas) {
        for (let row = area.firstRow; row <= area.lastRow; row++) {
          for (let column = area.firstColumn; column <= area.lastColumn; column++) {
            let sum = 0;
            for (let offsetRow = -BLUR_RADIUS; offsetRow <= BLUR_RADIUS; offsetRow++) {
              for (let offsetColumn = -BLUR_RADIUS; offsetColumn <= BLUR_RADIUS; offsetColumn++) sum += current[(row + offsetRow) * columns + column + offsetColumn];
            }
            blurred[row * columns + column] = sum / 25;
          }
        }
      }
      current = blurred;
    }
    return current;
  };
  const influence = blurredField(submerged);
  const weightedLevel = blurredField(submerged.map((isSubmerged, cell) => (isSubmerged ? levels[cell] : 0)));

  const packed = new Uint16Array(cellCount * 4);
  const noWaterHalf = THREE.DataUtils.toHalfFloat(NO_RETAINED_WATER);
  const zeroHalf = THREE.DataUtils.toHalfFloat(0);
  for (let cell = 0; cell < cellCount; cell++) {
    const hasWater = levels[cell] > NO_RETAINED_WATER;
    const hasInfluence = influence[cell] > 0;
    packed[cell * 4] = hasWater ? THREE.DataUtils.toHalfFloat(levels[cell]) : noWaterHalf;
    packed[cell * 4 + 1] = hasInfluence ? THREE.DataUtils.toHalfFloat(influence[cell]) : zeroHalf;
    packed[cell * 4 + 2] = influence[cell] > 0.001 ? THREE.DataUtils.toHalfFloat(weightedLevel[cell] / influence[cell]) : noWaterHalf;
  }
  const texture = new THREE.DataTexture(packed, columns, rows, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  function levelAt(x, z) {
    const column = grid.columnOf(x);
    const row = grid.rowOf(z);
    if (!grid.contains(column, row)) return NO_RETAINED_WATER;
    return levels[row * columns + column];
  }
  return { texture, levelAt, pools };
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
      const x = lerp(PLAY_BOUNDS.minX + 6, PLAY_BOUNDS.maxX - 6, random());
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

function collectStaticBlockers(boulders, logs, reefProps) {
  const discs = [];
  for (const boulder of boulders) discs.push({ x: boulder.x, z: boulder.z, radius: boulder.radius * 0.92 + 0.6 });
  for (const log of logs) {
    for (let along = -log.length / 2; along <= log.length / 2; along += 1) discs.push({ x: log.x + Math.cos(log.heading) * along, z: log.z + Math.sin(log.heading) * along, radius: log.radius + 0.5 });
  }
  for (const prop of Object.values(reefProps).flat()) discs.push({ x: prop.x, z: prop.z, radius: prop.blockRadius });
  for (const prop of CAMP_PROPS) discs.push(...CAMP_BLOCKERS[prop.kind](prop));
  for (const prop of HOLD_PROPS) discs.push(...HOLD_BLOCKERS[prop.kind](prop));
  discs.push(...holdWallDiscs());
  discs.push({ x: COOK_SPOT.x + 2, z: COOK_SPOT.z - 1, radius: 3.2 });
  return discs;
}

function buildWalkability(ground, staticBlockers) {
  const grid = createCellGrid(WORLD_BOUNDS, 1);
  const { columns, rows } = grid;
  const walkable = new Uint8Array(grid.cellCount);
  const chunkColumns = Math.ceil(columns / WALK_CHUNK_CELLS);
  const chunkRows = Math.ceil(rows / WALK_CHUNK_CELLS);
  const chunkReady = new Uint8Array(chunkColumns * chunkRows);
  const blockersByChunk = Array.from({ length: chunkColumns * chunkRows }, () => []);
  const touchedRange = (center, radius, offset, cellLimit) => [Math.max(0, Math.floor(center - radius - offset)), Math.min(cellLimit - 1, Math.ceil(center + radius - offset))];
  for (const disc of staticBlockers) {
    const [firstColumn, lastColumn] = touchedRange(disc.x, disc.radius, WORLD_BOUNDS.minX, columns);
    const [firstRow, lastRow] = touchedRange(disc.z, disc.radius, WORLD_BOUNDS.minZ, rows);
    for (let chunkRow = Math.floor(firstRow / WALK_CHUNK_CELLS); chunkRow <= Math.floor(lastRow / WALK_CHUNK_CELLS); chunkRow++) {
      for (let chunkColumn = Math.floor(firstColumn / WALK_CHUNK_CELLS); chunkColumn <= Math.floor(lastColumn / WALK_CHUNK_CELLS); chunkColumn++) blockersByChunk[chunkRow * chunkColumns + chunkColumn].push(disc);
    }
  }

  function blockDiscWithin(disc, firstColumnLimit, lastColumnLimit, firstRowLimit, lastRowLimit) {
    const firstRow = Math.max(firstRowLimit, Math.floor(disc.z - disc.radius - WORLD_BOUNDS.minZ));
    const lastRow = Math.min(lastRowLimit, Math.ceil(disc.z + disc.radius - WORLD_BOUNDS.minZ));
    const firstColumn = Math.max(firstColumnLimit, Math.floor(disc.x - disc.radius - WORLD_BOUNDS.minX));
    const lastColumn = Math.min(lastColumnLimit, Math.ceil(disc.x + disc.radius - WORLD_BOUNDS.minX));
    for (let row = firstRow; row <= lastRow; row++) {
      for (let column = firstColumn; column <= lastColumn; column++) {
        if (Math.hypot(grid.centerX(column) - disc.x, grid.centerZ(row) - disc.z) < disc.radius) walkable[row * columns + column] = 0;
      }
    }
  }

  function computeChunk(chunkColumn, chunkRow) {
    const firstColumn = chunkColumn * WALK_CHUNK_CELLS;
    const lastColumn = Math.min(columns, firstColumn + WALK_CHUNK_CELLS) - 1;
    const firstRow = chunkRow * WALK_CHUNK_CELLS;
    const lastRow = Math.min(rows, firstRow + WALK_CHUNK_CELLS) - 1;
    for (let row = firstRow; row <= lastRow; row++) {
      for (let column = firstColumn; column <= lastColumn; column++) {
        const x = grid.centerX(column);
        const z = grid.centerZ(row);
        if (x < PLAY_BOUNDS.minX || x > PLAY_BOUNDS.maxX || z < PLAY_BOUNDS.minZ || z > PLAY_BOUNDS.maxZ) continue;
        const height = ground.heightAt(x, z);
        if (height < DEEP_WATER_HEIGHT) continue;
        const slope = Math.hypot(ground.heightAt(x + 0.6, z) - ground.heightAt(x - 0.6, z), ground.heightAt(x, z + 0.6) - ground.heightAt(x, z - 0.6)) / 1.2;
        if (slope > MAX_WALKABLE_SLOPE) continue;
        walkable[row * columns + column] = 1;
      }
    }
    for (const disc of blockersByChunk[chunkRow * chunkColumns + chunkColumn]) blockDiscWithin(disc, firstColumn, lastColumn, firstRow, lastRow);
    chunkReady[chunkRow * chunkColumns + chunkColumn] = 1;
  }

  function ensureCell(column, row) {
    const chunk = Math.floor(row / WALK_CHUNK_CELLS) * chunkColumns + Math.floor(column / WALK_CHUNK_CELLS);
    if (!chunkReady[chunk]) computeChunk(chunk % chunkColumns, Math.floor(chunk / chunkColumns));
  }

  function isCellWalkable(column, row) {
    if (!grid.contains(column, row)) return false;
    ensureCell(column, row);
    return walkable[row * columns + column] === 1;
  }

  function ensureRange(firstColumn, lastColumn, firstRow, lastRow) {
    for (let chunkRow = Math.floor(Math.max(0, firstRow) / WALK_CHUNK_CELLS); chunkRow <= Math.floor(Math.min(rows - 1, lastRow) / WALK_CHUNK_CELLS); chunkRow++) {
      for (let chunkColumn = Math.floor(Math.max(0, firstColumn) / WALK_CHUNK_CELLS); chunkColumn <= Math.floor(Math.min(columns - 1, lastColumn) / WALK_CHUNK_CELLS); chunkColumn++) {
        if (!chunkReady[chunkRow * chunkColumns + chunkColumn]) computeChunk(chunkColumn, chunkRow);
      }
    }
  }

  function blockCircle(x, z, radius) {
    const blocked = [];
    const firstRow = Math.floor(z - radius - WORLD_BOUNDS.minZ);
    const lastRow = Math.ceil(z + radius - WORLD_BOUNDS.minZ);
    const firstColumn = Math.floor(x - radius - WORLD_BOUNDS.minX);
    const lastColumn = Math.ceil(x + radius - WORLD_BOUNDS.minX);
    ensureRange(firstColumn, lastColumn, firstRow, lastRow);
    for (let row = firstRow; row <= lastRow; row++) {
      for (let column = firstColumn; column <= lastColumn; column++) {
        if (!grid.contains(column, row)) continue;
        const index = row * columns + column;
        if (walkable[index] === 1 && Math.hypot(grid.centerX(column) - x, grid.centerZ(row) - z) < radius) {
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

  function prepareAround(x, z, radius, maximumChunks) {
    let computed = 0;
    const span = WALK_CHUNK_CELLS;
    for (let chunkRow = Math.max(0, Math.floor((z - radius - WORLD_BOUNDS.minZ) / span)); chunkRow <= Math.min(chunkRows - 1, Math.floor((z + radius - WORLD_BOUNDS.minZ) / span)); chunkRow++) {
      for (let chunkColumn = Math.max(0, Math.floor((x - radius - WORLD_BOUNDS.minX) / span)); chunkColumn <= Math.min(chunkColumns - 1, Math.floor((x + radius - WORLD_BOUNDS.minX) / span)); chunkColumn++) {
        if (chunkReady[chunkRow * chunkColumns + chunkColumn]) continue;
        if (computed >= maximumChunks) return computed;
        computeChunk(chunkColumn, chunkRow);
        computed++;
      }
    }
    return computed;
  }

  return { grid, isCellWalkable, blockCircle, unblockCells, prepareAround };
}

export function createWorld(quality) {
  const collisionField = buildCollisionField();
  const retained = buildRetainedWater();
  const ground = { heightAt: collisionField.sample, retained };
  const boulders = BOULDERS.map((boulder) => ({ ...boulder, y: collisionField.sample(boulder.x, boulder.z) - boulder.radius * boulder.squash * 0.22 }));
  const logs = DRIFT_LOGS.map((log) => ({ ...log, y: collisionField.sample(log.x, log.z) }));
  const reefProps = placeReefProps(collisionField.sample, boulders);
  const morayDens = placeMorayDens(reefProps);
  const terrain = createTerrain({ heightAt, reefShareAt, reefOuterEdgeAt, retained, boulders, logs, quality });
  const walkability = buildWalkability(ground, collectStaticBlockers(boulders, logs, reefProps));
  const walkGrid = walkability.grid;

  function isWalkable(x, z) {
    return walkability.isCellWalkable(walkGrid.columnOf(x), walkGrid.rowOf(z));
  }

  function waterLevelAt(x, z, seaLevel) {
    return Math.max(seaLevel, retained.levelAt(x, z));
  }

  function randomSpot(random, accept, attempts = 400) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      const x = lerp(PLAY_BOUNDS.minX, PLAY_BOUNDS.maxX, random());
      const z = lerp(PLAY_BOUNDS.minZ, PLAY_BOUNDS.maxZ, random());
      if (!isWalkable(x, z)) continue;
      const height = collisionField.sample(x, z);
      if (accept(x, z, height)) return { x, z, y: height };
    }
    return null;
  }

  function prepareAround(x, z, radius = 96, maximumChunks = 1) {
    return collisionField.prepareAround(x, z, radius, maximumChunks) + walkability.prepareAround(x, z, radius, maximumChunks);
  }

  return {
    ground, heightAt: collisionField.sample, retained, pools: retained.pools, boulders, logs, reefProps, morayDens, campProps: CAMP_PROPS, holdProps: HOLD_PROPS, isInHold, isInCamp,
    terrain, terrainMesh: terrain.mesh, walkGrid, isCellWalkable: walkability.isCellWalkable, isWalkable, isOnReef, waterLevelAt, randomSpot, createRandom,
    blockCircle: walkability.blockCircle, unblockCells: walkability.unblockCells, prepareAround, computedCollisionChunks: collisionField.computedChunkCount,
  };
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
