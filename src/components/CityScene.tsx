"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import CityGrid from "./CityGrid";
import SceneLighting from "./SceneLighting";
import SelectionBeam from "./SelectionBeam";
import WalletPanel from "./WalletPanel";
import AuthPanel from "./AuthPanel";
import WalletSearch from "./WalletSearch";
import { WalletBuilding, PlacedWallet } from "@/types/wallet";
import { getBuildingDimensions, getWalletWorldPosition } from "@/lib/building-math";
import WindowTooltip, { WindowHoverInfo } from "./WindowTooltip";
import InstancedCars, { TrackedCarInfo } from "./InstancedCars";
import SwapPanel from "./SwapPanel";
import { useSwapEvents } from "@/lib/swap-events";
import HowItWorksModal from "./HowItWorksModal";
import { useAuth } from "@/context/AuthContext";
import { lazy, Suspense, useMemo } from "react";
import PlayerCar from "./PlayerCar";
import { buildCollisionMap } from "@/lib/collision-map";

const CitizenCardModal = lazy(() => import("./CitizenCardModal"));

const _trackTarget = new THREE.Vector3();
const _prevTarget = new THREE.Vector3();
const _delta = new THREE.Vector3();
const _desiredCamPos = new THREE.Vector3();

// Chase camera constants
const CHASE_DISTANCE = 18;
const CHASE_HEIGHT = 10;
const CHASE_LOOK_AHEAD = 8;
const CHASE_CAM_LERP = 0.06;

function CameraControls({
  targetPosition,
  trackingRef,
  isTracking,
  playerCarMode,
  headingRef,
}: {
  targetPosition: [number, number, number] | null;
  trackingRef: React.MutableRefObject<[number, number, number] | null>;
  isTracking: boolean;
  playerCarMode: boolean;
  headingRef: React.MutableRefObject<number>;
}) {
  const controlsRef = useRef<OrbitControlsImpl>(null);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    if (playerCarMode) {
      // Disable all user camera manipulation in chase-cam mode
      controls.enableRotate = false;
      controls.enablePan = false;
      controls.enableZoom = false;
      return;
    }

    if (isTracking) {
      // Orbit mode for AI car tracking — useFrame handles position
      controls.enableRotate = true;
      controls.enablePan = false;
      controls.enableZoom = true;
      controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      };
      return;
    }

    controls.enableZoom = true;

    if (targetPosition) {
      const target = new THREE.Vector3(...targetPosition);
      const start = controls.target.clone();
      const startTime = performance.now();
      const duration = 400;

      function animate() {
        const elapsed = performance.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - t, 3);

        controls!.target.lerpVectors(start, target, ease);
        controls!.update();

        if (t < 1) {
          requestAnimationFrame(animate);
        }
      }
      animate();

      controls.enableRotate = true;
      controls.enablePan = false;
      controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      };
    } else {
      controls.enableRotate = true;
      controls.enablePan = true;
      controls.mouseButtons = {
        LEFT: THREE.MOUSE.PAN,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.ROTATE,
      };
    }
  }, [targetPosition, isTracking, playerCarMode]);

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls || !isTracking || !trackingRef.current) return;

    const pos = trackingRef.current;

    if (playerCarMode) {
      // Chase camera: position behind & above the car, look ahead of it
      const heading = headingRef.current;
      _desiredCamPos.set(
        pos[0] - Math.sin(heading) * CHASE_DISTANCE,
        pos[1] + CHASE_HEIGHT,
        pos[2] - Math.cos(heading) * CHASE_DISTANCE,
      );
      controls.object.position.lerp(_desiredCamPos, CHASE_CAM_LERP);

      // Look ahead of the car
      _trackTarget.set(
        pos[0] + Math.sin(heading) * CHASE_LOOK_AHEAD,
        pos[1] + 1,
        pos[2] + Math.cos(heading) * CHASE_LOOK_AHEAD,
      );
      controls.target.lerp(_trackTarget, CHASE_CAM_LERP);
      controls.update();
      return;
    }

    // AI car tracking — translate both target and camera by the same delta
    _trackTarget.set(pos[0], pos[1], pos[2]);
    _prevTarget.copy(controls.target);
    controls.target.lerp(_trackTarget, 0.08);
    _delta.subVectors(controls.target, _prevTarget);
    controls.object.position.add(_delta);
    controls.update();
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      minDistance={10}
      maxDistance={500}
      maxPolarAngle={Math.PI / 2.1}
      enableDamping
      dampingFactor={0.05}
      enableRotate={false}
      enablePan={true}
      panSpeed={1.5}
      screenSpacePanning={false}
    />
  );
}

const TIME_PRESETS = [
  { id: "sunrise", label: "Sunrise", time: 0.0 },
  { id: "day", label: "Day", time: 0.25 },
  { id: "sunset", label: "Sunset", time: 0.5 },
  { id: "night", label: "Night", time: 0.75 },
] as const;

export default function CityScene() {
  const [selectedWallet, setSelectedWallet] = useState<WalletBuilding | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<[number, number, number] | null>(null);
  const [wallets, setWallets] = useState<PlacedWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [windowHover, setWindowHover] = useState<WindowHoverInfo | null>(null);
  const [showCard, setShowCard] = useState(false);
  const { profile } = useAuth();

  // Day/night cycle state (refs to avoid per-frame re-renders)
  const timeRef = useRef(0.75);
  const autoModeRef = useRef(true);
  const [activePreset, setActivePreset] = useState("cycle");

  // Swap events — mutable ref queue, no re-renders
  const swapQueueRef = useSwapEvents(wallets);

  // Tracked car state — trackedCar controls the panel UI,
  // cameraFollowSlot controls which car the camera follows (persists after panel close)
  const [trackedCar, setTrackedCar] = useState<TrackedCarInfo | null>(null);
  const trackedCarPosRef = useRef<[number, number, number] | null>(null);
  const [cameraFollowSlot, setCameraFollowSlot] = useState<number | null>(null);

  // Player car mode
  const [carMode, setCarMode] = useState(false);
  const playerCarPosRef = useRef<[number, number, number] | null>(null);
  const playerCarHeadingRef = useRef(0);

  const collisionMap = useMemo(
    () => (carMode ? buildCollisionMap(wallets) : null),
    [wallets, carMode],
  );

  const fetchWallets = useCallback(async (): Promise<PlacedWallet[]> => {
    try {
      const res = await fetch(`/api/wallets?t=${Date.now()}`);
      if (!res.ok) return [];
      const data = await res.json();
      const fresh: PlacedWallet[] = data.wallets ?? [];
      setWallets(fresh);
      return fresh;
    } catch {
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch placed wallets on mount
  useEffect(() => {
    fetchWallets();
  }, [fetchWallets]);


  function handleTimePreset(id: string, time: number) {
    timeRef.current = time;
    autoModeRef.current = false;
    setActivePreset(id);
  }

  function handleCycle() {
    autoModeRef.current = true;
    setActivePreset("cycle");
  }


  function handleSelectWallet(wallet: WalletBuilding, position: [number, number, number]) {
    setCarMode(false);
    playerCarPosRef.current = null;
    setSelectedWallet(wallet);
    setSelectedPosition(position);
    setTrackedCar(null);
    setCameraFollowSlot(null);
    trackedCarPosRef.current = null;
  }

  function handleDeselect() {
    setSelectedWallet(null);
    setSelectedPosition(null);
    setTrackedCar(null);
    setCameraFollowSlot(null);
    trackedCarPosRef.current = null;
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (carMode) {
          setCarMode(false);
          playerCarPosRef.current = null;
          return;
        }
        handleDeselect();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [carMode]);

  function handleClickAddress(address: string) {
    const wallet = wallets.find(w => w.address === address);
    if (!wallet) return;
    const dims = getBuildingDimensions(wallet);
    const pos = getWalletWorldPosition(wallet, dims);
    handleSelectWallet(wallet, pos);
  }

  function handleClickCar(info: TrackedCarInfo) {
    setCarMode(false);
    playerCarPosRef.current = null;
    setTrackedCar(info);
    setCameraFollowSlot(info.slotIndex);
    setSelectedWallet(null);
    setSelectedPosition(null);
    setWindowHover(null);
  }

  function handleCarDied(slotIndex: number) {
    setTrackedCar(prev => prev?.slotIndex === slotIndex ? null : prev);
    setCameraFollowSlot(prev => prev === slotIndex ? null : prev);
    trackedCarPosRef.current = null;
  }

  return (
    <div className="relative w-full h-screen">
      {windowHover && <WindowTooltip {...windowHover} />}

      {/* Top left — branding */}
      <div className="absolute top-3 left-3 sm:top-5 sm:left-5 z-10 bg-black/50 backdrop-blur-xl border border-white/[0.08] rounded-2xl px-3.5 py-2.5 sm:px-5 sm:py-3.5">
        <div className="flex items-center gap-2.5">
          <img src="/helius-icon.svg" alt="Helius" className="w-6 h-6 sm:w-7 sm:h-7" />
          <h1 className="text-lg sm:text-xl font-semibold tracking-tight" style={{ color: "#E35930" }}>Heliopolis</h1>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-sm text-white/40">
            {loading ? "Loading..." : `${wallets.length} wallets`}
          </p>
          <HowItWorksModal />
          {(() => {
            const myWallet = profile?.wallet_address
              ? wallets.find((w) => w.address === profile.wallet_address && (!w.ingestionStatus || w.ingestionStatus === "complete"))
              : null;
            return myWallet ? (
              <button
                onClick={() => setShowCard(true)}
                className="px-2 py-0.5 bg-[#E35930]/15 hover:bg-[#E35930]/25 border border-[#E35930]/20 rounded-lg text-[10px] font-medium text-[#E35930] transition-colors cursor-pointer"
              >
                ID Card
              </button>
            ) : null;
          })()}
        </div>
      </div>

      {/* Citizen ID Card modal */}
      {showCard && (() => {
        const myWallet = wallets.find((w) => w.address === profile?.wallet_address);
        return myWallet ? (
          <Suspense fallback={null}>
            <CitizenCardModal
              wallet={myWallet}
              identityName={
                profile?.x_username
                  ? `@${profile.x_username}`
                  : myWallet.identityName || null
              }
              onClose={() => setShowCard(false)}
            />
          </Suspense>
        ) : null;
      })()}

      {/* Top center — search */}
      <div className="absolute top-[4.5rem] left-3 right-3 sm:top-5 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-10">
        <WalletSearch
          wallets={wallets}
          onSelect={handleSelectWallet}
          onRefetch={fetchWallets}
        />
      </div>

      {/* Top right — auth */}
      <div className="absolute top-3 right-3 sm:top-5 sm:right-5 z-10 flex flex-col items-end gap-3">
        <AuthPanel onClickAddress={handleClickAddress} />
        {/* Wallet / Swap panel: top-right on sm+, hidden here on mobile */}
        <div className="hidden sm:block">
          <WalletPanel wallet={selectedWallet} onClose={handleDeselect} />
          <SwapPanel swap={trackedCar} onClose={handleDeselect} />
        </div>
      </div>

      {/* Wallet / Swap panel: bottom sheet on mobile */}
      <div className="block sm:hidden fixed bottom-0 left-0 right-0 z-30">
        <WalletPanel wallet={selectedWallet} onClose={handleDeselect} />
        <SwapPanel swap={trackedCar} onClose={handleDeselect} />
      </div>

      {/* Camera controls help — hidden on mobile (irrelevant for touch) */}
      <div className="hidden sm:block absolute bottom-6 left-5 z-10 bg-black/50 backdrop-blur-xl border border-white/[0.08] rounded-2xl px-4 py-3 text-xs text-white/35 space-y-1.5">
        <p className="text-white/50 font-medium mb-1">Controls</p>
        {carMode ? (
          <>
            <p><span className="text-white/45">W / ↑</span> Accelerate</p>
            <p><span className="text-white/45">S / ↓</span> Brake / Reverse</p>
            <p><span className="text-white/45">A / ←</span> Steer left</p>
            <p><span className="text-white/45">D / →</span> Steer right</p>
            <p><span className="text-white/45">Space</span> Brake</p>
            <p><span className="text-white/45">Esc</span> Exit drive</p>
          </>
        ) : (
          <>
            <p><span className="text-white/45">Left-click</span> {selectedWallet ? "Orbit" : "Pan"}</p>
            <p><span className="text-white/45">Right-click</span> {selectedWallet ? "Pan" : "Rotate"}</p>
            <p><span className="text-white/45">Scroll</span> Zoom</p>
          </>
        )}
        <button
          onClick={() => {
            if (carMode) {
              setCarMode(false);
              playerCarPosRef.current = null;
            } else {
              handleDeselect();
              setCarMode(true);
            }
          }}
          className={`mt-2 w-full px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
            carMode
              ? "bg-[#E35930]/20 border-[#E35930]/40 text-[#E35930] hover:bg-[#E35930]/30"
              : "bg-white/5 border-white/10 text-white/50 hover:text-white/70 hover:bg-white/10"
          }`}
        >
          {carMode ? "Exit Drive Mode" : "Drive"}
        </button>
      </div>

      {/* Bottom right — powered by */}
      <a href="https://www.helius.dev/" target="_blank" rel="noopener noreferrer" className="hidden sm:flex absolute bottom-6 right-5 z-10 items-center gap-2 text-white/30 hover:text-white/50 text-xs transition-colors">
        <span>Powered by</span>
        <img src="/helius-logo.svg" alt="Helius" className="h-4" />
      </a>

      {/* Time control buttons */}
      <div className="absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-10 flex gap-1 bg-black/50 backdrop-blur-xl border border-white/[0.08] rounded-full px-2.5 py-2">
        {TIME_PRESETS.map((preset) => (
          <button
            key={preset.id}
            onClick={() => handleTimePreset(preset.id, preset.time)}
            className={`px-2.5 sm:px-3.5 py-1.5 min-h-[44px] sm:min-h-0 rounded-full text-xs font-medium transition-colors cursor-pointer ${
              activePreset === preset.id
                ? "bg-white/15 text-white"
                : "text-white/40 hover:text-white/70"
            }`}
          >
            {preset.label}
          </button>
        ))}
        <button
          onClick={handleCycle}
          className={`px-2.5 sm:px-3.5 py-1.5 min-h-[44px] sm:min-h-0 rounded-full text-xs font-medium transition-colors cursor-pointer ${
            activePreset === "cycle"
              ? "bg-white/15 text-white"
              : "text-white/40 hover:text-white/70"
          }`}
        >
          Cycle
        </button>
      </div>

      <Canvas
        camera={{ position: [200, 150, 200], fov: 50, near: 5, far: 2000 }}
        onPointerMissed={handleDeselect}
      >
        <SceneLighting timeRef={timeRef} autoModeRef={autoModeRef} />

        <CityGrid
          wallets={wallets}
          timeRef={timeRef}
          onSelectWallet={handleSelectWallet}
          onHoverWindow={setWindowHover}
          selectedAddress={selectedWallet?.address ?? null}
        />

        <InstancedCars
          swapQueueRef={swapQueueRef}
          wallets={wallets}
          timeRef={timeRef}
          onHoverSwap={setWindowHover}
          onClickCar={handleClickCar}
          trackedCarSlot={cameraFollowSlot}
          trackedCarPosRef={trackedCarPosRef}
          onCarDied={handleCarDied}
          selectedAddress={selectedWallet?.address ?? null}
        />

        <PlayerCar
          active={carMode}
          collisionMap={collisionMap}
          positionRef={playerCarPosRef}
          headingRef={playerCarHeadingRef}
        />

        {selectedWallet && selectedPosition && (
          <SelectionBeam
            position={selectedPosition}
            buildingHeight={getBuildingDimensions(selectedWallet).height}
          />
        )}

        <CameraControls
          targetPosition={selectedPosition}
          trackingRef={carMode ? playerCarPosRef : trackedCarPosRef}
          isTracking={carMode || cameraFollowSlot !== null}
          playerCarMode={carMode}
          headingRef={playerCarHeadingRef}
        />
      </Canvas>
    </div>
  );
}
