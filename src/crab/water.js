import * as THREE from 'three';
import { seaUniforms, SEA_COMMON_GLSL, SEA_LEVELS_GLSL, lighting } from './seaside.js';
import { RIPPLE_LIFETIME_SECONDS } from './ripples.js';

const NEAR_HALF_SIZE = 190;
const NEAR_SEGMENTS = 176;
const FAR_HALF_SIZE = 2600;

const WATER_VERTEX_GLSL = /* glsl */ `
${SEA_LEVELS_GLSL}
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  world.y = waterLevelAt(world.xz);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const WATER_FRAGMENT_GLSL = /* glsl */ `
${SEA_COMMON_GLSL}
uniform sampler2D tScene;
uniform sampler2D tDepth;
uniform sampler2D uWaveGradient;
uniform vec2 uInverseResolution;
uniform mat4 uInverseViewProjection;
uniform vec3 uAbsorption;
uniform vec3 uScatterColor;
const vec3 DEEP_SCATTER_COLOR = vec3(0.012, 0.11, 0.2);
uniform vec3 uHazeColor;
uniform float uHazeDensity;
uniform vec4 uRipples[RIPPLE_COUNT];
uniform vec4 uWader;
varying vec3 vWorld;

const float RIPPLE_SPEED = 2.0;
const float RIPPLE_START_RADIUS = 0.3;
const float RIPPLE_WIDTH = 0.28;
const float RIPPLE_AMPLITUDE = 0.045;

vec3 rippleSlopeAndCrest(vec2 point) {
  vec3 total = vec3(0.0);
  for (int index = 0; index < RIPPLE_COUNT; index++) {
    vec4 ripple = uRipples[index];
    float age = uTime - ripple.z;
    if (ripple.w <= 0.0 || age < 0.0 || age > RIPPLE_LIFETIME) continue;
    vec2 offset = point - ripple.xy;
    float distanceFromCenter = length(offset);
    float radius = RIPPLE_SPEED * age + RIPPLE_START_RADIUS;
    float across = (distanceFromCenter - radius) / RIPPLE_WIDTH;
    if (abs(across) > 3.0) continue;
    float lifeLeft = 1.0 - age / RIPPLE_LIFETIME;
    float amplitude = RIPPLE_AMPLITUDE * ripple.w * lifeLeft * lifeLeft / (1.0 + 0.45 * radius);
    float bell = exp(-across * across);
    float heightSlope = amplitude * (2.0 * across * across - 1.0) * bell / RIPPLE_WIDTH;
    total.xy += offset / max(distanceFromCenter, 0.001) * heightSlope;
    total.z += max(0.0, -across) * bell * amplitude * 2.3 / RIPPLE_AMPLITUDE;
  }
  return total;
}

vec3 worldFromDepth(vec2 uv, float depth) {
  vec4 world = uInverseViewProjection * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  return world.xyz / world.w;
}

void main() {
  vec2 uv = gl_FragCoord.xy * uInverseResolution;
  float sceneDepth = texture2D(tDepth, uv).r;
  if (sceneDepth < gl_FragCoord.z) discard;

  vec3 toSurface = vWorld - cameraPosition;
  float surfaceDistance = length(toSurface);
  vec3 viewDirection = toSurface / surfaceDistance;
  vec3 directFloor = worldFromDepth(uv, sceneDepth);
  float directDepth = vWorld.y - directFloor.y;

  vec2 point = vWorld.xz;
  vec4 swellA = texture2D(uWaveGradient, point * 0.0105 + vec2(uTime * 0.006, uTime * 0.0035));
  vec4 swellB = texture2D(uWaveGradient, point * 0.0173 + vec2(-uTime * 0.0045, uTime * 0.0052) + 0.41);
  vec2 slope = (swellA.rg - 0.5) * 0.3 + (swellB.rg - 0.5) * 0.22 + (swellA.ba - 0.5) * 0.2 + (swellB.ba - 0.5) * 0.16;
  float calmNearShore = smoothstep(0.0, 1.6, directDepth);
  float inPool = smoothstep(0.08, 0.3, texture2D(uRetained, retainedUv(point)).g) * step(uSeaLevel, retainedLevel(point));
  slope *= mix(0.35, 1.0, calmNearShore) * mix(1.0, 0.55, inPool);
  vec3 ripple = rippleSlopeAndCrest(point);
  slope += ripple.xy;
  vec3 normal = normalize(vec3(-slope.x, 1.0, -slope.y));

  vec2 edgeFade = smoothstep(vec2(0.0), vec2(0.04), uv) * (1.0 - smoothstep(vec2(0.96), vec2(1.0), uv));
  vec2 refractedUv = uv + slope * (0.07 * calmNearShore * edgeFade.x * edgeFade.y) * min(1.0, 26.0 / surfaceDistance);
  float refractedDepth = texture2D(tDepth, refractedUv).r;
  if (refractedDepth < gl_FragCoord.z) {
    refractedUv = uv;
    refractedDepth = sceneDepth;
  }
  vec3 floorPosition = worldFromDepth(refractedUv, refractedDepth);
  float pathLength = min(distance(floorPosition, vWorld), 60.0);
  vec3 floorColor = texture2D(tScene, refractedUv).rgb;

  vec3 transmitted = floorColor * exp(-uAbsorption * pathLength);
  float nearWader = uWader.w * (1.0 - smoothstep(uWader.z, uWader.z * 2.2, distance(vWorld.xz, uWader.xy)));
  float turbidity = 1.0 - exp(-pathLength * (mix(0.05, 0.022, inPool) + 0.18 * nearWader));
  float openWaterDepth = smoothstep(5.0, 20.0, pathLength) * (1.0 - inPool);
  vec3 underwater = transmitted + mix(uScatterColor, DEEP_SCATTER_COLOR, openWaterDepth) * turbidity;

  vec4 sparkleA = texture2D(uWaveGradient, point * 0.071 + vec2(uTime * 0.021, -uTime * 0.014));
  vec4 sparkleB = texture2D(uWaveGradient, point * 0.113 + vec2(-uTime * 0.017, uTime * 0.023) + 0.27);
  vec2 sparkleSlope = slope + ripple.xy * 0.5 + ((sparkleA.ba - 0.5) * 0.17 + (sparkleB.ba - 0.5) * 0.12) * mix(0.5, 1.0, calmNearShore);
  vec4 sparkleC = texture2D(uWaveGradient, point * 0.29 + vec2(uTime * 0.03, uTime * 0.019) + 0.61);
  sparkleSlope += (sparkleC.ba - 0.5) * 0.2 * mix(0.4, 1.0, calmNearShore);
  vec3 sparkleNormal = normalize(vec3(-sparkleSlope.x, 1.0, -sparkleSlope.y));
  vec3 reflected = reflect(viewDirection, sparkleNormal);
  reflected.y = abs(reflected.y);
  float facing = max(dot(-viewDirection, normal), 0.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - facing, 5.0);
  float towardSun = max(dot(reflected, uSunDirection), 0.0);
  vec3 glitter = mix(uSunColor, vec3(1.0), 0.3) * min(pow(towardSun, 900.0) * 4.5 + pow(towardSun, 120.0) * 0.035, 0.8) * mix(0.3, 1.0, calmNearShore);
  vec3 color = mix(underwater, skyColor(reflected), fresnel) + glitter;
  color = mix(color, color * 1.12 + vec3(0.05), min(1.0, ripple.z) * 0.7);

  float waderLace = smoothstep(0.3, 0.6, texture2D(uNoise, point * 1.7 + vec2(uTime * 0.05, -uTime * 0.03)).g);
  float bodyContact = 1.0 - smoothstep(0.03, 0.15 + 0.08 * waderLace, directDepth);
  color = mix(color, vec3(1.0, 0.99, 0.95), bodyContact * nearWader * mix(0.45, 0.85, waderLace));

  float lapping = 0.5 + 0.5 * sin(uTime * 1.3 + point.x * 0.21 + point.y * 0.13);
  float foamLace = texture2D(uNoise, point * 0.055 + vec2(uTime * 0.012, -uTime * 0.008)).r * 0.65 + texture2D(uNoise, point * 0.16 - vec2(uTime * 0.01, uTime * 0.006)).g * 0.55;
  float foamReach = 0.1 + 0.16 * lapping;
  float foamBand = 1.0 - smoothstep(0.0, foamReach, directDepth);
  float sandFloor = 1.0 - texture2D(tScene, uv).a;
  float foam = foamBand * foamBand * smoothstep(0.5, 0.72, foamLace + 0.24 * foamBand) * (1.0 - inPool) * sandFloor * sandFloor;
  color = mix(color, vec3(1.02, 1.0, 0.96), min(1.0, foam) * 0.65);

  float channelFlow = texture2D(uRetained, retainedUv(point)).a;
  if (channelFlow > 0.01) {
    float drift = -uTime * uTideFlow;
    float streakA = texture2D(uNoise, vec2(point.x * 0.09, point.y * 0.03 + drift * 0.045)).r;
    float streakB = texture2D(uNoise, vec2(point.x * 0.17 + 0.3, point.y * 0.05 + drift * 0.08)).g;
    float streaks = smoothstep(0.62, 0.95, streakA * 0.6 + streakB * 0.55);
    float flowStrength = channelFlow * smoothstep(0.15, 0.6, abs(uTideFlow)) * smoothstep(0.4, 1.6, directDepth);
    color = mix(color, vec3(0.9, 0.96, 0.97), streaks * flowStrength * 0.14);
    color *= 1.0 - 0.16 * channelFlow * smoothstep(1.5, 4.5, directDepth);
  }

  float hazeReach = surfaceDistance * uHazeDensity;
  float haze = 1.0 - exp(-hazeReach * hazeReach);
  color = mix(color, uHazeColor, haze);

  float coverage = smoothstep(0.0, 0.05, directDepth);
  gl_FragColor = vec4(mix(texture2D(tScene, uv).rgb, color, coverage), 1.0);
}
`;

function buildSeaGeometry() {
  const near = new THREE.PlaneGeometry(NEAR_HALF_SIZE * 2, NEAR_HALF_SIZE * 2, NEAR_SEGMENTS, NEAR_SEGMENTS).rotateX(-Math.PI / 2);
  const positions = Array.from(near.attributes.position.array);
  const indices = Array.from(near.index.array);
  const corners = [
    [-NEAR_HALF_SIZE, -NEAR_HALF_SIZE], [NEAR_HALF_SIZE, -NEAR_HALF_SIZE], [NEAR_HALF_SIZE, NEAR_HALF_SIZE], [-NEAR_HALF_SIZE, NEAR_HALF_SIZE],
    [-FAR_HALF_SIZE, -FAR_HALF_SIZE], [FAR_HALF_SIZE, -FAR_HALF_SIZE], [FAR_HALF_SIZE, FAR_HALF_SIZE], [-FAR_HALF_SIZE, FAR_HALF_SIZE],
  ];
  const firstCorner = positions.length / 3;
  for (const [x, z] of corners) positions.push(x, 0, z);
  for (let side = 0; side < 4; side++) {
    const inner = firstCorner + side;
    const innerNext = firstCorner + ((side + 1) % 4);
    const outer = firstCorner + 4 + side;
    const outerNext = firstCorner + 4 + ((side + 1) % 4);
    indices.push(inner, innerNext, outer, innerNext, outerNext, outer);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}

export function createWater(waveGradientTexture, overlayUniforms, rippleCapacity) {
  const uniforms = {
    ...seaUniforms,
    ...overlayUniforms,
    uWaveGradient: { value: waveGradientTexture },
    uAbsorption: { value: new THREE.Vector3(0.17, 0.04, 0.03) },
    uScatterColor: { value: new THREE.Color(0.03, 0.34, 0.4) },
    uHazeColor: { value: lighting.hazeColor },
    uHazeDensity: { value: lighting.hazeDensity },
    uRipples: { value: Array.from({ length: rippleCapacity }, () => new THREE.Vector4(0, 0, -1000, 0)) },
    uWader: { value: new THREE.Vector4(0, 0, 0, 0) },
  };
  const defines = { RIPPLE_COUNT: rippleCapacity, RIPPLE_LIFETIME: RIPPLE_LIFETIME_SECONDS.toFixed(2) };
  const material = new THREE.ShaderMaterial({ uniforms, defines, vertexShader: WATER_VERTEX_GLSL, fragmentShader: WATER_FRAGMENT_GLSL, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(buildSeaGeometry(), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  const snapStep = (NEAR_HALF_SIZE * 2) / NEAR_SEGMENTS;
  function follow(x, z) {
    mesh.position.set(Math.round(x / snapStep) * snapStep, 0, Math.round(z / snapStep) * snapStep);
  }
  return { mesh, uniforms, follow };
}
