/**
 * City zoning system — assigns block types based on distance from city center.
 *
 * Zone layout (concentric rings):
 *   DOWNTOWN  — center ~20% of blocks: skyscrapers (height 15–45)
 *   MIDRISE   — next ring ~30%: mid-level buildings (height 5–15)
 *   LOWRISE   — outer ring ~40%: low buildings (height 0.5–5)
 *   PARK      — 10 hardcoded park blocks
 */

export type ZoneType = "downtown" | "midrise" | "lowrise" | "park";

export interface BlockZone {
  zone: ZoneType;
  maxHeight: number;
  minHeight: number;
}

const ZONE_CONFIGS: Record<Exclude<ZoneType, "park">, { minHeight: number; maxHeight: number }> = {
  downtown: { minHeight: 12, maxHeight: 45 },
  midrise:  { minHeight: 4, maxHeight: 14 },
  lowrise:  { minHeight: 0.5, maxHeight: 5 },
};

/**
 * Given block grid coordinates and total grid size, determine what zone the block falls in.
 */
export function getBlockZone(
  blockRow: number,
  blockCol: number,
  blocksPerRow: number,
): BlockZone {
  const centerRow = (blocksPerRow - 1) / 2;
  const centerCol = (blocksPerRow - 1) / 2;

  const dr = blockRow - centerRow;
  const dc = blockCol - centerCol;
  const dist = Math.sqrt(dr * dr + dc * dc);

  const maxDist = Math.sqrt(centerRow * centerRow + centerCol * centerCol) || 1;
  const normDist = dist / maxDist;

  if (isParkBlock(blockRow, blockCol)) {
    return { zone: "park", minHeight: 0, maxHeight: 0 };
  }

  if (normDist <= 0.38) {
    return { zone: "downtown", ...ZONE_CONFIGS.downtown };
  }
  if (normDist <= 0.76) {
    return { zone: "midrise", ...ZONE_CONFIGS.midrise };
  }
  return { zone: "lowrise", ...ZONE_CONFIGS.lowrise };
}

/** Hardcoded park positions matching the DB block_spiral_order seed */
const PARK_BLOCKS = new Set([
  "10,13", "11,13", "13,11", "12,3", "13,3",
  "8,18", "20,12", "4,10", "18,21", "22,6",
]);

export function isParkBlock(row: number, col: number): boolean {
  return PARK_BLOCKS.has(`${row},${col}`);
}
