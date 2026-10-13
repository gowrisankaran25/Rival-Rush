import { describe, expect, it } from 'vitest';
import {
  MAX_ACTIVE_SEGMENTS,
  ProceduralTrackSystem,
  RoadSegmentType,
} from './ProceduralTrackSystem';

describe('ProceduralTrackSystem', () => {
  it('initializes with the canonical 6-phase runway sequence', () => {
    const track = new ProceduralTrackSystem();
    const segments = track.getActiveSegments();

    expect(segments.length).toBe(6);
    expect(segments[0].type).toBe('straight');
    expect(segments[1].type).toBe('gentle_left');
    expect(segments[2].type).toBe('tunnel');
    expect(segments[3].type).toBe('gentle_right');
    expect(segments[4].type).toBe('bridge');
    expect(segments[5].type).toBe('scenic');

    expect(segments[0].startDist).toBe(0);
    expect(segments[segments.length - 1].endDist).toBe(1600);
  });

  it('supports all 6 specified road segment types', () => {
    const track = new ProceduralTrackSystem();
    // Simulate driving far ahead to generate all procedural types
    for (let dist = 1000; dist <= 12000; dist += 500) {
      track.update(dist);
    }

    const seenTypes = new Set<RoadSegmentType>();
    // Check currently active segments and history
    for (const seg of track.getActiveSegments()) {
      seenTypes.add(seg.type);
    }

    // Drive further and collect types to ensure all 6 appear
    for (let dist = 12500; dist <= 30000; dist += 400) {
      track.update(dist);
      for (const seg of track.getActiveSegments()) {
        seenTypes.add(seg.type);
      }
    }

    expect(seenTypes.has('straight')).toBe(true);
    expect(seenTypes.has('gentle_left')).toBe(true);
    expect(seenTypes.has('gentle_right')).toBe(true);
    expect(seenTypes.has('bridge')).toBe(true);
    expect(seenTypes.has('tunnel')).toBe(true);
    expect(seenTypes.has('scenic')).toBe(true);
  });

  it('maintains a bounded sliding window with zero memory growth', () => {
    const track = new ProceduralTrackSystem();

    // Drive for an extended distance of 50,000 meters (50 km)
    for (let dist = 0; dist <= 50000; dist += 100) {
      track.update(dist);
      const activeCount = track.getActiveSegments().length;
      expect(activeCount).toBeLessThanOrEqual(MAX_ACTIVE_SEGMENTS);
      expect(activeCount).toBeGreaterThanOrEqual(3);
    }
  });

  it('guarantees C2 smoothness and zero discontinuities across endless segments', () => {
    const track = new ProceduralTrackSystem();

    // Drive 10,000 meters and test continuity at high resolution
    for (let dist = 0; dist < 8000; dist += 200) {
      track.update(dist);

      // Test local continuity around current distance
      for (let s = dist; s < dist + 150; s += 2) {
        const c1 = track.getCenter(s);
        const c2 = track.getCenter(s + 0.1);
        expect(Math.abs(c2 - c1)).toBeLessThan(0.08); // No lateral snap

        const e1 = track.getElevation(s);
        const e2 = track.getElevation(s + 0.1);
        expect(Math.abs(e2 - e1)).toBeLessThan(0.05); // No elevation snap

        const h1 = track.getHeading(s);
        const h2 = track.getHeading(s + 0.1);
        expect(Math.abs(h2 - h1)).toBeLessThan(0.05); // No heading pop

        const p1 = track.getPitch(s);
        const p2 = track.getPitch(s + 0.1);
        expect(Math.abs(p2 - p1)).toBeLessThan(0.05); // No pitch pop
      }
    }
  });

  it('keeps highway center contained within safe corridor boundaries', () => {
    const track = new ProceduralTrackSystem();

    // Drive 20 km and verify highway center never drifts into the void
    for (let dist = 0; dist <= 20000; dist += 150) {
      track.update(dist);
      const center = track.getCenter(dist);
      expect(Math.abs(center)).toBeLessThanOrEqual(58);
    }
  });

  it('identifies bridge and tunnel sections accurately', () => {
    const track = new ProceduralTrackSystem();
    // In canonical layout:
    // Tunnel is [500, 700)
    expect(track.isTunnel(450)).toBe(false);
    expect(track.isTunnel(600)).toBe(true);
    expect(track.isTunnel(750)).toBe(false);

    // Bridge is [980, 1360)
    expect(track.isBridge(900)).toBe(false);
    expect(track.isBridge(1150)).toBe(true);
    expect(track.isBridge(1400)).toBe(false);
  });

  it('resets cleanly to the initial runway', () => {
    const track = new ProceduralTrackSystem();
    // Drive 15 km
    for (let dist = 0; dist <= 15000; dist += 500) {
      track.update(dist);
    }
    expect(track.getHighestEndDist()).toBeGreaterThan(15000);

    // Reset
    track.reset();
    expect(track.getHighestEndDist()).toBe(1600);
    expect(track.getCenter(0)).toBe(0);
    expect(track.getCenter(500)).toBeCloseTo(-42, 1);
    expect(track.getElevation(1170)).toBeCloseTo(6.5, 1);
  });
});
