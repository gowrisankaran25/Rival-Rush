export type CarModelId =
  | 'ford-f150-raptor'
  | 'ford-everest-sport'
  | 'ioniq-5'
  | 'luxury-concept'
  | 'oldsmobile-cutlass'
  | 'ford-gt40'
  | 'skyline-r34'
  | 'ford-gt-2006';

export const DEFAULT_CAR_MODEL_ID: CarModelId = 'ford-f150-raptor';

export const CAR_MODEL_OPTIONS: readonly { id: CarModelId; label: string }[] = [
  { id: 'ford-f150-raptor', label: '2017 Ford F-150 Raptor' },
  { id: 'ford-everest-sport', label: '2023 Ford Everest Sport' },
  { id: 'ioniq-5', label: 'Hyundai Ioniq 5' },
  { id: 'luxury-concept', label: '2018 Audi e-tron GT Concept' },
  { id: 'oldsmobile-cutlass', label: '1971 Oldsmobile Cutlass Supreme' },
  { id: 'ford-gt40', label: '1966 Ford GT40 Mk I' },
  { id: 'skyline-r34', label: 'Nissan Skyline GT-R R34' },
  { id: 'ford-gt-2006', label: '2006 Ford GT' },
];

export const CAR_MODEL_VARIETY_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export function selectCarModelIds(playerModelId: CarModelId, requestedCount: number): CarModelId[] {
  const modelIds = CAR_MODEL_OPTIONS.map(({ id }) => id);
  const start = Math.max(0, modelIds.indexOf(playerModelId));
  const normalizedCount = Number.isFinite(requestedCount) ? Math.round(requestedCount) : 1;
  const count = Math.max(1, Math.min(modelIds.length, normalizedCount));
  return Array.from({ length: count }, (_, offset) => modelIds[(start + offset) % modelIds.length]);
}
