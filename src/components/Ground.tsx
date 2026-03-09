"use client";

interface GroundProps {
  size: number;
}

export default function Ground({ size }: GroundProps) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial color="#4a4a65" />
    </mesh>
  );
}
