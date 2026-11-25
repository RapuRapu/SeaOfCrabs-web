import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import shoreCrabBytes from './assets/shoreCrab.glb';
import sandHopperBytes from './assets/sandHopper.glb';
import gullBytes from './assets/gull.glb';
import cockroachBytes from './assets/cockroach.glb';
import ratBytes from './assets/rat.glb';
import shipCatBytes from './assets/shipCat.glb';
import morayBytes from './assets/moray.glb';
import octopusBytes from './assets/octopus.glb';
import mantisShrimpBytes from './assets/mantisShrimp.glb';
import giantLobsterBytes from './assets/giantLobster.glb';
import { Joint, limbChain, parseModel } from './rig.js';
import { applySeaside } from './seaside.js';
import { cookAssetAvailable, createCook, loadCookAsset } from './cookAsset.js';

const CREATURE_BYTES = { shoreCrab: shoreCrabBytes, sandHopper: sandHopperBytes, gull: gullBytes, cockroach: cockroachBytes, rat: ratBytes, shipCat: shipCatBytes, moray: morayBytes, octopus: octopusBytes, mantisShrimp: mantisShrimpBytes, giantLobster: giantLobsterBytes };
const GROUND_TAIL_KINDS = new Set(['rat']);
const GROUND_TIP_SHARE = 0.15;
const FLASH_COLOR = new THREE.Color(0.8, 0.78, 0.74);
const FLASH_PEAK_FROM = 0.6;
const WING_FOLD = { lower: 1.25, sweep: 1.5, elbow: 0.5, hand: 0.4 };
const loadedCreatures = new Map();
const CULL_SPHERE_MARGIN = 1.4;
const MORAY_HEAD_LOWER = -0.35;
const MANTIS_CROUCH = 0.8;
const TINTED_KINDS = { moray: [2, 2, 2], octopus: [0.6, 0.62, 0.9] };
const OCTOPUS_ARM_CURL = 0.8;
const OCTOPUS_HOLD_CURL = [0.15, 0.45, 0.6];
const OCTOPUS_SHELL_BONE = 1;
const FINGER_GRIP_REST = { giantLobster: -0.3, shoreCrab: -0.2 };
const HOLDING_ARM_RAISE = -0.15;
const HOLDING_ARM_SPREAD = 0.9;

export async function loadCreatureAssets() {
  const [entries] = await Promise.all([Promise.all(Object.entries(CREATURE_BYTES).map(async ([kind, bytes]) => [kind, (await parseModel(bytes)).scene])), loadCookAsset()]);
  for (const [kind, scene] of entries) loadedCreatures.set(kind, scene);
}

export const creatureAssetAvailable = (kind) => (kind === 'cook' ? cookAssetAvailable() : loadedCreatures.has(kind));

function classifyLimbs(model, bones, kind) {
  const limbNames = Object.keys(bones).filter((name) => name.startsWith('limb_') && name.endsWith('_1')).map((name) => name.slice(0, -2));
  const bounds = new THREE.Box3().setFromObject(model);
  const height = bounds.max.y - bounds.min.y;
  const limbs = { legs: [], appendages: [] };
  for (const name of limbNames) {
    const chain = limbChain(bones, name);
    const tip = bones[`${name}_tip`].getWorldPosition(new THREE.Vector3());
    const attachedToLimb = bones[`${name}_1`].parent && bones[`${name}_1`].parent.name.startsWith('limb_');
    Object.assign(chain, { name, tip, attachedToLimb, phase: 0 });
    (tip.y - bounds.min.y < height * GROUND_TIP_SHARE && !attachedToLimb ? limbs.legs : limbs.appendages).push(chain);
  }
  if (GROUND_TAIL_KINDS.has(kind) && limbs.legs.length) {
    const tail = limbs.legs.reduce((back, leg) => (leg.tip.z < back.tip.z ? leg : back));
    limbs.legs.splice(limbs.legs.indexOf(tail), 1);
    limbs.appendages.push(tail);
  }
  limbs.legs.sort((a, b) => b.tip.z - a.tip.z);
  for (const side of [-1, 1]) {
    limbs.legs.filter((leg) => leg.side === side).forEach((leg, order) => {
      leg.phase = (order + (side > 0 ? 0 : 1)) * Math.PI;
    });
  }
  return { ...limbs, height };
}

const SMOOTH_SHADED_KINDS = new Set(['giantLobster']);
const NORMAL_MAP_STRENGTH = { giantLobster: 0 };
const NORMAL_WELD_PRECISION = 1e4;

const PHONG_SHAPE = 0.75;
const tessellatedBySource = new WeakMap();

function phongTessellate(source) {
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  smoothSharedNormals(geometry);
  const names = Object.keys(geometry.attributes);
  const input = Object.fromEntries(names.map((name) => [name, geometry.attributes[name]]));
  const triangleCount = input.position.count / 3;
  const output = Object.fromEntries(names.map((name) => [name, new (name === 'skinIndex' ? Uint16Array : Float32Array)(triangleCount * 12 * input[name].itemSize)]));
  const corner = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const cornerNormal = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const flat = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const project = (point, onto, normal) => projected.copy(point).sub(onto).projectOnVector(normal).negate().add(point);
  let first = 0;
  const weightsAt = (barycentric) => {
    const blended = new Map();
    barycentric.forEach((share, cornerIndex) => {
      if (!share) return;
      for (let slot = 0; slot < 4; slot++) {
        const joint = input.skinIndex.getComponent(first + cornerIndex, slot);
        const weight = input.skinWeight.getComponent(first + cornerIndex, slot) * share;
        if (weight) blended.set(joint, (blended.get(joint) || 0) + weight);
      }
    });
    const strongest = [...blended].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const total = strongest.reduce((sum, [, weight]) => sum + weight, 0) || 1;
    return { joints: [0, 1, 2, 3].map((slot) => (strongest[slot] ? strongest[slot][0] : 0)), weights: [0, 1, 2, 3].map((slot) => (strongest[slot] ? strongest[slot][1] / total : 0)) };
  };
  const SUB_TRIANGLES = [[[1, 0, 0], [0.5, 0.5, 0], [0.5, 0, 0.5]], [[0.5, 0.5, 0], [0, 1, 0], [0, 0.5, 0.5]], [[0.5, 0, 0.5], [0, 0.5, 0.5], [0, 0, 1]], [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5]]];
  let written = 0;
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    first = triangle * 3;
    for (let cornerIndex = 0; cornerIndex < 3; cornerIndex++) {
      corner[cornerIndex].fromBufferAttribute(input.position, first + cornerIndex);
      cornerNormal[cornerIndex].fromBufferAttribute(input.normal, first + cornerIndex).normalize();
    }
    for (const subTriangle of SUB_TRIANGLES) {
      for (const barycentric of subTriangle) {
        flat.set(0, 0, 0);
        const curved = new THREE.Vector3();
        barycentric.forEach((share, cornerIndex) => {
          flat.addScaledVector(corner[cornerIndex], share);
        });
        barycentric.forEach((share, cornerIndex) => {
          curved.addScaledVector(project(flat, corner[cornerIndex], cornerNormal[cornerIndex]), share);
        });
        flat.lerp(curved, PHONG_SHAPE);
        const shifted = barycentric.map((share, cornerIndex) => ({ share, index: first + cornerIndex }));
        const skin = input.skinIndex ? weightsAt(barycentric) : null;
        for (const name of names) {
          const attribute = input[name];
          const size = attribute.itemSize;
          const target = output[name];
          if (name === 'position') {
            target.set([flat.x, flat.y, flat.z], written * 3);
          } else if (name === 'skinIndex') {
            target.set(skin.joints, written * 4);
          } else if (name === 'skinWeight') {
            target.set(skin.weights, written * 4);
          } else {
            for (let component = 0; component < size; component++) {
              let value = 0;
              for (const { share, index } of shifted) value += attribute.getComponent(index, component) * share;
              target[written * size + component] = value;
            }
          }
        }
        written++;
      }
    }
  }
  const tessellated = new THREE.BufferGeometry();
  for (const name of names) tessellated.setAttribute(name, new THREE.BufferAttribute(output[name], input[name].itemSize, false));
  tessellated.userData.tessellated = true;
  tessellated.boundingBox = null;
  tessellated.boundingSphere = null;
  return tessellated;
}

function smoothSharedNormals(geometry) {
  if (geometry.userData.smoothedNormals) return;
  geometry.userData.smoothedNormals = true;
  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal;
  const sums = new Map();
  const keyOf = (index) => `${Math.round(positions.getX(index) * NORMAL_WELD_PRECISION)},${Math.round(positions.getY(index) * NORMAL_WELD_PRECISION)},${Math.round(positions.getZ(index) * NORMAL_WELD_PRECISION)}`;
  for (let index = 0; index < positions.count; index++) {
    const key = keyOf(index);
    const sum = sums.get(key) || [0, 0, 0];
    sum[0] += normals.getX(index);
    sum[1] += normals.getY(index);
    sum[2] += normals.getZ(index);
    sums.set(key, sum);
  }
  const smoothed = new Float32Array(positions.count * 3);
  const normal = new THREE.Vector3();
  for (let index = 0; index < positions.count; index++) {
    normal.fromArray(sums.get(keyOf(index))).normalize();
    smoothed.set([normal.x, normal.y, normal.z], index * 3);
  }
  geometry.setAttribute('normal', new THREE.BufferAttribute(smoothed, 3));
}

export function createCreature(kind, quality) {
  if (kind === 'cook') return createCook(quality);
  const model = cloneSkinned(loadedCreatures.get(kind));
  model.updateMatrixWorld(true);
  const bones = {};
  const skinnedMeshes = [];
  let material = null;
  model.traverse((node) => {
    if (node.isBone) bones[node.name] = node;
    if (node.isSkinnedMesh) {
      const source = node.material;
      material = applySeaside(new THREE.MeshStandardMaterial(), { chromaticCaustics: quality.chromaticCaustics, wetDarkening: 0.6, wetRoughness: 0.1, cutaway: kind === 'gull' ? 'soft' : false });
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'roughness', 'metalness']) material[key] = source[key];
      material.normalScale.copy(source.normalScale).multiplyScalar(NORMAL_MAP_STRENGTH[kind] ?? 1);
      material.side = THREE.DoubleSide;
      if (TINTED_KINDS[kind]) material.color.setRGB(...TINTED_KINDS[kind]);
      node.material = material;
      if (SMOOTH_SHADED_KINDS.has(kind)) {
        if (!tessellatedBySource.has(node.geometry)) tessellatedBySource.set(node.geometry, phongTessellate(node.geometry));
        node.geometry = tessellatedBySource.get(node.geometry);
        smoothSharedNormals(node.geometry);
      }
      node.castShadow = true;
      node.receiveShadow = true;
      skinnedMeshes.push(node);
    }
  });
  model.updateMatrixWorld(true);
  for (const mesh of skinnedMeshes) {
    mesh.computeBoundingSphere();
    mesh.boundingSphere.radius *= CULL_SPHERE_MARGIN;
    mesh.frustumCulled = true;
  }
  const limbs = classifyLimbs(model, bones, kind);
  const bounds = new THREE.Box3().setFromObject(model);
  const length = bounds.max.z - bounds.min.z;
  const spine = Object.keys(bones).filter((name) => name.startsWith('spine_')).sort((a, b) => Number(a.slice(6)) - Number(b.slice(6))).map((name) => {
    const bone = bones[name];
    const from = bone.getWorldPosition(new THREE.Vector3());
    const child = bone.children.find((node) => node.isBone);
    const to = child ? child.getWorldPosition(new THREE.Vector3()) : from.clone().add(new THREE.Vector3(0, 0, 0.1));
    const side = new THREE.Vector3().subVectors(to, from).setY(0).normalize().cross(new THREE.Vector3(0, 1, 0));
    return new Joint(bone, side.lengthSq() > 0.01 ? side : new THREE.Vector3(1, 0, 0));
  });
  const head = bones.head ? new Joint(bones.head, new THREE.Vector3(1, 0, 0)) : null;
  const tail = bones.tail ? new Joint(bones.tail, new THREE.Vector3(1, 0, 0)) : null;
  const arms = limbs.appendages.filter((limb) => !limb.attachedToLimb && limb.tip.z > 0);
  const fingers = limbs.appendages.filter((limb) => limb.attachedToLimb);
  const rearAppendages = limbs.appendages.filter((limb) => !limb.attachedToLimb && limb.tip.z <= 0);
  const wings = limbs.appendages.filter((limb) => Math.abs(limb.tip.x) > limbs.height * 0.5);

  function setFlash(hurt) {
    const peak = Math.max(0, (hurt - FLASH_PEAK_FROM) / (1 - FLASH_PEAK_FROM));
    material.emissive.copy(FLASH_COLOR).multiplyScalar(peak * peak);
  }

  function walk(stride, motion, lift, swing, fold = 0) {
    for (const leg of limbs.legs) {
      const cycle = stride + leg.phase;
      const raise = Math.max(0, Math.cos(cycle)) * lift * motion;
      leg.joints[0].pose(raise + fold * 0.5, Math.sin(cycle) * swing * motion * leg.side);
      leg.joints[1].pose(-raise * 0.7 - fold);
      leg.joints[2].pose(-fold * 0.5);
    }
  }

  function walkOnFourLegs(stride, motion, swing, lift, fold = 0) {
    for (const leg of limbs.legs) {
      const cycle = stride + leg.phase;
      leg.joints[0].pose(0, 0, -Math.sin(cycle) * swing * motion + fold * 0.3);
      leg.joints[1].pose(0, 0, Math.max(0, Math.cos(cycle)) * lift * motion + fold);
      leg.joints[2].pose(0, 0, -Math.max(0, Math.cos(cycle)) * lift * 0.5 * motion);
    }
  }

  const fingerPose = (finger, openAmount, gripSides) => finger.joints[0].pose(gripSides && gripSides.includes(finger.side) ? FINGER_GRIP_REST[kind] ?? 0 : openAmount);

  function poseShoreCrab({ stride, motion, raised, snaps, recoil, fall, gripSides }) {
    walk(stride, motion, 0.6, 0.35, fall * 0.9 + recoil * 0.4);
    for (const arm of arms) {
      const snap = arm.side < 0 ? snaps[0] : snaps[1];
      const holding = gripSides && gripSides.includes(arm.side);
      arm.joints[0].pose(raised * 0.9 - snap * 0.6 + recoil * 0.6 + (holding ? HOLDING_ARM_RAISE : 0), -arm.side * snap * 0.4 + (holding ? arm.side * HOLDING_ARM_SPREAD : 0));
      arm.joints[1].pose(raised * 0.5 + snap * 0.5);
      arm.joints[2].pose(0);
    }
    for (const finger of fingers) fingerPose(finger, (0.45 * raised - snapsFor(finger, snaps) * 0.45) * 0.8, gripSides);
  }

  const snapsFor = (limb, snaps) => (limb.side < 0 ? snaps[0] : snaps[1]);

  function poseHopper({ stride, motion, hop, startle, fall, time }) {
    walk(stride * 1.4, Math.max(motion, startle), 0.5, 0.45, fall * 0.8 + hop * 0.6);
    for (const limb of arms) limb.joints[0].pose(0.2 * Math.sin(time * 5 + limb.side), 0.15 * Math.sin(time * 3.1 + limb.side));
    for (const limb of rearAppendages) limb.joints[0].pose(hop * 0.5);
    if (tail) tail.pose(0, 0, -hop * 0.5 + startle * 0.3);
  }

  function poseGull({ flying, flap, strike, windup, time }) {
    for (const wing of wings) {
      const folded = 1 - flying;
      wing.joints[0].pose(flying * flap - folded * WING_FOLD.lower, wing.side * folded * WING_FOLD.sweep);
      wing.joints[1].pose(flying * flap * 0.4, wing.side * folded * WING_FOLD.elbow);
      wing.joints[2].pose(0, wing.side * folded * WING_FOLD.hand);
    }
    for (const leg of limbs.legs) {
      leg.joints[0].pose(0, 0, -flying * 0.9);
      leg.joints[1].pose(0);
      leg.joints[2].pose(0);
    }
    if (head) head.pose(0, 0, strike * 0.7 - windup * 0.3 + 0.05 * Math.sin(time * 1.7));
  }

  function swayTail(time, amount, lift = 0) {
    for (const limb of rearAppendages) limb.joints.forEach((joint, index) => joint.pose(lift * (index === 0 ? 1 : 0.3), Math.sin(time * 3 - index * 0.8) * amount * limb.side));
  }

  function poseCockroach({ stride, motion, lunge, fall, time }) {
    walk(stride, motion, 0.18, 0.4, fall * 0.9);
    for (const limb of [...arms, ...rearAppendages]) limb.joints[0].pose(0.15 * Math.sin(time * 7 + limb.side) + lunge * 0.3, 0.12 * Math.sin(time * 5 + limb.side));
  }

  function poseRat({ stride, motion, lunge, fall, time }) {
    walkOnFourLegs(stride, motion, 0.55, 0.7, fall * 0.8);
    swayTail(time, 0.35 + motion * 0.2);
    if (head) head.pose(0, 0.08 * Math.sin(time * 4), -lunge * 0.4 + 0.08 * Math.sin(time * 6));
  }

  function poseCat({ stride, motion, crouch, leap, lunge, windup = 0, fall, time }) {
    walkOnFourLegs(stride, motion, 0.5, 0.6, fall * 0.8 + crouch * 0.9 + leap * 0.5);
    const swipePaw = limbs.legs[0];
    if (swipePaw && (windup > 0 || lunge > 0)) {
      swipePaw.joints[0].pose(0, 0, -(windup * 1.4 + lunge * 0.8));
      swipePaw.joints[1].pose(0, 0, windup * 1.1 - lunge * 0.4);
      swipePaw.joints[2].pose(0, 0, -windup * 0.4);
    }
    swayTail(time * 0.6, 0.25, 0.3 + crouch * 0.4);
    if (head) head.pose(0, 0.1 * Math.sin(time * 0.7), -lunge * 0.35 + crouch * 0.4);
  }

  const octopusArms = limbs.legs.concat(limbs.appendages);
  const frontRightScore = (limb) => limb.tip.z + Math.max(0, limb.tip.x) * 0.5;
  const shellHoldingArm = kind === 'octopus' ? octopusArms.reduce((best, limb) => (frontRightScore(limb) > frontRightScore(best) ? limb : best), octopusArms[0]) : null;

  function poseOctopus({ time, motion, lunge, swell, fall, holdingShell = false }) {
    octopusArms.forEach((limb, index) => {
      if (holdingShell && limb === shellHoldingArm) {
        limb.joints[0].pose(OCTOPUS_HOLD_CURL[0] + 0.04 * Math.sin(time * 2), 0);
        limb.joints[1].pose(OCTOPUS_HOLD_CURL[1], 0);
        limb.joints[2].pose(OCTOPUS_HOLD_CURL[2], 0);
        return;
      }
      const phase = time * 2.2 + index * 1.3;
      const forward = limb.tip.z > 0 ? lunge : 0;
      const sway = (1 + motion) * OCTOPUS_ARM_CURL;
      limb.joints[0].pose(0.05 * Math.sin(phase) + forward * 0.25 - fall * 0.2 + swell * 0.15, 0.15 * Math.sin(phase * 0.6) * sway);
      limb.joints[1].pose(0.06 * Math.sin(phase + 0.8) - forward * 0.15, (0.35 + 0.35 * Math.sin(phase + 0.8)) * sway * limb.side);
      limb.joints[2].pose(0.05 * Math.sin(phase + 1.6), (0.55 + 0.45 * Math.sin(phase + 1.6)) * sway * limb.side);
    });
  }

  function poseMantis({ stride, motion, strike, fall, time }) {
    walk(stride, motion, 0.45, 0.4, MANTIS_CROUCH + fall * 0.9);
    for (const arm of arms) {
      arm.joints[0].pose(0.5 - strike * 1.4 + 0.05 * Math.sin(time * 3), 0);
      arm.joints[1].pose(-0.8 + strike * 2.4);
      arm.joints[2].pose(-0.6 + strike * 1.4);
    }
    for (const limb of rearAppendages) limb.joints[0].pose(0.1 * Math.sin(time * 4 + limb.side));
    if (tail) tail.pose(0, 0, 0.08 * Math.sin(time * 2) - strike * 0.2);
  }

  function poseLobster({ stride, motion, raised, lunge, fall, time, gripSides }) {
    walk(stride, motion, 0.45, 0.35, fall * 0.8);
    for (const arm of arms) {
      const isAntenna = arm.tip.y > limbs.height * 0.6;
      if (isAntenna) {
        arm.joints[0].pose(0.08 * Math.sin(time * 1.3 + arm.side), 0.1 * Math.sin(time * 0.9 + arm.side));
        continue;
      }
      arm.joints[0].pose(raised * 0.7 - lunge * 0.6, -arm.side * lunge * 0.2);
      arm.joints[1].pose(raised * 0.4 + lunge * 0.5);
      arm.joints[2].pose(lunge * 0.3);
    }
    for (const finger of fingers) fingerPose(finger, (0.3 * raised - lunge * 0.4) * 0.8, gripSides);
    if (tail) tail.pose(0, 0, 0.06 * Math.sin(time * 1.5) + fall * 0.4);
  }

  function poseMoray({ time, emerge, lunge, fall }) {
    const count = spine.length;
    spine.forEach((joint, index) => {
      const share = index / Math.max(1, count - 1);
      const toHead = THREE.MathUtils.smoothstep(share, 0.55, 1);
      const wave = Math.sin(time * 2.6 - index * 0.9) * 0.18 * (0.4 + share);
      joint.pose(toHead * (MORAY_HEAD_LOWER + emerge * 0.15 - lunge * 0.25 - fall * 0.3), wave * (1 - lunge * 0.7));
    });
  }

  const posers = { shoreCrab: poseShoreCrab, sandHopper: poseHopper, gull: poseGull, cockroach: poseCockroach, rat: poseRat, shipCat: poseCat, octopus: poseOctopus, mantisShrimp: poseMantis, giantLobster: poseLobster, moray: poseMoray };
  const fingeredLimbs = new Set(fingers.map((finger) => bones[`${finger.name}_1`].parent.name.replace(/_(\d+|tip)$/, '')));
  const fingeredArms = arms.filter((arm) => fingeredLimbs.has(arm.name));
  const reachOf = (arm) => arm.tip.distanceTo(bones[`${arm.name}_1`].getWorldPosition(new THREE.Vector3()));
  const longestOnSide = (side) => arms.filter((arm) => arm.side === side && arm.tip.y <= limbs.height * 0.6).sort((a, b) => reachOf(b) - reachOf(a))[0];
  const singleClaw = fingeredArms.length === 1 ? fingeredArms[0] : null;
  const grippingArms = fingeredArms.length >= 2 ? fingeredArms.sort((a, b) => a.side - b.side) : singleClaw ? [singleClaw, longestOnSide(-singleClaw.side)].filter(Boolean) : [longestOnSide(-1), longestOnSide(1)].filter(Boolean);
  const handOf = (arm) => {
    const bone = bones[`${arm.name}_3`];
    const clawFingers = [];
    const ownsFinger = (finger) => [arm, ...clawFingers].some((owner) => bones[`${finger.name}_1`].parent.name.startsWith(`${owner.name}_`));
    for (let added = true; added; ) {
      const next = fingers.find((finger) => !clawFingers.includes(finger) && ownsFinger(finger));
      added = Boolean(next);
      if (next) clawFingers.push(next);
    }
    const fingerJaws = clawFingers.map((finger) => ({ base: bones[`${finger.name}_1`], tip: bones[`${finger.name}_tip`] }));
    const jaws = fingerJaws.length >= 2 ? fingerJaws : [{ base: bone, tip: bones[`${arm.name}_tip`] }, ...fingerJaws];
    return { bone, jaws, side: arm.side, length: bones[`${arm.name}_tip`].position.length() };
  };
  const hands = grippingArms.length >= 2 ? { big: handOf(grippingArms[0]), small: handOf(grippingArms[grippingArms.length - 1]) } : null;

  const shellAnchor = shellHoldingArm ? bones[`${shellHoldingArm.name}_${OCTOPUS_SHELL_BONE}`] : null;
  let gripSides = [];
  const pose = (poseArguments) => posers[kind]({ ...poseArguments, gripSides });
  return { object: model, setFlash, pose, setGripSides: (sides) => { gripSides = sides; }, height: limbs.height, length, hands, shellAnchor };
}
