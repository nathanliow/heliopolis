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
  floors,
} from "@/lib/building-math";
import { createBuildingMaterial } from "@/lib/building-shader";
import { CELL_SIZE, ROAD_WIDTH, BLOCK_SIZE, BLOCK_STRIDE, GRID_WORLD } from "@/lib/city-constants";
import { WindowHoverInfo } from "./WindowTooltip";

interface InstancedBuildingsProps {
  wallets: PlacedWallet[];
  onSelectWallet: (wallet: PlacedWallet, position: [number, number, number]) => void;
  onHoverWindow?: (info: WindowHoverInfo | null) => void;
  timeRef: React.MutableRefObject<number>;
  selectedAddress?: string | null;
}

/** Compute world position for a placed wallet */
function walletWorldPos(
  w: PlacedWallet,
  dims: { width: number; depth: number; height: number }
): [number, number, number] {
  const offsetX = -GRID_WORLD / 2 + BLOCK_SIZE / 2 + ROAD_WIDTH / 2;
  const offsetZ = -GRID_WORLD / 2 + BLOCK_SIZE / 2 + ROAD_WIDTH / 2;

  const blockOriginX = offsetX + w.blockCol * BLOCK_STRIDE - BLOCK_SIZE / 2;
  const blockOriginZ = offsetZ + w.blockRow * BLOCK_STRIDE - BLOCK_SIZE / 2;

  const localRow = Math.floor(w.localSlot / 4);
  const localCol = w.localSlot % 4;

  const x = blockOriginX + localCol * CELL_SIZE + dims.width / 2 + 0.5;
  const z = blockOriginZ + localRow * CELL_SIZE + dims.depth / 2 + 0.5;
  const y = dims.height / 2;

  return [x, y, z];
}

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

export default function InstancedBuildings({
  wallets,
  onSelectWallet,
  onHoverWindow,
  timeRef,
  selectedAddress,
}: InstancedBuildingsProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const hoveredId = useRef<number | null>(null);

  // Time uniforms for shader
  const timeUniform = useMemo(() => ({ value: 0 }), []);
  const elapsedUniform = useMemo(() => ({ value: 0 }), []);

  // ShaderMaterial with standard PBR + window logic baked in (no onBeforeCompile)
  const material = useMemo(
    () => createBuildingMaterial(timeUniform, elapsedUniform),
    [timeUniform, elapsedUniform],
  );

  // Precompute dimensions and colors
  const buildingData = useMemo(() => {
    return wallets.map((w) => {
      const dims = getBuildingDimensions(w);
      const color = getBuildingColor(dims.height);
      const pos = walletWorldPos(w, dims);
      return { dims, color, pos };
    });
  }, [wallets]);

  // Set instance matrices, colors, and window attributes after mount
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || wallets.length === 0) return;

    const count = wallets.length;
    const colors = new Float32Array(count * 3);
    const windowColsArr = new Float32Array(count);
    const fillRatioArr = new Float32Array(count);
    const litRatioArr = new Float32Array(count);
    const seedArr = new Float32Array(count);
    const floorsArr = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const w = wallets[i];
      const { dims, color, pos } = buildingData[i];

      _dummy.position.set(pos[0], pos[1], pos[2]);
      _dummy.scale.set(dims.width, dims.height, dims.depth);
      _dummy.rotation.set(0, 0, 0);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);

      _color.set(color);
      colors[i * 3] = _color.r;
      colors[i * 3 + 1] = _color.g;
      colors[i * 3 + 2] = _color.b;

      // Window attributes
      windowColsArr[i] = getWindowCols(dims.width);
      fillRatioArr[i] = getWindowFillRatio(w.uniqueTokensSwapped ?? 0);
      litRatioArr[i] = getLitRatio(w.latestBlocktime);
      seedArr[i] = getInstanceSeed(w.address);
      floorsArr[i] = getWindowRows(floors(w.txnCount));
    }

    mesh.instanceMatrix.needsUpdate = true;

    // Building color via custom attribute (bypasses Three.js instancing color)
    mesh.geometry.setAttribute(
      "instanceBuildingColor",
      new THREE.InstancedBufferAttribute(colors, 3)
    );

    // Highlight attribute for hover effect (0.0 = normal, 1.0 = hovered)
    const highlightArr = new Float32Array(count);
    mesh.geometry.setAttribute(
      "instanceHighlight",
      new THREE.InstancedBufferAttribute(highlightArr, 1)
    );

    // Window attributes
    mesh.geometry.setAttribute(
      "instanceWindowCols",
      new THREE.InstancedBufferAttribute(windowColsArr, 1)
    );
    mesh.geometry.setAttribute(
      "instanceFillRatio",
      new THREE.InstancedBufferAttribute(fillRatioArr, 1)
    );
    mesh.geometry.setAttribute(
      "instanceLitRatio",
      new THREE.InstancedBufferAttribute(litRatioArr, 1)
    );
    mesh.geometry.setAttribute(
      "instanceSeed",
      new THREE.InstancedBufferAttribute(seedArr, 1)
    );
    mesh.geometry.setAttribute(
      "instanceFloors",
      new THREE.InstancedBufferAttribute(floorsArr, 1)
    );
  }, [wallets, buildingData]);

  // Hover effect + time uniform update
  useFrame((state) => {
    timeUniform.value = timeRef.current;
    elapsedUniform.value = state.clock.elapsedTime;
  });

  const handlePointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      const id = e.instanceId;
      if (id === undefined) {
        onHoverWindow?.(null);
        return;
      }

      // Update building highlight only when instance changes
      const prev = hoveredId.current;
      if (prev !== id) {
        const mesh = meshRef.current;
        if (mesh) {
          const highlightAttr = mesh.geometry.getAttribute(
            "instanceHighlight"
          ) as THREE.InstancedBufferAttribute;
          if (highlightAttr) {
            if (prev !== null) {
              highlightAttr.setX(prev, 0.0);
            }
            highlightAttr.setX(id, 1.0);
            highlightAttr.needsUpdate = true;
          }
        }
        hoveredId.current = id;
        document.body.style.cursor = "pointer";
      }

      // Tooltip logic
      if (!onHoverWindow) return;

      const w = wallets[id];

      // If this building is NOT the selected one, show building-level tooltip
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

      // Selected building — window-level token hit detection
      const faceNormal = e.face?.normal;
      if (!faceNormal || Math.abs(faceNormal.y) > 0.5) {
        onHoverWindow(null);
        return;
      }

      const { dims, pos } = buildingData[id];

      // Convert world hit to local box coords (-0.5 to 0.5)
      const localX = (e.point.x - pos[0]) / dims.width;
      const localY = (e.point.y - pos[1]) / dims.height;
      const localZ = (e.point.z - pos[2]) / dims.depth;

      // Face UV (matching shader logic)
      let faceU: number, faceV: number;
      if (Math.abs(faceNormal.x) > 0.5) {
        faceU = localZ + 0.5;
        faceV = localY + 0.5;
      } else {
        faceU = localX + 0.5;
        faceV = localY + 0.5;
      }

      const cols = getWindowCols(dims.width);
      const rows = getWindowRows(floors(w.txnCount));

      if (cols < 1 || rows < 1) {
        onHoverWindow(null);
        return;
      }

      const colIdx = Math.floor(faceU * cols);
      const rowIdx = Math.floor(faceV * rows);
      const cellU = faceU * cols - colIdx;
      const cellV = faceV * rows - rowIdx;

      if (!(cellU > 0.2 && cellU < 0.8 && cellV > 0.2 && cellV < 0.8)) {
        onHoverWindow(null);
        return;
      }

      // Deterministic token index from window position
      const seed = getInstanceSeed(w.address);
      const tokenIndex = Math.abs(
        (colIdx * 127 + rowIdx * 311 + Math.floor(seed * 10007)) | 0
      );

      onHoverWindow({
        address: w.address,
        tokenIndex,
        screenX: e.nativeEvent.clientX,
        screenY: e.nativeEvent.clientY,
        mode: "token",
      });
    },
    [wallets, buildingData, onHoverWindow, selectedAddress]
  );

  const handlePointerOut = useCallback(() => {
    const prev = hoveredId.current;
    const mesh = meshRef.current;
    if (prev !== null && mesh) {
      const highlightAttr = mesh.geometry.getAttribute(
        "instanceHighlight"
      ) as THREE.InstancedBufferAttribute;
      if (highlightAttr) {
        highlightAttr.setX(prev, 0.0);
        highlightAttr.needsUpdate = true;
      }
    }
    hoveredId.current = null;
    document.body.style.cursor = "default";
    onHoverWindow?.(null);
  }, [onHoverWindow]);

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      const id = e.instanceId;
      if (id === undefined || id >= wallets.length) return;
      const wallet = wallets[id];
      const { pos } = buildingData[id];
      onSelectWallet(wallet, pos);
    },
    [wallets, buildingData, onSelectWallet]
  );

  if (wallets.length === 0) return null;

  return (
    <instancedMesh
      key={wallets.length}
      ref={meshRef}
      args={[undefined!, undefined!, wallets.length]}
      frustumCulled={false}
      onPointerMove={handlePointerMove}
      onPointerOut={handlePointerOut}
      onClick={handleClick}
    >
      <boxGeometry args={[1, 1, 1]} />
      <primitive object={material} attach="material" />
    </instancedMesh>
  );
}
