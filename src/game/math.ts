export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
export const lerp = (from: number, to: number, amount: number): number =>
  from + (to - from) * amount;
export const damp = (from: number, to: number, lambda: number, dt: number): number =>
  lerp(from, to, 1 - Math.exp(-lambda * dt));
export const inverseLerp = (from: number, to: number, value: number): number =>
  clamp((value - from) / (to - from), 0, 1);

import { HIGHWAY_MAP_SEGMENTS, TRACK_TOTAL_LENGTH } from './trackConfig';
import { ProceduralTrackSystem } from './world/ProceduralTrackSystem';

export { HIGHWAY_MAP_SEGMENTS, TRACK_TOTAL_LENGTH };

/** Singleton procedural track engine powering endless road generation. */
export const proceduralTrack = new ProceduralTrackSystem();

/**
 * Quintic Hermite smootherstep:
 * S(0) = 0, S(1) = 1, S'(0) = 0, S'(1) = 0, S''(0) = 0, S''(1) = 0
 * Guarantees C2 continuous transition with 0 jerk or acceleration spikes at boundaries.
 */
export function smootherstep(u: number): number {
  const t = clamp(u, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Lateral center of the highway at the given distance along the map.
 */
export function roadCenter(distance: number): number {
  return proceduralTrack.getCenter(distance);
}

/**
 * Vertical elevation (Y) of the highway in meters at the given distance.
 */
export function roadElevation(distance: number): number {
  return proceduralTrack.getElevation(distance);
}

/**
 * Road longitudinal slope / pitch angle in radians at the given distance.
 */
export function roadPitch(distance: number): number {
  return proceduralTrack.getPitch(distance);
}

/**
 * Returns true if the given distance is on an elevated bridge section.
 */
export function isBridgeSection(distance: number): boolean {
  return proceduralTrack.isBridge(distance);
}

/**
 * Returns true if the given distance is inside a tunnel section.
 */
export function isTunnelSection(distance: number): boolean {
  return proceduralTrack.isTunnel(distance);
}

export function roadHeading(distance: number): number {
  return proceduralTrack.getHeading(distance);
}

export function roadCurvature(distance: number): number {
  return proceduralTrack.getCurvature(distance);
}

export function steeringFromHands(
  left: { x: number; y: number },
  right: { x: number; y: number },
  neutralAngle: number,
  deadZone = 0.045,
  curvePower = 1.0,
): number {
  // Reach full steering with a comfortable hand rotation while preserving a
  // small neutral zone that filters camera-tracking jitter.
  const steeringRange = 0.56;
  const angle = Math.atan2(right.y - left.y, right.x - left.x);
  let delta = Math.atan2(Math.sin(angle - neutralAngle), Math.cos(angle - neutralAngle));
  if (Math.abs(delta) <= deadZone) return 0;
  delta -= Math.sign(delta) * deadZone;
  const normalized = clamp(delta / steeringRange, -1, 1);
  if (curvePower === 1.0) return normalized;
  return Math.sign(normalized) * Math.pow(Math.abs(normalized), curvePower);
}

/**
 * Applies a progressive non-linear response curve to steering input.
 * Softens micro-tremors near center while preserving full turning authority.
 */
export function progressiveSteering(rawSteering: number, power = 1.45): number {
  const clamped = clamp(rawSteering, -1, 1);
  return Math.sign(clamped) * Math.pow(Math.abs(clamped), power);
}

/**
 * Applies speed-sensitive steering damping.
 * High speeds stabilize heading rate to prevent twitchy lane veering,
 * while lower speeds retain full turning agility.
 */
export function speedSensitiveSteering(
  steering: number,
  speedMs: number,
  baseAuthority = 0.95,
): number {
  const speedScale = 1 / (1 + Math.max(0, speedMs - 8) * 0.018);
  return steering * baseAuthority * Math.max(0.48, speedScale);
}

export function curveSpeedLimit(distance: number, maxSpeed: number, minSpeed: number): number {
  let peak = 0;
  for (let ahead = 22; ahead <= 105; ahead += 12)
    peak = Math.max(peak, roadCurvature(distance + ahead));
  return lerp(maxSpeed, minSpeed, inverseLerp(0.002, 0.012, peak));
}

export function constrainToRoad(
  worldX: number,
  centerX: number,
  roadHeadingAngle: number,
  roadWidth: number,
  vehicleHalfWidth: number,
): { worldX: number; lateral: number; boundary: -1 | 0 | 1 } {
  const sideScale = Math.max(0.72, Math.cos(roadHeadingAngle));
  const lateral = (worldX - centerX) / sideScale;
  const limit = roadWidth / 2 - vehicleHalfWidth;
  const constrained = clamp(lateral, -limit, limit);
  return {
    worldX: centerX + sideScale * constrained,
    lateral: constrained,
    boundary: lateral < -limit ? -1 : lateral > limit ? 1 : 0,
  };
}
