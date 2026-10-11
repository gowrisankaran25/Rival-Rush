export interface AudioSettingsState {
  masterVolume: number;
  engineVolume: number;
  musicVolume: number;
  enabled: boolean;
}

const AUDIO_STORAGE_KEY = 'rival-rush-sound-settings';

/**
 * Owns all procedural game audio. Keeping Web Audio nodes behind this class
 * prevents UI and game-state code from depending on the audio graph.
 */
export class EngineSound {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private oscillator: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private beat = 0;
  private playing = false;
  private enabled = true;
  private masterVolume = 1.0;
  private engineVolume = 1.0;
  private musicVolume = 1.0;
  private carModelId: string = 'ford-f150-raptor';

  constructor() {
    this.loadSettings();
  }

  setCarModel(modelId: string): void {
    this.carModelId = modelId;
  }

  getMasterVolume(): number {
    return this.masterVolume;
  }

  setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(2.0, volume));
    this.saveSettings();
    if (this.masterGain && this.context) {
      this.masterGain.gain.setTargetAtTime(
        this.enabled ? this.masterVolume : 0,
        this.context.currentTime,
        0.05,
      );
    }
  }

  getEngineVolume(): number {
    return this.engineVolume;
  }

  setEngineVolume(volume: number): void {
    this.engineVolume = Math.max(0, Math.min(2.0, volume));
    this.saveSettings();
  }

  getMusicVolume(): number {
    return this.musicVolume;
  }

  setMusicVolume(volume: number): void {
    this.musicVolume = Math.max(0, Math.min(2.0, volume));
    this.saveSettings();
    if (this.musicGain && this.context) {
      this.musicGain.gain.setTargetAtTime(0.13 * this.musicVolume, this.context.currentTime, 0.05);
    }
  }

  getEnabled(): boolean {
    return this.enabled;
  }

  start(): void {
    if (this.context) return;
    this.context = new AudioContext();
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = this.enabled ? this.masterVolume : 0;
    this.masterGain.connect(this.context.destination);

    this.oscillator = this.context.createOscillator();
    this.gain = this.context.createGain();
    this.musicGain = this.context.createGain();
    this.oscillator.type = 'sawtooth';
    this.oscillator.frequency.value = 54;
    this.gain.gain.value = 0.025;
    this.musicGain.gain.value = 0.13 * this.musicVolume;

    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 240;
    this.oscillator.connect(filter).connect(this.gain).connect(this.masterGain);
    this.musicGain.connect(this.masterGain);
    this.oscillator.start();
    this.musicTimer = window.setInterval(() => this.scheduleMusicBeat(), 250);
  }

  update(speedKph: number): void {
    if (!this.context || !this.oscillator || !this.gain) return;

    let baseFreq = 48;
    let freqMultiplier = 1.1;
    let volumeMax = 0.018;
    let type: OscillatorType = 'sawtooth';

    if (this.carModelId === 'ford-f150-raptor') {
      baseFreq = 35;
      freqMultiplier = 1.4;
      volumeMax = 0.025;
      type = 'square';
    } else if (this.carModelId === 'ioniq-5' || this.carModelId === 'luxury-concept') {
      baseFreq = 200;
      freqMultiplier = 2.5;
      volumeMax = 0.012;
      type = 'sine';
    }

    if (this.oscillator.type !== type) {
      this.oscillator.type = type;
    }

    this.oscillator.frequency.setTargetAtTime(
      baseFreq + speedKph * freqMultiplier,
      this.context.currentTime,
      0.08,
    );
    // Multiply volume by 5 for a much louder sound, multiplied by user engine volume setting
    const volume =
      this.enabled && speedKph > 1 ? (volumeMax + speedKph / 9000) * 5.0 * this.engineVolume : 0;
    this.gain.gain.setTargetAtTime(volume, this.context.currentTime, 0.12);
  }

  setPlaying(playing: boolean): void {
    this.playing = playing;
    if (playing) void this.context?.resume();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.saveSettings();
    if (this.context && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(
        enabled ? this.masterVolume : 0,
        this.context.currentTime,
        0.04,
      );
    }
  }

  hornThreeTimes(): void {
    if (!this.context || !this.playing || !this.enabled) return;
    const start = this.context.currentTime + 0.025;
    for (let index = 0; index < 3; index += 1) {
      this.playHornPulse(start + index * 0.34);
    }
  }

  testSound(): void {
    if (!this.context) this.start();
    if (!this.context) return;
    void this.context.resume();
    const now = this.context.currentTime;
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(this.masterVolume, now);
    }
    // Quick engine rev sweep
    if (this.oscillator && this.gain) {
      this.oscillator.frequency.setValueAtTime(50, now);
      this.oscillator.frequency.exponentialRampToValueAtTime(140, now + 0.18);
      this.oscillator.frequency.exponentialRampToValueAtTime(60, now + 0.38);
      this.gain.gain.setValueAtTime(0.001, now);
      this.gain.gain.linearRampToValueAtTime(0.12 * this.engineVolume, now + 0.12);
      this.gain.gain.linearRampToValueAtTime(0.001, now + 0.4);
    }
    this.playHornPulse(now + 0.22);
  }

  stop(): void {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
    void this.context?.close();
    this.context = null;
    this.masterGain = null;
  }

  private saveSettings(): void {
    try {
      const storage =
        typeof window !== 'undefined'
          ? window.localStorage
          : (globalThis as unknown as { localStorage?: Storage }).localStorage;
      if (!storage) return;
      const data: AudioSettingsState = {
        masterVolume: this.masterVolume,
        engineVolume: this.engineVolume,
        musicVolume: this.musicVolume,
        enabled: this.enabled,
      };
      storage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Storage unavailable in private browsing
    }
  }

  private loadSettings(): void {
    try {
      const storage =
        typeof window !== 'undefined'
          ? window.localStorage
          : (globalThis as unknown as { localStorage?: Storage }).localStorage;
      if (!storage) return;
      const saved = storage.getItem(AUDIO_STORAGE_KEY);
      if (!saved) return;
      const data = JSON.parse(saved) as Partial<AudioSettingsState>;
      if (typeof data.masterVolume === 'number' && Number.isFinite(data.masterVolume)) {
        this.masterVolume = Math.max(0, Math.min(2.0, data.masterVolume));
      }
      if (typeof data.engineVolume === 'number' && Number.isFinite(data.engineVolume)) {
        this.engineVolume = Math.max(0, Math.min(2.0, data.engineVolume));
      }
      if (typeof data.musicVolume === 'number' && Number.isFinite(data.musicVolume)) {
        this.musicVolume = Math.max(0, Math.min(2.0, data.musicVolume));
      }
      if (typeof data.enabled === 'boolean') {
        this.enabled = data.enabled;
      }
    } catch {
      // Storage unavailable or corrupt
    }
  }

  private scheduleMusicBeat(): void {
    if (!this.context || !this.musicGain || !this.playing || !this.enabled) return;
    const now = this.context.currentTime;
    const bassNotes = [55, 55, 65.41, 55, 73.42, 65.41, 49, 49];
    const leadNotes = [220, 246.94, 293.66, 329.63, 293.66, 246.94, 196, 220];
    this.playNote(bassNotes[this.beat % bassNotes.length], now, 0.22, 'sawtooth', 0.18, 420);
    if (this.beat % 2 === 0) {
      this.playNote(
        leadNotes[(this.beat / 2) % leadNotes.length],
        now + 0.02,
        0.18,
        'triangle',
        0.11,
        1400,
      );
    }
    if (this.beat % 4 === 0) this.playKick(now);
    if (this.beat % 4 === 2) this.playNoise(now, 0.045);
    this.beat += 1;
  }

  private playHornPulse(start: number): void {
    if (!this.context) return;
    const dest = this.masterGain ?? this.context.destination;
    const envelope = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    const lowTone = this.context.createOscillator();
    const highTone = this.context.createOscillator();
    lowTone.type = 'sawtooth';
    highTone.type = 'square';
    lowTone.frequency.setValueAtTime(370, start);
    highTone.frequency.setValueAtTime(466, start);
    filter.type = 'lowpass';
    filter.frequency.value = 1350;
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(0.055, start + 0.018);
    envelope.gain.setValueAtTime(0.055, start + 0.13);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + 0.21);
    lowTone.connect(filter);
    highTone.connect(filter);
    filter.connect(envelope).connect(dest);
    lowTone.start(start);
    highTone.start(start);
    lowTone.stop(start + 0.23);
    highTone.stop(start + 0.23);
  }

  private playNote(
    frequency: number,
    start: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    cutoff: number,
  ): void {
    if (!this.context || !this.musicGain) return;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(volume, start + 0.018);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(filter).connect(envelope).connect(this.musicGain);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  private playKick(start: number): void {
    if (!this.context || !this.musicGain) return;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(120, start);
    oscillator.frequency.exponentialRampToValueAtTime(42, start + 0.12);
    envelope.gain.setValueAtTime(0.25, start);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
    oscillator.connect(envelope).connect(this.musicGain);
    oscillator.start(start);
    oscillator.stop(start + 0.18);
  }

  private playNoise(start: number, volume: number): void {
    if (!this.context || !this.musicGain) return;
    const frameCount = Math.floor(this.context.sampleRate * 0.055);
    const buffer = this.context.createBuffer(1, frameCount, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < frameCount; index += 1) data[index] = Math.random() * 2 - 1;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const envelope = this.context.createGain();
    source.buffer = buffer;
    filter.type = 'highpass';
    filter.frequency.value = 3200;
    envelope.gain.setValueAtTime(volume, start);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + 0.05);
    source.connect(filter).connect(envelope).connect(this.musicGain);
    source.start(start);
  }
}
