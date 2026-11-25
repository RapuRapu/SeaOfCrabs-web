import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createRandom, createNoise2D } from '../noise.js';
import { applySeaside, createMotionDepthMaterial } from './seaside.js';

const linearColor = (red, green, blue) => new THREE.Color().setRGB(red, green, blue, THREE.SRGBColorSpace);
const SEAWEED_COLORS = [linearColor(0.2, 0.42, 0.14), linearColor(0.34, 0.5, 0.12), linearColor(0.5, 0.3, 0.14), linearColor(0.14, 0.34, 0.2)];
const GRASS_COLORS = [linearColor(0.62, 0.68, 0.34), linearColor(0.74, 0.72, 0.4), linearColor(0.5, 0.6, 0.3)];
const GRASS_BLADE_SEGMENTS = 6;
const SEAWEED_LENGTH_SEGMENTS = 10;
const SEAWEED_WIDTH_SEGMENTS = 2;
const SEAWEED_MIDRIB_CUP = 0.14;
const SEAWEED_EDGE_RUFFLE = 0.05;
const FLOATING_MEANDER = 0.22;
const FLOATING_BEND_RADIUS = 0.5;

const FLOATING_LEAF_LIFT = 0.015;
const FLOATING_LEAF_SHADE = 1.15;
const FLOATING_FOLD_SOFTNESS = 0.45;

const BLADE_DECLARATIONS_GLSL = /* glsl */ `
attribute vec3 aRoot;
attribute vec4 aBlade;
uniform float uTime;
uniform float uSeaLevel;
uniform sampler2D uRetained;
uniform float uWorldSize;
uniform vec3 uCrabPosition;
`;

const CRAB_PUSH_GLSL = /* glsl */ `
    vec2 crabAway = aRoot.xz - uCrabPosition.xz;
    float crabDistance = length(crabAway);
    float crabPush = (1.0 - smoothstep(0.5, 2.4, crabDistance)) * (1.0 - smoothstep(2.0, 4.0, abs(aRoot.y - uCrabPosition.y))) * bladeAlong * bladeAlong * bladeLength * 0.6;
    transformed.xz += crabAway / max(crabDistance, 0.001) * crabPush;
    transformed.y -= crabPush * 0.4;
`;

const bladeMotion = (floats) => ({
  key: `blade-${floats}`,
  declarations: BLADE_DECLARATIONS_GLSL,
  normalCode: /* glsl */ `objectNormal = normalize(vec3(-sin(aBlade.z) * 0.55, 0.75, cos(aBlade.z) * 0.55));`,
  colorCode: /* glsl */ `vColor.rgb *= mix(0.3, 1.2, sqrt(position.y));`,
  code: /* glsl */ `
    float bladeAlong = position.y;
    float bladeLength = aBlade.x;
    float bladeSide = position.x * aBlade.y * (1.0 - bladeAlong * bladeAlong * 0.92);
    float swayPhase = uTime * ${floats ? '1.15' : '1.9'} + aBlade.w + aRoot.x * 0.11 + aRoot.z * 0.07;
    vec2 sway = vec2(sin(swayPhase), cos(swayPhase * 0.83 + 1.3)) * (bladeAlong * bladeAlong) * bladeLength * ${floats ? '0.34' : '0.1'};
    vec2 lean = vec2(cos(aBlade.w * 3.7), sin(aBlade.w * 3.7)) * (bladeAlong * bladeAlong) * bladeLength * ${floats ? '0.12' : '0.34'};
    transformed = aRoot + vec3(cos(aBlade.z) * bladeSide + sway.x + lean.x, bladeAlong * bladeLength * ${floats ? '1.0' : '0.92'}, sin(aBlade.z) * bladeSide + sway.y + lean.y);
    ${floats ? `
    float bladeCentreness = 1.0 - 4.0 * position.x * position.x;
    transformed.xz += vec2(-sin(aBlade.z), cos(aBlade.z)) * bladeCentreness * aBlade.y * ${SEAWEED_MIDRIB_CUP.toFixed(2)} * (1.0 - bladeAlong * 0.6);` : ''}
    ${CRAB_PUSH_GLSL}
    ${floats ? `
    float bladeSurface = max(uSeaLevel, texture2D(uRetained, transformed.xz / uWorldSize + 0.5).r) + ${FLOATING_LEAF_LIFT.toFixed(3)};
    float bladeExcess = transformed.y - bladeSurface;
    float floatingShare = smoothstep(-${FLOATING_FOLD_SOFTNESS.toFixed(2)}, ${FLOATING_FOLD_SOFTNESS.toFixed(2)}, bladeExcess);
    if (floatingShare > 0.0) {
      float lyingExcess = 0.5 * (bladeExcess + sqrt(bladeExcess * bladeExcess + ${FLOATING_BEND_RADIUS.toFixed(2)} * ${FLOATING_BEND_RADIUS.toFixed(2)})) - 0.5 * ${FLOATING_BEND_RADIUS.toFixed(2)};
      float edgeRuffle = (1.0 - bladeCentreness) * sin(bladeAlong * bladeLength * 5.0 + aBlade.w * 2.0) * ${SEAWEED_EDGE_RUFFLE.toFixed(3)};
      float lyingHeight = max(aRoot.y + 0.05, bladeSurface) + lyingExcess * 0.03 + bladeCentreness * 0.012 + edgeRuffle;
      transformed.y = mix(transformed.y, lyingHeight, floatingShare);
      vec2 driftDirection = normalize(sway + lean + vec2(0.31, 0.17));
      transformed.xz += driftDirection * lyingExcess * 0.85;
      transformed.xz += vec2(-driftDirection.y, driftDirection.x) * sin(lyingExcess * 2.2 + aBlade.w) * lyingExcess * ${FLOATING_MEANDER.toFixed(2)};
      vNormal = normalize(mix(vNormal, normalMatrix * vec3(0.0, 1.0, 0.0), floatingShare));
      vColor.rgb *= mix(1.0, ${FLOATING_LEAF_SHADE.toFixed(2)}, floatingShare);
    }` : ''}
  `,
});

function buildBladeField(placements, colors, quality, { floats, castShadow, widthSegments, lengthSegments }) {
  const strip = new THREE.PlaneGeometry(1, 1, widthSegments, lengthSegments).translate(0, 0.5, 0);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = strip.index;
  geometry.setAttribute('position', strip.attributes.position);
  geometry.setAttribute('normal', strip.attributes.normal);
  const roots = new Float32Array(placements.length * 3);
  const blades = new Float32Array(placements.length * 4);
  const tints = new Float32Array(placements.length * 3);
  placements.forEach((placement, index) => {
    roots.set([placement.x, placement.y, placement.z], index * 3);
    blades.set([placement.length, placement.width, placement.angle, placement.phase], index * 4);
    const tint = colors[placement.colorIndex % colors.length];
    tints.set([tint.r * placement.shade, tint.g * placement.shade, tint.b * placement.shade], index * 3);
  });
  geometry.setAttribute('aRoot', new THREE.InstancedBufferAttribute(roots, 3));
  geometry.setAttribute('aBlade', new THREE.InstancedBufferAttribute(blades, 4));
  geometry.setAttribute('color', new THREE.InstancedBufferAttribute(tints, 3));
  geometry.instanceCount = placements.length;
  const motion = bladeMotion(floats);
  const material = applySeaside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: floats ? 0.7 : 0.7, side: THREE.DoubleSide }), { wetDarkening: floats ? 1.0 : 0.85, wetRoughness: floats ? 0.7 : 0.3, causticStrength: 1.6, chromaticCaustics: quality.chromaticCaustics, glow: floats ? 0.1 : 0.06, vertexMotion: motion });
  const seasideCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    seasideCompile(shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal *= faceDirection;');
  };
  const seasideCacheKey = material.customProgramCacheKey;
  material.customProgramCacheKey = () => `${seasideCacheKey()}|blade-both-faces-lit`;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.castShadow = castShadow;
  if (castShadow) mesh.customDepthMaterial = createMotionDepthMaterial(motion);
  return mesh;
}

function seaweedPlacements(world, quality) {
  const random = createRandom(909);
  const placements = [];
  const clusterCount = Math.round(70 * quality.density);
  for (let cluster = 0; cluster < clusterCount; cluster++) {
    const spot = world.randomSpot(random, (x, z, height) => world.retained.levelAt(x, z) - height > 1.0 || (height < -3.0 && height > -6.0 && !world.isOnReef(x, z)));
    if (!spot) continue;
    const bladeCount = 5 + Math.floor(random() * 9);
    const colorIndex = Math.floor(random() * SEAWEED_COLORS.length);
    for (let blade = 0; blade < bladeCount; blade++) {
      const angle = random() * Math.PI * 2;
      const spread = random() * 1.3;
      const x = spot.x + Math.cos(angle) * spread;
      const z = spot.z + Math.sin(angle) * spread;
      placements.push({ x, y: world.heightAt(x, z) - 0.05, z, length: 1.6 + random() * 2.6, width: 0.3 + random() * 0.4, angle: random() * Math.PI, phase: random() * 6.28, colorIndex, shade: 0.75 + random() * 0.5 });
    }
  }
  return placements;
}

function grassPlacements(world, quality) {
  const random = createRandom(515);
  const clumpNoise = createNoise2D(88);
  const placements = [];
  const wantedTufts = Math.round(950 * quality.density);
  let tufts = 0;
  let attempts = 0;
  while (tufts < wantedTufts && attempts < wantedTufts * 40) {
    attempts++;
    const centerX = (random() * 2 - 1) * 170;
    const centerZ = -55 - random() * 125;
    const centerHeight = world.heightAt(centerX, centerZ);
    const duneCover = THREE.MathUtils.smoothstep(centerHeight, 3.4, 6.5) * (0.3 + 0.7 * THREE.MathUtils.smoothstep(clumpNoise(centerX * 0.06, centerZ * 0.06), -0.25, 0.3));
    if (random() > duneCover) continue;
    if (world.boulders.some((boulder) => Math.hypot(centerX - boulder.x, centerZ - boulder.z) < boulder.radius * 1.05)) continue;
    if (world.isInHold(centerX, centerZ) || world.isInCamp(centerX, centerZ)) continue;
    tufts++;
    const tuftHeight = 3 + random() * random() * 8;
    const colorIndex = Math.floor(random() * 3);
    const bladeCount = 10 + Math.floor(random() * 9);
    for (let blade = 0; blade < bladeCount; blade++) {
      const angle = random() * Math.PI * 2;
      const spread = random() * 0.7;
      const x = centerX + Math.cos(angle) * spread;
      const z = centerZ + Math.sin(angle) * spread;
      placements.push({ x, y: world.heightAt(x, z) - 0.35, z, length: tuftHeight * (0.55 + random() * 0.6), width: 0.13 + random() * 0.12, angle: random() * Math.PI, phase: angle / 3.7 + random() * 0.25, colorIndex, shade: 0.75 + random() * 0.45 });
    }
  }
  return placements;
}

function buildStarfishGeometry(spot, size, heading, color) {
  const armPoints = 40;
  const positions = [0, 0.26, 0];
  for (const [ringScale, ringHeight] of [[0.5, 0.2], [1, 0.03]]) {
    for (let point = 0; point < armPoints; point++) {
      const angle = (point / armPoints) * Math.PI * 2;
      const armProfile = Math.pow(Math.abs(Math.cos(angle * 2.5)), 2.2);
      const radius = (0.24 + 0.76 * armProfile) * ringScale;
      positions.push(Math.cos(angle) * radius, ringHeight * (0.5 + 0.5 * armProfile), Math.sin(angle) * radius);
    }
  }
  const indices = [];
  for (let point = 0; point < armPoints; point++) {
    const next = (point + 1) % armPoints;
    indices.push(0, 1 + next, 1 + point);
    indices.push(1 + point, 1 + next, 1 + armPoints + point, 1 + next, 1 + armPoints + next, 1 + armPoints + point);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const colors = new Float32Array((positions.length / 3) * 3);
  for (let index = 0; index < positions.length / 3; index++) {
    const shade = index === 0 ? 1.25 : index <= armPoints ? 1.0 : 0.72;
    colors.set([color.r * shade, color.g * shade, color.b * shade], index * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.scale(size, size, size).rotateY(heading).translate(spot.x, spot.y + 0.02, spot.z);
  return withCreatureCenter(geometry, spot.x, spot.y, spot.z, size);
}

function withCreatureCenter(geometry, x, y, z, size) {
  const centers = new Float32Array(geometry.attributes.position.count * 4);
  for (let index = 0; index < geometry.attributes.position.count; index++) centers.set([x, y, z, size], index * 4);
  geometry.setAttribute('aCreature', new THREE.BufferAttribute(centers, 4));
  return geometry;
}

const CREATURE_DECLARATIONS_GLSL = /* glsl */ `
attribute vec4 aCreature;
uniform float uTime;
uniform vec3 uCrabPosition;
`;

const starfishMotion = {
  key: 'starfish',
  declarations: CREATURE_DECLARATIONS_GLSL,
  code: /* glsl */ `
    vec2 starfishOffset = transformed.xz - aCreature.xz;
    float starfishReach = length(starfishOffset) / aCreature.w;
    float crabNear = 1.0 - smoothstep(1.2, 3.0, distance(aCreature.xz, uCrabPosition.xz));
    float breathe = 0.5 + 0.5 * sin(uTime * 0.6 + aCreature.x * 1.7 + atan(starfishOffset.y, starfishOffset.x) * 2.0);
    transformed.y += starfishReach * starfishReach * aCreature.w * (0.05 * breathe + 0.32 * crabNear);
    transformed.xz -= starfishOffset * crabNear * 0.12 * starfishReach;
  `,
};

const anemoneMotion = {
  key: 'anemone',
  declarations: CREATURE_DECLARATIONS_GLSL,
  colorCode: /* glsl */ `
    float closedTint = 1.0 - smoothstep(1.8, 4.2, distance(aCreature.xz, uCrabPosition.xz));
    vColor.rgb *= 1.0 - 0.45 * closedTint * smoothstep(0.5, 0.8, (position.y - aCreature.y) / aCreature.w);
  `,
  code: /* glsl */ `
    float tentacle = smoothstep(0.55, 0.75, (transformed.y - aCreature.y) / aCreature.w);
    float closed = 1.0 - smoothstep(1.8, 4.2, distance(aCreature.xz, uCrabPosition.xz));
    vec3 mouth = vec3(aCreature.x, aCreature.y + 0.62 * aCreature.w, aCreature.z);
    float above = max(0.0, transformed.y - mouth.y);
    transformed.xz += tentacle * vec2(sin(uTime * 1.3 + aCreature.x + transformed.y * 2.0), cos(uTime * 1.1 + aCreature.z + transformed.y * 2.0)) * above * 0.18 * (1.0 - closed);
    transformed = mix(transformed, mouth, tentacle * closed * 0.82);
  `,
};

function buildAnemoneGeometry(spot, size, color) {
  const parts = [];
  const paint = (geometry, tint, shade) => {
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    for (let index = 0; index < geometry.attributes.position.count; index++) colors.set([tint.r * shade, tint.g * shade, tint.b * shade], index * 3);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.deleteAttribute('uv');
    return geometry;
  };
  parts.push(paint(new THREE.CylinderGeometry(0.42, 0.55, 0.6, 12).translate(0, 0.3, 0), color, 0.45));
  const tentacleCount = 18;
  for (let ring = 0; ring < 2; ring++) {
    for (let tentacle = 0; tentacle < tentacleCount; tentacle++) {
      const angle = (tentacle / tentacleCount) * Math.PI * 2 + ring * 0.17;
      const tilt = 0.55 + ring * 0.45;
      const geometry = new THREE.ConeGeometry(0.075, 0.75 - ring * 0.15, 5).translate(0, 0.37, 0).rotateZ(-tilt).rotateY(-angle).translate(Math.cos(angle) * 0.3, 0.58, Math.sin(angle) * 0.3);
      parts.push(paint(geometry, color, 0.85 + ring * 0.45));
    }
  }
  return withCreatureCenter(mergeGeometries(parts).scale(size, size, size).translate(spot.x, spot.y - 0.05, spot.z), spot.x, spot.y - 0.05, spot.z, size);
}

const FISH_DECLARATIONS_GLSL = /* glsl */ `
attribute vec4 aOrbit;
attribute vec4 aSwim;
uniform float uTime;
uniform vec3 uCrabPosition;
`;

const fishMotion = {
  key: 'fish',
  declarations: FISH_DECLARATIONS_GLSL,
  normalCode: /* glsl */ `
    float fishTurnN = uTime * aSwim.y + aSwim.z;
    float fishHeadingN = fishTurnN + sign(aSwim.y) * 1.5708;
    objectNormal = vec3(objectNormal.x * cos(fishHeadingN) - objectNormal.z * sin(fishHeadingN), objectNormal.y, objectNormal.x * sin(fishHeadingN) + objectNormal.z * cos(fishHeadingN));
  `,
  code: /* glsl */ `
    float fishTurn = uTime * aSwim.y + aSwim.z;
    float fishHeading = fishTurn + sign(aSwim.y) * 1.5708;
    vec2 fishWobble = vec2(sin(fishTurn * 2.7), cos(fishTurn * 1.9)) * 1.3;
    vec3 fishCenter = vec3(aOrbit.x + cos(fishTurn) * aSwim.x + fishWobble.x, aOrbit.y + sin(fishTurn * 3.1) * 0.15, aOrbit.z + sin(fishTurn) * aSwim.x * aOrbit.w + fishWobble.y);
    vec3 fromCrab = fishCenter - uCrabPosition;
    float fear = 1.0 - smoothstep(3.0, 9.0, length(fromCrab));
    fishCenter.xz += normalize(fromCrab.xz + vec2(0.001, 0.0)) * fear * 6.0;
    vec3 fishLocal = position * aSwim.w;
    fishLocal.z += sin(uTime * (9.0 + fear * 14.0) + aSwim.z * 7.0 - position.x * 2.6) * (0.16 + fear * 0.1) * aSwim.w * (1.0 - smoothstep(-1.0, 0.2, position.x));
    transformed = fishCenter + vec3(fishLocal.x * cos(fishHeading) - fishLocal.z * sin(fishHeading), fishLocal.y, fishLocal.x * sin(fishHeading) + fishLocal.z * cos(fishHeading));
  `,
};

function buildFishSchool(world, quality) {
  const random = createRandom(1203);
  const body = new THREE.SphereGeometry(1, 10, 6).scale(0.62, 0.24, 0.12);
  const tail = new THREE.ConeGeometry(0.24, 0.42, 4).rotateZ(-Math.PI / 2).scale(1, 1, 0.25).translate(-0.74, 0, 0);
  const fishShape = mergeGeometries([body, tail]);
  fishShape.deleteAttribute('uv');
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = fishShape.index;
  geometry.setAttribute('position', fishShape.attributes.position);
  geometry.setAttribute('normal', fishShape.attributes.normal);
  const orbits = [];
  const swims = [];
  const tints = [];
  for (const pool of world.pools) {
    const schoolSize = Math.round((pool.radiusX > 20 ? 22 : 6) * quality.density);
    for (let fish = 0; fish < schoolSize; fish++) {
      const reach = Math.min(pool.radiusX, pool.radiusZ) * (0.2 + random() * 0.24);
      const direction = random() < 0.75 ? 1 : -1;
      orbits.push(pool.x + (random() - 0.5) * 3, pool.retainedLevel - 0.6 - random() * 1.2, pool.z + (random() - 0.5) * 3, 0.7 + random() * 0.2);
      swims.push(reach, direction * (0.22 + random() * 0.16) * (9 / reach), random() * 6.28, 0.32 + random() * 0.24);
      const shade = 0.8 + random() * 0.5;
      tints.push(0.2 * shade, 0.28 * shade, 0.36 * shade);
    }
  }
  geometry.setAttribute('aOrbit', new THREE.InstancedBufferAttribute(new Float32Array(orbits), 4));
  geometry.setAttribute('aSwim', new THREE.InstancedBufferAttribute(new Float32Array(swims), 4));
  geometry.setAttribute('color', new THREE.InstancedBufferAttribute(new Float32Array(tints), 3));
  geometry.instanceCount = orbits.length / 4;
  const material = applySeaside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.1 }), { wetDarkening: 1, causticStrength: 1.2, chromaticCaustics: false, vertexMotion: fishMotion });
  const seasideCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    seasideCompile(shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal *= faceDirection;');
  };
  const seasideCacheKey = material.customProgramCacheKey;
  material.customProgramCacheKey = () => `${seasideCacheKey()}|blade-both-faces-lit`;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.customDepthMaterial = createMotionDepthMaterial(fishMotion);
  return mesh;
}

export function createLife(scene, world, quality) {
  scene.add(buildBladeField(seaweedPlacements(world, quality), SEAWEED_COLORS, quality, { floats: true, castShadow: false, widthSegments: SEAWEED_WIDTH_SEGMENTS, lengthSegments: SEAWEED_LENGTH_SEGMENTS }));
  scene.add(buildBladeField(grassPlacements(world, quality), GRASS_COLORS, quality, { floats: false, castShadow: quality.grassShadows, widthSegments: 1, lengthSegments: GRASS_BLADE_SEGMENTS }));

  const random = createRandom(77);
  const starfishColors = [linearColor(0.95, 0.42, 0.16), linearColor(0.82, 0.2, 0.24), linearColor(0.6, 0.3, 0.62), linearColor(0.98, 0.66, 0.2)];
  const anemoneColors = [linearColor(0.8, 0.42, 0.5), linearColor(0.42, 0.7, 0.62), linearColor(0.8, 0.58, 0.34), linearColor(0.58, 0.46, 0.76)];
  const starfish = [];
  const anemones = [];
  const anemoneSpots = [];
  const inPoolShallows = (x, z, height) => world.retained.levelAt(x, z) - height > 0.25;
  const inPoolDepths = (x, z, height) => world.retained.levelAt(x, z) - height > 1.2;
  for (let index = 0; index < Math.round(16 * quality.density); index++) {
    const spot = world.randomSpot(random, index % 3 === 0 ? (x, z, height) => height > -2.4 && height < -0.6 : inPoolShallows);
    if (spot) starfish.push(buildStarfishGeometry(spot, 0.9 + random() * 0.8, random() * 6.28, starfishColors[index % starfishColors.length]));
  }
  for (let index = 0; index < Math.round(30 * quality.density); index++) {
    const spot = world.randomSpot(random, inPoolDepths);
    if (!spot) continue;
    anemoneSpots.push(spot);
    anemones.push(buildAnemoneGeometry(spot, 0.8 + random() * 0.9, anemoneColors[index % anemoneColors.length]));
  }
  const starfishMesh = new THREE.Mesh(mergeGeometries(starfish), applySeaside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), { wetDarkening: 0.8, wetRoughness: 0.25, chromaticCaustics: quality.chromaticCaustics, vertexMotion: starfishMotion }));
  starfishMesh.castShadow = true;
  starfishMesh.customDepthMaterial = createMotionDepthMaterial(starfishMotion);
  starfishMesh.receiveShadow = true;
  const anemoneMesh = new THREE.Mesh(mergeGeometries(anemones), applySeaside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }), { wetDarkening: 1, causticStrength: 1.4, chromaticCaustics: false, glow: 0.22, vertexMotion: anemoneMotion }));
  anemoneMesh.castShadow = true;
  anemoneMesh.customDepthMaterial = createMotionDepthMaterial(anemoneMotion);
  scene.add(starfishMesh, anemoneMesh, buildFishSchool(world, quality));
  return { anemoneSpots };
}
