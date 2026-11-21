import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { applySeaside, createGearGlowUniforms, updateGearGlowUniforms, gearGlowColorAt } from './seaside.js';
import { buildAssetRig, crabAssetLoaded, shellModelAvailable, buildShellModel, dressShellMaterial, weaponModelAvailable, dressWeaponMaterial, WEAPON_MODEL_FIT } from './hermitAsset.js';

const linearColor = (red, green, blue) => new THREE.Color().setRGB(red, green, blue, THREE.SRGBColorSpace);
const CARAPACE = linearColor(0.86, 0.3, 0.14);
const CARAPACE_DARK = linearColor(0.6, 0.16, 0.1);
const CLAW_TIP = linearColor(0.98, 0.86, 0.72);
const EYE = linearColor(0.03, 0.03, 0.04);

const SHELL_RINGS = 96;
const SHELL_SIDES = 20;
const KNOB_TIP_COLOR = linearColor(1, 0.86, 0.8);
const LYING_FORM_TILT = 0.5;
const BEAK_COLOR = linearColor(0.58, 0.47, 0.3);
const LYING_FORM_LIFT = 0.15;
const SHELL_LEAN_BACK = -0.5;
const ANTENNA_FORWARD_TILT = 1.32;
const LEG_RISE = 0.28;
const LEG_SPLAY = 0.32;
const ATTACK_SECONDS = 0.45;
const SHOULDER_CARRY_JOINTS = [0.5, 1.0, 0, 0.6];
const SHOULDER_WINDUP_JOINTS = [0.95, 1.35, 0, 0.5];
const SHOULDER_CHOP_JOINTS = [0.15, 0.45, 0.15, -0.25];
const HURT_SECONDS = 0.55;
const DEATH_SECONDS = 1.1;

function tinted(geometry, color, shadeByHeight = 0) {
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  for (let index = 0; index < positions.count; index++) {
    const heightShare = (positions.getY(index) - min.y) / Math.max(1e-5, max.y - min.y);
    const shade = 1 - shadeByHeight * (1 - heightShare);
    colors.set([color.r * shade, color.g * shade, color.b * shade], index * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.deleteAttribute('uv');
  return geometry;
}

function buildSoftAbdomenGeometry(look) {
  const skin = linearColor(...look.light);
  const fold = linearColor(...look.band);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.05, 0.12, 0.42),
    new THREE.Vector3(0.22, 0.02, 0.78),
    new THREE.Vector3(0.36, -0.26, 0.9),
    new THREE.Vector3(0.4, -0.5, 0.7),
  ]);
  const segments = 28;
  const geometry = new THREE.TubeGeometry(curve, segments, 1, 14, false);
  const positions = geometry.attributes.position;
  const point = new THREE.Vector3();
  const colors = [];
  const color = new THREE.Color();
  for (let index = 0; index < positions.count; index++) {
    const along = Math.floor(index / 15) / segments;
    curve.getPointAt(along, point);
    const radius = look.tubeRadius * (1 - 0.7 * along) * (1 - 0.12 * Math.pow(0.5 + 0.5 * Math.cos(along * segments * 0.9), 4));
    positions.setXYZ(index, point.x + (positions.getX(index) - point.x) * radius, point.y + (positions.getY(index) - point.y) * radius, point.z + (positions.getZ(index) - point.z) * radius);
    color.copy(skin).lerp(fold, Math.pow(0.5 + 0.5 * Math.cos(along * segments * 0.9), 6));
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.deleteAttribute('uv');
  geometry.computeVertexNormals();
  return { geometry, mouthOffset: 0 };
}

function colorize(geometry, colorAt) {
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const color = new THREE.Color();
  for (let index = 0; index < positions.count; index++) {
    colorAt(color, positions.getX(index), positions.getY(index), positions.getZ(index));
    colors.set([color.r, color.g, color.b], index * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  if (geometry.attributes.uv) geometry.deleteAttribute('uv');
  return geometry;
}

function buildCanGeometry(look) {
  const metal = linearColor(...look.light);
  const label = linearColor(...look.band);
  const inside = linearColor(...look.inside);
  const rust = linearColor(0.5, 0.26, 0.12);
  const { radius, length } = look;
  const wall = new THREE.CylinderGeometry(radius, radius, length, 28, 10, true).rotateX(Math.PI / 2).translate(0, 0, length / 2);
  const positions = wall.attributes.position;
  for (let index = 0; index < positions.count; index++) {
    const z = positions.getZ(index);
    const ridge = 1 + 0.03 * Math.sin(z * 26) * (z > length * 0.15 && z < length * 0.85 ? 0 : 1);
    positions.setX(index, positions.getX(index) * ridge);
    positions.setY(index, positions.getY(index) * ridge);
  }
  wall.computeVertexNormals();
  const painted = colorize(wall, (color, x, y, z) => {
    const onLabel = z > length * 0.2 && z < length * 0.8;
    const stripe = onLabel && Math.abs(z - length * 0.5) < length * 0.07;
    color.copy(onLabel ? (stripe ? linearColor(0.96, 0.92, 0.82) : label) : metal);
    const spot = Math.sin(x * 13 + z * 7) * Math.sin(y * 11 - z * 5);
    color.lerp(rust, THREE.MathUtils.smoothstep(spot, 0.55, 0.9) * 0.7);
  });
  const bottom = colorize(new THREE.CircleGeometry(radius, 28).translate(0, 0, length), (color) => color.copy(metal).multiplyScalar(0.8));
  const rim = colorize(new THREE.TorusGeometry(radius, 0.05, 6, 28).translate(0, 0, 0.02), (color) => color.copy(metal));
  const lining = colorize(new THREE.CircleGeometry(radius * 0.93, 28).translate(0, 0, length * 0.6), (color) => color.copy(inside));
  return mergeGeometries([painted, bottom, rim, lining].map((geometry) => geometry.index ? geometry.toNonIndexed() : geometry));
}

function buildBottleGeometry(look) {
  const glass = linearColor(...look.light);
  const label = linearColor(...look.band);
  const inside = linearColor(...look.inside);
  const { radius, length, neckRadius } = look;
  const profile = [[neckRadius * 1.15, 0], [neckRadius, 0.05], [neckRadius, length * 0.18], [radius * 0.92, length * 0.36], [radius, length * 0.48], [radius, length * 0.97], [radius * 0.9, length], [0, length]].map(([r, h]) => new THREE.Vector2(r, h));
  const body = new THREE.LatheGeometry(profile, 26).rotateX(Math.PI / 2);
  const painted = colorize(body, (color, x, y, z) => {
    const onLabel = z > length * 0.55 && z < length * 0.85;
    color.copy(onLabel ? label : glass).multiplyScalar(onLabel ? 1 : 0.85 + 0.5 * THREE.MathUtils.smoothstep(y, radius * 0.3, radius));
  });
  const lining = colorize(new THREE.CircleGeometry(neckRadius * 0.9, 20).translate(0, 0, 0.08), (color) => color.copy(inside));
  return mergeGeometries([painted, lining].map((geometry) => geometry.index ? geometry.toNonIndexed() : geometry));
}

function buildSkullGeometry(look) {
  const bone = linearColor(...look.light);
  const shadow = linearColor(...look.band);
  const inside = linearColor(...look.inside);
  const { radius, length } = look;
  const cranium = new THREE.SphereGeometry(1, 28, 20).scale(radius, radius * 0.9, length * 0.5).translate(0, radius * 0.15, length * 0.55);
  const positions = cranium.attributes.position;
  for (let index = 0; index < positions.count; index++) {
    const z = positions.getZ(index);
    const flatten = z < length * 0.25 ? 0.85 : 1;
    positions.setY(index, positions.getY(index) * flatten);
  }
  cranium.computeVertexNormals();
  const parts = [colorize(cranium, (color, x, y, z) => {
    color.copy(bone).lerp(shadow, THREE.MathUtils.smoothstep(Math.abs(Math.sin(x * 9 + z * 3)), 0.97, 1) * 0.6);
    const socket = [-1, 1].some((side) => Math.hypot(x - side * radius * 0.42, y - radius * 0.35, (z - length * 0.95) * 0.7) < radius * 0.32);
    if (socket) color.copy(shadow).multiplyScalar(0.25);
  })];
  const jaw = new THREE.SphereGeometry(1, 18, 10).scale(radius * 0.62, radius * 0.4, length * 0.32).translate(0, -radius * 0.55, length * 0.82);
  parts.push(colorize(jaw, (color, x, y, z) => color.copy(bone).multiplyScalar(0.92).lerp(shadow, Math.abs(Math.sin(x * 22)) > 0.9 && y > -radius * 0.4 ? 0.7 : 0)));
  for (const side of [-1, 1]) {
    parts.push(colorize(new THREE.SphereGeometry(radius * 0.3, 14, 10).scale(1, 0.3, 1).translate(side * radius * 0.4, radius * 0.74, length * 0.86), (color) => color.copy(shadow).multiplyScalar(0.45)));
  }
  parts.push(colorize(new THREE.ConeGeometry(radius * 0.5, length * 0.8, 14).rotateX(Math.PI / 2 + 0.25).scale(1, 0.55, 1).translate(0, radius * 0.1, length * 1.38), (color, x, y, z) => color.copy(BEAK_COLOR).lerp(bone, THREE.MathUtils.smoothstep(z, length * 1.4, length * 1.05))));
  parts.push(colorize(new THREE.CircleGeometry(radius * 0.55, 22).translate(0, 0, 0.3), (color) => color.copy(inside)));
  return mergeGeometries(parts.map((geometry) => (geometry.index ? geometry.toNonIndexed() : geometry)));
}

function buildThimbleGeometry(look) {
  const metal = linearColor(...look.light);
  const dimple = linearColor(...look.band);
  const inside = linearColor(...look.inside);
  const { radius, length } = look;
  const wall = new THREE.CylinderGeometry(radius * 0.82, radius, length, 30, 12, true).rotateX(Math.PI / 2).translate(0, 0, length / 2);
  const painted = colorize(wall, (color, x, y, z) => {
    const angle = Math.atan2(y, x);
    const dimpled = z > length * 0.18 && Math.sin(angle * 18) * Math.sin(z * 13) > 0.55;
    color.copy(dimpled ? dimple : metal).multiplyScalar(z < length * 0.12 ? 1.15 : 1);
  });
  const cap = colorize(new THREE.SphereGeometry(radius * 0.82, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1, 0.45).rotateX(Math.PI / 2).translate(0, 0, length), (color, x, y) => color.copy(Math.sin(x * 16) * Math.sin(y * 16) > 0.4 ? dimple : metal));
  const rim = colorize(new THREE.TorusGeometry(radius, 0.07, 6, 30).translate(0, 0, 0.03), (color) => color.copy(metal).multiplyScalar(1.15));
  const lining = colorize(new THREE.CircleGeometry(radius * 0.9, 24).translate(0, 0, length * 0.55), (color) => color.copy(inside));
  return mergeGeometries([painted, cap, rim, lining].map((geometry) => (geometry.index ? geometry.toNonIndexed() : geometry)));
}

const LYING_FORM_BUILDERS = { can: buildCanGeometry, bottle: buildBottleGeometry, skull: buildSkullGeometry, thimble: buildThimbleGeometry };

export function buildShellGeometry(look) {
  if (look.soft) return buildSoftAbdomenGeometry(look);
  if (LYING_FORM_BUILDERS[look.form]) {
    const mouthOffset = look.whorlRadius + 0.02;
    const geometry = LYING_FORM_BUILDERS[look.form](look).rotateX(-LYING_FORM_TILT).translate(mouthOffset, LYING_FORM_LIFT, 0);
    return { geometry, mouthOffset };
  }
  const light = linearColor(...look.light);
  const bandColor = linearColor(...look.band);
  const positions = [];
  const colors = [];
  const indices = [];
  const color = new THREE.Color();
  for (let ring = 0; ring <= SHELL_RINGS; ring++) {
    const along = (ring / SHELL_RINGS) * look.spireShare;
    const closing = ring === SHELL_RINGS ? 0 : 1;
    const angle = along * look.turns * Math.PI * 2;
    const whorlRadius = look.whorlRadius * Math.pow(1 - along, 1.15) + 0.02 * (1 - along);
    const tubeRadius = (look.tubeRadius * Math.pow(1 - along, 0.95) + 0.015 * (1 - along)) * closing;
    const centerX = Math.cos(angle) * whorlRadius;
    const centerZ = Math.sin(angle) * whorlRadius;
    const centerY = along * look.height + look.tubeRadius * (1 - Math.pow(1 - along, 0.95));
    for (let side = 0; side < SHELL_SIDES; side++) {
      const around = (side / SHELL_SIDES) * Math.PI * 2;
      const outward = Math.cos(around);
      const lift = Math.sin(around);
      const knob = look.knobs ? Math.pow(Math.max(0, Math.sin(along * look.turns * look.knobs) * Math.sin(around * 5 + ring * 0.7)), 3) : 0;
      const knobbedRadius = tubeRadius * (1 + 0.2 * knob);
      positions.push(centerX + Math.cos(angle) * outward * knobbedRadius, centerY + lift * knobbedRadius, centerZ + Math.sin(angle) * outward * knobbedRadius);
      const band = 0.5 + 0.5 * Math.sin(along * look.turns * look.bandFrequency + lift * 1.4);
      color.copy(light).lerp(bandColor, look.knobs ? 0.25 * (1 - knob) + 0.45 * Math.max(0, Math.sin(around * 13 + along * 40)) * (1 - knob) : THREE.MathUtils.smoothstep(band, 0.55, 0.8) * 0.85);
      if (knob > 0) color.lerp(KNOB_TIP_COLOR, knob * 0.8);
      const seamShade = 0.62 + 0.38 * THREE.MathUtils.smoothstep(outward, -0.9, 0.2);
      colors.push(color.r * seamShade, color.g * seamShade, color.b * seamShade);
    }
  }
  for (let ring = 0; ring < SHELL_RINGS; ring++) {
    for (let side = 0; side < SHELL_SIDES; side++) {
      const current = ring * SHELL_SIDES + side;
      const next = ring * SHELL_SIDES + ((side + 1) % SHELL_SIDES);
      indices.push(current, current + SHELL_SIDES, next, next, current + SHELL_SIDES, next + SHELL_SIDES);
    }
  }
  const shell = new THREE.BufferGeometry();
  shell.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  shell.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  shell.setIndex(indices);
  shell.computeVertexNormals();
  const mouthOffset = look.whorlRadius + 0.02;
  const mouthLining = tinted(new THREE.CircleGeometry(look.tubeRadius * 0.93, SHELL_SIDES), linearColor(...look.inside)).translate(mouthOffset, 0, 0.05);
  return { geometry: mergeGeometries([shell, mouthLining]), mouthOffset };
}

function buildLeg(material, { reach, drop, thickness }) {
  const hip = new THREE.Group();
  const upper = new THREE.Mesh(tinted(new THREE.CapsuleGeometry(thickness, reach, 3, 8).rotateZ(Math.PI / 2).translate(reach / 2, 0, 0), CARAPACE, 0.2), material);
  const knee = new THREE.Group();
  knee.position.set(reach, 0, 0);
  const lower = new THREE.Mesh(tinted(new THREE.ConeGeometry(thickness * 1.05, drop, 7).rotateX(Math.PI).translate(0, -drop / 2, 0), CARAPACE, 0.45), material);
  knee.add(lower);
  hip.add(upper, knee);
  upper.castShadow = true;
  lower.castShadow = true;
  return { hip, knee };
}

function buildClaw(material, size) {
  const shoulder = new THREE.Group();
  const arm = new THREE.Mesh(tinted(new THREE.CapsuleGeometry(0.1 * size, 0.42 * size, 3, 8).rotateX(Math.PI / 2).translate(0, 0, 0.21 * size), CARAPACE, 0.25), material);
  const wrist = new THREE.Group();
  wrist.position.set(0, 0, 0.46 * size);
  const palmGeometry = tinted(new THREE.SphereGeometry(0.24 * size, 14, 10).scale(0.85, 0.72, 1.25).translate(0, 0, 0.2 * size), CARAPACE, 0.3);
  const fixedFinger = tinted(new THREE.ConeGeometry(0.1 * size, 0.42 * size, 8).rotateX(Math.PI / 2).translate(0, -0.07 * size, 0.6 * size), CLAW_TIP, 0);
  const palm = new THREE.Mesh(mergeGeometries([palmGeometry, fixedFinger]), material);
  const thumb = new THREE.Group();
  thumb.position.set(0, 0.08 * size, 0.36 * size);
  const thumbMesh = new THREE.Mesh(tinted(new THREE.ConeGeometry(0.085 * size, 0.4 * size, 8).rotateX(Math.PI / 2).translate(0, 0, 0.2 * size), CLAW_TIP, 0), material);
  thumb.add(thumbMesh);
  const tineGeometries = [-1, 0, 1].map((offset) => tinted(new THREE.CylinderGeometry(0.022 * size, 0.034 * size, 0.46 * size, 5).rotateX(Math.PI / 2).rotateY(offset * 0.16).translate(offset * 0.1 * size, -0.03 * size, 0.92 * size), CLAW_TIP, 0));
  const tines = new THREE.Mesh(mergeGeometries(tineGeometries), material);
  tines.visible = false;
  wrist.add(palm, thumb, tines);
  shoulder.add(arm, wrist);
  for (const mesh of [arm, palm, thumbMesh]) mesh.castShadow = true;
  return { shoulder, wrist, thumb, tines };
}

export function buildClawPreview(tint, hasTines) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.02 });
  if (tint) material.color.setRGB(tint[0], tint[1], tint[2], THREE.SRGBColorSpace);
  const claw = buildClaw(material, 1.25);
  claw.tines.visible = hasTines;
  claw.thumb.rotation.x = -0.35;
  return claw.shoulder;
}

const GROUND_GLOW_RADIUS = 2.4;

function buildGroundGlow() {
  const uniforms = { uColor: { value: new THREE.Color() }, uRainbow: { value: 0 }, uPhase: { value: 0 } };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec2 vDisc;
      void main() {
        vDisc = position.xz / ${GROUND_GLOW_RADIUS.toFixed(2)};
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uRainbow;
      uniform float uPhase;
      varying vec2 vDisc;
      void main() {
        float distanceShare = length(vDisc);
        float falloff = 1.0 - smoothstep(0.0, 1.0, distanceShare);
        float ring = smoothstep(0.62, 0.72, distanceShare) * (1.0 - smoothstep(0.76, 0.84, distanceShare));
        vec3 color = uColor;
        if (uRainbow > 0.5) {
          float hue = fract(atan(vDisc.y, vDisc.x) / 6.2831853 + uPhase);
          color = clamp(abs(mod(hue * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0) * length(uColor);
        }
        gl_FragColor = vec4(color * (falloff * falloff * 1.2 + ring * 2.2), 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(GROUND_GLOW_RADIUS, 40).rotateX(-Math.PI / 2).translate(0, 0.06, 0), material);
  mesh.renderOrder = 3;
  mesh.visible = false;
  return { mesh, uniforms };
}

const GEAR_GLOW_PARTICLE_LIMIT = 48;
const SPARK_RISE_SECONDS = 1.4;
const SPARK_HEIGHT = 3.4;
const ORB_RADIUS = 2.3;
const ORB_HEIGHT = 1.7;
const ORB_TRAIL = [{ lag: 0, scale: 0.075, intensity: 5 }, { lag: 0, scale: 0.2, intensity: 0.45 }, { lag: 0.16, scale: 0.055, intensity: 2.2 }, { lag: 0.32, scale: 0.04, intensity: 1.1 }];
const EMBER_YOUNG = new THREE.Color(1, 0.75, 0.2);
const EMBER_OLD = new THREE.Color(1, 0.08, 0.01);

function buildGearGlowParticles() {
  const material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), material, GEAR_GLOW_PARTICLE_LIMIT);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(GEAR_GLOW_PARTICLE_LIMIT * 3), 3);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  mesh.count = 0;
  mesh.visible = false;
  const transform = new THREE.Object3D();
  const color = new THREE.Color();

  function update(look, time) {
    const sparkCount = Math.min(look.sparks || 0, GEAR_GLOW_PARTICLE_LIMIT);
    const orbCount = Math.min(look.orbs || 0, Math.floor((GEAR_GLOW_PARTICLE_LIMIT - sparkCount) / ORB_TRAIL.length));
    mesh.visible = sparkCount + orbCount > 0;
    if (!mesh.visible) return;
    let index = 0;
    for (let spark = 0; spark < sparkCount; spark++) {
      const seed = spark * 12.9898;
      const age = ((time / SPARK_RISE_SECONDS) + (Math.sin(seed) * 0.5 + 0.5)) % 1;
      const angle = seed * 2.4 + Math.floor(time / SPARK_RISE_SECONDS + Math.sin(seed)) * 1.7;
      const radius = 0.9 + 0.7 * (Math.sin(seed * 3.1) * 0.5 + 0.5);
      const flicker = 0.75 + 0.25 * Math.sin(time * 23 + seed);
      transform.position.set(Math.cos(angle) * radius + Math.sin(time * 3 + seed) * 0.12 * age, 0.2 + age * SPARK_HEIGHT, Math.sin(angle) * radius);
      transform.rotation.set(0, 0, 0);
      transform.scale.set(0.045, 0.16 * (1 - age * 0.5), 0.045);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
      if (look.rainbow) gearGlowColorAt(look, time, color, spark / sparkCount);
      else color.copy(EMBER_YOUNG).lerp(EMBER_OLD, age);
      mesh.setColorAt(index, color.multiplyScalar(2.4 * flicker * (1 - age * 0.7)));
      index++;
    }
    for (let orb = 0; orb < orbCount; orb++) {
      for (const trail of ORB_TRAIL) {
        const angle = (time - trail.lag) * 1.4 + (orb / orbCount) * Math.PI * 2;
        transform.position.set(Math.cos(angle) * ORB_RADIUS, ORB_HEIGHT + 0.3 * Math.sin((time - trail.lag) * 2.2 + orb), Math.sin(angle) * ORB_RADIUS);
        transform.scale.setScalar(trail.scale);
        transform.updateMatrix();
        mesh.setMatrixAt(index, transform.matrix);
        gearGlowColorAt(look, time, color, orb / orbCount).multiplyScalar(trail.intensity);
        mesh.setColorAt(index, color);
        index++;
      }
    }
    mesh.count = index;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  }

  return { mesh, update };
}

export function createHermit(scene, quality, shellLook, { crabModel = 'player', scale = 1, bodyTint = null } = {}) {
  const useAsset = crabAssetLoaded(crabModel);
  const baseColor = new THREE.Color(1, 1, 1);
  if (bodyTint) baseColor.setRGB(bodyTint[0], bodyTint[1], bodyTint[2], THREE.SRGBColorSpace);
  const abdomenTint = crabModel === 'player' ? ASSET_ABDOMEN_TINT : baseColor;
  const wetnessUniforms = { uBodyWetness: { value: 0 }, uBodyWetTop: { value: -1000 } };
  const wetSurface = { wetDarkening: 0.45, wetRoughness: 0.08, causticStrength: 1.6, chromaticCaustics: quality.chromaticCaustics, bodyWetness: wetnessUniforms };
  const shellGearGlowUniforms = createGearGlowUniforms();
  const clawGearGlowUniforms = createGearGlowUniforms();
  const weaponGearGlowUniforms = createGearGlowUniforms();
  const material = applySeaside(new THREE.MeshStandardMaterial({ vertexColors: !useAsset, roughness: 0.4, metalness: 0.02 }), wetSurface);
  const clawMaterial = applySeaside(new THREE.MeshStandardMaterial({ vertexColors: !useAsset, roughness: 0.4, metalness: 0.02 }), { ...wetSurface, gearGlow: clawGearGlowUniforms });
  const abdomenMaterial = useAsset ? applySeaside(new THREE.MeshStandardMaterial({ color: abdomenTint }), wetSurface) : null;
  const rearMaterial = useAsset ? applySeaside(new THREE.MeshStandardMaterial({ color: abdomenTint }), wetSurface) : null;
  material.color.copy(baseColor);
  clawMaterial.color.copy(baseColor);
  const shellMaterial = applySeaside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, side: THREE.DoubleSide }), { ...wetSurface, wetDarkening: 0.42, wetRoughness: 0.12, gearGlow: shellGearGlowUniforms });
  const NO_GLOW = { glow: 0, color: [1, 1, 1], pulse: false };
  const gearGlow = { shell: NO_GLOW, claws: NO_GLOW };
  const groundGlow = buildGroundGlow();
  const gearGlowParticles = buildGearGlowParticles();

  const root = new THREE.Group();
  const tilt = new THREE.Group();
  const body = new THREE.Group();
  root.add(tilt);
  root.scale.setScalar(scale);
  tilt.add(body);

  const assetRig = useAsset ? buildAssetRig({ bodyMaterial: material, clawMaterial, abdomenMaterial, rearMaterial, crabModel }) : null;
  const proceduralRig = useAsset ? null : buildProceduralRig(body, material, clawMaterial);
  if (assetRig) body.add(assetRig.object);

  const shell = new THREE.Mesh(undefined, shellMaterial);
  shell.castShadow = true;
  const shellPivot = new THREE.Group();
  shell.rotation.set(0, Math.PI, 0);
  const shellModelPivot = new THREE.Group();
  const shellModelMaterial = useAsset ? applySeaside(new THREE.MeshStandardMaterial(), { ...wetSurface, wetDarkening: 0.42, wetRoughness: 0.12, gearGlow: shellGearGlowUniforms }) : null;
  let shellModel = null;
  function setShell(look) {
    const built = buildShellGeometry(look);
    shell.geometry.dispose();
    shell.geometry = built.geometry;
    shell.position.set(built.mouthOffset, 0, 0);
    shellMaterial.roughness = look.soft ? 0.82 : 0.32;
    if (!assetRig) return;
    assetRig.setNaked(Boolean(look.soft));
    if (shellModel) shellModel.removeFromParent();
    shellModel = null;
    if (look.model && shellModelAvailable(look.model)) {
      shellModel = buildShellModel(look.model, dressShellMaterial(look.model, shellModelMaterial));
      shellModelPivot.add(shellModel);
    }
    shell.visible = !look.soft && !shellModel;
  }
  setShell(shellLook);
  shellPivot.add(shell);
  if (assetRig) {
    shellPivot.position.copy(assetRig.abdomenAnchor).add(ASSET_SHELL_OFFSET);
    shellPivot.scale.setScalar(ASSET_SHELL_SCALE);
    shellModelPivot.position.copy(assetRig.abdomenAnchor);
    body.add(shellModelPivot);
  } else {
    shellPivot.position.set(0, 0.64, -0.12);
  }
  shellPivot.rotation.set(SHELL_LEAN_BACK, 0, 0.1);
  body.add(shellPivot);

  root.add(groundGlow.mesh, gearGlowParticles.mesh);
  scene.add(root);

  function setGearGlow(shellLook, clawLook) {
    gearGlow.shell = shellLook || NO_GLOW;
    gearGlow.claws = clawLook || NO_GLOW;
  }

  function setClawGrowth(bigClawScale, smallClawScale) {
    if (assetRig) {
      assetRig.setClawGrowth(bigClawScale, smallClawScale);
      return;
    }
    proceduralRig.bigClaw.shoulder.scale.setScalar(bigClawScale);
    proceduralRig.smallClaw.shoulder.scale.setScalar(smallClawScale);
  }

  const pose = { stride: 0, snip: 0, idleTime: 0, tiltX: 0, tiltZ: 0 };
  const attack = { time: 1, variant: 'big' };
  const hurt = { amount: 0, strength: 1, side: 0 };
  const death = { time: -1 };
  const flashColor = new THREE.Color();

  function playAttack(variant) {
    attack.time = 0;
    attack.variant = variant;
  }

  function playHurt(strength, sideways) {
    hurt.amount = 1;
    hurt.strength = strength;
    hurt.side = sideways;
  }

  function playDeath() {
    death.time = 0;
  }

  function resetPose() {
    death.time = -1;
    hurt.amount = 0;
    attack.time = 1;
  }

  const clawWorld = new THREE.Vector3();
  function clawPosition(which, target = clawWorld) {
    if (assetRig) return assetRig.clawTips[which === 'small' ? 'small' : 'big'].getWorldPosition(target);
    return (which === 'small' ? proceduralRig.smallClaw : proceduralRig.bigClaw).thumb.getWorldPosition(target);
  }

  function gatherPose(type, progress) {
    const reachDown = THREE.MathUtils.smoothstep(progress, 0, 0.35) * (1 - THREE.MathUtils.smoothstep(progress, 0.55, 0.9));
    const lifted = THREE.MathUtils.smoothstep(progress, 0.55, 0.9);
    const pinch = progress > 0.45 && progress < 0.95 ? 0.05 : 0.6;
    if (type === 'driftwood') {
      const tug = Math.sin(progress * Math.PI * 7) * THREE.MathUtils.smoothstep(progress, 0.3, 0.45);
      return { big: { reach: 0.75 * reachDown + 0.35, open: pinch, spread: -0.25 }, small: { reach: 0.7 * reachDown + 0.3, open: pinch, spread: -0.25 }, lunge: 0.1 * reachDown - 0.12 * Math.max(0, tug), pitch: 0.18 * reachDown, lifted };
    }
    if (type === 'seaLettuce') {
      const nibble = Math.sin(progress * Math.PI * 8);
      return { big: { reach: 0.55 + 0.45 * Math.max(0, nibble) - 0.5 * Math.max(0, -nibble), open: 0.35 + 0.3 * Math.max(0, nibble), spread: 0.1 }, small: { reach: 0.55 + 0.45 * Math.max(0, -nibble) - 0.5 * Math.max(0, nibble), open: 0.35 + 0.3 * Math.max(0, -nibble), spread: 0.1 }, lunge: 0.06, pitch: 0.2 + 0.05 * Math.sin(progress * Math.PI * 16), lifted: 0 };
    }
    if (type === 'pearls') {
      return { big: { reach: 0.85 * reachDown - 0.3 * lifted, open: pinch * 0.6, spread: -0.35 }, small: { reach: 0.85 * reachDown - 0.3 * lifted, open: pinch * 0.6, spread: -0.35 }, lunge: 0.1 * reachDown, pitch: 0.22 * reachDown, lifted };
    }
    return { big: { reach: 0.1, open: 0.2, spread: 0 }, small: { reach: 0.95 * reachDown - 0.45 * lifted, open: pinch, spread: -0.3 }, lunge: 0.08 * reachDown, pitch: 0.2 * reachDown, lifted };
  }

  function update(deltaTime, { x, y, z, heading, speed, working, gatherType = null, gatherProgress = 0, groundNormal, withdrawn = false }) {
    root.position.set(x, y, z);
    root.rotation.y = heading;
    pose.idleTime += deltaTime;
    pose.stride += speed * deltaTime * 2.6;
    const moving = Math.min(1, speed / 3);

    const cosHeading = Math.cos(heading);
    const sinHeading = Math.sin(heading);
    const forwardSlope = groundNormal.x * sinHeading + groundNormal.z * cosHeading;
    const sideSlope = groundNormal.x * cosHeading - groundNormal.z * sinHeading;
    const blend = Math.min(1, deltaTime * 8);
    pose.tiltX += (Math.atan2(forwardSlope, groundNormal.y) - pose.tiltX) * blend;
    pose.tiltZ += (-Math.atan2(sideSlope, groundNormal.y) - pose.tiltZ) * blend;
    tilt.rotation.set(pose.tiltX, 0, pose.tiltZ);

    body.position.y = Math.sin(pose.stride * 2) * 0.03 * moving + Math.sin(pose.idleTime * 1.7) * 0.012;
    shellPivot.rotation.z = 0.1 + Math.sin(pose.stride) * 0.06 * moving;
    shellPivot.rotation.x = SHELL_LEAN_BACK + Math.sin(pose.stride * 2 + 0.6) * 0.03 * moving;
    shellModelPivot.rotation.set(Math.sin(pose.stride * 2 + 0.6) * 0.03 * moving, 0, Math.sin(pose.stride) * 0.06 * moving);

    const idleOpen = 0.16 + 0.08 * Math.sin(pose.idleTime * 0.9);
    const claws = { big: { reach: Math.sin(pose.stride + 1) * 0.05 * moving, open: idleOpen, spread: 0 }, small: { reach: -Math.sin(pose.stride + 1) * 0.05 * moving, open: idleOpen * 0.8, spread: 0 } };
    let lunge = 0;
    let pitch = 0;
    const carriesOnShoulder = Boolean(wornWeapon && WEAPON_MODEL_FIT[wornWeapon].shoulderCarry);
    if (working && gatherType) {
      const gather = gatherPose(gatherType, gatherProgress);
      Object.assign(claws, { big: gather.big, small: gather.small });
      lunge = gather.lunge;
      pitch = gather.pitch;
    }
    if (carriesOnShoulder) claws.big = { joints: SHOULDER_CARRY_JOINTS };
    attack.time = Math.min(1, attack.time + deltaTime / ATTACK_SECONDS);
    if (attack.time < 1) {
      const windup = THREE.MathUtils.smoothstep(attack.time, 0, 0.33) * (1 - THREE.MathUtils.smoothstep(attack.time, 0.33, 0.48));
      const strike = THREE.MathUtils.smoothstep(attack.time, 0.33, 0.48) * (1 - THREE.MathUtils.smoothstep(attack.time, 0.55, 1));
      const power = attack.variant === 'both' ? 1.3 : 1;
      for (const which of attack.variant === 'both' ? ['big', 'small'] : [attack.variant]) {
        if (which === 'big' && carriesOnShoulder) {
          const chop = THREE.MathUtils.smoothstep(attack.time, 0.33, 0.48) * (1 - THREE.MathUtils.smoothstep(attack.time, 0.6, 1));
          claws.big = { joints: SHOULDER_CARRY_JOINTS.map((rest, index) => {
            const raised = rest + (SHOULDER_WINDUP_JOINTS[index] - rest) * windup;
            return raised + (SHOULDER_CHOP_JOINTS[index] - raised) * chop;
          }) };
        } else {
          claws[which] = { reach: -0.75 * windup + 0.85 * strike * power, open: 0.9 * windup + 0.05 * strike, spread: -0.35 * strike };
        }
      }
      lunge += (-0.14 * windup + 0.5 * strike) * power;
      pitch += -0.12 * windup + 0.14 * strike * power;
    }

    hurt.amount = Math.max(0, hurt.amount - deltaTime / HURT_SECONDS);
    const deathShare = death.time >= 0 ? Math.min(1, (death.time += deltaTime / DEATH_SECONDS)) : 0;
    const moltWiggle = withdrawn ? 0.82 + 0.12 * Math.sin(pose.idleTime * 7) ** 2 : 0;
    const retract = Math.max(Math.pow(hurt.amount, 0.5) * Math.min(1, 0.7 + 0.3 * hurt.strength), THREE.MathUtils.smoothstep(deathShare, 0, 0.35), moltWiggle);
    const motion = { stride: pose.stride, moving, idleTime: pose.idleTime, claws, retract, withdrawn };
    if (assetRig) assetRig.pose(motion);
    else proceduralRig.pose(motion);
    body.position.z = lunge;
    body.rotation.x = pitch - 0.25 * hurt.amount * hurt.strength;
    const fall = THREE.MathUtils.smoothstep(deathShare, 0.3, 0.8);
    tilt.rotation.z += fall * 1.35 + hurt.side * hurt.amount * 0.25 * hurt.strength;
    const flash = hurt.amount * hurt.amount;
    if (assetRig) flashColor.setRGB(...ASSET_FLASH_COLOR).lerp(ASSET_FLASH_PEAK, THREE.MathUtils.smoothstep(hurt.amount, 0.82, 1)).multiplyScalar(Math.pow(hurt.amount, 3));
    else flashColor.setRGB(0.75 * flash, 0.62 * flash, 0.55 * flash);
    material.emissive.copy(flashColor);
    clawMaterial.emissive.copy(flashColor);
    for (const weaponMaterial of weaponMaterials.values()) weaponMaterial.emissive.copy(flashColor);
    if (abdomenMaterial) abdomenMaterial.emissive.copy(flashColor);
    if (rearMaterial) rearMaterial.emissive.copy(flashColor);
    const shellGearGlowLook = gearGlow.shell;
    updateGearGlowUniforms(shellGearGlowUniforms, shellGearGlowLook, pose.idleTime);
    updateGearGlowUniforms(clawGearGlowUniforms, wornWeapon ? NO_GLOW : gearGlow.claws, pose.idleTime);
    updateGearGlowUniforms(weaponGearGlowUniforms, gearGlow.claws, pose.idleTime);
    const strongestLook = gearGlow.shell.glow >= gearGlow.claws.glow ? gearGlow.shell : gearGlow.claws;
    groundGlow.mesh.visible = Boolean(strongestLook.groundGlow);
    if (strongestLook.groundGlow) {
      gearGlowColorAt(strongestLook, pose.idleTime, groundGlow.uniforms.uColor.value).multiplyScalar(strongestLook.groundGlow * (0.55 + 0.45 * Math.sin(pose.idleTime * 3.2) ** 2));
      groundGlow.uniforms.uRainbow.value = strongestLook.rainbow ? 1 : 0;
      groundGlow.uniforms.uPhase.value = (pose.idleTime * 0.18) % 1;
      groundGlow.mesh.rotation.set(pose.tiltX, 0, pose.tiltZ);
      groundGlow.mesh.scale.setScalar(0.75 + 0.25 * strongestLook.groundGlow);
    }
    gearGlowParticles.update(strongestLook, pose.idleTime);
    shellMaterial.emissive.copy(flashColor).multiplyScalar(assetRig ? 0.6 : 0.3);
    if (shellModelMaterial) shellModelMaterial.emissive.copy(shellMaterial.emissive);
  }

  function setClawTines(visible) {
    if (assetRig) {
      for (const which of ['big', 'small']) assetRig.setClawTines(visible ? buildAssetTines(clawMaterial, which === 'big' ? 1.25 : 0.85) : null, which);
      return;
    }
    for (const claw of [proceduralRig.bigClaw, proceduralRig.smallClaw]) claw.tines.visible = visible;
  }

  const weaponMaterials = new Map();
  let wornWeapon = null;

  function setClawWeapon(kind) {
    if (!assetRig) return;
    wornWeapon = kind && weaponModelAvailable(kind) ? kind : null;
    if (wornWeapon && !weaponMaterials.has(kind)) weaponMaterials.set(kind, dressWeaponMaterial(kind, applySeaside(new THREE.MeshStandardMaterial(), { ...wetSurface, gearGlow: weaponGearGlowUniforms })));
    assetRig.setClawWeapon(wornWeapon, wornWeapon ? weaponMaterials.get(wornWeapon) : null);
  }

  function setClawTint(tint) {
    if (assetRig && wornWeapon) tint = null;
    if (tint) clawMaterial.color.setRGB(tint[0], tint[1], tint[2], THREE.SRGBColorSpace);
    else clawMaterial.color.copy(baseColor);
  }

  return { root, update, wetnessUniforms, setShell, setGearGlow, setClawGrowth, setClawTint, setClawTines, setClawWeapon, playAttack, playHurt, playDeath, resetPose, clawPosition };
}

const ASSET_SHELL_OFFSET = new THREE.Vector3(0, 0, 0);
const ASSET_ABDOMEN_TINT = linearColor(0.95, 0.42, 0.28);
const ASSET_SHELL_SCALE = 1;
const ASSET_FLASH_COLOR = [0.85, 0.12, 0.05];
const ASSET_FLASH_PEAK = new THREE.Color(1.1, 0.95, 0.85);

function buildAssetTines(material, size) {
  const tineGeometries = [-1, 0, 1].map((offset) => tinted(new THREE.CylinderGeometry(0.022 * size, 0.034 * size, 0.46 * size, 5).rotateY(offset * 0.16).translate(offset * 0.1 * size, 0.2 * size, 0), CLAW_TIP, 0));
  const tines = new THREE.Mesh(mergeGeometries(tineGeometries), material);
  tines.castShadow = true;
  return tines;
}

function buildProceduralRig(body, material, clawMaterial) {
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: EYE, roughness: 0.08 });
  const front = new THREE.Group();
  body.add(front);

  const headGeometry = mergeGeometries([
    tinted(new THREE.SphereGeometry(0.4, 18, 12).scale(0.95, 0.66, 1.2).translate(0, 0.5, 0.22), CARAPACE, 0.45),
    tinted(new THREE.SphereGeometry(0.22, 12, 8).scale(1.1, 0.7, 1).translate(0, 0.46, 0.66), CARAPACE_DARK, 0.2),
  ]);
  const head = new THREE.Mesh(headGeometry, material);
  head.castShadow = true;
  front.add(head);

  const eyes = [-1, 1].map((side) => {
    const stalk = new THREE.Group();
    stalk.position.set(side * 0.16, 0.66, 0.6);
    const stem = new THREE.Mesh(tinted(new THREE.CylinderGeometry(0.035, 0.05, 0.36, 7).translate(0, 0.18, 0), CARAPACE, 0), material);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 9).translate(0, 0.4, 0), eyeMaterial);
    stalk.add(stem, ball);
    stalk.rotation.set(0.35, 0, -side * 0.32);
    front.add(stalk);
    return stalk;
  });

  const antennae = [-1, 1].map((side) => {
    const antenna = new THREE.Mesh(tinted(new THREE.ConeGeometry(0.014, 1.15, 5).translate(0, 0.575, 0), CARAPACE_DARK, 0), material);
    antenna.position.set(side * 0.08, 0.56, 0.8);
    antenna.rotation.set(ANTENNA_FORWARD_TILT, 0, -side * 0.55);
    front.add(antenna);
    return antenna;
  });

  const bigClaw = buildClaw(clawMaterial, 1.25);
  bigClaw.shoulder.position.set(-0.34, 0.4, 0.5);
  bigClaw.shoulder.rotation.set(0.25, -0.5, 0);
  bigClaw.wrist.rotation.set(0.25, 0.85, 0);
  const smallClaw = buildClaw(clawMaterial, 0.85);
  smallClaw.shoulder.position.set(0.34, 0.4, 0.5);
  smallClaw.shoulder.rotation.set(0.25, 0.5, 0);
  smallClaw.wrist.rotation.set(0.25, -0.85, 0);
  front.add(bigClaw.shoulder, smallClaw.shoulder);

  const legs = [];
  for (const side of [-1, 1]) {
    for (let pair = 0; pair < 2; pair++) {
      const leg = buildLeg(material, { reach: 0.6 - pair * 0.06, drop: 0.7, thickness: 0.09 });
      const mount = new THREE.Group();
      mount.position.set(side * 0.28, 0.46, 0.26 - pair * 0.34);
      mount.rotation.y = side > 0 ? -0.35 + pair * 0.75 : Math.PI + 0.35 - pair * 0.75;
      mount.add(leg.hip);
      body.add(mount);
      legs.push({ ...leg, side, phase: (pair + (side > 0 ? 0 : 1)) * Math.PI });
    }
  }

  function pose({ stride, moving, idleTime, claws, retract, withdrawn }) {
    for (const leg of legs) {
      const cycle = stride + leg.phase;
      leg.hip.rotation.y = Math.sin(cycle) * 0.45 * moving * leg.side;
      leg.hip.rotation.z = LEG_RISE + Math.max(0, Math.cos(cycle)) * 0.3 * moving;
      leg.knee.rotation.z = LEG_SPLAY - leg.hip.rotation.z;
    }
    for (const [which, claw] of [['big', bigClaw], ['small', smallClaw]]) {
      const side = which === 'big' ? -1 : 1;
      claw.thumb.rotation.x = -claws[which].open * (which === 'big' ? 1 : 0.8);
      claw.shoulder.rotation.x = 0.25 + claws[which].reach;
      claw.shoulder.rotation.y = side * (0.5 + claws[which].spread);
    }
    for (const claw of [bigClaw, smallClaw]) {
      claw.shoulder.rotation.x = THREE.MathUtils.lerp(claw.shoulder.rotation.x, -0.55, retract);
      claw.thumb.rotation.x *= 1 - retract;
    }
    front.position.set(0, 0.12 * retract, -0.5 * retract);
    front.scale.setScalar(1 - 0.32 * retract);
    for (const leg of legs) {
      leg.knee.rotation.z += retract * 0.9;
      leg.hip.visible = !withdrawn;
    }
    eyes[0].rotation.x = 0.35 + Math.sin(idleTime * 0.8) * 0.06;
    eyes[1].rotation.x = 0.35 + Math.sin(idleTime * 0.8 + 1.4) * 0.06;
    antennae[0].rotation.x = ANTENNA_FORWARD_TILT + Math.sin(idleTime * 2.3) * 0.09;
    antennae[1].rotation.x = ANTENNA_FORWARD_TILT + Math.sin(idleTime * 2.3 + 0.9) * 0.09;
    for (const eye of eyes) eye.rotation.x += retract * 0.9;
  }

  return { bigClaw, smallClaw, pose };
}
