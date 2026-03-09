import * as THREE from "three";

/**
 * Find `#include <name>` in the source and replace the entire line.
 */
function replaceInclude(source: string, name: string, replacement: string): string {
  const needle = `#include <${name}>`;
  const idx = source.indexOf(needle);
  if (idx < 0) return source;
  let start = idx;
  while (start > 0 && source[start - 1] !== "\n") start--;
  return source.substring(0, start) + replacement + "\n" + source.substring(idx + needle.length);
}

// Build the modified fragment shader once at module level
const stdFrag = THREE.ShaderLib.standard.fragmentShader;
let houseFragmentShader = replaceInclude(
  stdFrag,
  "common",
  /* glsl */ `
    uniform float uTime;
    uniform float uNightGrayBlend;
    #include <common>
  `,
);

houseFragmentShader = replaceInclude(
  houseFragmentShader,
  "emissivemap_fragment",
  /* glsl */ `
    #include <emissivemap_fragment>

    float timeNow = fract(uTime);

    // Sunset factor
    float sunsetFactor = 0.0;
    if (timeNow >= 0.42 && timeNow < 0.50) {
      sunsetFactor = (timeNow - 0.42) / 0.08;
    } else if (timeNow >= 0.50 && timeNow < 0.58) {
      sunsetFactor = 1.0 - (timeNow - 0.50) / 0.08;
    }

    // Night factor
    float nightFactor = 0.0;
    if (timeNow >= 0.50 && timeNow < 0.58) {
      nightFactor = (timeNow - 0.50) / 0.08;
    } else if (timeNow >= 0.58 && timeNow < 0.92) {
      nightFactor = 1.0;
    } else if (timeNow >= 0.92 && timeNow <= 1.0) {
      nightFactor = 1.0 - (timeNow - 0.92) / 0.08;
    }

    // Sunrise factor (mirrors sunset, peaks around 0.96/0.0)
    // Handles wrap-around: 0.92→0.96 ramp up, 0.96→1.0/0.0→0.04 ramp down
    float sunriseFactor = 0.0;
    if (timeNow >= 0.92 && timeNow < 0.96) {
      sunriseFactor = (timeNow - 0.92) / 0.04;
    } else if (timeNow >= 0.96) {
      sunriseFactor = 1.0 - (timeNow - 0.96) / 0.04;
    } else if (timeNow < 0.04) {
      sunriseFactor = 1.0 - timeNow / 0.04;
    }

    // diffuseColor already includes instanceColor from Three.js pipeline
    vec3 houseBase = diffuseColor.rgb;

    // Subtle sunset warmth
    vec3 tinted = mix(houseBase, houseBase * vec3(1.1, 0.93, 0.78), max(sunsetFactor, sunriseFactor) * 0.25);

    // Walls: blend toward building slate gray at night. Roofs: keep color.
    vec3 buildingGray = vec3(0.08, 0.08, 0.13);
    tinted = mix(tinted, buildingGray, nightFactor * uNightGrayBlend);

    // Shift from 80/20 emissive/diffuse toward 40/60 during sunset/sunrise+night
    // so houses respond to dimming scene lights
    float emissiveWeight = mix(0.8, 0.4, max(max(sunsetFactor, sunriseFactor), nightFactor));
    float diffuseWeight = 1.0 - emissiveWeight;

    // Sunset, sunrise + night dimming
    float sunsetDim = mix(1.0, 0.55, sunsetFactor);
    float sunriseDim = mix(1.0, 0.55, sunriseFactor);
    float nightDim = mix(1.0, 0.45, nightFactor);
    float totalDim = min(min(sunsetDim, sunriseDim), nightDim);

    diffuseColor.rgb = tinted * diffuseWeight * totalDim;
    totalEmissiveRadiance += tinted * emissiveWeight * totalDim;
  `,
);

/**
 * Creates a ShaderMaterial for houses based on the standard PBR shader.
 * @param nightGrayBlend 1.0 = blend to building gray at night (walls), 0.0 = keep color (roofs)
 */
export function createHouseMaterial(
  timeUniform: { value: number },
  roughness: number,
  nightGrayBlend: number = 1.0,
): THREE.ShaderMaterial {
  const std = THREE.ShaderLib.standard;

  const uniforms = THREE.UniformsUtils.clone(std.uniforms);
  uniforms.uTime = timeUniform;
  uniforms.uNightGrayBlend = { value: nightGrayBlend };
  uniforms.roughness.value = roughness;
  uniforms.metalness.value = 0.0;

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: std.vertexShader,
    fragmentShader: houseFragmentShader,
    lights: true,
    fog: true,
    defines: { STANDARD: "", USE_INSTANCING_COLOR: "" },
  });

  (material as unknown as Record<string, boolean>).isMeshStandardMaterial = true;

  return material;
}
