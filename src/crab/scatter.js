import { createRandom } from '../noise.js';

export const SCATTER_CHUNK_SIZE = 32;
const PREFETCH_MARGIN_CHUNKS = 1.5;

const chunkSeed = (layerSeed, chunkColumn, chunkRow) => (Math.imul(layerSeed, 0x9e3779b1) ^ Math.imul(chunkColumn, 0x85ebca6b) ^ Math.imul(chunkRow, 0xc2b2ae35)) >>> 0;

export function attemptsFor(random, attemptsPerArea) {
  const expected = attemptsPerArea * SCATTER_CHUNK_SIZE * SCATTER_CHUNK_SIZE;
  return Math.floor(expected) + (random() < expected % 1 ? 1 : 0);
}

export function createScatterLayer({ seed, radius, generate, onChange }) {
  const cache = new Map();
  let activeSignature = '';
  let activeItems = [];

  function chunkItems(chunkColumn, chunkRow) {
    const key = `${chunkColumn},${chunkRow}`;
    if (!cache.has(key)) {
      const random = createRandom(chunkSeed(seed, chunkColumn, chunkRow));
      const minX = chunkColumn * SCATTER_CHUNK_SIZE;
      const minZ = chunkRow * SCATTER_CHUNK_SIZE;
      cache.set(key, generate({ minX, minZ, size: SCATTER_CHUNK_SIZE, random, pointInside: () => [minX + random() * SCATTER_CHUNK_SIZE, minZ + random() * SCATTER_CHUNK_SIZE] }));
    }
    return cache.get(key);
  }

  function chunksAround(x, z) {
    const chunks = [];
    const firstColumn = Math.floor((x - radius) / SCATTER_CHUNK_SIZE);
    const lastColumn = Math.floor((x + radius) / SCATTER_CHUNK_SIZE);
    const firstRow = Math.floor((z - radius) / SCATTER_CHUNK_SIZE);
    const lastRow = Math.floor((z + radius) / SCATTER_CHUNK_SIZE);
    for (let row = firstRow; row <= lastRow; row++) {
      for (let column = firstColumn; column <= lastColumn; column++) {
        const nearestX = Math.max(column * SCATTER_CHUNK_SIZE, Math.min(x, (column + 1) * SCATTER_CHUNK_SIZE));
        const nearestZ = Math.max(row * SCATTER_CHUNK_SIZE, Math.min(z, (row + 1) * SCATTER_CHUNK_SIZE));
        if (Math.hypot(nearestX - x, nearestZ - z) <= radius) chunks.push([column, row]);
      }
    }
    return chunks;
  }

  function prefetchOne(x, z) {
    const margin = radius + SCATTER_CHUNK_SIZE * PREFETCH_MARGIN_CHUNKS;
    for (let row = Math.floor((z - margin) / SCATTER_CHUNK_SIZE); row <= Math.floor((z + margin) / SCATTER_CHUNK_SIZE); row++) {
      for (let column = Math.floor((x - margin) / SCATTER_CHUNK_SIZE); column <= Math.floor((x + margin) / SCATTER_CHUNK_SIZE); column++) {
        if (cache.has(`${column},${row}`)) continue;
        chunkItems(column, row);
        return;
      }
    }
  }

  function follow(x, z) {
    const centerColumn = Math.floor(x / SCATTER_CHUNK_SIZE);
    const centerRow = Math.floor(z / SCATTER_CHUNK_SIZE);
    const signature = `${centerColumn},${centerRow}`;
    if (signature === activeSignature) {
      prefetchOne(x, z);
      return false;
    }
    activeSignature = signature;
    const focusX = (centerColumn + 0.5) * SCATTER_CHUNK_SIZE;
    const focusZ = (centerRow + 0.5) * SCATTER_CHUNK_SIZE;
    activeItems = chunksAround(focusX, focusZ).flatMap(([column, row]) => chunkItems(column, row));
    onChange(activeItems);
    return true;
  }

  function itemsAround(x, z, searchRadius) {
    const items = [];
    for (let row = Math.floor((z - searchRadius) / SCATTER_CHUNK_SIZE); row <= Math.floor((z + searchRadius) / SCATTER_CHUNK_SIZE); row++) {
      for (let column = Math.floor((x - searchRadius) / SCATTER_CHUNK_SIZE); column <= Math.floor((x + searchRadius) / SCATTER_CHUNK_SIZE); column++) items.push(...chunkItems(column, row));
    }
    return items;
  }

  return {
    follow,
    itemsAround,
    get activeItems() {
      return activeItems;
    },
  };
}
