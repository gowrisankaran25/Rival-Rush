import { describe, it, expect, beforeEach } from 'vitest';
import { ProgressionStore } from './progressionStore';
import { RACE_MODES } from '../game/progression/raceModes';

// In-memory localStorage mock for headless node environment
class LocalStorageMock {
  private store: Record<string, string> = {};
  clear(): void {
    this.store = {};
  }
  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = value;
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
}

if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as unknown as { localStorage: LocalStorageMock }).localStorage =
    new LocalStorageMock();
}

describe('ProgressionStore', () => {
  let store: ProgressionStore;

  beforeEach(() => {
    localStorage.clear();
    store = new ProgressionStore();
  });

  it('initializes with all catalog vehicles unlocked and ready to use', () => {
    expect(store.getCredits()).toBeGreaterThanOrEqual(1000);
    expect(store.isCarUnlocked('ford-f150-raptor')).toBe(true);
    expect(store.isCarUnlocked('ford-everest-sport')).toBe(true);
    expect(store.isCarUnlocked('ioniq-5')).toBe(true);
    expect(store.isCarUnlocked('luxury-concept')).toBe(true);
    expect(store.isCarUnlocked('oldsmobile-cutlass')).toBe(true);
    expect(store.isCarUnlocked('ford-gt40')).toBe(true);
    expect(store.isCarUnlocked('skyline-r34')).toBe(true);
    expect(store.isCarUnlocked('ford-gt-2006')).toBe(true);
  });

  it('selects and retrieves any unlocked vehicle', () => {
    store.setSelectedCar('ford-gt-2006');
    expect(store.getSelectedCar()).toBe('ford-gt-2006');
    store.setSelectedCar('skyline-r34');
    expect(store.getSelectedCar()).toBe('skyline-r34');
  });

  it('records race result, awards credits and unlocks achievements', () => {
    const initialCredits = store.getCredits();
    const result = store.recordRaceResult({
      mode: 'rival_race',
      won: true,
      finishPosition: 1,
      completionTimeSeconds: 45.2,
      distanceMeters: 2000,
      maxSpeedKph: 235,
      overtakes: 8,
      score: 5500,
      health: 100,
      controlMode: 'hands',
    });

    expect(result.creditsEarned).toBeGreaterThan(0);
    expect(result.medal).toBe('gold');
    expect(store.getCredits()).toBeGreaterThan(initialCredits);
    expect(store.isAchievementUnlocked('first_ignition')).toBe(true);
    expect(store.isAchievementUnlocked('speed_demon')).toBe(true);
    expect(store.isAchievementUnlocked('rival_slayer')).toBe(true);
    expect(store.isAchievementUnlocked('gesture_ace')).toBe(true);
  });

  it('has valid definitions for all race modes', () => {
    expect(RACE_MODES.endless.name).toBe('ENDLESS HIGHWAY');
    expect(RACE_MODES.time_attack.distanceMeters).toBe(2500);
    expect(RACE_MODES.rival_race.hasRival).toBe(true);
    expect(RACE_MODES.traffic_challenge.targetOvertakes).toBe(12);
    expect(RACE_MODES.championship.objectives.length).toBeGreaterThan(0);
  });
});
