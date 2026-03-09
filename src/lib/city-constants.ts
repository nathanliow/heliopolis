// Shared grid constants — single source of truth for the city layout.
// Imported by CityGrid, InstancedBuildings, InstancedHouses, building-math, car-paths, etc.

export const BLOCKS_PER_ROW = 26;
export const CELL_SIZE = 4;
export const ROAD_WIDTH = 6;
export const SIDEWALK_WIDTH = 0.6;
export const SLOTS_PER_BLOCK = 16; // 4x4 cells per block

export const BLOCK_SIZE = 4 * CELL_SIZE; // 16
export const BLOCK_STRIDE = BLOCK_SIZE + ROAD_WIDTH; // 22
export const GRID_WORLD = BLOCKS_PER_ROW * BLOCK_STRIDE; // 572

export const OFFSET_X = -GRID_WORLD / 2 + BLOCK_SIZE / 2 + ROAD_WIDTH / 2;
export const OFFSET_Z = OFFSET_X;

// Precomputed road center positions (27 vertical, 27 horizontal)
export const V_ROADS: number[] = Array.from({ length: 27 }, (_, i) =>
  OFFSET_X - BLOCK_SIZE / 2 - ROAD_WIDTH / 2 + i * BLOCK_STRIDE
);
export const H_ROADS: number[] = Array.from({ length: 27 }, (_, i) =>
  OFFSET_Z - BLOCK_SIZE / 2 - ROAD_WIDTH / 2 + i * BLOCK_STRIDE
);

// Hardcoded park blocks — matches DB seed
export const PARK_BLOCKS = new Set([
  "10,13", "11,13", "13,11", "12,3", "13,3",
  "8,18", "20,12", "4,10", "18,21", "22,6",
]);
