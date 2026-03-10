"use client";

import { useRef, useEffect, useMemo, MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CollisionMap } from "@/lib/collision-map";
import {
  CarInput,
  CarState,
  createCarState,
  updateCar,
  CAR_Y,
} from "@/lib/player-car";

interface PlayerCarProps {
  active: boolean;
  collisionMap: CollisionMap | null;
  positionRef: MutableRefObject<[number, number, number] | null>;
  headingRef: MutableRefObject<number>;
}

export default function PlayerCar({ active, collisionMap, positionRef, headingRef }: PlayerCarProps) {
  const groupRef = useRef<THREE.Group>(null);
  const arrowRef = useRef<THREE.Mesh>(null);
  const inputRef = useRef<CarInput>({
    forward: false,
    backward: false,
    left: false,
    right: false,
    brake: false,
  });
  const stateRef = useRef<CarState>(createCarState());

  // Reset car state when entering car mode
  useEffect(() => {
    if (active) {
      stateRef.current = createCarState();
      inputRef.current = {
        forward: false,
        backward: false,
        left: false,
        right: false,
        brake: false,
      };
    } else {
      positionRef.current = null;
    }
  }, [active, positionRef]);

  // Keyboard listeners
  useEffect(() => {
    if (!active) return;

    function handleKey(e: KeyboardEvent, down: boolean) {
      // Skip if typing in an input field
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      const input = inputRef.current;
      switch (e.key) {
        case "w":
        case "W":
        case "ArrowUp":
          input.forward = down;
          if (e.key.startsWith("Arrow")) e.preventDefault();
          break;
        case "s":
        case "S":
        case "ArrowDown":
          input.backward = down;
          if (e.key.startsWith("Arrow")) e.preventDefault();
          break;
        case "a":
        case "A":
        case "ArrowLeft":
          input.left = down;
          if (e.key.startsWith("Arrow")) e.preventDefault();
          break;
        case "d":
        case "D":
        case "ArrowRight":
          input.right = down;
          if (e.key.startsWith("Arrow")) e.preventDefault();
          break;
        case " ":
          input.brake = down;
          e.preventDefault();
          break;
      }
    }

    const onDown = (e: KeyboardEvent) => handleKey(e, true);
    const onUp = (e: KeyboardEvent) => handleKey(e, false);

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [active]);

  // Physics + rendering each frame
  useFrame((_, delta) => {
    if (!active || !groupRef.current) return;

    const state = stateRef.current;
    updateCar(state, inputRef.current, delta, collisionMap);

    // Update mesh transforms
    groupRef.current.position.set(state.x, CAR_Y, state.z);
    groupRef.current.rotation.y = state.heading;
    groupRef.current.visible = true;

    // Write position + heading for camera tracking
    positionRef.current = [state.x, CAR_Y, state.z];
    headingRef.current = state.heading;

    // Bobbing arrow
    if (arrowRef.current) {
      arrowRef.current.position.y = 2.0 + Math.sin(Date.now() * 0.003) * 0.2;
    }
  });

  // Hide when inactive
  useFrame(() => {
    if (!active && groupRef.current) {
      groupRef.current.visible = false;
    }
  });

  // Materials
  const bodyMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#E35930",
    metalness: 0.4,
    roughness: 0.5,
  }), []);

  const cabinMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#b8421f",
    metalness: 0.3,
    roughness: 0.6,
  }), []);

  const wheelMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#333333",
    metalness: 0.2,
    roughness: 0.8,
  }), []);

  const arrowMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#8b5cf6",
    emissive: "#8b5cf6",
    emissiveIntensity: 0.6,
    transparent: true,
    opacity: 0.85,
  }), []);

  return (
    <group ref={groupRef} visible={false}>
      {/* Body */}
      <mesh material={bodyMat}>
        <boxGeometry args={[0.7, 0.35, 1.5]} />
      </mesh>

      {/* Cabin */}
      <mesh position={[0, 0.25, -0.1]} material={cabinMat}>
        <boxGeometry args={[0.6, 0.25, 0.65]} />
      </mesh>

      {/* Wheels */}
      {[
        [-0.35, -0.12, 0.45],
        [0.35, -0.12, 0.45],
        [-0.35, -0.12, -0.45],
        [0.35, -0.12, -0.45],
      ].map((pos, i) => (
        <mesh key={i} position={pos as [number, number, number]} rotation={[0, 0, Math.PI / 2]} material={wheelMat}>
          <cylinderGeometry args={[0.12, 0.12, 0.1, 8]} />
        </mesh>
      ))}

      {/* Floating arrow marker */}
      <mesh ref={arrowRef} position={[0, 2.0, 0]} rotation={[Math.PI, 0, 0]} material={arrowMat}>
        <coneGeometry args={[0.25, 0.5, 4]} />
      </mesh>
    </group>
  );
}
