import * as THREE from 'three';

const FOG_UNITS_PER_TEXEL = 236 / 256;
export const FOG_REVEAL_RADIUS = 20;
const REVEAL_STEP_DISTANCE = 1;
const REVEALED = 255;

export const FOG_GLSL = /* glsl */ `
uniform sampler2D tFog;
uniform vec2 uFogMin;
uniform vec2 uFogExtent;
uniform vec2 uFogTexel;
float fogHash(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
}
float fogNoise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  local = local * local * (3.0 - 2.0 * local);
  float bottom = mix(fogHash(cell), fogHash(cell + vec2(1.0, 0.0)), local.x);
  float top = mix(fogHash(cell + vec2(0.0, 1.0)), fogHash(cell + vec2(1.0, 1.0)), local.x);
  return mix(bottom, top, local.y);
}
float fogRevealAt(vec2 worldXZ) {
  vec2 uv = (worldXZ - uFogMin) / uFogExtent;
  float total = 0.0;
  for (int stepX = -2; stepX <= 2; stepX++) {
    for (int stepY = -2; stepY <= 2; stepY++) {
      total += texture2D(tFog, uv + vec2(float(stepX), float(stepY)) * uFogTexel * 1.6).r;
    }
  }
  return total / 25.0;
}
vec3 applyFog(vec3 color, vec2 worldXZ, float time) {
  float revealed = fogRevealAt(worldXZ);
  float clumps = fogNoise(worldXZ * 0.07 + 13.0) * 0.55 + fogNoise(worldXZ * 0.19 - 7.0) * 0.3 + fogNoise(worldXZ * 0.5) * 0.15;
  float swirl = fogNoise(worldXZ * 0.12 + vec2(time * 0.05, -time * 0.03)) * 0.6 + fogNoise(worldXZ * 0.31 - vec2(time * 0.04, 0.0)) * 0.4;
  float shaped = revealed + (clumps - 0.5) * 0.75 + (swirl - 0.5) * 0.15;
  float mist = 1.0 - smoothstep(0.55, 1.0, shaped);
  float darkness = 1.0 - smoothstep(0.15, 0.7, shaped);
  vec3 mistColor = vec3(0.36, 0.4, 0.45) * (0.8 + 0.3 * swirl);
  color = mix(color, mistColor, mist * 0.6);
  return mix(color, vec3(0.0), darkness);
}
`;

const texelGridOf = (bounds) => {
  const columns = Math.round((bounds.maxX - bounds.minX) / FOG_UNITS_PER_TEXEL);
  const rows = Math.round((bounds.maxZ - bounds.minZ) / FOG_UNITS_PER_TEXEL);
  return { columns, rows, unitsPerTexel: (bounds.maxX - bounds.minX) / columns };
};

const decodeBits = (encoded, length) => {
  const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
  return Array.from({ length }, (_, index) => (bytes[index >> 3] & (1 << (index & 7))) !== 0);
};

const encodeBits = (bits) => {
  const bytes = new Uint8Array(Math.ceil(bits.length / 8));
  bits.forEach((bit, index) => {
    if (bit) bytes[index >> 3] |= 1 << (index & 7);
  });
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
};

export function remapFog(encoded, fromBounds, toBounds) {
  const from = texelGridOf(fromBounds);
  const to = texelGridOf(toBounds);
  const fromBits = decodeBits(encoded, from.columns * from.rows);
  const toBits = new Array(to.columns * to.rows).fill(false);
  for (let row = 0; row < to.rows; row++) {
    for (let column = 0; column < to.columns; column++) {
      const fromColumn = Math.floor(((column + 0.5) * to.unitsPerTexel + toBounds.minX - fromBounds.minX) / from.unitsPerTexel);
      const fromRow = Math.floor(((row + 0.5) * to.unitsPerTexel + toBounds.minZ - fromBounds.minZ) / from.unitsPerTexel);
      if (fromColumn < 0 || fromRow < 0 || fromColumn >= from.columns || fromRow >= from.rows) continue;
      toBits[row * to.columns + column] = fromBits[fromRow * from.columns + fromColumn];
    }
  }
  return encodeBits(toBits);
}

export function createFog({ bounds, saved }) {
  const columns = Math.round((bounds.maxX - bounds.minX) / FOG_UNITS_PER_TEXEL);
  const rows = Math.round((bounds.maxZ - bounds.minZ) / FOG_UNITS_PER_TEXEL);
  const unitsPerTexel = (bounds.maxX - bounds.minX) / columns;
  const data = new Uint8Array(columns * rows);
  const texture = new THREE.DataTexture(data, columns, rows, THREE.RedFormat, THREE.UnsignedByteType);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  let lastReveal = null;
  let changed = false;

  const columnOf = (x) => Math.floor((x - bounds.minX) / unitsPerTexel);
  const rowOf = (z) => Math.floor((z - bounds.minZ) / unitsPerTexel);

  if (saved) unpack(saved);

  function unpack(encoded) {
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    for (let index = 0; index < data.length; index++) data[index] = bytes[index >> 3] & (1 << (index & 7)) ? REVEALED : 0;
  }

  function serialize() {
    const bytes = new Uint8Array(data.length / 8);
    for (let index = 0; index < data.length; index++) if (data[index]) bytes[index >> 3] |= 1 << (index & 7);
    let text = '';
    for (const byte of bytes) text += String.fromCharCode(byte);
    return btoa(text);
  }

  function reveal(x, z, radius = FOG_REVEAL_RADIUS) {
    const radiusTexels = radius / unitsPerTexel;
    const centerColumn = (x - bounds.minX) / unitsPerTexel;
    const centerRow = (z - bounds.minZ) / unitsPerTexel;
    for (let row = Math.max(0, Math.floor(centerRow - radiusTexels)); row <= Math.min(rows - 1, Math.ceil(centerRow + radiusTexels)); row++) {
      for (let column = Math.max(0, Math.floor(centerColumn - radiusTexels)); column <= Math.min(columns - 1, Math.ceil(centerColumn + radiusTexels)); column++) {
        if (Math.hypot(column + 0.5 - centerColumn, row + 0.5 - centerRow) > radiusTexels) continue;
        const index = row * columns + column;
        if (data[index] !== REVEALED) {
          data[index] = REVEALED;
          changed = true;
        }
      }
    }
  }

  function revealWhere(predicate) {
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const x = (column + 0.5) * unitsPerTexel + bounds.minX;
        const z = (row + 0.5) * unitsPerTexel + bounds.minZ;
        if (predicate(x, z)) data[row * columns + column] = REVEALED;
      }
    }
    changed = true;
  }

  function follow(x, z) {
    if (lastReveal && Math.hypot(x - lastReveal.x, z - lastReveal.z) < REVEAL_STEP_DISTANCE) return;
    lastReveal = { x, z };
    reveal(x, z);
  }

  function isRevealed(x, z) {
    const column = columnOf(x);
    const row = rowOf(z);
    if (column < 0 || row < 0 || column >= columns || row >= rows) return false;
    return data[row * columns + column] === REVEALED;
  }

  function upload() {
    if (!changed) return;
    texture.needsUpdate = true;
    changed = false;
  }

  return {
    texture,
    uniforms: { tFog: { value: texture }, uFogMin: { value: new THREE.Vector2(bounds.minX, bounds.minZ) }, uFogExtent: { value: new THREE.Vector2(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) }, uFogTexel: { value: new THREE.Vector2(1 / columns, 1 / rows) } },
    reveal,
    revealWhere,
    follow,
    isRevealed,
    upload,
    serialize,
    get revealedShare() {
      let count = 0;
      for (const value of data) if (value) count++;
      return count / data.length;
    },
  };
}
