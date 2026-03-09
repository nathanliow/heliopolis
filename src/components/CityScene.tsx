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
import WelcomeOverlay from "./WelcomeOverlay";
import WalletSearch from "./WalletSearch";
import IngestionBanner from "./IngestionBanner";
import { WalletBuilding, PlacedWallet } from "@/types/wallet";
import { getBuildingDimensions, getWalletWorldPosition } from "@/lib/building-math";
import WindowTooltip, { WindowHoverInfo } from "./WindowTooltip";
import InstancedCars, { TrackedCarInfo } from "./InstancedCars";
import SwapPanel from "./SwapPanel";
import { useSwapEvents } from "@/lib/swap-events";
import HowItWorksModal from "./HowItWorksModal";

const _trackTarget = new THREE.Vector3();
const _prevTarget = new THREE.Vector3();
const _delta = new THREE.Vector3();

function CameraControls({
  targetPosition,
  trackingRef,
  isTracking,
}: {
  targetPosition: [number, number, number] | null;
  trackingRef: React.MutableRefObject<[number, number, number] | null>;
  isTracking: boolean;
}) {
  const controlsRef = useRef<OrbitControlsImpl>(null);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    if (isTracking) {
      // Orbit mode for car tracking — useFrame handles position
      controls.enableRotate = true;
      controls.enablePan = false;
      controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      };
      return;
    }

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
  }, [targetPosition, isTracking]);

  // Smoothly follow tracked car each frame — move both target AND camera
  // by the same delta so the viewing angle stays constant (no rotation).
  // Gate on isTracking (React state) not just the ref, so we stop immediately on deselect.
  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls || !isTracking || !trackingRef.current) return;
    _trackTarget.set(trackingRef.current[0], trackingRef.current[1], trackingRef.current[2]);

    // Save old target, lerp to new, compute the delta
    _prevTarget.copy(controls.target);
    controls.target.lerp(_trackTarget, 0.08);
    _delta.subVectors(controls.target, _prevTarget);

    // Shift camera position by the same amount — maintains viewing angle
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
  const [mode, setMode] = useState<"welcome" | "explore" | "wallet">("welcome");
  const [selectedWallet, setSelectedWallet] = useState<WalletBuilding | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<[number, number, number] | null>(null);
  const [fetchedWallet, setFetchedWallet] = useState<WalletBuilding | null>(null);
  const [wallets, setWallets] = useState<PlacedWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [ingestingAddress, setIngestingAddress] = useState<string | null>(null);
  const [windowHover, setWindowHover] = useState<WindowHoverInfo | null>(null);

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

  const fetchWallets = useCallback(async (): Promise<PlacedWallet[]> => {
    try {
      const res = await fetch("/api/wallets");
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

  // Re-fetch when a looked-up wallet completes ingestion
  useEffect(() => {
    if (fetchedWallet?.ingestionStatus === "complete") {
      fetchWallets();
    }
  }, [fetchedWallet, fetchWallets]);

  function handleTimePreset(id: string, time: number) {
    timeRef.current = time;
    autoModeRef.current = false;
    setActivePreset(id);
  }

  function handleCycle() {
    autoModeRef.current = true;
    setActivePreset("cycle");
  }

  function handleExplore() {
    setMode("explore");
  }

  function handleIngestionStart(address: string) {
    setIngestingAddress(address);
    if (mode === "welcome") setMode("explore");
  }

  function handleIngestionComplete(wallet: PlacedWallet, position: [number, number, number]) {
    setIngestingAddress(null);
    handleSelectWallet(wallet, position);
  }

  function handleIngestionFailed() {
    setIngestingAddress(null);
  }

  async function handleWalletSubmit(wallet: WalletBuilding) {
    setFetchedWallet(wallet);
    setSelectedWallet(wallet);
    setMode("wallet");

    // Try to find placed wallet and fly to it
    const placed = wallets.find((w) => w.address === wallet.address);
    if (placed) {
      const dims = getBuildingDimensions(placed);
      const pos = getWalletWorldPosition(placed, dims);
      setSelectedPosition(pos);
    } else {
      // Wallet may have just completed — refetch to get position
      const fresh = await fetchWallets();
      const freshPlaced = fresh.find((w) => w.address === wallet.address);
      if (freshPlaced) {
        const dims = getBuildingDimensions(freshPlaced);
        const pos = getWalletWorldPosition(freshPlaced, dims);
        setSelectedWallet(freshPlaced);
        setSelectedPosition(pos);
      }
    }
  }

  function handleSelectWallet(wallet: WalletBuilding, position: [number, number, number]) {
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
      if (e.key === "Escape") handleDeselect();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function handleClickAddress(address: string) {
    const wallet = wallets.find(w => w.address === address);
    if (!wallet) return;
    const dims = getBuildingDimensions(wallet);
    const pos = getWalletWorldPosition(wallet, dims);
    handleSelectWallet(wallet, pos);
  }

  function handleClickCar(info: TrackedCarInfo) {
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
      {mode === "welcome" && (
        <WelcomeOverlay
          onExplore={handleExplore}
          onWalletSubmit={handleWalletSubmit}
          onIngestionStart={handleIngestionStart}
        />
      )}

      {ingestingAddress && (
        <IngestionBanner
          address={ingestingAddress}
          onComplete={handleIngestionComplete}
          onFailed={handleIngestionFailed}
          onRefetch={fetchWallets}
        />
      )}

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
        </div>
      </div>

      {/* Top center — search */}
      {mode !== "welcome" && (
        <div className="absolute top-[4.5rem] left-3 right-3 sm:top-5 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-10">
          <WalletSearch
            wallets={wallets}
            onSelect={handleSelectWallet}
            onRefetch={fetchWallets}
            onIngestionStart={handleIngestionStart}
          />
        </div>
      )}

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
        <p><span className="text-white/45">Left-click</span> {selectedWallet ? "Orbit" : "Pan"}</p>
        <p><span className="text-white/45">Right-click</span> {selectedWallet ? "Pan" : "Rotate"}</p>
        <p><span className="text-white/45">Scroll</span> Zoom</p>
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

        {selectedWallet && selectedPosition && (
          <SelectionBeam
            position={selectedPosition}
            buildingHeight={getBuildingDimensions(selectedWallet).height}
          />
        )}

        <CameraControls
          targetPosition={selectedPosition}
          trackingRef={trackedCarPosRef}
          isTracking={cameraFollowSlot !== null}
        />
      </Canvas>
    </div>
  );
}
