import { describe, expect, it } from 'vitest';
import { GAME, laneOffsets, TRAFFIC_COUNT_OPTIONS } from './config';
import {
  clamp,
  constrainToRoad,
  curveSpeedLimit,
  isBridgeSection,
  progressiveSteering,
  roadCenter,
  roadElevation,
  roadHeading,
  speedSensitiveSteering,
  steeringFromHands,
} from './math';

describe('driving math', () => {
  it('clamps values to the requested range', () => {
    expect(clamp(4, -1, 1)).toBe(1);
    expect(clamp(-2, -1, 1)).toBe(-1);
  });

  it('maps a two-hand rotation into normalized steering', () => {
    const neutral = steeringFromHands({ x: 0, y: 0 }, { x: 1, y: 0 }, 0);
    const turned = steeringFromHands({ x: 0, y: 0 }, { x: 1, y: 0.35 }, 0);
    expect(neutral).toBe(0);
    expect(turned).toBeGreaterThan(0.5);
  });

  it('reaches full steering with about 35 degrees of hand rotation', () => {
    const fullTurn = steeringFromHands({ x: 0, y: 0 }, { x: 1, y: 0.7 }, 0);
    expect(fullTurn).toBe(1);
  });

  it('applies progressive non-linear response to soften micro-tremors near center', () => {
    const smallSteer = 0.2;
    const shaped = progressiveSteering(smallSteer, 1.45);
    // 0.2^1.45 is ~0.096, which softens center sensitivity by over 50%
    expect(shaped).toBeLessThan(smallSteer * 0.6);
    expect(progressiveSteering(1.0)).toBe(1.0);
    expect(progressiveSteering(-1.0)).toBe(-1.0);
  });

  it('stabilizes high-speed steering rate with speedSensitiveSteering', () => {
    const lowSpeedRate = speedSensitiveSteering(1.0, 5); // 18 km/h
    const highSpeedRate = speedSensitiveSteering(1.0, 55); // ~200 km/h
    expect(highSpeedRate).toBeLessThan(lowSpeedRate * 0.6);
  });

  it('reduces target speed for upcoming curvature', () => {
    const speed = curveSpeedLimit(0, 45, 18);
    expect(speed).toBeGreaterThanOrEqual(18);
    expect(speed).toBeLessThanOrEqual(45);
  });

  it('keeps three highway traffic lanes inside the road edges', () => {
    expect(laneOffsets).toHaveLength(3);
    for (const offset of laneOffsets) {
      expect(Math.abs(offset) + GAME.collisionWidth / 2).toBeLessThan(GAME.roadWidth / 2);
    }
  });

  it('allows the game to run without traffic', () => {
    expect(TRAFFIC_COUNT_OPTIONS).toEqual([0, 4, 8, 12, 16]);
  });

  it('keeps the complete vehicle body inside the road boundaries', () => {
    const result = constrainToRoad(20, 0, 0, 20, 1.25);
    expect(result.lateral).toBe(8.75);
    expect(result.worldX).toBe(8.75);
    expect(result.boundary).toBe(1);
  });

  describe('highway track trajectory', () => {
    it('provides a straight highway initially', () => {
      expect(roadCenter(0)).toBe(0);
      expect(roadCenter(100)).toBe(0);
      expect(roadElevation(0)).toBe(0);
      expect(roadHeading(100)).toBeCloseTo(0, 3);
    });

    it('smoothly curves left and then straightens out', () => {
      // Left curve begins at 220 and ends at 500
      expect(roadCenter(220)).toBe(0);
      expect(roadCenter(360)).toBeCloseTo(-21, 1); // Midpoint of left curve
      expect(roadCenter(500)).toBeCloseTo(-42, 1);
      // Mid straight section maintains constant lateral offset with zero heading
      expect(roadCenter(600)).toBeCloseTo(-42, 1);
      expect(roadHeading(600)).toBeCloseTo(0, 3);
    });

    it('smoothly curves right back to straight center highway', () => {
      // Right curve begins at 700 and ends at 980
      expect(roadCenter(700)).toBeCloseTo(-42, 1);
      expect(roadCenter(840)).toBeCloseTo(-21, 1); // Midpoint of right curve
      expect(roadCenter(980)).toBeCloseTo(0, 1);
      expect(roadHeading(980)).toBeCloseTo(0, 3);
    });

    it('provides a smooth elevated bridge section with gentle grade', () => {
      // Bridge begins at 980, reaches 6.5m peak, and returns to 0 at 1360
      expect(roadElevation(980)).toBe(0);
      expect(roadElevation(1035)).toBeCloseTo(3.25, 1); // Midpoint of ramp up
      expect(roadElevation(1170)).toBeCloseTo(6.5, 2); // Bridge deck
      expect(isBridgeSection(1170)).toBe(true);
      expect(roadElevation(1305)).toBeCloseTo(3.25, 1); // Midpoint of ramp down
      expect(roadElevation(1360)).toBeCloseTo(0, 2);
      expect(isBridgeSection(1400)).toBe(false);
    });

    it('ensures zero discontinuities across the entire trajectory loop', () => {
      // Step through the entire 1600m track at 1m resolution
      for (let dist = 0; dist < 1600; dist += 5) {
        const c1 = roadCenter(dist);
        const c2 = roadCenter(dist + 0.1);
        expect(Math.abs(c2 - c1)).toBeLessThan(0.08); // No sudden position pops

        const e1 = roadElevation(dist);
        const e2 = roadElevation(dist + 0.1);
        expect(Math.abs(e2 - e1)).toBeLessThan(0.05); // No sudden elevation pops

        const h1 = roadHeading(dist);
        const h2 = roadHeading(dist + 0.1);
        expect(Math.abs(h2 - h1)).toBeLessThan(0.05); // No sudden heading snaps
      }
    });
  });
});
