import * as THREE from "three";
import { CarPath } from "./car-paths";

const MAX_CARS = 60;

// Car color palette (8 colors)
const CAR_COLORS = [
  new THREE.Color("#e74c3c"), // red
  new THREE.Color("#3498db"), // blue
  new THREE.Color("#2ecc71"), // green
  new THREE.Color("#f1c40f"), // yellow
  new THREE.Color("#e67e22"), // orange
  new THREE.Color("#9b59b6"), // purple
  new THREE.Color("#1abc9c"), // teal
  new THREE.Color("#ecf0f1"), // white
];

export interface ActiveCar {
  slotIndex: number;
  path: CarPath;
  progress: number;       // distance traveled in world units
  speed: number;          // 15-25 world units/sec
  phase: "fadein" | "driving" | "fadeout" | "dead";
  phaseTimer: number;
  color: THREE.Color;
  // Swap metadata for tooltip
  walletAddress: string;
  signature: string;
  tokenIn: string | null;
  tokenOut: string | null;
  amountSol: number | null;
}

export interface CarPosition {
  x: number;
  y: number;
  z: number;
  rotY: number;
  scale: number;
}

let _colorIdx = 0;

export class CarSystem {
  cars: (ActiveCar | null)[];
  private freeSlots: number[];

  constructor() {
    this.cars = new Array(MAX_CARS).fill(null);
    this.freeSlots = Array.from({ length: MAX_CARS }, (_, i) => i);
  }

  get maxCars(): number {
    return MAX_CARS;
  }

  spawnCar(
    path: CarPath,
    walletAddress: string,
    signature: string,
    tokenIn: string | null,
    tokenOut: string | null,
    amountSol: number | null,
  ): boolean {
    if (this.freeSlots.length === 0) return false;
    const slot = this.freeSlots.pop()!;

    const color = CAR_COLORS[_colorIdx % CAR_COLORS.length];
    _colorIdx++;

    this.cars[slot] = {
      slotIndex: slot,
      path,
      progress: 0,
      speed: 8 + Math.random() * 6, // 8-14
      phase: "fadein",
      phaseTimer: 0,
      color,
      walletAddress,
      signature,
      tokenIn,
      tokenOut,
      amountSol,
    };
    return true;
  }

  update(delta: number): void {
    for (let i = 0; i < MAX_CARS; i++) {
      const car = this.cars[i];
      if (!car) continue;

      car.phaseTimer += delta;

      switch (car.phase) {
        case "fadein":
          if (car.phaseTimer >= 0.5) {
            car.phase = "driving";
            car.phaseTimer = 0;
          }
          car.progress += car.speed * delta;
          break;

        case "driving":
          car.progress += car.speed * delta;
          if (car.progress >= car.path.totalLength) {
            car.phase = "fadeout";
            car.phaseTimer = 0;
          }
          break;

        case "fadeout":
          if (car.phaseTimer >= 0.5) {
            car.phase = "dead";
          }
          break;

        case "dead":
          this.cars[i] = null;
          this.freeSlots.push(i);
          break;
      }
    }
  }

  /** Get world position, rotation and scale for a car at its current progress */
  getCarPosition(car: ActiveCar): CarPosition {
    const { waypoints, totalLength } = car.path;
    const clampedProgress = Math.min(car.progress, totalLength);

    // Find segment
    let accumulated = 0;
    let segIdx = 0;
    for (let i = 1; i < waypoints.length; i++) {
      const dx = waypoints[i].x - waypoints[i - 1].x;
      const dz = waypoints[i].z - waypoints[i - 1].z;
      const segLen = Math.sqrt(dx * dx + dz * dz);
      if (accumulated + segLen >= clampedProgress) {
        segIdx = i - 1;
        break;
      }
      accumulated += segLen;
      segIdx = i - 1;
    }

    const wp0 = waypoints[segIdx];
    const wp1 = waypoints[Math.min(segIdx + 1, waypoints.length - 1)];
    const dx = wp1.x - wp0.x;
    const dz = wp1.z - wp0.z;
    const segLen = Math.sqrt(dx * dx + dz * dz);
    const t = segLen > 0 ? (clampedProgress - accumulated) / segLen : 0;

    const x = wp0.x + dx * t;
    const z = wp0.z + dz * t;
    // Road surface at Y=0.02, car body center above
    const y = 0.02 + 0.12 + 0.175; // wheel radius + half body height

    // Rotation: face travel direction
    let rotY = 0;
    if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) {
      rotY = Math.atan2(dx, dz);
    }

    // Scale for fade
    let scale = 1;
    if (car.phase === "fadein") {
      const ft = Math.min(car.phaseTimer / 0.5, 1);
      scale = 1 - (1 - ft) * (1 - ft); // ease-out
    } else if (car.phase === "fadeout") {
      const ft = Math.min(car.phaseTimer / 0.5, 1);
      scale = 1 - ft * ft; // ease-in
    } else if (car.phase === "dead") {
      scale = 0;
    }

    return { x, y, z, rotY, scale };
  }

  getCarSwapInfo(slotIndex: number): ActiveCar | null {
    return this.cars[slotIndex] ?? null;
  }
}
