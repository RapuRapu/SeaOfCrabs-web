import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const TOP_REACH_CELLS = 5;
const DUST_COUNT = 70;
const DUST_HEIGHT = 5;
const DUST_RADIUS = 1.6;

const GREY = [0.92, 0.92, 0.92];
const DARK_GREY = [0.55, 0.55, 0.57];
const BROWN = [0.66, 0.5, 0.4];
const RUST = [1.2, 0.68, 0.48];
const CREAM = [1.15, 1.06, 0.88];
const STONE_PALETTE = [GREY, GREY, GREY, DARK_GREY, BROWN, BROWN, BROWN, RUST, RUST, CREAM, CREAM, [0.75, 0.82, 0.95]];
const SHELL_PALETTE = [[1.25, 1.2, 1.1], [1.3, 0.95, 0.9], [1.2, 1.05, 0.85], [1.1, 0.8, 0.8]];

const linear = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);

function cellRandom(column, row, salt) {
  let seed = (column * 73856093) ^ (row * 19349663) ^ (salt * 83492791);
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let mixed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function shaded(geometry, paint) {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  flat.deleteAttribute('uv');
  const position = flat.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const color = new THREE.Color();
  for (let index = 0; index < position.count; index++) {
    paint(color.setRGB(1, 1, 1), position.getX(index), position.getY(index), position.getZ(index));
    color.toArray(colors, index * 3);
  }
  flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  flat.computeVertexNormals();
  return flat;
}

function pebbleGeometry(detail) {
  const stone = mergeVertices(new THREE.IcosahedronGeometry(1, detail).deleteAttribute('normal').deleteAttribute('uv'));
  const stoneBase = linear(0.74, 0.7, 0.66);
  const position = stone.attributes.position;
  for (let index = 0; index < position.count; index++) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const bump = 1 + 0.12 * Math.sin(x * 5.1 + z * 3.7) * Math.cos(y * 4.3);
    position.setXYZ(index, x * bump, Math.max(-0.35, y) * 0.42 * bump, z * 0.82 * bump);
  }
  stone.computeVertexNormals();
  const colors = new Float32Array(position.count * 3);
  const color = new THREE.Color();
  for (let index = 0; index < position.count; index++) color.copy(stoneBase).multiplyScalar(0.78 + 0.3 * THREE.MathUtils.clamp(position.getY(index) * 2, 0, 1)).toArray(colors, index * 3);
  stone.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return stone;
}

function shellBitGeometry() {
  const fan = new THREE.CircleGeometry(1, 18, 0, Math.PI * 0.85);
  const position = fan.attributes.position;
  for (let index = 0; index < position.count; index++) {
    const x = position.getX(index);
    const y = position.getY(index);
    const radius = Math.hypot(x, y);
    const angle = Math.atan2(y, x);
    position.setXYZ(index, x, 0.5 * radius * radius + 0.09 * Math.abs(Math.sin(angle * 9)) * radius, y);
  }
  return shaded(fan, (color, x, y, z) => color.copy(linear(0.96, 0.9, 0.82)).multiplyScalar(0.8 + 0.3 * Math.abs(Math.sin(Math.atan2(z, x) * 9))));
}

function twigGeometry() {
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.5, 0, 0), new THREE.Vector3(-0.1, 0.05, 0.06), new THREE.Vector3(0.5, 0.02, -0.04)]);
  const stick = new THREE.TubeGeometry(curve, 8, 0.07, 6);
  const branch = new THREE.CylinderGeometry(0.028, 0.05, 0.32, 5).rotateZ(Math.PI / 2.6).translate(0.08, 0.06, 0.1);
  return shaded(mergeGeometries([stick.toNonIndexed(), branch.toNonIndexed()]), (color, x) => color.copy(linear(0.55, 0.42, 0.28)).multiplyScalar(0.85 + 0.3 * Math.sin(x * 11)));
}

function scrapGeometry() {
  const strip = new THREE.PlaneGeometry(0.26, 0.9, 2, 12).rotateX(-Math.PI / 2);
  const position = strip.attributes.position;
  for (let index = 0; index < position.count; index++) {
    const z = position.getZ(index);
    const x = position.getX(index);
    const bend = z * 1.4;
    position.setXYZ(index, x * Math.max(0.15, 1 - (z / 0.46) ** 2) + 0.18 * Math.sin(z * 5), 0.02 + 0.05 * Math.max(0, Math.sin(z * 6)) + 0.08 * Math.max(0, -x) - 0.04 * Math.max(0, z), z * Math.cos(bend * 0.3));
  }
  return shaded(strip, (color, x, y, z) => color.copy(linear(0.36, 0.28, 0.13)).multiplyScalar((1.1 - 0.7 * Math.abs(z)) * (0.75 + 0.25 * Math.min(1, Math.abs(x) * 12))));
}

function rootGeometry() {
  const taper = (tube, startRadius, endRadius) => {
    const position = tube.attributes.position;
    const segments = tube.parameters.tubularSegments;
    const ring = tube.parameters.radialSegments + 1;
    const center = new THREE.Vector3();
    const point = new THREE.Vector3();
    for (let step = 0; step <= segments; step++) {
      const share = step / segments;
      tube.parameters.path.getPointAt(share, center);
      const scale = THREE.MathUtils.lerp(startRadius, endRadius, share) / tube.parameters.radius;
      for (let around = 0; around < ring; around++) {
        const index = step * ring + around;
        point.fromBufferAttribute(position, index).sub(center).multiplyScalar(scale).add(center);
        position.setXYZ(index, point.x, point.y, point.z);
      }
    }
    return tube;
  };
  const main = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.06, -0.35, 0.03), new THREE.Vector3(-0.05, -0.75, 0.05), new THREE.Vector3(0.04, -1.1, 0.08)]);
  const sideA = new THREE.CatmullRomCurve3([new THREE.Vector3(0.05, -0.3, 0.03), new THREE.Vector3(0.22, -0.48, 0.06), new THREE.Vector3(0.28, -0.7, 0.1)]);
  const sideB = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.03, -0.62, 0.04), new THREE.Vector3(-0.2, -0.78, 0.07), new THREE.Vector3(-0.24, -0.95, 0.1)]);
  const parts = [taper(new THREE.TubeGeometry(main, 12, 0.06, 5), 0.065, 0.012), taper(new THREE.TubeGeometry(sideA, 6, 0.03, 4), 0.032, 0.008), taper(new THREE.TubeGeometry(sideB, 6, 0.03, 4), 0.03, 0.008)];
  return shaded(mergeGeometries(parts.map((part) => part.toNonIndexed())), (color, x, y) => color.copy(linear(0.5, 0.36, 0.24)).multiplyScalar(0.8 + 0.3 * Math.sin(y * 13)));
}

function slumpGeometry() {
  const cone = new THREE.ConeGeometry(1, 1, 12, 2).translate(0, 0.5, 0);
  const position = cone.attributes.position;
  for (let index = 0; index < position.count; index++) {
    const x = position.getX(index);
    const z = position.getZ(index);
    const angle = Math.atan2(z, x);
    const wobble = 1 + 0.18 * Math.sin(angle * 3 + 1.3) + 0.1 * Math.sin(angle * 7);
    position.setXYZ(index, x * wobble, position.getY(index) * (0.85 + 0.15 * Math.sin(angle * 5)), z * wobble);
  }
  return shaded(cone, (color, x, y) => color.copy(linear(0.78, 0.65, 0.48)).multiplyScalar(0.72 + 0.35 * y));
}

function contactTexture() {
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const distance = Math.hypot(column - size / 2 + 0.5, row - size / 2 + 0.5) / (size / 2);
      const alpha = Math.max(0, 1 - distance) ** 1.6;
      data.set([0, 0, 0, Math.round(alpha * 255)], (row * size + column) * 4);
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function createKind(parent, geometry, capacity, materialOptions = {}) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, ...materialOptions });
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.count = 0;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  parent.add(mesh);
  return { mesh, capacity };
}

export function createBurrowDecor(interior, { burrowCell, wallHeight, density, isDug, insideGrid, stationAt, sandHeightAt, cellLocal, cellRange, shaftLocal }) {
  const kinds = {
    pebble: createKind(interior, pebbleGeometry(1), 6000, { roughness: 0.45 }),
    boulder: createKind(interior, pebbleGeometry(2), 600, { roughness: 0.42 }),
    shell: createKind(interior, shellBitGeometry(), 3000, { roughness: 0.55, side: THREE.DoubleSide }),
    twig: createKind(interior, twigGeometry(), 1500),
    scrap: createKind(interior, scrapGeometry(), 1500, { side: THREE.DoubleSide, roughness: 0.45 }),
    root: createKind(interior, rootGeometry(), 1500),
    slump: createKind(interior, slumpGeometry(), 1500, { roughness: 0.95 }),
  };
  const contactMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: contactTexture(), transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 4000);
  contactMesh.count = 0;
  contactMesh.frustumCulled = false;
  contactMesh.renderOrder = 1;
  interior.add(contactMesh);
  const CONTACT_MIN_SIZE = { pebble: 0.13, boulder: 0, shell: 0.2, slump: 0 };
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const turn = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const normal = new THREE.Vector3();
  const tint = new THREE.Color();

  function surfaceNormal(x, z) {
    const step = 0.12;
    return normal.set(sandHeightAt(x - step, z) - sandHeightAt(x + step, z), step * 2, sandHeightAt(x, z - step) - sandHeightAt(x, z + step)).normalize();
  }

  function place(kindName, x, y, z, along, spin, sizeX, sizeY, sizeZ, color) {
    const kind = kinds[kindName];
    if (kind.mesh.count >= kind.capacity) return;
    quaternion.setFromUnitVectors(up, along);
    turn.setFromAxisAngle(up, spin);
    quaternion.multiply(turn);
    matrix.compose(position.set(x, y, z), quaternion, scale.set(sizeX, sizeY, sizeZ));
    kind.mesh.setMatrixAt(kind.mesh.count, matrix);
    kind.mesh.setColorAt(kind.mesh.count, color);
    kind.mesh.count++;
    const contactMin = CONTACT_MIN_SIZE[kindName];
    if (contactMin === undefined || Math.max(sizeX, sizeZ) < contactMin || contactMesh.count >= contactMesh.instanceMatrix.count) return;
    const radius = Math.max(sizeX, sizeZ) * (kindName === 'slump' ? 2.6 : 2.8);
    quaternion.setFromUnitVectors(up, along);
    matrix.compose(position.set(x, Math.max(0, sandHeightAt(x, z)) + 0.02, z), quaternion, scale.set(radius, 1, radius));
    contactMesh.setMatrixAt(contactMesh.count++, matrix);
  }

  const chance = (random, share) => random() < share * density;
  const stoneTint = (random, light = 1) => {
    const [red, green, blue] = STONE_PALETTE[Math.floor(random() * STONE_PALETTE.length)];
    const brightness = (0.8 + random() * 0.4) * light;
    return tint.setRGB(red * brightness, green * brightness, blue * brightness);
  };
  const shellTint = (random) => {
    const [red, green, blue] = SHELL_PALETTE[Math.floor(random() * SHELL_PALETTE.length)];
    return tint.setRGB(red, green, blue);
  };

  function decorateFloor(column, row) {
    if (stationAt(column, row)) return;
    const random = cellRandom(column, row, 1);
    const center = cellLocal(column, row);
    const spot = () => ({ x: center.x + (random() - 0.5) * burrowCell * 0.9, z: center.z + (random() - 0.5) * burrowCell * 0.9 });
    const flatUp = up;
    if (chance(random, 0.18)) {
      const { x, z } = spot();
      const size = 0.3 + random() * 0.25;
      if (sandHeightAt(x, z) <= 0.12) place('boulder', x, -size * 0.25, z, flatUp, random() * 6.3, size, size * 1.2, size, stoneTint(random));
    }
    for (let index = 0; index < 3; index++) {
      if (!chance(random, 0.7)) continue;
      const { x, z } = spot();
      if (sandHeightAt(x, z) > 0.12) continue;
      const size = 0.06 + random() * random() * 0.3;
      place('pebble', x, -size * 0.1, z, flatUp, random() * 6.3, size, size, size, stoneTint(random));
      if (random() < 0.4) {
        for (let grain = 0; grain < 5; grain++) {
          const grainSize = 0.03 + random() * 0.05;
          place('pebble', x + (random() - 0.5) * 0.6, 0, z + (random() - 0.5) * 0.6, flatUp, random() * 6.3, grainSize, grainSize, grainSize, stoneTint(random, 1.1));
        }
      }
    }
    for (let index = 0; index < 2; index++) {
      if (!chance(random, 0.55)) continue;
      const { x, z } = spot();
      if (sandHeightAt(x, z) > 0.12) continue;
      const size = 0.12 + random() * 0.12;
      place('shell', x, 0.01, z, flatUp, random() * 6.3, size, size, size, shellTint(random));
    }
    if (chance(random, 0.35)) {
      const { x, z } = spot();
      if (sandHeightAt(x, z) <= 0.12) place('twig', x, 0.03, z, flatUp, random() * 6.3, 0.5 + random() * 0.6, 0.8, 0.8, tint.setRGB(1, 1, 1));
    }
    if (chance(random, 0.25)) {
      const { x, z } = spot();
      if (sandHeightAt(x, z) <= 0.12) place('scrap', x, 0.0, z, flatUp, random() * 6.3, 0.8 + random() * 0.6, 1, 0.5 + random() * 0.5, tint.setRGB(1, 1, 1));
    }
  }

  function wallPoint(center, directionX, directionZ, targetHeight) {
    for (let travel = 0.4; travel < burrowCell * 1.2; travel += 0.08) {
      const x = center.x + directionX * travel;
      const z = center.z + directionZ * travel;
      if (sandHeightAt(x, z) >= targetHeight) return { x, z };
    }
    return null;
  }

  function decorateWalls(column, row) {
    const center = cellLocal(column, row);
    DIRECTIONS.forEach(([stepColumn, stepRow], side) => {
      if (isDug(column + stepColumn, row + stepRow) || !insideGrid(column + stepColumn, row + stepRow)) return;
      const random = cellRandom(column, row, 10 + side);
      const sideways = () => (random() - 0.5) * burrowCell * 0.8;
      const base = (height) => {
        const offset = sideways();
        const start = { x: center.x + stepRow * offset, z: center.z + stepColumn * offset };
        const point = wallPoint(start, stepColumn, stepRow, height);
        return point && { ...point, normal: surfaceNormal(point.x, point.z).clone() };
      };
      for (let index = 0; index < 3; index++) {
        if (!chance(random, 0.7)) continue;
        const point = base(wallHeight * (0.15 + random() * 0.7));
        if (!point) continue;
        const size = 0.1 + random() * 0.17;
        const tilted = point.normal.clone().add(new THREE.Vector3(random() - 0.5, random() * 0.6, random() - 0.5)).normalize();
        place('pebble', point.x + point.normal.x * size * 0.1, sandHeightAt(point.x, point.z), point.z + point.normal.z * size * 0.1, tilted, random() * 6.3, size, size * 1.8, size * 0.9, stoneTint(random, 0.9));
      }
      for (let index = 0; index < 2; index++) {
        if (!chance(random, 0.45)) continue;
        const point = base(wallHeight * (0.25 + random() * 0.6));
        if (!point) continue;
        const size = 0.14 + random() * 0.12;
        place('shell', point.x, sandHeightAt(point.x, point.z), point.z, point.normal, random() * 6.3, size, size, size, shellTint(random));
      }
      const rootCount = chance(random, 0.55) ? 1 + Math.floor(random() * 2) : 0;
      for (let index = 0; index < rootCount; index++) {
        const point = base(wallHeight * 0.92);
        if (!point) continue;
        const outward = new THREE.Vector3(-stepColumn, 0, -stepRow);
        const hang = new THREE.Vector3(0, 1, 0).addScaledVector(outward, -0.35).normalize();
        const length = 0.8 + random() * 0.8;
        place('root', point.x + outward.x * 0.04, sandHeightAt(point.x, point.z) + 0.02, point.z + outward.z * 0.04, hang, Math.atan2(outward.x, outward.z), 1.3 + random() * 0.6, length, 1.3 + random() * 0.6, tint.setRGB(0.9 + random() * 0.3, 0.9 + random() * 0.2, 0.9));
      }
      if (chance(random, 0.6)) {
        const point = base(0.05);
        if (point) {
          const size = 0.35 + random() * 0.35;
          const slumpX = point.x - stepColumn * 0.15;
          const slumpZ = point.z - stepRow * 0.15;
          place('slump', slumpX, -0.02, slumpZ, up, random() * 6.3, size * 1.3, size * 0.45, size, tint.setRGB(1, 1, 1));
          if (chance(random, 0.55)) {
            const boulderSize = 0.25 + random() * 0.25;
            const offset = (random() - 0.5) * 1.2;
            place('boulder', slumpX - stepColumn * 0.35 + stepRow * offset, -boulderSize * 0.25, slumpZ - stepRow * 0.35 + stepColumn * offset, up, random() * 6.3, boulderSize, boulderSize * 1.2, boulderSize, stoneTint(random));
            for (let shell = 0; shell < 2; shell++) {
              if (!chance(random, 0.6)) continue;
              const shellSize = 0.2 + random() * 0.12;
              place('shell', slumpX - stepColumn * (0.5 + random() * 0.4) + stepRow * (random() - 0.5) * 1.4, 0.01, slumpZ - stepRow * (0.5 + random() * 0.4) + stepColumn * (random() - 0.5) * 1.4, up, random() * 6.3, shellSize, shellSize, shellSize, shellTint(random));
            }
          }
        }
      }
    });
  }

  function decorateTop(column, row, share) {
    const random = cellRandom(column, row, 30);
    const center = cellLocal(column, row);
    if (random() > 0.18 * share) return;
    const clusterX = center.x + (random() - 0.5) * burrowCell * 0.6;
    const clusterZ = center.z + (random() - 0.5) * burrowCell * 0.6;
    const heroHeight = sandHeightAt(clusterX, clusterZ);
    if (heroHeight < wallHeight * 0.85) return;
    const heroNormal = surfaceNormal(clusterX, clusterZ).clone();
    if (heroNormal.y < 0.9) return;
    const heroRoll = random();
    if (heroRoll < 0.5) {
      const size = 0.25 + random() * 0.2;
      place('boulder', clusterX, heroHeight - size * 0.3, clusterZ, heroNormal, random() * 6.3, size, size * 1.3, size, stoneTint(random));
    } else if (heroRoll < 0.75) {
      const size = 0.35 + random() * 0.15;
      place('shell', clusterX, heroHeight + 0.01, clusterZ, heroNormal, random() * 6.3, size, size, size, shellTint(random));
    } else {
      place('twig', clusterX, heroHeight + 0.05, clusterZ, heroNormal, random() * 6.3, 1.2 + random() * 0.6, 1.2, 1.2, tint.setRGB(1, 1, 1));
    }
    const satellites = 2 + Math.floor(random() * 3);
    for (let index = 0; index < satellites; index++) {
      const angle = random() * Math.PI * 2;
      const reach = 0.5 + random() * 0.6;
      const x = clusterX + Math.cos(angle) * reach;
      const z = clusterZ + Math.sin(angle) * reach;
      if (!chance(random, 0.9)) continue;
      const height = sandHeightAt(x, z);
      if (height < wallHeight * 0.85) continue;
      const along = surfaceNormal(x, z).clone();
      if (along.y < 0.9) continue;
      const roll = random();
      if (roll < 0.5) {
        const size = 0.12 + random() * 0.18;
        place('pebble', x, height - size * 0.1, z, along, random() * 6.3, size, size, size, stoneTint(random));
      } else if (roll < 0.75) {
        const size = 0.18 + random() * 0.12;
        place('shell', x, height + 0.01, z, along, random() * 6.3, size, size, size, shellTint(random));
      } else {
        place('scrap', x, height + 0.01, z, along, random() * 6.3, 1.2 + random() * 0.6, 1, 1, tint.setRGB(1, 1, 1));
      }
    }
  }

  function rebuild() {
    for (const kind of Object.values(kinds)) kind.mesh.count = 0;
    contactMesh.count = 0;
    const { min, max } = cellRange;
    for (let row = min; row <= max; row++) {
      for (let column = min; column <= max; column++) {
        if (isDug(column, row)) {
          decorateFloor(column, row);
          decorateWalls(column, row);
          continue;
        }
        let nearest = Infinity;
        for (let rowStep = -TOP_REACH_CELLS; rowStep <= TOP_REACH_CELLS; rowStep++) {
          for (let columnStep = -TOP_REACH_CELLS; columnStep <= TOP_REACH_CELLS; columnStep++) {
            if (isDug(column + columnStep, row + rowStep)) nearest = Math.min(nearest, Math.max(Math.abs(columnStep), Math.abs(rowStep)));
          }
        }
        if (nearest <= TOP_REACH_CELLS) decorateTop(column, row, nearest <= 1 ? 1 : nearest <= 2 ? 0.6 : 0.3);
      }
    }
    for (const kind of Object.values(kinds)) {
      kind.mesh.instanceMatrix.needsUpdate = true;
      if (kind.mesh.instanceColor) kind.mesh.instanceColor.needsUpdate = true;
    }
    contactMesh.instanceMatrix.needsUpdate = true;
  }

  const dustPositions = new Float32Array(DUST_COUNT * 3);
  const dustSeeds = new Float32Array(DUST_COUNT);
  for (let index = 0; index < DUST_COUNT; index++) dustSeeds[index] = Math.random();
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({ color: new THREE.Color(1.6, 1.4, 1.0), size: 0.06, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  dust.frustumCulled = false;
  interior.add(dust);

  function update(time, shaftOpen) {
    dust.visible = shaftOpen;
    if (!shaftOpen) return;
    for (let index = 0; index < DUST_COUNT; index++) {
      const seed = dustSeeds[index];
      const rise = (seed * 37 + time * (0.05 + seed * 0.08)) % 1;
      const angle = seed * 91 + time * 0.2 * (seed - 0.5);
      const radius = DUST_RADIUS * Math.sqrt((seed * 13.7) % 1);
      dustPositions[index * 3] = shaftLocal.x + Math.cos(angle) * radius;
      dustPositions[index * 3 + 1] = 0.2 + rise * DUST_HEIGHT;
      dustPositions[index * 3 + 2] = shaftLocal.z + Math.sin(angle) * radius;
    }
    dustGeometry.attributes.position.needsUpdate = true;
  }

  const counts = () => Object.fromEntries(Object.entries(kinds).map(([name, kind]) => [name, kind.mesh.count]));

  return { rebuild, update, counts, meshes: Object.values(kinds).map((kind) => kind.mesh).concat(contactMesh, dust) };
}
