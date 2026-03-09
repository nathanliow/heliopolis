"use client";

import { useRef, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import * as THREE from "three";
import { getDayNightState, CYCLE_DURATION } from "@/lib/day-night";

interface SceneLightingProps {
  timeRef: React.MutableRefObject<number>;
  autoModeRef: React.MutableRefObject<boolean>;
}

export default function SceneLighting({
  timeRef,
  autoModeRef,
}: SceneLightingProps) {
  const { scene } = useThree();
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const accentRef = useRef<THREE.PointLight>(null);
  const starsGroupRef = useRef<THREE.Group>(null);

  // Initialize scene background and fog
  useEffect(() => {
    scene.background = new THREE.Color("#0a0a12");
    scene.fog = new THREE.Fog("#0a0a12", 480, 1000);
  }, [scene]);

  useFrame((_, delta) => {
    // Advance time when auto-cycling
    if (autoModeRef.current) {
      timeRef.current = (timeRef.current + delta / CYCLE_DURATION) % 1;
    }

    const state = getDayNightState(timeRef.current);

    // Background
    if (scene.background instanceof THREE.Color) {
      scene.background.copy(state.skyColor);
    }

    // Fog
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(state.fogColor);
      scene.fog.near = state.fogNear;
      scene.fog.far = state.fogFar;
    }

    // Ambient light
    if (ambientRef.current) {
      ambientRef.current.color.copy(state.ambientColor);
      ambientRef.current.intensity = state.ambientIntensity;
    }

    // Directional "sun" light
    if (sunRef.current) {
      sunRef.current.color.copy(state.sunColor);
      sunRef.current.intensity = state.sunIntensity;
      sunRef.current.position.copy(state.sunPosition);
    }

    // Hemisphere light (sky/ground fill)
    if (hemiRef.current) {
      hemiRef.current.color.copy(state.hemiSkyColor);
      hemiRef.current.groundColor.copy(state.hemiGroundColor);
      hemiRef.current.intensity = state.hemiIntensity;
    }

    // Accent point light (indigo atmospheric)
    if (accentRef.current) {
      accentRef.current.color.copy(state.accentColor);
      accentRef.current.intensity = state.accentIntensity;
    }

    // Stars fade
    if (starsGroupRef.current) {
      starsGroupRef.current.traverse((child) => {
        if (child instanceof THREE.Points) {
          const mat = child.material as THREE.PointsMaterial;
          mat.transparent = true;
          mat.opacity = state.starsOpacity;
        }
      });
    }
  });

  return (
    <>
      <ambientLight ref={ambientRef} intensity={0.15} />
      <directionalLight ref={sunRef} position={[50, 0, 20]} intensity={0} />
      <hemisphereLight ref={hemiRef} args={["#111122", "#0a0a0a", 0.05]} />
      <pointLight
        ref={accentRef}
        position={[-20, 30, -20]}
        intensity={0.4}
        color="#6366f1"
      />
      <group ref={starsGroupRef}>
        <Stars
          radius={400}
          depth={200}
          count={2000}
          factor={4}
          fade
          speed={1}
        />
      </group>
    </>
  );
}
