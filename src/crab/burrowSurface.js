const SURFACE_NOISE = /* glsl */ `
varying vec3 vSurfaceWorld;
varying vec3 vSurfaceNormal;
uniform float uSurfaceBaseY;

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
  vec2 stones = surfaceStones(ground * 2.6, 0.14);
  vec2 flecks = surfaceStones(ground * 7.0 + 11.0, 0.12);
  vec3 tint = vec3(0.8 + 0.2 * grain);
  tint *= mix(vec3(1.0), vec3(0.78, 0.74, 0.7), damp);
  float stoneMask = smoothstep(0.0, 0.25, stones.x);
  vec3 stoneColor = mix(vec3(0.7, 0.7, 0.72), vec3(1.2, 1.12, 1.0), stones.y) * (0.72 + 0.45 * stones.x);
  tint = mix(tint, stoneColor, stoneMask);
  tint = mix(tint, vec3(1.25, 1.18, 1.08), flecks.x * 0.5);
  height = grain * 0.35 - damp * 0.15;
#else
  float up = smoothstep(0.55, 0.85, vSurfaceNormal.y);
  float wallHeight = vSurfaceWorld.y - uSurfaceBaseY;
  vec2 along = vec2(vSurfaceWorld.x + vSurfaceWorld.z, wallHeight);
  float warp = surfaceFbm(ground * 0.6) * 0.22;
  float strata = surfaceNoise(vec2((wallHeight + warp) * 7.0, 0.5));
  float band = 0.5 + 0.5 * sin((wallHeight + warp) * 26.0);
  float scrape = surfaceNoise(vec2(along.x * 7.0, along.y * 0.9));
  vec2 wallStones = surfaceStones(along * vec2(2.6, 3.2), 0.18);
  vec3 sideTint = vec3(0.74 + 0.4 * strata) * mix(vec3(0.86, 0.82, 0.76), vec3(1.08, 1.04, 0.98), band);
  sideTint *= 0.9 + 0.16 * scrape;
  sideTint = mix(sideTint, mix(vec3(0.6, 0.6, 0.6), vec3(0.42, 0.3, 0.2), wallStones.y) * (0.8 + 0.3 * wallStones.x), smoothstep(0.0, 0.25, wallStones.x) * 0.85);
  float sideHeight = band * 0.35 + scrape * 0.3 + grain * 0.2;
  float lump = surfaceFbm(ground * 3.2);
  vec3 topTint = vec3(1.0 + 0.24 * lump + 0.12 * grain);
  float topHeight = lump * 0.7 + grain * 0.3;
  height = mix(sideHeight, topHeight, up);
  vec3 tint = mix(sideTint, topTint, up);
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

const BUMP_STRENGTH = { floor: 0.035, sand: 0.05 };

export function applyBurrowSurface(material, kind, baseY) {
  material.defines = { ...(material.defines || {}), ...(kind === 'floor' ? { BURROW_FLOOR: '' } : {}) };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSurfaceBaseY = { value: baseY };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSurfaceWorld;\nvarying vec3 vSurfaceNormal;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvSurfaceWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvSurfaceNormal = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${SURFACE_NOISE}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\nfloat surfaceHeight;\ndiffuseColor.rgb *= surfaceTintAndHeight(surfaceHeight);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\nnormal = surfaceBump(normal, -vViewPosition, surfaceHeight, ${BUMP_STRENGTH[kind].toFixed(3)});`);
  };
  material.customProgramCacheKey = () => `burrow-surface-${kind}`;
  return material;
}
