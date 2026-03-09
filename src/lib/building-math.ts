import { WalletBuilding, PlacedWallet } from "@/types/wallet";
import { CELL_SIZE, ROAD_WIDTH, BLOCK_SIZE, BLOCK_STRIDE, BLOCKS_PER_ROW, GRID_WORLD } from "./city-constants";
import { SkyscraperType } from "./skyscraper-types";
import { getBlockZone } from "./city-zoning";

// --- Height: txn count → floors (1–150) → world height ---

const FLOOR_HEIGHT = 0.3; // world units per floor

export function floors(txns: number): number {
  // Map 10 → 500k into 0..1 in log-space, then apply x^2 easing
  // so low-txn wallets stay short and only 100k+ get truly tall.
  txns = Math.max(10, Math.min(txns, 500_000));
  const x = (Math.log10(txns) - 1) / (Math.log10(500_000) - 1); // 0..1 over [10, 500k]
  const eased = x * x; // quadratic — spreads out mid-to-high range
  return Math.round(1 + eased * 149);
}

// --- Width: volume → 0.6–3.0 world units (scaled to fit cell grid) ---
// Spec maps 4–20 abstract units; we remap to 0.6–3.0 to fit CELL_SIZE=4

const WIDTH_WORLD_MIN = 0.6;
const WIDTH_WORLD_MAX = 3.0;

function buildingWidth(volume: number, maxVolume: number): number {
  if (maxVolume <= 0) return WIDTH_WORLD_MIN;
  const x = Math.log10(volume + 1) / Math.log10(maxVolume + 1);
  const abstract = 4 + 16 * Math.sqrt(x); // 4–20
  // Remap 4–20 → 0.6–3.0
  const t = (abstract - 4) / 16;
  return WIDTH_WORLD_MIN + t * (WIDTH_WORLD_MAX - WIDTH_WORLD_MIN);
}

// Depth = width (square footprint per spec)

// We need maxVolume across all wallets for the width formula.
// Compute it once and cache.
let cachedMaxVolume = 0;

export function setMaxVolume(wallets: WalletBuilding[]) {
  cachedMaxVolume = 0;
  for (const w of wallets) {
    if (w.volumeTraded > cachedMaxVolume) cachedMaxVolume = w.volumeTraded;
  }
}

export function getBuildingDimensions(wallet: WalletBuilding) {
  const height = floors(wallet.txnCount) * FLOOR_HEIGHT;
  const width = buildingWidth(wallet.volumeTraded, cachedMaxVolume);
  const depth = width; // square footprint
  return { height, width, depth };
}

// Color based on height — realistic urban palette
// Short buildings: warm sandstone/brick tones
// Mid-rise: concrete/tan
// Tall buildings: cool slate gray / steel blue
const COLOR_HEIGHT_MAX = 150 * FLOOR_HEIGHT; // 45 units (150 floors)

/** World-space position for a placed wallet (matches InstancedBuildings) */
export function getWalletWorldPosition(
  w: PlacedWallet,
  dims: { width: number; depth: number; height: number },
): [number, number, number] {
  const offset = -GRID_WORLD / 2 + BLOCK_SIZE / 2 + ROAD_WIDTH / 2;
  const blockOriginX = offset + w.blockCol * BLOCK_STRIDE - BLOCK_SIZE / 2;
  const blockOriginZ = offset + w.blockRow * BLOCK_STRIDE - BLOCK_SIZE / 2;
  const localRow = Math.floor(w.localSlot / 4);
  const localCol = w.localSlot % 4;
  return [
    blockOriginX + localCol * CELL_SIZE + dims.width / 2 + 0.5,
    dims.height / 2,
    blockOriginZ + localRow * CELL_SIZE + dims.depth / 2 + 0.5,
  ];
}

// --- Window math ---

export function getWindowCols(buildingWidth: number): number {
  return Math.max(2, Math.min(7, Math.round(buildingWidth * 2.5)));
}

export function getWindowFillRatio(uniqueTokensSwapped: number): number {
  if (uniqueTokensSwapped <= 0) return 0;
  return Math.max(0.02, Math.min(1.0, uniqueTokensSwapped / (uniqueTokensSwapped + 500)));
}

export function getLitRatio(latestBlocktime: number | null | undefined): number {
  if (latestBlocktime == null) return 0.05;
  const nowSeconds = Date.now() / 1000;
  const ageDays = (nowSeconds - latestBlocktime) / 86400;
  return Math.min(0.45, Math.max(0.05, 0.45 * Math.exp(-ageDays / 14)));
}

export function getInstanceSeed(address: string): number {
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = (hash * 31 + address.charCodeAt(i)) | 0;
  }
  return Math.abs(hash % 10007) / 10007;
}

export function getWindowRows(floorCount: number): number {
  return Math.min(floorCount, 35);
}

// --- Skyscraper type assignment ---

/**
 * Deterministically assign a skyscraper type to a downtown wallet.
 * Non-downtown wallets always get "box".
 */
export function getSkyscraperType(wallet: PlacedWallet): SkyscraperType {
  const zone = getBlockZone(wallet.blockRow, wallet.blockCol, BLOCKS_PER_ROW);
  if (zone.zone !== "downtown") return "box";

  const seed = getInstanceSeed(wallet.address);
  if (seed < 0.40) return "box";
  if (seed < 0.55) return "setback";
  if (seed < 0.70) return "twin";
  if (seed < 0.85) return "cantilever";
  return "spire";
}

export function getBuildingColor(height: number): string {
  const t = Math.min(1, height / COLOR_HEIGHT_MAX);

  // Short (t≈0): lighter concrete   rgb(100, 98, 110)
  // Mid  (t≈0.5): mid slate        rgb(82, 82, 105)
  // Tall (t≈1): near ground tone   rgb(65, 68, 95)
  // Ground is #4a4a65 = rgb(74, 74, 101)
  const r = Math.floor(100 - t * 35);
  const g = Math.floor(98 - t * 30);
  const b = Math.floor(110 - t * 15);
  return `rgb(${r},${g},${b})`;
}
