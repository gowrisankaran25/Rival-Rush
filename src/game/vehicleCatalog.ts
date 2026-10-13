export type CarModelId =
  | 'ford-f150-raptor'
  | 'ford-everest-sport'
  | 'ioniq-5'
  | 'luxury-concept'
  | 'oldsmobile-cutlass'
  | 'ford-gt40'
  | 'skyline-r34'
  | 'ford-gt-2006';

export interface VehicleSpec {
  id: CarModelId;
  label: string;
  category: 'PERFORMANCE TRUCK' | 'RUGGED SUV' | 'ELECTRIC GT' | 'AERO PROTOTYPE' | 'CLASSIC MUSCLE' | 'ENDURANCE LEGEND' | 'JDM TUNER' | 'AMERICAN HYPER';
  topSpeedKph: number;
  accelRating: number; // 1 to 10
  handlingRating: number; // 1 to 10
  nitroRating: number; // 1 to 10
  priceCredits: number;
  unlockedByDefault: boolean;
  description: string;
  defaultColorHex: string;
}

export const DEFAULT_CAR_MODEL_ID: CarModelId = 'ford-f150-raptor';

export const VEHICLE_SPECS: Record<CarModelId, VehicleSpec> = {
  'ford-f150-raptor': {
    id: 'ford-f150-raptor',
    label: '2017 Ford F-150 Raptor',
    category: 'PERFORMANCE TRUCK',
    topSpeedKph: 195,
    accelRating: 6.8,
    handlingRating: 7.2,
    nitroRating: 6.5,
    priceCredits: 0,
    unlockedByDefault: true,
    description: 'High-output twin-turbo V6 terrain conqueror. Maximum stability, forgiving road manners, and heavy presence.',
    defaultColorHex: '#f5f7f4',
  },
  'ford-everest-sport': {
    id: 'ford-everest-sport',
    label: '2023 Ford Everest Sport',
    category: 'RUGGED SUV',
    topSpeedKph: 205,
    accelRating: 7.0,
    handlingRating: 7.5,
    nitroRating: 7.0,
    priceCredits: 1200,
    unlockedByDefault: true,
    description: 'Modern turbo-diesel adventure chassis. Solid road-holding through high-speed curves with exceptional chassis balance.',
    defaultColorHex: '#1b2330',
  },
  'ioniq-5': {
    id: 'ioniq-5',
    label: 'Hyundai Ioniq 5',
    category: 'ELECTRIC GT',
    topSpeedKph: 220,
    accelRating: 8.6,
    handlingRating: 8.2,
    nitroRating: 8.0,
    priceCredits: 2000,
    unlockedByDefault: true,
    description: 'Dual-motor electric propulsion with instantaneous launch torque and ultra-low center of gravity.',
    defaultColorHex: '#e9eef2',
  },
  'luxury-concept': {
    id: 'luxury-concept',
    label: '2018 Audi e-tron GT Concept',
    category: 'AERO PROTOTYPE',
    topSpeedKph: 245,
    accelRating: 9.1,
    handlingRating: 8.9,
    nitroRating: 8.5,
    priceCredits: 0,
    unlockedByDefault: true,
    description: 'Low-slung aerodynamic grand tourer. Laser-sharp lane changes and blistering straightaway pace.',
    defaultColorHex: '#808992',
  },
  'oldsmobile-cutlass': {
    id: 'oldsmobile-cutlass',
    label: '1971 Oldsmobile Cutlass Supreme',
    category: 'CLASSIC MUSCLE',
    topSpeedKph: 215,
    accelRating: 7.8,
    handlingRating: 6.5,
    nitroRating: 7.5,
    priceCredits: 0,
    unlockedByDefault: true,
    description: 'Raw Rocket V8 torque with authentic American thunder. Demands assertive steering and rewards bold throttle.',
    defaultColorHex: '#b28d42',
  },
  'ford-gt40': {
    id: 'ford-gt40',
    label: '1966 Ford GT40 Mk I',
    category: 'ENDURANCE LEGEND',
    topSpeedKph: 260,
    accelRating: 9.4,
    handlingRating: 9.2,
    nitroRating: 9.0,
    priceCredits: 0,
    unlockedByDefault: true,
    description: 'Le Mans champion that rewrote motorsport history. Ultra-light, razor-sharp response, and intoxicating 7000 RPM scream.',
    defaultColorHex: '#0055b3',
  },
  'skyline-r34': {
    id: 'skyline-r34',
    label: 'Nissan Skyline GT-R R34',
    category: 'JDM TUNER',
    topSpeedKph: 255,
    accelRating: 9.3,
    handlingRating: 9.5,
    nitroRating: 8.8,
    priceCredits: 0,
    unlockedByDefault: true,
    description: 'Twin-turbo ATTESA all-wheel precision weapon. Unshakeable grip, rapid boost response, and supreme cornering authority.',
    defaultColorHex: '#2244aa',
  },
  'ford-gt-2006': {
    id: 'ford-gt-2006',
    label: '2006 Ford GT',
    category: 'AMERICAN HYPER',
    topSpeedKph: 265,
    accelRating: 9.7,
    handlingRating: 9.4,
    nitroRating: 9.5,
    priceCredits: 0,
    unlockedByDefault: true,
    description: 'Supercharged 5.4L mid-engine supercar. Colossal top-end acceleration with surgical track-day steering agility.',
    defaultColorHex: '#d81824',
  },
};

export const CAR_MODEL_OPTIONS: readonly { id: CarModelId; label: string }[] = Object.values(
  VEHICLE_SPECS,
).map((spec) => ({ id: spec.id, label: spec.label }));

export const CAR_MODEL_VARIETY_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export function selectCarModelIds(playerModelId: CarModelId, requestedCount: number): CarModelId[] {
  const modelIds = CAR_MODEL_OPTIONS.map(({ id }) => id);
  const start = Math.max(0, modelIds.indexOf(playerModelId));
  const normalizedCount = Number.isFinite(requestedCount) ? Math.round(requestedCount) : 1;
  const count = Math.max(1, Math.min(modelIds.length, normalizedCount));
  return Array.from({ length: count }, (_, offset) => modelIds[(start + offset) % modelIds.length]);
}

