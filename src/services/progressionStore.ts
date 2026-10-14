import type { CarModelId } from '../game/vehicleCatalog';
import { VEHICLE_SPECS } from '../game/vehicleCatalog';
import type { RaceModeId } from '../game/progression/raceModes';

export type MedalType = 'gold' | 'silver' | 'bronze';

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  rewardCredits: number;
  icon: string;
}

export const ACHIEVEMENTS_LIST: readonly AchievementDef[] = [
  {
    id: 'first_ignition',
    title: 'FIRST IGNITION',
    description: 'Complete your first race event in Rival Rush.',
    rewardCredits: 300,
    icon: '⚡',
  },
  {
    id: 'speed_demon',
    title: 'SPEED DEMON',
    description: 'Reach or exceed 200 KM/H during live gameplay.',
    rewardCredits: 500,
    icon: '🔥',
  },
  {
    id: 'hyper_drive',
    title: 'HYPER DRIVE',
    description: 'Engage 6th gear at wide-open throttle.',
    rewardCredits: 400,
    icon: '🚀',
  },
  {
    id: 'clean_racer',
    title: 'PERFECT LINE',
    description: 'Finish a sprint race with zero collisions (100% health).',
    rewardCredits: 800,
    icon: '🛡️',
  },
  {
    id: 'rival_slayer',
    title: 'RIVAL CONQUEROR',
    description: 'Defeat the lead AI competitor in Rival Race to claim 1st place.',
    rewardCredits: 1000,
    icon: '🏆',
  },
  {
    id: 'apex_overtaker',
    title: 'APEX OVERTAKER',
    description: 'Successfully execute 15 clean traffic overtakes in a single run.',
    rewardCredits: 600,
    icon: '🎯',
  },
  {
    id: 'highway_legend',
    title: 'HIGHWAY LEGEND',
    description: 'Drive more than 5,000 meters in Endless Highway mode.',
    rewardCredits: 1200,
    icon: '🛣️',
  },
  {
    id: 'fleet_owner',
    title: 'GARAGE MAGNATE',
    description: 'Unlock at least 4 vehicles in your garage collection.',
    rewardCredits: 1500,
    icon: '🏎️',
  },
  {
    id: 'gesture_ace',
    title: 'INVISIBLE WHEEL',
    description: 'Complete any full race event using webcam hand gesture controls.',
    rewardCredits: 800,
    icon: '🖐️',
  },
  {
    id: 'champion',
    title: 'GRAND PRIX CHAMPION',
    description: 'Complete the 3-stage Championship Tour.',
    rewardCredits: 2000,
    icon: '👑',
  },
];

export interface PlayerStats {
  totalRaces: number;
  totalWins: number;
  totalDistanceMeters: number;
  totalOvertakes: number;
  maxSpeedKph: number;
  totalCreditsEarned: number;
}

export interface PlayerRecords {
  endless: {
    maxDistanceMeters: number;
    maxScore: number;
    maxSpeedKph: number;
    medal: MedalType | null;
  };
  time_attack: {
    bestTimeSeconds: number | null;
    medal: MedalType | null;
  };
  rival_race: {
    wins: number;
    bestTimeSeconds: number | null;
    medal: MedalType | null;
  };
  traffic_challenge: {
    maxOvertakes: number;
    medal: MedalType | null;
  };
  championship: {
    completed: boolean;
    cup: MedalType | null;
  };
}

export interface ProgressionData {
  version: number;
  credits: number;
  unlockedCars: CarModelId[];
  unlockedPaints: string[];
  selectedCar: CarModelId;
  selectedPaintHex: string;
  selectedMode: RaceModeId;
  selectedCameraMode: number;
  selectedControlMode: 'hands' | 'keyboard';
  records: PlayerRecords;
  achievements: Record<string, { unlocked: boolean; unlockedAt: string }>;
  stats: PlayerStats;
}

const STORAGE_KEY = 'rivalrush_save_v2';

export const MOTORSPORT_PRESET_PAINTS: readonly { name: string; hex: string }[] = [
  { name: 'Apex White', hex: '#f5f7f4' },
  { name: 'Stealth Black', hex: '#111317' },
  { name: 'Acid Lime', hex: '#e9ff42' },
  { name: 'Velocity Red', hex: '#e63946' },
  { name: 'Gulf Cyan', hex: '#00e5ff' },
  { name: 'Electric Blue', hex: '#0077b6' },
  { name: 'Sunset Orange', hex: '#ff7700' },
  { name: 'Gunmetal Gray', hex: '#4a5568' },
  { name: 'Racing Gold', hex: '#d4af37' },
];

function createInitialProgression(): ProgressionData {
  const initialCars: CarModelId[] = (Object.keys(VEHICLE_SPECS) as CarModelId[]).filter(
    (id) => VEHICLE_SPECS[id].unlockedByDefault,
  );

  return {
    version: 2,
    credits: 1500,
    unlockedCars: initialCars,
    unlockedPaints: MOTORSPORT_PRESET_PAINTS.map((p) => p.hex),
    selectedCar: 'ford-f150-raptor',
    selectedPaintHex: '#f5f7f4',
    selectedMode: 'endless',
    selectedCameraMode: 1,
    selectedControlMode: 'hands',
    records: {
      endless: {
        maxDistanceMeters: 0,
        maxScore: 0,
        maxSpeedKph: 0,
        medal: null,
      },
      time_attack: {
        bestTimeSeconds: null,
        medal: null,
      },
      rival_race: {
        wins: 0,
        bestTimeSeconds: null,
        medal: null,
      },
      traffic_challenge: {
        maxOvertakes: 0,
        medal: null,
      },
      championship: {
        completed: false,
        cup: null,
      },
    },
    achievements: {},
    stats: {
      totalRaces: 0,
      totalWins: 0,
      totalDistanceMeters: 0,
      totalOvertakes: 0,
      maxSpeedKph: 0,
      totalCreditsEarned: 1500,
    },
  };
}

export class ProgressionStore {
  private data: ProgressionData;

  constructor() {
    this.data = this.load();
  }

  private load(): ProgressionData {
    try {
      if (typeof localStorage === 'undefined') return createInitialProgression();
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return createInitialProgression();
      const parsed = JSON.parse(raw) as Partial<ProgressionData>;
      if (!parsed || typeof parsed !== 'object') return createInitialProgression();
      const initial = createInitialProgression();

      return {
        ...initial,
        ...parsed,
        unlockedCars: Array.from(
          new Set([
            ...initial.unlockedCars,
            ...(Array.isArray(parsed.unlockedCars) ? parsed.unlockedCars : []),
          ]),
        ),
        unlockedPaints: Array.isArray(parsed.unlockedPaints)
          ? parsed.unlockedPaints
          : initial.unlockedPaints,
        records: {
          ...initial.records,
          ...(parsed.records || {}),
        },
        achievements: {
          ...initial.achievements,
          ...(parsed.achievements || {}),
        },
        stats: {
          ...initial.stats,
          ...(parsed.stats || {}),
        },
      };
    } catch {
      return createInitialProgression();
    }
  }

  save(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
      }
    } catch (e) {
      console.warn('Could not save progression to localStorage', e);
    }
  }

  getData(): Readonly<ProgressionData> {
    return this.data;
  }

  getCredits(): number {
    return this.data.credits;
  }

  addCredits(amount: number): number {
    if (amount <= 0) return this.data.credits;
    this.data.credits += Math.round(amount);
    this.data.stats.totalCreditsEarned += Math.round(amount);
    this.save();
    return this.data.credits;
  }

  spendCredits(amount: number): boolean {
    if (amount <= 0) return true;
    if (this.data.credits < amount) return false;
    this.data.credits -= Math.round(amount);
    this.save();
    return true;
  }

  isCarUnlocked(carId: CarModelId): boolean {
    return this.data.unlockedCars.includes(carId);
  }

  unlockCar(carId: CarModelId): boolean {
    if (this.isCarUnlocked(carId)) return true;
    const spec = VEHICLE_SPECS[carId];
    if (!spec) return false;

    if (spec.priceCredits > 0) {
      if (!this.spendCredits(spec.priceCredits)) return false;
    }
    this.data.unlockedCars.push(carId);
    this.checkUnlockAchievements();
    this.save();
    return true;
  }

  setSelectedCar(carId: CarModelId): void {
    if (this.isCarUnlocked(carId)) {
      this.data.selectedCar = carId;
      this.save();
    }
  }

  getSelectedCar(): CarModelId {
    return this.data.selectedCar;
  }

  setSelectedPaintHex(hex: string): void {
    this.data.selectedPaintHex = hex;
    if (!this.data.unlockedPaints.includes(hex)) {
      this.data.unlockedPaints.push(hex);
    }
    this.save();
  }

  getSelectedPaintHex(): string {
    return this.data.selectedPaintHex;
  }

  setSelectedMode(mode: RaceModeId): void {
    this.data.selectedMode = mode;
    this.save();
  }

  getSelectedMode(): RaceModeId {
    return this.data.selectedMode;
  }

  setSelectedControlMode(mode: 'hands' | 'keyboard'): void {
    this.data.selectedControlMode = mode;
    this.save();
  }

  getSelectedControlMode(): 'hands' | 'keyboard' {
    return this.data.selectedControlMode;
  }

  setSelectedCameraMode(modeIndex: number): void {
    this.data.selectedCameraMode = modeIndex;
    this.save();
  }

  getSelectedCameraMode(): number {
    return this.data.selectedCameraMode;
  }

  /**
   * Evaluates race results, updates personal best records, awards credits,
   * unlocks earned achievements, and returns detailed result summary.
   */
  recordRaceResult(params: {
    mode: RaceModeId;
    won: boolean;
    finishPosition: number;
    completionTimeSeconds: number;
    distanceMeters: number;
    maxSpeedKph: number;
    overtakes: number;
    score: number;
    health: number;
    controlMode: 'hands' | 'keyboard';
  }): {
    creditsEarned: number;
    newPersonalBest: boolean;
    medal: MedalType | null;
    unlockedAchievements: AchievementDef[];
  } {
    const {
      mode,
      won,
      finishPosition,
      completionTimeSeconds,
      distanceMeters,
      maxSpeedKph,
      overtakes,
      score,
      health,
      controlMode,
    } = params;

    this.data.stats.totalRaces += 1;
    if (won || finishPosition === 1) {
      this.data.stats.totalWins += 1;
    }
    this.data.stats.totalDistanceMeters += Math.round(distanceMeters);
    this.data.stats.totalOvertakes += overtakes;
    if (maxSpeedKph > this.data.stats.maxSpeedKph) {
      this.data.stats.maxSpeedKph = Math.round(maxSpeedKph);
    }

    let creditsEarned = 0;
    let newPersonalBest = false;
    let medal: MedalType | null = null;

    // Base performance earnings
    creditsEarned += Math.round(distanceMeters * 0.15); // Distance bounty
    creditsEarned += overtakes * 25; // Overtake bonus
    if (health >= 100) creditsEarned += 250; // Clean driving bonus

    if (mode === 'endless') {
      if (distanceMeters > this.data.records.endless.maxDistanceMeters) {
        this.data.records.endless.maxDistanceMeters = Math.round(distanceMeters);
        newPersonalBest = true;
      }
      if (score > this.data.records.endless.maxScore) {
        this.data.records.endless.maxScore = score;
        newPersonalBest = true;
      }
      if (maxSpeedKph > this.data.records.endless.maxSpeedKph) {
        this.data.records.endless.maxSpeedKph = Math.round(maxSpeedKph);
      }
      if (distanceMeters >= 5000 || score >= 25000) medal = 'gold';
      else if (distanceMeters >= 3000 || score >= 15000) medal = 'silver';
      else if (distanceMeters >= 1500 || score >= 7500) medal = 'bronze';
      if (medal) this.data.records.endless.medal = medal;
      creditsEarned += medal === 'gold' ? 800 : medal === 'silver' ? 400 : 200;
    } else if (mode === 'time_attack') {
      const currentBest = this.data.records.time_attack.bestTimeSeconds;
      if (won) {
        if (currentBest === null || completionTimeSeconds < currentBest) {
          this.data.records.time_attack.bestTimeSeconds = Number(completionTimeSeconds.toFixed(2));
          newPersonalBest = true;
        }
        if (completionTimeSeconds <= 48.0) medal = 'gold';
        else if (completionTimeSeconds <= 54.0) medal = 'silver';
        else medal = 'bronze';
        this.data.records.time_attack.medal = medal;
        creditsEarned += medal === 'gold' ? 1000 : medal === 'silver' ? 600 : 350;
      }
    } else if (mode === 'rival_race') {
      if (won || finishPosition === 1) {
        this.data.records.rival_race.wins += 1;
        const currentBest = this.data.records.rival_race.bestTimeSeconds;
        if (currentBest === null || completionTimeSeconds < currentBest) {
          this.data.records.rival_race.bestTimeSeconds = Number(completionTimeSeconds.toFixed(2));
          newPersonalBest = true;
        }
        medal = 'gold';
        this.data.records.rival_race.medal = 'gold';
        creditsEarned += 1500;
      } else {
        medal = 'bronze';
        creditsEarned += 400;
      }
    } else if (mode === 'traffic_challenge') {
      if (overtakes > this.data.records.traffic_challenge.maxOvertakes) {
        this.data.records.traffic_challenge.maxOvertakes = overtakes;
        newPersonalBest = true;
      }
      if (overtakes >= 16 && health >= 90) medal = 'gold';
      else if (overtakes >= 12) medal = 'silver';
      else if (overtakes >= 8) medal = 'bronze';
      if (medal) this.data.records.traffic_challenge.medal = medal;
      creditsEarned += medal === 'gold' ? 1200 : medal === 'silver' ? 700 : 400;
    } else if (mode === 'championship') {
      if (won || finishPosition === 1) {
        this.data.records.championship.completed = true;
        this.data.records.championship.cup = 'gold';
        medal = 'gold';
        creditsEarned += 3000;
      } else {
        medal = 'silver';
        creditsEarned += 1000;
      }
    }

    this.addCredits(creditsEarned);

    // Check achievements
    const newlyUnlocked: AchievementDef[] = [];
    const unlock = (id: string) => {
      if (!this.data.achievements[id]?.unlocked) {
        this.data.achievements[id] = {
          unlocked: true,
          unlockedAt: new Date().toISOString(),
        };
        const def = ACHIEVEMENTS_LIST.find((a) => a.id === id);
        if (def) {
          newlyUnlocked.push(def);
          this.addCredits(def.rewardCredits);
        }
      }
    };

    unlock('first_ignition');
    if (maxSpeedKph >= 200) unlock('speed_demon');
    if (health >= 100 && (mode !== 'endless' || distanceMeters >= 1000)) unlock('clean_racer');
    if (mode === 'rival_race' && (won || finishPosition === 1)) unlock('rival_slayer');
    if (overtakes >= 15) unlock('apex_overtaker');
    if (mode === 'endless' && distanceMeters >= 5000) unlock('highway_legend');
    if (controlMode === 'hands') unlock('gesture_ace');
    if (mode === 'championship' && won) unlock('champion');
    this.checkUnlockAchievements(newlyUnlocked);

    this.save();

    return {
      creditsEarned,
      newPersonalBest,
      medal,
      unlockedAchievements: newlyUnlocked,
    };
  }

  private checkUnlockAchievements(newlyUnlocked?: AchievementDef[]): void {
    if (this.data.unlockedCars.length >= 4 && !this.data.achievements['fleet_owner']?.unlocked) {
      this.data.achievements['fleet_owner'] = {
        unlocked: true,
        unlockedAt: new Date().toISOString(),
      };
      const def = ACHIEVEMENTS_LIST.find((a) => a.id === 'fleet_owner');
      if (def) {
        newlyUnlocked?.push(def);
        this.addCredits(def.rewardCredits);
      }
    }
  }

  isAchievementUnlocked(id: string): boolean {
    return !!this.data.achievements[id]?.unlocked;
  }

  resetProgress(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.data = createInitialProgression();
    this.save();
  }
}

export const progressionStore = new ProgressionStore();
