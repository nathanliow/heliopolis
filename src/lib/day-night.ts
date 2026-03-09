import * as THREE from "three";

// Full cycle duration in seconds (12 minutes: 5min day + 1min transitions + 5min night + 1min transitions)
export const CYCLE_DURATION = 720;

export interface DayNightState {
  skyColor: THREE.Color;
  fogColor: THREE.Color;
  fogNear: number;
  fogFar: number;
  ambientColor: THREE.Color;
  ambientIntensity: number;
  sunColor: THREE.Color;
  sunIntensity: number;
  sunPosition: THREE.Vector3;
  hemiSkyColor: THREE.Color;
  hemiGroundColor: THREE.Color;
  hemiIntensity: number;
  accentColor: THREE.Color;
  accentIntensity: number;
  starsOpacity: number;
}

interface Keyframe {
  time: number;
  sky: string;
  fog: string;
  fogNear: number;
  fogFar: number;
  ambCol: string;
  ambInt: number;
  sunCol: string;
  sunInt: number;
  hemiSky: string;
  hemiGnd: string;
  hemiInt: number;
  accCol: string;
  accInt: number;
  stars: number;
}

// Keyframes around the 0–1 cycle
// 0.00 = sunrise, 0.25 = noon, 0.50 = sunset, 0.75 = midnight
const KF: Keyframe[] = [
  {
    // Sunrise — warm orange horizon
    time: 0.0,
    sky: "#c06030",
    fog: "#804020",
    fogNear: 320,
    fogFar: 800,
    ambCol: "#ffa070",
    ambInt: 0.4,
    sunCol: "#ff8844",
    sunInt: 0.6,
    hemiSky: "#ff9966",
    hemiGnd: "#553322",
    hemiInt: 0.3,
    accCol: "#6366f1",
    accInt: 0.1,
    stars: 0.15,
  },
  {
    // Morning — blue sky emerging
    time: 0.08,
    sky: "#6cacdc",
    fog: "#7ab8e0",
    fogNear: 400,
    fogFar: 1120,
    ambCol: "#fff0e0",
    ambInt: 0.55,
    sunCol: "#fff0d0",
    sunInt: 0.9,
    hemiSky: "#87ceeb",
    hemiGnd: "#665533",
    hemiInt: 0.4,
    accCol: "#6366f1",
    accInt: 0.0,
    stars: 0.0,
  },
  {
    // Noon — bright clear sky
    time: 0.25,
    sky: "#87ceeb",
    fog: "#a0d8f0",
    fogNear: 480,
    fogFar: 1200,
    ambCol: "#ffffff",
    ambInt: 0.65,
    sunCol: "#fffae8",
    sunInt: 1.2,
    hemiSky: "#87ceeb",
    hemiGnd: "#806040",
    hemiInt: 0.5,
    accCol: "#6366f1",
    accInt: 0.0,
    stars: 0.0,
  },
  {
    // Late afternoon — warming sky
    time: 0.42,
    sky: "#6ca0d0",
    fog: "#7ab0d8",
    fogNear: 400,
    fogFar: 1120,
    ambCol: "#fff5e0",
    ambInt: 0.55,
    sunCol: "#ffe0a0",
    sunInt: 0.9,
    hemiSky: "#80b8d8",
    hemiGnd: "#665530",
    hemiInt: 0.4,
    accCol: "#6366f1",
    accInt: 0.0,
    stars: 0.0,
  },
  {
    // Sunset — warm golden hour, still well-lit
    time: 0.5,
    sky: "#d06030",
    fog: "#aa5535",
    fogNear: 400,
    fogFar: 1000,
    ambCol: "#ffaa70",
    ambInt: 0.65,
    sunCol: "#ff8040",
    sunInt: 0.8,
    hemiSky: "#ff8855",
    hemiGnd: "#886644",
    hemiInt: 0.5,
    accCol: "#ff6622",
    accInt: 0.2,
    stars: 0.05,
  },
  {
    // Dusk — purple twilight, still well visible
    time: 0.58,
    sky: "#1a1028",
    fog: "#1a1028",
    fogNear: 560,
    fogFar: 1280,
    ambCol: "#9988aa",
    ambInt: 0.5,
    sunCol: "#664455",
    sunInt: 0.15,
    hemiSky: "#443355",
    hemiGnd: "#202020",
    hemiInt: 0.35,
    accCol: "#6366f1",
    accInt: 1.0,
    stars: 0.7,
  },
  {
    // Midnight — well-lit night, everything clearly visible
    time: 0.75,
    sky: "#0e0e1e",
    fog: "#0e0e1e",
    fogNear: 640,
    fogFar: 1400,
    ambCol: "#bbbbee",
    ambInt: 1.0,
    sunCol: "#7777bb",
    sunInt: 0.4,
    hemiSky: "#666688",
    hemiGnd: "#404050",
    hemiInt: 0.8,
    accCol: "#6366f1",
    accInt: 2.0,
    stars: 1.0,
  },
  {
    // Pre-dawn — dim but visible
    time: 0.92,
    sky: "#180e20",
    fog: "#180e20",
    fogNear: 600,
    fogFar: 1320,
    ambCol: "#9988aa",
    ambInt: 0.55,
    sunCol: "#553344",
    sunInt: 0.1,
    hemiSky: "#3a2a44",
    hemiGnd: "#1e1e1e",
    hemiInt: 0.4,
    accCol: "#6366f1",
    accInt: 1.2,
    stars: 0.85,
  },
];

// Precompute THREE.Color objects for each keyframe
const COLORS = KF.map((k) => ({
  sky: new THREE.Color(k.sky),
  fog: new THREE.Color(k.fog),
  amb: new THREE.Color(k.ambCol),
  sun: new THREE.Color(k.sunCol),
  hemiSky: new THREE.Color(k.hemiSky),
  hemiGnd: new THREE.Color(k.hemiGnd),
  acc: new THREE.Color(k.accCol),
}));

// Reusable temp objects to avoid per-frame allocation
const _sky = new THREE.Color();
const _fog = new THREE.Color();
const _amb = new THREE.Color();
const _sun = new THREE.Color();
const _hSky = new THREE.Color();
const _hGnd = new THREE.Color();
const _acc = new THREE.Color();
const _sunPos = new THREE.Vector3();

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Lamp/headlight intensity curve: 0 during day, ramps up at dusk, full at night. */
export function lampIntensity(t: number): number {
  if (t >= 0.58 && t <= 0.95) return 1;
  if (t > 0.50 && t < 0.58) return (t - 0.50) / 0.08;
  if (t > 0.95) return 1 - (t - 0.95) / 0.05;
  if (t < 0.02) return 1 - t / 0.02;
  return 0;
}

export function getDayNightState(timeOfDay: number): DayNightState {
  const t = ((timeOfDay % 1) + 1) % 1;

  // Find the two keyframes surrounding the current time
  let afterIdx = KF.findIndex((k) => k.time > t);
  if (afterIdx === -1) afterIdx = 0; // wrap to first keyframe
  const beforeIdx = (afterIdx - 1 + KF.length) % KF.length;

  const before = KF[beforeIdx];
  const after = KF[afterIdx];
  const cB = COLORS[beforeIdx];
  const cA = COLORS[afterIdx];

  // Compute interpolation progress within this segment
  let progress: number;
  if (after.time > before.time) {
    progress = (t - before.time) / (after.time - before.time);
  } else {
    // Wrapping around (e.g. pre-dawn → sunrise)
    const segLen = 1 - before.time + after.time;
    progress =
      t >= before.time
        ? (t - before.time) / segLen
        : (1 - before.time + t) / segLen;
  }
  progress = smoothstep(progress);

  // Sun orbits: rises east (t=0), overhead (t=0.25), sets west (t=0.5), below (t=0.75)
  // Clamp Y so the directional light never goes below the horizon — avoids
  // pitch-black ground at sunset/sunrise when sin → 0.
  const sunAngle = t * Math.PI * 2;
  _sunPos.set(Math.cos(sunAngle) * 200, Math.max(Math.sin(sunAngle) * 200, 15), 20);

  return {
    skyColor: _sky.lerpColors(cB.sky, cA.sky, progress),
    fogColor: _fog.lerpColors(cB.fog, cA.fog, progress),
    fogNear: lerp(before.fogNear, after.fogNear, progress),
    fogFar: lerp(before.fogFar, after.fogFar, progress),
    ambientColor: _amb.lerpColors(cB.amb, cA.amb, progress),
    ambientIntensity: lerp(before.ambInt, after.ambInt, progress),
    sunColor: _sun.lerpColors(cB.sun, cA.sun, progress),
    sunIntensity: lerp(before.sunInt, after.sunInt, progress),
    sunPosition: _sunPos,
    hemiSkyColor: _hSky.lerpColors(cB.hemiSky, cA.hemiSky, progress),
    hemiGroundColor: _hGnd.lerpColors(cB.hemiGnd, cA.hemiGnd, progress),
    hemiIntensity: lerp(before.hemiInt, after.hemiInt, progress),
    accentColor: _acc.lerpColors(cB.acc, cA.acc, progress),
    accentIntensity: lerp(before.accInt, after.accInt, progress),
    starsOpacity: lerp(before.stars, after.stars, progress),
  };
}
