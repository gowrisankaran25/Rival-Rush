function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function smootherstep(u: number): number {
  const t = clamp(u, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Procedural Highway System for Rival Rush.
 *
 * Supported Road Segment Types:
 * 1. 'straight': High-speed straight expressway.
 * 2. 'gentle_left': Smooth left bend (C2-continuous quintic Hermite transition).
 * 3. 'gentle_right': Smooth right bend (C2-continuous quintic Hermite transition).
 * 4. 'bridge': Elevated overpass viaduct with smooth ramp climb, elevated deck, and descent.
 * 5. 'tunnel': Subterranean/mountain cut underpass with portals and illuminated interior rings.
 * 6. 'scenic': Scenic highway with rich roadside vistas, billboards, and skyline formations.
 */
export type RoadSegmentType =
  | 'straight'
  | 'gentle_left'
  | 'gentle_right'
  | 'bridge'
  | 'tunnel'
  | 'scenic';

export type SceneryTheme =
  | 'urban'
  | 'foothills'
  | 'viaduct'
  | 'tunnel'
  | 'scenic_vista';

export interface RoadSegment {
  readonly id: number;
  readonly type: RoadSegmentType;
  readonly name: string;
  readonly startDist: number;
  readonly endDist: number;
  readonly length: number;
  readonly startX: number;
  readonly endX: number;
  readonly deltaX: number;
  readonly peakElevation: number;
  readonly difficulty: number; // 1 to 5
  readonly sceneryTheme: SceneryTheme;
}

/** Maximum number of active road segments maintained in memory simultaneously. */
export const MAX_ACTIVE_SEGMENTS = 14;

/** How far behind the player (meters) segments are preserved before recycling. */
export const PRUNE_BEHIND_DISTANCE = 260;

/** How far ahead of the player (meters) road generation plans ahead. */
export const PLAN_AHEAD_DISTANCE = 1200;

/** Lateral envelope boundary: keeps highway center comfortably within [-50m, +50m]. */
export const MAX_LATERAL_OFFSET = 48;

export class ProceduralTrackSystem {
  private activeSegments: RoadSegment[] = [];
  private nextSegmentId = 0;
  private currentDifficulty = 1;
  private rngSeed = 42;

  constructor() {
    this.reset();
  }

  /**
   * Resets track generation to the initial safe runway sequence.
   */
  reset(): void {
    this.activeSegments = [];
    this.nextSegmentId = 0;
    this.currentDifficulty = 1;
    this.rngSeed = 42;

    // Build the canonical 6-phase sequence spanning 0 to 1600m:
    // 1. Initial Straight Highway [0, 220)
    this.activeSegments.push({
      id: this.nextSegmentId++,
      type: 'straight',
      name: 'Initial Expressway',
      startDist: 0,
      endDist: 220,
      length: 220,
      startX: 0,
      endX: 0,
      deltaX: 0,
      peakElevation: 0,
      difficulty: 1,
      sceneryTheme: 'urban',
    });

    // 2. Gentle Left Curve [220, 500)
    this.activeSegments.push({
      id: this.nextSegmentId++,
      type: 'gentle_left',
      name: 'Pine Ridge Left Curve',
      startDist: 220,
      endDist: 500,
      length: 280,
      startX: 0,
      endX: -42,
      deltaX: -42,
      peakElevation: 0,
      difficulty: 1,
      sceneryTheme: 'foothills',
    });

    // 3. Cedar Ridge Tunnel [500, 700)
    this.activeSegments.push({
      id: this.nextSegmentId++,
      type: 'tunnel',
      name: 'Cedar Ridge Tunnel',
      startDist: 500,
      endDist: 700,
      length: 200,
      startX: -42,
      endX: -42,
      deltaX: 0,
      peakElevation: 0,
      difficulty: 1,
      sceneryTheme: 'tunnel',
    });

    // 4. Gentle Right Curve [700, 980)
    this.activeSegments.push({
      id: this.nextSegmentId++,
      type: 'gentle_right',
      name: 'Valley Descent Right Curve',
      startDist: 700,
      endDist: 980,
      length: 280,
      startX: -42,
      endX: 0,
      deltaX: 42,
      peakElevation: 0,
      difficulty: 1,
      sceneryTheme: 'foothills',
    });

    // 5. Skyway Viaduct Bridge [980, 1360)
    this.activeSegments.push({
      id: this.nextSegmentId++,
      type: 'bridge',
      name: 'Skyway Viaduct',
      startDist: 980,
      endDist: 1360,
      length: 380,
      startX: 0,
      endX: 0,
      deltaX: 0,
      peakElevation: 6.5,
      difficulty: 1,
      sceneryTheme: 'viaduct',
    });

    // 6. Terminal Sprint Scenic Highway [1360, 1600)
    this.activeSegments.push({
      id: this.nextSegmentId++,
      type: 'scenic',
      name: 'Terminal Vista Straight',
      startDist: 1360,
      endDist: 1600,
      length: 240,
      startX: 0,
      endX: 0,
      deltaX: 0,
      peakElevation: 0,
      difficulty: 1,
      sceneryTheme: 'scenic_vista',
    });
  }

  /**
   * Advances track generation and recycles retired segments behind the player.
   */
  update(playerDistance: number): void {
    // 1. Calculate difficulty scaling based on distance
    this.currentDifficulty = clamp(1 + Math.floor(playerDistance / 1200), 1, 5);

    // 2. Prune retired segments completely behind the player window
    const pruneThreshold = playerDistance - PRUNE_BEHIND_DISTANCE;
    while (
      this.activeSegments.length > 3 &&
      this.activeSegments[0].endDist < pruneThreshold
    ) {
      this.activeSegments.shift();
    }

    // 3. Procedurally generate segments ahead of player
    const targetAhead = playerDistance + PLAN_AHEAD_DISTANCE;
    while (this.getHighestEndDist() < targetAhead) {
      this.generateNextSegment();
    }

    // 4. Safety cap on active segment count
    while (this.activeSegments.length > MAX_ACTIVE_SEGMENTS) {
      this.activeSegments.shift();
    }
  }

  getHighestEndDist(): number {
    if (this.activeSegments.length === 0) return 0;
    return this.activeSegments[this.activeSegments.length - 1].endDist;
  }

  getActiveSegments(): readonly RoadSegment[] {
    return this.activeSegments;
  }

  getDifficulty(): number {
    return this.currentDifficulty;
  }

  /**
   * Evaluates the active segment at the specified longitudinal distance.
   */
  getSegmentAt(distance: number): RoadSegment | undefined {
    // Small fast linear search over bounded ~6-10 active segments
    for (let i = 0; i < this.activeSegments.length; i++) {
      const seg = this.activeSegments[i];
      if (distance >= seg.startDist && distance < seg.endDist) {
        return seg;
      }
    }
    // Fallback if before first segment or slightly past end
    if (this.activeSegments.length > 0) {
      if (distance < this.activeSegments[0].startDist) {
        return this.activeSegments[0];
      }
      return this.activeSegments[this.activeSegments.length - 1];
    }
    return undefined;
  }

  /**
   * Lateral center of the highway at the given distance.
   */
  getCenter(distance: number): number {
    const seg = this.getSegmentAt(distance);
    if (!seg) return 0;
    if (seg.deltaX === 0) return seg.startX;
    const u = clamp((distance - seg.startDist) / seg.length, 0, 1);
    return seg.startX + seg.deltaX * smootherstep(u);
  }

  /**
   * Vertical elevation of the highway at the given distance.
   */
  getElevation(distance: number): number {
    const seg = this.getSegmentAt(distance);
    if (!seg || seg.peakElevation === 0) return 0;

    if (seg.type === 'bridge') {
      const s = distance - seg.startDist;
      const rampUpLen = Math.min(110, seg.length * 0.3);
      const rampDownLen = Math.min(110, seg.length * 0.3);
      const deckStart = rampUpLen;
      const deckEnd = seg.length - rampDownLen;

      if (s < deckStart) {
        const u = s / rampUpLen;
        return seg.peakElevation * smootherstep(u);
      }
      if (s <= deckEnd) {
        return seg.peakElevation;
      }
      const u = (s - deckEnd) / rampDownLen;
      return seg.peakElevation * (1 - smootherstep(u));
    }

    return 0;
  }

  /**
   * Longitudinal road pitch in radians.
   */
  getPitch(distance: number): number {
    const step = 0.5;
    return Math.atan2(this.getElevation(distance + step) - this.getElevation(distance - step), step * 2);
  }

  /**
   * Horizontal road heading in radians.
   */
  getHeading(distance: number): number {
    const step = 0.5;
    return Math.atan2(-(this.getCenter(distance + step) - this.getCenter(distance - step)), step * 2);
  }

  /**
   * Horizontal curvature (rate of heading change with distance).
   */
  getCurvature(distance: number): number {
    const step = 5;
    const a = this.getHeading(distance - step);
    const b = this.getHeading(distance + step);
    return Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a))) / (step * 2);
  }

  /**
   * Returns true if distance is on an elevated bridge span.
   */
  isBridge(distance: number): boolean {
    return this.getElevation(distance) > 0.4;
  }

  /**
   * Returns true if distance is inside a tunnel.
   */
  isTunnel(distance: number): boolean {
    const seg = this.getSegmentAt(distance);
    return seg?.type === 'tunnel';
  }

  // ─────────────────────────────────────────────────────────────
  // Procedural Generator Internal Methods
  // ─────────────────────────────────────────────────────────────

  private pseudoRandom(): number {
    // Linear congruential generator for reproducible procedural continuity
    this.rngSeed = (this.rngSeed * 1664525 + 1013904223) >>> 0;
    return (this.rngSeed >>> 8) / 16777216;
  }

  private generateNextSegment(): void {
    const last = this.activeSegments[this.activeSegments.length - 1];
    const startDist = last ? last.endDist : 0;
    const startX = last ? last.endX : 0;
    const lastType = last ? last.type : 'straight';

    // 1. Select candidate type based on fair road design rules
    const type = this.pickNextSegmentType(lastType, startX);

    // 2. Configure properties for selected segment type
    let length = 240;
    let deltaX = 0;
    let peakElevation = 0;
    let sceneryTheme: SceneryTheme = 'urban';
    let name = 'Expressway';

    const rand = this.pseudoRandom();

    switch (type) {
      case 'straight':
        length = 190 + Math.round(rand * 90); // 190m - 280m
        deltaX = 0;
        peakElevation = 0;
        sceneryTheme = rand < 0.5 ? 'urban' : 'foothills';
        name = `Highway Straight #${this.nextSegmentId}`;
        break;

      case 'gentle_left': {
        // Curve strength scales gently with difficulty (never exceeding fair driving limit)
        const curveMagnitude = 30 + Math.round(rand * (8 + this.currentDifficulty * 3));
        deltaX = -curveMagnitude;
        length = 240 + Math.round(rand * 60); // 240m - 300m
        peakElevation = 0;
        sceneryTheme = 'foothills';
        name = `Pine Ridge Left Curve #${this.nextSegmentId}`;
        break;
      }

      case 'gentle_right': {
        const curveMagnitude = 30 + Math.round(rand * (8 + this.currentDifficulty * 3));
        deltaX = curveMagnitude;
        length = 240 + Math.round(rand * 60); // 240m - 300m
        peakElevation = 0;
        sceneryTheme = 'foothills';
        name = `Valley Descent Right Curve #${this.nextSegmentId}`;
        break;
      }

      case 'bridge':
        length = 320 + Math.round(rand * 80); // 320m - 400m
        deltaX = 0; // Bridge spans remain straight for stability
        peakElevation = 6.5;
        sceneryTheme = 'viaduct';
        name = `Skyway Viaduct #${this.nextSegmentId}`;
        break;

      case 'tunnel':
        length = 200 + Math.round(rand * 60); // 200m - 260m
        deltaX = 0;
        peakElevation = 0;
        sceneryTheme = 'tunnel';
        name = `Mountain Tunnel #${this.nextSegmentId}`;
        break;

      case 'scenic':
        length = 220 + Math.round(rand * 80); // 220m - 300m
        deltaX = 0;
        peakElevation = 0;
        sceneryTheme = 'scenic_vista';
        name = `Scenic Parkway #${this.nextSegmentId}`;
        break;
    }

    const endDist = startDist + length;
    const endX = startX + deltaX;

    this.activeSegments.push({
      id: this.nextSegmentId++,
      type,
      name,
      startDist,
      endDist,
      length,
      startX,
      endX,
      deltaX,
      peakElevation,
      difficulty: this.currentDifficulty,
      sceneryTheme,
    });
  }

  private pickNextSegmentType(lastType: RoadSegmentType, currentX: number): RoadSegmentType {
    const rand = this.pseudoRandom();

    // Rule 1: No consecutive tunnels or bridges
    const canTunnel = lastType !== 'tunnel';
    const canBridge = lastType !== 'bridge';

    // Rule 2: Lateral corridor containment (|X| <= MAX_LATERAL_OFFSET)
    // If we've drifted far left, we MUST or STRONGLY PREFER curving right
    if (currentX < -MAX_LATERAL_OFFSET * 0.7) {
      if (rand < 0.65) return 'gentle_right';
      return rand < 0.85 ? 'straight' : 'scenic';
    }
    // If we've drifted far right, we MUST or STRONGLY PREFER curving left
    if (currentX > MAX_LATERAL_OFFSET * 0.7) {
      if (rand < 0.65) return 'gentle_left';
      return rand < 0.85 ? 'straight' : 'scenic';
    }

    // Rule 3: After a curve, prefer straight, scenic, tunnel, or bridge before another curve
    if (lastType === 'gentle_left' || lastType === 'gentle_right') {
      if (canBridge && rand < 0.28) return 'bridge';
      if (canTunnel && rand < 0.52) return 'tunnel';
      if (rand < 0.8) return 'straight';
      return 'scenic';
    }

    // Rule 4: Weighted variety based on difficulty
    const curveProb = 0.35 + (this.currentDifficulty - 1) * 0.04;
    if (rand < curveProb) {
      // Pick direction based on current bias
      if (currentX > 15) return 'gentle_left';
      if (currentX < -15) return 'gentle_right';
      return this.pseudoRandom() < 0.5 ? 'gentle_left' : 'gentle_right';
    }

    // Non-curve options: straight, bridge, tunnel, scenic
    const r2 = this.pseudoRandom();
    if (canBridge && r2 < 0.3) return 'bridge';
    if (canTunnel && r2 < 0.55) return 'tunnel';
    if (r2 < 0.78) return 'straight';
    return 'scenic';
  }
}
