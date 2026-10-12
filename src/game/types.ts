export type GamePhase =
  'loading' | 'permission' | 'calibrating' | 'ready' | 'playing' | 'paused' | 'crashed';
export type ControlMode = 'hands' | 'keyboard';

export interface ControlInput {
  steering: number;
  confidence: number;
  active: boolean;
  accelerating?: boolean;
  braking?: boolean;
  /** Normalized analog brake pressure. Omitted when the brake is released. */
  brakePressure?: number;
  /** Sequential gear shift command: 1 for upshift, -1 for downshift. */
  gearShift?: 1 | -1;
  /** Direct target gear request (1-6). */
  targetGear?: number;
}

export interface RadarBlip {
  type: 'player' | 'traffic-lead' | 'traffic-incoming' | 'roadblock' | 'coin' | 'nitro';
  relDistance: number;
  lateral: number;
  speedKph?: number;
  isRival?: boolean;
}

export interface RadarRoadNode {
  relDistance: number;
  curveOffset: number;
}

export interface RadarTelemetry {
  playerDistance: number;
  playerLateral: number;
  playerSpeedKph: number;
  roadWidth: number;
  blips: RadarBlip[];
  roadNodes: RadarRoadNode[];
  upcomingTurn?: {
    direction: 'left' | 'right';
    severity: 'gentle' | 'sharp' | 'hairpin';
    distanceMeters: number;
  };
}

export interface GameSnapshot {
  speedKph: number;
  distance: number;
  overtakes: number;
  score: number;
  phase: GamePhase;
  assistMessage: string;
  health: number;
  weatherType?: 'clear' | 'rain' | 'snow';
  rainIntensity?: number;
  snowIntensity?: number;
  weatherMode?: 'auto' | 'rain' | 'snow' | 'clear';
  cameraMode?: number;
  cameraModeName?: string;
  currentGear?: number;
  gearLabel?: string;
  gearMaxKph?: number;
  radar?: RadarTelemetry;
}
