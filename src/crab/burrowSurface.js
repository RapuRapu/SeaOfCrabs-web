const SURFACE_NOISE = /* glsl */ `
varying vec3 vSurfaceWorld;
varying vec3 vSurfaceNormal;
uniform float uSurfaceBaseY;
uniform float uSurfaceWallHeight;
float surfaceWetness = 0.0;
#ifdef BURROW_FLOOR
uniform sampler2D uSolidMask;
uniform vec3 uSolidMaskMapping;
#endif

float surfaceHash(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
}

float surfaceNoise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  vec2 blend = local * local * (3.0 - 2.0 * local);
  return mix(mix(surfaceHash(cell), surfaceHash(cell + vec2(1.0, 0.0)), blend.x), mix(surfaceHash(cell + vec2(0.0, 1.0)), surfaceHash(cell + vec2(1.0, 1.0)), blend.x), blend.y);
}

float surfaceFbm(vec2 point) {
  float total = 0.0;
  float amplitude = 0.5;
  for (int octave = 0; octave < 4; octave++) {
    total += amplitude * surfaceNoise(point);
    point *= 2.03;
    amplitude *= 0.5;
  }
  return total;
}

vec2 surfaceStones(vec2 point, float density) {
  vec2 cell = floor(point);
  float nearest = 1.0;
  float tone = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 candidate = cell + vec2(float(x), float(y));
      if (surfaceHash(candidate) > density) continue;
      vec2 offset = vec2(surfaceHash(candidate + 3.1), surfaceHash(candidate + 7.7));
      float distanceToStone = length(point - candidate - offset) / (0.16 + 0.22 * surfaceHash(candidate + 1.3));
      if (distanceToStone < nearest) {
        nearest = distanceToStone;
        tone = surfaceHash(candidate + 5.9);
      }
    }
  }
  return vec2(sqrt(max(0.0, 1.0 - nearest * nearest)), tone);
}

vec3 surfaceTintAndHeight(out float height) {
  vec2 ground = vSurfaceWorld.xz;
  float grain = surfaceFbm(ground * 9.0);
#ifdef BURROW_FLOOR
  float damp = smoothstep(0.45, 0.7, surfaceFbm(ground * 0.32 + 4.0));
  vec2 flecks = surfaceStones(ground * 7.0 + 11.0, 0.12);
  vec2 maskPoint = (ground * uSolidMaskMapping.z + uSolidMaskMapping.xy) / float(textureSize(uSolidMask, 0).x);
  float wallNear = smoothstep(0.04, 0.5, texture2D(uSolidMask, maskPoint).r);
  vec3 tint = vec3(0.8 + 0.2 * grain);
  tint *= mix(vec3(1.0), vec3(0.78, 0.74, 0.7), damp);
  tint = mix(tint, vec3(1.25, 1.18, 1.08), flecks.x * 0.5);
  tint *= mix(1.0, 0.55, wallNear) * vec3(1.04, 0.99, 0.92);
  surfaceWetness = max(damp * 0.5, wallNear * 0.8);
  height = grain * 0.35 - damp * 0.15;
#else
  float up = smoothstep(0.62, 0.9, vSurfaceNormal.y);
  float steep = 1.0 - smoothstep(0.35, 0.6, vSurfaceNormal.y);
  float wallHeight = vSurfaceWorld.y - uSurfaceBaseY;
  float heightShare = clamp(wallHeight / uSurfaceWallHeight, 0.0, 1.2);
  vec2 along = vec2(vSurfaceWorld.x + vSurfaceWorld.z, wallHeight);
  float warp = surfaceFbm(ground * 0.6) * 0.18;
  float layer = (wallHeight + warp * 2.0) * 2.4 + surfaceNoise(vec2(along.x * 0.25, 2.0)) * 0.6;
  float layerIndex = floor(layer);
  float layerTone = surfaceHash(vec2(layerIndex, 1.7));
  float layerEdge = smoothstep(0.0, 0.18, fract(layer)) * (1.0 - smoothstep(0.82, 1.0, fract(layer)));
  vec3 layerColor = layerTone < 0.33 ? vec3(0.66, 0.54, 0.42) : layerTone < 0.66 ? vec3(0.95, 0.86, 0.72) : vec3(1.12, 1.04, 0.9);
  layerColor *= mix(0.9, 1.0, layerEdge);
  float scrape = surfaceNoise(vec2(along.x * 7.0, along.y * 0.9));
  float clawCoordinate = (along.x - along.y * 0.55) * 3.2;
  float clawSet = floor(clawCoordinate / 4.0);
  float clawInSet = mod(clawCoordinate, 4.0);
  float clawPresent = step(0.55, surfaceHash(vec2(clawSet, 9.1))) * step(clawInSet, 3.0);
  float clawSpan = surfaceHash(vec2(clawSet, 4.4));
  float clawReach = smoothstep(0.05, 0.12, heightShare) * (1.0 - smoothstep(0.3 + 0.25 * clawSpan, 0.4 + 0.25 * clawSpan, heightShare));
  float groove = (1.0 - smoothstep(0.08, 0.3, abs(fract(clawInSet) - 0.5))) * clawPresent * clawReach;
  vec3 sideTint = layerColor * (0.92 + 0.14 * scrape) * mix(1.0, 0.55, groove);
  vec2 shells = surfaceStones(along * vec2(2.2, 2.6) + 17.0, mix(0.05, 0.3, step(0.66, layerTone)));
  sideTint = mix(sideTint, vec3(1.5, 1.44, 1.32) * (0.8 + 0.3 * shells.x), smoothstep(0.0, 0.3, shells.x) * 0.8);
  float damp = 1.0 - smoothstep(0.05, 0.45, wallHeight);
  sideTint *= mix(1.0, 0.5, damp);
  float lip = smoothstep(0.82, 0.95, heightShare) * (1.0 - up);
  float underLip = smoothstep(0.62, 0.8, heightShare) * (1.0 - smoothstep(0.82, 0.9, heightShare));
  sideTint *= mix(1.0, 0.8, underLip);
  sideTint = mix(sideTint, vec3(1.3, 1.22, 1.08), lip * 0.55);
  float sideHeight = layerEdge * 0.4 + scrape * 0.25 + grain * 0.2 + shells.x * 0.3 - groove * 1.1;
  float lump = surfaceFbm(ground * 1.2);
  float clod = smoothstep(0.55, 0.75, surfaceFbm(ground * 1.1 + 3.0));
  float dampPatch = smoothstep(0.55, 0.7, surfaceFbm(ground * 0.4 + 21.0));
  vec3 topTint = vec3(1.12 + 0.16 * lump + 0.05 * grain) * vec3(1.02, 0.99, 0.93);
  topTint *= mix(1.0, 1.12, clod);
  topTint *= mix(1.0, 0.9, dampPatch);
  float topHeight = lump * 1.4 + grain * 0.15;
  float rim = smoothstep(0.55, 0.7, vSurfaceNormal.y) * (1.0 - smoothstep(0.75, 0.88, vSurfaceNormal.y));
  topTint = mix(topTint, vec3(1.45, 1.38, 1.24), rim * 0.6);
  height = mix(mix(grain * 0.4, sideHeight, steep), topHeight, up);
  vec3 tint = mix(mix(vec3(0.95 + 0.2 * lump), sideTint, steep), topTint, up);
  tint *= vec3(1.04, 0.99, 0.92);
  surfaceWetness = damp * (1.0 - up);
#endif
  return tint;
}

vec3 surfaceBump(vec3 viewNormal, vec3 viewPosition, float height, float strength) {
  vec3 dpdx = dFdx(viewPosition);
  vec3 dpdy = dFdy(viewPosition);
  float dhdx = dFdx(height);
  float dhdy = dFdy(height);
  vec3 r1 = cross(dpdy, viewNormal);
  vec3 r2 = cross(viewNormal, dpdx);
  float determinant = dot(dpdx, r1);
  vec3 gradient = sign(determinant) * (dhdx * r1 + dhdy * r2);
  return normalize(abs(determinant) * viewNormal + gradient * strength);
}
`;

const BUMP_STRENGTH = { floor: 0.035, sand: 0.07 };

export function applyBurrowSurface(material, kind, baseY, wallHeight = 1, solidMask = null) {
  material.defines = { ...(material.defines || {}), ...(kind === 'floor' ? { BURROW_FLOOR: '' } : {}) };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSurfaceBaseY = { value: baseY };
    shader.uniforms.uSurfaceWallHeight = { value: wallHeight };
    if (solidMask) {
      shader.uniforms.uSolidMask = { value: solidMask.texture };
      shader.uniforms.uSolidMaskMapping = { value: solidMask.mapping };
    }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSurfaceWorld;\nvarying vec3 vSurfaceNormal;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvSurfaceWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvSurfaceNormal = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${SURFACE_NOISE}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\nfloat surfaceHeight;\ndiffuseColor.rgb *= surfaceTintAndHeight(surfaceHeight);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= 1.0 - 0.55 * surfaceWetness;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\nnormal = surfaceBump(normal, -vViewPosition, surfaceHeight, ${BUMP_STRENGTH[kind].toFixed(3)});`);
  };
  material.customProgramCacheKey = () => `burrow-surface-${kind}`;
  return material;
}
