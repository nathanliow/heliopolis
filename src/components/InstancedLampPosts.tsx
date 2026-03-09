"use client";

import { useRef, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { lampIntensity } from "@/lib/day-night";

interface LampDatum {
  pos: [number, number, number];
  rotY: number;
}

interface InstancedLampPostsProps {
  lamps: LampDatum[];
  timeRef: React.MutableRefObject<number>;
}

const POLE_HEIGHT = 3.2;
const ARM_LENGTH = 0.7;
const DECAL_RADIUS = 4.5;

const decalVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

const decalFragmentShader = /* glsl */ `
  uniform float uIntensity;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    vec2 center = vUv - 0.5;
    float dist = length(center) * 2.0;
    float falloff = 1.0 - smoothstep(0.0, 1.0, dist);
    falloff *= falloff;
    gl_FragColor = vec4(uColor, falloff * uIntensity * 0.3);
  }
`;

export default function InstancedLampPosts({ lamps, timeRef }: InstancedLampPostsProps) {
  const poleRef = useRef<THREE.InstancedMesh>(null);
  const armRef = useRef<THREE.InstancedMesh>(null);
  const housingRef = useRef<THREE.InstancedMesh>(null);
  const bulbRef = useRef<THREE.InstancedMesh>(null);
  const bulbMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const decalRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Precompute arm-tip world positions for every lamp (avoids trig each frame)
  const tipPositions = useMemo(() => {
    return lamps.map(({ pos, rotY }) => {
      const dx = Math.cos(rotY) * ARM_LENGTH;
      const dz = -Math.sin(rotY) * ARM_LENGTH;
      return new THREE.Vector3(pos[0] + dx, pos[1] + POLE_HEIGHT - 0.25, pos[2] + dz);
    });
  }, [lamps]);

  const decalMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: decalVertexShader,
      fragmentShader: decalFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      uniforms: {
        uIntensity: { value: 0 },
        uColor: { value: new THREE.Color("#ffcc66") },
      },
    });
  }, []);

  // Set instance matrices
  useEffect(() => {
    const pole = poleRef.current;
    const arm = armRef.current;
    const housing = housingRef.current;
    const bulb = bulbRef.current;
    const decal = decalRef.current;
    if (!pole || !arm || !housing || !bulb || !decal) return;

    for (let i = 0; i < lamps.length; i++) {
      const { pos, rotY } = lamps[i];
      const [x, y, z] = pos;
      const cosR = Math.cos(rotY);
      const sinR = -Math.sin(rotY);

      // Pole
      dummy.position.set(x, y + POLE_HEIGHT / 2, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      pole.setMatrixAt(i, dummy.matrix);

      // Arm
      dummy.position.set(
        x + cosR * ARM_LENGTH / 2,
        y + POLE_HEIGHT - 0.05,
        z + sinR * ARM_LENGTH / 2,
      );
      dummy.rotation.set(0, rotY, Math.PI / 2);
      dummy.updateMatrix();
      arm.setMatrixAt(i, dummy.matrix);

      // Housing
      dummy.position.set(
        x + cosR * ARM_LENGTH,
        y + POLE_HEIGHT - 0.15,
        z + sinR * ARM_LENGTH,
      );
      dummy.rotation.set(0, rotY, 0);
      dummy.updateMatrix();
      housing.setMatrixAt(i, dummy.matrix);

      // Bulb
      dummy.position.set(
        x + cosR * ARM_LENGTH,
        y + POLE_HEIGHT - 0.22,
        z + sinR * ARM_LENGTH,
      );
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      bulb.setMatrixAt(i, dummy.matrix);

      // Decal — flat circle on the ground beneath the lamp tip
      const tip = tipPositions[i];
      dummy.position.set(tip.x, 0.01, tip.z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.set(DECAL_RADIUS, DECAL_RADIUS, 1);
      dummy.updateMatrix();
      decal.setMatrixAt(i, dummy.matrix);
    }

    pole.instanceMatrix.needsUpdate = true;
    arm.instanceMatrix.needsUpdate = true;
    housing.instanceMatrix.needsUpdate = true;
    bulb.instanceMatrix.needsUpdate = true;
    decal.instanceMatrix.needsUpdate = true;
  }, [lamps, dummy, tipPositions]);

  useFrame(() => {
    const intensity = lampIntensity(timeRef.current);

    // Update bulb emissive
    if (bulbMatRef.current) {
      bulbMatRef.current.emissiveIntensity = intensity * 2.5;
      bulbMatRef.current.opacity = 0.3 + intensity * 0.7;
    }

    // Update decal intensity
    decalMaterial.uniforms.uIntensity.value = intensity;
  });

  if (lamps.length === 0) return null;

  return (
    <>
      <instancedMesh ref={poleRef} args={[undefined!, undefined!, lamps.length]} frustumCulled={false}>
        <cylinderGeometry args={[0.04, 0.06, POLE_HEIGHT, 6]} />
        <meshStandardMaterial color="#555566" metalness={0.6} roughness={0.4} />
      </instancedMesh>
      <instancedMesh ref={armRef} args={[undefined!, undefined!, lamps.length]} frustumCulled={false}>
        <cylinderGeometry args={[0.03, 0.03, ARM_LENGTH, 4]} />
        <meshStandardMaterial color="#555566" metalness={0.6} roughness={0.4} />
      </instancedMesh>
      <instancedMesh ref={housingRef} args={[undefined!, undefined!, lamps.length]} frustumCulled={false}>
        <boxGeometry args={[0.22, 0.12, 0.16]} />
        <meshStandardMaterial color="#444455" metalness={0.5} roughness={0.3} />
      </instancedMesh>
      <instancedMesh ref={bulbRef} args={[undefined!, undefined!, lamps.length]} frustumCulled={false}>
        <sphereGeometry args={[0.1, 6, 6]} />
        <meshStandardMaterial
          ref={bulbMatRef}
          color="#ffcc66"
          emissive="#ffcc66"
          emissiveIntensity={0}
          transparent
          opacity={0.3}
        />
      </instancedMesh>

      {/* Instanced ground decals — one additive-blended circle per lamp */}
      <instancedMesh ref={decalRef} args={[undefined!, undefined!, lamps.length]} frustumCulled={false} renderOrder={-1} material={decalMaterial}>
        <circleGeometry args={[1, 32]} />
      </instancedMesh>
    </>
  );
}
