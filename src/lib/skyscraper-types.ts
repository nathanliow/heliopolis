/**
 * Skyscraper shape definitions as pure data.
 * Every windowed tier uses BoxGeometry(1,1,1) so the building shader's
 * position-based UV mapping works without modification.
 *
 * All fractions are relative to the building's overall dimensions
 * (width, depth, height) computed by building-math.ts.
 */

export type SkyscraperType = "box" | "setback" | "twin" | "cantilever" | "spire";

export interface TierDef {
  widthFrac: number;   // fraction of building width
  depthFrac: number;   // fraction of building depth
  heightFrac: number;  // fraction of building height
  yBaseFrac: number;   // vertical offset as fraction of height (0 = ground)
  xOffsetFrac: number; // horizontal offset as fraction of width
  zOffsetFrac: number; // depth offset as fraction of depth
  hasWindows: boolean;  // false → use house-shader (solid color, no windows)
}

export const SKYSCRAPER_DEFS: Record<Exclude<SkyscraperType, "box">, TierDef[]> = {
  // Type A: Setback Tower (Art Deco) — 4 windowed tiers + antenna
  setback: [
    { widthFrac: 1.0,  depthFrac: 1.0,  heightFrac: 0.38, yBaseFrac: 0.0,  xOffsetFrac: 0, zOffsetFrac: 0, hasWindows: true },
    { widthFrac: 0.75, depthFrac: 0.75, heightFrac: 0.25, yBaseFrac: 0.38, xOffsetFrac: 0, zOffsetFrac: 0, hasWindows: true },
    { widthFrac: 0.55, depthFrac: 0.55, heightFrac: 0.25, yBaseFrac: 0.63, xOffsetFrac: 0, zOffsetFrac: 0, hasWindows: true },
    { widthFrac: 0.35, depthFrac: 0.35, heightFrac: 0.12, yBaseFrac: 0.88, xOffsetFrac: 0, zOffsetFrac: 0, hasWindows: true },
    { widthFrac: 0.03, depthFrac: 0.03, heightFrac: 0.15, yBaseFrac: 1.0,  xOffsetFrac: 0, zOffsetFrac: 0, hasWindows: false },
  ],

  // Type B: Twin Peaks — podium + two towers of different heights
  twin: [
    { widthFrac: 1.0,  depthFrac: 1.0,  heightFrac: 0.22, yBaseFrac: 0.0, xOffsetFrac: 0,     zOffsetFrac: 0, hasWindows: true },
    { widthFrac: 0.42, depthFrac: 0.88, heightFrac: 1.0,  yBaseFrac: 0.0, xOffsetFrac: -0.27,  zOffsetFrac: 0, hasWindows: true },
    { widthFrac: 0.42, depthFrac: 0.88, heightFrac: 0.72, yBaseFrac: 0.0, xOffsetFrac: 0.27,   zOffsetFrac: 0, hasWindows: true },
  ],

  // Type C: Cantilevered Slab — upper offset from base with cap
  cantilever: [
    { widthFrac: 1.0,  depthFrac: 1.0,  heightFrac: 0.42, yBaseFrac: 0.0,  xOffsetFrac: 0, zOffsetFrac: 0,    hasWindows: true },
    { widthFrac: 0.85, depthFrac: 0.78, heightFrac: 0.58, yBaseFrac: 0.42, xOffsetFrac: 0, zOffsetFrac: 0.12, hasWindows: true },
    { widthFrac: 0.95, depthFrac: 0.85, heightFrac: 0.03, yBaseFrac: 0.97, xOffsetFrac: 0, zOffsetFrac: 0.12, hasWindows: true },
  ],

  // Type D: Spire Tower — tall shaft + crown ledge + narrow spire
  spire: [
    { widthFrac: 0.80, depthFrac: 0.80, heightFrac: 0.80, yBaseFrac: 0.0,  xOffsetFrac: 0, zOffsetFrac: 0, hasWindows: true },
    { widthFrac: 0.95, depthFrac: 0.95, heightFrac: 0.05, yBaseFrac: 0.80, xOffsetFrac: 0, zOffsetFrac: 0, hasWindows: true },
    { widthFrac: 0.20, depthFrac: 0.20, heightFrac: 0.18, yBaseFrac: 0.85, xOffsetFrac: 0, zOffsetFrac: 0, hasWindows: false },
  ],
};
