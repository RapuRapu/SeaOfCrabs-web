import * as THREE from 'three';
import { PLAY_BOUNDS, boundsWidth } from './worldBounds.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createRandom } from '../noise.js';
import { applySeaside } from './seaside.js';
import { TIDE_MIDDLE, TIDE_AMPLITUDE, isOnReef, isInCamp, isInHold, CAMP_AREA, HOLD_AREA, REEF_AREA } from './world.js';

const SHOWN_RADIUS = 150;
const SHOWN_REFRESH_DISTANCE = 24;
const HOME_FOCUS = { x: 0, z: 0 };
const AREA_ONE_ORIGINAL_WIDTH = 236;
const REEF_AREA_GROWTH = 4.7;
const scaledCount = (type, count) => (CAMP_TYPES.has(type) || HOLD_TYPES.has(type) ? count : Math.round(count * (REEF_TYPES.has(type) ? REEF_AREA_GROWTH : boundsWidth(PLAY_BOUNDS) / AREA_ONE_ORIGINAL_WIDTH)));
const linearColor = (red, green, blue) => new THREE.Color().setRGB(red, green, blue, THREE.SRGBColorSpace);

const DEFAULT_STACK_LIMIT = 50;
export const stackLimitOf = (type) => (RESOURCE_TYPES[type] && RESOURCE_TYPES[type].stackLimit) || DEFAULT_STACK_LIMIT;

export const RESOURCE_TYPES = {
  shellBits: { label: 'Shell bits', icon: '🐚', count: 16, gatherSeconds: 1.0, standOff: 1.3 },
  driftwood: { label: 'Driftwood', icon: '🪵', count: 12, gatherSeconds: 1.3, standOff: 1.5 },
  seaLettuce: { label: 'Sea lettuce', icon: '🥬', count: 12, gatherSeconds: 0.9, standOff: 2.1 },
  kelp: { label: 'Kelp', icon: '🌿', count: 10, gatherSeconds: 1.1, standOff: 1.8 },
  pebbles: { label: 'Pebbles', icon: '🪨', count: 10, gatherSeconds: 1.0, standOff: 1.3 },
  clay: { label: 'Clay', icon: '🟤', count: 8, gatherSeconds: 1.4, standOff: 1.4 },
  sand: { label: 'Sand', icon: '🏖️', count: 8, gatherSeconds: 0.9, standOff: 1.4 },
  pearls: { label: 'Pearls', icon: '🦪', count: 3, gatherSeconds: 1.6, standOff: 1.3 },
  coral: { label: 'Coral', icon: '🪸', count: 12, gatherSeconds: 1.4, standOff: 1.5 },
  seaGlass: { label: 'Sea glass', icon: '🔷', count: 8, gatherSeconds: 1.1, standOff: 1.3 },
  scrap: { label: 'Scrap metal', icon: '🔩', count: 10, gatherSeconds: 1.2, standOff: 1.3 },
  cloth: { label: 'Cloth', icon: '🧵', count: 8, gatherSeconds: 1.3, standOff: 1.4 },
  fishBone: { label: 'Fish bone', icon: '🦴', count: 10, gatherSeconds: 1.2, standOff: 1.4 },
  wax: { label: 'Candle wax', icon: '🕯️', count: 8, gatherSeconds: 1.3, standOff: 1.3 },
  driedKelp: { label: 'Dried kelp', icon: '🍂', count: 0 },
  kelpPoultice: { label: 'Kelp poultice', icon: '🩹', count: 0 },
  cord: { label: 'Cord', icon: '🪢', count: 0 },
  shellLime: { label: 'Shell lime', icon: '🧂', count: 0 },
  gullFeather: { label: 'Gull feather', icon: '🪶', count: 0 },
  lobsterPlate: { label: 'Lobster plate', icon: '🦞', count: 0 },
  catWhisker: { label: 'Cat whisker', icon: '🐾', count: 0 },
  apronScrap: { label: 'Apron scrap', icon: '🍳', count: 0 },
};

const PEARL_MINIMUM_POOL_DEPTH = 1.4;
const REEF_TYPES = new Set(['coral', 'seaGlass']);
const CAMP_TYPES = new Set(['scrap', 'cloth']);
const HOLD_TYPES = new Set(['fishBone', 'wax']);

function paint(geometry, colorAt) {
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const color = new THREE.Color();
  for (let index = 0; index < positions.count; index++) {
    colorAt(color, positions.getX(index), positions.getY(index), positions.getZ(index));
    colors.set([color.r, color.g, color.b], index * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.deleteAttribute('uv');
  return geometry;
}

function buildShellBitGeometry() {
  const ribs = 22;
  const positions = [0, 0.05, -0.42];
  const pale = linearColor(0.98, 0.9, 0.86);
  const rose = linearColor(0.95, 0.56, 0.52);
  for (const [ringShare, ringLift] of [[0.55, 0.2], [1, 0.03]]) {
    for (let rib = 0; rib <= ribs; rib++) {
      const angle = -1.25 + (rib / ribs) * 2.5;
      const ridge = 1 + 0.07 * Math.cos(rib * Math.PI);
      const radius = 0.95 * ringShare * ridge;
      positions.push(Math.sin(angle) * radius, ringLift * ridge + 0.03, -0.42 + Math.cos(angle) * radius);
    }
  }
  const indices = [];
  for (let rib = 0; rib < ribs; rib++) {
    indices.push(0, 1 + rib, 2 + rib);
    indices.push(1 + rib, ribs + 2 + rib, 2 + rib, 2 + rib, ribs + 2 + rib, ribs + 3 + rib);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return paint(geometry, (color, x, y, z) => color.copy(pale).lerp(rose, 0.5 + 0.5 * Math.sin(Math.hypot(x, z + 0.42) * 16)));
}

function gnarledStick(length, startRadius, endRadius, bendAmount, seed) {
  const stick = new THREE.CylinderGeometry(endRadius, startRadius, length, 10, 12).rotateZ(Math.PI / 2);
  const positions = stick.attributes.position;
  const point = new THREE.Vector3();
  for (let index = 0; index < positions.count; index++) {
    point.fromBufferAttribute(positions, index);
    const along = point.x / length;
    const angle = Math.atan2(point.z, point.y);
    const groove = 1 + 0.12 * Math.sin(angle * 7 + along * 6 + seed) + 0.06 * Math.sin(angle * 13 - along * 9);
    point.y = point.y * groove + bendAmount * (0.25 - along * along) + 0.03 * Math.sin(along * 17 + seed);
    point.z = point.z * groove + bendAmount * 0.6 * Math.sin(along * 3.1 + seed);
    positions.setXYZ(index, point.x, point.y, point.z);
  }
  stick.computeVertexNormals();
  return stick;
}

function buildDriftwoodGeometry() {
  const bark = linearColor(0.42, 0.37, 0.32);
  const weathered = linearColor(0.62, 0.58, 0.52);
  const core = linearColor(0.72, 0.6, 0.44);
  const stick = gnarledStick(1.9, 0.14, 0.09, 0.22, 1.7).translate(0, 0.13, 0);
  const branch = gnarledStick(0.75, 0.08, 0.035, 0.1, 4.2).rotateY(0.9).translate(0.32, 0.15, -0.3);
  return paint(mergeGeometries([stick, branch]), (color, x, y, z) => {
    const grain = 0.5 + 0.5 * Math.sin(Math.atan2(z, y - 0.13) * 11 + x * 1.5) * (0.7 + 0.3 * Math.sin(x * 9));
    color.copy(bark).lerp(weathered, 0.35 + 0.4 * grain);
    if (Math.abs(x) > 0.93) color.lerp(core, 0.8);
  });
}

function buildSeaLettuceGeometry() {
  const bright = linearColor(0.5, 0.74, 0.24);
  const deep = linearColor(0.14, 0.36, 0.12);
  const leaves = [
    { reach: 0.85, lift: 0.3, ruffles: 7, turn: 0, shiftX: 0, shiftZ: 0 },
    { reach: 0.62, lift: 0.55, ruffles: 6, turn: 1.1, shiftX: 0.14, shiftZ: 0.08 },
    { reach: 0.42, lift: 0.8, ruffles: 5, turn: 2.3, shiftX: -0.08, shiftZ: 0.12 },
  ].map((leaf) => {
    const sheet = new THREE.RingGeometry(0.03, leaf.reach, 44, 7).rotateX(-Math.PI / 2);
    const positions = sheet.attributes.position;
    for (let index = 0; index < positions.count; index++) {
      const x = positions.getX(index);
      const z = positions.getZ(index);
      const share = Math.hypot(x, z) / leaf.reach;
      const angle = Math.atan2(z, x);
      const ruffle = Math.sin(angle * leaf.ruffles + share * 3) * share * share * 0.22 + Math.sin(angle * leaf.ruffles * 2.3 + 1.7) * share * share * share * 0.07;
      positions.setY(index, 0.05 + share * leaf.lift * 0.5 + ruffle * leaf.reach);
    }
    sheet.computeVertexNormals();
    return paint(sheet.rotateY(leaf.turn).translate(leaf.shiftX, 0, leaf.shiftZ), (color, x, y) => color.copy(deep).lerp(bright, THREE.MathUtils.smoothstep(y, 0.04, 0.42)));
  });
  return mergeGeometries(leaves);
}

function buildKelpGeometry() {
  const stem = linearColor(0.3, 0.26, 0.08);
  const blade = linearColor(0.56, 0.48, 0.14);
  const fronds = [];
  for (let frond = 0; frond < 5; frond++) {
    const angle = (frond / 5) * Math.PI * 2 + 0.3;
    const height = 1.3 + 0.35 * Math.sin(frond * 2.7);
    const sheet = new THREE.PlaneGeometry(0.22, height, 1, 8).translate(0, height / 2, 0);
    const positions = sheet.attributes.position;
    for (let index = 0; index < positions.count; index++) {
      const y = positions.getY(index);
      positions.setX(index, positions.getX(index) * (1.2 - y / height * 0.6) + Math.sin(y * 3 + frond) * 0.12 * y);
      positions.setZ(index, Math.sin(y * 2.2 + frond * 1.3) * 0.1 * y);
    }
    sheet.computeVertexNormals();
    fronds.push(paint(sheet.rotateY(angle).translate(Math.cos(angle) * 0.12, 0, Math.sin(angle) * 0.12), (color, x, y) => color.copy(stem).lerp(blade, THREE.MathUtils.smoothstep(y, 0.1, 0.9))));
  }
  return mergeGeometries(fronds);
}

function buildPebblesGeometry() {
  const tints = [linearColor(0.62, 0.62, 0.6), linearColor(0.44, 0.45, 0.47), linearColor(0.72, 0.66, 0.58)];
  const stones = [
    { scale: [0.36, 0.2, 0.28], at: [0, 0.12, 0], turn: 0.2 },
    { scale: [0.26, 0.16, 0.22], at: [0.46, 0.09, 0.14], turn: 1.4 },
    { scale: [0.22, 0.14, 0.18], at: [-0.38, 0.08, 0.26], turn: 2.6 },
    { scale: [0.2, 0.12, 0.17], at: [0.1, 0.07, -0.42], turn: 0.9 },
  ];
  return mergeGeometries(stones.map(({ scale, at, turn }, index) => paint(new THREE.IcosahedronGeometry(1, 2).scale(...scale).rotateY(turn).translate(...at), (color, x, y) => color.copy(tints[index % 3]).multiplyScalar(0.85 + 0.4 * THREE.MathUtils.smoothstep(y, 0.02, 0.25)))));
}

function buildClayGeometry() {
  const wet = linearColor(0.42, 0.3, 0.24);
  const dry = linearColor(0.66, 0.5, 0.4);
  const lump = new THREE.SphereGeometry(0.55, 16, 10).scale(1.2, 0.45, 0.9);
  const positions = lump.attributes.position;
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    positions.setY(index, Math.max(0, positions.getY(index) + 0.04 * Math.sin(x * 9) * Math.cos(z * 7)) + 0.02);
  }
  lump.computeVertexNormals();
  return paint(lump, (color, x, y) => color.copy(wet).lerp(dry, THREE.MathUtils.smoothstep(y, 0.05, 0.3)));
}

function buildSandGeometry() {
  const pale = linearColor(0.92, 0.82, 0.62);
  const shade = linearColor(0.74, 0.62, 0.44);
  const mound = new THREE.ConeGeometry(0.7, 0.5, 18, 3).translate(0, 0.25, 0);
  const positions = mound.attributes.position;
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    positions.setY(index, positions.getY(index) * (0.85 + 0.15 * Math.sin(Math.atan2(z, x) * 5)));
  }
  mound.computeVertexNormals();
  return paint(mound, (color, x, y, z) => color.copy(shade).lerp(pale, 0.5 + 0.5 * Math.sin(x * 4 + z * 3 + y * 6)));
}

function buildPearlGeometry() {
  const rough = linearColor(0.42, 0.38, 0.34);
  const nacre = linearColor(0.92, 0.9, 0.94);
  const pearlWhite = linearColor(1, 0.97, 0.93);
  const valve = new THREE.SphereGeometry(0.62, 18, 8, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5).scale(1, 0.32, 1.25);
  const valvePositions = valve.attributes.position;
  for (let index = 0; index < valvePositions.count; index++) {
    const x = valvePositions.getX(index);
    const z = valvePositions.getZ(index);
    const ruffle = 1 + 0.08 * Math.sin(Math.atan2(z, x) * 9);
    valvePositions.setXYZ(index, x * ruffle, valvePositions.getY(index) + 0.2, z * ruffle);
  }
  valve.computeVertexNormals();
  const shellHalf = paint(valve, (color, x, y) => color.copy(nacre).lerp(rough, THREE.MathUtils.smoothstep(0.2 - y, 0.0, 0.16)));
  const pearl = paint(new THREE.SphereGeometry(0.22, 16, 12).translate(0.05, 0.24, 0.05), (color) => color.copy(pearlWhite));
  return mergeGeometries([shellHalf, pearl]);
}

function buildCoralGeometry() {
  const deep = linearColor(0.84, 0.26, 0.28);
  const pale = linearColor(1, 0.72, 0.66);
  const up = new THREE.Vector3(0, 1, 0);
  const twigs = [
    { from: [0, 0.1, 0], toward: [0.9, 0.35, 0.1], length: 1.4, radius: 0.16 },
    { from: [0.5, 0.28, 0.05], toward: [0.3, 1, -0.4], length: 0.75, radius: 0.1 },
    { from: [0.85, 0.4, 0.1], toward: [0.6, 0.9, 0.5], length: 0.6, radius: 0.08 },
    { from: [0.2, 0.18, 0.02], toward: [-0.5, 0.9, 0.5], length: 0.7, radius: 0.1 },
    { from: [-0.1, 0.1, 0], toward: [-1, 0.4, -0.3], length: 0.7, radius: 0.12 },
  ].map(({ from, toward, length, radius }) => {
    const direction = new THREE.Vector3(...toward).normalize();
    const twig = new THREE.CylinderGeometry(radius * 0.7, radius, length, 7, 2, false).translate(0, length / 2, 0);
    twig.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, direction));
    return twig.translate(...from);
  });
  return paint(mergeGeometries(twigs).translate(-0.3, 0, 0), (color, x, y) => color.copy(deep).lerp(pale, THREE.MathUtils.smoothstep(y, 0.25, 1.0) * 0.8 + 0.1 * Math.sin(x * 19)));
}

function buildScrapGeometry() {
  const rust = linearColor(0.55, 0.3, 0.14);
  const steel = linearColor(0.62, 0.62, 0.64);
  const capRed = linearColor(0.82, 0.16, 0.12);
  const nail = paint(new THREE.CylinderGeometry(0.07, 0.07, 1.5, 6).rotateZ(Math.PI / 2).rotateY(0.4).translate(0.1, 0.12, -0.2), (color, x) => color.copy(steel).lerp(rust, 0.4 + 0.4 * Math.sin(x * 9)));
  const nailHead = paint(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 10).rotateZ(Math.PI / 2).rotateY(0.4).translate(-0.6, 0.15, -0.5), (color) => color.copy(steel).lerp(rust, 0.5));
  const cap = new THREE.CylinderGeometry(0.42, 0.46, 0.18, 14, 1).translate(0.35, 0.1, 0.35);
  const capPositions = cap.attributes.position;
  for (let index = 0; index < capPositions.count; index++) {
    const angle = Math.atan2(capPositions.getZ(index) - 0.35, capPositions.getX(index) - 0.35);
    const crimp = 1 + 0.08 * Math.sin(angle * 21);
    capPositions.setX(index, 0.35 + (capPositions.getX(index) - 0.35) * crimp);
    capPositions.setZ(index, 0.35 + (capPositions.getZ(index) - 0.35) * crimp);
  }
  cap.computeVertexNormals();
  return mergeGeometries([nail, nailHead, paint(cap, (color, x, y) => color.copy(y > 0.15 ? capRed : steel))]);
}

function buildClothGeometry() {
  const red = linearColor(0.78, 0.14, 0.12);
  const white = linearColor(0.92, 0.88, 0.8);
  const rag = new THREE.PlaneGeometry(1.8, 1.4, 10, 8).rotateX(-Math.PI / 2);
  const positions = rag.attributes.position;
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    positions.setY(index, 0.12 + 0.18 * Math.sin(x * 4.1 + z * 2.3) * Math.cos(z * 3.7) + 0.1 * Math.sin(x * 9));
  }
  rag.computeVertexNormals();
  return paint(rag, (color, x, y, z) => color.copy(Math.sin(z * 9) > 0 ? red : white).multiplyScalar(0.75 + 0.5 * y));
}

function buildFishBoneGeometry() {
  const bone = linearColor(0.94, 0.92, 0.84);
  const parts = [paint(new THREE.CylinderGeometry(0.06, 0.04, 1.6, 6).rotateZ(Math.PI / 2).translate(0, 0.1, 0), (color) => color.copy(bone))];
  for (let rib = 0; rib < 6; rib++) for (const side of [-1, 1]) parts.push(paint(new THREE.CylinderGeometry(0.025, 0.02, 0.5, 4).rotateX(side * 1.1).translate(-0.5 + rib * 0.18, 0.12, side * 0.22), (color) => color.copy(bone)));
  parts.push(paint(new THREE.ConeGeometry(0.22, 0.45, 6).rotateZ(Math.PI / 2).translate(0.95, 0.14, 0), (color) => color.copy(bone)));
  return mergeGeometries(parts.map((part) => (part.index ? part.toNonIndexed() : part)));
}

function buildWaxGeometry() {
  const wax = linearColor(0.96, 0.9, 0.72);
  const stub = paint(new THREE.CylinderGeometry(0.32, 0.36, 0.7, 12).translate(0, 0.35, 0), (color, x, y) => color.copy(wax).multiplyScalar(0.85 + 0.2 * y));
  const drip = paint(new THREE.SphereGeometry(0.42, 10, 6).scale(1.3, 0.25, 1.1).translate(0.15, 0.05, 0.1), (color) => color.copy(wax));
  const wick = paint(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 4).translate(0, 0.8, 0), (color) => color.setRGB(0.05, 0.04, 0.03));
  return mergeGeometries([stub, drip, wick].map((part) => (part.index ? part.toNonIndexed() : part)));
}

function buildSeaGlassGeometry() {
  const tints = [linearColor(0.42, 0.78, 0.74), linearColor(0.46, 0.66, 0.9), linearColor(0.6, 0.82, 0.5)];
  const chips = [
    { scale: [0.62, 0.2, 0.44], at: [0, 0.12, 0], turn: 0.3, tint: 0 },
    { scale: [0.38, 0.16, 0.3], at: [0.62, 0.09, 0.32], turn: 1.4, tint: 1 },
    { scale: [0.3, 0.14, 0.22], at: [-0.5, 0.08, 0.42], turn: 2.2, tint: 2 },
  ].map(({ scale, at, turn, tint }) => paint(new THREE.IcosahedronGeometry(1, 1).scale(...scale).rotateY(turn).translate(...at), (color, x, y) => color.copy(tints[tint]).multiplyScalar(0.8 + 0.5 * THREE.MathUtils.smoothstep(y, 0.05, 0.3))));
  return mergeGeometries(chips);
}

const SPARKLE_VERTEX_GLSL = /* glsl */ `
attribute float aPhase;
uniform float uTime;
uniform float uPixelScale;
varying float vTwinkle;
void main() {
  vTwinkle = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * 3.1 + aPhase), 3.0);
  vec4 viewPosition = modelViewMatrix * vec4(position + vec3(0.0, 0.25 * sin(uTime * 1.4 + aPhase), 0.0), 1.0);
  gl_Position = projectionMatrix * viewPosition;
  gl_PointSize = uPixelScale * (0.55 + 0.45 * vTwinkle) / -viewPosition.z * (0.7 + -viewPosition.z / 50.0);
}
`;

const SPARKLE_FRAGMENT_GLSL = /* glsl */ `
uniform sampler2D tDepth;
uniform vec2 uInverseResolution;
varying float vTwinkle;
void main() {
  if (texture2D(tDepth, gl_FragCoord.xy * uInverseResolution).r < gl_FragCoord.z) discard;
  vec2 fromCenter = gl_PointCoord - 0.5;
  float cross = max(0.0, 1.0 - abs(fromCenter.x) * 26.0) * max(0.0, 1.0 - abs(fromCenter.y) * 2.4) + max(0.0, 1.0 - abs(fromCenter.y) * 26.0) * max(0.0, 1.0 - abs(fromCenter.x) * 2.4);
  float core = max(0.0, 1.0 - length(fromCenter) * 5.0);
  float halo = max(0.0, 1.0 - length(fromCenter) * 2.1);
  float glow = cross * 0.9 + core * core * 2.0 + halo * halo * 0.16;
  gl_FragColor = vec4(vec3(1.0, 0.82, 0.36) * glow * vTwinkle * 6.0, 1.0);
}
`;

export function createResources(scene, overlay, world, quality, savedNodes, starterSpots) {
  const random = createRandom(2024);
  const geometries = { shellBits: buildShellBitGeometry(), driftwood: buildDriftwoodGeometry(), seaLettuce: buildSeaLettuceGeometry(), kelp: buildKelpGeometry(), pebbles: buildPebblesGeometry(), clay: buildClayGeometry(), sand: buildSandGeometry(), pearls: buildPearlGeometry(), coral: buildCoralGeometry(), seaGlass: buildSeaGlassGeometry(), scrap: buildScrapGeometry(), cloth: buildClothGeometry(), fishBone: buildFishBoneGeometry(), wax: buildWaxGeometry() };
  const highTideMark = TIDE_MIDDLE + TIDE_AMPLITUDE;
  const accepts = {
    shellBits: (x, z, height) => !isOnReef(x, z) && !isInCamp(x, z) && height > TIDE_MIDDLE - 1.4 && height < highTideMark + 1.6 && world.retained.levelAt(x, z) - height < 0.2,
    driftwood: (x, z, height) => !isInCamp(x, z) && height > highTideMark + 0.4 && height < highTideMark + 3.6,
    seaLettuce: (x, z, height) => !isOnReef(x, z) && (world.retained.levelAt(x, z) - height > 0.2 || (height > TIDE_MIDDLE - 1.6 && height < TIDE_MIDDLE + 0.6)),
    kelp: (x, z, height) => !isOnReef(x, z) && !isInCamp(x, z) && height > TIDE_MIDDLE - 2.6 && height < TIDE_MIDDLE - 0.7,
    pebbles: (x, z, height) => !isOnReef(x, z) && !isInCamp(x, z) && height > highTideMark - 0.4 && height < highTideMark + 2.8,
    clay: (x, z, height) => !isOnReef(x, z) && !isInCamp(x, z) && height > TIDE_MIDDLE - 0.3 && height < TIDE_MIDDLE + 1.1 && world.retained.levelAt(x, z) - height < 0.2,
    sand: (x, z, height) => !isInCamp(x, z) && height > highTideMark + 1.2 && height < highTideMark + 5.5,
    pearls: (x, z, height) => !isOnReef(x, z) && world.retained.levelAt(x, z) - height > PEARL_MINIMUM_POOL_DEPTH,
    coral: (x, z, height) => isOnReef(x, z) && height < -1.6 && height > -3.6,
    seaGlass: (x, z, height) => isOnReef(x, z) && height > -3.0,
    scrap: (x, z) => isInCamp(x, z),
    cloth: (x, z) => isInCamp(x, z),
    fishBone: (x, z) => isInHold(x, z),
    wax: (x, z) => isInHold(x, z),
  };
  const transform = new THREE.Object3D();
  const nodes = [];
  const meshes = {};

  const sparklePositions = [];
  const sparklePhases = [];

  for (const [type, definition] of Object.entries(RESOURCE_TYPES)) {
    if (!definition.count) continue;
    const count = scaledCount(type, definition.count);
    const material = applySeaside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: { shellBits: 0.3, pearls: 0.3, seaGlass: 0.18, coral: 0.65, scrap: 0.4, wax: 0.5 }[type] ?? 0.9, side: THREE.DoubleSide }), { wetDarkening: 0.9, wetRoughness: { shellBits: 0.15, pearls: 0.15, seaGlass: 0.08, coral: 0.4 }[type] ?? 0.8, causticStrength: 1.2, chromaticCaustics: quality.chromaticCaustics, glow: type === 'seaLettuce' ? 0.14 : 0.22, glowPulse: true });
    const mesh = new THREE.InstancedMesh(geometries[type], material, count);
    mesh.castShadow = !REEF_TYPES.has(type) && !CAMP_TYPES.has(type) && !HOLD_TYPES.has(type);
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    meshes[type] = mesh;
    scene.add(mesh);
    for (let slot = 0; slot < count; slot++) {
      const node = { id: `${type}-${slot}`, type, slot, x: 0, y: 0, z: 0, heading: 0, size: 1, gathered: false, sparkleIndex: nodes.length };
      nodes.push(node);
      sparklePositions.push(0, -999, 0);
      sparklePhases.push(random() * 6.28);
    }
  }

  const sparkleGeometry = new THREE.BufferGeometry();
  sparkleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(sparklePositions, 3));
  sparkleGeometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(sparklePhases, 1));
  const sparkleUniforms = { uTime: { value: 0 }, uPixelScale: { value: 600 }, tDepth: overlay.uniforms.tDepth, uInverseResolution: overlay.uniforms.uInverseResolution };
  const sparkles = new THREE.Points(sparkleGeometry, new THREE.ShaderMaterial({ uniforms: sparkleUniforms, vertexShader: SPARKLE_VERTEX_GLSL, fragmentShader: SPARKLE_FRAGMENT_GLSL, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest: false }));
  sparkles.frustumCulled = false;
  sparkles.renderOrder = 2;
  overlay.scene.add(sparkles);

  const shownNodes = Object.fromEntries(Object.keys(meshes).map((type) => [type, []]));
  let shownAround = null;

  function writeInstance(node, x, y, z, scale) {
    const mesh = meshes[node.type];
    if (node.instanceIndex === undefined) return;
    transform.position.set(x, y, z);
    transform.rotation.set(0, node.heading, 0);
    transform.scale.setScalar(scale);
    transform.updateMatrix();
    mesh.setMatrixAt(node.instanceIndex, transform.matrix);
    mesh.instanceMatrix.needsUpdate = true;
  }

  function refresh(node) {
    writeInstance(node, node.x, node.gathered ? -999 : node.y, node.z, node.size);
    sparkleGeometry.attributes.position.setXYZ(node.sparkleIndex, node.x, node.gathered ? -999 : node.y + (node.type === 'seaLettuce' ? 1.7 : 1.05), node.z);
    sparkleGeometry.attributes.position.needsUpdate = true;
  }

  function showAround(x, z) {
    shownAround = { x, z };
    for (const [type, mesh] of Object.entries(meshes)) {
      for (const node of shownNodes[type]) node.instanceIndex = undefined;
      shownNodes[type] = nodes.filter((node) => node.type === type && Math.hypot(node.x - x, node.z - z) < SHOWN_RADIUS);
      shownNodes[type].forEach((node, index) => {
        node.instanceIndex = index;
        refresh(node);
      });
      mesh.count = shownNodes[type].length;
    }
  }

  function follow(x, z) {
    if (!shownAround || Math.hypot(x - shownAround.x, z - shownAround.z) > SHOWN_REFRESH_DISTANCE) showAround(x, z);
  }

  const searchAreaOf = (type) => (CAMP_TYPES.has(type) ? CAMP_AREA : HOLD_TYPES.has(type) ? HOLD_AREA : REEF_TYPES.has(type) ? REEF_AREA : PLAY_BOUNDS);

  function relocate(node, avoid) {
    const spot = world.randomSpot(random, (x, z, height) => accepts[node.type](x, z, height) && (HOLD_TYPES.has(node.type) || !isInHold(x, z)) && !nodes.some((other) => other !== node && !other.gathered && Math.hypot(other.x - x, other.z - z) < 5) && (!avoid || Math.hypot(avoid.x - x, avoid.z - z) > 14), 400, searchAreaOf(node.type));
    if (!spot) return false;
    Object.assign(node, { x: spot.x, y: spot.y, z: spot.z, heading: random() * Math.PI * 2, size: (node.type === 'shellBits' ? 0.6 : 0.85) + random() * 0.35, gathered: false });
    return true;
  }

  for (const node of nodes) {
    const saved = savedNodes && savedNodes[node.id];
    const starter = node.slot === 0 ? starterSpots[node.type] : null;
    if (saved) Object.assign(node, saved, { y: world.heightAt(saved.x, saved.z) });
    else if (starter) Object.assign(node, { x: starter.x, y: world.heightAt(starter.x, starter.z), z: starter.z, heading: random() * Math.PI * 2, size: 1.1 });
    else if (!relocate(node, null)) node.gathered = true;
    refresh(node);
  }
  showAround(HOME_FOCUS.x, HOME_FOCUS.z);

  function hold(node, x, y, z, scale) {
    writeInstance(node, x, y, z, node.size * scale);
    sparkleGeometry.attributes.position.setXYZ(node.sparkleIndex, 0, -999, 0);
    sparkleGeometry.attributes.position.needsUpdate = true;
  }

  function release(node) {
    refresh(node);
  }

  function gather(node) {
    node.gathered = true;
    refresh(node);
  }

  function washAshore(avoid) {
    let returned = 0;
    for (const node of nodes) {
      if (!node.gathered) continue;
      if (relocate(node, avoid)) returned++;
      refresh(node);
    }
    if (shownAround) showAround(shownAround.x, shownAround.z);
    return returned;
  }

  function update(time, pixelScale) {
    sparkleUniforms.uTime.value = time;
    sparkleUniforms.uPixelScale.value = pixelScale;
  }

  function serialize() {
    const saved = {};
    for (const node of nodes) saved[node.id] = { x: node.x, z: node.z, heading: node.heading, size: node.size, gathered: node.gathered };
    return saved;
  }

  function setReefVisible(visible) {
    for (const type of REEF_TYPES) meshes[type].visible = visible;
  }

  function setCampVisible(visible) {
    for (const type of CAMP_TYPES) meshes[type].visible = visible;
  }

  function setHoldVisible(visible) {
    for (const type of HOLD_TYPES) meshes[type].visible = visible;
  }

  return { nodes, gather, hold, release, washAshore, update, serialize, setReefVisible, setCampVisible, setHoldVisible, follow };
}
