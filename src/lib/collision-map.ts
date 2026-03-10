import { PlacedWallet } from "@/types/wallet";
import {
  getWalletWorldPosition,
  getBuildingDimensions,
  setMaxVolume,
} from "./building-math";
import { computeHouseSlots } from "@/components/InstancedHouses";
import {
  CELL_SIZE,
  BLOCK_SIZE,
  BLOCK_STRIDE,
  BLOCKS_PER_ROW,
  OFFSET_X,
  OFFSET_Z,
  SLOTS_PER_BLOCK,
  PARK_BLOCKS,
} from "./city-constants";

export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const BUCKET_SIZE = 4; // matches CELL_SIZE

function bucketKey(bx: number, bz: number): number {
  // Pack two ints into one number (offset to avoid negatives)
  return (bx + 500) * 10000 + (bz + 500);
}

export class CollisionMap {
  private buckets = new Map<number, AABB[]>();

  addAABB(aabb: AABB) {
    const minBX = Math.floor(aabb.minX / BUCKET_SIZE);
    const maxBX = Math.floor(aabb.maxX / BUCKET_SIZE);
    const minBZ = Math.floor(aabb.minZ / BUCKET_SIZE);
    const maxBZ = Math.floor(aabb.maxZ / BUCKET_SIZE);

    for (let bx = minBX; bx <= maxBX; bx++) {
      for (let bz = minBZ; bz <= maxBZ; bz++) {
        const key = bucketKey(bx, bz);
        let list = this.buckets.get(key);
        if (!list) {
          list = [];
          this.buckets.set(key, list);
        }
        list.push(aabb);
      }
    }
  }

  testAABB(test: AABB): { hit: boolean; pushX: number; pushZ: number } {
    const minBX = Math.floor(test.minX / BUCKET_SIZE);
    const maxBX = Math.floor(test.maxX / BUCKET_SIZE);
    const minBZ = Math.floor(test.minZ / BUCKET_SIZE);
    const maxBZ = Math.floor(test.maxZ / BUCKET_SIZE);

    let pushX = 0;
    let pushZ = 0;
    let hit = false;

    // Collect unique AABBs from relevant buckets
    const checked = new Set<AABB>();

    for (let bx = minBX; bx <= maxBX; bx++) {
      for (let bz = minBZ; bz <= maxBZ; bz++) {
        const list = this.buckets.get(bucketKey(bx, bz));
        if (!list) continue;
        for (const aabb of list) {
          if (checked.has(aabb)) continue;
          checked.add(aabb);

          // AABB overlap test
          if (
            test.maxX <= aabb.minX ||
            test.minX >= aabb.maxX ||
            test.maxZ <= aabb.minZ ||
            test.minZ >= aabb.maxZ
          ) continue;

          hit = true;

          // Minimum translation vector
          const overlapLeft = test.maxX - aabb.minX;
          const overlapRight = aabb.maxX - test.minX;
          const overlapTop = test.maxZ - aabb.minZ;
          const overlapBottom = aabb.maxZ - test.minZ;

          const minOverlapX = overlapLeft < overlapRight ? -overlapLeft : overlapRight;
          const minOverlapZ = overlapTop < overlapBottom ? -overlapTop : overlapBottom;

          if (Math.abs(minOverlapX) < Math.abs(minOverlapZ)) {
            pushX += minOverlapX;
          } else {
            pushZ += minOverlapZ;
          }
        }
      }
    }

    return { hit, pushX, pushZ };
  }
}

export function buildCollisionMap(wallets: PlacedWallet[]): CollisionMap {
  const map = new CollisionMap();

  // Ensure maxVolume is set for building dimension calculations
  setMaxVolume(wallets);

  // 1. Buildings
  for (const w of wallets) {
    const dims = getBuildingDimensions(w);
    const pos = getWalletWorldPosition(w, dims);
    const halfW = dims.width / 2;
    const halfD = dims.depth / 2;
    map.addAABB({
      minX: pos[0] - halfW,
      maxX: pos[0] + halfW,
      minZ: pos[2] - halfD,
      maxZ: pos[2] + halfD,
    });
  }

  // 2. Houses
  const occupiedSlots = new Set<string>();
  for (const w of wallets) {
    occupiedSlots.add(`${w.blockRow},${w.blockCol},${w.localSlot}`);
  }

  const houses = computeHouseSlots(occupiedSlots);
  for (const h of houses) {
    // Axis-aligned approximation of rotated footprint
    const halfExtent = Math.max(h.w, h.d) / 2;
    map.addAABB({
      minX: h.x - halfExtent,
      maxX: h.x + halfExtent,
      minZ: h.z - halfExtent,
      maxZ: h.z + halfExtent,
    });
  }

  return map;
}
