import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const STATION_KINDS = {
  workshop: { label: 'Workshop', icon: '🔨', cost: { shellBits: 5, driftwood: 3, seaLettuce: 3 }, description: 'Craft shells and claws, improve your gear.' },
  storage: { label: 'Storage', icon: '📦', cost: { driftwood: 4 }, description: 'Keeps materials and gear safe — stored things stay here when you are defeated.' },
  helperNest: { label: 'Helper nest', icon: '🦀', cost: { driftwood: 4, seaLettuce: 2 }, description: 'Home for 3 helper crabs. They sleep here and bring their finds to the nest box.', multiple: true },
  crabBed: { label: 'Crab bed', icon: '🛏️', cost: { seaLettuce: 4, driftwood: 2 }, description: 'Sleep to heal fast. You wake up rested: faster healing and +10% speed for 15 min.' },
  burrowHeart: { label: 'Colony heart', icon: '💗', cost: { pearls: 3, pebbles: 6, clay: 6, driftwood: 4 }, description: 'The colony begins: up to 2 helper nests (6 helpers) and the pantry. Helpers start to eat dried kelp.' },
  ropeWalk: { label: 'Rope walk', icon: '🪢', cost: { driftwood: 4, pebbles: 2 }, description: 'Twists 3 kelp into 1 cord in 40 s. Two at a time.', requires: 'burrowHeart' },
  grinder: { label: 'Grinder', icon: '🪨', cost: { pebbles: 6, clay: 2 }, description: 'Grinds 4 shell bits into 1 shell lime in 30 s. Two at a time.', requires: 'burrowHeart' },
  pantry: { label: 'Pantry', icon: '🧺', cost: { clay: 4, driftwood: 3 }, description: 'Food store. Helpers eat dried kelp from here before their nest box.', requires: 'burrowHeart' },
  dryingRack: { label: 'Drying rack', icon: '🍂', cost: { driftwood: 4, shellBits: 2 }, description: 'Stands in the sun in your yard. Dries 3 sea lettuce into 1 dried kelp in 60 s.', surface: true },
};

const linearColor = (red, green, blue) => new THREE.Color().setRGB(red, green, blue, THREE.SRGBColorSpace);

function colorize(geometry, colorAt) {
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const color = new THREE.Color();
  for (let index = 0; index < positions.count; index++) {
    colorAt(color, positions.getX(index), positions.getY(index), positions.getZ(index));
    colors.set([color.r, color.g, color.b], index * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function buildStorageGeometry() {
  const plank = linearColor(0.55, 0.38, 0.22);
  const plankDark = linearColor(0.34, 0.22, 0.12);
  const parts = [];
  for (let slat = 0; slat < 4; slat++) {
    parts.push(colorize(new THREE.BoxGeometry(1.9, 0.26, 0.34).translate(0, 0.2 + slat * 0.27, -0.55 + (slat % 2) * 0.02), (color) => color.copy(slat % 2 ? plank : plankDark)));
    parts.push(colorize(new THREE.BoxGeometry(1.9, 0.26, 0.34).translate(0, 0.2 + slat * 0.27, 0.55), (color) => color.copy(slat % 2 ? plankDark : plank)));
    parts.push(colorize(new THREE.BoxGeometry(0.34, 0.26, 1.3).translate(-0.8, 0.2 + slat * 0.27, 0), (color) => color.copy(plank)));
    parts.push(colorize(new THREE.BoxGeometry(0.34, 0.26, 1.3).translate(0.8, 0.2 + slat * 0.27, 0), (color) => color.copy(plankDark)));
  }
  parts.push(colorize(new THREE.BoxGeometry(1.5, 0.08, 1.0).translate(0, 0.08, 0), (color) => color.copy(plankDark)));
  parts.push(colorize(new THREE.BoxGeometry(1.95, 0.12, 1.45).translate(0, 1.16, 0), (color) => color.copy(plank)));
  return mergeGeometries(parts.map((geometry) => {
    geometry.deleteAttribute('uv');
    return geometry;
  }));
}

function buildNestGeometry() {
  const nestColor = linearColor(0.42, 0.5, 0.24);
  const nestDark = linearColor(0.26, 0.3, 0.14);
  const plank = linearColor(0.55, 0.38, 0.22);
  const parts = [];
  const bowl = new THREE.TorusGeometry(0.95, 0.32, 8, 22).rotateX(Math.PI / 2).scale(1, 0.6, 1).translate(-0.35, 0.18, 0);
  parts.push(colorize(bowl, (color, x, y, z) => color.copy(nestDark).lerp(nestColor, 0.5 + 0.5 * Math.sin(x * 9 + z * 7))));
  parts.push(colorize(new THREE.CircleGeometry(0.85, 18).rotateX(-Math.PI / 2).translate(-0.35, 0.06, 0), (color) => color.copy(nestDark)));
  parts.push(colorize(new THREE.BoxGeometry(0.8, 0.55, 0.8).translate(0.95, 0.28, -0.35), (color, x, y) => color.copy(plank).multiplyScalar(0.75 + 0.25 * Math.round(y * 6 % 1))));
  parts.push(colorize(new THREE.BoxGeometry(0.88, 0.08, 0.88).translate(0.95, 0.58, -0.35), (color) => color.copy(plank).multiplyScalar(1.1)));
  return mergeGeometries(parts.map((geometry) => {
    geometry.deleteAttribute('uv');
    return geometry;
  }));
}

function buildHeartGeometry() {
  const clayColor = linearColor(0.56, 0.4, 0.3);
  const clayDark = linearColor(0.36, 0.25, 0.18);
  const pebble = linearColor(0.6, 0.6, 0.58);
  const pearl = linearColor(1, 0.95, 0.92);
  const parts = [];
  parts.push(colorize(new THREE.CylinderGeometry(0.75, 1.0, 0.7, 14).translate(0, 0.35, 0), (color, x, y) => color.copy(clayDark).lerp(clayColor, y / 0.7)));
  for (let stone = 0; stone < 9; stone++) {
    const angle = (stone / 9) * Math.PI * 2;
    parts.push(colorize(new THREE.IcosahedronGeometry(0.2, 1).scale(1.2, 0.7, 1).translate(Math.cos(angle) * 0.98, 0.1, Math.sin(angle) * 0.98), (color) => color.copy(pebble).multiplyScalar(0.8 + 0.3 * Math.sin(stone * 2.1))));
  }
  parts.push(colorize(new THREE.SphereGeometry(0.62, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.7, 1).translate(0, 0.7, 0), (color, x, y, z) => color.copy(clayColor).multiplyScalar(0.9 + 0.15 * Math.sin(Math.atan2(z, x) * 7))));
  for (let index = 0; index < 3; index++) {
    const angle = (index / 3) * Math.PI * 2 + 0.4;
    parts.push(colorize(new THREE.SphereGeometry(0.17, 12, 8).translate(Math.cos(angle) * 0.34, 1.12, Math.sin(angle) * 0.34), (color) => color.copy(pearl)));
  }
  return mergeGeometries(parts.map((geometry) => {
    geometry.deleteAttribute('uv');
    return geometry.index ? geometry.toNonIndexed() : geometry;
  }));
}

function mergeParts(parts) {
  return mergeGeometries(parts.map((geometry) => {
    geometry.deleteAttribute('uv');
    return geometry.index ? geometry.toNonIndexed() : geometry;
  }));
}

function buildRopeWalkGeometry() {
  const wood = linearColor(0.48, 0.34, 0.2);
  const rope = linearColor(0.62, 0.52, 0.24);
  const parts = [];
  for (const side of [-0.9, 0.9]) {
    parts.push(colorize(new THREE.BoxGeometry(0.16, 0.9, 0.16).translate(side, 0.45, 0), (color) => color.copy(wood)));
    parts.push(colorize(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 10).rotateZ(Math.PI / 2).translate(side, 0.78, 0), (color) => color.copy(wood).multiplyScalar(0.8)));
  }
  parts.push(colorize(new THREE.BoxGeometry(2.1, 0.1, 0.5).translate(0, 0.05, 0), (color) => color.copy(wood).multiplyScalar(0.7)));
  for (let strand = 0; strand < 3; strand++) {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.9, 0.78, -0.06 + strand * 0.06), new THREE.Vector3(0, 0.7 - strand * 0.02, 0), new THREE.Vector3(0.9, 0.78, 0.06 - strand * 0.06)]);
    parts.push(colorize(new THREE.TubeGeometry(curve, 16, 0.04, 6), (color, x) => color.copy(rope).multiplyScalar(0.85 + 0.2 * Math.sin(x * 20 + strand))));
  }
  return mergeParts(parts);
}

function buildGrinderGeometry() {
  const stone = linearColor(0.55, 0.55, 0.53);
  const stoneDark = linearColor(0.38, 0.38, 0.37);
  const shell = linearColor(0.92, 0.86, 0.78);
  const parts = [];
  parts.push(colorize(new THREE.CylinderGeometry(0.85, 0.9, 0.3, 18).translate(0, 0.15, 0), (color, x, y) => color.copy(stoneDark).lerp(stone, y / 0.3)));
  parts.push(colorize(new THREE.CylinderGeometry(0.6, 0.6, 0.28, 18).translate(0, 0.44, 0), (color, x, y, z) => color.copy(stone).multiplyScalar(0.85 + 0.2 * Math.sin(Math.atan2(z, x) * 6))));
  parts.push(colorize(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 8).rotateZ(Math.PI / 2.4).translate(0.45, 0.75, 0), (color) => color.setRGB(0.45, 0.32, 0.18)));
  for (let bit = 0; bit < 6; bit++) {
    const angle = bit * 1.1;
    parts.push(colorize(new THREE.TetrahedronGeometry(0.09).translate(Math.cos(angle) * 0.75, 0.32, Math.sin(angle) * 0.75), (color) => color.copy(shell)));
  }
  return mergeParts(parts);
}

function buildPantryGeometry() {
  const clayColor = linearColor(0.62, 0.42, 0.3);
  const kelp = linearColor(0.5, 0.36, 0.14);
  const plank = linearColor(0.5, 0.35, 0.2);
  const parts = [];
  parts.push(colorize(new THREE.BoxGeometry(1.9, 0.12, 0.9).translate(0, 0.06, 0), (color) => color.copy(plank)));
  for (let jar = 0; jar < 3; jar++) {
    parts.push(colorize(new THREE.SphereGeometry(0.32, 12, 8).scale(1, 1.25, 1).translate(-0.6 + jar * 0.6, 0.45, -0.1), (color, x, y) => color.copy(clayColor).multiplyScalar(0.8 + 0.3 * y)));
    parts.push(colorize(new THREE.CylinderGeometry(0.14, 0.16, 0.12, 10).translate(-0.6 + jar * 0.6, 0.86, -0.1), (color) => color.copy(clayColor).multiplyScalar(0.7)));
  }
  for (let bundle = 0; bundle < 2; bundle++) {
    parts.push(colorize(new THREE.CapsuleGeometry(0.12, 0.7, 3, 8).rotateZ(Math.PI / 2).translate(-0.3 + bundle * 0.6, 0.22, 0.32), (color, x) => color.copy(kelp).multiplyScalar(0.85 + 0.2 * Math.sin(x * 12))));
  }
  return mergeGeometries(parts.map((geometry) => {
    geometry.deleteAttribute('uv');
    return geometry;
  }));
}

function buildBedGeometry() {
  const kelp = linearColor(0.36, 0.42, 0.18);
  const kelpLight = linearColor(0.55, 0.6, 0.3);
  const parts = [];
  for (let strand = 0; strand < 6; strand++) {
    const offset = (strand - 2.5) * 0.28;
    parts.push(colorize(new THREE.CapsuleGeometry(0.15, 1.7, 3, 8).rotateX(Math.PI / 2).scale(1, 0.45, 1).translate(offset, 0.12 + (strand % 2) * 0.03, 0), (color, x, y, z) => color.copy(kelp).lerp(kelpLight, 0.4 + 0.3 * Math.sin(z * 5 + strand))));
  }
  parts.push(colorize(new THREE.SphereGeometry(0.42, 12, 8).scale(1.2, 0.45, 0.8).translate(0, 0.25, -0.75), (color) => color.copy(kelpLight)));
  return mergeGeometries(parts.map((geometry) => {
    geometry.deleteAttribute('uv');
    return geometry;
  }));
}

export function buildStationGeometries() {
  return {
    storage: buildStorageGeometry(),
    helperNest: buildNestGeometry(),
    crabBed: buildBedGeometry(),
    burrowHeart: buildHeartGeometry(),
    pantry: buildPantryGeometry(),
    ropeWalk: buildRopeWalkGeometry(),
    grinder: buildGrinderGeometry(),
  };
}
