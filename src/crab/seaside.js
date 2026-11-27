import * as THREE from 'three';
import { WORLD_BOUNDS, boundsWidth, boundsDepth } from './worldBounds.js';

export const lighting = {
  sunDirection: new THREE.Vector3(-0.42, 0.6, 0.68).normalize(),
  sunColor: new THREE.Color(1.0, 0.86, 0.66),
  horizonColor: new THREE.Color(0.74, 0.78, 0.8),
  zenithColor: new THREE.Color(0.24, 0.46, 0.78),
  hazeColor: new THREE.Color(0.62, 0.72, 0.8),
  hazeDensity: 0.0015,
};

export const seaUniforms = {
  uSeaLevel: { value: 0 },
  uWetLevel: { value: 0 },
  uTime: { value: 0 },
  uNoise: { value: null },
  uRetained: { value: null },
  uTideFlow: { value: 0 },
  uWorldMin: { value: new THREE.Vector2(WORLD_BOUNDS.minX, WORLD_BOUNDS.minZ) },
  uWorldExtent: { value: new THREE.Vector2(boundsWidth(WORLD_BOUNDS), boundsDepth(WORLD_BOUNDS)) },
  uSunDirection: { value: lighting.sunDirection },
  uSunColor: { value: lighting.sunColor },
  uHorizonColor: { value: lighting.horizonColor },
  uZenithColor: { value: lighting.zenithColor },
  uCrabPosition: { value: new THREE.Vector3(0, -1000, 0) },
};

export const SEA_LEVELS_GLSL = /* glsl */ `
uniform float uSeaLevel;
uniform float uWetLevel;
uniform float uTideFlow;
uniform float uTime;
uniform sampler2D uNoise;
uniform sampler2D uRetained;
uniform vec2 uWorldMin;
uniform vec2 uWorldExtent;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform vec3 uHorizonColor;
uniform vec3 uZenithColor;

vec2 retainedUv(vec2 xz) {
  return (xz - uWorldMin) / uWorldExtent;
}
float retainedLevel(vec2 xz) {
  return texture2D(uRetained, retainedUv(xz)).r;
}
float waterLevelAt(vec2 xz) {
  return max(uSeaLevel, retainedLevel(xz));
}
vec3 skyColor(vec3 direction) {
  float height = clamp(direction.y, 0.0, 1.0);
  vec3 color = mix(uHorizonColor, uZenithColor, pow(height, 0.5));
  float towardSun = max(dot(direction, uSunDirection), 0.0);
  return color + uSunColor * (pow(towardSun, 48.0) * 0.5 + pow(towardSun, 6.0) * 0.12);
}
`;

export const SEA_COMMON_GLSL = /* glsl */ `
${SEA_LEVELS_GLSL}
float causticLines(vec2 point) {
  vec2 drift = (texture2D(uNoise, point * 0.019 + uTime * 0.009).rg - 0.5) * 0.14;
  float first = texture2D(uNoise, point * 0.047 + drift + vec2(uTime * 0.011, uTime * 0.006), 1.2).r;
  float second = texture2D(uNoise, point * 0.066 - drift + vec2(-uTime * 0.008, uTime * 0.01) + 0.37, 1.2).g;
  float ridgeA = clamp(1.0 - abs(first - 0.5) * 9.0, 0.0, 1.0);
  float ridgeB = clamp(1.0 - abs(second - 0.5) * 9.0, 0.0, 1.0);
  return ridgeA * ridgeA * 0.55 + ridgeB * ridgeB * 0.4 + ridgeA * ridgeB * 0.9;
}
`;

const VERTEX_WORLD_GLSL = /* glsl */ `
#include <project_vertex>
vec4 seaWorldPosition = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  seaWorldPosition = instanceMatrix * seaWorldPosition;
#endif
vSeaWorld = (modelMatrix * seaWorldPosition).xyz;
`;

const WET_COLOR_GLSL = /* glsl */ `
#include <color_fragment>
vec3 seaPool = texture2D(uRetained, retainedUv(vSeaWorld.xz)).rgb;
float seaDepth = max(uSeaLevel, seaPool.r) - vSeaWorld.y;
float seaWetEdge = (texture2D(uNoise, vSeaWorld.xz * 0.027).r - 0.5) * 0.9;
float seaPoolWeight = smoothstep(0.22, 0.5, seaPool.g);
float seaWetLine = mix(uWetLevel, max(uWetLevel, seaPool.b + 0.3), seaPoolWeight);
float seaAboveWater = vSeaWorld.y - mix(uSeaLevel, max(uSeaLevel, seaPool.b), seaPoolWeight);
float seaWet = 1.0 - smoothstep(0.0, 0.55, vSeaWorld.y - seaWetLine - seaWetEdge);
#ifdef SEA_BODY_WETNESS
  float seaBelowWetTop = uBodyWetTop - vSeaWorld.y;
  float seaTideLine = smoothstep(0.0, 0.03, seaBelowWetTop) * (1.0 - smoothstep(0.07, 0.16, seaBelowWetTop));
  seaWet = max(step(0.0, seaDepth), uBodyWetness * (smoothstep(-0.03, 0.03, seaBelowWetTop) + 0.7 * seaTideLine));
#endif
`;

const SAND_FUNCTIONS_GLSL = /* glsl */ `
const vec2 RIPPLE_DIRECTION = vec2(0.52, 2.7);
vec2 sandRippleSlope(vec2 point, float height) {
  float broad = texture2D(uNoise, point * 0.009).r;
  float bend = texture2D(uNoise, point * 0.037 + 0.2).g;
  float patches = smoothstep(0.42, 0.62, texture2D(uNoise, point * 0.017 + 0.6).g);
  float nearWater = 1.0 - smoothstep(-0.6, 1.6, height - uWetLevel);
  float phase = dot(point, RIPPLE_DIRECTION) + broad * 14.0 + bend * 3.0;
  return RIPPLE_DIRECTION * cos(phase) * 0.05 * mix(patches, 1.0, 0.25) * mix(0.5, 1.0, nearWater);
}
`;

const SAND_COLOR_GLSL = /* glsl */ `
vec2 sandPoint = vSeaWorld.xz;
float sandGrain = texture2D(uNoise, sandPoint * 0.83).a;
float sandFleck = texture2D(uNoise, sandPoint * 1.57 + 0.31).g;
float sandDrift = texture2D(uNoise, sandPoint * 0.021 + 0.4).r;
diffuseColor.rgb *= 0.9 + 0.16 * sandGrain;
diffuseColor.rgb *= 0.86 + 0.3 * sandDrift;
float sandShellFleck = smoothstep(0.86, 0.9, texture2D(uNoise, sandPoint * 0.47 + 0.13).a) * step(0.55, texture2D(uNoise, sandPoint * 0.033).g);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.86, 0.8), sandShellFleck * 0.7);
diffuseColor.rgb *= 1.0 - 0.2 * smoothstep(0.72, 0.8, sandFleck);
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.16, 1.1, 1.0), (1.0 - smoothstep(0.2, 0.24, sandFleck)) * 0.5);
float reefSurface = smoothstep(48.0, 60.0, sandPoint.y) * (1.0 - smoothstep(107.0, 113.0, sandPoint.y));
float reefPits = texture2D(uNoise, sandPoint * 0.29 + 0.7).r * 0.6 + texture2D(uNoise, sandPoint * 0.9 + 0.2).a * 0.4;
diffuseColor.rgb *= mix(1.0, 0.62 + 0.62 * reefPits, reefSurface);
`;

const SAND_NORMAL_GLSL = /* glsl */ `
#include <normal_fragment_maps>
{
  vec3 sandWorldNormal = inverseTransformDirection(normal, viewMatrix);
  vec2 rippleSlope = sandRippleSlope(vSeaWorld.xz, vSeaWorld.y) * (1.0 - 0.9 * reefSurface);
  sandWorldNormal = normalize(sandWorldNormal - vec3(rippleSlope.x, 0.0, rippleSlope.y));
  normal = normalize((viewMatrix * vec4(sandWorldNormal, 0.0)).xyz);
}
`;

const WET_ROUGHNESS_GLSL = /* glsl */ `
#include <roughnessmap_fragment>
#ifdef SEA_BODY_WETNESS
  float seaGloss = seaWet * (1.0 - smoothstep(-0.05, 0.25, seaDepth)) * WET_GLOSS;
#else
  float seaGloss = seaWet * (1.0 - smoothstep(-0.05, 0.25, seaDepth)) * (1.0 - smoothstep(0.05, 1.1, seaAboveWater)) * WET_GLOSS;
#endif
diffuseColor.rgb *= mix(1.0, WET_DARKENING, seaWet);
roughnessFactor = mix(roughnessFactor, WET_ROUGHNESS, seaGloss);
`;

const CAUSTICS_GLSL = /* glsl */ `
if (seaDepth > 0.0) {
  vec3 seaWorldNormal = inverseTransformDirection(normal, viewMatrix);
  vec2 causticPoint = vSeaWorld.xz - uSunDirection.xz * (seaDepth / max(uSunDirection.y, 0.25));
  #ifdef SEA_CHROMATIC_CAUSTICS
    vec3 caustic = vec3(causticLines(causticPoint + 0.03), causticLines(causticPoint), causticLines(causticPoint - 0.03));
  #else
    vec3 caustic = vec3(causticLines(causticPoint));
  #endif
  float causticReach = smoothstep(0.05, 0.9, seaDepth) * exp(-seaDepth * 0.16);
  float causticFacing = clamp(dot(seaWorldNormal, uSunDirection) * 1.4 + 0.15, 0.0, 1.0);
  outgoingLight *= exp(-vec3(0.05, 0.014, 0.01) * seaDepth);
  outgoingLight += diffuseColor.rgb * vec3(0.05, 0.2, 0.22) * smoothstep(0.0, 1.2, seaDepth);
  float causticVariation = 0.45 + 1.1 * texture2D(uNoise, causticPoint * 0.023 + uTime * 0.006).r;
  outgoingLight += diffuseColor.rgb * mix(uSunColor, vec3(1.0), 0.55) * caustic * (CAUSTIC_STRENGTH * causticReach * causticFacing * causticVariation);
}
#ifdef SEA_SAND
{
  vec3 sparkleView = normalize(vViewPosition);
  vec3 sparkleSun = normalize((viewMatrix * vec4(uSunDirection, 0.0)).xyz);
  float sparkleSeed = texture2D(uNoise, vSeaWorld.xz * 2.3).a * texture2D(uNoise, vSeaWorld.xz * 1.3 + 0.5).g;
  float sparkleAlign = pow(max(dot(reflect(-sparkleSun, normal), sparkleView), 0.0), 14.0);
  outgoingLight += uSunColor * smoothstep(0.52, 0.6, sparkleSeed) * sparkleAlign * 2.6 * (1.0 - smoothstep(-0.2, 0.2, seaDepth));
}
#endif
#ifdef SEA_BODY_WETNESS
{
  float wetAboveWater = seaWet * (1.0 - step(0.0, seaDepth));
  float wetRim = pow(1.0 - max(dot(normal, normalize(-vViewPosition)), 0.0), 5.0);
  outgoingLight += vec3(0.62, 0.72, 0.82) * wetRim * min(wetAboveWater, 1.0) * 0.05;
  vec3 wetSunView = normalize((viewMatrix * vec4(uSunDirection, 0.0)).xyz);
  float wetGlint = pow(max(dot(reflect(-wetSunView, normal), normalize(-vViewPosition)), 0.0), 36.0);
  outgoingLight += uSunColor * wetGlint * min(wetAboveWater, 1.0) * 3.5;
}
#endif
#ifdef SEA_GLOW
  #ifdef SEA_GLOW_PULSE
    outgoingLight += diffuseColor.rgb * SEA_GLOW * (0.5 + 1.1 * pow(0.5 + 0.5 * sin(uTime * 2.4), 2.0));
  #else
    outgoingLight += diffuseColor.rgb * SEA_GLOW;
  #endif
#endif
#include <opaque_fragment>
#ifdef SEA_SAND
  gl_FragColor.a = 0.0;
#endif
`;

const ROCK_FUNCTIONS_GLSL = /* glsl */ `
float rockRelief(vec2 sideways) {
  float lumps = texture2D(uNoise, sideways * 0.07).r;
  float pits = texture2D(uNoise, sideways * 0.41 + 0.3).g;
  float grit = texture2D(uNoise, sideways * 1.3 + 0.7).a;
  return lumps * 0.9 + pits * 0.3 + grit * 0.04;
}
`;

const ROCK_COLOR_GLSL = /* glsl */ `
vec2 rockPoint = vSeaWorld.xz + vSeaWorld.y * vec2(0.37, 0.61);
float rockMottle = texture2D(uNoise, rockPoint * 0.11).r;
float rockSpeckle = texture2D(uNoise, rockPoint * 0.9).a;
diffuseColor.rgb *= 0.9 + 0.2 * texture2D(uNoise, rockPoint * 1.3 + 0.7).a;
float rockStrata = texture2D(uNoise, rockPoint * 0.07 + vec2(vSeaWorld.y * 0.05, rockMottle * 0.3)).g;
diffuseColor.rgb *= 0.8 + 0.32 * rockMottle;
diffuseColor.rgb *= 0.82 + 0.36 * texture2D(uNoise, rockPoint * 0.031 + 0.2).g;
diffuseColor.rgb *= 0.95 + 0.1 * rockStrata;
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.7, 0.68, 0.56), smoothstep(0.8, 0.92, rockSpeckle) * 0.4);
`;

const ROCK_NORMAL_GLSL = /* glsl */ `
#include <normal_fragment_maps>
{
  vec2 reliefPoint = vSeaWorld.xz + vSeaWorld.y * vec2(0.37, 0.61);
  float reliefHere = rockRelief(reliefPoint);
  vec2 reliefSlope = vec2(rockRelief(reliefPoint + vec2(0.05, 0.0)) - reliefHere, rockRelief(reliefPoint + vec2(0.0, 0.05)) - reliefHere) / 0.05;
  vec3 reliefGradient = vec3(reliefSlope.x, 0.37 * reliefSlope.x + 0.61 * reliefSlope.y, reliefSlope.y);
  vec3 rockWorldNormal = inverseTransformDirection(normal, viewMatrix);
  rockWorldNormal = normalize(rockWorldNormal - (reliefGradient - rockWorldNormal * dot(reliefGradient, rockWorldNormal)) * 0.36);
  normal = normalize((viewMatrix * vec4(rockWorldNormal, 0.0)).xyz);
}
`;

const SURFACES = {
  sand: { functions: SAND_FUNCTIONS_GLSL, color: SAND_COLOR_GLSL, normal: SAND_NORMAL_GLSL },
  rock: { functions: ROCK_FUNCTIONS_GLSL, color: ROCK_COLOR_GLSL, normal: ROCK_NORMAL_GLSL },
};

function injectVertexMotion(vertexShader, vertexMotion) {
  if (!vertexMotion) return vertexShader;
  return vertexShader
    .replace('#include <common>', `#include <common>\n${vertexMotion.declarations}`)
    .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${vertexMotion.normalCode || ''}`)
    .replace('#include <color_vertex>', `#include <color_vertex>\n${vertexMotion.colorCode || ''}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>\n${vertexMotion.code}`);
}

export function createMotionDepthMaterial(vertexMotion) {
  const material = new THREE.MeshDepthMaterial();
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, seaUniforms, vertexMotion.uniforms || {});
    shader.vertexShader = injectVertexMotion(shader.vertexShader, { ...vertexMotion, normalCode: '', colorCode: '' });
  };
  material.customProgramCacheKey = () => `seaside-depth|${vertexMotion.key}`;
  return material;
}

const GEAR_GLOW_PULSE_SPEED = 3.2;
const GEAR_GLOW_PULSE_DEPTH = 0.45;

export function createGearGlowUniforms() {
  return { uGearGlowColor: { value: new THREE.Color(1, 1, 1) }, uGearGlowGlow: { value: 0 }, uGearGlowRainbow: { value: 0 }, uGearGlowPhase: { value: 0 } };
}

const RAINBOW_CYCLE_SPEED = 0.18;

export function gearGlowColorAt(look, time, target, offset = 0) {
  if (look.rainbow) return target.setHSL((time * RAINBOW_CYCLE_SPEED + offset) % 1, 1, 0.5);
  return target.setRGB(look.color[0], look.color[1], look.color[2]);
}

export function updateGearGlowUniforms(uniforms, look, time) {
  const pulse = look.pulse ? 1 - GEAR_GLOW_PULSE_DEPTH * (0.5 + 0.5 * Math.sin(time * GEAR_GLOW_PULSE_SPEED)) : 1;
  gearGlowColorAt(look, time, uniforms.uGearGlowColor.value);
  uniforms.uGearGlowGlow.value = look.glow * pulse;
  uniforms.uGearGlowRainbow.value = look.rainbow ? 1 : 0;
  uniforms.uGearGlowPhase.value = (time * RAINBOW_CYCLE_SPEED) % 1;
}

const GEAR_GLOW_RIM_GLSL = /* glsl */ `
#include <emissivemap_fragment>
{
  vec3 gearGlowViewDirection = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(vViewPosition);
  float gearGlowRim = smoothstep(0.58, 0.97, 1.0 - abs(dot(normal, gearGlowViewDirection)));
  vec3 gearGlowColor = uGearGlowColor;
  if (uGearGlowRainbow > 0.5) {
    float gearGlowHue = fract(dot(vSeaWorld.xz, vec2(0.45, 0.3)) + vSeaWorld.y * 0.6 + uGearGlowPhase);
    gearGlowColor = clamp(abs(mod(gearGlowHue * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  }
  totalEmissiveRadiance += gearGlowColor * uGearGlowGlow * (0.04 + 2.2 * gearGlowRim);
}
`;

export const cutawayUniforms = { uCutPlayer: { value: new THREE.Vector3(0, -1000, 0) }, uCutCamera: { value: new THREE.Vector3(0, 0, 0) } };

const CUTAWAY_GLSL = /* glsl */ `
#include <clipping_planes_fragment>
vec3 cutRay = uCutPlayer - uCutCamera;
float cutLength = length(cutRay);
vec3 cutDirection = cutRay / max(cutLength, 0.001);
float cutAlong = dot(vSeaWorld - uCutCamera, cutDirection);
float cutAway = length(vSeaWorld - uCutCamera - cutDirection * cutAlong);
float cutRadius = 3.4 + 0.1 * max(0.0, cutLength - cutAlong);
if (cutAlong < cutLength - 1.2 && cutAway < cutRadius && vSeaWorld.y > uCutPlayer.y - 0.6) {
  float checker = mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0);
#ifdef SEA_SOFT_CUTAWAY
  if (checker < 0.5) discard;
#else
  if (checker < 0.5 || cutAway < cutRadius * 0.7 || cutAlong < cutLength * 0.5) discard;
#endif
}
#ifndef SEA_RAY_CUTAWAY
if (cutAlong < cutLength * 0.62 && vSeaWorld.y > uCutPlayer.y + 2.0) {
  float checker = mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0);
  if (checker < 0.5 || cutAlong < cutLength * 0.52) discard;
}
#endif
`;

export function applySeaside(material, { cutaway = false, surface = null, wetDarkening = 0.62, wetRoughness = 0.22, wetGloss = 1, causticStrength = 1.5, chromaticCaustics = true, glow = 0, glowPulse = false, vertexMotion = null, bodyWetness = null, instanceFlash = false, gearGlow = null } = {}) {
  const surfaceCode = surface ? SURFACES[surface] : null;
  material.defines = { ...(material.defines || {}), WET_DARKENING: wetDarkening.toFixed(3), WET_ROUGHNESS: wetRoughness.toFixed(3), CAUSTIC_STRENGTH: causticStrength.toFixed(3), WET_GLOSS: wetGloss.toFixed(3) };
  if (surface === 'sand') material.defines.SEA_SAND = '';
  if (chromaticCaustics) material.defines.SEA_CHROMATIC_CAUSTICS = '';
  if (glow > 0) material.defines.SEA_GLOW = glow.toFixed(3);
  if (glowPulse) material.defines.SEA_GLOW_PULSE = '';
  if (bodyWetness) material.defines.SEA_BODY_WETNESS = '';
  if (cutaway === 'soft' || cutaway === 'ray') material.defines.SEA_SOFT_CUTAWAY = '';
  if (cutaway === 'ray') material.defines.SEA_RAY_CUTAWAY = '';
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, seaUniforms, vertexMotion ? vertexMotion.uniforms || {} : {}, bodyWetness || {}, gearGlow || {});
    shader.vertexShader = injectVertexMotion(shader.vertexShader.replace('#include <project_vertex>', VERTEX_WORLD_GLSL), vertexMotion)
      .replace('#include <common>', '#include <common>\nvarying vec3 vSeaWorld;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vSeaWorld;\n${bodyWetness ? 'uniform float uBodyWetness;\nuniform float uBodyWetTop;\n' : ''}${SEA_COMMON_GLSL}${surfaceCode ? surfaceCode.functions : ''}`)
      .replace('#include <color_fragment>', WET_COLOR_GLSL + (surfaceCode ? surfaceCode.color : ''))
      .replace('#include <roughnessmap_fragment>', WET_ROUGHNESS_GLSL)
      .replace('#include <opaque_fragment>', CAUSTICS_GLSL);
    if (surfaceCode) shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', surfaceCode.normal);
    if (gearGlow) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uGearGlowColor;\nuniform float uGearGlowGlow;\nuniform float uGearGlowRainbow;\nuniform float uGearGlowPhase;')
        .replace('#include <emissivemap_fragment>', GEAR_GLOW_RIM_GLSL);
    }
    if (cutaway) {
      Object.assign(shader.uniforms, cutawayUniforms);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uCutPlayer;\nuniform vec3 uCutCamera;')
        .replace('#include <clipping_planes_fragment>', CUTAWAY_GLSL);
    }
    if (instanceFlash) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aFlash;\nvarying float vFlash;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlash = aFlash;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vFlash;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.9, 0.82) * vFlash;');
    }
  };
  material.customProgramCacheKey = () => `seaside|${surface}|${vertexMotion ? vertexMotion.key : ''}|${bodyWetness ? 'body-wet' : ''}|${instanceFlash ? 'flash' : ''}|${gearGlow ? 'gearGlow' : ''}|${cutaway ? `cutaway-${cutaway}` : ''}`;
  return material;
}
