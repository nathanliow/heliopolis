"use client";

interface ParkProps {
  position: [number, number, number];
  width: number;
  depth: number;
}

/**
 * A park block — green ground with walking paths.
 * Trees are rendered externally via InstancedTrees for performance.
 */
export default function Park({ position, width, depth }: ParkProps) {
  return (
    <group>
      {/* Green ground for the park */}
      <mesh
        position={[position[0], 0.01, position[2]]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color="#2d6b2d" />
      </mesh>

      {/* Walking path through the park */}
      <mesh
        position={[position[0], 0.03, position[2]]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[0.8, depth * 0.85]} />
        <meshStandardMaterial color="#6b6055" />
      </mesh>
      <mesh
        position={[position[0], 0.03, position[2]]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[width * 0.85, 0.8]} />
        <meshStandardMaterial color="#6b6055" />
      </mesh>
    </group>
  );
}
