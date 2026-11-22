import * as THREE from 'three';
import { SHELLS, CLAWS, NAKED, gearGlowLook } from './gear.js';
import { buildShellGeometry, buildClawPreview, createHermit } from './hermit.js';
const WEAPON_ICON_FIT = 0.62;
import { shellModelAvailable, buildShellModel, dressShellMaterial, weaponModelAvailable, weaponModel, dressWeaponMaterial } from './hermitAsset.js';

const ITEM_PIXELS = 128;
const DOLL_PIXELS = 240;
const STAGE = new THREE.Vector3(1000, 200, 0);

export function createThumbnails(quality) {
  let renderer = null;
  let scene = null;
  let camera = null;
  let doll = null;
  const cache = new Map();

  function ensureStage() {
    if (renderer) return true;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    } catch {
      return false;
    }
    renderer.setPixelRatio(1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setClearColor(0x000000, 0);
    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xfff2dc, 0x4a5a62, 1.7));
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(STAGE.x + 3, STAGE.y + 6, STAGE.z + 5);
    sun.target.position.copy(STAGE);
    scene.add(sun, sun.target);
    camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
    return true;
  }

  function frame(object, pixels, viewDirection, fit = 1) {
    renderer.setSize(pixels, pixels, false);
    const bounds = new THREE.Box3();
    object.updateMatrixWorld(true);
    object.traverseVisible((part) => {
      if (!part.isMesh || part.isInstancedMesh || part.renderOrder === 3) return;
      part.geometry.computeBoundingBox();
      bounds.union(part.geometry.boundingBox.clone().applyMatrix4(part.matrixWorld));
    });
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const distance = sphere.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.05 * fit;
    camera.position.copy(sphere.center).addScaledVector(viewDirection.clone().normalize(), distance);
    camera.lookAt(sphere.center);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/png');
  }

  function itemImage(category, kind) {
    const key = `${category}:${kind}`;
    if (cache.has(key)) return cache.get(key);
    if (!ensureStage()) return null;
    let object;
    const model = category === 'shell' && SHELLS[kind].look.model;
    if (model && shellModelAvailable(model)) {
      object = buildShellModel(model, dressShellMaterial(model, new THREE.MeshStandardMaterial()));
      const [shellMesh] = object.children;
      shellMesh.position.set(0, 0, 0);
      shellMesh.rotation.set(0.15, 0.2, 0);
      shellMesh.scale.setScalar(1);
    } else if (category === 'shell') {
      const built = buildShellGeometry(SHELLS[kind].look);
      object = new THREE.Mesh(built.geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, side: THREE.DoubleSide }));
    } else if (weaponModelAvailable(kind)) {
      object = new THREE.Mesh(weaponModel(kind).geometry.clone(), dressWeaponMaterial(kind, new THREE.MeshStandardMaterial(), { thumbnail: true }));
      object.rotation.set(0.5, kind === 'cleaver' ? 0.4 : CLAWS[kind].shield ? 0.3 : -0.9, kind === 'cleaver' ? 0.6 : 0);
    } else {
      const definition = CLAWS[kind];
      object = buildClawPreview(definition.tint || null, Boolean(definition.tines));
      object.rotation.y = -Math.PI / 2;
    }
    object.position.copy(STAGE);
    scene.add(object);
    object.updateMatrixWorld(true);
    const image = frame(object, ITEM_PIXELS, new THREE.Vector3(0.9, 0.75, 1.2), category === 'claws' && weaponModelAvailable(kind) ? WEAPON_ICON_FIT : 1);
    scene.remove(object);
    object.traverse((part) => {
      if (part.geometry && !model) part.geometry.dispose();
    });
    cache.set(key, image);
    return image;
  }

  function dollImage(shellItem, clawItem, smallItem = null) {
    const shellKind = shellItem ? shellItem.kind : null;
    const clawKind = clawItem.kind;
    const smallKind = smallItem ? smallItem.kind : null;
    const key = `doll:${shellKind}:${clawKind}:${smallKind}:${shellItem ? shellItem.quality : ''}:${clawItem.quality}`;
    if (cache.has(key)) return cache.get(key);
    if (!ensureStage()) return null;
    if (!doll) doll = createHermit(scene, quality, NAKED.look);
    doll.setShell(shellKind ? SHELLS[shellKind].look : NAKED.look);
    doll.setClawWeapon(clawKind, smallKind);
    doll.setClawTint(CLAWS[clawKind].tint || null);
    doll.setClawTines(Boolean(CLAWS[clawKind].tines));
    doll.setGearGlow(gearGlowLook(shellItem), gearGlowLook(clawItem));
    doll.root.visible = true;
    for (let tick = 0; tick < 3; tick++) doll.update(1 / 60, { x: STAGE.x, y: STAGE.y, z: STAGE.z, heading: 0.5, speed: 0, working: false, groundNormal: new THREE.Vector3(0, 1, 0) });
    doll.root.updateMatrixWorld(true);
    const image = frame(doll.root, DOLL_PIXELS, new THREE.Vector3(1.1, 0.85, 1.25));
    doll.root.visible = false;
    cache.set(key, image);
    return image;
  }

  return { itemImage, dollImage };
}
