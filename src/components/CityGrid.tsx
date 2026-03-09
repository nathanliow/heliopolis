"use client";

import { useMemo } from "react";
import { PlacedWallet } from "@/types/wallet";
import { setMaxVolume } from "@/lib/building-math";
import { getBlockZone } from "@/lib/city-zoning";
import {
  BLOCKS_PER_ROW, CELL_SIZE, ROAD_WIDTH, SIDEWALK_WIDTH,
  BLOCK_SIZE, BLOCK_STRIDE, GRID_WORLD, OFFSET_X, OFFSET_Z,
  PARK_BLOCKS,
} from "@/lib/city-constants";
import Ground from "./Ground";
import Park from "./Park";
import InstancedTrees from "./InstancedTrees";
import InstancedBuildings from "./InstancedBuildings";
import InstancedSkyscrapers from "./InstancedSkyscrapers";
import InstancedLampPosts from "./InstancedLampPosts";
import InstancedRoadDashes from "./InstancedRoadDashes";
import InstancedHouses from "./InstancedHouses";
import { getSkyscraperType } from "@/lib/building-math";
import { SkyscraperType } from "@/lib/skyscraper-types";
import { WindowHoverInfo } from "./WindowTooltip";

interface CityGridProps {
  wallets: PlacedWallet[];
  timeRef: React.MutableRefObject<number>;
  onSelectWallet: (wallet: PlacedWallet, position: [number, number, number]) => void;
  onHoverWindow?: (info: WindowHoverInfo | null) => void;
  selectedAddress?: string | null;
}

const BLOCK_WIDTH = BLOCK_SIZE; // alias for readability
const BLOCK_DEPTH = BLOCK_SIZE;
const GROUND_SIZE = 600;

function isPark(row: number, col: number): boolean {
  return PARK_BLOCKS.has(`${row},${col}`);
}

// Seeded RNG for deterministic randomization
function makeRng(seed: number) {
  let s = Math.abs(seed) || 1;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

function blockCenter(row: number, col: number): [number, number, number] {
  const cx = OFFSET_X + col * BLOCK_STRIDE;
  const cz = OFFSET_Z + row * BLOCK_STRIDE;
  return [cx, 0, cz];
}

export default function CityGrid({ wallets, timeRef, onSelectWallet, onHoverWindow, selectedAddress }: CityGridProps) {
  // Compute max volume once so width formula can reference it
  useMemo(() => setMaxVolume(wallets), [wallets]);

  // Split wallets into plain boxes vs skyscrapers
  const { boxWallets, skyscraperWallets, skyscraperTypeList } = useMemo(() => {
    const boxW: PlacedWallet[] = [];
    const skyW: PlacedWallet[] = [];
    const skyTypes: SkyscraperType[] = [];
    for (const w of wallets) {
      const type = getSkyscraperType(w);
      if (type === "box") {
        boxW.push(w);
      } else {
        skyW.push(w);
        skyTypes.push(type);
      }
    }
    return { boxWallets: boxW, skyscraperWallets: skyW, skyscraperTypeList: skyTypes };
  }, [wallets]);

  // Build zone map for every block (used for sidewalks/parks rendering)
  const blockZones = useMemo(() => {
    const zones: { row: number; col: number; zone: ReturnType<typeof getBlockZone> }[] = [];
    for (let r = 0; r < BLOCKS_PER_ROW; r++) {
      for (let c = 0; c < BLOCKS_PER_ROW; c++) {
        const zone = isPark(r, c)
          ? { zone: "park" as const, minHeight: 0, maxHeight: 0 }
          : getBlockZone(r, c, BLOCKS_PER_ROW);
        zones.push({ row: r, col: c, zone });
      }
    }
    return zones;
  }, []);

  // Continuous full-length road strips (27 vertical + 27 horizontal)
  const verticalRoads = useMemo(() => {
    const roads: { key: string; xPos: number }[] = [];
    for (let i = 0; i <= BLOCKS_PER_ROW; i++) {
      const xPos = OFFSET_X - BLOCK_WIDTH / 2 - ROAD_WIDTH / 2 + i * BLOCK_STRIDE;
      roads.push({ key: `road-v-${i}`, xPos });
    }
    return roads;
  }, []);

  const horizontalRoads = useMemo(() => {
    const roads: { key: string; zPos: number }[] = [];
    for (let i = 0; i <= BLOCKS_PER_ROW; i++) {
      const zPos = OFFSET_Z - BLOCK_DEPTH / 2 - ROAD_WIDTH / 2 + i * BLOCK_STRIDE;
      roads.push({ key: `road-h-${i}`, zPos });
    }
    return roads;
  }, []);

  // Road center dashes — instanced
  const roadDashes = useMemo(() => {
    const dashes: { x: number; z: number; rotY: number }[] = [];
    const roadLen = GRID_WORLD + 20;
    const count = Math.floor(roadLen / 3);
    // Vertical road dashes
    for (const road of verticalRoads) {
      for (let j = 0; j < count; j++) {
        dashes.push({
          x: road.xPos,
          z: -roadLen / 2 + j * 3 + 1,
          rotY: 0,
        });
      }
    }
    // Horizontal road dashes
    for (const road of horizontalRoads) {
      for (let j = 0; j < count; j++) {
        dashes.push({
          x: -roadLen / 2 + j * 3 + 1,
          z: road.zPos,
          rotY: Math.PI / 2,
        });
      }
    }
    return dashes;
  }, [verticalRoads, horizontalRoads]);

  // Generate ALL trees (sidewalk + park) for a single InstancedTrees component
  const allTrees = useMemo(() => {
    const trees: { pos: [number, number, number]; scale: number }[] = [];

    for (const bz of blockZones) {
      const cx = OFFSET_X + bz.col * BLOCK_STRIDE;
      const cz = OFFSET_Z + bz.row * BLOCK_STRIDE;

      if (bz.zone.zone === "park") {
        // Park trees — scattered randomly
        const seed = Math.abs(cx * 31 + cz * 17);
        const rng = makeRng(seed);
        const count = 12 + Math.floor(rng() * 9);
        const margin = 1.0;
        const pw = BLOCK_WIDTH + ROAD_WIDTH;
        const pd = BLOCK_DEPTH + ROAD_WIDTH;

        for (let i = 0; i < count; i++) {
          const tx = (rng() - 0.5) * (pw - margin * 2);
          const tz = (rng() - 0.5) * (pd - margin * 2);
          const scale = 0.7 + rng() * 0.6;
          trees.push({ pos: [cx + tx, 0, cz + tz], scale });
        }
      } else {
        // Sidewalk trees — randomized spacing
        const halfW = BLOCK_WIDTH / 2;
        const halfD = BLOCK_DEPTH / 2;
        const treeOffset = halfW + SIDEWALK_WIDTH / 2;
        const treeOffsetZ = halfD + SIDEWALK_WIDTH / 2;
        const rng = makeRng(bz.row * 73 + bz.col * 137 + 42);

        function scatter(
          along: number,
          fixedAxis: "x" | "z",
          fixedVal: number,
          startVal: number,
        ) {
          let cursor = -along + rng() * 1.5;
          while (cursor <= along) {
            if (rng() > 0.2) {
              const jitterAlong = (rng() - 0.5) * 1.8;
              const jitterPerp = (rng() - 0.5) * 0.4;
              const scale = 0.35 + rng() * 0.35;
              const pos: [number, number, number] = [0, 0, 0];
              if (fixedAxis === "x") {
                pos[0] = fixedVal + jitterPerp;
                pos[2] = startVal + cursor + jitterAlong;
              } else {
                pos[2] = fixedVal + jitterPerp;
                pos[0] = startVal + cursor + jitterAlong;
              }
              trees.push({ pos, scale });
            }
            cursor += 3 + rng() * 3;
          }
        }

        scatter(halfD, "x", cx - treeOffset, cz);
        scatter(halfD, "x", cx + treeOffset, cz);
        scatter(halfW, "z", cz - treeOffsetZ, cx);
        scatter(halfW, "z", cz + treeOffsetZ, cx);
      }
    }
    return trees;
  }, [blockZones]);

  // Lamp post positions + Y-rotation
  const lampData = useMemo(() => {
    const lamps: { pos: [number, number, number]; rotY: number }[] = [];
    const lampSpacing = 10;
    const roadLen = GRID_WORLD + 20;
    const halfLen = roadLen / 2;
    const intersectionHalf = ROAD_WIDTH / 2 + 0.5;

    // Precompute crossing road positions for intersection checks
    const hRoadZPositions = horizontalRoads.map((r) => r.zPos);
    const vRoadXPositions = verticalRoads.map((r) => r.xPos);

    for (const road of verticalRoads) {
      const rng = makeRng(Math.round(road.xPos * 97));
      const lampX = road.xPos + ROAD_WIDTH / 2 + 0.4;
      for (let d = -halfLen + 2; d < halfLen - 2; d += lampSpacing) {
        const jitter = (rng() - 0.5) * 1.5;
        const z = d + jitter;
        // Skip lamps that fall inside an intersection
        if (hRoadZPositions.some((hz) => Math.abs(hz - z) < intersectionHalf)) continue;
        lamps.push({ pos: [lampX, 0, z], rotY: Math.PI });
      }
    }

    for (const road of horizontalRoads) {
      const rng = makeRng(Math.round(road.zPos * 89));
      const lampZ = road.zPos + ROAD_WIDTH / 2 + 0.4;
      for (let d = -halfLen + 2; d < halfLen - 2; d += lampSpacing) {
        const jitter = (rng() - 0.5) * 1.5;
        const x = d + jitter;
        if (vRoadXPositions.some((vx) => Math.abs(vx - x) < intersectionHalf)) continue;
        lamps.push({ pos: [x, 0, lampZ], rotY: Math.PI / 2 });
      }
    }

    return lamps;
  }, [verticalRoads, horizontalRoads]);

  return (
    <group>
      <Ground size={GROUND_SIZE} />

      {/* Sidewalks along non-park blocks */}
      {blockZones
        .filter((bz) => bz.zone.zone !== "park")
        .map((bz) => {
          const cx = OFFSET_X + bz.col * BLOCK_STRIDE;
          const cz = OFFSET_Z + bz.row * BLOCK_STRIDE;
          return (
            <mesh
              key={`sidewalk-${bz.row}-${bz.col}`}
              position={[cx, 0.01, cz]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <planeGeometry args={[BLOCK_WIDTH + SIDEWALK_WIDTH * 2, BLOCK_DEPTH + SIDEWALK_WIDTH * 2]} />
              <meshStandardMaterial color="#3d3d50" />
            </mesh>
          );
        })}

      {/* Continuous vertical roads */}
      {verticalRoads.map((road) => (
        <mesh key={road.key} position={[road.xPos, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[ROAD_WIDTH - 0.5, GRID_WORLD + 20]} />
          <meshStandardMaterial color="#444460" />
        </mesh>
      ))}

      {/* Continuous horizontal roads */}
      {horizontalRoads.map((road) => (
        <mesh key={road.key} position={[0, 0.02, road.zPos]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[GRID_WORLD + 20, ROAD_WIDTH - 0.5]} />
          <meshStandardMaterial color="#444460" />
        </mesh>
      ))}

      {/* Road center dashes */}
      <InstancedRoadDashes dashes={roadDashes} />

      {/* Parks */}
      {blockZones
        .filter((bz) => bz.zone.zone === "park")
        .map((bz) => {
          const center = blockCenter(bz.row, bz.col);
          return (
            <Park
              key={`park-${bz.row}-${bz.col}`}
              position={center}
              width={BLOCK_WIDTH + ROAD_WIDTH}
              depth={BLOCK_DEPTH + ROAD_WIDTH}
            />
          );
        })}

      {/* All trees — sidewalk + park */}
      <InstancedTrees trees={allTrees} />

      {/* All lamp posts */}
      <InstancedLampPosts lamps={lampData} timeRef={timeRef} />

      {/* Placeholder houses in empty slots */}
      <InstancedHouses wallets={wallets} timeRef={timeRef} />

      {/* Plain box buildings */}
      <InstancedBuildings wallets={boxWallets} onSelectWallet={onSelectWallet} onHoverWindow={onHoverWindow} timeRef={timeRef} selectedAddress={selectedAddress} />

      {/* Skyscraper buildings (multi-tier) */}
      <InstancedSkyscrapers wallets={skyscraperWallets} skyscraperTypes={skyscraperTypeList} onSelectWallet={onSelectWallet} onHoverWindow={onHoverWindow} timeRef={timeRef} selectedAddress={selectedAddress} />
    </group>
  );
}
