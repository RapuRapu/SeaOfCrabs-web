import * as THREE from 'three';
import { applySeaside } from './seaside.js';
import { pickTarget } from './picking.js';
import { STATION_KINDS, buildStationGeometries } from './stationModels.js';
import { HOME_YARD, SHELTER, TIDE_MIDDLE, TIDE_AMPLITUDE } from './world.js';

export { STATION_KINDS };
export const STATION_REACH = 2.9;
export const YARD = HOME_YARD;
export const SHELTER_WAKE_SPOT = SHELTER.wake;
const STATION_BLOCK_RADIUS = 1.3;
const STATION_SPACING = 3.0;
const YARD_EDGE_MARGIN = 1.2;
const DRY_MARGIN = 0.25;
const CLEARANCE_RADIUS = 1.6;
const CLEARANCE_SAMPLES = 8;
const YARD_RING_SEGMENTS = 120;
const YARD_RING_WIDTH = 0.28;
const DEFAULT_HEADING = 0.35;
const PREFERRED_SPOTS = {
  workshop: [{ x: -3, z: 2 }],
  storage: [{ x: 3, z: 2.5 }],
  crabBed: [{ x: -6.5, z: -0.5 }],
  helperNest: [{ x: -7, z: -2 }, { x: 2.5, z: -6.5 }],
  burrowHeart: [{ x: 0.5, z: -1.5 }],
  pantry: [{ x: 5.5, z: -2 }],
  ropeWalk: [{ x: 7, z: 3.5 }],
  grinder: [{ x: -7.5, z: 4 }],
  dryingRack: [{ x: 1, z: 7.5 }],
};

const hasBox = (kind) => kind === 'helperNest' || kind === 'pantry';

export function createHome(scene, world, quality, saved) {
  const state = { stations: saved && Array.isArray(saved.stations) ? structuredClone(saved.stations) : [] };
  let nextStationId = state.stations.reduce((highest, station) => Math.max(highest, station.id || 0), 0) + 1;
  for (const station of state.stations) if (!station.id) station.id = nextStationId++;
  const geometries = buildStationGeometries();
  const material = applySeaside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), { chromaticCaustics: quality.chromaticCaustics });
  const meshes = new Map();
  const blockedCells = new Map();
  let workshopModel = null;

  const yardRing = buildYardRing();
  yardRing.visible = false;
  scene.add(yardRing);

  function buildYardRing() {
    const positions = [];
    const indices = [];
    for (let segment = 0; segment <= YARD_RING_SEGMENTS; segment++) {
      const angle = (segment / YARD_RING_SEGMENTS) * Math.PI * 2;
      for (const offset of [-YARD_RING_WIDTH / 2, YARD_RING_WIDTH / 2]) {
        const radius = YARD.radius + offset;
        const x = YARD.x + Math.cos(angle) * radius;
        const z = YARD.z + Math.sin(angle) * radius;
        positions.push(x, world.heightAt(x, z) + 0.12, z);
      }
      if (segment < YARD_RING_SEGMENTS) {
        const first = segment * 2;
        indices.push(first, first + 1, first + 2, first + 1, first + 3, first + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 2.2, 1.2), transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    mesh.renderOrder = 5;
    return mesh;
  }

  const stationSpot = (station) => ({ x: station.x, z: station.z });
  const isInYard = (x, z, margin = 0) => Math.hypot(x - YARD.x, z - YARD.z) <= YARD.radius - margin;

  function blockStation(station) {
    blockedCells.set(station, world.blockCircle(station.x, station.z, STATION_BLOCK_RADIUS));
  }

  function unblockStation(station) {
    world.unblockCells(blockedCells.get(station) || []);
    blockedCells.delete(station);
  }

  function addStationMesh(station) {
    const floorY = world.heightAt(station.x, station.z);
    if (station.kind === 'workshop') {
      workshopModel.place(stationSpot(station), floorY - 0.12);
      meshes.set(station, workshopModel.group);
    } else {
      const mesh = new THREE.Mesh(geometries[station.kind] || geometries.storage, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.set(station.x, floorY - 0.05, station.z);
      mesh.rotation.y = station.heading ?? DEFAULT_HEADING;
      scene.add(mesh);
      meshes.set(station, mesh);
    }
    blockStation(station);
  }

  function attachStations(workshop) {
    workshopModel = workshop;
    for (const station of state.stations) {
      if (!Number.isFinite(station.x) || !Number.isFinite(station.z)) Object.assign(station, defaultSpot(station.kind, { ignore: station }) || { x: YARD.x, z: YARD.z });
      addStationMesh(station);
    }
  }

  function placementProblem(x, z, { ignore = null, extraSpots = [] } = {}) {
    if (!isInYard(x, z, YARD_EDGE_MARGIN)) return 'far';
    const height = world.heightAt(x, z);
    if (height < TIDE_MIDDLE + TIDE_AMPLITUDE + DRY_MARGIN || world.retained.levelAt(x, z) > height - 0.05) return 'wet';
    for (const station of state.stations) {
      if (station !== ignore && Math.hypot(station.x - x, station.z - z) < STATION_SPACING) return 'crowded';
    }
    for (const spot of extraSpots) if (Math.hypot(spot.x - x, spot.z - z) < STATION_SPACING) return 'crowded';
    const ownCells = ignore ? blockedCells.get(ignore) : null;
    if (ownCells) world.unblockCells(ownCells);
    let blocked = !world.isWalkable(x, z);
    for (let sample = 0; sample < CLEARANCE_SAMPLES && !blocked; sample++) {
      const angle = (sample / CLEARANCE_SAMPLES) * Math.PI * 2;
      blocked = !world.isWalkable(x + Math.cos(angle) * CLEARANCE_RADIUS, z + Math.sin(angle) * CLEARANCE_RADIUS);
    }
    if (ownCells) blockedCells.set(ignore, world.blockCircle(ignore.x, ignore.z, STATION_BLOCK_RADIUS));
    return blocked ? 'blocked' : null;
  }

  function defaultSpot(kind, { extraSpots = [], ignore = null } = {}) {
    const preferred = (PREFERRED_SPOTS[kind] || []).map((offset) => ({ x: YARD.x + offset.x, z: YARD.z + offset.z }));
    for (const spot of preferred) if (!placementProblem(spot.x, spot.z, { extraSpots, ignore })) return spot;
    const anchor = preferred[0] || { x: YARD.x, z: YARD.z };
    for (let radius = 1.5; radius < YARD.radius * 2; radius += 1.5) {
      for (let step = 0; step < 16; step++) {
        const angle = (step / 16) * Math.PI * 2 + radius;
        const spot = { x: anchor.x + Math.cos(angle) * radius, z: anchor.z + Math.sin(angle) * radius };
        if (!placementProblem(spot.x, spot.z, { extraSpots, ignore })) return spot;
      }
    }
    return null;
  }

  function addStation(kind, x, z, extra = {}) {
    const station = { kind, x, z, heading: DEFAULT_HEADING, id: nextStationId++, ...extra };
    if (hasBox(kind) && !station.box) station.box = { inventory: {}, shells: [], claws: [] };
    state.stations.push(station);
    addStationMesh(station);
    return station;
  }

  function moveStation(station, x, z) {
    unblockStation(station);
    station.x = x;
    station.z = z;
    const floorY = world.heightAt(x, z);
    if (station.kind === 'workshop') workshopModel.place(stationSpot(station), floorY - 0.12);
    else meshes.get(station).position.set(x, floorY - 0.05, z);
    blockStation(station);
  }

  function removeStation(station) {
    unblockStation(station);
    const mesh = meshes.get(station);
    if (mesh && station.kind !== 'workshop') mesh.removeFromParent();
    meshes.delete(station);
    state.stations.splice(state.stations.indexOf(station), 1);
  }

  const hasStation = (kind) => state.stations.some((station) => station.kind === kind);
  const stationOf = (kind) => state.stations.find((station) => station.kind === kind) || null;

  function stationUnder(clientX, clientY, camera) {
    return pickTarget(clientX, clientY, camera, state.stations.map((station) => ({ object: meshes.get(station), value: station })));
  }

  function showYard(visible) {
    yardRing.visible = visible;
  }

  function update(time) {
    if (yardRing.visible) yardRing.material.opacity = 0.4 + 0.2 * Math.sin(time * 4);
  }

  return {
    state,
    yard: YARD,
    wakeSpot: SHELTER_WAKE_SPOT,
    isInYard,
    stationSpot,
    placementProblem,
    defaultSpot,
    addStation,
    moveStation,
    removeStation,
    attachStations,
    hasStation,
    stationOf,
    stationUnder,
    showYard,
    update,
    serialize: () => ({ stations: state.stations.map((station) => structuredClone(station)) }),
  };
}
