export type GamePhase =
  | 'loading'
  | 'permission'
  | 'calibrating'
  | 'ready'
  | 'countdown'
  | 'racing'
  | 'final_approach'
  | 'finishing'
  | 'results'
  | 'restarting'
  | 'playing'
  | 'paused'
  | 'crashed';
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
  roadCondition?: RoadCondition;
  headlightsActive?: boolean;
}

export type HeadlightMode = 'auto' | 'on' | 'off';
export type WeatherType = 'clear' | 'fog' | 'rain' | 'storm' | 'snow';
export type WeatherMode = 'auto' | 'clear' | 'fog' | 'rain' | 'storm' | 'snow';

export interface RoadCondition {
  surface: 'dry' | 'damp' | 'wet' | 'flooded' | 'icy';
  grip: number;
  brakingFactor: number;
  curveSpeedFactor: number;
  hydroplaneRisk: number;
  tireSlip: number;
  label: string;
  statusType: 'optimal' | 'warning' | 'danger';
}

export interface RaceResult {
  won: boolean;
  finishPosition: number;
  completionTimeSeconds: number;
  distanceMeters: number;
  maxSpeedKph: number;
  overtakes: number;
  score: number;
  health: number;
  mode: string;
}

export interface GameSnapshot {
  speedKph: number;
  distance: number;
  overtakes: number;
  score: number;
  phase: GamePhase;
  assistMessage: string;
  health: number;
  weatherType?: WeatherType;
  rainIntensity?: number;
  snowIntensity?: number;
  fogIntensity?: number;
  stormIntensity?: number;
  weatherMode?: WeatherMode;
  cameraMode?: number;
  cameraModeName?: string;
  currentGear?: number;
  gearLabel?: string;
  gearMaxKph?: number;
  radar?: RadarTelemetry;
  roadCondition?: RoadCondition;
  headlightMode?: HeadlightMode;
  headlightsActive?: boolean;
  raceTimeSeconds?: number;
  distanceRemaining?: number | null;
  finishDistance?: number | null;
  position?: number;
  countdownValue?: number | null; // 3, 2, 1, 0 (GO)
  approachWarning?: string | null; // '500M', '300M', '100M', etc.
  raceModeName?: string;
  steering?: number;
}
