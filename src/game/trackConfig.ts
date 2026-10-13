/**
 * Configurable Highway Trajectory & Map Segment Parameters.
 * Defines the sequential layout:
 * 1. Straight highway
 * 2. Gentle left curve
 * 3. Straight section
 * 4. Gentle right curve
 * 5. Bridge section (with smooth elevation rise/fall)
 * 6. Final straight highway
 */

export interface TrackSegmentConfig {
  readonly id: string;
  readonly name: string;
  readonly type: 'straight' | 'curve_left' | 'curve_right' | 'bridge';
  readonly length: number;
  readonly curveStrength: number; // Lateral offset delta in meters (- for left, + for right)
  readonly peakElevation: number; // Peak elevation in meters
}

export const HIGHWAY_MAP_SEGMENTS: readonly TrackSegmentConfig[] = [
  {
    id: 'sec_1_straight',
    name: 'Initial Straight Highway',
    type: 'straight',
    length: 220,
    curveStrength: 0,
    peakElevation: 0,
  },
  {
    id: 'sec_2_left_curve',
    name: 'Gentle Left Curve',
    type: 'curve_left',
    length: 280,
    curveStrength: -42, // Smooth lateral shift left by 42m
    peakElevation: 0,
  },
  {
    id: 'sec_3_mid_straight',
    name: 'Mid Straight Highway',
    type: 'straight',
    length: 200,
    curveStrength: 0, // Maintains -42m offset with zero heading
    peakElevation: 0,
  },
  {
    id: 'sec_4_right_curve',
    name: 'Gentle Right Curve',
    type: 'curve_right',
    length: 280,
    curveStrength: 42, // Smooth lateral shift right by 42m returning to center
    peakElevation: 0,
  },
  {
    id: 'sec_5_bridge',
    name: 'Elevated Overpass Bridge',
    type: 'bridge',
    length: 380,
    curveStrength: 0,
    peakElevation: 6.5, // Climbs to +6.5m elevated bridge deck and descends
  },
  {
    id: 'sec_6_final_straight',
    name: 'Final Straight Highway',
    type: 'straight',
    length: 240,
    curveStrength: 0,
    peakElevation: 0,
  },
] as const;

export const TRACK_TOTAL_LENGTH: number = HIGHWAY_MAP_SEGMENTS.reduce(
  (sum, seg) => sum + seg.length,
  0,
); // 1600 meters
