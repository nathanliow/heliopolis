"use client";

import { useRef, useEffect, useCallback, useMemo } from "react";
import { useFrame, ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { PlacedWallet } from "@/types/wallet";
import {
  getBuildingDimensions,
  getBuildingColor,
  getWindowCols,
  getWindowFillRatio,
  getLitRatio,
  getInstanceSeed,
  getWindowRows,
  getWalletWorldPosition,
  floors,
} from "@/lib/building-math";
import { createBuildingMaterial } from "@/lib/building-shader";
import { createHouseMaterial } from "@/lib/house-shader";
import { SkyscraperType, TierDef, SKYSCRAPER_DEFS } from "@/lib/skyscraper-types";
import { WindowHoverInfo } from "./WindowTooltip";

interface InstancedSkyscrapersProps {
  wallets: PlacedWallet[];
  skyscraperTypes: SkyscraperType[]; // parallel to wallets
  onSelectWallet: (wallet: PlacedWallet, position: [number, number, number]) => void;
  onHoverWindow?: (info: WindowHoverInfo | null) => void;
  timeRef: React.MutableRefObject<number>;
  selectedAddress?: string | null;
}

// ---- Precomputed data per wallet ----
interface WalletData {
  wallet: PlacedWallet;
  type: Exclude<SkyscraperType, "box">;
  dims: { width: number; height: number; depth: number };
  basePos: [number, number, number]; // ground-level center (y = height/2 in original, but we'll compute per-tier)
  color: string;
  seed: number;
  yRotation: number; // 0, π/2, π, or 3π/2
}

// One InstancedMesh per (type, tierIndex) — all wallets of the same type share instances
interface TierGroup {
  type: Exclude<SkyscraperType, "box">;
  tierIndex: number;
  tierDef: TierDef;
  walletIndices: number[]; // indices into walletData array
}

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

export default function InstancedSkyscrapers({
  wallets,
  skyscraperTypes,
  onSelectWallet,
  onHoverWindow,
  timeRef,
  selectedAddress,
}: InstancedSkyscrapersProps) {
  const timeUniform = useMemo(() => ({ value: 0 }), []);
  const buildingMat = useMemo(() => createBuildingMaterial(timeUniform), [timeUniform]);
  const solidMat = useMemo(
    () => createHouseMaterial(timeUniform, 0.85, 1.0),
    [timeUniform],
  );

  // Refs for all tier meshes — stored as flat array, indexed by tierGroups order
  const meshRefs = useRef<(THREE.InstancedMesh | null)[]>([]);
  const hoveredWalletIdx = useRef<number | null>(null);

  // Precompute wallet data
  const walletData: WalletData[] = useMemo(() => {
    return wallets.map((w, i) => {
      const type = skyscraperTypes[i] as Exclude<SkyscraperType, "box">;
      const dims = getBuildingDimensions(w);
      const basePos = getWalletWorldPosition(w, dims);
      const color = getBuildingColor(dims.height);
      const seed = getInstanceSeed(w.address);
      // Deterministic 90° rotation: 0, 1, 2, or 3 quarter-turns
      const yRotation = Math.floor(seed * 4) * (Math.PI / 2);
      return { wallet: w, type, dims, basePos, color, seed, yRotation };
    });
  }, [wallets, skyscraperTypes]);

  // Group wallets by (type, tierIndex)
  const tierGroups: TierGroup[] = useMemo(() => {
    const groups: TierGroup[] = [];
    const typeSet = new Set(walletData.map((d) => d.type));

    for (const type of typeSet) {
      const tiers = SKYSCRAPER_DEFS[type];
      for (let ti = 0; ti < tiers.length; ti++) {
        const walletIndices: number[] = [];
        for (let wi = 0; wi < walletData.length; wi++) {
          if (walletData[wi].type === type) walletIndices.push(wi);
        }
        if (walletIndices.length > 0) {
          groups.push({ type, tierIndex: ti, tierDef: tiers[ti], walletIndices });
        }
      }
    }
    return groups;
  }, [walletData]);

  // Build a reverse lookup: for each tier group mesh index + instance id → walletData index
  const meshToWallet = useMemo(() => {
    return tierGroups.map((g) => g.walletIndices);
  }, [tierGroups]);

  // Also build: for each walletData index → list of (meshIdx, instanceId) so we can highlight all tiers
  const walletToMeshInstances = useMemo(() => {
    const map: { meshIdx: number; instanceId: number }[][] = new Array(walletData.length);
    for (let i = 0; i < walletData.length; i++) map[i] = [];
    for (let mi = 0; mi < tierGroups.length; mi++) {
      const indices = tierGroups[mi].walletIndices;
      for (let ii = 0; ii < indices.length; ii++) {
        map[indices[ii]].push({ meshIdx: mi, instanceId: ii });
      }
    }
    return map;
  }, [tierGroups, walletData.length]);

  // Set instance matrices and attributes for all tier meshes
  useEffect(() => {
    for (let mi = 0; mi < tierGroups.length; mi++) {
      const mesh = meshRefs.current[mi];
      const group = tierGroups[mi];
      if (!mesh) continue;

      const { tierDef, walletIndices } = group;
      const count = walletIndices.length;

      const colors = new Float32Array(count * 3);
      const windowColsArr = new Float32Array(count);
      const fillRatioArr = new Float32Array(count);
      const litRatioArr = new Float32Array(count);
      const seedArr = new Float32Array(count);
      const floorsArr = new Float32Array(count);
      const highlightArr = new Float32Array(count);

      for (let ii = 0; ii < count; ii++) {
        const wd = walletData[walletIndices[ii]];
        const { dims, basePos, color, seed, yRotation, wallet: w } = wd;

        // Compute tier dimensions in world space
        const tierW = dims.width * tierDef.widthFrac;
        const tierD = dims.depth * tierDef.depthFrac;
        const tierH = dims.height * tierDef.heightFrac;

        // Compute tier center position
        // basePos[1] is dims.height/2 (center of full building box)
        // We need ground-level Y = 0, then offset by tier
        const groundY = 0;
        const tierCenterY = groundY + dims.height * tierDef.yBaseFrac + tierH / 2;

        // Apply X/Z offsets (relative to building dims), rotated by yRotation
        const rawOffsetX = dims.width * tierDef.xOffsetFrac;
        const rawOffsetZ = dims.depth * tierDef.zOffsetFrac;
        const cosR = Math.cos(yRotation);
        const sinR = Math.sin(yRotation);
        const rotatedOffsetX = rawOffsetX * cosR - rawOffsetZ * sinR;
        const rotatedOffsetZ = rawOffsetX * sinR + rawOffsetZ * cosR;

        _dummy.position.set(
          basePos[0] + rotatedOffsetX,
          tierCenterY,
          basePos[2] + rotatedOffsetZ,
        );
        _dummy.scale.set(tierW, tierH, tierD);
        _dummy.rotation.set(0, yRotation, 0);
        _dummy.updateMatrix();
        mesh.setMatrixAt(ii, _dummy.matrix);

        // Color
        _color.set(color);
        colors[ii * 3] = _color.r;
        colors[ii * 3 + 1] = _color.g;
        colors[ii * 3 + 2] = _color.b;

        if (tierDef.hasWindows) {
          // Window attributes — computed from TIER dimensions for correct density
          windowColsArr[ii] = getWindowCols(tierW);
          fillRatioArr[ii] = getWindowFillRatio(w.uniqueTokensSwapped ?? 0);
          litRatioArr[ii] = getLitRatio(w.latestBlocktime);
          seedArr[ii] = seed;
          floorsArr[ii] = getWindowRows(Math.round(tierH / 0.3)); // floors in this tier
        }
      }

      mesh.instanceMatrix.needsUpdate = true;

      if (tierDef.hasWindows) {
        mesh.geometry.setAttribute(
          "instanceBuildingColor",
          new THREE.InstancedBufferAttribute(colors, 3),
        );
        mesh.geometry.setAttribute(
          "instanceHighlight",
          new THREE.InstancedBufferAttribute(highlightArr, 1),
        );
        mesh.geometry.setAttribute(
          "instanceWindowCols",
          new THREE.InstancedBufferAttribute(windowColsArr, 1),
        );
        mesh.geometry.setAttribute(
          "instanceFillRatio",
          new THREE.InstancedBufferAttribute(fillRatioArr, 1),
        );
        mesh.geometry.setAttribute(
          "instanceLitRatio",
          new THREE.InstancedBufferAttribute(litRatioArr, 1),
        );
        mesh.geometry.setAttribute(
          "instanceSeed",
          new THREE.InstancedBufferAttribute(seedArr, 1),
        );
        mesh.geometry.setAttribute(
          "instanceFloors",
          new THREE.InstancedBufferAttribute(floorsArr, 1),
        );
      } else {
        // Solid-color tiers use instanceColor for the house-shader
        mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
        mesh.geometry.setAttribute(
          "instanceHighlight",
          new THREE.InstancedBufferAttribute(highlightArr, 1),
        );
      }
    }
  }, [tierGroups, walletData]);

  // Update time uniform
  useFrame(() => {
    timeUniform.value = timeRef.current;
  });

  // ---- Highlight helpers ----
  const setWalletHighlight = useCallback(
    (walletIdx: number, value: number) => {
      const entries = walletToMeshInstances[walletIdx];
      if (!entries) return;
      for (const { meshIdx, instanceId } of entries) {
        const mesh = meshRefs.current[meshIdx];
        if (!mesh) continue;
        const attr = mesh.geometry.getAttribute("instanceHighlight") as THREE.InstancedBufferAttribute;
        if (attr) {
          attr.setX(instanceId, value);
          attr.needsUpdate = true;
        }
      }
    },
    [walletToMeshInstances],
  );

  // ---- Resolve which wallet was hit ----
  const resolveWallet = useCallback(
    (meshIdx: number, instanceId: number): number | undefined => {
      const indices = meshToWallet[meshIdx];
      return indices?.[instanceId];
    },
    [meshToWallet],
  );

  // ---- Pointer handlers ----
  const makePointerMove = useCallback(
    (meshIdx: number) => (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      const id = e.instanceId;
      if (id === undefined) {
        onHoverWindow?.(null);
        return;
      }

      const walletIdx = resolveWallet(meshIdx, id);
      if (walletIdx === undefined) return;

      const prev = hoveredWalletIdx.current;
      if (prev !== walletIdx) {
        if (prev !== null) setWalletHighlight(prev, 0.0);
        setWalletHighlight(walletIdx, 1.0);
        hoveredWalletIdx.current = walletIdx;
        document.body.style.cursor = "pointer";
      }

      if (!onHoverWindow) return;

      const wd = walletData[walletIdx];
      const w = wd.wallet;

      if (w.address !== selectedAddress) {
        onHoverWindow({
          address: w.address,
          tokenIndex: 0,
          screenX: e.nativeEvent.clientX,
          screenY: e.nativeEvent.clientY,
          mode: "building",
          identityName: w.identityName,
          identityType: w.identityType,
          identityCategory: w.identityCategory,
        });
        return;
      }

      // Selected building — window-level tooltip on windowed tiers
      const tierDef = tierGroups[meshIdx]?.tierDef;
      if (!tierDef?.hasWindows) {
        onHoverWindow(null);
        return;
      }

      const faceNormal = e.face?.normal;
      if (!faceNormal || Math.abs(faceNormal.y) > 0.5) {
        onHoverWindow(null);
        return;
      }

      // Approximate: use tier dimensions for local coord conversion
      const tierW = wd.dims.width * tierDef.widthFrac;
      const tierH = wd.dims.height * tierDef.heightFrac;
      const tierD = wd.dims.depth * tierDef.depthFrac;
      const tierCenterY = wd.dims.height * tierDef.yBaseFrac + tierH / 2;

      const rawOffsetX = wd.dims.width * tierDef.xOffsetFrac;
      const rawOffsetZ = wd.dims.depth * tierDef.zOffsetFrac;
      const cosR = Math.cos(wd.yRotation);
      const sinR = Math.sin(wd.yRotation);
      const rotatedOffsetX = rawOffsetX * cosR - rawOffsetZ * sinR;
      const rotatedOffsetZ = rawOffsetX * sinR + rawOffsetZ * cosR;

      const tierCenterX = wd.basePos[0] + rotatedOffsetX;
      const tierCenterZ = wd.basePos[2] + rotatedOffsetZ;

      // Transform hit point into tier-local coords, accounting for rotation
      const dx = e.point.x - tierCenterX;
      const dz = e.point.z - tierCenterZ;
      // Un-rotate
      const localX = (dx * cosR + dz * sinR) / tierW;
      const localY = (e.point.y - tierCenterY) / tierH;
      const localZ = (-dx * sinR + dz * cosR) / tierD;

      // Determine face UV — same approach as InstancedBuildings
      // Need to figure out which local face was hit by examining the un-rotated normal
      const nx = faceNormal.x * cosR + faceNormal.z * sinR;
      const nz = -faceNormal.x * sinR + faceNormal.z * cosR;

      let faceU: number, faceV: number;
      if (Math.abs(nx) > 0.5) {
        faceU = localZ + 0.5;
        faceV = localY + 0.5;
      } else {
        faceU = localX + 0.5;
        faceV = localY + 0.5;
      }

      const cols = getWindowCols(tierW);
      const rows = getWindowRows(Math.round(tierH / 0.3));
      if (cols < 1 || rows < 1) { onHoverWindow(null); return; }

      const colIdx = Math.floor(faceU * cols);
      const rowIdx = Math.floor(faceV * rows);
      const cellU = faceU * cols - colIdx;
      const cellV = faceV * rows - rowIdx;

      if (!(cellU > 0.2 && cellU < 0.8 && cellV > 0.2 && cellV < 0.8)) {
        onHoverWindow(null);
        return;
      }

      const tokenIndex = Math.abs(
        (colIdx * 127 + rowIdx * 311 + Math.floor(wd.seed * 10007)) | 0,
      );

      onHoverWindow({
        address: w.address,
        tokenIndex,
        screenX: e.nativeEvent.clientX,
        screenY: e.nativeEvent.clientY,
        mode: "token",
      });
    },
    [walletData, tierGroups, resolveWallet, setWalletHighlight, onHoverWindow, selectedAddress],
  );

  const handlePointerOut = useCallback(() => {
    const prev = hoveredWalletIdx.current;
    if (prev !== null) {
      setWalletHighlight(prev, 0.0);
    }
    hoveredWalletIdx.current = null;
    document.body.style.cursor = "default";
    onHoverWindow?.(null);
  }, [setWalletHighlight, onHoverWindow]);

  const makeClick = useCallback(
    (meshIdx: number) => (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      const id = e.instanceId;
      if (id === undefined) return;
      const walletIdx = resolveWallet(meshIdx, id);
      if (walletIdx === undefined) return;
      const wd = walletData[walletIdx];
      onSelectWallet(wd.wallet, wd.basePos);
    },
    [walletData, resolveWallet, onSelectWallet],
  );

  if (wallets.length === 0) return null;

  return (
    <group>
      {tierGroups.map((group, mi) => (
        <instancedMesh
          key={`${group.type}-${group.tierIndex}-${group.walletIndices.length}`}
          ref={(el) => { meshRefs.current[mi] = el; }}
          args={[undefined!, undefined!, group.walletIndices.length]}
          frustumCulled={false}
          onPointerMove={makePointerMove(mi)}
          onPointerOut={handlePointerOut}
          onClick={makeClick(mi)}
        >
          <boxGeometry args={[1, 1, 1]} />
          <primitive
            object={group.tierDef.hasWindows ? buildingMat : solidMat}
            attach="material"
          />
        </instancedMesh>
      ))}
    </group>
  );
}
