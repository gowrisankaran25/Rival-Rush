export interface AudioSettingsState {
  masterVolume: number;
  engineVolume: number;
  musicVolume: number;
  enabled: boolean;
  menuMusicEnabled?: boolean;
}

export type AudioMode = 'menu' | 'racing';

const AUDIO_STORAGE_KEY = 'rival-rush-sound-settings';

/**
 * Owns all procedural game audio, realistic menu soundtrack, engine synthesis, and sound effects.
 */
export class EngineSound {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private oscillator: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private beat = 0;
  private menuStep = 0;
  private mode: AudioMode = 'menu';
  private menuMusicActive = true;
  private playing = false;
  private enabled = true;
  private masterVolume = 1.0;
  private engineVolume = 1.0;
  private musicVolume = 1.0;
  private carModelId: string = 'ford-f150-raptor';
  private rainGain: GainNode | null = null;
  private stormGain: GainNode | null = null;
  private noiseSource: AudioBufferSourceNode | null = null;

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
      this.musicGain.gain.setTargetAtTime(0.14 * this.musicVolume, this.context.currentTime, 0.05);
    }
  }

  getEnabled(): boolean {
    return this.enabled;
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

  isContextRunning(): boolean {
    return this.context !== null && this.context.state === 'running';
  }

  isMenuMusicActive(): boolean {
    return this.menuMusicActive && this.enabled;
  }

  getMode(): AudioMode {
    return this.mode;
  }

  start(): void {
    if (this.context) {
      if (this.context.state === 'suspended') {
        void this.context.resume();
      }
      return;
    }
    if (typeof AudioContext === 'undefined') return;

    this.context = new AudioContext();
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = this.enabled ? this.masterVolume : 0;
    this.masterGain.connect(this.context.destination);

    this.oscillator = this.context.createOscillator();
    this.gain = this.context.createGain();
    this.musicGain = this.context.createGain();
    this.oscillator.type = 'sawtooth';
    this.oscillator.frequency.value = 54;
    this.gain.gain.value = 0.001;
    this.musicGain.gain.value = 0.14 * this.musicVolume;

    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 240;
    this.oscillator.connect(filter).connect(this.gain).connect(this.masterGain);
    this.musicGain.connect(this.masterGain);
    this.oscillator.start();

    // Procedural weather audio graph (rain patter and storm rumble)
    try {
      this.rainGain = this.context.createGain();
      this.rainGain.gain.value = 0.0001;
      this.stormGain = this.context.createGain();
      this.stormGain.gain.value = 0.0001;

      const bufferSize = Math.floor(this.context.sampleRate * 2);
      const noiseBuffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      this.noiseSource = this.context.createBufferSource();
      this.noiseSource.buffer = noiseBuffer;
      this.noiseSource.loop = true;

      // Bandpass filter for rushing rain hiss / windshield patter
      const rainFilter = this.context.createBiquadFilter();
      rainFilter.type = 'bandpass';
      rainFilter.frequency.value = 1750;
      rainFilter.Q.value = 1.2;

      // Lowpass filter for deep storm rumble / winter wind
      const stormFilter = this.context.createBiquadFilter();
      stormFilter.type = 'lowpass';
      stormFilter.frequency.value = 180;

      this.noiseSource.connect(rainFilter).connect(this.rainGain).connect(this.masterGain);
      this.noiseSource.connect(stormFilter).connect(this.stormGain).connect(this.masterGain);
      this.noiseSource.start();
    } catch {
      // Audio buffer creation safe fallback
    }

    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = window.setInterval(() => this.scheduleBeat(), 240);
  }

  startMenuMusic(): void {
    this.mode = 'menu';
    this.menuMusicActive = true;
    this.start();
    if (this.context && this.context.state === 'suspended') {
      void this.context.resume();
    }
    if (this.gain && this.context) {
      this.gain.gain.setTargetAtTime(0.001, this.context.currentTime, 0.05);
    }
  }

  startRacingMusic(): void {
    this.mode = 'racing';
    this.playing = true;
    this.start();
    if (this.context && this.context.state === 'suspended') {
      void this.context.resume();
    }
  }

  toggleMenuMusic(): boolean {
    this.menuMusicActive = !this.menuMusicActive;
    this.saveSettings();
    if (this.menuMusicActive) {
      this.startMenuMusic();
    }
    return this.menuMusicActive;
  }

  update(
    speedKph: number,
    _weatherType: 'clear' | 'fog' | 'rain' | 'storm' | 'snow' | string = 'clear',
    rainIntensity = 0,
    snowIntensity = 0,
  ): void {
    if (!this.context) return;

    // Update weather audio
    if (this.rainGain) {
      const rainVol =
        this.enabled && this.playing && rainIntensity > 0.01
          ? rainIntensity * (0.045 + Math.min(speedKph, 140) * 0.0003) * this.masterVolume
          : 0.0001;
      this.rainGain.gain.setTargetAtTime(rainVol, this.context.currentTime, 0.12);
    }

    if (this.stormGain) {
      const stormVol =
        this.enabled && this.playing
          ? (rainIntensity * 0.035 + snowIntensity * 0.02) * this.masterVolume
          : 0.0001;
      this.stormGain.gain.setTargetAtTime(stormVol, this.context.currentTime, 0.12);
    }

    if (!this.oscillator || !this.gain) return;
    if (this.mode !== 'racing' || !this.playing) return;

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
    } else if (this.carModelId === 'oldsmobile-cutlass') {
      baseFreq = 38;
      freqMultiplier = 1.35;
      volumeMax = 0.028;
      type = 'sawtooth';
    } else if (this.carModelId === 'ford-gt40') {
      baseFreq = 65;
      freqMultiplier = 1.6;
      volumeMax = 0.027;
      type = 'sawtooth';
    } else if (this.carModelId === 'skyline-r34') {
      baseFreq = 70;
      freqMultiplier = 1.7;
      volumeMax = 0.024;
      type = 'sawtooth';
    } else if (this.carModelId === 'ford-gt-2006') {
      baseFreq = 52;
      freqMultiplier = 1.5;
      volumeMax = 0.026;
      type = 'sawtooth';
    }

    if (this.oscillator.type !== type) {
      this.oscillator.type = type;
    }

    this.oscillator.frequency.setTargetAtTime(
      baseFreq + speedKph * freqMultiplier,
      this.context.currentTime,
      0.08,
    );
    const volume =
      this.enabled && speedKph > 1 ? (volumeMax + speedKph / 9000) * 5.0 * this.engineVolume : 0;
    this.gain.gain.setTargetAtTime(volume, this.context.currentTime, 0.12);
  }

  setPlaying(playing: boolean): void {
    this.playing = playing;
    if (playing) {
      this.mode = 'racing';
      void this.context?.resume();
    } else {
      if (this.gain && this.context) {
        this.gain.gain.setTargetAtTime(0.001, this.context.currentTime, 0.08);
      }
      if (this.rainGain && this.context) {
        this.rainGain.gain.setTargetAtTime(0.0001, this.context.currentTime, 0.08);
      }
      if (this.stormGain && this.context) {
        this.stormGain.gain.setTargetAtTime(0.0001, this.context.currentTime, 0.08);
      }
    }
  }

  /**
   * Plays a signature engine rev burst and exhaust notes tailored to each car model.
   * Gives an authentic supercar showroom experience directly on the main page.
   */
  previewCarEngine(modelId: string): void {
    if (!this.context) this.start();
    if (!this.context) return;
    if (this.context.state === 'suspended') void this.context.resume();
    const now = this.context.currentTime;
    const engVol = this.enabled ? this.engineVolume * 0.22 : 0;
    if (engVol <= 0.001) return;

    switch (modelId) {
      case 'oldsmobile-cutlass': {
        // Deep throaty American V8 muscle car throttle blip & exhaust burble
        this.synthEngineRev(now, 40, 135, 52, 0.95, 'sawtooth', 440, engVol * 1.3);
        this.synthExhaustPop(now + 0.42, engVol * 0.45);
        this.synthExhaustPop(now + 0.58, engVol * 0.35);
        break;
      }
      case 'ford-gt40': {
        // Raw, raspy 1966 endurance racing V8 roar
        this.synthEngineRev(now, 72, 260, 95, 0.88, 'sawtooth', 880, engVol * 1.35);
        this.synthExhaustPop(now + 0.45, engVol * 0.6);
        this.synthExhaustPop(now + 0.55, engVol * 0.5);
        break;
      }
      case 'skyline-r34': {
        // RB26DETT twin-turbo inline-6 scream & iconic turbo blow-off whoosh
        this.synthEngineRev(now, 85, 310, 110, 0.9, 'sawtooth', 980, engVol * 1.2);
        this.synthTurboWhoosh(now + 0.38, engVol * 0.55);
        break;
      }
      case 'ford-gt-2006': {
        // Supercharged 5.4L V8 roar with high-pitch supercharger whine
        this.synthEngineRev(now, 58, 220, 78, 0.92, 'sawtooth', 760, engVol * 1.25);
        this.synthSuperchargerWhine(now, 780, 1600, 0.8, engVol * 0.45);
        break;
      }
      case 'ford-f150-raptor': {
        // Heavy twin-turbo 3.5L V6 EcoBoost truck growl
        this.synthEngineRev(now, 44, 145, 55, 0.92, 'square', 460, engVol * 1.2);
        this.synthTurboWhoosh(now + 0.42, engVol * 0.35);
        break;
      }
      case 'ford-everest-sport': {
        // Guttural turbodiesel SUV power surge
        this.synthEngineRev(now, 48, 140, 58, 0.88, 'sawtooth', 400, engVol * 1.1);
        break;
      }
      case 'ioniq-5':
      case 'luxury-concept': {
        // Futuristic dual-motor EV frequency glide
        this.synthElectricGlide(now, 160, 620, 0.85, engVol * 0.95);
        break;
      }
      default: {
        this.synthEngineRev(now, 50, 165, 65, 0.85, 'sawtooth', 520, engVol);
        break;
      }
    }
  }

  hornThreeTimes(): void {
    if (!this.context || !this.playing || !this.enabled) return;
    const start = this.context.currentTime + 0.025;
    for (let index = 0; index < 3; index += 1) {
      this.playHornPulse(start + index * 0.34);
    }
  }

  /**
   * Plays a distinct mechanical gear shift click, throttle blip, and exhaust pop
   * when shifting gears to increase speed or downshifting.
   */
  playGearShift(gear: number, direction: 1 | -1): void {
    if (!this.context || !this.playing || !this.enabled) return;
    if (this.context.state === 'suspended') void this.context.resume();
    const now = this.context.currentTime;
    const engVol = this.engineVolume * 0.25;

    // Shift click impulse
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(direction > 0 ? 320 + gear * 45 : 240, now);
    osc.frequency.exponentialRampToValueAtTime(direction > 0 ? 580 + gear * 60 : 160, now + 0.06);
    gain.gain.setValueAtTime(0.18 * engVol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(gain);
    gain.connect(this.masterGain ?? this.context.destination);
    osc.start(now);
    osc.stop(now + 0.09);

    // Exhaust pop on upshift
    if (direction > 0) {
      this.synthExhaustPop(now + 0.04, engVol * 0.7);
    }
  }

  /**
   * Synthesizes a deep, resonant atmospheric thunderclap with rolling rumble
   * for realistic storm lightning strikes.
   */
  playThunder(): void {
    if (!this.context || !this.playing || !this.enabled) return;
    if (this.context.state === 'suspended') void this.context.resume();
    const now = this.context.currentTime;

    const bufferSize = Math.floor(this.context.sampleRate * 1.8);
    const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + 0.025 * white) / 1.025;
      data[i] = lastOut * 3.2;
    }

    const noise = this.context.createBufferSource();
    noise.buffer = buffer;

    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(140, now);
    filter.frequency.exponentialRampToValueAtTime(55, now + 1.6);

    const gain = this.context.createGain();
    const vol = this.masterVolume * 0.35;
    gain.gain.setValueAtTime(vol * 0.25, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.07);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain ?? this.context.destination);
    noise.start(now);
    noise.stop(now + 1.85);
  }

  testSound(): void {
    if (!this.context) this.start();
    if (!this.context) return;
    void this.context.resume();
    const now = this.context.currentTime;
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(this.masterVolume, now);
    }
    // Realistic preview: engine rev + chord
    this.synthEngineRev(now, 50, 180, 70, 0.5, 'sawtooth', 600, 0.12 * this.engineVolume);
    this.playNote(440, now + 0.1, 0.3, 'triangle', 0.14 * this.musicVolume, 1200);
    this.playHornPulse(now + 0.28);
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
        menuMusicEnabled: this.menuMusicActive,
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
      if (typeof data.menuMusicEnabled === 'boolean') {
        this.menuMusicActive = data.menuMusicEnabled;
      }
    } catch {
      // Storage unavailable or corrupt
    }
  }

  private scheduleBeat(): void {
    if (!this.context || !this.musicGain || !this.enabled) return;

    if (this.mode === 'menu') {
      if (!this.menuMusicActive) return;
      this.scheduleMenuBeat();
    } else if (this.mode === 'racing') {
      if (!this.playing) return;
      this.scheduleRacingBeat();
    }
  }

  /**
   * Realistic cinematic electronic racing menu theme.
   * 32-step loop with lush analog synth chords, driving sub-bass, crystal arpeggio, and punchy drums.
   */
  private scheduleMenuBeat(): void {
    if (!this.context || !this.musicGain) return;
    const now = this.context.currentTime;
    const step = this.menuStep;

    // 8-bar chord progression at 125 BPM (4 steps per bar):
    // Bars 0-1 (steps 0-7): Am
    // Bars 2-3 (steps 8-15): F
    // Bars 4-5 (steps 16-23): C
    // Bars 6-7 (steps 24-31): G / Em
    let chordFreqs = [110, 130.81, 164.81]; // Am (A2, C3, E3)
    let bassNote = 55; // A1
    let arpScale = [220, 261.63, 329.63, 440, 329.63, 261.63, 293.66, 246.94];

    if (step >= 8 && step < 16) {
      chordFreqs = [87.31, 110, 130.81]; // F (F2, A2, C3)
      bassNote = 43.65; // F1
      arpScale = [174.61, 220, 261.63, 349.23, 261.63, 220, 261.63, 174.61];
    } else if (step >= 16 && step < 24) {
      chordFreqs = [130.81, 164.81, 196]; // C (C3, E3, G3)
      bassNote = 65.41; // C2
      arpScale = [261.63, 329.63, 392, 523.25, 392, 329.63, 392, 261.63];
    } else if (step >= 24) {
      chordFreqs = [98, 123.47, 146.83]; // G (G2, B2, D3)
      bassNote = 49; // G1
      arpScale = [196, 246.94, 293.66, 392, 293.66, 246.94, 220, 196];
    }

    // 1. Atmospheric Ambient Synth Pad (plays at start of each 8-step chord section)
    if (step % 8 === 0) {
      this.playChord(chordFreqs, now, 1.85, 0.048, 720);
    }

    // 2. Sub-Bassline (syncopated groove)
    const isBassStep = [0, 2, 3, 6, 8, 10, 11, 14, 16, 18, 19, 22, 24, 26, 27, 30].includes(step);
    if (isBassStep) {
      const pitchMultiplier = step % 4 === 3 ? 1.5 : 1.0;
      this.playNote(bassNote * pitchMultiplier, now, 0.22, 'sawtooth', 0.16, 320);
    }

    // 3. Melodic Arpeggiator (plucked crystal notes on even steps)
    if (step % 2 === 0) {
      const note = arpScale[(step / 2) % arpScale.length];
      this.playNote(note, now + 0.015, 0.16, 'triangle', 0.08, 1250);
    }

    // 4. Subtle Drum Section
    // Four-on-the-floor sub-kick
    if (step % 4 === 0) {
      this.playKick(now);
    }
    // Snare / clap on beats 2 and 4
    if (step % 4 === 2) {
      this.playNoise(now, 0.038);
    }
    // Hi-hat on offbeats
    if (step % 2 === 1) {
      this.playHiHat(now, 0.022);
    }

    this.menuStep = (this.menuStep + 1) % 32;
  }

  /**
   * High-octane in-game racing track beat.
   */
  private scheduleRacingBeat(): void {
    if (!this.context || !this.musicGain) return;
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

  private playChord(
    frequencies: number[],
    start: number,
    duration: number,
    volume: number,
    cutoff: number,
  ): void {
    if (!this.context || !this.musicGain) return;
    frequencies.forEach((freq, idx) => {
      const osc = this.context!.createOscillator();
      const env = this.context!.createGain();
      const filter = this.context!.createBiquadFilter();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq + (idx === 1 ? 0.8 : -0.8), start); // Subtle stereo-like detune
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(cutoff, start);
      filter.frequency.linearRampToValueAtTime(cutoff + 180, start + duration * 0.4);
      filter.frequency.linearRampToValueAtTime(cutoff - 60, start + duration);
      env.gain.setValueAtTime(0.0001, start);
      env.gain.exponentialRampToValueAtTime(volume, start + 0.12);
      env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(filter).connect(env).connect(this.musicGain!);
      osc.start(start);
      osc.stop(start + duration + 0.05);
    });
  }

  private playHiHat(start: number, volume: number): void {
    if (!this.context || !this.musicGain) return;
    const frameCount = Math.floor(this.context.sampleRate * 0.035);
    const buffer = this.context.createBuffer(1, frameCount, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i += 1) data[i] = Math.random() * 2 - 1;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const envelope = this.context.createGain();
    source.buffer = buffer;
    filter.type = 'highpass';
    filter.frequency.value = 6500;
    envelope.gain.setValueAtTime(volume, start);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + 0.03);
    source.connect(filter).connect(envelope).connect(this.musicGain);
    source.start(start);
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
    oscillator.frequency.setValueAtTime(130, start);
    oscillator.frequency.exponentialRampToValueAtTime(38, start + 0.14);
    envelope.gain.setValueAtTime(0.24, start);
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
    filter.frequency.value = 2600;
    envelope.gain.setValueAtTime(volume, start);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + 0.05);
    source.connect(filter).connect(envelope).connect(this.musicGain);
    source.start(start);
  }

  private synthEngineRev(
    start: number,
    startFreq: number,
    peakFreq: number,
    endFreq: number,
    duration: number,
    type: OscillatorType,
    cutoff: number,
    volume: number,
  ): void {
    if (!this.context || !this.masterGain) return;
    const osc = this.context.createOscillator();
    const env = this.context.createGain();
    const filter = this.context.createBiquadFilter();

    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, start);
    osc.frequency.exponentialRampToValueAtTime(peakFreq, start + duration * 0.35);
    osc.frequency.exponentialRampToValueAtTime(endFreq, start + duration);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, start);
    filter.frequency.linearRampToValueAtTime(cutoff * 1.5, start + duration * 0.35);
    filter.frequency.linearRampToValueAtTime(cutoff, start + duration);

    env.gain.setValueAtTime(0.001, start);
    env.gain.linearRampToValueAtTime(volume, start + duration * 0.3);
    env.gain.linearRampToValueAtTime(0.001, start + duration);

    osc.connect(filter).connect(env).connect(this.masterGain);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  private synthExhaustPop(start: number, volume: number): void {
    if (!this.context || !this.masterGain) return;
    const frameCount = Math.floor(this.context.sampleRate * 0.04);
    const buffer = this.context.createBuffer(1, frameCount, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i += 1) data[i] = Math.random() * 2 - 1;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const env = this.context.createGain();
    source.buffer = buffer;
    filter.type = 'highpass';
    filter.frequency.value = 750;
    env.gain.setValueAtTime(volume, start);
    env.gain.exponentialRampToValueAtTime(0.0001, start + 0.038);
    source.connect(filter).connect(env).connect(this.masterGain);
    source.start(start);
  }

  private synthTurboWhoosh(start: number, volume: number): void {
    if (!this.context || !this.masterGain) return;
    const frameCount = Math.floor(this.context.sampleRate * 0.28);
    const buffer = this.context.createBuffer(1, frameCount, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i += 1) data[i] = Math.random() * 2 - 1;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const env = this.context.createGain();
    source.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, start);
    filter.frequency.exponentialRampToValueAtTime(2800, start + 0.14);
    filter.frequency.exponentialRampToValueAtTime(900, start + 0.28);
    env.gain.setValueAtTime(0.001, start);
    env.gain.linearRampToValueAtTime(volume, start + 0.08);
    env.gain.linearRampToValueAtTime(0.001, start + 0.28);
    source.connect(filter).connect(env).connect(this.masterGain);
    source.start(start);
  }

  private synthSuperchargerWhine(
    start: number,
    startFreq: number,
    peakFreq: number,
    duration: number,
    volume: number,
  ): void {
    if (!this.context || !this.masterGain) return;
    const osc = this.context.createOscillator();
    const env = this.context.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, start);
    osc.frequency.exponentialRampToValueAtTime(peakFreq, start + duration * 0.4);
    osc.frequency.exponentialRampToValueAtTime(startFreq * 0.8, start + duration);
    env.gain.setValueAtTime(0.001, start);
    env.gain.linearRampToValueAtTime(volume, start + duration * 0.35);
    env.gain.linearRampToValueAtTime(0.001, start + duration);
    osc.connect(env).connect(this.masterGain);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  private synthElectricGlide(
    start: number,
    startFreq: number,
    peakFreq: number,
    duration: number,
    volume: number,
  ): void {
    if (!this.context || !this.masterGain) return;
    const osc1 = this.context.createOscillator();
    const osc2 = this.context.createOscillator();
    const env = this.context.createGain();
    osc1.type = 'sine';
    osc2.type = 'sine';
    osc1.frequency.setValueAtTime(startFreq, start);
    osc1.frequency.exponentialRampToValueAtTime(peakFreq, start + duration * 0.45);
    osc1.frequency.exponentialRampToValueAtTime(startFreq, start + duration);
    osc2.frequency.setValueAtTime(startFreq + 5, start);
    osc2.frequency.exponentialRampToValueAtTime(peakFreq + 8, start + duration * 0.45);
    osc2.frequency.exponentialRampToValueAtTime(startFreq + 5, start + duration);
    env.gain.setValueAtTime(0.001, start);
    env.gain.linearRampToValueAtTime(volume, start + duration * 0.35);
    env.gain.linearRampToValueAtTime(0.001, start + duration);
    osc1.connect(env);
    osc2.connect(env);
    env.connect(this.masterGain);
    osc1.start(start);
    osc2.start(start);
    osc1.stop(start + duration + 0.05);
    osc2.stop(start + duration + 0.05);
  }
}
