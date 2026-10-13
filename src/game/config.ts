export const TRAFFIC_COUNT_OPTIONS = [0, 4, 8, 12, 16] as const;

export const GAME = {
  roadWidth: 28.5,
  laneWidth: 8.4,
  maxSpeed: 45,
  minCurveSpeed: 18,
  acceleration: 8,
  coastDeceleration: 2.4,
  serviceBrake: 13,
  emergencyBrake: 25,
  steeringRate: 8.5,
  maxLateral: 12.6,
  roadEdgeMargin: 2.1,
  trafficCount: 16,
  lookAhead: 260,
  lookBehind: 55,
  collisionLength: 9.2,
  collisionWidth: 3.9,
  conceptCollisionLength: 9.9,
  conceptCollisionWidth: 4.45,
} as const;

export const laneOffsets = [-8.4, 0, 8.4] as const;
