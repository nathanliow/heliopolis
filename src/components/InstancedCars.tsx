"use client";

import { useRef, useEffect, useMemo, useCallback } from "react";
import { useFrame, ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { PlacedWallet } from "@/types/wallet";
import { SwapEvent } from "@/lib/swap-events";
import { CarSystem } from "@/lib/car-system";
import { generatePathFromBuilding, generatePathPool, CarPath } from "@/lib/car-paths";
import { lampIntensity } from "@/lib/day-night";
import { WindowHoverInfo } from "./WindowTooltip";

const MAX_CARS = 60;
const WHEELS_PER_CAR = 4;
const TOTAL_WHEELS = MAX_CARS * WHEELS_PER_CAR;

// Car body dimensions
const BODY_W = 0.7;  // width (Z)
const BODY_H = 0.35; // height (Y)
const BODY_L = 1.5;  // length (X along travel)

// Cabin dimensions
const CAB_W = 0.6;
const CAB_H = 0.25;
const CAB_L = 0.65;
const CAB_OFFSET_Y = (BODY_H + CAB_H) / 2;
const CAB_OFFSET_FORWARD = -0.1; // slightly toward rear

// Wheel dimensions
const WHEEL_R = 0.12;
const WHEEL_H = 0.1;
const WHEEL_POSITIONS = [
  { dx: 0.45, dz: 0.3 },   // front-right
  { dx: 0.45, dz: -0.3 },  // front-left
  { dx: -0.45, dz: 0.3 },  // rear-right
  { dx: -0.45, dz: -0.3 }, // rear-left
];

// Invisible hitbox multiplier — makes clicks much easier
const HITBOX_SCALE = 3;

// Headlight decal
const HEADLIGHT_RADIUS = 3;
const HEADLIGHT_OFFSET_FORWARD = 2;

interface TrackedCarInfo {
  slotIndex: number;
  walletAddress: string;
  signature: string;
  tokenIn: string | null;
  tokenOut: string | null;
  amountSol: number | null;
}

interface InstancedCarsProps {
  swapQueueRef: React.MutableRefObject<SwapEvent[]>;
  wallets: PlacedWallet[];
  timeRef: React.MutableRefObject<number>;
  onHoverSwap?: (info: WindowHoverInfo | null) => void;
  onClickCar?: (info: TrackedCarInfo) => void;
  trackedCarSlot?: number | null;
  trackedCarPosRef?: React.MutableRefObject<[number, number, number] | null>;
  onCarDied?: (slotIndex: number) => void;
  selectedAddress?: string | null;
}

// Floating arrow marker for highlighted cars
const MARKER_HEIGHT_ABOVE_CAR = 2.5;
const MARKER_BOB_AMPLITUDE = 0.3;
const MARKER_BOB_SPEED = 3;

export type { TrackedCarInfo };

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

// Headlight decal shaders (matches InstancedLampPosts)
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

export default function InstancedCars({
  swapQueueRef,
  wallets,
  timeRef,
  onHoverSwap,
  onClickCar,
  trackedCarSlot,
  trackedCarPosRef,
  onCarDied,
  selectedAddress,
}: InstancedCarsProps) {
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const cabinRef = useRef<THREE.InstancedMesh>(null);
  const wheelRef = useRef<THREE.InstancedMesh>(null);
  const decalRef = useRef<THREE.InstancedMesh>(null);
  const hitboxRef = useRef<THREE.InstancedMesh>(null);
  const markerRef = useRef<THREE.InstancedMesh>(null);
  const hoveredSlot = useRef<number | null>(null);
  const elapsedRef = useRef(0);

  const carSystem = useMemo(() => new CarSystem(), []);

  // Wallet address -> PlacedWallet lookup
  const walletMap = useMemo(() => {
    const map = new Map<string, PlacedWallet>();
    for (const w of wallets) map.set(w.address, w);
    return map;
  }, [wallets]);

  // Pre-generate fallback path pool
  const pathPool = useMemo(() => generatePathPool(20), []);
  const pathPoolIdx = useRef(0);

  // Headlight decal material
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
        uColor: { value: new THREE.Color("#ffeedd") },
      },
    });
  }, []);

  // Initialize all instances to zero scale (invisible)
  useEffect(() => {
    const body = bodyRef.current;
    const cabin = cabinRef.current;
    const wheel = wheelRef.current;
    const decal = decalRef.current;
    const hitbox = hitboxRef.current;
    const marker = markerRef.current;
    if (!body || !cabin || !wheel || !decal || !hitbox || !marker) return;

    _dummy.scale.set(0, 0, 0);
    _dummy.position.set(0, -100, 0);
    _dummy.rotation.set(0, 0, 0);
    _dummy.updateMatrix();

    for (let i = 0; i < MAX_CARS; i++) {
      body.setMatrixAt(i, _dummy.matrix);
      cabin.setMatrixAt(i, _dummy.matrix);
      decal.setMatrixAt(i, _dummy.matrix);
      hitbox.setMatrixAt(i, _dummy.matrix);
      marker.setMatrixAt(i, _dummy.matrix);

      _color.set("#333333");
      body.setColorAt(i, _color);
      cabin.setColorAt(i, _color);
    }

    for (let i = 0; i < TOTAL_WHEELS; i++) {
      wheel.setMatrixAt(i, _dummy.matrix);
    }

    body.instanceMatrix.needsUpdate = true;
    cabin.instanceMatrix.needsUpdate = true;
    wheel.instanceMatrix.needsUpdate = true;
    decal.instanceMatrix.needsUpdate = true;
    hitbox.instanceMatrix.needsUpdate = true;
    marker.instanceMatrix.needsUpdate = true;
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
    if (cabin.instanceColor) cabin.instanceColor.needsUpdate = true;

    // Set a fixed bounding sphere so raycasting always tests individual instances.
    hitbox.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 400);
  }, []);

  // Main update loop
  useFrame((_, delta) => {
    const body = bodyRef.current;
    const cabin = cabinRef.current;
    const wheel = wheelRef.current;
    const decal = decalRef.current;
    const hitbox = hitboxRef.current;
    const marker = markerRef.current;
    if (!body || !cabin || !wheel || !decal || !hitbox || !marker) return;
    elapsedRef.current += delta;

    // 1. Drain swap queue
    const pending = swapQueueRef.current.splice(0);
    for (const evt of pending) {
      const w = walletMap.get(evt.walletAddress);
      let path: CarPath;
      if (w) {
        path = generatePathFromBuilding(w.blockRow, w.blockCol);
      } else {
        path = pathPool[pathPoolIdx.current % pathPool.length];
        pathPoolIdx.current++;
      }
      carSystem.spawnCar(
        path,
        evt.walletAddress,
        evt.signature,
        evt.tokenIn,
        evt.tokenOut,
        evt.amountSol,
      );
    }

    // 2. Update car system
    carSystem.update(delta);

    // 3. Update instance matrices
    const intensity = lampIntensity(timeRef.current);
    decalMaterial.uniforms.uIntensity.value = intensity;

    for (let i = 0; i < MAX_CARS; i++) {
      const car = carSystem.cars[i];
      if (!car || car.phase === "dead") {
        // Hide this slot
        _dummy.scale.set(0, 0, 0);
        _dummy.position.set(0, -100, 0);
        _dummy.rotation.set(0, 0, 0);
        _dummy.updateMatrix();

        body.setMatrixAt(i, _dummy.matrix);
        cabin.setMatrixAt(i, _dummy.matrix);
        decal.setMatrixAt(i, _dummy.matrix);
        hitbox.setMatrixAt(i, _dummy.matrix);
        marker.setMatrixAt(i, _dummy.matrix);

        for (let w = 0; w < WHEELS_PER_CAR; w++) {
          wheel.setMatrixAt(i * WHEELS_PER_CAR + w, _dummy.matrix);
        }
        continue;
      }

      const pos = carSystem.getCarPosition(car);
      const isHighlighted = selectedAddress != null && car.walletAddress === selectedAddress;
      const s = pos.scale;
      const sinR = Math.sin(pos.rotY);
      const cosR = Math.cos(pos.rotY);

      // Body — Z is the long (travel) axis, X is the width
      _dummy.position.set(pos.x, pos.y, pos.z);
      _dummy.rotation.set(0, pos.rotY, 0);
      _dummy.scale.set(BODY_W * s, BODY_H * s, BODY_L * s);
      _dummy.updateMatrix();
      body.setMatrixAt(i, _dummy.matrix);

      // Hitbox — same position/rotation, scaled up for easier clicking
      _dummy.scale.set(BODY_W * HITBOX_SCALE * s, BODY_H * HITBOX_SCALE * s, BODY_L * HITBOX_SCALE * s);
      _dummy.updateMatrix();
      hitbox.setMatrixAt(i, _dummy.matrix);

      _color.copy(car.color);
      body.setColorAt(i, _color);

      // Cabin — Z is the long (travel) axis
      const cabX = pos.x + sinR * CAB_OFFSET_FORWARD;
      const cabZ = pos.z + cosR * CAB_OFFSET_FORWARD;
      _dummy.position.set(cabX, pos.y + CAB_OFFSET_Y * s, cabZ);
      _dummy.rotation.set(0, pos.rotY, 0);
      _dummy.scale.set(CAB_W * s, CAB_H * s, CAB_L * s);
      _dummy.updateMatrix();
      cabin.setMatrixAt(i, _dummy.matrix);

      _color.copy(car.color).multiplyScalar(0.8);
      cabin.setColorAt(i, _color);

      // Wheels
      for (let w = 0; w < WHEELS_PER_CAR; w++) {
        const wp = WHEEL_POSITIONS[w];
        // Rotate wheel offsets by car rotation
        const wx = pos.x + (sinR * wp.dx + cosR * wp.dz) * s;
        const wz = pos.z + (cosR * wp.dx - sinR * wp.dz) * s;
        const wy = 0.02 + WHEEL_R * s;

        _dummy.position.set(wx, wy, wz);
        // Wheel rotated 90deg on Z so cylinder lies on side, then align with car heading
        _dummy.rotation.set(0, pos.rotY, Math.PI / 2);
        _dummy.scale.set(WHEEL_R * s, WHEEL_H * s, WHEEL_R * s);
        _dummy.updateMatrix();
        wheel.setMatrixAt(i * WHEELS_PER_CAR + w, _dummy.matrix);
      }

      // Headlight decal — flat on ground, offset ahead of car
      const hlX = pos.x + sinR * HEADLIGHT_OFFSET_FORWARD;
      const hlZ = pos.z + cosR * HEADLIGHT_OFFSET_FORWARD;
      _dummy.position.set(hlX, 0.03, hlZ);
      _dummy.rotation.set(-Math.PI / 2, 0, 0);
      _dummy.scale.set(HEADLIGHT_RADIUS * s, HEADLIGHT_RADIUS * s, 1);
      _dummy.updateMatrix();
      decal.setMatrixAt(i, _dummy.matrix);

      // Arrow marker — floating above highlighted cars, bobbing
      if (isHighlighted) {
        const bob = Math.sin(elapsedRef.current * MARKER_BOB_SPEED) * MARKER_BOB_AMPLITUDE;
        _dummy.position.set(pos.x, pos.y + MARKER_HEIGHT_ABOVE_CAR + bob, pos.z);
        _dummy.rotation.set(Math.PI, 0, 0); // cone points downward
        _dummy.scale.set(0.4, 0.6, 0.4);
        _dummy.updateMatrix();
        marker.setMatrixAt(i, _dummy.matrix);
      } else {
        _dummy.scale.set(0, 0, 0);
        _dummy.position.set(0, -100, 0);
        _dummy.rotation.set(0, 0, 0);
        _dummy.updateMatrix();
        marker.setMatrixAt(i, _dummy.matrix);
      }
    }

    body.instanceMatrix.needsUpdate = true;
    cabin.instanceMatrix.needsUpdate = true;
    wheel.instanceMatrix.needsUpdate = true;
    decal.instanceMatrix.needsUpdate = true;
    hitbox.instanceMatrix.needsUpdate = true;
    marker.instanceMatrix.needsUpdate = true;
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
    if (cabin.instanceColor) cabin.instanceColor.needsUpdate = true;

    // Update tracked car position ref for camera following
    if (trackedCarSlot != null && trackedCarPosRef) {
      const trackedCar = carSystem.cars[trackedCarSlot];
      if (trackedCar && trackedCar.phase !== "dead") {
        const tp = carSystem.getCarPosition(trackedCar);
        trackedCarPosRef.current = [tp.x, tp.y, tp.z];
      } else {
        trackedCarPosRef.current = null;
        onCarDied?.(trackedCarSlot);
      }
    }
  });

  // Click handler
  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      const id = e.instanceId;
      if (id === undefined || !onClickCar) return;
      const car = carSystem.getCarSwapInfo(id);
      if (!car) return;
      onClickCar({
        slotIndex: id,
        walletAddress: car.walletAddress,
        signature: car.signature,
        tokenIn: car.tokenIn,
        tokenOut: car.tokenOut,
        amountSol: car.amountSol,
      });
    },
    [carSystem, onClickCar],
  );

  // Hover handlers on body mesh
  const handlePointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      const id = e.instanceId;
      if (id === undefined) {
        onHoverSwap?.(null);
        return;
      }

      hoveredSlot.current = id;
      document.body.style.cursor = "pointer";

      const car = carSystem.getCarSwapInfo(id);
      if (!car || !onHoverSwap) return;

      onHoverSwap({
        address: car.walletAddress,
        tokenIndex: 0,
        screenX: e.nativeEvent.clientX,
        screenY: e.nativeEvent.clientY,
        mode: "swap",
        swapSignature: car.signature,
        swapTokenIn: car.tokenIn ?? undefined,
        swapTokenOut: car.tokenOut ?? undefined,
        swapAmountSol: car.amountSol ?? undefined,
      });
    },
    [carSystem, onHoverSwap],
  );

  const handlePointerOut = useCallback(() => {
    hoveredSlot.current = null;
    document.body.style.cursor = "default";
    onHoverSwap?.(null);
  }, [onHoverSwap]);

  return (
    <>
      {/* Invisible hitbox — 3x larger for easy clicking/hovering */}
      <instancedMesh
        ref={hitboxRef}
        args={[undefined!, undefined!, MAX_CARS]}
        frustumCulled={false}
        onPointerMove={handlePointerMove}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </instancedMesh>

      {/* Car body */}
      <instancedMesh
        ref={bodyRef}
        args={[undefined!, undefined!, MAX_CARS]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.6} metalness={0.3} />
      </instancedMesh>

      {/* Cabin */}
      <instancedMesh
        ref={cabinRef}
        args={[undefined!, undefined!, MAX_CARS]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.5} metalness={0.2} />
      </instancedMesh>

      {/* Wheels */}
      <instancedMesh
        ref={wheelRef}
        args={[undefined!, undefined!, TOTAL_WHEELS]}
        frustumCulled={false}
      >
        <cylinderGeometry args={[1, 1, 1, 8]} />
        <meshStandardMaterial color="#222222" roughness={0.8} metalness={0.1} />
      </instancedMesh>

      {/* Headlight decals */}
      <instancedMesh
        ref={decalRef}
        args={[undefined!, undefined!, MAX_CARS]}
        frustumCulled={false}
        renderOrder={-1}
        material={decalMaterial}
      >
        <circleGeometry args={[1, 32]} />
      </instancedMesh>

      {/* Arrow markers — floating above highlighted cars */}
      <instancedMesh
        ref={markerRef}
        args={[undefined!, undefined!, MAX_CARS]}
        frustumCulled={false}
      >
        <coneGeometry args={[1, 1, 6]} />
        <meshBasicMaterial
          color="#8b5cf6"
          transparent
          opacity={0.7}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </instancedMesh>
    </>
  );
}
