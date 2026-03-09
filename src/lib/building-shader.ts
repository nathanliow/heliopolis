import * as THREE from "three";

/**
 * Find `#include <name>` in the source (with any leading whitespace) and replace
 * the entire line with the replacement string.
 */
function replaceInclude(source: string, name: string, replacement: string): string {
  const needle = `#include <${name}>`;
  const idx = source.indexOf(needle);
  if (idx < 0) return source;
  let start = idx;
  while (start > 0 && source[start - 1] !== "\n") start--;
  return source.substring(0, start) + replacement + "\n" + source.substring(idx + needle.length);
}

/**
 * Creates a ShaderMaterial based on Three.js's standard (PBR) shader with
 * procedural window logic baked in. Uses ShaderMaterial directly instead of
 * onBeforeCompile to avoid program cache invalidation issues.
 */
export function createBuildingMaterial(
  timeUniform: { value: number },
): THREE.ShaderMaterial {
  const std = THREE.ShaderLib.standard;

  // Start from the standard PBR shader source
  let vertexShader = std.vertexShader;
  let fragmentShader = std.fragmentShader;

  // --- Vertex modifications ---
  vertexShader = replaceInclude(
    vertexShader,
    "common",
    /* glsl */ `
      attribute vec3 instanceBuildingColor;
      attribute float instanceWindowCols;
      attribute float instanceFillRatio;
      attribute float instanceLitRatio;
      attribute float instanceSeed;
      attribute float instanceFloors;
      attribute float instanceHighlight;
      varying vec3 vBuildingColor;
      varying float vWindowCols, vFillRatio, vLitRatio, vSeed, vFloors;
      varying float vHighlight;
      varying vec3 vModelNormal;
      varying vec2 vFaceUV;
      #include <common>
    `,
  );

  vertexShader = replaceInclude(
    vertexShader,
    "begin_vertex",
    /* glsl */ `
      #include <begin_vertex>
      vBuildingColor = instanceBuildingColor;
      vHighlight = instanceHighlight;
      vWindowCols = instanceWindowCols;
      vFillRatio = instanceFillRatio;
      vLitRatio = instanceLitRatio;
      vSeed = instanceSeed;
      vFloors = instanceFloors;
      vModelNormal = normal;
      if (abs(normal.x) > 0.5) {
        vFaceUV = vec2(position.z + 0.5, position.y + 0.5);
      } else {
        vFaceUV = vec2(position.x + 0.5, position.y + 0.5);
      }
    `,
  );

  // --- Fragment modifications ---
  fragmentShader = replaceInclude(
    fragmentShader,
    "common",
    /* glsl */ `
      uniform float uTime;
      varying vec3 vBuildingColor;
      varying float vWindowCols, vFillRatio, vLitRatio, vSeed, vFloors;
      varying float vHighlight;
      varying vec3 vModelNormal;
      varying vec2 vFaceUV;
      #include <common>
    `,
  );

  fragmentShader = replaceInclude(
    fragmentShader,
    "emissivemap_fragment",
    /* glsl */ `
      #include <emissivemap_fragment>

      // Time-of-day
      float timeNow = fract(uTime);

      // Sunset factor: peaks at t=0.50
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

      // Base building color
      vec3 baseColor = vBuildingColor;
      vec3 sunsetTint = mix(baseColor, baseColor * vec3(1.2, 0.95, 0.75), sunsetFactor * 0.4);

      // Night: darken overall output
      float nightDim = mix(1.0, 0.45, nightFactor);

      // 80% emissive / 20% diffuse, dimmed at night
      diffuseColor.rgb = sunsetTint * 0.2 * nightDim;
      totalEmissiveRadiance += sunsetTint * 0.8 * nightDim;

      // Hover highlight: subtle additive glow that preserves base color
      totalEmissiveRadiance += vec3(0.02, 0.02, 0.035) * vHighlight;

      // --- Window logic (side faces only) ---
      if (abs(vModelNormal.y) < 0.5) {
        // Unique face index (0-3) so each side has different patterns
        float faceId = 0.0;
        if (vModelNormal.x > 0.5) faceId = 1.0;
        else if (vModelNormal.x < -0.5) faceId = 2.0;
        else if (vModelNormal.z > 0.5) faceId = 3.0;

        float cols = vWindowCols;
        float rows = vFloors;

        if (cols > 0.5 && rows > 0.5) {
          float cellU = fract(vFaceUV.x * cols);
          float cellV = fract(vFaceUV.y * rows);
          bool inWindowSlot = cellU > 0.2 && cellU < 0.8 && cellV > 0.2 && cellV < 0.8;

          if (inWindowSlot) {
            float colIdx = floor(vFaceUV.x * cols);
            float rowIdx = floor(vFaceUV.y * rows);

            // Hash 1: does window exist? (faceId makes each side unique)
            float h1 = fract(sin(colIdx * 127.1 + rowIdx * 311.7 + vSeed * 758.5 + faceId * 1731.3) * 43758.5453);
            bool hasWindow = h1 < vFillRatio;

            if (hasWindow) {
              // Hash 2: is window lit? (60% of total across all 4 faces)
              float h2 = fract(sin(colIdx * 53.3 + rowIdx * 419.2 + vSeed * 317.9 + faceId * 2137.7) * 29187.3217);
              bool isLit = h2 < vLitRatio;

              if (isLit && nightFactor > 0.0) {
                totalEmissiveRadiance += vec3(0.8, 0.65, 0.3) * nightFactor * 1.2;
              } else if (!isLit && nightFactor > 0.0) {
                totalEmissiveRadiance *= 0.5;
                diffuseColor.rgb *= 0.4;
              } else {
                totalEmissiveRadiance *= 0.8;
                diffuseColor.rgb *= 0.7;
              }
            }
            // !hasWindow -> normal wall, no modification
          }
        }
      }
    `,
  );

  const uniforms = THREE.UniformsUtils.clone(std.uniforms);
  uniforms.uTime = timeUniform; // direct reference, not cloned
  uniforms.roughness.value = 0.85;
  uniforms.metalness.value = 0.05;

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    lights: true,
    fog: true,
    defines: { STANDARD: "" },
  });

  // Tell Three.js this behaves like a standard material for rendering purposes
  // (enables correct light uniform binding)
  (material as unknown as Record<string, boolean>).isMeshStandardMaterial = true;

  return material;
}
