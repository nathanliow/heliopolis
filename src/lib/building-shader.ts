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
  elapsedUniform?: { value: number },
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
      uniform float uElapsed;
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

      // Night factor (scene darkness)
      float nightFactor = 0.0;
      if (timeNow >= 0.50 && timeNow < 0.58) {
        nightFactor = (timeNow - 0.50) / 0.08;
      } else if (timeNow >= 0.58 && timeNow < 0.92) {
        nightFactor = 1.0;
      } else if (timeNow >= 0.92 && timeNow <= 1.0) {
        nightFactor = 1.0 - (timeNow - 0.92) / 0.08;
      }

      // Window light factor — starts at sunset (~20%), full at night, ~20% at sunrise, off during day
      float windowFactor = 0.0;
      if (timeNow >= 0.42 && timeNow < 0.50) {
        // During sunset: ramp 0→0.2
        windowFactor = 0.2 * (timeNow - 0.42) / 0.08;
      } else if (timeNow >= 0.50 && timeNow < 0.58) {
        // Sunset→night: ramp 0.2→1.0
        windowFactor = 0.2 + 0.8 * (timeNow - 0.50) / 0.08;
      } else if (timeNow >= 0.58 && timeNow < 0.92) {
        // Full night
        windowFactor = 1.0;
      } else if (timeNow >= 0.92 && timeNow <= 1.0) {
        // Night→sunrise: ramp 1.0→0.2
        windowFactor = 0.2 + 0.8 * (1.0 - (timeNow - 0.92) / 0.08);
      } else if (timeNow >= 0.0 && timeNow < 0.08) {
        // During sunrise: ramp 0.2→0
        windowFactor = 0.2 * (1.0 - timeNow / 0.08);
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
              // Hash 2: per-window threshold for when it turns on/off
              float h2 = fract(sin(colIdx * 53.3 + rowIdx * 419.2 + vSeed * 317.9 + faceId * 2137.7) * 29187.3217);

              // Scale lit threshold by windowFactor so windows turn on/off gradually
              // h2 is uniform 0–1; window is lit when h2 < effectiveRatio
              // As windowFactor rises 0→1, more windows cross the threshold
              float effectiveLitRatio = vLitRatio * windowFactor;
              bool isLit = h2 < effectiveLitRatio;

              if (isLit) {
                // Per-window brightness & color variation
                float h3 = fract(sin(colIdx * 173.7 + rowIdx * 239.1 + vSeed * 491.3 + faceId * 863.5) * 15731.4219);
                float h4 = fract(sin(colIdx * 97.3 + rowIdx * 587.1 + vSeed * 163.7 + faceId * 1279.3) * 38147.2917);
                float h5 = fract(sin(colIdx * 211.9 + rowIdx * 349.3 + vSeed * 607.1 + faceId * 1013.7) * 21317.7631);
                float brightness = 0.3 + h3 * 1.0;              // 0.3–1.3 wide range

                // Distinct color categories: warm yellow, cool white, amber, blue-ish
                vec3 windowColor;
                if (h4 < 0.35) {
                  windowColor = vec3(0.9, 0.7, 0.28);           // warm yellow
                } else if (h4 < 0.55) {
                  windowColor = vec3(0.75, 0.72, 0.55);         // cool white / fluorescent
                } else if (h4 < 0.8) {
                  windowColor = vec3(0.95, 0.55, 0.18);         // deep amber
                } else {
                  windowColor = vec3(0.5, 0.6, 0.8);            // bluish TV glow
                }
                // Extra per-window jitter on top
                windowColor *= 0.85 + h5 * 0.3;

                // Slow pulsing — each window at its own speed & phase
                float pulseSpeed = 0.12 + h3 * 0.28;             // 0.12–0.4 Hz
                float pulsePhase = h5 * 6.2832;                 // 0–2π offset
                float pulse = 0.4 + 0.6 * sin(uElapsed * pulseSpeed + pulsePhase);
                brightness *= pulse;

                totalEmissiveRadiance += windowColor * windowFactor * 1.2 * brightness;
              } else if (windowFactor > 0.0) {
                // Dark (unlit) windows at night/twilight
                float h6 = fract(sin(colIdx * 211.9 + rowIdx * 349.3 + vSeed * 607.1 + faceId * 1013.7) * 21317.7631);
                float darkVar = 0.2 + h6 * 0.4;                 // 0.2–0.6 wider spread
                float darkMix = windowFactor;                    // fade dark effect in with night
                totalEmissiveRadiance *= mix(1.0, darkVar, darkMix);
                diffuseColor.rgb *= mix(1.0, darkVar, darkMix);
              } else {
                // Daytime window variation — glass tint
                float h7 = fract(sin(colIdx * 131.3 + rowIdx * 277.9 + vSeed * 523.7 + faceId * 947.1) * 18397.5143);
                float dayVar = 0.55 + h7 * 0.4;                 // 0.55–0.95
                totalEmissiveRadiance *= dayVar;
                diffuseColor.rgb *= dayVar;
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
  uniforms.uElapsed = elapsedUniform ?? { value: 0 };
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
