export type RaceModeId =
  'endless' | 'time_attack' | 'rival_race' | 'traffic_challenge' | 'championship';

export interface RaceModeConfig {
  id: RaceModeId;
  name: string;
  tagline: string;
  category: string;
  description: string;
  distanceMeters: number | null; // null for infinite
  timeLimitSeconds: number | null; // null for unlimited
  targetOvertakes: number | null;
  hasRival: boolean;
  rivalCarModel?: string;
  defaultTrafficCount: number;
  baseRewardCredits: number;
  objectives: string[];
  medalCriteria: {
    gold: string;
    silver: string;
    bronze: string;
  };
}

export const RACE_MODES: Record<RaceModeId, RaceModeConfig> = {
  endless: {
    id: 'endless',
    name: 'ENDLESS HIGHWAY',
    tagline: 'SURVIVE THE OPEN ROAD',
    category: 'SURVIVAL RUN',
    description:
      'Open-throttle highway survival. Weave through dynamic traffic, chain overtakes for score multipliers, and conquer personal distance records.',
    distanceMeters: null,
    timeLimitSeconds: null,
    targetOvertakes: null,
    hasRival: false,
    defaultTrafficCount: 4,
    baseRewardCredits: 500,
    objectives: [
      'Reach 3,000 meters distance',
      'Execute 15 clean overtakes',
      'Maintain > 160 KM/H average speed',
    ],
    medalCriteria: {
      gold: 'Distance > 5,000m or Score > 25,000',
      silver: 'Distance > 3,000m or Score > 15,000',
      bronze: 'Distance > 1,500m or Score > 7,500',
    },
  },
  time_attack: {
    id: 'time_attack',
    name: 'TIME ATTACK',
    tagline: 'RACE AGAINST THE CLOCK',
    category: 'SPRINT TRIAL',
    description:
      'A blisteringly fast 2,500m sprint course against a strict countdown timer. Precision cornering and gear shifting are required to take Gold.',
    distanceMeters: 2500,
    timeLimitSeconds: 72,
    targetOvertakes: null,
    hasRival: false,
    defaultTrafficCount: 3,
    baseRewardCredits: 800,
    objectives: [
      'Reach the finish line before time expires',
      'Shift into 6th gear on the back straight',
      'Take zero collision damage',
    ],
    medalCriteria: {
      gold: 'Finish under 48.0s',
      silver: 'Finish under 58.0s',
      bronze: 'Finish before 72.0s time runs out',
    },
  },
  rival_race: {
    id: 'rival_race',
    name: 'RIVAL RACE',
    tagline: 'WHEEL-TO-WHEEL SHOWDOWN',
    category: 'HEAD-TO-HEAD',
    description:
      'Go bumper-to-bumper across 2,000 meters against an elite AI competitor in a tuned supercar. Take the lead and cross the line 1st for glory.',
    distanceMeters: 2000,
    timeLimitSeconds: 85,
    targetOvertakes: null,
    hasRival: true,
    rivalCarModel: 'ford-gt40',
    defaultTrafficCount: 4,
    baseRewardCredits: 1200,
    objectives: [
      'Overtake the rival vehicle',
      'Defend 1st position across the finish line',
      'Avoid high-speed road edge collisions',
    ],
    medalCriteria: {
      gold: '1st Place victory with lead > 40m',
      silver: '1st Place victory',
      bronze: '2nd Place finish (completed race)',
    },
  },
  traffic_challenge: {
    id: 'traffic_challenge',
    name: 'TRAFFIC CHALLENGE',
    tagline: 'PRECISION OVERTAKE GAUNTLET',
    category: 'TECHNICAL GAUNTLET',
    description:
      'High-density highway traffic gauntlet over 2,200 meters. Test your hand-eye coordination with rapid lane changes and clean overtaking streaks.',
    distanceMeters: 2200,
    timeLimitSeconds: null,
    targetOvertakes: 12,
    hasRival: false,
    defaultTrafficCount: 6,
    baseRewardCredits: 1000,
    objectives: [
      'Complete at least 12 clean overtakes',
      'Finish with remaining health above 50%',
      'Reach the 2,200m checkpoint banner',
    ],
    medalCriteria: {
      gold: '16+ overtakes & 100% clean health',
      silver: '12+ overtakes & 75%+ health',
      bronze: '8+ overtakes & finish course',
    },
  },
  championship: {
    id: 'championship',
    name: 'CHAMPIONSHIP TOUR',
    tagline: 'THREE-STAGE GRAND PRIX',
    category: 'TOURNAMENT CUP',
    description:
      'The ultimate Rival Rush racing cup. Complete 3 sequential stages: Stage 1 Time Trial, Stage 2 Traffic Gauntlet, and Stage 3 Rival Grand Finale.',
    distanceMeters: 2500,
    timeLimitSeconds: 65,
    targetOvertakes: 10,
    hasRival: true,
    rivalCarModel: 'skyline-r34',
    defaultTrafficCount: 5,
    baseRewardCredits: 2500,
    objectives: [
      'Win all 3 championship race stages',
      'Earn minimum 3,000 championship points',
      'Claim the Grand Prix Trophy',
    ],
    medalCriteria: {
      gold: 'Triple Stage Gold Crown',
      silver: 'Championship Podium',
      bronze: 'Completed Grand Prix Tour',
    },
  },
};

export const RACE_MODE_LIST: readonly RaceModeConfig[] = Object.values(RACE_MODES);
