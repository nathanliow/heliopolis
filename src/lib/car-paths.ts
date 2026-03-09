import {
  BLOCK_SIZE, BLOCK_STRIDE, OFFSET_X, OFFSET_Z,
  V_ROADS, H_ROADS, PARK_BLOCKS,
} from "./city-constants";

export interface CarPath {
  waypoints: { x: number; z: number }[];
  totalLength: number;
}

const LANE_OFFSET = 1.5; // right-hand traffic offset from road center

/** Find the nearest V_ROAD index to a given x position */
function nearestVRoad(x: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < V_ROADS.length; i++) {
    const d = Math.abs(V_ROADS[i] - x);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

/** Find the nearest H_ROAD index to a given z position */
function nearestHRoad(z: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < H_ROADS.length; i++) {
    const d = Math.abs(H_ROADS[i] - z);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

type Direction = "north" | "south" | "east" | "west";

function laneAdjust(
  roadX: number,
  roadZ: number,
  dir: Direction,
): { x: number; z: number } {
  // Lane offset to the right of travel direction
  switch (dir) {
    case "north": return { x: roadX + LANE_OFFSET, z: roadZ }; // traveling -Z, lane offset +X
    case "south": return { x: roadX - LANE_OFFSET, z: roadZ }; // traveling +Z, lane offset -X
    case "east":  return { x: roadX, z: roadZ + LANE_OFFSET }; // traveling +X, lane offset +Z
    case "west":  return { x: roadX, z: roadZ - LANE_OFFSET }; // traveling -X, lane offset -Z
  }
}

function randomDirection(rng: () => number, exclude?: Direction): Direction {
  const dirs: Direction[] = ["north", "south", "east", "west"];
  const filtered = exclude ? dirs.filter(d => d !== opposite(exclude)) : dirs;
  return filtered[Math.floor(rng() * filtered.length)];
}

function opposite(dir: Direction): Direction {
  switch (dir) {
    case "north": return "south";
    case "south": return "north";
    case "east": return "west";
    case "west": return "east";
  }
}

function turnOptions(dir: Direction): Direction[] {
  // straight, left, right (no U-turn)
  switch (dir) {
    case "north": return ["north", "west", "east"];
    case "south": return ["south", "east", "west"];
    case "east":  return ["east", "north", "south"];
    case "west":  return ["west", "south", "north"];
  }
}

function pickTurn(dir: Direction, rng: () => number): Direction {
  const opts = turnOptions(dir);
  const r = rng();
  if (r < 0.5) return opts[0]; // straight 50%
  if (r < 0.75) return opts[1]; // left 25%
  return opts[2]; // right 25%
}

function nextRoadIndex(current: number, dir: "positive" | "negative", max: number): number | null {
  const next = dir === "positive" ? current + 1 : current - 1;
  if (next < 0 || next >= max) return null;
  return next;
}

/** Check if a block at (row, col) is a park */
function isPark(row: number, col: number): boolean {
  return PARK_BLOCKS.has(`${row},${col}`);
}

function computeLength(waypoints: { x: number; z: number }[]): number {
  let len = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const dx = waypoints[i].x - waypoints[i - 1].x;
    const dz = waypoints[i].z - waypoints[i - 1].z;
    len += Math.sqrt(dx * dx + dz * dz);
  }
  return len;
}

let _rngSeed = 42;
function defaultRng(): number {
  _rngSeed = (_rngSeed * 16807 + 0) % 2147483647;
  return _rngSeed / 2147483647;
}

/** Generate a path starting near a building at (blockRow, blockCol) */
export function generatePathFromBuilding(blockRow: number, blockCol: number): CarPath {
  const rng = defaultRng;

  // Building center
  const bx = OFFSET_X + blockCol * BLOCK_STRIDE;
  const bz = OFFSET_Z + blockRow * BLOCK_STRIDE;

  // Find nearest roads
  const vi = nearestVRoad(bx);
  const hi = nearestHRoad(bz);

  // Pick whether to start on the vertical or horizontal road
  const startOnV = rng() < 0.5;
  let roadIdx: number;
  let crossIdx: number;
  let dir: Direction;

  if (startOnV) {
    roadIdx = vi;
    crossIdx = hi;
    dir = rng() < 0.5 ? "north" : "south";
  } else {
    roadIdx = hi;
    crossIdx = vi;
    dir = rng() < 0.5 ? "east" : "west";
  }

  return buildPath(roadIdx, crossIdx, startOnV, dir, rng);
}

/** Generate a random path from a random edge */
export function generateRandomPath(): CarPath {
  const rng = defaultRng;
  const startOnV = rng() < 0.5;

  if (startOnV) {
    const roadIdx = Math.floor(rng() * V_ROADS.length);
    const crossIdx = rng() < 0.5 ? 0 : H_ROADS.length - 1;
    const dir: Direction = crossIdx === 0 ? "south" : "north";
    return buildPath(roadIdx, crossIdx, true, dir, rng);
  } else {
    const roadIdx = Math.floor(rng() * H_ROADS.length);
    const crossIdx = rng() < 0.5 ? 0 : V_ROADS.length - 1;
    const dir: Direction = crossIdx === 0 ? "east" : "west";
    return buildPath(roadIdx, crossIdx, false, dir, rng);
  }
}

function buildPath(
  roadIdx: number,
  crossIdx: number,
  onVertical: boolean,
  dir: Direction,
  rng: () => number,
): CarPath {
  const segments = 6 + Math.floor(rng() * 5); // 6-10 segments
  const waypoints: { x: number; z: number }[] = [];

  let currentV = onVertical ? roadIdx : crossIdx;
  let currentH = onVertical ? crossIdx : roadIdx;
  let currentDir = dir;

  // Starting intersection
  const startPos = laneAdjust(V_ROADS[currentV], H_ROADS[currentH], currentDir);
  waypoints.push(startPos);

  for (let seg = 0; seg < segments; seg++) {
    // Move one block in the current direction
    let nextV = currentV;
    let nextH = currentH;

    switch (currentDir) {
      case "north": nextH = currentH - 1; break;
      case "south": nextH = currentH + 1; break;
      case "east":  nextV = currentV + 1; break;
      case "west":  nextV = currentV - 1; break;
    }

    // Bounds check
    if (nextV < 0 || nextV >= V_ROADS.length || nextH < 0 || nextH >= H_ROADS.length) {
      break;
    }

    // Add waypoint at next intersection
    const pos = laneAdjust(V_ROADS[nextV], H_ROADS[nextH], currentDir);
    waypoints.push(pos);

    currentV = nextV;
    currentH = nextH;

    // Decide turn at this intersection
    currentDir = pickTurn(currentDir, rng);

    // If turning, add a second waypoint at the same intersection but with new lane offset
    if (seg < segments - 1) {
      const turnPos = laneAdjust(V_ROADS[currentV], H_ROADS[currentH], currentDir);
      // Only add if it's different (i.e., we turned)
      if (turnPos.x !== pos.x || turnPos.z !== pos.z) {
        waypoints.push(turnPos);
      }
    }
  }

  // Need at least 2 waypoints
  if (waypoints.length < 2) {
    // Fallback: just go one block
    const fallbackDir = dir;
    let fv = onVertical ? roadIdx : crossIdx;
    let fh = onVertical ? crossIdx : roadIdx;
    const w1 = laneAdjust(V_ROADS[fv], H_ROADS[fh], fallbackDir);
    switch (fallbackDir) {
      case "north": fh--; break;
      case "south": fh++; break;
      case "east": fv++; break;
      case "west": fv--; break;
    }
    fv = Math.max(0, Math.min(V_ROADS.length - 1, fv));
    fh = Math.max(0, Math.min(H_ROADS.length - 1, fh));
    const w2 = laneAdjust(V_ROADS[fv], H_ROADS[fh], fallbackDir);
    return { waypoints: [w1, w2], totalLength: computeLength([w1, w2]) };
  }

  return { waypoints, totalLength: computeLength(waypoints) };
}

/** Pre-generate a pool of random paths for fallback use */
export function generatePathPool(count: number): CarPath[] {
  const pool: CarPath[] = [];
  for (let i = 0; i < count; i++) {
    pool.push(generateRandomPath());
  }
  return pool;
}
