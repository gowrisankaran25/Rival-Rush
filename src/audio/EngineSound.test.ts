import { beforeEach, describe, expect, it } from 'vitest';
import { EngineSound } from './EngineSound';

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

describe('EngineSound', () => {
  beforeEach(() => {
    (globalThis as any).localStorage = new MemoryStorage();
  });

  it('initializes with default volume levels and saves settings', () => {
    const audio = new EngineSound();
    expect(audio.getMasterVolume()).toBe(1.0);
    expect(audio.getEngineVolume()).toBe(1.0);
    expect(audio.getMusicVolume()).toBe(1.0);
    expect(audio.getEnabled()).toBe(true);

    audio.setMasterVolume(1.5);
    expect(audio.getMasterVolume()).toBe(1.5);

    audio.setEngineVolume(1.8);
    expect(audio.getEngineVolume()).toBe(1.8);

    audio.setMusicVolume(0.5);
    expect(audio.getMusicVolume()).toBe(0.5);

    // Reconstruct to test persistence
    const reloaded = new EngineSound();
    expect(reloaded.getMasterVolume()).toBe(1.5);
    expect(reloaded.getEngineVolume()).toBe(1.8);
    expect(reloaded.getMusicVolume()).toBe(0.5);
  });

  it('clamps volume values between 0.0 and 2.0', () => {
    const audio = new EngineSound();
    audio.setMasterVolume(3.5);
    expect(audio.getMasterVolume()).toBe(2.0);

    audio.setMasterVolume(-0.5);
    expect(audio.getMasterVolume()).toBe(0.0);

    audio.setEngineVolume(2.5);
    expect(audio.getEngineVolume()).toBe(2.0);

    audio.setMusicVolume(-1);
    expect(audio.getMusicVolume()).toBe(0.0);
  });

  it('toggles enabled state and persists it', () => {
    const audio = new EngineSound();
    audio.setEnabled(false);
    expect(audio.getEnabled()).toBe(false);

    const reloaded = new EngineSound();
    expect(reloaded.getEnabled()).toBe(false);
  });

  it('manages menu music state and audio mode transitions', () => {
    const audio = new EngineSound();
    expect(audio.getMode()).toBe('menu');
    expect(audio.isMenuMusicActive()).toBe(true);

    const toggled = audio.toggleMenuMusic();
    expect(toggled).toBe(false);
    expect(audio.isMenuMusicActive()).toBe(false);

    audio.startMenuMusic();
    expect(audio.getMode()).toBe('menu');
    expect(audio.isMenuMusicActive()).toBe(true);

    audio.startRacingMusic();
    expect(audio.getMode()).toBe('racing');

    // Safe execution of previewCarEngine
    expect(() => {
      audio.previewCarEngine('oldsmobile-cutlass');
      audio.previewCarEngine('ford-gt40');
      audio.previewCarEngine('skyline-r34');
      audio.previewCarEngine('ford-gt-2006');
    }).not.toThrow();
  });
});
