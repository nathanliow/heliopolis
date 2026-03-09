"use client";

import { useRef, useState, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Mesh, Color, AdditiveBlending } from "three";
import { WalletBuilding } from "@/types/wallet";
import { getBuildingDimensions, getBuildingColor } from "@/lib/building-math";

interface BuildingProps {
  wallet: WalletBuilding;
  position: [number, number, number];
  selected?: boolean;
  onSelect: (wallet: WalletBuilding, position: [number, number, number]) => void;
}

const BEAM_HEIGHT = 60;

/**
 * Selection effect — only mounted when a building is selected.
 * Isolates the useFrame callback so unselected buildings have zero per-frame cost.
 */
function SelectionEffect({
  position,
  height,
  width,
  depth,
  color,
}: {
  position: [number, number, number];
  height: number;
  width: number;
  depth: number;
  color: Color;
}) {
  const glowRef = useRef<Mesh>(null);
  const beamRef = useRef<Mesh>(null);
  const buildingMatRef = useRef<import("three").MeshStandardMaterial>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const pulse = 0.4 + Math.sin(t * 2.5) * 0.2;

    if (buildingMatRef.current) {
      buildingMatRef.current.emissiveIntensity = pulse;
    }
    if (glowRef.current) {
      glowRef.current.scale.set(1 + pulse * 0.15, 1, 1 + pulse * 0.15);
      const gMat = glowRef.current.material as import("three").MeshBasicMaterial;
      gMat.opacity = 0.12 + Math.sin(t * 2.5) * 0.06;
    }
    if (beamRef.current) {
      const bMat = beamRef.current.material as import("three").MeshBasicMaterial;
      bMat.opacity = 0.15 + Math.sin(t * 3) * 0.07;
    }
  });

  return (
    <>
      {/* Invisible overlay mesh to drive emissive on the building —
          we attach the material ref here and sync it in useFrame.
          Actually, let's just render the glow shell and beam. */}
      <mesh ref={glowRef} position={position}>
        <boxGeometry args={[width + 0.4, height + 0.2, depth + 0.4]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.15}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      <mesh
        ref={beamRef}
        position={[position[0], position[1] - height / 2 + height + BEAM_HEIGHT / 2, position[2]]}
      >
        <cylinderGeometry args={[0.08, Math.max(width, depth) * 0.4, BEAM_HEIGHT, 8, 1, true]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.18}
          blending={AdditiveBlending}
          depthWrite={false}
          side={2}
        />
      </mesh>
    </>
  );
}

export default function Building({ wallet, position, selected, onSelect }: BuildingProps) {
  const [hovered, setHovered] = useState(false);

  const { height, width, depth } = getBuildingDimensions(wallet);
  const color = getBuildingColor(height);
  const colorObj = useMemo(() => new Color(color), [color]);

  const y = position[1] + height / 2;

  return (
    <group>
      <mesh
        position={[position[0], y, position[2]]}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "default";
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(wallet, [position[0], y, position[2]]);
        }}
      >
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial
          color={hovered || selected ? "#ffffff" : color}
          emissive={hovered ? color : selected ? colorObj : "#000000"}
          emissiveIntensity={hovered ? 0.3 : selected ? 0.5 : 0}
        />
      </mesh>

      {/* Only mounted when selected — no per-frame cost for unselected buildings */}
      {selected && (
        <SelectionEffect
          position={[position[0], y, position[2]]}
          height={height}
          width={width}
          depth={depth}
          color={colorObj}
        />
      )}
    </group>
  );
}
