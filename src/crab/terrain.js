import * as THREE from 'three';
import { createNoise2D, fractalNoise, smoothstep } from '../noise.js';
import { applySeaside } from './seaside.js';

const VISUAL_HALF_SIZE = 190;
const RECENTER_STEP = 32;
const RECENTER_TRIGGER_SHARE = 0.75;
const STRIP_VERTICES_PER_FRAME = 900;
const TERRAIN_HEIGHT_REACH = 40;

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


export function createTerrain({ heightAt, reefShareAt, reefOuterEdgeAt, retained, boulders, logs, quality }) {
  const halfCells = Math.round(VISUAL_HALF_SIZE / quality.terrainCellSize);
  const cellsPerSide = halfCells * 2;
  const cellSize = (VISUAL_HALF_SIZE * 2) / cellsPerSide;
  const samplesPerSide = cellsPerSide + 1;
  const stepCells = Math.max(1, Math.round(RECENTER_STEP / cellSize));
  const step = stepCells * cellSize;
  const vertexCount = samplesPerSide * samplesPerSide;
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const heights = new Float32Array(vertexCount);
  const tintNoise = createNoise2D(91);
  const color = new THREE.Color();
  const normal = new THREE.Vector3();
  const center = { column: 0, row: 0 };
  let job = null;

  function sampleVertex(globalColumn, globalRow, targetHeights, targetPositions, targetColors, index) {
    const x = globalColumn * cellSize;
    const z = globalRow * cellSize;
    const height = heightAt(x, z);
    targetHeights[index] = height;
    targetPositions[index * 3] = x;
    targetPositions[index * 3 + 1] = height;
    targetPositions[index * 3 + 2] = z;

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
    const submergedInPool = retained.levelAt(x, z) - height;
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
      if (distance < boulder.radius * 1.3) contactShade *= 1 - 0.5 * smoothstep(boulder.radius * 1.3, boulder.radius * 0.7, distance);
    }
    for (const log of logs) {
      const along = THREE.MathUtils.clamp((x - log.x) * Math.cos(log.heading) + (z - log.z) * Math.sin(log.heading), -log.length / 2, log.length / 2);
      const distance = Math.hypot(x - log.x - Math.cos(log.heading) * along, z - log.z - Math.sin(log.heading) * along);
      if (distance < log.radius * 1.8) contactShade *= 1 - 0.45 * smoothstep(log.radius * 1.8, log.radius * 0.6, distance);
    }
    targetColors[index * 3] = color.r * contactShade;
    targetColors[index * 3 + 1] = color.g * contactShade;
    targetColors[index * 3 + 2] = color.b * contactShade;
  }

  const firstGlobalColumn = () => center.column * stepCells - halfCells;
  const firstGlobalRow = () => center.row * stepCells - halfCells;

  function updateNormals(firstColumn, lastColumn, firstRow, lastRow) {
    for (let row = Math.max(0, firstRow); row <= Math.min(cellsPerSide, lastRow); row++) {
      for (let column = Math.max(0, firstColumn); column <= Math.min(cellsPerSide, lastColumn); column++) {
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
  }

  function buildAll() {
    const startColumn = firstGlobalColumn();
    const startRow = firstGlobalRow();
    for (let row = 0; row < samplesPerSide; row++) {
      for (let column = 0; column < samplesPerSide; column++) sampleVertex(startColumn + column, startRow + row, heights, positions, colors, row * samplesPerSide + column);
    }
    updateNormals(0, cellsPerSide, 0, cellsPerSide);
  }

  buildAll();
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
  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  const normalAttribute = new THREE.BufferAttribute(normals, 3);
  const colorAttribute = new THREE.BufferAttribute(colors, 3);
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('normal', normalAttribute);
  geometry.setAttribute('color', colorAttribute);
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  const material = applySeaside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 }), { surface: 'sand', wetDarkening: 0.6, wetRoughness: 0.42, wetGloss: 0.42, chromaticCaustics: quality.chromaticCaustics });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = quality.terrainShadows;

  function updateBounds() {
    const middle = new THREE.Vector3(center.column * step, 0, center.row * step);
    geometry.boundingSphere = new THREE.Sphere(middle, Math.hypot(VISUAL_HALF_SIZE * Math.SQRT2, TERRAIN_HEIGHT_REACH));
    geometry.boundingBox = new THREE.Box3(new THREE.Vector3(middle.x - VISUAL_HALF_SIZE, -TERRAIN_HEIGHT_REACH, middle.z - VISUAL_HALF_SIZE), new THREE.Vector3(middle.x + VISUAL_HALF_SIZE, TERRAIN_HEIGHT_REACH, middle.z + VISUAL_HALF_SIZE));
  }

  function markUploaded() {
    positionAttribute.needsUpdate = true;
    normalAttribute.needsUpdate = true;
    colorAttribute.needsUpdate = true;
    updateBounds();
  }
  updateBounds();

  function startJob(axis, direction) {
    const stripLength = stepCells * samplesPerSide;
    job = {
      axis,
      direction,
      targetColumn: center.column + (axis === 'x' ? direction : 0),
      targetRow: center.row + (axis === 'z' ? direction : 0),
      heights: new Float32Array(stripLength),
      positions: new Float32Array(stripLength * 3),
      colors: new Float32Array(stripLength * 3),
      next: 0,
      length: stripLength,
    };
  }

  function stripGlobalCoordinates(stripIndex) {
    const across = stripIndex % stepCells;
    const along = Math.floor(stripIndex / stepCells);
    const targetFirstColumn = job.targetColumn * stepCells - halfCells;
    const targetFirstRow = job.targetRow * stepCells - halfCells;
    const newLine = job.direction > 0 ? cellsPerSide - stepCells + 1 + across : across;
    return job.axis === 'x' ? [targetFirstColumn + newLine, targetFirstRow + along] : [targetFirstColumn + along, targetFirstRow + newLine];
  }

  function workOnJob(vertexBudget) {
    const end = Math.min(job.length, job.next + vertexBudget);
    for (; job.next < end; job.next++) {
      const [globalColumn, globalRow] = stripGlobalCoordinates(job.next);
      sampleVertex(globalColumn, globalRow, job.heights, job.positions, job.colors, job.next);
    }
    if (job.next >= job.length) applyJob();
  }

  function copyVertex(fromArrays, fromIndex, toIndex) {
    heights[toIndex] = fromArrays.heights[fromIndex];
    for (let component = 0; component < 3; component++) {
      positions[toIndex * 3 + component] = fromArrays.positions[fromIndex * 3 + component];
      colors[toIndex * 3 + component] = fromArrays.colors[fromIndex * 3 + component];
    }
  }

  function shiftVertices(axis, direction) {
    if (axis === 'z') {
      const offset = stepCells * samplesPerSide;
      if (direction > 0) {
        heights.copyWithin(0, offset);
        positions.copyWithin(0, offset * 3);
        colors.copyWithin(0, offset * 3);
        normals.copyWithin(0, offset * 3);
      } else {
        heights.copyWithin(offset, 0, vertexCount - offset);
        positions.copyWithin(offset * 3, 0, (vertexCount - offset) * 3);
        colors.copyWithin(offset * 3, 0, (vertexCount - offset) * 3);
        normals.copyWithin(offset * 3, 0, (vertexCount - offset) * 3);
      }
      return;
    }
    for (let row = 0; row < samplesPerSide; row++) {
      const rowStart = row * samplesPerSide;
      const from = direction > 0 ? rowStart + stepCells : rowStart;
      const to = direction > 0 ? rowStart : rowStart + stepCells;
      const length = samplesPerSide - stepCells;
      heights.copyWithin(to, from, from + length);
      positions.copyWithin(to * 3, from * 3, (from + length) * 3);
      colors.copyWithin(to * 3, from * 3, (from + length) * 3);
      normals.copyWithin(to * 3, from * 3, (from + length) * 3);
    }
  }

  function applyJob() {
    const { axis, direction } = job;
    shiftVertices(axis, direction);
    for (let stripIndex = 0; stripIndex < job.length; stripIndex++) {
      const across = stripIndex % stepCells;
      const along = Math.floor(stripIndex / stepCells);
      const line = direction > 0 ? cellsPerSide - stepCells + 1 + across : across;
      const target = axis === 'x' ? along * samplesPerSide + line : line * samplesPerSide + along;
      copyVertex(job, stripIndex, target);
    }
    center.column = job.targetColumn;
    center.row = job.targetRow;
    const touchedFirst = direction > 0 ? cellsPerSide - stepCells - 1 : 0;
    const touchedLast = direction > 0 ? cellsPerSide : stepCells + 1;
    const trailingEdge = direction > 0 ? 0 : cellsPerSide;
    if (axis === 'x') {
      updateNormals(touchedFirst, touchedLast, 0, cellsPerSide);
      updateNormals(trailingEdge, trailingEdge, 0, cellsPerSide);
    } else {
      updateNormals(0, cellsPerSide, touchedFirst, touchedLast);
      updateNormals(0, cellsPerSide, trailingEdge, trailingEdge);
    }
    job = null;
    markUploaded();
  }

  const neededShift = (focus, centerIndex) => {
    const offset = focus - centerIndex * step;
    if (Math.abs(offset) <= step * RECENTER_TRIGGER_SHARE) return 0;
    return Math.round(offset / step);
  };

  function rebuildAround(x, z) {
    job = null;
    center.column = Math.round(x / step);
    center.row = Math.round(z / step);
    buildAll();
    markUploaded();
  }

  function follow(x, z, { vertexBudget = STRIP_VERTICES_PER_FRAME } = {}) {
    const shiftX = neededShift(x, center.column);
    const shiftZ = neededShift(z, center.row);
    if (Math.abs(shiftX) > 1 || Math.abs(shiftZ) > 1) {
      rebuildAround(x, z);
      return;
    }
    if (job) {
      const stillWanted = job.axis === 'x' ? shiftX === job.direction : shiftZ === job.direction;
      if (!stillWanted) job = null;
    }
    if (!job) {
      if (shiftX) startJob('x', shiftX);
      else if (shiftZ) startJob('z', shiftZ);
    }
    if (job) workOnJob(vertexBudget);
  }

  function finishPendingWork() {
    while (job) workOnJob(Infinity);
  }

  return {
    mesh,
    follow,
    rebuildAround,
    finishPendingWork,
    get center() {
      return { x: center.column * step, z: center.row * step };
    },
    get hasPendingWork() {
      return job !== null;
    },
    step,
  };
}
