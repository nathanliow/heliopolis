"use client";

import { useRef, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { PlacedWallet } from "@/types/wallet";
import { createHouseMaterial } from "@/lib/house-shader";
import {
  CELL_SIZE, BLOCK_SIZE, BLOCK_STRIDE, BLOCKS_PER_ROW,
  OFFSET_X, OFFSET_Z, SLOTS_PER_BLOCK, PARK_BLOCKS,
} from "@/lib/city-constants";

// Wall color palette — warm earthy tones
const WALL_COLORS = [
  "#d4c4a8", // cream
  "#c9b99a", // warm tan
  "#b8a88a", // sand
  "#d6cbb8", // pale beige
  "#c2b8a3", // khaki
  "#bfc8c0", // sage grey
  "#c4b4a0", // wheat
  "#d0c0a0", // light gold
  "#baa892", // dusty brown
  "#c8c0b0", // stone
].map((c) => new THREE.Color(c));

// Roof color palette
const ROOF_COLORS = [
  "#8b4433", // terracotta
  "#6b3a2a", // dark brick
  "#5a4a3a", // warm slate
  "#7a5a3a", // cedar brown
  "#6a4a2a", // chocolate
  "#4a5a4a", // moss
  "#8a6a4a", // sienna
  "#5a3a2a", // espresso
].map((c) => new THREE.Color(c));

function makeRng(seed: number) {
  let s = Math.abs(seed) || 1;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

interface HouseInstance {
  x: number;
  z: number;
  w: number;
  h: number;
  d: number;
  roofH: number;
  rotY: number;
  wallColor: THREE.Color;
  roofColor: THREE.Color;
  hasChimney: boolean;
}

function computeHouseSlots(occupiedSlots: Set<string>): HouseInstance[] {
  const houses: HouseInstance[] = [];

  for (let row = 0; row < BLOCKS_PER_ROW; row++) {
    for (let col = 0; col < BLOCKS_PER_ROW; col++) {
      if (PARK_BLOCKS.has(`${row},${col}`)) continue;

      const rng = makeRng(row * 1009 + col * 2003 + 7);

      for (let slot = 0; slot < SLOTS_PER_BLOCK; slot++) {
        // Always consume RNG for every slot for stability
        const shouldPlace = rng() < 0.15;
        const jitterX = (rng() - 0.5) * 0.6;
        const jitterZ = (rng() - 0.5) * 0.6;
        const rotY = Math.floor(rng() * 4) * (Math.PI / 2);

        // Independent axis variation
        const w = 0.8 + rng() * 0.9;   // 0.8–1.7
        const d = 0.8 + rng() * 0.9;   // 0.8–1.7
        const h = 0.6 + rng() * 0.8;   // 0.6–1.4
        const roofH = 0.3 + rng() * 0.5; // 0.3–0.8

        const wallIdx = Math.floor(rng() * WALL_COLORS.length);
        const roofIdx = Math.floor(rng() * ROOF_COLORS.length);
        const hasChimney = rng() < 0.4;

        if (!shouldPlace) continue;
        if (occupiedSlots.has(`${row},${col},${slot}`)) continue;

        const localRow = Math.floor(slot / 4);
        const localCol = slot % 4;

        const blockOriginX = OFFSET_X + col * BLOCK_STRIDE - BLOCK_SIZE / 2;
        const blockOriginZ = OFFSET_Z + row * BLOCK_STRIDE - BLOCK_SIZE / 2;

        const x = blockOriginX + localCol * CELL_SIZE + CELL_SIZE / 2 + jitterX;
        const z = blockOriginZ + localRow * CELL_SIZE + CELL_SIZE / 2 + jitterZ;

        houses.push({
          x, z, w, h, d, roofH, rotY,
          wallColor: WALL_COLORS[wallIdx],
          roofColor: ROOF_COLORS[roofIdx],
          hasChimney,
        });
      }
    }
  }

  return houses;
}

interface InstancedHousesProps {
  wallets: PlacedWallet[];
  timeRef: React.MutableRefObject<number>;
}

const _dummy = new THREE.Object3D();
const _col = new THREE.Color();

export default function InstancedHouses({ wallets, timeRef }: InstancedHousesProps) {
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const roofRef = useRef<THREE.InstancedMesh>(null);
  const chimneyRef = useRef<THREE.InstancedMesh>(null);

  const occupiedSlots = useMemo(() => {
    const set = new Set<string>();
    for (const w of wallets) {
      set.add(`${w.blockRow},${w.blockCol},${w.localSlot}`);
    }
    return set;
  }, [wallets]);

  const houses = useMemo(() => computeHouseSlots(occupiedSlots), [occupiedSlots]);
  const chimneyHouses = useMemo(() => houses.filter((h) => h.hasChimney), [houses]);

  // Pre-build geometries with color attributes baked in
  const bodyGeo = useMemo(() => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    return geo;
  }, []);

  const roofGeo = useMemo(() => {
    // radius = sqrt(2)/2 so the 4 corners of the pyramid base land exactly
    // at (±0.5, ±0.5) when rotated 45° — matching the unit box edges
    const geo = new THREE.ConeGeometry(Math.SQRT2 / 2, 1, 4);
    // Rotate 45° around Y so pyramid edges align with box edges
    geo.rotateY(Math.PI / 4);
    return geo;
  }, []);

  const timeUniform = useMemo(() => ({ value: 0 }), []);

  const wallMat = useMemo(() => createHouseMaterial(timeUniform, 0.9, 1.0), [timeUniform]);
  const roofMat = useMemo(() => createHouseMaterial(timeUniform, 0.8, 0.0), [timeUniform]);
  const chimMat = useMemo(() => createHouseMaterial(timeUniform, 0.85, 1.0), [timeUniform]);

  useFrame(() => {
    timeUniform.value = timeRef.current;
  });

  // Build meshes imperatively so colors exist before first render
  const bodyMesh = useMemo(() => {
    if (houses.length === 0) return null;
    const mesh = new THREE.InstancedMesh(bodyGeo, wallMat, houses.length);
    const colors = new Float32Array(houses.length * 3);

    for (let i = 0; i < houses.length; i++) {
      const h = houses[i];
      _dummy.position.set(h.x, h.h / 2, h.z);
      _dummy.rotation.set(0, h.rotY, 0);
      _dummy.scale.set(h.w, h.h, h.d);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);

      colors[i * 3] = h.wallColor.r;
      colors[i * 3 + 1] = h.wallColor.g;
      colors[i * 3 + 2] = h.wallColor.b;
    }

    mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    return mesh;
  }, [houses, bodyGeo, wallMat]);

  const roofMesh = useMemo(() => {
    if (houses.length === 0) return null;
    const mesh = new THREE.InstancedMesh(roofGeo, roofMat, houses.length);
    const colors = new Float32Array(houses.length * 3);

    for (let i = 0; i < houses.length; i++) {
      const h = houses[i];
      _dummy.position.set(h.x, h.h + h.roofH / 2, h.z);
      _dummy.rotation.set(0, h.rotY, 0);
      _dummy.scale.set(h.w, h.roofH, h.d);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);

      colors[i * 3] = h.roofColor.r;
      colors[i * 3 + 1] = h.roofColor.g;
      colors[i * 3 + 2] = h.roofColor.b;
    }

    mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    return mesh;
  }, [houses, roofGeo, roofMat]);

  const chimneyMesh = useMemo(() => {
    if (chimneyHouses.length === 0) return null;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.InstancedMesh(geo, chimMat, chimneyHouses.length);
    const colors = new Float32Array(chimneyHouses.length * 3);

    for (let i = 0; i < chimneyHouses.length; i++) {
      const h = chimneyHouses[i];
      const chimW = 0.12;
      const chimH = h.roofH * 0.9;

      const ox = Math.cos(h.rotY) * h.w * 0.25 - Math.sin(h.rotY) * h.d * 0.15;
      const oz = Math.sin(h.rotY) * h.w * 0.25 + Math.cos(h.rotY) * h.d * 0.15;

      _dummy.position.set(h.x + ox, h.h + chimH / 2 + h.roofH * 0.3, h.z + oz);
      _dummy.rotation.set(0, 0, 0);
      _dummy.scale.set(chimW, chimH, chimW);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);

      _col.set(h.roofColor).multiplyScalar(0.7);
      colors[i * 3] = _col.r;
      colors[i * 3 + 1] = _col.g;
      colors[i * 3 + 2] = _col.b;
    }

    mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    return mesh;
  }, [chimneyHouses, chimMat]);

  if (houses.length === 0) return null;

  return (
    <>
      {bodyMesh && <primitive object={bodyMesh} />}
      {roofMesh && <primitive object={roofMesh} />}
      {chimneyMesh && <primitive object={chimneyMesh} />}
    </>
  );
}
