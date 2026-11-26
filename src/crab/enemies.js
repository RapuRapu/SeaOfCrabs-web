import * as THREE from 'three';
import { PLAY_BOUNDS } from './worldBounds.js';
import { levelOf, labelOf, isLooter } from './looting.js';
import { createHermit } from './hermit.js';
import { SHELLS } from './gear.js';
import { buildHeldWeapon, weaponModelAvailable, dressWeaponMaterial, buildShellModel, dressShellMaterial, shellModelAvailable } from './hermitAsset.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { applySeaside } from './seaside.js';
import { random } from './random.js';
import { difficultyOf } from './progression.js';
import { creatureAssetAvailable, createCreature } from './creatureAssets.js';
import { buildCockroachGeometry, buildCookLegGeometry, buildCleaverGeometry, LINE_TELEGRAPH_FRAGMENT_GLSL, buildRatGeometry, buildCatGeometry, buildMorayGeometry, buildOctopusGeometry, buildMantisGeometry, buildLobsterBodyGeometry, buildLobsterClawGeometry, TELEGRAPH_VERTEX_GLSL, TELEGRAPH_FRAGMENT_GLSL, INK_FRAGMENT_GLSL } from './reefCreatures.js';

export const PLAYER_BODY_RADIUS = 0.9;
export const LEASH_DISTANCE = 35;
const ENEMY_ACTIVE_RADIUS = 140;
const LEASH_GRACE_SECONDS = 3;
const REGEN_DELAY_SECONDS = 6;
const REGEN_SHARE_PER_SECOND = 0.03;
export const WORLD_LABEL_TOP_PIXELS = 128;

const MINIBOSS_RESPAWN_SECONDS = 900;
export const ENEMY_KINDS = {
  sandHopper: { label: 'Sand hopper', level: 1, drops: ['seaLettuce', 'driftwood'], health: 12, attack: 2, defense: 0, attackInterval: 1.2, windup: 0.45, speed: 5.5, radius: 0.45, temperament: 'passive', sightRange: 0, experience: 10, pearlChance: 0, respawnSeconds: 60, barHeight: 1.4 },
  shoreCrab: { label: 'Shore crab', level: 2, drops: ['shellBits', 'seaLettuce'], health: 30, attack: 5, defense: 2, attackInterval: 1.5, windup: 0.6, speed: 5.2, radius: 0.95, temperament: 'aggressive', sightRange: 9, experience: 25, pearlChance: 0.1, respawnSeconds: 90, barHeight: 2.0 },
  gull: { label: 'Gull', level: 9, health: 350, attack: 27, defense: 0, attackInterval: 2.2, windup: 1.0, speed: 5.5, radius: 2.4, temperament: 'aggressive', sightRange: 0, experience: 300, pearlChance: 0, respawnSeconds: MINIBOSS_RESPAWN_SECONDS, barHeight: 11.5, flies: true },
  moray: { label: 'Moray eel', level: 6, drops: ['coral'], health: 105, attack: 19, defense: 3, attackInterval: 1.6, windup: 0.3, speed: 0, radius: 0.9, temperament: 'lurker', sightRange: 0, strikeReach: 2.4, retreatSeconds: 0.8, experience: 70, pearlChance: 0.25, respawnSeconds: 120, barHeight: 3.8, reef: true },
  octopus: { label: 'Octopus', level: 7, drops: ['seaGlass', 'coral'], health: 205, attack: 14, defense: 4, attackInterval: 2.0, windup: 0.7, speed: 3.0, radius: 1.5, temperament: 'aggressive', sightRange: 8, inkEvery: 3, inkSlowSeconds: 3, inkSlowFactor: 0.5, experience: 110, pearlChance: 0.2, respawnSeconds: 150, barHeight: 3.0, reef: true },
  mantisShrimp: { label: 'Mantis shrimp', level: 5, drops: ['coral', 'shellBits'], health: 63, attack: 13, defense: 1, attackInterval: 1.8, windup: 0.35, speed: 6.5, radius: 0.75, temperament: 'aggressive', sightRange: 9, followUpSeconds: 0.25, experience: 60, pearlChance: 0.1, respawnSeconds: 90, barHeight: 1.7, reef: true },
  rat: { label: 'Rat', level: 8, drops: ['scrap', 'cloth'], health: 130, attack: 22, defense: 6, attackInterval: 1.4, windup: 0.4, speed: 6.2, radius: 1.3, bodyReach: 2.4, temperament: 'aggressive', sightRange: 10, experience: 140, pearlChance: 0.15, respawnSeconds: 120, barHeight: 3.2, camp: true },
  shipCat: { label: "Ship's cat", level: 11, health: 1300, attack: 36, defense: 12, attackInterval: 2.4, windup: 1.0, speed: 4.2, radius: 2.9, temperament: 'aggressive', sightRange: 0, telegraph: { reach: 3.8, radius: 3.0, pounceEvery: 3, pounceRange: 16, pounceRadius: 3.4, pounceWindup: 1.5 }, experience: 1500, pearlChance: 1, pearlCount: 3, respawnSeconds: MINIBOSS_RESPAWN_SECONDS, barHeight: 7.5, boss: true, camp: true },
  cockroach: { label: 'Cockroach', level: 9, drops: ['wax', 'fishBone'], health: 90, attack: 26, defense: 10, attackInterval: 1.0, windup: 0.25, speed: 7.5, radius: 1.1, bodyReach: 2.2, temperament: 'aggressive', sightRange: 9, experience: 160, pearlChance: 0.1, respawnSeconds: 100, barHeight: 2.4, hold: true },
  cook: { label: 'The Cook', level: 13, health: 1550, attack: 48, defense: 16, attackInterval: 2.6, windup: 1.3, speed: 4.3, radius: 3.6, temperament: 'aggressive', sightRange: 0, nerves: true, flees: true, telegraph: { shape: 'line', lineLength: 24, lineWidth: 3.6, lineRange: 15, stompEvery: 3, stompRadius: 7.5, stompWindup: 1.1 }, experience: 2000, pearlChance: 1, pearlCount: 4, respawnSeconds: 480, barHeight: 13, boss: true, hold: true, dailyBoss: true },
  rivalHermit: { label: 'Rival hermit crab', level: 4, drops: ['shellBits', 'driftwood'], health: 70, attack: 9, defense: 4, attackInterval: 1.4, windup: 0.5, speed: 5.0, radius: 1.25, bodyReach: 1.8, temperament: 'aggressive', sightRange: 8, experience: 50, pearlChance: 0.15, respawnSeconds: 120, barHeight: 3.9, ownShell: 'cone' },
  giantLobster: { label: 'Giant lobster', level: 11, health: 1040, attack: 30, defense: 8, attackInterval: 2.6, windup: 1.2, speed: 3.2, radius: 3.0, temperament: 'aggressive', sightRange: 0, telegraph: { reach: 4.4, radius: 3.0 }, experience: 800, pearlChance: 1, pearlCount: 2, respawnSeconds: MINIBOSS_RESPAWN_SECONDS, barHeight: 7.5, boss: true, reef: true },
};

const MINIMUM_RESPAWN_DISTANCE = 25;
const WANDER_RADIUS = 6;
const REPATH_SECONDS = 0.5;
const DEATH_SINK_SECONDS = 1.7;
const PACK_ALERT_RANGE = 12;
const STRIKE_SOUNDS = { cockroach: 'crabClatter', cook: 'hitThud', rat: 'crabClatter', shipCat: 'hitThud', sandHopper: 'hopperJump', shoreCrab: 'crabClatter', gull: 'wingFlap', moray: 'crabClatter', octopus: 'fishPlop', mantisShrimp: 'clawSnap', giantLobster: 'crabClatter', rivalHermit: 'crabClatter' };
const IDLE_SOUNDS = { sandHopper: { name: 'hopperChirp', perSecond: 0.12 }, gull: { name: 'gullCall', perSecond: 0.06 } };
const ENEMY_STRIKE_REACH = 1.9;
const OUT_OF_REACH_RESET_SECONDS = 1;
const PACK_SPREAD = 3.5;
const HURT_SECONDS = 0.45;
const KNOCKBACK_BY_KIND = { cockroach: 0.3, cook: 0, rat: 0.2, shipCat: 0, sandHopper: 0.6, shoreCrab: 0.25, gull: 0.1, moray: 0, octopus: 0.15, mantisShrimp: 0.4, giantLobster: 0, rivalHermit: 0.25 };
const MIN_PICK_RADIUS_PIXELS = 40;
const PICK_BODY_MARGIN = 1.25;
const pickEdge = new THREE.Vector3();
const cameraRight = new THREE.Vector3();
const INK_CLOUD_RADIUS = 3.2;
const MORAY_SCALE = 1.45;
const RETREAT_COOLDOWN_SECONDS = 5;
const LEAP_SECONDS = 0.35;
const TELEGRAPH_LIFT = 0.3;
const CHOP_LINGER_SECONDS = 0.6;
const CLEAVER_HOVER_HEIGHT = 18;
const CLEAVER_SHOW_PROGRESS = 0.8;
const RESTING_LABEL_DISTANCE = 90;
const CAT_SCALE = 0.62;
const LABEL_EDGE_PIXELS = 72;
const LABEL_SPACING_X = 120;
const LABEL_SPACING_Y = 26;
const COOK_STANCE = 3.4;
const COOK_PATROL_SHARE = 0.7;
const COOK_ACTIVITY_SECONDS = [4, 8];
const COOK_FLEE_SPEED = 12;
const COOK_FLEE_SECONDS = 9;
const COOK_STRIDE_UNITS = 11;
const COOK_CHOP_TWIST = 0.15;
const COOK_WALKING_SHARE = 0.25;
const COOK_STUCK_SECONDS = 2;
const COOK_FLEE_ANIMATION_RATE = 1.15;
const LOBSTER_SCALE = 1.35;
const LOBSTER_CLAW_SCALE = 1.4;
const LOBSTER_CLAW_REACH = 1.35;
const MANTIS_SINK_SHARE = 0.12;
const FLASH_STRENGTH = 0.3;
const GULL_CIRCLE_RADIUS = 16;
const GULL_CIRCLE_ALTITUDE = 30;
const GULL_FLIGHT_SPEED = 16;
const GULL_LANDING_OFFSET = 6;
const CREATURE_SCALE = { sandHopper: 1, shoreCrab: 1, gull: 1 };
const RIVAL_HERMIT_SCALE = 0.95;
const RIVAL_CULL_RADIUS = 4;
const RIVAL_WEAPON_SCALE = 1.5;
const LOOTER_LABEL_LIFT = 1.15;
const LABEL_CLEARANCE = 1.1;
const LOOT_SHELL_BRIGHTNESS = 1.35;
const LOOT_WEAPON_LIFT_BY_KIND = { giantLobster: 1.0, shoreCrab: 0.5 };
const LOOT_WEAPON_SPLAY_BY_KIND = { shoreCrab: 1.8 };
const RIVAL_HERMIT_TINT = [0.45, 0.6, 1.0];
const RIVAL_GROUND = new THREE.Vector3(0, 1, 0);
const LOOT_WEAPON_SCALE = { shoreCrab: 1.0, giantLobster: 0.9 };
const LOOT_GRIP_ALONG_JAW = { giantLobster: 0.6, shoreCrab: 0.4 };
const SMALL_HAND_WEAPON_SCALE = 0.75;
const DEFAULT_GRIP_ALONG_JAW = 0.55;
const LOOT_WEAPON_SPLAY = 0.6;
const LOOT_WEAPON_LIFT = 0.15;
const LOOT_SHELL_FIT = { octopus: { size: 0.19, rotation: [0.3, 2.6, 1.4] } };

const linearColor = (red, green, blue) => new THREE.Color().setRGB(red, green, blue, THREE.SRGBColorSpace);

function painted(geometry, colorAt) {
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const color = new THREE.Color();
  for (let index = 0; index < positions.count; index++) {
    colorAt(color, positions.getX(index), positions.getY(index), positions.getZ(index));
    colors.set([color.r, color.g, color.b], index * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  if (geometry.attributes.uv) geometry.deleteAttribute('uv');
  return geometry.index ? geometry.toNonIndexed() : geometry;
}

const NAME_VISIBLE_DISTANCE = 16;
const solid = (geometry, color) => painted(geometry, (target) => target.copy(color));

function buildHopperGeometry() {
  const shell = linearColor(0.78, 0.72, 0.6);
  const stripe = linearColor(0.5, 0.44, 0.36);
  const dark = linearColor(0.06, 0.05, 0.05);
  const parts = [];
  const segments = 7;
  for (let segment = 0; segment < segments; segment++) {
    const share = segment / (segments - 1);
    const angle = -0.9 + share * 1.9;
    const radius = 0.17 * (1 - 0.45 * Math.abs(share - 0.35));
    const sphere = new THREE.SphereGeometry(radius, 10, 7).scale(0.8, 1, 0.75).translate(0, Math.cos(angle) * 0.28 + 0.02, Math.sin(angle) * 0.42 - 0.05);
    parts.push(painted(sphere, (color, x, y) => color.copy(shell).lerp(stripe, segment % 2 ? 0.45 : 0.1).multiplyScalar(0.8 + 0.25 * THREE.MathUtils.smoothstep(y, 0.1, 0.45))));
  }
  for (const side of [-1, 1]) {
    parts.push(solid(new THREE.SphereGeometry(0.045, 6, 5).translate(side * 0.1, 0.32, 0.4), dark));
    parts.push(solid(new THREE.ConeGeometry(0.018, 0.55, 4).rotateX(0.9).rotateZ(-side * 0.35).translate(side * 0.12, 0.42, 0.62), stripe));
    for (let pair = 0; pair < 3; pair++) parts.push(solid(new THREE.ConeGeometry(0.025, 0.32, 4).rotateX(Math.PI).rotateZ(side * 0.5).translate(side * 0.16, 0.08, 0.2 - pair * 0.2), stripe));
  }
  return mergeGeometries(parts);
}

function buildShoreCrabBody() {
  const olive = linearColor(0.36, 0.46, 0.18);
  const mottle = linearColor(0.55, 0.58, 0.26);
  const belly = linearColor(0.78, 0.6, 0.22);
  const dark = linearColor(0.05, 0.05, 0.04);
  const carapace = new THREE.SphereGeometry(1, 28, 14).scale(0.95, 0.34, 0.72).translate(0, 0.62, 0);
  const positions = carapace.attributes.position;
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    if (z > 0) positions.setZ(index, z * (1 - 0.18 * Math.pow(Math.abs(x) / 0.95, 2)) - 0.08 * Math.pow(Math.abs(x), 3));
  }
  carapace.computeVertexNormals();
  const parts = [painted(carapace, (color, x, y, z) => color.copy(olive).lerp(mottle, 0.5 + 0.5 * Math.sin(x * 11 + z * 7) * Math.sin(z * 13 - x * 4)).lerp(belly, THREE.MathUtils.smoothstep(0.62 - y, 0.0, 0.2)))];
  for (const side of [-1, 1]) {
    for (let tooth = 0; tooth < 4; tooth++) {
      const angle = 0.55 + tooth * 0.22;
      parts.push(solid(new THREE.ConeGeometry(0.07, 0.2, 5).rotateZ(-side * Math.PI / 2).rotateY(side * (Math.PI / 2 - angle)).translate(side * Math.sin(angle) * 0.92, 0.66, Math.cos(angle) * 0.6), olive));
    }
    parts.push(solid(new THREE.CylinderGeometry(0.04, 0.05, 0.22, 5).translate(side * 0.18, 0.86, 0.6), olive));
    parts.push(solid(new THREE.SphereGeometry(0.07, 8, 6).translate(side * 0.18, 0.98, 0.62), dark));
  }
  return mergeGeometries(parts);
}

function buildShoreCrabLeg() {
  const olive = linearColor(0.4, 0.48, 0.2);
  const tip = linearColor(0.28, 0.32, 0.13);
  const upper = painted(new THREE.CapsuleGeometry(0.075, 0.6, 3, 6).rotateZ(Math.PI / 2).translate(0.35, 0.12, 0), (color) => color.copy(olive));
  const lower = painted(new THREE.ConeGeometry(0.07, 0.75, 6).rotateZ(Math.PI - 0.5).translate(0.82, -0.18, 0), (color, x) => color.copy(olive).lerp(tip, THREE.MathUtils.smoothstep(x, 0.8, 1.05)));
  return mergeGeometries([upper, lower]);
}

function buildShoreCrabClaw() {
  const olive = linearColor(0.38, 0.47, 0.18);
  const dark = linearColor(0.12, 0.1, 0.07);
  const arm = solid(new THREE.CapsuleGeometry(0.1, 0.5, 3, 7).rotateX(Math.PI / 2).translate(0, 0, 0.25), olive);
  const palm = solid(new THREE.SphereGeometry(0.26, 12, 9).scale(0.8, 0.75, 1.3).translate(0, 0.02, 0.72), olive);
  const fixedFinger = painted(new THREE.ConeGeometry(0.09, 0.42, 7).rotateX(Math.PI / 2).translate(0.02, -0.06, 1.12), (color, x, y, z) => color.copy(olive).lerp(dark, THREE.MathUtils.smoothstep(z, 1.0, 1.3)));
  const movingFinger = painted(new THREE.ConeGeometry(0.08, 0.4, 7).rotateX(Math.PI / 2 - 0.35).translate(0.02, 0.12, 1.1), (color, x, y, z) => color.copy(olive).lerp(dark, THREE.MathUtils.smoothstep(z, 1.0, 1.3)));
  return mergeGeometries([arm, palm, fixedFinger, movingFinger]);
}

function buildGullBody() {
  const white = linearColor(0.95, 0.95, 0.93);
  const grey = linearColor(0.6, 0.64, 0.68);
  const black = linearColor(0.05, 0.05, 0.06);
  const beakYellow = linearColor(0.96, 0.78, 0.18);
  const beakRed = linearColor(0.85, 0.15, 0.08);
  const legPink = linearColor(0.92, 0.62, 0.5);
  const bodyShape = new THREE.SphereGeometry(1, 28, 18).scale(1.75, 1.75, 4.4);
  const bodyPositions = bodyShape.attributes.position;
  for (let index = 0; index < bodyPositions.count; index++) {
    const z = bodyPositions.getZ(index);
    const taper = 1 - 0.45 * THREE.MathUtils.smoothstep(-z, 0.5, 4.4);
    bodyPositions.setXYZ(index, bodyPositions.getX(index) * taper, bodyPositions.getY(index) * taper + z * 0.12, z);
  }
  bodyShape.computeVertexNormals();
  const body = painted(bodyShape.translate(0, 1.4, 0), (color, x, y) => color.copy(white).lerp(grey, THREE.MathUtils.smoothstep(y, 2.4, 3.1) * 0.55));
  const neckShape = new THREE.CylinderGeometry(1.15, 1.55, 2.8, 18, 4).rotateX(-0.5).translate(0, 2.95, 3.05);
  const neck = solid(neckShape, white);
  const head = solid(new THREE.SphereGeometry(1.3, 20, 14).scale(0.92, 0.9, 1.3).translate(0, 4.15, 4.05), white);
  const foldedWings = [-1, 1].flatMap((side) => [
    painted(new THREE.SphereGeometry(1, 16, 12).scale(0.42, 0.95, 3.4).rotateX(-0.12).rotateY(side * 0.06).translate(side * 1.32, 2.15, -0.6), (color, x, y, z) => color.copy(grey).multiplyScalar(0.92 + 0.12 * THREE.MathUtils.smoothstep(y, 1.6, 2.9))),
    painted(new THREE.ConeGeometry(0.42, 3.0, 8).rotateX(-Math.PI / 2 - 0.12).scale(1, 0.6, 1).translate(side * 0.9, 2.35, -4.6), (color, x, y, z) => color.copy(black).lerp(white, THREE.MathUtils.smoothstep(-z, 5.4, 5.6) * 0.6)),
  ]);
  const beak = solid(new THREE.ConeGeometry(0.42, 2.3, 10).rotateX(Math.PI / 2).scale(0.75, 1, 1).translate(0, 3.75, 6.0), beakYellow);
  const beakSpot = solid(new THREE.SphereGeometry(0.2, 8, 6).translate(0, 3.45, 6.3), beakRed);
  const eyeRing = linearColor(0.96, 0.82, 0.3);
  const eyes = [-1, 1].flatMap((side) => [solid(new THREE.SphereGeometry(0.27, 10, 8).translate(side * 1.02, 4.4, 4.5), eyeRing), solid(new THREE.SphereGeometry(0.17, 8, 6).translate(side * 1.13, 4.42, 4.55), black)]);
  const tail = painted(new THREE.ConeGeometry(1.25, 3.2, 8).rotateX(-Math.PI / 2).scale(1, 0.35, 1).translate(0, 1.7, -5.4), (color, x, y, z) => color.copy(grey).lerp(black, THREE.MathUtils.smoothstep(-z, 6.0, 6.8)));
  const legs = [-1, 1].flatMap((side) => [
    solid(new THREE.CylinderGeometry(0.24, 0.3, 4.4, 7).translate(side * 0.85, -2.0, 0.4), legPink),
    solid(new THREE.SphereGeometry(0.34, 8, 6).translate(side * 0.85, -2.1, 0.4), legPink),
    solid(new THREE.ConeGeometry(0.85, 0.3, 3).rotateY(Math.PI / 6).scale(1, 1, 1.5).translate(side * 0.85, -4.05, 1.0), legPink),
  ]);
  return mergeGeometries([body, neck, head, beak, beakSpot, ...eyes, tail, ...legs, ...foldedWings]);
}

function wingShape(span, chord) {
  const shape = new THREE.Shape();
  shape.moveTo(0, -chord * 0.5);
  shape.quadraticCurveTo(span * 0.5, -chord * 0.62, span, -chord * 0.1);
  shape.lineTo(span * 0.96, chord * 0.12);
  shape.quadraticCurveTo(span * 0.5, chord * 0.55, 0, chord * 0.5);
  shape.closePath();
  return shape;
}

function buildGullWing(side) {
  const grey = linearColor(0.6, 0.64, 0.68);
  const black = linearColor(0.06, 0.06, 0.07);
  const white = linearColor(0.95, 0.95, 0.93);
  const span = 11;
  const geometry = new THREE.ShapeGeometry(wingShape(span, 3.4), 12).rotateX(Math.PI / 2);
  const flat = painted(geometry, (color, x, y, z) => {
    const tipShare = THREE.MathUtils.smoothstep(x, span * 0.72, span * 0.8);
    const mirror = (0.5 + 0.5 * Math.sin(x * 2.6)) * THREE.MathUtils.smoothstep(x, span * 0.82, span * 0.86);
    color.copy(grey).lerp(black, tipShare).lerp(white, mirror * 0.7 * tipShare);
  });
  const thickness = flat.clone().translate(0, -0.12, 0);
  const wing = mergeGeometries([flat, thickness]);
  if (side < 0) wing.scale(-1, 1, 1);
  return wing;
}

const GULL_SHADOW_SPAN = 30;

function createGullShadowTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  context.filter = 'blur(3px)';
  context.fillStyle = '#fff';
  context.translate(size / 2, size / 2);
  context.beginPath();
  context.ellipse(0, 2, 10, 40, 0, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.arc(0, -40, 9, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.moveTo(-9, 34);
  context.lineTo(-7, 60);
  context.lineTo(7, 60);
  context.lineTo(9, 34);
  context.fill();
  for (const side of [-1, 1]) {
    context.beginPath();
    context.moveTo(side * 6, -14);
    context.bezierCurveTo(side * 44, -24, side * 80, -14, side * 120, 26);
    context.bezierCurveTo(side * 84, 8, side * 44, 2, side * 6, 8);
    context.closePath();
    context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

function createGullModel(scene, quality) {
  const material = applySeaside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), { chromaticCaustics: quality.chromaticCaustics, wetDarkening: 0.85 });
  const wingMaterial = applySeaside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, side: THREE.DoubleSide }), { chromaticCaustics: quality.chromaticCaustics, wetDarkening: 0.85 });
  const root = new THREE.Group();
  const torso = new THREE.Group();
  torso.position.y = 4.2;
  const body = new THREE.Mesh(buildGullBody(), material);
  torso.add(body);
  const wings = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 1.35, 2.5, 1.2);
    const mesh = new THREE.Mesh(buildGullWing(side), wingMaterial);
    pivot.add(mesh);
    torso.add(pivot);
    return { pivot, mesh, side };
  });
  root.add(torso);
  for (const mesh of [body, ...wings.map((wing) => wing.mesh)]) mesh.castShadow = true;
  scene.add(root);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(GULL_SHADOW_SPAN, GULL_SHADOW_SPAN).rotateX(-Math.PI / 2).rotateY(Math.PI), new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: createGullShadowTexture(), transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false }));
  shadow.renderOrder = 1;
  scene.add(shadow);
  return { root, torso, wings, shadow, materials: [material, wingMaterial] };
}

export function createEnemies({ scene, world, navigation, quality, spawnTable, labelParent, onAttackPlayer, onKilled, onAlert = () => {}, onSound = () => {}, onInk = () => {}, onDodge = () => {}, onWarn = () => {}, bossAwake = () => true, bossReturnText = () => null }) {
  const hopperMaterial = applySeaside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45 }), { chromaticCaustics: quality.chromaticCaustics, wetDarkening: 0.6, wetRoughness: 0.1, instanceFlash: true });
  const crabMaterial = applySeaside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38 }), { chromaticCaustics: quality.chromaticCaustics, wetDarkening: 0.6, wetRoughness: 0.1, instanceFlash: true });
  const counts = Object.fromEntries(Object.keys(ENEMY_KINDS).map((kind) => [kind, spawnTable.filter((entry) => entry.kind === kind).reduce((sum, entry) => sum + entry.count, 0)]));
  const hopperMesh = new THREE.InstancedMesh(buildHopperGeometry(), hopperMaterial, Math.max(1, counts.sandHopper));
  const crabBodyMesh = new THREE.InstancedMesh(buildShoreCrabBody(), crabMaterial, Math.max(1, counts.shoreCrab));
  const crabLegMesh = new THREE.InstancedMesh(buildShoreCrabLeg(), crabMaterial, Math.max(1, counts.shoreCrab * 8));
  const crabClawMesh = new THREE.InstancedMesh(buildShoreCrabClaw(), crabMaterial, Math.max(1, counts.shoreCrab * 2));
  const reefMaterial = applySeaside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42 }), { chromaticCaustics: quality.chromaticCaustics, wetDarkening: 0.5, wetRoughness: 0.12, instanceFlash: true });
  const morayMesh = new THREE.InstancedMesh(buildMorayGeometry(), reefMaterial, Math.max(1, counts.moray));
  const octopusMesh = new THREE.InstancedMesh(buildOctopusGeometry(), reefMaterial, Math.max(1, counts.octopus));
  const mantisMesh = new THREE.InstancedMesh(buildMantisGeometry(), reefMaterial, Math.max(1, counts.mantisShrimp));
  const lobsterBodyMesh = new THREE.InstancedMesh(buildLobsterBodyGeometry(), reefMaterial, Math.max(1, counts.giantLobster));
  const lobsterClawMesh = new THREE.InstancedMesh(buildLobsterClawGeometry(), reefMaterial, Math.max(1, counts.giantLobster * 2));
  const ratMesh = new THREE.InstancedMesh(buildRatGeometry(), reefMaterial, Math.max(1, counts.rat));
  const catMaterial = applySeaside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }), { cutaway: 'soft', chromaticCaustics: quality.chromaticCaustics, wetDarkening: 0.5, wetRoughness: 0.2, instanceFlash: true });
  const catMesh = new THREE.InstancedMesh(buildCatGeometry().scale(CAT_SCALE, CAT_SCALE, CAT_SCALE), catMaterial, Math.max(1, counts.shipCat));
  const campMeshes = [ratMesh, catMesh];
  const cockroachMesh = new THREE.InstancedMesh(buildCockroachGeometry(), reefMaterial, Math.max(1, counts.cockroach));
  const cookMaterial = applySeaside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), { cutaway: true, chromaticCaustics: quality.chromaticCaustics, wetDarkening: 0.4, wetRoughness: 0.3, instanceFlash: true });
  const cookLegMesh = new THREE.InstancedMesh(buildCookLegGeometry(), cookMaterial, Math.max(1, counts.cook * 2));
  const cleaverMesh = new THREE.InstancedMesh(buildCleaverGeometry(), cookMaterial, Math.max(1, counts.cook));
  const cookModelMeshes = [cookLegMesh, cleaverMesh];
  const holdMeshes = creatureAssetAvailable('cook') ? [cockroachMesh] : [cockroachMesh, ...cookModelMeshes];
  if (creatureAssetAvailable('cook')) for (const mesh of cookModelMeshes) mesh.visible = false;
  const reefMeshes = [morayMesh, octopusMesh, mantisMesh, lobsterBodyMesh, lobsterClawMesh];
  const shadowless = new Set([morayMesh, mantisMesh, lobsterClawMesh]);
  const allMeshes = [hopperMesh, crabBodyMesh, crabLegMesh, crabClawMesh, ...reefMeshes, ...campMeshes, ...holdMeshes];
  const MODEL_REPLACES = {
    sandHopper: { meshes: [hopperMesh] },
    shoreCrab: { meshes: [crabBodyMesh, crabLegMesh, crabClawMesh] },
    cockroach: { meshes: [cockroachMesh], region: 'hold', scale: 0.85 },
    rat: { meshes: [ratMesh], region: 'camp', scale: 0.85 },
    shipCat: { meshes: [catMesh], region: 'camp', scale: 1 },
    moray: { meshes: [morayMesh], region: 'reef', scale: MORAY_SCALE },
    octopus: { meshes: [octopusMesh], region: 'reef', scale: 1 },
    mantisShrimp: { meshes: [mantisMesh], region: 'reef', scale: 1.25 },
    giantLobster: { meshes: [lobsterBodyMesh, lobsterClawMesh], region: 'reef', scale: LOBSTER_SCALE * LOBSTER_CLAW_REACH },
  };
  const replacedByModels = Object.entries(MODEL_REPLACES).filter(([kind]) => creatureAssetAvailable(kind)).flatMap(([, entry]) => entry.meshes);
  const replacedMeshes = new Set(replacedByModels);
  const regionVisible = { reef: true, camp: true, hold: true };

  function modelScale(kind, creature) {
    const entry = MODEL_REPLACES[kind];
    if (!entry || !entry.scale) return 1;
    const geometry = entry.meshes[0].geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const proceduralLength = (geometry.boundingBox.max.z - geometry.boundingBox.min.z) * entry.scale;
    return proceduralLength / creature.length;
  }
  const flatDisc = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const telegraphMaterial = new THREE.ShaderMaterial({ uniforms: { uProgress: { value: 0 }, uOpacity: { value: 0 } }, vertexShader: TELEGRAPH_VERTEX_GLSL.replace('position.xy', 'position.xz'), fragmentShader: TELEGRAPH_FRAGMENT_GLSL, transparent: true, depthWrite: false, depthTest: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const telegraphMesh = new THREE.Mesh(flatDisc, telegraphMaterial);
  telegraphMesh.renderOrder = 4;
  telegraphMesh.visible = false;
  const inkMaterial = new THREE.ShaderMaterial({ uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 } }, vertexShader: TELEGRAPH_VERTEX_GLSL.replace('position.xy', 'position.xz'), fragmentShader: INK_FRAGMENT_GLSL, transparent: true, depthWrite: false, depthTest: false });
  const inkMesh = new THREE.Mesh(flatDisc, inkMaterial);
  inkMesh.renderOrder = 4;
  inkMesh.visible = false;
  const lineTelegraphMaterial = new THREE.ShaderMaterial({ uniforms: { uProgress: { value: 0 }, uOpacity: { value: 1 } }, vertexShader: TELEGRAPH_VERTEX_GLSL.replace('position.xy', 'position.xz'), fragmentShader: LINE_TELEGRAPH_FRAGMENT_GLSL, transparent: true, depthWrite: false, depthTest: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const lineTelegraphMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2, 1, 12).rotateX(-Math.PI / 2), lineTelegraphMaterial);
  lineTelegraphMesh.visible = false;
  scene.add(telegraphMesh, inkMesh, lineTelegraphMesh);
  const ink = { x: 0, z: 0, until: -1, duration: 1 };
  for (const mesh of replacedByModels) mesh.visible = false;
  for (const mesh of allMeshes) {
    mesh.castShadow = !shadowless.has(mesh);
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.geometry.setAttribute('aFlash', new THREE.InstancedBufferAttribute(new Float32Array(mesh.count), 1));
    for (let index = 0; index < mesh.count; index++) mesh.setMatrixAt(index, new THREE.Matrix4().makeScale(0, 0, 0));
    scene.add(mesh);
  }

  const list = [];
  const transform = new THREE.Object3D();
  const parentMatrix = new THREE.Matrix4();
  const partMatrix = new THREE.Matrix4();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  const labelPoint = new THREE.Vector3();
  let nextId = 1;
  let calmUntil = 0;

  function spawnSpot(entry, avoid, near = null) {
    if (entry.spotsFrom) {
      const free = entry.spotsFrom(world).filter((spot) => !list.some((other) => other.entry === entry && other.state !== 'dead' && other.home && Math.hypot(other.home.x - spot.x, other.home.z - spot.z) < 1) && !(avoid && Math.hypot(avoid.x - spot.x, avoid.z - spot.z) < MINIMUM_RESPAWN_DISTANCE));
      return free.length ? free[Math.floor(random() * free.length)] : null;
    }
    for (let attempt = 0; attempt < 600; attempt++) {
      const x = near ? near.x + (random() * 2 - 1) * PACK_SPREAD : THREE.MathUtils.lerp(PLAY_BOUNDS.minX, PLAY_BOUNDS.maxX, random());
      const z = near ? near.z + (random() * 2 - 1) * PACK_SPREAD : THREE.MathUtils.lerp(PLAY_BOUNDS.minZ, PLAY_BOUNDS.maxZ, random());
      if (!world.isWalkable(x, z)) continue;
      const height = world.heightAt(x, z);
      if (!entry.accept(world, x, z, height)) continue;
      if (avoid && Math.hypot(avoid.x - x, avoid.z - z) < MINIMUM_RESPAWN_DISTANCE) continue;
      if (list.some((other) => other.state !== 'dead' && other.home && Math.hypot(other.home.x - x, other.home.z - z) < (near ? 1.2 : 4))) continue;
      return { x, z };
    }
    return null;
  }

  function createBar(enemy) {
    const box = document.createElement('div');
    box.className = 'enemy-bar hidden';
    const name = document.createElement('div');
    name.className = 'enemy-name';
    name.textContent = enemy.definition.label;
    const track = document.createElement('div');
    track.className = 'enemy-track';
    const fill = document.createElement('div');
    fill.className = 'enemy-fill';
    track.appendChild(fill);
    box.append(name, track);
    if (enemy.definition.nerves) box.classList.add('nerves');
    labelParent.appendChild(box);
    return { box, fill, name };
  }

  function place(enemy, spot) {
    const definition = enemy.definition;
    Object.assign(enemy, {
      x: spot.x, z: spot.z, y: world.heightAt(spot.x, spot.z), home: { x: spot.x, z: spot.z }, heading: random() * Math.PI * 2,
      health: definition.health, state: definition.flies ? 'circling' : 'idle', altitude: definition.flies ? GULL_CIRCLE_ALTITUDE : 0,
      path: [], pathIndex: 0, repathTimer: 0, outOfReachSeconds: 0, wanderTimer: 1 + random() * 4, attackTimer: 0, anchor: null, sink: 0, provoked: false,
      lastHurtTime: -100, motion: 0, strike: 0, hurt: 0, circleAngle: random() * Math.PI * 2,
      retreat: 0, retreatReadyAt: 0, emerge: 0, leap: null, followUp: 0, strikesMade: 0, inkWindup: false, zone: null, cooldown: 0,
      stationIndex: 0, activity: null, activityTimer: 0, moveSpeed: 0, fleeTime: 0,
    });
  }

  for (const entry of spawnTable) {
    let pack = null;
    let packLeft = 0;
    for (let index = 0; index < entry.count; index++) {
      const enemy = { id: nextId++, kind: entry.kind, definition: ENEMY_KINDS[entry.kind], entry, slot: list.filter((other) => other.kind === entry.kind).length, respawnTimer: 0, pack: null };
      enemy.bar = createBar(enemy);
      if (entry.kind === 'gull') enemy.model = createGullModel(scene, quality);
      if (entry.kind === 'rivalHermit') enemy.hermit = createHermit(scene, quality, SHELLS[ENEMY_KINDS.rivalHermit.ownShell].look, { crabModel: 'helper', scale: RIVAL_HERMIT_SCALE, bodyTint: RIVAL_HERMIT_TINT, weaponScale: RIVAL_WEAPON_SCALE });
      if (creatureAssetAvailable(entry.kind)) {
        enemy.creature = createCreature(entry.kind, quality);
        enemy.modelScale = modelScale(entry.kind, enemy.creature);
        scene.add(enemy.creature.object);
        if (enemy.model) enemy.model.torso.visible = false;
      }
      if (entry.packSize && packLeft <= 0) {
        pack = null;
        packLeft = entry.packSize[0] + Math.floor(random() * (entry.packSize[1] - entry.packSize[0] + 1));
      }
      const spot = (pack && spawnSpot(entry, null, pack)) || spawnSpot(entry, entry.avoid);
      if (!spot) continue;
      if (entry.packSize) {
        pack = pack || { x: spot.x, z: spot.z };
        enemy.pack = pack;
        packLeft--;
      }
      place(enemy, spot);
      if (enemy.definition.dailyBoss && !bossAwake(enemy.kind)) enemy.state = 'dead';
      list.push(enemy);
    }
  }

  const alive = (enemy) => enemy.state !== 'dead' && enemy.state !== 'dying';
  const engaged = (enemy) => enemy.state === 'chase' || enemy.state === 'landing';

  function startChase(enemy) {
    if (enemy.state === 'chase' || enemy.state === 'landing') return;
    enemy.anchor = { x: enemy.x, z: enemy.z };
    enemy.attackTimer = enemy.definition.windup;
    enemy.state = enemy.definition.flies && enemy.altitude > 0.5 ? 'landing' : 'chase';
  }

  function giveUp(enemy) {
    enemy.provoked = false;
    enemy.anchor = null;
    enemy.path = [];
    enemy.zone = null;
    enemy.inkWindup = false;
    enemy.state = enemy.definition.flies ? 'takeoff' : 'return';
  }

  function alarm(enemy) {
    if (engaged(enemy) || !alive(enemy)) return;
    enemy.provoked = true;
    startChase(enemy);
    onAlert(enemy);
  }

  function knockBack(enemy, attacker) {
    if (!attacker) return;
    const awayX = enemy.x - attacker.x;
    const awayZ = enemy.z - attacker.z;
    const length = Math.hypot(awayX, awayZ) || 1;
    const distance = KNOCKBACK_BY_KIND[enemy.kind] ?? 0.3;
    const nextX = enemy.x + (awayX / length) * distance;
    const nextZ = enemy.z + (awayZ / length) * distance;
    if (enemy.altitude < 0.5 && world.isWalkable(nextX, nextZ)) Object.assign(enemy, { x: nextX, z: nextZ });
  }

  function damage(enemy, amount, time, attacker = null, { provoke = true } = {}) {
    if (!alive(enemy)) return false;
    enemy.health = Math.max(0, enemy.health - amount);
    enemy.lastHurtTime = time;
    enemy.hurt = 1;
    if (enemy.kind === 'gull') onSound('wingFlap', enemy);
    knockBack(enemy, attacker);
    if (enemy.definition.temperament === 'passive') {
      for (const mate of list) {
        if (mate !== enemy && mate.kind === enemy.kind && Math.hypot(mate.x - enemy.x, mate.z - enemy.z) < PACK_ALERT_RANGE) alarm(mate);
      }
    }
    enemy.provoked = true;
    if (enemy.definition.retreatSeconds && time > enemy.retreatReadyAt) {
      enemy.retreat = enemy.definition.retreatSeconds;
      enemy.retreatReadyAt = time + RETREAT_COOLDOWN_SECONDS;
      enemy.attackTimer = Math.max(enemy.attackTimer, enemy.definition.retreatSeconds);
    }
    if (enemy.health <= 0) {
      enemy.zone = null;
      enemy.state = 'dying';
      enemy.sink = 0;
      enemy.fleeTime = 0;
      if (enemy.definition.flees) onAlert(enemy, '😱');
      enemy.path = [];
      enemy.repathTimer = 0;
      onKilled(enemy, attacker);
      return true;
    }
    if (provoke) startChase(enemy);
    else {
      enemy.path = [];
      enemy.wanderTimer = Math.max(enemy.wanderTimer, 2);
    }
    return false;
  }

  function calmAll(seconds, time) {
    calmUntil = time + seconds;
    for (const enemy of list) {
      if (!alive(enemy)) continue;
      enemy.health = enemy.definition.health;
      if (engaged(enemy) || enemy.provoked) giveUp(enemy);
    }
  }

  function moveToward(enemy, targetX, targetZ, speed, deltaTime) {
    enemy.repathTimer -= deltaTime;
    if (enemy.repathTimer <= 0 || enemy.pathIndex >= enemy.path.length) {
      enemy.repathTimer = REPATH_SECONDS;
      enemy.path = navigation.findPath(enemy.x, enemy.z, targetX, targetZ);
      enemy.pathIndex = 0;
    }
    if (enemy.pathIndex >= enemy.path.length) return false;
    const waypoint = enemy.path[enemy.pathIndex];
    const offsetX = waypoint.x - enemy.x;
    const offsetZ = waypoint.z - enemy.z;
    const distance = Math.hypot(offsetX, offsetZ);
    if (distance < 0.3) {
      enemy.pathIndex++;
      return true;
    }
    const stride = Math.min(distance, speed * deltaTime);
    enemy.x += (offsetX / distance) * stride;
    enemy.z += (offsetZ / distance) * stride;
    enemy.moveHeading = Math.atan2(offsetX, offsetZ);
    return true;
  }

  function turnToward(enemy, heading, deltaTime, rate = 8) {
    const difference = Math.atan2(Math.sin(heading - enemy.heading), Math.cos(heading - enemy.heading));
    enemy.heading += difference * Math.min(1, rate * deltaTime);
  }

  function walkingHeading(enemy) {
    return enemy.kind === 'shoreCrab' ? enemy.moveHeading + Math.PI / 2 : enemy.moveHeading;
  }

  const strikeReach = (enemy) => enemy.definition.radius + (enemy.definition.strikeReach || ENEMY_STRIKE_REACH);

  function landStrike(enemy) {
    enemy.strike = 1;
    enemy.strikesMade++;
    onSound(STRIKE_SOUNDS[enemy.kind], enemy);
    onAttackPlayer(enemy);
  }

  function attackInReach(enemy, deltaTime, player) {
    const definition = enemy.definition;
    turnToward(enemy, Math.atan2(player.x - enemy.x, player.z - enemy.z), deltaTime);
    enemy.outOfReachSeconds = 0;
    enemy.attackTimer -= deltaTime;
    if (definition.inkEvery && !enemy.inkWindup && enemy.attackTimer < definition.windup && (enemy.strikesMade + 1) % definition.inkEvery === 0) {
      enemy.inkWindup = true;
      onWarn(enemy, 'Ink!');
    }
    if (enemy.attackTimer > 0) return;
    enemy.attackTimer = definition.attackInterval;
    if (enemy.inkWindup) {
      enemy.inkWindup = false;
      enemy.strikesMade++;
      enemy.strike = 1;
      Object.assign(ink, { x: player.x, z: player.z, until: lastTime + definition.inkSlowSeconds, duration: definition.inkSlowSeconds });
      onSound('fishPlop', enemy);
      onInk(enemy, definition.inkSlowSeconds, definition.inkSlowFactor);
      return;
    }
    landStrike(enemy);
    if (definition.followUpSeconds) enemy.followUp = definition.followUpSeconds;
  }

  function zoneContains(zone, x, z) {
    if (zone.shape === 'line') {
      const dx = x - zone.x;
      const dz = z - zone.z;
      const along = dx * Math.sin(zone.angle) + dz * Math.cos(zone.angle);
      const side = dx * Math.cos(zone.angle) - dz * Math.sin(zone.angle);
      return Math.abs(along) < zone.length / 2 + PLAYER_BODY_RADIUS * 0.4 && Math.abs(side) < zone.width / 2 + PLAYER_BODY_RADIUS * 0.6;
    }
    return Math.hypot(x - zone.x, z - zone.z) < zone.radius + PLAYER_BODY_RADIUS * 0.6;
  }

  function updateTelegraph(enemy, deltaTime, player, toPlayer, reach) {
    const telegraph = enemy.definition.telegraph;
    enemy.cooldown = Math.max(0, enemy.cooldown - deltaTime);
    if (!enemy.zone && telegraph.shape === 'line') {
      if (toPlayer > telegraph.lineRange) return false;
      turnToward(enemy, Math.atan2(player.x - enemy.x, player.z - enemy.z), deltaTime);
      if (enemy.cooldown > 0) return true;
      const towardPlayer = Math.atan2(player.x - enemy.x, player.z - enemy.z);
      const stompDue = (enemy.strikesMade + 1) % telegraph.stompEvery === 0 && toPlayer < telegraph.stompRadius + PLAYER_BODY_RADIUS;
      if (stompDue) {
        enemy.zone = { x: enemy.x, z: enemy.z, radius: telegraph.stompRadius, timer: telegraph.stompWindup, duration: telegraph.stompWindup, stomp: true };
        onWarn(enemy, 'Stomp!');
        return true;
      }
      const centerDistance = enemy.definition.radius * 0.5 + telegraph.lineLength / 2;
      enemy.zone = { shape: 'line', angle: towardPlayer, x: enemy.x + Math.sin(towardPlayer) * centerDistance, z: enemy.z + Math.cos(towardPlayer) * centerDistance, length: telegraph.lineLength, width: telegraph.lineWidth, timer: enemy.definition.windup, duration: enemy.definition.windup };
      onWarn(enemy, null);
      return true;
    }
    if (!enemy.zone) {
      const pounceDue = telegraph.pounceEvery && (enemy.strikesMade + 1) % telegraph.pounceEvery === 0;
      const canPounce = telegraph.pounceEvery && toPlayer < telegraph.pounceRange && (pounceDue || toPlayer > reach + 2);
      if (toPlayer > reach && !canPounce) return false;
      turnToward(enemy, Math.atan2(player.x - enemy.x, player.z - enemy.z), deltaTime);
      if (enemy.cooldown > 0) return toPlayer <= reach;
      if (canPounce) {
        enemy.heading = Math.atan2(player.x - enemy.x, player.z - enemy.z);
        enemy.zone = { x: player.x, z: player.z, radius: telegraph.pounceRadius, timer: telegraph.pounceWindup, duration: telegraph.pounceWindup, pounce: true };
        onWarn(enemy, 'Pounce!');
        return true;
      }
      enemy.zone = { x: enemy.x + Math.sin(enemy.heading) * telegraph.reach, z: enemy.z + Math.cos(enemy.heading) * telegraph.reach, radius: telegraph.radius, timer: enemy.definition.windup, duration: enemy.definition.windup };
      onWarn(enemy, null);
      return true;
    }
    enemy.zone.timer -= deltaTime;
    if (enemy.zone.timer > 0) return true;
    const caught = zoneContains(enemy.zone, player.x, player.z);
    if (enemy.zone.shape === 'line') enemy.lastChop = { ...enemy.zone, until: lastTime + CHOP_LINGER_SECONDS };
    if (enemy.zone.pounce) {
      const landingDistance = enemy.definition.radius + 1.4;
      const landing = navigation.nearestWalkable(enemy.zone.x - Math.sin(enemy.heading) * landingDistance, enemy.zone.z - Math.cos(enemy.heading) * landingDistance, 6);
      if (landing) enemy.leap = { fromX: enemy.x, fromZ: enemy.z, toX: landing.x, toZ: landing.z, time: 0 };
    }
    enemy.zone = null;
    enemy.cooldown = enemy.definition.attackInterval - enemy.definition.windup;
    enemy.strike = 1;
    enemy.strikesMade++;
    onSound(STRIKE_SOUNDS[enemy.kind], enemy);
    if (caught && player.alive) onAttackPlayer(enemy);
    else onDodge(enemy);
    return true;
  }

  function updateGround(enemy, deltaTime, time, player) {
    const definition = enemy.definition;
    const toPlayer = Math.hypot(player.x - enemy.x, player.z - enemy.z);
    const reach = strikeReach(enemy);
    const lurker = definition.temperament === 'lurker';
    let moving = false;
    const startX = enemy.x;
    const startZ = enemy.z;
    enemy.retreat = Math.max(0, enemy.retreat - deltaTime);
    if (enemy.leap) {
      enemy.leap.time = Math.min(1, enemy.leap.time + deltaTime / LEAP_SECONDS);
      enemy.x = THREE.MathUtils.lerp(enemy.leap.fromX, enemy.leap.toX, enemy.leap.time);
      enemy.z = THREE.MathUtils.lerp(enemy.leap.fromZ, enemy.leap.toZ, enemy.leap.time);
      enemy.y = world.heightAt(enemy.x, enemy.z);
      if (enemy.leap.time >= 1) enemy.leap = null;
      return;
    }
    if (enemy.followUp > 0) {
      enemy.followUp -= deltaTime;
      if (enemy.followUp <= 0 && enemy.state === 'chase' && player.alive && toPlayer < reach + 0.6) landStrike(enemy);
    }
    if (enemy.state === 'idle') {
      const awake = time > calmUntil && player.alive;
      const sees = definition.temperament === 'aggressive' && toPlayer < definition.sightRange && navigation.clearLine(enemy.x, enemy.z, player.x, player.z);
      const trespass = definition.temperament === 'aggressive' && enemy.entry.territory && enemy.entry.territory(player.x, player.z);
      const passesDen = lurker && toPlayer < reach;
      if (awake && (sees || trespass || passesDen)) {
        startChase(enemy);
        onAlert(enemy);
      }
      enemy.wanderTimer -= deltaTime;
      if (enemy.entry.stations) moving = patrol(enemy, deltaTime);
      else if (enemy.wanderTimer <= 0 && definition.speed > 0) {
        enemy.wanderTimer = 3 + random() * 4;
        const angle = random() * Math.PI * 2;
        const distance = random() * WANDER_RADIUS;
        const targetX = enemy.home.x + Math.cos(angle) * distance;
        const targetZ = enemy.home.z + Math.sin(angle) * distance;
        if (world.isWalkable(targetX, targetZ) && enemy.entry.accept(world, targetX, targetZ, world.heightAt(targetX, targetZ)) && navigation.clearLine(enemy.x, enemy.z, targetX, targetZ)) {
          enemy.path = [{ x: targetX, z: targetZ }];
          enemy.pathIndex = 0;
          enemy.repathTimer = 99;
        }
      }
      if (!enemy.entry.stations && enemy.pathIndex < enemy.path.length) moving = moveToward(enemy, enemy.path[enemy.path.length - 1].x, enemy.path[enemy.path.length - 1].z, definition.speed * 0.35, deltaTime);
    } else if (enemy.state === 'chase') {
      enemy.activity = null;
      const leashed = enemy.entry.stations ? false : lurker ? toPlayer > reach + 3 : Math.hypot(player.x - enemy.anchor.x, player.z - enemy.anchor.z) > LEASH_DISTANCE;
      const leftTerritory = enemy.entry.territory && !enemy.entry.territory(player.x, player.z) && toPlayer > reach + 2 && !enemy.zone;
      enemy.outOfBoundsSeconds = leashed || leftTerritory ? (enemy.outOfBoundsSeconds || 0) + deltaTime : 0;
      if (!player.alive || enemy.outOfBoundsSeconds > LEASH_GRACE_SECONDS) {
        enemy.outOfBoundsSeconds = 0;
        enemy.zone = null;
        giveUp(enemy);
      } else if (definition.telegraph) {
        if (!updateTelegraph(enemy, deltaTime, player, toPlayer, reach)) moving = moveToward(enemy, player.x, player.z, definition.speed, deltaTime);
        if (moving) enemy.moveSpeed = definition.speed;
      } else if (toPlayer > reach) {
        if (definition.speed > 0) moving = moveToward(enemy, player.x, player.z, definition.speed, deltaTime);
        enemy.outOfReachSeconds += deltaTime;
        if (enemy.outOfReachSeconds > OUT_OF_REACH_RESET_SECONDS) enemy.attackTimer = Math.max(enemy.attackTimer, definition.windup);
        enemy.inkWindup = false;
      } else if (enemy.retreat <= 0) {
        attackInReach(enemy, deltaTime, player);
      }
    } else if (enemy.state === 'return') {
      moving = definition.speed > 0 && moveToward(enemy, enemy.home.x, enemy.home.z, definition.speed * 0.7, deltaTime);
      enemy.moveSpeed = definition.speed * 0.7;
      if (Math.hypot(enemy.home.x - enemy.x, enemy.home.z - enemy.z) < 1 || !moving) enemy.state = 'idle';
    }
    enemy.emerge += ((enemy.state === 'chase' && enemy.retreat <= 0 ? 1 : 0) - enemy.emerge) * Math.min(1, deltaTime * (enemy.retreat > 0 ? 10 : 6));
    if (moving && enemy.moveHeading !== undefined) turnToward(enemy, enemy.state === 'chase' && enemy.kind !== 'shoreCrab' ? Math.atan2(player.x - enemy.x, player.z - enemy.z) : walkingHeading(enemy), deltaTime, 6);
    enemy.motion += ((moving ? 1 : 0) - enemy.motion) * Math.min(1, deltaTime * 8);
    if (definition.speed > 0 && player.alive) keepOffPlayer(enemy, player);
    if (enemy.entry.stations) followActualMovement(enemy, startX, startZ, deltaTime);
    enemy.y = world.heightAt(enemy.x, enemy.z);
  }

  function followActualMovement(enemy, startX, startZ, deltaTime) {
    const actualSpeed = deltaTime > 0 ? Math.hypot(enemy.x - startX, enemy.z - startZ) / deltaTime : 0;
    const walking = actualSpeed > enemy.definition.speed * COOK_WALKING_SHARE;
    enemy.moveSpeed = actualSpeed;
    enemy.motion += ((walking ? 1 : 0) - enemy.motion) * Math.min(1, deltaTime * 8);
    enemy.stuckSeconds = walking || enemy.activityTimer > 0 || enemy.state !== 'idle' ? 0 : (enemy.stuckSeconds || 0) + deltaTime;
  }

  function patrol(enemy, deltaTime) {
    const stations = enemy.entry.stations;
    const station = stations[enemy.stationIndex % stations.length];
    if (enemy.activityTimer > 0) {
      enemy.activityTimer -= deltaTime;
      enemy.activity = station.activity;
      turnToward(enemy, station.heading, deltaTime, 3);
      if (enemy.activityTimer <= 0) {
        enemy.activity = null;
        enemy.stationIndex = (enemy.stationIndex + 1) % stations.length;
      }
      return false;
    }
    enemy.moveSpeed = enemy.definition.speed * COOK_PATROL_SHARE;
    const moving = moveToward(enemy, station.x, station.z, enemy.moveSpeed, deltaTime);
    if (!moving || Math.hypot(station.x - enemy.x, station.z - enemy.z) < 0.6 || (enemy.stuckSeconds || 0) > COOK_STUCK_SECONDS) {
      enemy.stuckSeconds = 0;
      const [shortest, longest] = COOK_ACTIVITY_SECONDS;
      enemy.activityTimer = shortest + random() * (longest - shortest);
      enemy.path = [];
    }
    return moving;
  }

  function flee(enemy, deltaTime) {
    const exit = enemy.entry.exit;
    enemy.fleeTime += deltaTime;
    enemy.moveSpeed = COOK_FLEE_SPEED;
    const startX = enemy.x;
    const startZ = enemy.z;
    const moving = moveToward(enemy, exit.x, exit.z, COOK_FLEE_SPEED, deltaTime);
    if (moving && enemy.moveHeading !== undefined) turnToward(enemy, enemy.moveHeading, deltaTime, 6);
    enemy.motion = Math.hypot(enemy.x - startX, enemy.z - startZ) > 0 ? 1 : 0;
    enemy.y = world.heightAt(enemy.x, enemy.z);
    return Math.hypot(exit.x - enemy.x, exit.z - enemy.z) < 2 || enemy.fleeTime > COOK_FLEE_SECONDS || !moving;
  }

  function keepOffPlayer(enemy, player) {
    const minimumGap = Math.max(enemy.definition.radius, enemy.definition.bodyReach || 0) + PLAYER_BODY_RADIUS * 0.8;
    const offsetX = enemy.x - player.x;
    const offsetZ = enemy.z - player.z;
    const distance = Math.hypot(offsetX, offsetZ);
    if (distance >= minimumGap) return;
    const pushAngle = distance > 0.01 ? Math.atan2(offsetX, offsetZ) : enemy.heading + Math.PI;
    const pushedX = player.x + Math.sin(pushAngle) * minimumGap;
    const pushedZ = player.z + Math.cos(pushAngle) * minimumGap;
    if (world.isWalkable && !world.isWalkable(pushedX, pushedZ)) return;
    enemy.x = pushedX;
    enemy.z = pushedZ;
  }

  function updateGull(enemy, deltaTime, time, player) {
    const definition = enemy.definition;
    const territory = enemy.entry.territory;
    const playerInside = player.alive && time > calmUntil && territory(player.x, player.z);
    if (enemy.state === 'circling') {
      enemy.circleAngle += deltaTime * 0.32;
      const targetX = enemy.home.x + Math.cos(enemy.circleAngle) * GULL_CIRCLE_RADIUS;
      const targetZ = enemy.home.z + Math.sin(enemy.circleAngle) * GULL_CIRCLE_RADIUS;
      enemy.x += (targetX - enemy.x) * Math.min(1, deltaTime * 2);
      enemy.z += (targetZ - enemy.z) * Math.min(1, deltaTime * 2);
      enemy.heading = enemy.circleAngle + Math.PI;
      enemy.altitude += (GULL_CIRCLE_ALTITUDE - enemy.altitude) * Math.min(1, deltaTime);
      if (playerInside || enemy.provoked) {
        startChase(enemy);
        onAlert(enemy);
        onSound('gullCall', enemy);
      }
    } else if (enemy.state === 'landing') {
      const awayX = enemy.x - player.x;
      const awayZ = enemy.z - player.z;
      const awayLength = Math.hypot(awayX, awayZ) || 1;
      const spot = navigation.nearestWalkable(player.x + (awayX / awayLength) * GULL_LANDING_OFFSET, player.z + (awayZ / awayLength) * GULL_LANDING_OFFSET, 10) || player;
      const offsetX = spot.x - enemy.x;
      const offsetZ = spot.z - enemy.z;
      const distance = Math.hypot(offsetX, offsetZ);
      const stride = Math.min(distance, GULL_FLIGHT_SPEED * deltaTime);
      if (distance > 0.01) {
        enemy.x += (offsetX / distance) * stride;
        enemy.z += (offsetZ / distance) * stride;
        turnToward(enemy, Math.atan2(offsetX, offsetZ), deltaTime, 4);
      }
      enemy.altitude = Math.max(0, Math.min(enemy.altitude, distance * 1.6) - deltaTime * 6);
      if (enemy.altitude <= 0.01 && distance < 1) {
        enemy.altitude = 0;
        enemy.state = 'chase';
        enemy.anchor = { x: enemy.x, z: enemy.z };
        enemy.attackTimer = definition.windup;
      }
      if (!player.alive) giveUp(enemy);
    } else if (enemy.state === 'chase') {
      updateGround(enemy, deltaTime, time, player);
      return;
    } else if (enemy.state === 'takeoff') {
      const offsetX = enemy.home.x - enemy.x;
      const offsetZ = enemy.home.z - enemy.z;
      const distance = Math.hypot(offsetX, offsetZ);
      enemy.altitude = Math.min(GULL_CIRCLE_ALTITUDE, enemy.altitude + deltaTime * 9);
      if (distance > 0.5) {
        const stride = Math.min(distance, GULL_FLIGHT_SPEED * 0.7 * deltaTime * Math.min(1, enemy.altitude / 4));
        enemy.x += (offsetX / distance) * stride;
        enemy.z += (offsetZ / distance) * stride;
        turnToward(enemy, Math.atan2(offsetX, offsetZ), deltaTime, 3);
      }
      if (enemy.altitude > GULL_CIRCLE_ALTITUDE * 0.8 && distance < GULL_CIRCLE_RADIUS + 2) {
        enemy.state = 'circling';
        enemy.circleAngle = Math.atan2(enemy.z - enemy.home.z, enemy.x - enemy.home.x);
      }
    }
    enemy.y = world.heightAt(enemy.x, enemy.z);
  }

  let lastTime = 0;

  function regenerate(enemy, deltaTime, time) {
    if (enemy.health >= enemy.definition.health || engaged(enemy)) return;
    if (time - (enemy.lastHurtTime ?? -Infinity) < REGEN_DELAY_SECONDS) return;
    enemy.health = Math.min(enemy.definition.health, enemy.health + enemy.definition.health * REGEN_SHARE_PER_SECOND * deltaTime);
  }

  function update(deltaTime, time, player) {
    lastTime = time;
    for (const enemy of list) {
      if (enemy.state === 'dead') {
        if (enemy.definition.dailyBoss) {
          if (!bossAwake(enemy.kind)) continue;
          enemy.respawnTimer = Math.min(enemy.respawnTimer, 0);
        }
        enemy.respawnTimer -= deltaTime;
        if (enemy.respawnTimer <= 0) {
          const spot = (enemy.pack && spawnSpot(enemy.entry, player, enemy.pack)) || spawnSpot(enemy.entry, player);
          if (spot) place(enemy, spot);
          else enemy.respawnTimer = 10;
        }
        continue;
      }
      if (enemy.state === 'dying') {
        enemy.hurt = Math.max(0, enemy.hurt - deltaTime / HURT_SECONDS);
        if (enemy.definition.flees) enemy.sink = flee(enemy, deltaTime) ? 1 : 0;
        else enemy.sink += deltaTime / DEATH_SINK_SECONDS;
        if (enemy.sink >= 1) {
          enemy.state = 'dead';
          enemy.zone = null;
          enemy.respawnTimer = enemy.definition.respawnSeconds;
        }
        continue;
      }
      const resting = enemy.state === 'idle' || enemy.state === 'circling';
      if (resting && Math.hypot(player.x - enemy.x, player.z - enemy.z) > ENEMY_ACTIVE_RADIUS) continue;
      enemy.strike = Math.max(0, enemy.strike - deltaTime * 3);
      const idleSound = IDLE_SOUNDS[enemy.kind];
      if (idleSound && (enemy.state === 'idle' || enemy.state === 'circling') && random() < idleSound.perSecond * deltaTime) onSound(idleSound.name, enemy);
      enemy.hurt = Math.max(0, enemy.hurt - deltaTime / HURT_SECONDS);
      regenerate(enemy, deltaTime, time);
      if (enemy.definition.flies) updateGull(enemy, deltaTime, time, player);
      else updateGround(enemy, deltaTime, time, player);
    }
  }

  const deathFall = (enemy) => (enemy.state === 'dying' ? THREE.MathUtils.smoothstep(enemy.sink, 0, 0.35) : 0);
  const deathSink = (enemy) => (enemy.state === 'dying' ? THREE.MathUtils.smoothstep(enemy.sink, 0.5, 1) : 0);
  const flashFor = (enemy) => enemy.hurt * enemy.hurt * FLASH_STRENGTH;
  const setFlash = (mesh, index, value) => mesh.geometry.attributes.aFlash.setX(index, value);

  function renderHopper(enemy, time) {
    const hop = Math.abs(Math.sin(time * 9 + enemy.id)) * 0.55 * enemy.motion;
    const pounce = Math.sin(enemy.strike * Math.PI);
    const startle = Math.sin(enemy.hurt * Math.PI);
    const fall = deathFall(enemy);
    const forward = pounce * 0.7 - startle * 0.2;
    transform.position.set(enemy.x + Math.sin(enemy.heading) * forward, enemy.y + hop + pounce * 0.6 + startle * 0.7 - deathSink(enemy) * 0.5, enemy.z + Math.cos(enemy.heading) * forward);
    transform.rotation.set(-hop * 0.6 - pounce * 0.5 + startle * 0.6, enemy.heading, fall * Math.PI);
    transform.scale.setScalar(1.15 * (1 - deathSink(enemy) * 0.5));
    transform.updateMatrix();
    if (enemy.creature) {
      placeCreature(enemy, CREATURE_SCALE.sandHopper * (1 - deathSink(enemy) * 0.5));
      enemy.creature.pose({ stride: time * 9 + enemy.id, motion: enemy.motion, hop: hop / 0.55 + pounce, startle, fall: enemy.state === 'dying' ? 1 : fall, time });
      hopperMesh.setMatrixAt(enemy.slot, hidden);
      return;
    }
    hopperMesh.setMatrixAt(enemy.slot, enemy.state === 'dead' ? hidden : transform.matrix);
    setFlash(hopperMesh, enemy.slot, flashFor(enemy));
  }

  function showCreature(enemy, poseArguments) {
    placeCreature(enemy, enemy.modelScale);
    if (enemy.creature.object.visible) enemy.creature.pose(poseArguments);
  }

  function placeCreature(enemy, scale) {
    const { object } = enemy.creature;
    const region = MODEL_REPLACES[enemy.kind] && MODEL_REPLACES[enemy.kind].region;
    object.visible = enemy.state !== 'dead' && (!region || regionVisible[region]);
    object.position.copy(transform.position);
    object.rotation.copy(transform.rotation);
    object.scale.setScalar(scale);
    const dyingFlash = enemy.state === 'dying' && !enemy.definition.flees ? Math.max(0, 1 - enemy.sink * 4) : 0;
    enemy.creature.setFlash(Math.max(enemy.hurt, dyingFlash));
  }

  function renderShoreCrab(enemy, time) {
    const stride = time * 11 + enemy.id;
    const fall = deathFall(enemy);
    const recoil = Math.sin(enemy.hurt * Math.PI) * 0.35;
    const lunge = Math.sin(enemy.strike * Math.PI) * 0.35;
    const shift = lunge - recoil;
    transform.position.set(enemy.x + Math.sin(enemy.heading) * shift, enemy.y + Math.abs(Math.sin(stride)) * 0.05 * enemy.motion - deathSink(enemy) * 0.6 + fall * 0.5, enemy.z + Math.cos(enemy.heading) * shift);
    transform.rotation.set(-recoil * 0.8, enemy.heading, fall * Math.PI * 0.95);
    transform.scale.setScalar(1);
    transform.updateMatrix();
    parentMatrix.copy(transform.matrix);
    if (enemy.creature) {
      placeCreature(enemy, CREATURE_SCALE.shoreCrab);
      const windingUpNow = enemy.state === 'chase' && enemy.attackTimer < 0.45 ? 1 - enemy.attackTimer / 0.45 : 0;
      const raisedNow = (enemy.state === 'chase' ? 0.35 : 0.1 + 0.05 * Math.sin(time * 1.3 + enemy.id)) + windingUpNow * 0.55;
      enemy.creature.pose({ stride, motion: enemy.motion, raised: raisedNow, snaps: [enemy.strike, Math.max(0, (enemy.strike - 0.35) / 0.65)], recoil, fall });
      crabBodyMesh.setMatrixAt(enemy.slot, hidden);
      for (let leg = 0; leg < 8; leg++) crabLegMesh.setMatrixAt(enemy.slot * 8 + leg, hidden);
      for (let claw = 0; claw < 2; claw++) crabClawMesh.setMatrixAt(enemy.slot * 2 + claw, hidden);
      return;
    }
    crabBodyMesh.setMatrixAt(enemy.slot, enemy.state === 'dead' ? hidden : parentMatrix);
    const flash = flashFor(enemy);
    setFlash(crabBodyMesh, enemy.slot, flash);
    let legIndex = enemy.slot * 8;
    for (const side of [-1, 1]) {
      for (let pair = 0; pair < 4; pair++) {
        const phase = stride + pair * 1.6 + (side > 0 ? Math.PI : 0);
        transform.position.set(side * 0.62, 0.55, 0.32 - pair * 0.24);
        const curl = fall * 0.9 + recoil * 0.4;
        transform.rotation.set(0, (side > 0 ? 0 : Math.PI) + side * (-0.25 + pair * 0.28) + Math.sin(phase) * 0.3 * enemy.motion, (side > 0 ? 1 : -1) * (0.1 + Math.max(0, Math.cos(phase)) * 0.25 * enemy.motion) - curl * (side > 0 ? 1 : -1));
        transform.scale.setScalar(1);
        transform.updateMatrix();
        partMatrix.multiplyMatrices(parentMatrix, transform.matrix);
        setFlash(crabLegMesh, legIndex, flash);
        crabLegMesh.setMatrixAt(legIndex++, enemy.state === 'dead' ? hidden : partMatrix);
      }
    }
    const windingUp = enemy.state === 'chase' && enemy.attackTimer < 0.45 ? 1 - enemy.attackTimer / 0.45 : 0;
    for (const side of [-1, 1]) {
      const snap = side < 0 ? enemy.strike : Math.max(0, (enemy.strike - 0.35) / 0.65);
      const raised = (enemy.state === 'chase' ? 0.35 : 0.1 + 0.05 * Math.sin(time * 1.3 + enemy.id)) + windingUp * 0.55 + recoil * 3;
      transform.position.set(side * 0.55, 0.62, 0.55);
      transform.rotation.set(-raised + snap * 1.1, side * (0.55 - snap * 0.45), 0);
      transform.scale.setScalar(side < 0 ? 1.15 : 0.95);
      transform.updateMatrix();
      partMatrix.multiplyMatrices(parentMatrix, transform.matrix);
      crabClawMesh.setMatrixAt(enemy.slot * 2 + (side < 0 ? 0 : 1), enemy.state === 'dead' ? hidden : partMatrix);
      setFlash(crabClawMesh, enemy.slot * 2 + (side < 0 ? 0 : 1), flash);
    }
  }

  const lootMaterials = new Map();
  function lootMaterial(category, kind) {
    const key = `${category}:${kind}`;
    if (!lootMaterials.has(key)) {
      const base = applySeaside(new THREE.MeshStandardMaterial(), { chromaticCaustics: quality.chromaticCaustics, wetDarkening: 0.5, wetRoughness: 0.1 });
      lootMaterials.set(key, category === 'shell' ? dressShellMaterial(kind, base) : dressWeaponMaterial(kind, base));
      if (category === 'shell') lootMaterials.get(key).color.multiplyScalar(LOOT_SHELL_BRIGHTNESS);
    }
    return lootMaterials.get(key);
  }

  const modelBounds = new THREE.Box3();
  const boundsCorner = new THREE.Vector3();
  function projectLabelAnchor(enemy, camera) {
    labelPoint.set(enemy.x, enemy.y + enemy.altitude + enemy.definition.barHeight * (isLooter(enemy) ? LOOTER_LABEL_LIFT : 1), enemy.z).project(camera);
    const body = enemy.creature ? enemy.creature.object : enemy.hermit ? enemy.hermit.root : null;
    if (!body || !body.visible) return;
    modelBounds.setFromObject(body);
    if (modelBounds.isEmpty()) return;
    modelBounds.max.y += LABEL_CLEARANCE;
    for (let corner = 0; corner < 8; corner++) {
      boundsCorner.set(corner & 1 ? modelBounds.max.x : modelBounds.min.x, corner & 2 ? modelBounds.max.y : modelBounds.min.y, corner & 4 ? modelBounds.max.z : modelBounds.min.z).project(camera);
      if (boundsCorner.y > labelPoint.y) labelPoint.y = boundsCorner.y;
    }
  }

  function dressLoot(enemy) {
    const loot = enemy.loot || {};
    const shownKey = `${loot.shell ? loot.shell.kind : ''}|${loot.big ? loot.big.kind : ''}|${loot.small ? loot.small.kind : ''}`;
    if (enemy.lootShown === shownKey) return;
    enemy.lootShown = shownKey;
    if (enemy.hermit) {
      enemy.hermit.setShell(SHELLS[loot.shell ? loot.shell.kind : enemy.definition.ownShell].look);
      enemy.hermit.setClawWeapon(loot.big ? loot.big.kind : null, loot.small ? loot.small.kind : null);
      return;
    }
    for (const part of enemy.lootParts || []) part.removeFromParent();
    enemy.lootParts = [];
    const gripSides = [];
    if (!enemy.creature) return;
    for (const which of ['big', 'small']) {
      const item = loot[which];
      const hand = enemy.creature.hands && enemy.creature.hands[which];
      if (!item || !hand || !weaponModelAvailable(item.kind)) continue;
      const weapon = buildHeldWeapon(item.kind, lootMaterial('claws', item.kind), hand.length, hand.length * (LOOT_WEAPON_SCALE[enemy.kind] || 1) * (which === 'small' ? SMALL_HAND_WEAPON_SCALE : 1));
      const holder = new THREE.Group();
      holder.userData.hand = hand;
      holder.add(weapon);
      holder.userData.lift = LOOT_WEAPON_LIFT_BY_KIND[enemy.kind] ?? LOOT_WEAPON_LIFT;
      gripSides.push(hand.side);
      scene.add(holder);
      enemy.lootParts.push(holder);
    }
    if (enemy.creature.setGripSides) enemy.creature.setGripSides(gripSides);
    const fit = LOOT_SHELL_FIT[enemy.kind];
    if (loot.shell && fit && shellModelAvailable(SHELLS[loot.shell.kind].look.model)) {
      const model = SHELLS[loot.shell.kind].look.model;
      const shell = buildShellModel(model, lootMaterial('shell', model));
      shell.scale.setScalar(fit.size * enemy.creature.length);
      shell.rotation.set(...fit.rotation);
      (enemy.creature.shellAnchor || enemy.creature.object).add(shell);
      enemy.lootParts.push(shell);
    }
  }

  const handWorld = new THREE.Vector3();
  const jawBase = new THREE.Vector3();
  const jawTip = new THREE.Vector3();
  const clawAxis = new THREE.Vector3();
  const clawSide = new THREE.Vector3();
  const clawFace = new THREE.Vector3();
  const clawBasis = new THREE.Matrix4();
  const WORLD_UP = new THREE.Vector3(0, 1, 0);
  const bodyTurn = new THREE.Quaternion();
  function holdLootWeapons(enemy) {
    if (!enemy.creature || !enemy.lootParts || !enemy.lootParts.length) return;
    const { object } = enemy.creature;
    object.updateMatrixWorld(true);
    object.getWorldQuaternion(bodyTurn);
    for (const part of enemy.lootParts) {
      const { hand, lift } = part.userData;
      if (!hand) continue;
      part.visible = object.visible;
      part.position.set(0, 0, 0);
      for (const jaw of hand.jaws) {
        jaw.base.getWorldPosition(jawBase);
        jaw.tip.getWorldPosition(jawTip);
        part.position.add(handWorld.copy(jawBase).lerp(jawTip, LOOT_GRIP_ALONG_JAW[enemy.kind] ?? DEFAULT_GRIP_ALONG_JAW));
      }
      part.position.divideScalar(hand.jaws.length);
      clawAxis.set(hand.side * (LOOT_WEAPON_SPLAY_BY_KIND[enemy.kind] ?? LOOT_WEAPON_SPLAY), lift, 1).normalize().applyQuaternion(bodyTurn);
      clawSide.crossVectors(clawAxis, WORLD_UP).normalize();
      clawFace.crossVectors(clawSide, clawAxis);
      part.quaternion.setFromRotationMatrix(clawBasis.makeBasis(clawSide, clawAxis, clawFace));
      part.scale.setScalar(object.scale.x);
    }
  }

  const viewFrustum = new THREE.Frustum();
  const viewMatrix = new THREE.Matrix4();
  const rivalCullSphere = new THREE.Sphere(new THREE.Vector3(), RIVAL_CULL_RADIUS);
  function renderRivalHermit(enemy, time) {
    const crab = enemy.hermit;
    rivalCullSphere.center.set(enemy.x, enemy.y, enemy.z);
    crab.root.visible = enemy.state !== 'dead' && viewFrustum.intersectsSphere(rivalCullSphere);
    if (!crab.root.visible) return;
    const deltaTime = enemy.lastRenderTime === undefined ? 0 : Math.min(0.1, Math.max(0, time - enemy.lastRenderTime));
    enemy.lastRenderTime = time;
    if (enemy.strike > 0.95 && !enemy.strikeShown) crab.playAttack(enemy.strikesMade % 2 ? 'small' : 'big');
    enemy.strikeShown = enemy.strike > 0.95;
    if (enemy.hurt > 0.95 && !enemy.hurtShown) crab.playHurt(0.6, 0);
    enemy.hurtShown = enemy.hurt > 0.95;
    const dying = enemy.state === 'dying';
    if (dying && !enemy.deathShown) crab.playDeath();
    if (!dying && enemy.deathShown) crab.resetPose();
    enemy.deathShown = dying;
    crab.update(deltaTime, { x: enemy.x, y: enemy.y - deathSink(enemy) * 0.8, z: enemy.z, heading: enemy.heading, speed: enemy.motion * enemy.definition.speed, working: false, groundNormal: RIVAL_GROUND });
  }

  function placeInstance(mesh, slot, enemy, matrix) {
    mesh.setMatrixAt(slot, enemy.state === 'dead' ? hidden : matrix);
    setFlash(mesh, slot, flashFor(enemy));
  }

  function renderMoray(enemy, time) {
    const peek = 0.5 + 0.1 * Math.sin(time * 0.9 + enemy.id);
    const rise = THREE.MathUtils.lerp(peek, 1, enemy.emerge) - deathSink(enemy);
    const lunge = Math.sin(enemy.strike * Math.PI);
    transform.position.set(enemy.x + Math.sin(enemy.heading) * lunge * 1.3, enemy.y + (rise * 1.45 - 1.55) * MORAY_SCALE, enemy.z + Math.cos(enemy.heading) * lunge * 1.3);
    transform.rotation.set(lunge * 0.55 - (1 - enemy.emerge) * 0.15, enemy.heading + Math.sin(time * 1.7 + enemy.id) * 0.15 * (1 - lunge), Math.sin(time * 2.3 + enemy.id) * 0.07 + deathFall(enemy) * 0.8);
    transform.scale.setScalar(MORAY_SCALE);
    transform.updateMatrix();
    if (enemy.creature) {
      morayMesh.setMatrixAt(enemy.slot, hidden);
      transform.position.set(enemy.x + Math.sin(enemy.heading) * lunge * 1.3, enemy.y - (1 - rise) * 0.9 - deathSink(enemy) * 1.5, enemy.z + Math.cos(enemy.heading) * lunge * 1.3);
      transform.rotation.set(0, enemy.heading, 0);
      showCreature(enemy, { time, emerge: enemy.emerge, lunge, fall: deathFall(enemy) });
      return;
    }
    placeInstance(morayMesh, enemy.slot, enemy, transform.matrix);
  }

  function renderOctopus(enemy, time) {
    const lunge = Math.sin(enemy.strike * Math.PI) * 0.7;
    const recoil = Math.sin(enemy.hurt * Math.PI) * 0.3;
    const swell = enemy.inkWindup ? 0.18 + 0.06 * Math.sin(time * 18) : 0;
    const breathe = 0.04 * Math.sin(time * 2.1 + enemy.id);
    transform.position.set(enemy.x + Math.sin(enemy.heading) * (lunge - recoil), enemy.y - deathSink(enemy) * 0.8, enemy.z + Math.cos(enemy.heading) * (lunge - recoil));
    transform.rotation.set(-recoil * 0.5, enemy.heading + Math.sin(time * 0.8 + enemy.id) * 0.1, 0);
    transform.scale.set(1 + breathe + swell * 0.5, (1 + swell - breathe) * (1 - deathFall(enemy) * 0.6), 1 + breathe + swell * 0.5);
    transform.updateMatrix();
    if (enemy.creature) {
      octopusMesh.setMatrixAt(enemy.slot, hidden);
      showCreature(enemy, { time, motion: enemy.motion, lunge, swell, fall: deathFall(enemy), holdingShell: Boolean(enemy.loot && enemy.loot.shell) });
      return;
    }
    placeInstance(octopusMesh, enemy.slot, enemy, transform.matrix);
  }

  function renderMantis(enemy, time) {
    const scurry = Math.abs(Math.sin(time * 14 + enemy.id)) * 0.08 * enemy.motion;
    const lunge = Math.sin(enemy.strike * Math.PI);
    const recoil = Math.sin(enemy.hurt * Math.PI) * 0.4;
    const forward = lunge * 0.9 - recoil;
    transform.position.set(enemy.x + Math.sin(enemy.heading) * forward, enemy.y + scurry + lunge * 0.25 - deathSink(enemy) * 0.4, enemy.z + Math.cos(enemy.heading) * forward);
    transform.rotation.set(-lunge * 0.35 + recoil * 0.5, enemy.heading, deathFall(enemy) * Math.PI);
    transform.scale.setScalar(1.25);
    transform.updateMatrix();
    if (enemy.creature) {
      mantisMesh.setMatrixAt(enemy.slot, hidden);
      transform.position.y -= enemy.creature.height * enemy.modelScale * MANTIS_SINK_SHARE;
      showCreature(enemy, { stride: time * 12 + enemy.id, motion: enemy.motion, strike: lunge, fall: deathFall(enemy), time });
      return;
    }
    placeInstance(mantisMesh, enemy.slot, enemy, transform.matrix);
  }

  function renderLobster(enemy, time) {
    const lunge = Math.sin(enemy.strike * Math.PI);
    const windup = enemy.zone ? 1 - enemy.zone.timer / enemy.zone.duration : 0;
    const stride = time * 6 + enemy.id;
    transform.position.set(enemy.x + Math.sin(enemy.heading) * (lunge * 0.8 - windup * 0.3), enemy.y + Math.abs(Math.sin(stride)) * 0.06 * enemy.motion - deathSink(enemy) * 1.2, enemy.z + Math.cos(enemy.heading) * (lunge * 0.8 - windup * 0.3));
    transform.rotation.set(-windup * 0.12 + lunge * 0.1, enemy.heading, deathFall(enemy) * 0.5);
    transform.scale.setScalar(LOBSTER_SCALE);
    transform.updateMatrix();
    if (enemy.creature) {
      lobsterBodyMesh.setMatrixAt(enemy.slot, hidden);
      lobsterClawMesh.setMatrixAt(enemy.slot * 2, hidden);
      lobsterClawMesh.setMatrixAt(enemy.slot * 2 + 1, hidden);
      showCreature(enemy, { stride, motion: enemy.motion, raised: (enemy.state === 'chase' ? 0.25 : 0.05) + windup * 0.75, lunge, fall: deathFall(enemy), time });
      return;
    }
    parentMatrix.copy(transform.matrix);
    placeInstance(lobsterBodyMesh, enemy.slot, enemy, parentMatrix);
    for (const side of [-1, 1]) {
      const raised = (enemy.state === 'chase' ? 0.25 : 0.05) + windup * 0.75;
      transform.position.set(side * 0.75, 0.85, 2.0);
      transform.rotation.set(-raised + lunge * 1.1, side * (0.35 - lunge * 0.3) + Math.sin(time * 1.1 + side) * 0.05, 0);
      transform.scale.set(side * LOBSTER_CLAW_SCALE, LOBSTER_CLAW_SCALE, LOBSTER_CLAW_SCALE);
      transform.updateMatrix();
      partMatrix.multiplyMatrices(parentMatrix, transform.matrix);
      placeInstance(lobsterClawMesh, enemy.slot * 2 + (side < 0 ? 0 : 1), enemy, partMatrix);
    }
  }

  function renderZones(time) {
    const telegraphing = list.find((enemy) => enemy.zone && alive(enemy));
    const lining = telegraphing && telegraphing.zone.shape === 'line';
    const landedChop = !lining && list.find((enemy) => enemy.lastChop && enemy.lastChop.until > time && alive(enemy));
    lineTelegraphMesh.visible = Boolean(lining || landedChop);
    telegraphMesh.visible = Boolean(telegraphing) && !lining;
    lineTelegraphMaterial.uniforms.uOpacity.value = landedChop ? (landedChop.lastChop.until - time) / CHOP_LINGER_SECONDS : 1;
    if (lining || landedChop) {
      const source = lining ? telegraphing : landedChop;
      const zone = lining ? telegraphing.zone : { ...landedChop.lastChop, timer: 0, duration: 1 };
      const lineOwner = source;
      lineTelegraphMesh.position.set(zone.x, Math.max(world.heightAt(zone.x, zone.z), world.heightAt(lineOwner.x, lineOwner.z)) + TELEGRAPH_LIFT + 0.5, zone.z);
      lineTelegraphMesh.rotation.y = zone.angle;
      lineTelegraphMesh.scale.set(zone.width / 2, 1, zone.length / 2);
      lineTelegraphMaterial.uniforms.uProgress.value = THREE.MathUtils.clamp(1 - zone.timer / zone.duration, 0, 1);
    } else if (telegraphing) {
      const zone = telegraphing.zone;
      telegraphMesh.position.set(zone.x, world.heightAt(zone.x, zone.z) + TELEGRAPH_LIFT, zone.z);
      telegraphMesh.scale.setScalar(zone.radius);
      telegraphMaterial.uniforms.uProgress.value = THREE.MathUtils.clamp(1 - zone.timer / zone.duration, 0, 1);
      telegraphMaterial.uniforms.uOpacity.value = 1;
    }
    const inkLeft = ink.until - time;
    inkMesh.visible = inkLeft > 0;
    if (inkMesh.visible) {
      inkMesh.position.set(ink.x, world.heightAt(ink.x, ink.z) + 0.15, ink.z);
      inkMesh.scale.setScalar(INK_CLOUD_RADIUS * (1 + 0.25 * (1 - inkLeft / ink.duration)));
      inkMaterial.uniforms.uOpacity.value = Math.min(1, inkLeft / 0.6);
      inkMaterial.uniforms.uTime.value = time;
    }
  }

  function setReefVisible(visible) {
    regionVisible.reef = visible;
    for (const mesh of reefMeshes) mesh.visible = visible && !replacedMeshes.has(mesh);
  }

  function setCampVisible(visible) {
    regionVisible.camp = visible;
    for (const mesh of campMeshes) mesh.visible = visible && !replacedMeshes.has(mesh);
  }

  let holdVisible = true;
  function setHoldVisible(visible) {
    holdVisible = visible;
    regionVisible.hold = visible;
    for (const mesh of holdMeshes) mesh.visible = visible && !replacedMeshes.has(mesh);
  }

  function renderCockroach(enemy, time) {
    const scurry = Math.abs(Math.sin(time * 22 + enemy.id)) * 0.08 * enemy.motion;
    const lunge = Math.sin(enemy.strike * Math.PI);
    const recoil = Math.sin(enemy.hurt * Math.PI) * 0.4;
    const forward = lunge * 0.4 - recoil;
    transform.position.set(enemy.x + Math.sin(enemy.heading) * forward, enemy.y + scurry + 0.25 - deathSink(enemy) * 0.6, enemy.z + Math.cos(enemy.heading) * forward);
    transform.rotation.set(-lunge * 0.2, enemy.heading + Math.sin(time * 13 + enemy.id) * 0.06 * enemy.motion, deathFall(enemy) * Math.PI);
    transform.scale.setScalar(1);
    transform.updateMatrix();
    if (enemy.creature) {
      cockroachMesh.setMatrixAt(enemy.slot, hidden);
      transform.position.y -= 0.25;
      showCreature(enemy, { stride: time * 20 + enemy.id, motion: enemy.motion, lunge, fall: deathFall(enemy), time });
      return;
    }
    placeInstance(cockroachMesh, enemy.slot, enemy, transform.matrix);
  }

  function cookAnimation(enemy, time) {
    if (enemy.state === 'dying') return enemy.motion > 0.5 ? { mode: 'run', rate: COOK_FLEE_ANIMATION_RATE } : { mode: 'stand' };
    const zone = enemy.zone;
    if (zone && zone.shape === 'line') return { mode: 'slam', phase: 1 - zone.timer / zone.duration };
    if (zone && zone.stomp) return { mode: 'stomp', phase: 1 - zone.timer / zone.duration };
    if (enemy.lastChop && enemy.lastChop.until > time) return { mode: 'slam', phase: 2 - (enemy.lastChop.until - time) / CHOP_LINGER_SECONDS };
    if (enemy.motion > 0.5) return { mode: 'walk', rate: enemy.moveSpeed / COOK_STRIDE_UNITS };
    if (enemy.activity === 'chop') return { mode: 'chop', rate: 0.55 };
    if (enemy.activity === 'grumble') return { mode: 'grumble', rate: 0.5 };
    return { mode: 'stand' };
  }

  function renderCook(enemy, time) {
    if (enemy.creature) {
      cookLegMesh.setMatrixAt(enemy.slot * 2, hidden);
      cookLegMesh.setMatrixAt(enemy.slot * 2 + 1, hidden);
      cleaverMesh.setMatrixAt(enemy.slot, hidden);
      const deltaTime = THREE.MathUtils.clamp(time - (enemy.lastPoseTime ?? time), 0, 0.1);
      enemy.lastPoseTime = time;
      const chopping = (enemy.zone && enemy.zone.shape === 'line') || (enemy.lastChop && enemy.lastChop.until > time);
      enemy.chopTwist = (enemy.chopTwist || 0) + ((chopping ? COOK_CHOP_TWIST : 0) - (enemy.chopTwist || 0)) * Math.min(1, deltaTime * 5);
      transform.position.set(enemy.x, enemy.y, enemy.z);
      transform.rotation.set(0, enemy.heading + enemy.chopTwist, 0);
      placeCreature(enemy, 1);
      enemy.creature.object.visible = enemy.creature.object.visible && holdVisible;
      if (enemy.creature.object.visible) enemy.creature.pose({ deltaTime, glint: enemy.strike, ...cookAnimation(enemy, time) });
      return;
    }
    const zone = enemy.zone;
    const stompLift = zone && zone.stomp ? Math.sin(Math.min(1, (1 - zone.timer / zone.duration) * 1.15) * Math.PI * 0.5) * 6 : 0;
    const sway = Math.sin(time * 0.7 + enemy.id) * 0.04;
    for (const side of [-1, 1]) {
      const lift = side > 0 ? stompLift : 0;
      transform.position.set(enemy.x + Math.cos(enemy.heading) * side * COOK_STANCE, enemy.y + lift - deathSink(enemy) * 6, enemy.z - Math.sin(enemy.heading) * side * COOK_STANCE);
      transform.rotation.set(sway, enemy.heading, deathFall(enemy) * 0.4);
      transform.scale.setScalar(1);
      transform.updateMatrix();
      placeInstance(cookLegMesh, enemy.slot * 2 + (side < 0 ? 0 : 1), enemy, transform.matrix);
    }
    const chop = zone && zone.shape === 'line' ? zone : enemy.lastChop && enemy.lastChop.until > time ? enemy.lastChop : null;
    if (!chop || !alive(enemy)) {
      cleaverMesh.setMatrixAt(enemy.slot, hidden);
      return;
    }
    const progress = chop === zone ? 1 - zone.timer / zone.duration : 1;
    if (progress < CLEAVER_SHOW_PROGRESS) {
      cleaverMesh.setMatrixAt(enemy.slot, hidden);
      return;
    }
    const drop = THREE.MathUtils.smoothstep(progress, 0.85, 1);
    transform.position.set(chop.x, world.heightAt(chop.x, chop.z) + THREE.MathUtils.lerp(CLEAVER_HOVER_HEIGHT, 0.3, drop), chop.z);
    transform.rotation.set(0, chop.angle, 0);
    transform.scale.setScalar(1);
    transform.updateMatrix();
    cleaverMesh.setMatrixAt(enemy.slot, transform.matrix);
    setFlash(cleaverMesh, enemy.slot, 0);
  }

  function renderRat(enemy, time) {
    const scurry = Math.abs(Math.sin(time * 16 + enemy.id)) * 0.18 * enemy.motion;
    const lunge = Math.sin(enemy.strike * Math.PI);
    const recoil = Math.sin(enemy.hurt * Math.PI) * 0.5;
    const forward = lunge * 0.5 - recoil;
    transform.position.set(enemy.x + Math.sin(enemy.heading) * forward, enemy.y + scurry + lunge * 0.35 - deathSink(enemy) * 0.8, enemy.z + Math.cos(enemy.heading) * forward);
    transform.rotation.set(-lunge * 0.25 + recoil * 0.3, enemy.heading + Math.sin(time * 9 + enemy.id) * 0.05 * enemy.motion, deathFall(enemy) * Math.PI);
    transform.scale.setScalar(1);
    transform.updateMatrix();
    if (enemy.creature) {
      ratMesh.setMatrixAt(enemy.slot, hidden);
      showCreature(enemy, { stride: time * 14 + enemy.id, motion: enemy.motion, lunge, fall: deathFall(enemy), time });
      return;
    }
    placeInstance(ratMesh, enemy.slot, enemy, transform.matrix);
  }

  function renderCat(enemy, time) {
    const lunge = Math.sin(enemy.strike * Math.PI);
    const windup = enemy.zone ? 1 - enemy.zone.timer / enemy.zone.duration : 0;
    const crouch = enemy.zone && enemy.zone.pounce ? windup * 0.18 : 0;
    const hop = enemy.leap ? Math.sin(enemy.leap.time * Math.PI) * 6 : 0;
    const breathe = 0.02 * Math.sin(time * 1.6 + enemy.id);
    transform.position.set(enemy.x + Math.sin(enemy.heading) * lunge * 1.4, enemy.y + hop - deathSink(enemy) * 2, enemy.z + Math.cos(enemy.heading) * lunge * 1.4);
    transform.rotation.set(-windup * 0.12 + lunge * 0.15 - (enemy.leap ? 0.25 : 0), enemy.heading, deathFall(enemy) * 1.4);
    transform.scale.set(1 + breathe, 1 - crouch + breathe, 1 + crouch * 0.5);
    transform.updateMatrix();
    if (enemy.creature) {
      catMesh.setMatrixAt(enemy.slot, hidden);
      showCreature(enemy, { stride: time * 7 + enemy.id, motion: enemy.motion, crouch, leap: enemy.leap ? 1 : 0, lunge, windup: enemy.zone && !enemy.zone.pounce ? windup : 0, fall: deathFall(enemy), time });
      return;
    }
    placeInstance(catMesh, enemy.slot, enemy, transform.matrix);
  }

  function renderGull(enemy, time) {
    const { root, torso, wings, shadow } = enemy.model;
    const fall = deathFall(enemy);
    root.visible = enemy.state !== 'dead';
    root.position.set(enemy.x, enemy.y + enemy.altitude - deathSink(enemy) * 4, enemy.z);
    root.rotation.set(0, enemy.heading, fall * 1.45);
    const startle = Math.sin(enemy.hurt * Math.PI);
    const flying = Math.max(THREE.MathUtils.smoothstep(enemy.altitude, 0.2, 3), startle * 0.75);
    const windup = enemy.state === 'chase' && enemy.attackTimer < 0.6 ? 1 - enemy.attackTimer / 0.6 : 0;
    const leaning = enemy.state === 'chase' ? 0.22 : 0;
    torso.rotation.x = leaning + Math.sin(enemy.strike * Math.PI * 0.5) * 0.85 - windup * 0.35 + flying * 0.1 - startle * 0.3;
    torso.position.z = Math.sin(enemy.strike * Math.PI) * 1.4;
    for (const material of enemy.model.materials) material.emissive.setRGB(0.55 * enemy.hurt * enemy.hurt, 0.16 * enemy.hurt * enemy.hurt, 0.04 * enemy.hurt * enemy.hurt);
    const flap = Math.sin(time * (enemy.state === 'circling' ? 2.2 : 7)) * (enemy.state === 'circling' ? 0.18 : 0.55);
    if (enemy.creature) {
      const { object } = enemy.creature;
      object.visible = root.visible;
      object.position.copy(root.position);
      object.rotation.set(torso.rotation.x * 0.5, enemy.heading, fall * 1.45);
      object.translateZ(torso.position.z);
      object.scale.setScalar(CREATURE_SCALE.gull);
      enemy.creature.setFlash(enemy.hurt);
      enemy.creature.pose({ flying, flap: flap * 1.4, strike: Math.sin(enemy.strike * Math.PI * 0.5), windup, time });
    }
    for (const wing of wings) {
      wing.pivot.visible = flying > 0.05;
      wing.pivot.rotation.set(0, wing.side * (1 - flying) * Math.PI * 0.45, wing.side * flying * flap);
      wing.pivot.scale.x = Math.max(0.05, flying);
    }
    const shadowStrength = THREE.MathUtils.smoothstep(enemy.altitude, 2, 6) * (enemy.state === 'dead' ? 0 : 1);
    shadow.visible = shadowStrength > 0.01;
    shadow.position.set(enemy.x, world.heightAt(enemy.x, enemy.z) + 0.25, enemy.z);
    shadow.rotation.y = enemy.heading;
    shadow.scale.setScalar(0.5 + enemy.altitude / 200);
    shadow.material.opacity = 0.62 * shadowStrength;
  }

  function render(time, camera, playerTargetId, viewer) {
    const placedLabels = [];
    viewMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    viewFrustum.setFromProjectionMatrix(viewMatrix);
    for (const enemy of list) {
      if (enemy.kind === 'sandHopper') renderHopper(enemy, time);
      else if (enemy.kind === 'shoreCrab') renderShoreCrab(enemy, time);
      else if (enemy.kind === 'gull') renderGull(enemy, time);
      else if (enemy.kind === 'moray') renderMoray(enemy, time);
      else if (enemy.kind === 'octopus') renderOctopus(enemy, time);
      else if (enemy.kind === 'mantisShrimp') renderMantis(enemy, time);
      else if (enemy.kind === 'giantLobster') renderLobster(enemy, time);
      else if (enemy.kind === 'rat') renderRat(enemy, time);
      else if (enemy.kind === 'shipCat') renderCat(enemy, time);
      else if (enemy.kind === 'cockroach') renderCockroach(enemy, time);
      else if (enemy.kind === 'cook') renderCook(enemy, time);
      else if (enemy.kind === 'rivalHermit') renderRivalHermit(enemy, time);
      dressLoot(enemy);
      holdLootWeapons(enemy);
      const restText = enemy.state === 'dead' && enemy.definition.dailyBoss && enemy.home && Math.hypot(enemy.home.x - camera.position.x, enemy.home.z - camera.position.z) < RESTING_LABEL_DISTANCE ? bossReturnText(enemy.kind) : null;
      const flyingHigh = enemy.definition.flies && enemy.altitude > 6;
      const inFight = alive(enemy) && (enemy.health < enemy.definition.health || engaged(enemy) || enemy.id === playerTargetId) && !flyingHigh;
      const nearViewer = alive(enemy) && !flyingHigh && Math.hypot(enemy.x - viewer.x, enemy.z - viewer.z) < NAME_VISIBLE_DISTANCE;
      const barVisible = (inFight || nearViewer || Boolean(restText)) && viewer.isRevealed(enemy.x, enemy.z);
      if (restText) labelPoint.set(enemy.home.x, world.heightAt(enemy.home.x, enemy.home.z) + Math.min(enemy.definition.barHeight, 6), enemy.home.z).project(camera);
      else if (barVisible) projectLabelAnchor(enemy, camera);
      const onScreen = barVisible && labelPoint.z < 1;
      enemy.bar.box.classList.toggle('hidden', !onScreen);
      enemy.bar.box.classList.toggle('resting', Boolean(restText));
      enemy.bar.box.classList.toggle('name-only', !inFight && !restText);
      if (onScreen) {
        const difficulty = restText ? '' : `difficulty-${difficultyOf(levelOf(enemy), viewer.level)}`;
        if (enemy.bar.difficulty !== difficulty) {
          if (enemy.bar.difficulty) enemy.bar.name.classList.remove(enemy.bar.difficulty);
          if (difficulty) enemy.bar.name.classList.add(difficulty);
          enemy.bar.difficulty = difficulty;
        }
        const nameText = restText || labelOf(enemy);
        if (enemy.bar.name.textContent !== nameText) {
          enemy.bar.name.textContent = nameText;
          enemy.bar.halfWidth = 0;
        }
        if (!enemy.bar.halfWidth) enemy.bar.halfWidth = enemy.bar.box.offsetWidth / 2;
        enemy.bar.fill.style.width = `${(enemy.health / enemy.definition.health) * 100}%`;
        const edge = Math.max(LABEL_EDGE_PIXELS, enemy.bar.halfWidth + 8);
        const labelX = THREE.MathUtils.clamp((labelPoint.x * 0.5 + 0.5) * innerWidth, edge, innerWidth - edge);
        let labelY = Math.max(WORLD_LABEL_TOP_PIXELS, (-labelPoint.y * 0.5 + 0.5) * innerHeight);
        while (placedLabels.some((placed) => Math.abs(placed.x - labelX) < LABEL_SPACING_X && Math.abs(placed.y - labelY) < LABEL_SPACING_Y)) labelY -= LABEL_SPACING_Y;
        placedLabels.push({ x: labelX, y: labelY });
        enemy.bar.box.style.transform = `translate(-50%, -100%) translate(${labelX}px, ${labelY}px)`;
      }
    }
    renderZones(time);
    for (const mesh of allMeshes) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.geometry.attributes.aFlash.needsUpdate = true;
    }
  }

  function pickShare(enemy, clientX, clientY, camera) {
    labelPoint.set(enemy.x, enemy.y + enemy.definition.radius * 0.8, enemy.z).project(camera);
    if (labelPoint.z > 1) return Infinity;
    const screenX = (labelPoint.x * 0.5 + 0.5) * innerWidth;
    const screenY = (-labelPoint.y * 0.5 + 0.5) * innerHeight;
    cameraRight.setFromMatrixColumn(camera.matrixWorld, 0);
    pickEdge.set(enemy.x, enemy.y + enemy.definition.radius * 0.8, enemy.z).addScaledVector(cameraRight, enemy.definition.radius * PICK_BODY_MARGIN).project(camera);
    const bodyRadius = Math.hypot((pickEdge.x * 0.5 + 0.5) * innerWidth - screenX, (-pickEdge.y * 0.5 + 0.5) * innerHeight - screenY);
    return Math.hypot(screenX - clientX, screenY - clientY) / Math.max(MIN_PICK_RADIUS_PIXELS, bodyRadius);
  }

  function pick(clientX, clientY, camera) {
    let best = null;
    for (const enemy of list) {
      if (!alive(enemy) || enemy.altitude > 3) continue;
      const share = pickShare(enemy, clientX, clientY, camera);
      if (share < 1 && (!best || share < best.share)) best = { enemy, share };
    }
    return best ? best.enemy : null;
  }

  function spawn(kind, x, z, which = 0) {
    const enemy = list.filter((candidate) => candidate.kind === kind)[which];
    if (!enemy) return null;
    enemy.loot = null;
    place(enemy, { x, z });
    return enemy;
  }

  const inkAt = (time) => (ink.until > time ? ink : null);

  return { list, update, render, pick, pickShare, damage, calmAll, alive, spawn, startChase, giveUp, setReefVisible, setCampVisible, setHoldVisible, inkAt };
}
