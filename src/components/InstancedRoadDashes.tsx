"use client";

import { useRef, useEffect, useMemo } from "react";
import * as THREE from "three";

interface DashData {
  x: number;
  z: number;
  rotY: number; // 0 for vertical roads, PI/2 for horizontal
}

/**
 * Renders all road center-line dashes as a single InstancedMesh.
 */
export default function InstancedRoadDashes({ dashes }: { dashes: DashData[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    for (let i = 0; i < dashes.length; i++) {
      dummy.position.set(dashes[i].x, 0.04, dashes[i].z);
      dummy.rotation.set(-Math.PI / 2, 0, dashes[i].rotY);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
  }, [dashes, dummy]);

  if (dashes.length === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined!, undefined!, dashes.length]} frustumCulled={false}>
      <planeGeometry args={[0.15, 1.2]} />
      <meshStandardMaterial color="#6a6a80" />
    </instancedMesh>
  );
}
