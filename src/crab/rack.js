import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { applySeaside } from './seaside.js';
import { element } from './workbench.js';
import { pickTarget } from './picking.js';

export const RACK_SLOTS = 3;
export const RACK_BATCH = 3;
export const RACK_INPUTS = ['seaLettuce', 'kelp'];
export const rackInputIn = (inventory) => RACK_INPUTS.find((type) => (inventory[type] || 0) >= RACK_BATCH) || null;
export const RACK_DRY_SECONDS = 60;
export const RACK_REACH = 2.6;
export const RACK_BLOCK_RADIUS = 1.3;
const RACK_DISTANCE_FROM_ENTRANCE = 6.5;

const linearColor = (red, green, blue) => new THREE.Color().setRGB(red, green, blue, THREE.SRGBColorSpace);
const POLE = linearColor(0.74, 0.6, 0.42);
const POLE_DARK = linearColor(0.6, 0.47, 0.32);
const KELP_WET = linearColor(0.22, 0.66, 0.2);
const KELP_DRY = linearColor(0.42, 0.25, 0.09);
const RACK_SCALE = 1.6;

function painted(geometry, color) {
  const colors = new Float32Array(geometry.attributes.position.count * 3);
  for (let index = 0; index < geometry.attributes.position.count; index++) colors.set([color.r, color.g, color.b], index * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  if (geometry.attributes.uv) geometry.deleteAttribute('uv');
  return geometry;
}

function buildFrameGeometry() {
  const parts = [];
  for (const side of [-1, 1]) {
    parts.push(painted(new THREE.CylinderGeometry(0.1, 0.13, 2.05, 8).rotateX(0.36).translate(side * 1.45, 0.92, 0.32), POLE));
    parts.push(painted(new THREE.CylinderGeometry(0.1, 0.13, 2.05, 8).rotateX(-0.36).translate(side * 1.45, 0.92, -0.32), POLE_DARK));
  }
  parts.push(painted(new THREE.CylinderGeometry(0.09, 0.09, 3.4, 8).rotateZ(Math.PI / 2).translate(0, 1.78, 0), POLE));
  return mergeGeometries(parts);
}

function buildStrandGeometry() {
  const strand = new THREE.PlaneGeometry(0.42, 1.0, 1, 6).translate(0, -0.5, 0);
  const positions = strand.attributes.position;
  for (let index = 0; index < positions.count; index++) {
    const y = positions.getY(index);
    positions.setX(index, positions.getX(index) * (1 - 0.45 * -y) + 0.06 * Math.sin(y * 7));
    positions.setZ(index, 0.08 * Math.sin(y * 5));
  }
  strand.computeVertexNormals();
  return painted(strand, new THREE.Color(1, 1, 1));
}

export function createRack(scene, world, quality, labelParent, saved) {
  const state = saved ? structuredClone(saved) : null;
  const group = new THREE.Group();
  const frameMaterial = applySeaside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), { chromaticCaustics: quality.chromaticCaustics });
  const frame = new THREE.Mesh(buildFrameGeometry(), frameMaterial);
  frame.castShadow = true;
  group.add(frame);
  const strandMaterial = applySeaside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide }), { chromaticCaustics: quality.chromaticCaustics });
  const strandsPerSlot = 3;
  const strands = new THREE.InstancedMesh(buildStrandGeometry(), strandMaterial, RACK_SLOTS * strandsPerSlot + RACK_SLOTS);
  strands.castShadow = true;
  strands.frustumCulled = false;
  group.add(strands);
  const sparkleCanvas = document.createElement('canvas');
  sparkleCanvas.width = sparkleCanvas.height = 64;
  const sparkleContext = sparkleCanvas.getContext('2d');
  sparkleContext.fillStyle = '#fff3c4';
  sparkleContext.font = 'bold 56px sans-serif';
  sparkleContext.textAlign = 'center';
  sparkleContext.textBaseline = 'middle';
  sparkleContext.fillText('✦', 32, 34);
  const readyMarkMaterial = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(sparkleCanvas), color: new THREE.Color(4, 3, 1.4), transparent: true, depthWrite: false, depthTest: false });
  const readyMark = new THREE.Sprite(readyMarkMaterial);
  readyMark.scale.setScalar(0.7);
  readyMark.position.set(0, 2.35, 0);
  readyMark.visible = false;
  group.add(readyMark);
  group.scale.setScalar(RACK_SCALE);
  group.visible = false;
  scene.add(group);
  const label = element('div', 'world-label surface-label hidden', labelParent, 'Drying rack');
  const transform = new THREE.Object3D();
  const color = new THREE.Color();
  const projected = new THREE.Vector3();

  function place() {
    const current = stateRef.current;
    group.position.set(current.x, world.heightAt(current.x, current.z), current.z);
    group.rotation.y = current.heading || 0;
    group.visible = true;
  }

  function build(entrance) {
    for (let attempt = 0; attempt < 16; attempt++) {
      const angle = -0.6 + attempt * 0.7;
      const x = entrance.x + Math.cos(angle) * RACK_DISTANCE_FROM_ENTRANCE;
      const z = entrance.z + Math.sin(angle) * RACK_DISTANCE_FROM_ENTRANCE;
      let clear = world.isWalkable(x, z);
      for (let around = 0; around < 8 && clear; around++) clear = world.isWalkable(x + Math.cos(around) * 1.8, z + Math.sin(around) * 1.8);
      if (!clear) continue;
      stateRef.current = { x, z, heading: angle + Math.PI / 2, slots: Array(RACK_SLOTS).fill(null), ready: 0 };
      place();
      return stateRef.current;
    }
    return null;
  }

  const stateRef = { current: state };

  function moveTo(x, z) {
    const current = stateRef.current;
    if (!current) return false;
    current.x = x;
    current.z = z;
    place();
    return true;
  }

  function remove() {
    const removed = stateRef.current;
    stateRef.current = null;
    group.visible = false;
    label.classList.add('hidden');
    return removed;
  }

  function freeSlots() {
    return stateRef.current ? stateRef.current.slots.filter((slot) => slot === null).length : 0;
  }

  function load() {
    const current = stateRef.current;
    const index = current ? current.slots.indexOf(null) : -1;
    if (index < 0) return false;
    current.slots[index] = 0;
    return true;
  }

  function collect(amount = Infinity) {
    const current = stateRef.current;
    if (!current) return 0;
    const taken = Math.min(amount, current.ready);
    current.ready -= taken;
    return taken;
  }

  function update(deltaTime) {
    const current = stateRef.current;
    if (!current) return;
    for (let index = 0; index < current.slots.length; index++) {
      if (current.slots[index] === null) continue;
      current.slots[index] += deltaTime / RACK_DRY_SECONDS;
      if (current.slots[index] >= 1) {
        current.slots[index] = null;
        current.ready++;
      }
    }
  }

  function render(time, camera, visible) {
    const current = stateRef.current;
    if (!current) {
      label.classList.add('hidden');
      return;
    }
    let count = 0;
    const strandSpots = [];
    current.slots.forEach((progress, slotIndex) => {
      if (progress !== null) strandSpots.push({ slotIndex, dryness: progress });
    });
    for (let readyIndex = 0; readyIndex < Math.min(current.ready, RACK_SLOTS); readyIndex++) strandSpots.push({ slotIndex: readyIndex, dryness: 1, ready: true });
    for (const { slotIndex, dryness, ready } of strandSpots) {
      for (let strand = 0; strand < (ready ? 1 : strandsPerSlot); strand++) {
        const offset = (slotIndex - 1) * 0.95 + (strand - 1) * 0.26 + (ready ? 0.45 : 0);
        transform.position.set(offset, 1.74, ready ? 0.14 : 0);
        transform.rotation.set(0.08 * Math.sin(time * 1.3 + offset * 3), 0, 0.06 * Math.sin(time * 1.7 + offset));
        transform.scale.set(1 - (ready ? 0.3 : 0), 1 - 0.3 * dryness, 1);
        transform.updateMatrix();
        strands.setMatrixAt(count, transform.matrix);
        strands.setColorAt(count++, color.copy(KELP_WET).lerp(KELP_DRY, dryness));
      }
    }
    strands.count = count;
    readyMark.visible = current.ready > 0;
    readyMarkMaterial.opacity = 0.55 + 0.4 * Math.sin(time * 3.2);
    readyMark.scale.setScalar(0.95 + 0.18 * Math.sin(time * 4));
    strands.instanceMatrix.needsUpdate = true;
    if (strands.instanceColor) strands.instanceColor.needsUpdate = true;
    projected.set(current.x, group.position.y + 3.3 * RACK_SCALE, current.z).project(camera);
    const show = visible && projected.z < 1;
    label.classList.toggle('hidden', !show);
    if (show) {
      label.textContent = current.ready ? `Drying rack · ${current.ready} ready` : 'Drying rack';
      label.style.transform = `translate(-50%, -100%) translate(${(projected.x * 0.5 + 0.5) * innerWidth}px, ${(-projected.y * 0.5 + 0.5) * innerHeight}px)`;
    }
  }

  function under(clientX, clientY, camera) {
    if (!stateRef.current) return false;
    return pickTarget(clientX, clientY, camera, [{ object: group, value: true }]) === true;
  }

  const api = {
    get state() {
      return stateRef.current;
    },
    set state(value) {
      stateRef.current = value;
    },
    get exists() {
      return Boolean(stateRef.current);
    },
    build,
    moveTo,
    remove,
    freeSlots,
    load,
    collect,
    update,
    render,
    under,
    serialize: () => (stateRef.current ? structuredClone(stateRef.current) : null),
  };
  if (state) place();
  return api;
}
