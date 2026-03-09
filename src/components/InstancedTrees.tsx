"use client";

import { useRef, useEffect, useMemo } from "react";
import * as THREE from "three";

interface TreeData {
  pos: [number, number, number];
  scale: number;
}

/**
 * Renders all trees in the scene using two InstancedMesh draw calls
 * (one for trunks, one for canopies) instead of 2 meshes per tree.
 */
export default function InstancedTrees({ trees }: { trees: TreeData[] }) {
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const canopyRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    const trunk = trunkRef.current;
    const canopy = canopyRef.current;
    if (!trunk || !canopy) return;

    for (let i = 0; i < trees.length; i++) {
      const { pos, scale } = trees[i];

      // Position-based variation (matches original Tree component logic)
      const seed = Math.abs(pos[0] * 73.1 + pos[2] * 37.7);
      const v = 0.85 + ((seed % 100) / 100) * 0.3;

      const trunkH = 0.6 * scale * v;
      const canopyH = 1.4 * scale * v;

      // Trunk instance
      dummy.position.set(pos[0], trunkH / 2, pos[2]);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(scale, scale * v, scale);
      dummy.updateMatrix();
      trunk.setMatrixAt(i, dummy.matrix);

      // Canopy instance
      dummy.position.set(pos[0], trunkH + canopyH / 2.5, pos[2]);
      dummy.scale.set(scale * v, scale * v, scale * v);
      dummy.updateMatrix();
      canopy.setMatrixAt(i, dummy.matrix);
    }

    trunk.instanceMatrix.needsUpdate = true;
    canopy.instanceMatrix.needsUpdate = true;
  }, [trees, dummy]);

  if (trees.length === 0) return null;

  return (
    <>
      <instancedMesh ref={trunkRef} args={[undefined!, undefined!, trees.length]} frustumCulled={false}>
        <cylinderGeometry args={[0.08, 0.096, 0.6, 6]} />
        <meshStandardMaterial color="#6b4a35" />
      </instancedMesh>
      <instancedMesh ref={canopyRef} args={[undefined!, undefined!, trees.length]} frustumCulled={false}>
        <coneGeometry args={[0.6, 1.4, 7]} />
        <meshStandardMaterial color="#2e8b40" />
      </instancedMesh>
    </>
  );
}
