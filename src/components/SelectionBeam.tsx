"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface SelectionBeamProps {
  position: [number, number, number];
  buildingHeight: number;
}

export default function SelectionBeam({ position, buildingHeight }: SelectionBeamProps) {
  const beamRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.PointLight>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    // Pulsing beam opacity
    if (beamRef.current) {
      const mat = beamRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.25 + Math.sin(t * 2) * 0.1;
    }

    // Pulsing glow light
    if (glowRef.current) {
      glowRef.current.intensity = 8 + Math.sin(t * 2) * 3;
    }
  });

  const beamHeight = 80;
  const beamY = buildingHeight + beamHeight / 2;

  return (
    <group position={position}>
      {/* Vertical beam */}
      <mesh ref={beamRef} position={[0, beamY - position[1], 0]}>
        <cylinderGeometry args={[0.15, 0.4, beamHeight, 8]} />
        <meshBasicMaterial
          color="#8b5cf6"
          transparent
          opacity={0.3}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Point light glow at top of building */}
      <pointLight
        ref={glowRef}
        position={[0, buildingHeight - position[1] + 2, 0]}
        color="#8b5cf6"
        intensity={8}
        distance={30}
        decay={2}
      />
    </group>
  );
}
