import { CollisionMap } from "./collision-map";
import { V_ROADS, H_ROADS } from "./city-constants";

// Physics constants — tuned for city scale (block stride = 22, AI cars go 8-14 u/s)
const MAX_SPEED = 22;
const MAX_REVERSE = 10;
const ACCELERATION = 20;
const BRAKE_DECEL = 40;
const REVERSE_ACCEL = 12;
const DRAG = 5;
const MAX_STEER = 0.38; // radians
const STEER_SPEED = 2.0;
const STEER_RETURN = 5.0;
const WHEELBASE = 1.5;

// Collision half-extents
export const CAR_HALF_W = 0.35;
export const CAR_HALF_L = 0.75;

// Y position on ground
export const CAR_Y = 0.315;

export interface CarInput {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  brake: boolean;
}

export interface CarState {
  x: number;
  z: number;
  heading: number; // radians, 0 = +Z direction
  speed: number;
  steerAngle: number;
}

// Spawn at center road intersection, right lane, facing +Z
const SPAWN_X = V_ROADS[13] + 1.5;
const SPAWN_Z = H_ROADS[13];

export function createCarState(): CarState {
  return {
    x: SPAWN_X,
    z: SPAWN_Z,
    heading: 0,
    speed: 0,
    steerAngle: 0,
  };
}

export function updateCar(
  state: CarState,
  input: CarInput,
  delta: number,
  collisionMap: CollisionMap | null,
): void {
  // Clamp delta to prevent physics explosion on tab-switch
  delta = Math.min(delta, 0.05);

  // --- Steering ---
  if (input.left) {
    state.steerAngle = Math.min(state.steerAngle + STEER_SPEED * delta, MAX_STEER);
  } else if (input.right) {
    state.steerAngle = Math.max(state.steerAngle - STEER_SPEED * delta, -MAX_STEER);
  } else {
    // Auto-center
    if (state.steerAngle > 0) {
      state.steerAngle = Math.max(0, state.steerAngle - STEER_RETURN * delta);
    } else {
      state.steerAngle = Math.min(0, state.steerAngle + STEER_RETURN * delta);
    }
  }

  // Reduce effective steer at high speed
  const speedFactor = 1 - 0.5 * (state.speed / MAX_SPEED);
  const effectiveSteer = state.steerAngle * speedFactor;

  // --- Speed ---
  if (input.forward) {
    state.speed += ACCELERATION * delta;
  }
  if (input.backward) {
    if (state.speed > 0.5) {
      // Brake first while moving forward
      state.speed -= BRAKE_DECEL * delta;
    } else {
      // Reverse once nearly stopped
      state.speed -= REVERSE_ACCEL * delta;
    }
  }
  if (input.brake) {
    // Space always brakes toward zero, never reverses
    if (state.speed > 0) {
      state.speed -= BRAKE_DECEL * delta;
      if (state.speed < 0) state.speed = 0;
    } else {
      state.speed += BRAKE_DECEL * delta;
      if (state.speed > 0) state.speed = 0;
    }
  }

  // Drag (toward zero)
  if (state.speed > 0) {
    state.speed = Math.max(0, state.speed - DRAG * delta);
  } else if (state.speed < 0) {
    state.speed = Math.min(0, state.speed + DRAG * delta);
  }

  // Clamp
  state.speed = Math.max(-MAX_REVERSE, Math.min(state.speed, MAX_SPEED));

  // --- Movement (bicycle model) ---
  if (Math.abs(state.speed) > 0.01) {
    state.heading += (state.speed / WHEELBASE) * Math.tan(effectiveSteer) * delta;
    state.x += Math.sin(state.heading) * state.speed * delta;
    state.z += Math.cos(state.heading) * state.speed * delta;
  }

  // --- Collision ---
  if (collisionMap && Math.abs(state.speed) > 0) {
    // Build AABB of rotated car rectangle (axis-aligned bounding box of the OBB)
    const cosH = Math.abs(Math.cos(state.heading));
    const sinH = Math.abs(Math.sin(state.heading));
    const halfW = CAR_HALF_W * cosH + CAR_HALF_L * sinH;
    const halfL = CAR_HALF_W * sinH + CAR_HALF_L * cosH;

    const testAABB = {
      minX: state.x - halfW,
      maxX: state.x + halfW,
      minZ: state.z - halfL,
      maxZ: state.z + halfL,
    };

    const result = collisionMap.testAABB(testAABB);
    if (result.hit) {
      state.x += result.pushX;
      state.z += result.pushZ;
      state.speed *= 0.1; // Slow down on collision (allows sliding along walls)
    }
  }

  // --- Boundary clamp ---
  state.x = Math.max(-295, Math.min(295, state.x));
  state.z = Math.max(-295, Math.min(295, state.z));
}
