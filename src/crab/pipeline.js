import * as THREE from 'three';
import { FOG_GLSL } from './fog.js';

const FULLSCREEN_VERTEX_GLSL = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const COPY_FRAGMENT_GLSL = /* glsl */ `
uniform sampler2D tSource;
varying vec2 vUv;
void main() {
  gl_FragColor = vec4(texture2D(tSource, vUv).rgb, 1.0);
}
`;

const BLOOM_DOWN_FRAGMENT_GLSL = /* glsl */ `
uniform sampler2D tSource;
uniform vec2 uTexel;
uniform float uPrefilter;
varying vec2 vUv;
vec3 softened(vec3 color) {
  return color / (1.0 + max(color.r, max(color.g, color.b)) * uPrefilter);
}
void main() {
  vec3 center = softened(texture2D(tSource, vUv).rgb);
  vec3 corners = softened(texture2D(tSource, vUv + uTexel * vec2(-1.0, -1.0)).rgb) + softened(texture2D(tSource, vUv + uTexel * vec2(1.0, -1.0)).rgb)
    + softened(texture2D(tSource, vUv + uTexel * vec2(-1.0, 1.0)).rgb) + softened(texture2D(tSource, vUv + uTexel * vec2(1.0, 1.0)).rgb);
  gl_FragColor = vec4((center * 4.0 + corners) / 8.0, 1.0);
}
`;

const BLOOM_UP_FRAGMENT_GLSL = /* glsl */ `
uniform sampler2D tSource;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec3 sum = texture2D(tSource, vUv + uTexel * vec2(-1.0, 0.0)).rgb + texture2D(tSource, vUv + uTexel * vec2(1.0, 0.0)).rgb
    + texture2D(tSource, vUv + uTexel * vec2(0.0, -1.0)).rgb + texture2D(tSource, vUv + uTexel * vec2(0.0, 1.0)).rgb;
  sum += (texture2D(tSource, vUv + uTexel * vec2(-0.7, -0.7)).rgb + texture2D(tSource, vUv + uTexel * vec2(0.7, -0.7)).rgb
    + texture2D(tSource, vUv + uTexel * vec2(-0.7, 0.7)).rgb + texture2D(tSource, vUv + uTexel * vec2(0.7, 0.7)).rgb);
  gl_FragColor = vec4(sum / 8.0, 1.0);
}
`;

const FOCUS_GLSL = /* glsl */ `
uniform sampler2D tDepth;
uniform float uCameraNear;
uniform float uCameraFar;
uniform float uFocusDistance;
uniform float uFocusRange;
float viewDistance(vec2 uv) {
  float depth = texture2D(tDepth, uv).r;
  float ndc = depth * 2.0 - 1.0;
  return 2.0 * uCameraNear * uCameraFar / (uCameraFar + uCameraNear - ndc * (uCameraFar - uCameraNear));
}
float blurAmount(vec2 uv) {
  float offset = viewDistance(uv) - uFocusDistance;
  float range = offset > 0.0 ? uFocusRange * 1.6 : uFocusRange;
  return smoothstep(0.35, 1.0, abs(offset) / range);
}
`;

const DEPTH_BLUR_FRAGMENT_GLSL = /* glsl */ `
uniform sampler2D tSource;
uniform vec2 uTexel;
uniform float uMaxRadius;
varying vec2 vUv;
${FOCUS_GLSL}
void main() {
  float amount = blurAmount(vUv);
  vec2 radius = uTexel * uMaxRadius * amount;
  vec3 sum = texture2D(tSource, vUv).rgb;
  float weight = 1.0;
  for (int tap = 0; tap < 12; tap++) {
    float angle = float(tap) * 2.39996;
    float reach = sqrt((float(tap) + 0.5) / 12.0);
    vec2 sampleUv = vUv + vec2(cos(angle), sin(angle)) * reach * radius;
    float sampleWeight = 0.25 + blurAmount(sampleUv);
    sum += texture2D(tSource, sampleUv).rgb * sampleWeight;
    weight += sampleWeight;
  }
  gl_FragColor = vec4(sum / weight, amount);
}
`;

const FINAL_FRAGMENT_GLSL = /* glsl */ `
${FOG_GLSL}
uniform sampler2D tFinalDepth;
uniform mat4 uFinalInverseViewProjection;
uniform float uFogEnabled;
uniform sampler2D tSource;
uniform sampler2D tBlurred;
uniform sampler2D tBloom;
uniform float uBloomStrength;
uniform float uBloomNormalization;
uniform float uExposure;
uniform float uDepthOfField;
uniform float uTime;
varying vec2 vUv;
vec3 filmic(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
vec3 toDisplay(vec3 linear) {
  vec3 low = linear * 12.92;
  vec3 high = 1.055 * pow(linear, vec3(1.0 / 2.4)) - 0.055;
  return mix(low, high, step(vec3(0.0031308), linear));
}
void main() {
  vec3 color = texture2D(tSource, vUv).rgb;
  if (uDepthOfField > 0.0) {
    vec4 blurred = texture2D(tBlurred, vUv);
    color = mix(color, blurred.rgb, blurred.a * uDepthOfField);
  }
  color = mix(color, texture2D(tBloom, vUv).rgb * uBloomNormalization, uBloomStrength);
  color *= uExposure;
  vec2 fromCenter = vUv - 0.5;
  color *= 1.0 - dot(fromCenter, fromCenter) * 0.55;
  color = filmic(color);
  float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(luminance), color, 1.12);
  color = mix(color, color * color * (3.0 - 2.0 * color), 0.25);
  color *= mix(vec3(0.96, 0.98, 1.06), vec3(1.05, 1.0, 0.93), smoothstep(0.1, 0.7, luminance));
  if (uFogEnabled > 0.5) {
    float depth = texture2D(tFinalDepth, vUv).r;
    vec4 world = uFinalInverseViewProjection * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    color = applyFog(color, world.xz / world.w, uTime);
  }
  float grain = fract(sin(dot(gl_FragCoord.xy + fract(uTime) * 61.0, vec2(12.9898, 78.233))) * 43758.5453);
  gl_FragColor = vec4(toDisplay(clamp(color, 0.0, 1.0)) + (grain - 0.5) / 255.0, 1.0);
}
`;

function fullscreenMaterial(fragmentShader, uniforms, extra = {}) {
  return new THREE.ShaderMaterial({ uniforms, vertexShader: FULLSCREEN_VERTEX_GLSL, fragmentShader, depthTest: false, depthWrite: false, ...extra });
}

export function createPipeline(renderer, quality) {
  const fullscreenTriangle = new THREE.BufferGeometry();
  fullscreenTriangle.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const passCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const passScene = new THREE.Scene();
  const passMesh = new THREE.Mesh(fullscreenTriangle, null);
  passMesh.frustumCulled = false;
  passScene.add(passMesh);

  const targetOptions = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
  const sceneTarget = new THREE.WebGLRenderTarget(4, 4, { ...targetOptions, depthBuffer: true, samples: quality.multisamples });
  sceneTarget.depthTexture = new THREE.DepthTexture(4, 4, THREE.UnsignedIntType);
  const compositeTarget = new THREE.WebGLRenderTarget(4, 4, targetOptions);
  const blurTarget = new THREE.WebGLRenderTarget(4, 4, targetOptions);
  const bloomTargets = Array.from({ length: quality.bloomLevels }, () => new THREE.WebGLRenderTarget(4, 4, targetOptions));

  const overlayScene = new THREE.Scene();
  const copyMesh = new THREE.Mesh(fullscreenTriangle, fullscreenMaterial(COPY_FRAGMENT_GLSL, { tSource: { value: sceneTarget.texture } }));
  copyMesh.frustumCulled = false;
  copyMesh.renderOrder = 0;
  copyMesh.layers.enableAll();
  overlayScene.add(copyMesh);

  const bloomDownMaterial = fullscreenMaterial(BLOOM_DOWN_FRAGMENT_GLSL, { tSource: { value: null }, uTexel: { value: new THREE.Vector2() }, uPrefilter: { value: 0 } });
  const bloomUpMaterial = fullscreenMaterial(BLOOM_UP_FRAGMENT_GLSL, { tSource: { value: null }, uTexel: { value: new THREE.Vector2() } }, { blending: THREE.AdditiveBlending, transparent: true });
  const focusUniforms = { tDepth: { value: sceneTarget.depthTexture }, uCameraNear: { value: 1 }, uCameraFar: { value: 1000 }, uFocusDistance: { value: 40 }, uFocusRange: { value: 30 } };
  const depthBlurMaterial = fullscreenMaterial(DEPTH_BLUR_FRAGMENT_GLSL, { ...focusUniforms, tSource: { value: compositeTarget.texture }, uTexel: { value: new THREE.Vector2() }, uMaxRadius: { value: 5.5 } });
  const finalMaterial = fullscreenMaterial(FINAL_FRAGMENT_GLSL, {
    tSource: { value: compositeTarget.texture },
    tBlurred: { value: blurTarget.texture },
    tBloom: { value: bloomTargets[0].texture },
    uBloomStrength: { value: 0.1 },
    uBloomNormalization: { value: 1 / quality.bloomLevels },
    uExposure: { value: 0.82 },
    uDepthOfField: { value: quality.depthOfField ? 1 : 0 },
    uTime: { value: 0 },
    tFinalDepth: { value: sceneTarget.depthTexture },
    uFinalInverseViewProjection: { value: new THREE.Matrix4() },
    uFogEnabled: { value: 0 },
    tFog: { value: null },
    uFogMin: { value: new THREE.Vector2(-1, -1) },
    uFogExtent: { value: new THREE.Vector2(2, 2) },
    uFogTexel: { value: new THREE.Vector2(1, 1) },
  });

  const drawingSize = new THREE.Vector2();
  const overlayUniforms = {
    tScene: { value: sceneTarget.texture },
    tDepth: { value: sceneTarget.depthTexture },
    uInverseResolution: { value: new THREE.Vector2(1, 1) },
    uInverseViewProjection: { value: new THREE.Matrix4() },
  };

  function resize() {
    renderer.getDrawingBufferSize(drawingSize);
    const width = Math.max(4, drawingSize.x);
    const height = Math.max(4, drawingSize.y);
    sceneTarget.setSize(width, height);
    compositeTarget.setSize(width, height);
    blurTarget.setSize(Math.ceil(width / 2), Math.ceil(height / 2));
    bloomTargets.forEach((target, level) => target.setSize(Math.max(2, Math.ceil(width / 2 ** (level + 1))), Math.max(2, Math.ceil(height / 2 ** (level + 1)))));
  }

  function runPass(material, target) {
    passMesh.material = material;
    renderer.setRenderTarget(target);
    renderer.render(passScene, passCamera);
  }

  function render(scene, camera, { focusDistance, time }) {
    renderer.setRenderTarget(sceneTarget);
    renderer.clear();
    renderer.render(scene, camera);

    overlayUniforms.uInverseResolution.value.set(1 / sceneTarget.width, 1 / sceneTarget.height);
    overlayUniforms.uInverseViewProjection.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).invert();
    renderer.setRenderTarget(compositeTarget);
    renderer.render(overlayScene, camera);

    if (quality.depthOfField) {
      focusUniforms.uCameraNear.value = camera.near;
      focusUniforms.uCameraFar.value = camera.far;
      focusUniforms.uFocusDistance.value = focusDistance;
      focusUniforms.uFocusRange.value = (focusDistance * 0.5) / Math.min(1, camera.aspect * camera.aspect + 0.12);
      depthBlurMaterial.uniforms.uTexel.value.set(1 / blurTarget.width, 1 / blurTarget.height);
      runPass(depthBlurMaterial, blurTarget);
    }

    let source = compositeTarget;
    for (let level = 0; level < bloomTargets.length; level++) {
      bloomDownMaterial.uniforms.tSource.value = source.texture;
      bloomDownMaterial.uniforms.uTexel.value.set(1 / source.width, 1 / source.height);
      bloomDownMaterial.uniforms.uPrefilter.value = level === 0 ? 0.12 : 0;
      runPass(bloomDownMaterial, bloomTargets[level]);
      source = bloomTargets[level];
    }
    renderer.autoClear = false;
    for (let level = bloomTargets.length - 1; level > 0; level--) {
      bloomUpMaterial.uniforms.tSource.value = bloomTargets[level].texture;
      bloomUpMaterial.uniforms.uTexel.value.set(1 / bloomTargets[level].width, 1 / bloomTargets[level].height);
      runPass(bloomUpMaterial, bloomTargets[level - 1]);
    }
    renderer.autoClear = true;

    finalMaterial.uniforms.uTime.value = time;
    finalMaterial.uniforms.uFinalInverseViewProjection.value.copy(overlayUniforms.uInverseViewProjection.value);
    runPass(finalMaterial, null);
  }

  function attachFog(fogUniforms) {
    for (const [name, uniform] of Object.entries(fogUniforms)) finalMaterial.uniforms[name].value = uniform.value;
  }

  function setFogEnabled(enabled) {
    finalMaterial.uniforms.uFogEnabled.value = enabled && finalMaterial.uniforms.tFog.value ? 1 : 0;
  }

  return { render, resize, overlayScene, overlayUniforms, finalMaterial, sceneTarget, attachFog, setFogEnabled };
}
