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
}
