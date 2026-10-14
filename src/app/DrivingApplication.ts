import { EngineSound } from '../audio/EngineSound';
import type { HandController } from '../controls/HandController';
import { KeyboardController } from '../controls/KeyboardController';
import type { DrivingGame } from '../game/DrivingGame';
import type { ControlInput, ControlMode, GameSnapshot, RaceResult } from '../game/types';
import { CAR_MODEL_OPTIONS, DEFAULT_CAR_MODEL_ID, VEHICLE_SPECS } from '../game/vehicleCatalog';
import type { CarModelId } from '../game/vehicleCatalog';
import { RACE_MODES, type RaceModeId } from '../game/progression/raceModes';
import { progressionStore } from '../services/progressionStore';
import { cacheAssets } from '../services/assetCache';
import { AssetGate } from '../ui/AssetGate';
import { byId } from '../ui/dom';
import { GameHud } from '../ui/GameHud';
import { GraphicsSettings } from '../ui/GraphicsSettings';
import { PerformanceHud } from '../ui/PerformanceHud';
import { RadarHud } from '../ui/RadarHud';
import { SoundSettings } from '../ui/SoundSettings';

type AppViewId = 'home' | 'garage' | 'modes' | 'calibrate' | 'achievements' | 'results' | 'game';
type TrackingState = 'ok' | 'warn' | 'off';

/**
 * Coordinates UI intent with input, audio, garage customization,
 * race progression, results presentation, and the 3D game engine.
 */
export class DrivingApplication {
  private readonly events = new AbortController();
  private readonly keyboard = new KeyboardController();
  private readonly audio = new EngineSound();
  private readonly hud = new GameHud();
  private readonly radarHud = new RadarHud();
  private readonly graphicsSettings = new GraphicsSettings();
  private readonly soundSettings = new SoundSettings({
    masterVolume: this.audio.getMasterVolume(),
    engineVolume: this.audio.getEngineVolume(),
    musicVolume: this.audio.getMusicVolume(),
    enabled: this.audio.getEnabled(),
  });
  private readonly performanceHud = new PerformanceHud();
  private readonly assetGate = new AssetGate();
  private readonly viewport = byId<HTMLDivElement>('viewport');
  private readonly gameShell = document.querySelector<HTMLElement>('.game-shell');
  private readonly overlay = byId<HTMLElement>('overlay');
  private readonly video = byId<HTMLVideoElement>('camera-video');
  private readonly cameraCanvas = byId<HTMLCanvasElement>('camera-canvas');
  private readonly cameraShell = document.querySelector<HTMLElement>('.camera-shell');
  private readonly trackingPill = byId<HTMLElement>('tracking-pill');
  private readonly trackingLabel = byId<HTMLElement>('tracking-label');
  private readonly cameraHint = byId<HTMLElement>('camera-hint');
  private readonly pauseButton = byId<HTMLButtonElement>('pause-button');
  private readonly mainMenuButton = byId<HTMLButtonElement>('main-menu-button');
  private readonly fullscreenButton = byId<HTMLButtonElement>('fullscreen-button');
  private readonly cameraButton = byId<HTMLButtonElement>('camera-button');
  private readonly weatherButton = byId<HTMLButtonElement>('weather-button');
  private readonly headlightButton = byId<HTMLButtonElement>('headlight-button');
  private readonly radarButton = byId<HTMLButtonElement>('radar-button');

  private currentView: AppViewId = 'home';
  private game: DrivingGame | null = null;
  private handController: HandController | null = null;
  private mode: ControlMode = 'hands';
  private lastSnapshot: GameSnapshot | null = null;
  private soundEnabled = this.audio.getEnabled();

  // Selected Player Car & Customization
  private driverCar: CarModelId = DEFAULT_CAR_MODEL_ID;
  private driverColor = 0xf5f7f4;
  private selectedCameraMode = 0;
  private trafficCount = 4;
  private modelCount = 1;
  private garageSelectedCarIndex = 0;
  private currentModeId: RaceModeId = 'endless';
  private transmissionMode: 'auto' | 'manual' = 'manual';
  private gestureShiftingEnabled = true;

  private assetsReady: Promise<boolean> = Promise.resolve(false);
  private sceneReady: Promise<boolean> = Promise.resolve(false);
  private resumeAfterGraphics = false;
  private resumeAfterSound = false;

  constructor() {
    if (!this.gameShell || !this.cameraShell) throw new Error('The game shell is incomplete.');

    // Load persisted state from progression store
    const saved = progressionStore.getData();
    this.driverCar = saved.selectedCar;
    this.driverColor = parseInt(saved.selectedPaintHex.replace('#', ''), 16) || 0xf5f7f4;
    this.mode = saved.selectedControlMode;
    this.currentModeId = saved.selectedMode;
    this.selectedCameraMode = saved.selectedCameraMode;
    this.transmissionMode = saved.selectedTransmissionMode ?? 'manual';
    this.gestureShiftingEnabled = saved.gestureShiftingEnabled ?? true;

    const carIndex = CAR_MODEL_OPTIONS.findIndex((c) => c.id === this.driverCar);
    this.garageSelectedCarIndex = carIndex >= 0 ? carIndex : 0;
  }

  start(): void {
    this.fullscreenButton.hidden = !document.fullscreenEnabled;
    this.bindUiEvents();
    this.updateCareerBadges();
    this.updateControlModeUi();
    this.updateGarageUi();
    this.updateAchievementsUi();
    this.showView('home');
    this.assetsReady = this.installAssets();
  }

  dispose(): void {
    this.events.abort();
    this.handController?.stop();
    this.keyboard.dispose();
    this.audio.stop();
    this.radarHud.dispose();
    this.game?.dispose();
  }

  // ══════════════════════════════════════════════════
  //   VIEW ROUTING & NAVIGATION
  // ══════════════════════════════════════════════════

  showView(viewId: AppViewId): void {
    this.currentView = viewId;

    const views: Record<AppViewId, HTMLElement | null> = {
      home: document.getElementById('view-home'),
      garage: document.getElementById('view-garage'),
      modes: document.getElementById('view-modes'),
      calibrate: document.getElementById('view-calibrate'),
      achievements: document.getElementById('view-achievements'),
      results: document.getElementById('view-results'),
      game: null,
    };

    // Toggle view elements
    Object.entries(views).forEach(([id, el]) => {
      if (el) {
        el.classList.toggle('is-hidden', id !== viewId);
        el.classList.toggle('active-view', id === viewId);
      }
    });

    // Update topbar nav tabs
    const navTabs = ['home', 'play', 'garage', 'achievements', 'settings'];
    navTabs.forEach((tab) => {
      const btn = document.getElementById(`nav-${tab}`);
      if (btn) {
        const isActive =
          (tab === 'home' && viewId === 'home') ||
          (tab === 'play' && (viewId === 'modes' || viewId === 'calibrate')) ||
          (tab === 'garage' && viewId === 'garage') ||
          (tab === 'achievements' && viewId === 'achievements');
        btn.classList.toggle('is-active', isActive);
      }
    });

    const isGaming = viewId === 'game';
    const topbar = document.querySelector('.topbar');
    if (topbar) {
      topbar.classList.toggle('is-gaming', isGaming);
    }
    this.mainMenuButton.classList.toggle('is-hidden', !isGaming);
    this.pauseButton.classList.toggle('is-hidden', !isGaming);
    this.pauseButton.textContent = 'PAUSE';

    if (!isGaming) {
      this.hud.hide();
      this.radarHud.hide();
      if (this.isGameActivePhase()) {
        this.game?.pause();
      }
      this.audio.setPlaying(false);
      if (viewId !== 'calibrate') {
        this.cameraShell?.classList.add('is-hidden');
      }
    } else {
      if (this.mode === 'hands') {
        if (this.cameraShell && this.cameraShell.parentElement !== this.gameShell) {
          this.gameShell?.appendChild(this.cameraShell);
        }
        this.cameraShell?.classList.remove('is-hidden', 'is-offline', 'is-calibrating');
        byId('show-camera')?.classList.add('is-hidden');
        if (this.video && this.video.paused) {
          void this.video.play().catch(() => {});
        }
      } else {
        this.cameraShell?.classList.add('is-hidden');
        byId('show-camera')?.classList.add('is-hidden');
      }
    }

    if (viewId === 'calibrate') {
      const slot = document.getElementById('calib-camera-slot');
      if (slot && this.cameraShell && this.cameraShell.parentElement !== slot) {
        slot.appendChild(this.cameraShell);
      }
      this.cameraShell?.classList.remove('is-offline', 'is-hidden');
      this.cameraShell?.classList.add('is-calibrating');
      if (this.video && this.video.paused) {
        void this.video.play().catch(() => {});
      }
    }

    if (viewId === 'garage') {
      this.updateGarageUi();
      const currentCarId = CAR_MODEL_OPTIONS[this.garageSelectedCarIndex]?.id ?? this.driverCar;
      if (this.game) {
        this.game.setShowroomMode(true);
        void this.game.setCars(currentCarId, this.trafficCount, this.modelCount, this.driverColor);
      }
    } else {
      this.game?.setShowroomMode(false);
      if (viewId === 'achievements') {
        this.updateAchievementsUi();
      } else if (viewId === 'home') {
        this.updateHomeHero();
        if (this.game && this.game.getCameraMode() === 0) {
          this.game.setCameraMode(1);
          this.updateCameraButton(this.game.getCameraModeName());
        }
      }
    }

    this.updateCareerBadges();
  }

  private updateHomeHero(): void {
    const heroCar = document.getElementById('hero-car-name');
    const heroMode = document.getElementById('hero-mode-name');
    const heroCtrl = document.getElementById('hero-control-mode');
    const heroCreds = document.getElementById('hero-credits-val');

    if (heroCar) heroCar.textContent = VEHICLE_SPECS[this.driverCar]?.label ?? 'SUPERCAR';
    if (heroMode) heroMode.textContent = RACE_MODES[this.currentModeId]?.name ?? 'ENDLESS HIGHWAY';
    if (heroCtrl)
      heroCtrl.textContent =
        this.mode === 'hands' ? 'WEBCAM HAND TRACKING' : 'KEYBOARD (WASD / ARROWS)';
    if (heroCreds) heroCreds.textContent = `${progressionStore.getCredits().toLocaleString()} CR`;
  }

  private updateCareerBadges(): void {
    const creds = progressionStore.getCredits();
    const topCreds = document.getElementById('topbar-credits-val');
    const heroCreds = document.getElementById('hero-credits-val');
    if (topCreds) topCreds.textContent = creds.toLocaleString();
    if (heroCreds) heroCreds.textContent = `${creds.toLocaleString()} CR`;
  }

  // ══════════════════════════════════════════════════
  //   VEHICLE GARAGE & CUSTOMIZATION
  // ══════════════════════════════════════════════════

  private updateGarageUi(): void {
    const options = CAR_MODEL_OPTIONS;
    const currentOption = options[this.garageSelectedCarIndex] ?? options[0];
    const carId = currentOption.id;
    const spec = VEHICLE_SPECS[carId];
    if (!spec) return;

    const idxEl = document.getElementById('garage-car-index');
    const totalEl = document.getElementById('garage-car-total');
    const nameEl = document.getElementById('garage-car-name');
    const catEl = document.getElementById('garage-car-category');
    const descEl = document.getElementById('garage-car-desc');

    if (idxEl) idxEl.textContent = String(this.garageSelectedCarIndex + 1);
    if (totalEl) totalEl.textContent = String(options.length);
    if (nameEl) nameEl.textContent = spec.label;
    if (catEl) catEl.textContent = spec.category;
    if (descEl) descEl.textContent = spec.description;

    // Stat bars
    const speedVal = document.getElementById('garage-stat-speed-val');
    const speedBar = document.getElementById('garage-stat-speed');
    const accelVal = document.getElementById('garage-stat-accel-val');
    const accelBar = document.getElementById('garage-stat-accel');
    const handlingVal = document.getElementById('garage-stat-handling-val');
    const handlingBar = document.getElementById('garage-stat-handling');
    const nitroVal = document.getElementById('garage-stat-nitro-val');
    const nitroBar = document.getElementById('garage-stat-nitro');

    if (speedVal) speedVal.textContent = `${spec.topSpeedKph} KM/H`;
    if (speedBar) speedBar.style.width = `${Math.min(100, (spec.topSpeedKph / 265) * 100)}%`;

    if (accelVal) accelVal.textContent = `${spec.accelRating} / 10`;
    if (accelBar) accelBar.style.width = `${spec.accelRating * 10}%`;

    if (handlingVal) handlingVal.textContent = `${spec.handlingRating} / 10`;
    if (handlingBar) handlingBar.style.width = `${spec.handlingRating * 10}%`;

    if (nitroVal) nitroVal.textContent = `${spec.nitroRating} / 10`;
    if (nitroBar) nitroBar.style.width = `${spec.nitroRating * 10}%`;

    // Buy / Select Button
    const selectBtn = document.getElementById('garage-select-btn') as HTMLButtonElement | null;
    const isUnlocked = progressionStore.isCarUnlocked(carId);
    const isSelected = this.driverCar === carId;

    if (selectBtn) {
      if (isSelected) {
        selectBtn.innerHTML = '<span>SELECTED</span>';
        selectBtn.disabled = true;
        selectBtn.className = 'primary-button is-selected';
      } else if (isUnlocked) {
        selectBtn.innerHTML = '<span>SELECT CAR</span>';
        selectBtn.disabled = false;
        selectBtn.className = 'primary-button';
      } else {
        const canAfford = progressionStore.getCredits() >= spec.priceCredits;
        selectBtn.innerHTML = `<span>UNLOCK FOR ${spec.priceCredits.toLocaleString()} CR</span>`;
        selectBtn.disabled = !canAfford;
        selectBtn.className = canAfford ? 'primary-button is-unlock' : 'secondary-button is-locked';
      }
    }

    // Update paint swatches
    const currentHex = progressionStore.getSelectedPaintHex().toLowerCase();
    document.querySelectorAll<HTMLElement>('.paint-swatch').forEach((swatch) => {
      const c = swatch.dataset.color?.toLowerCase();
      swatch.classList.toggle('is-active', c === currentHex);
    });
    const picker = document.getElementById('garage-color-picker') as HTMLInputElement | null;
    if (picker) picker.value = progressionStore.getSelectedPaintHex();
  }

  private cycleGarageCar(delta: number): void {
    const total = CAR_MODEL_OPTIONS.length;
    this.garageSelectedCarIndex = (this.garageSelectedCarIndex + delta + total) % total;
    const carId = CAR_MODEL_OPTIONS[this.garageSelectedCarIndex].id;
    this.updateGarageUi();
    if (this.game) {
      this.game.setShowroomMode(true);
      void this.game.setCars(carId, this.trafficCount, this.modelCount, this.driverColor);
    }
  }

  private onGarageSelectCar(): void {
    const currentOption = CAR_MODEL_OPTIONS[this.garageSelectedCarIndex];
    if (!currentOption) return;
    const carId = currentOption.id;
    const isUnlocked = progressionStore.isCarUnlocked(carId);

    if (isUnlocked) {
      this.driverCar = carId;
      progressionStore.setSelectedCar(carId);
      this.audio.playMedalChime();
      this.updateGarageUi();
      this.updateHomeHero();
      if (this.game) {
        void this.prepareSelectedCars();
      }
    } else {
      const unlocked = progressionStore.unlockCar(carId);
      if (unlocked) {
        this.driverCar = carId;
        progressionStore.setSelectedCar(carId);
        this.audio.playMedalChime();
        this.updateGarageUi();
        this.updateCareerBadges();
        this.updateHomeHero();
        if (this.game) {
          void this.prepareSelectedCars();
        }
      }
    }
  }

  private setPaintColor(hex: string): void {
    this.driverColor = parseInt(hex.replace('#', ''), 16);
    progressionStore.setSelectedPaintHex(hex);
    this.updateGarageUi();
    const currentCarId = CAR_MODEL_OPTIONS[this.garageSelectedCarIndex]?.id ?? this.driverCar;
    if (this.game) {
      void this.game.setCars(currentCarId, this.trafficCount, this.modelCount, this.driverColor);
    }
  }

  // ══════════════════════════════════════════════════
  //   ACHIEVEMENTS UI
  // ══════════════════════════════════════════════════

  private updateAchievementsUi(): void {
    const data = progressionStore.getData();
    const stats = data.stats;

    const rEl = document.getElementById('stat-total-races');
    const wEl = document.getElementById('stat-total-wins');
    const dEl = document.getElementById('stat-total-distance');
    const oEl = document.getElementById('stat-total-overtakes');
    const sEl = document.getElementById('stat-max-speed');

    if (rEl) rEl.textContent = stats.totalRaces.toLocaleString();
    if (wEl) wEl.textContent = stats.totalWins.toLocaleString();
    if (dEl) dEl.textContent = `${(stats.totalDistanceMeters / 1000).toFixed(1)} KM`;
    if (oEl) oEl.textContent = stats.totalOvertakes.toLocaleString();
    if (sEl) sEl.textContent = `${stats.maxSpeedKph} KM/H`;

    document.querySelectorAll<HTMLElement>('.achievement-card').forEach((card) => {
      const achId = card.dataset.achId;
      if (!achId) return;
      const isUnlocked = progressionStore.isAchievementUnlocked(achId);
      card.classList.toggle('is-unlocked', isUnlocked);
      const statusSpan = card.querySelector('.achievement-status');
      if (statusSpan) {
        statusSpan.textContent = isUnlocked ? 'UNLOCKED' : 'LOCKED';
        statusSpan.className = isUnlocked
          ? 'achievement-status is-unlocked'
          : 'achievement-status is-locked';
      }
    });
  }

  // ══════════════════════════════════════════════════
  //   UI EVENT BINDINGS
  // ══════════════════════════════════════════════════

  private bindUiEvents(): void {
    const options = { signal: this.events.signal };

    // Navigation bar tabs
    byId('nav-home').addEventListener('click', () => this.showView('home'), options);
    byId('nav-play').addEventListener('click', () => this.showView('modes'), options);
    byId('nav-garage').addEventListener('click', () => this.showView('garage'), options);
    byId('nav-achievements').addEventListener(
      'click',
      () => this.showView('achievements'),
      options,
    );
    byId('nav-settings').addEventListener('click', () => this.openGeneralSettings(), options);

    // Hero buttons
    byId('btn-hero-start').addEventListener('click', () => this.showView('modes'), options);
    byId('btn-hero-garage').addEventListener('click', () => this.showView('garage'), options);

    // Return to menu buttons
    byId('btn-garage-back').addEventListener('click', () => this.showView('home'), options);
    byId('btn-modes-back').addEventListener('click', () => this.showView('home'), options);
    byId('btn-achievements-back').addEventListener('click', () => this.showView('home'), options);

    // Garage carousel controls
    byId('garage-prev-car').addEventListener('click', () => this.cycleGarageCar(-1), options);
    byId('garage-next-car').addEventListener('click', () => this.cycleGarageCar(1), options);
    byId('garage-select-btn').addEventListener('click', () => this.onGarageSelectCar(), options);

    // Interactive 3D showroom drag-to-rotate
    const showroomStage = document.getElementById('garage-showroom-stage');
    if (showroomStage) {
      let isDragging = false;
      let lastX = 0;
      showroomStage.addEventListener(
        'pointerdown',
        (e) => {
          isDragging = true;
          lastX = e.clientX;
          showroomStage.setPointerCapture(e.pointerId);
        },
        options,
      );
      showroomStage.addEventListener(
        'pointermove',
        (e) => {
          if (!isDragging) return;
          const dx = e.clientX - lastX;
          lastX = e.clientX;
          this.game?.rotateShowroom(dx);
        },
        options,
      );
      const stopDrag = (e: PointerEvent) => {
        if (isDragging) {
          isDragging = false;
          this.game?.endShowroomDrag();
          try {
            showroomStage.releasePointerCapture(e.pointerId);
          } catch {}
        }
      };
      showroomStage.addEventListener('pointerup', stopDrag, options);
      showroomStage.addEventListener('pointercancel', stopDrag, options);
    }

    // Paint swatches & custom color picker
    document.querySelectorAll<HTMLElement>('.paint-swatch').forEach((swatch) => {
      swatch.addEventListener(
        'click',
        (e) => {
          const hex = (e.currentTarget as HTMLElement).dataset.color;
          if (hex) this.setPaintColor(hex);
        },
        options,
      );
    });
    byId<HTMLInputElement>('garage-color-picker').addEventListener(
      'input',
      (e) => {
        const hex = (e.currentTarget as HTMLInputElement).value;
        this.setPaintColor(hex);
      },
      options,
    );

    // Race mode cards & select buttons
    document.querySelectorAll<HTMLElement>('.mode-select-btn').forEach((btn) => {
      btn.addEventListener(
        'click',
        (e) => {
          const modeId = (e.currentTarget as HTMLElement).dataset.mode as RaceModeId;
          if (modeId) void this.startRaceWithMode(modeId);
        },
        options,
      );
    });

    // Hand tracking calibration buttons
    byId('calib-start-btn').addEventListener('click', () => void this.beginRun(), options);
    byId('calib-retry-btn').addEventListener('click', () => void this.useHandControls(), options);
    byId('calib-keyboard-btn').addEventListener('click', () => void this.useKeyboard(), options);

    // Post-race result buttons
    byId('btn-results-again').addEventListener(
      'click',
      () => void this.beginRun(this.currentModeId),
      options,
    );
    byId('btn-results-next').addEventListener('click', () => this.startNextRace(), options);
    byId('btn-results-garage').addEventListener('click', () => this.showView('garage'), options);
    byId('btn-results-menu').addEventListener('click', () => this.showView('home'), options);

    // Settings & diagnostics bindings
    this.graphicsSettings.bind(
      {
        onOpen: () => this.openGraphicsSettings(),
        onClose: () => this.closeGraphicsSettings(),
        onChange: (mode) => this.game?.setGraphicsQuality(mode),
      },
      this.events.signal,
    );
    this.soundSettings.bind(
      {
        onOpen: () => this.openSoundSettings(),
        onClose: () => this.closeSoundSettings(),
        onMasterVolumeChange: (vol) => this.audio.setMasterVolume(vol),
        onEngineVolumeChange: (vol) => this.audio.setEngineVolume(vol),
        onMusicVolumeChange: (vol) => this.audio.setMusicVolume(vol),
        onMuteToggle: (enabled) => {
          this.soundEnabled = enabled;
          this.audio.setEnabled(enabled);
          const muteBtn = byId<HTMLButtonElement>('mute-button');
          if (muteBtn) muteBtn.textContent = enabled ? 'SOUND ON' : 'SOUND OFF';
        },
        onTestSound: () => this.audio.testSound(),
      },
      this.events.signal,
    );

    // General preferences modal
    byId('settings-close').addEventListener('click', () => this.closeGeneralSettings(), options);
    byId('settings-backdrop').addEventListener('click', () => this.closeGeneralSettings(), options);
    byId<HTMLSelectElement>('settings-control-mode').addEventListener(
      'change',
      (e) => {
        const val = (e.currentTarget as HTMLSelectElement).value as 'hands' | 'keyboard';
        this.mode = val;
        progressionStore.setSelectedControlMode(val);
        this.setTracking(val === 'hands' ? 'INPUT: HANDS' : 'INPUT: KEYBOARD', 'ok');
        this.updateHomeHero();
      },
      options,
    );
    byId<HTMLSelectElement>('settings-camera-view').addEventListener(
      'change',
      (e) => {
        const val = Number((e.currentTarget as HTMLSelectElement).value);
        this.selectedCameraMode = val;
        progressionStore.setSelectedCameraMode(val);
        if (this.game) {
          const modeName = this.game.setCameraMode(val);
          this.updateCameraButton(modeName);
        }
      },
      options,
    );
    byId<HTMLSelectElement>('settings-transmission-mode').addEventListener(
      'change',
      (e) => {
        const val = (e.currentTarget as HTMLSelectElement).value as 'manual' | 'auto';
        this.transmissionMode = val;
        progressionStore.setSelectedTransmissionMode(val);
        this.game?.setTransmissionMode(val);
      },
      options,
    );
    byId<HTMLSelectElement>('settings-gesture-shift').addEventListener(
      'change',
      (e) => {
        const val = (e.currentTarget as HTMLSelectElement).value === 'enabled';
        this.gestureShiftingEnabled = val;
        progressionStore.setGestureShiftingEnabled(val);
        this.handController?.setGestureShiftingEnabled(val);
      },
      options,
    );
    byId('btn-reset-career').addEventListener(
      'click',
      () => {
        if (
          window.confirm(
            'Are you sure you want to reset all Rival Rush career progress, credits, and records?',
          )
        ) {
          progressionStore.resetProgress();
          this.updateCareerBadges();
          this.updateGarageUi();
          this.updateAchievementsUi();
          this.updateHomeHero();
          alert('Career progress has been reset to defaults.');
        }
      },
      options,
    );

    this.assetGate.retryButton.addEventListener(
      'click',
      () => {
        this.assetsReady = this.installAssets();
      },
      options,
    );

    // In-game controls
    this.mainMenuButton.addEventListener('click', () => this.showView('home'), options);
    this.pauseButton.addEventListener('click', () => this.togglePause(), options);
    byId('hide-camera').addEventListener('click', () => this.setCameraVisible(false), options);
    byId('show-camera').addEventListener('click', () => this.setCameraVisible(true), options);

    this.cameraButton.addEventListener(
      'click',
      () => {
        if (this.game) {
          const mode = this.game.toggleCameraAngle();
          this.updateCameraButton(mode);
        }
      },
      options,
    );
    this.weatherButton.addEventListener(
      'click',
      () => {
        if (this.game) {
          const mode = this.game.cycleWeather();
          this.updateWeatherButton(mode);
        }
      },
      options,
    );
    this.headlightButton.addEventListener(
      'click',
      () => {
        if (this.game) {
          const mode = this.game.cycleHeadlightMode();
          this.updateHeadlightButton(mode);
        }
      },
      options,
    );
    this.radarButton.addEventListener(
      'click',
      () => {
        const zoom = this.radarHud.cycleZoom();
        this.updateRadarButton(zoom);
      },
      options,
    );
    byId('gear-up-btn').addEventListener(
      'click',
      () => {
        this.game?.shiftGear(1);
      },
      options,
    );
    byId('gear-down-btn').addEventListener(
      'click',
      () => {
        this.game?.shiftGear(-1);
      },
      options,
    );
    byId('gear-mode-btn').addEventListener(
      'click',
      () => {
        this.toggleTransmission();
      },
      options,
    );
    byId<HTMLButtonElement>('mute-button').addEventListener(
      'click',
      (event) => {
        this.soundEnabled = !this.soundEnabled;
        this.audio.setEnabled(this.soundEnabled);
        this.soundSettings.setValues({ enabled: this.soundEnabled });
        (event.currentTarget as HTMLButtonElement).textContent = this.soundEnabled
          ? 'SOUND ON'
          : 'SOUND OFF';
      },
      options,
    );
    this.fullscreenButton.addEventListener('click', () => void this.toggleFullscreen(), options);
    document.addEventListener('fullscreenchange', () => this.onFullscreenChange(), options);
    document.addEventListener(
      'visibilitychange',
      () => {
        this.handController?.setPaused(document.hidden);
      },
      options,
    );
    byId('tracking-pill').addEventListener(
      'click',
      () => {
        const next = this.mode === 'hands' ? 'keyboard' : 'hands';
        void this.setControlMode(next);
      },
      options,
    );

    document.getElementById('hero-control-card')?.addEventListener(
      'click',
      () => {
        const next = this.mode === 'hands' ? 'keyboard' : 'hands';
        void this.setControlMode(next);
      },
      options,
    );

    document.getElementById('settings-control-mode')?.addEventListener(
      'change',
      (e) => {
        const mode = (e.target as HTMLSelectElement).value as ControlMode;
        void this.setControlMode(mode);
      },
      options,
    );

    document.getElementById('settings-camera-view')?.addEventListener(
      'change',
      (e) => {
        const camIndex = Number((e.target as HTMLSelectElement).value);
        this.selectedCameraMode = camIndex;
        progressionStore.setSelectedCameraMode(camIndex);
        this.game?.setCameraMode(camIndex);
      },
      options,
    );

    document
      .getElementById('settings-close')
      ?.addEventListener('click', () => this.closeGeneralSettings(), options);

    document
      .getElementById('settings-backdrop')
      ?.addEventListener('click', () => this.closeGeneralSettings(), options);

    document.getElementById('btn-reset-career')?.addEventListener(
      'click',
      () => {
        if (
          confirm(
            'Are you sure you want to reset all Rival Rush career progress, credits, and records?',
          )
        ) {
          progressionStore.resetProgress();
          window.location.reload();
        }
      },
      options,
    );

    window.addEventListener('keydown', (event) => this.onGlobalKeyDown(event), options);
    window.addEventListener('beforeunload', () => this.dispose(), { once: true });
  }

  // ══════════════════════════════════════════════════
  //   GAME STARTUP & ASSET PREPARATION
  // ══════════════════════════════════════════════════

  private async installAssets(): Promise<boolean> {
    this.assetGate.begin();
    const cached = await cacheAssets((progress) => this.assetGate.update(progress));
    if (!cached) {
      this.assetGate.showError();
      return false;
    }

    this.assetGate.markPreparing();
    if (!this.game) {
      this.game = await this.createGame();
      this.sceneReady = this.game.whenReady().then(
        () => true,
        (error) => {
          console.error('Could not prepare all scene assets.', error);
          return false;
        },
      );
    }
    if (!(await this.sceneReady)) {
      this.assetGate.markPreparationError();
      this.assetGate.showError();
      return false;
    }

    this.assetGate.markReady();
    await this.assetGate.finish();
    return true;
  }

  private async createGame(): Promise<DrivingGame> {
    const { DrivingGame } = await import('../game/DrivingGame');
    const game = new DrivingGame(
      this.viewport,
      () => this.getControl(),
      (snapshot) => {
        this.lastSnapshot = snapshot;
        this.hud.update(snapshot, snapshot.steering ?? 0);
        this.radarHud.update(snapshot.radar);
        this.audio.update(
          snapshot.speedKph,
          snapshot.weatherType ?? 'clear',
          snapshot.rainIntensity ?? 0,
          snapshot.snowIntensity ?? 0,
        );
        if (snapshot.weatherMode) {
          this.updateWeatherButton(snapshot.weatherMode);
        }
        if (snapshot.headlightMode) {
          this.updateHeadlightButton(snapshot.headlightMode);
        }
        if (snapshot.cameraModeName) {
          this.updateCameraButton(snapshot.cameraModeName);
        }
      },
      () => this.showCrash(),
      () => this.audio.hornThreeTimes(),
      (snapshot) => this.performanceHud.update(snapshot),
      (gear, direction) => this.audio.playGearShift(gear, direction),
    );

    game.setFinishCallback((result) => this.onRaceFinish(result));
    game.setCountdownCallback((isGo) => this.audio.playCountdownBeep(isGo));

    if (this.selectedCameraMode !== 0) {
      game.setCameraMode(this.selectedCameraMode);
    }
    game.setTransmissionMode(this.transmissionMode);
    game.setPerformanceMonitoring(this.performanceHud.isVisible());
    game.setGraphicsQuality(this.graphicsSettings.getMode());
    return game;
  }

  private getControl(): ControlInput {
    if (this.mode === 'hands') {
      const handInput = this.handController?.getInput();
      if (handInput && (handInput.active || this.handController?.getStatus() === 'tracking')) {
        return handInput;
      }
      // Seamless keyboard backup so player can still steer if camera tracking is temporarily lost
      const kb = this.keyboard.getInput();
      if (kb.active) {
        return { ...kb, active: true };
      }
      return handInput ?? { steering: 0, confidence: 0, active: false };
    }
    return { ...this.keyboard.getInput(), active: true };
  }

  private async prepareSelectedCars(): Promise<boolean> {
    try {
      const [assetsAvailable, sceneAvailable] = await Promise.all([
        this.assetsReady,
        this.sceneReady,
      ]);
      if (!assetsAvailable || !sceneAvailable || !this.game)
        throw new Error('Required assets are unavailable.');
      await this.game.setCars(this.driverCar, this.trafficCount, this.modelCount, this.driverColor);
      return true;
    } catch (error) {
      console.error('Could not prepare the game.', error);
      this.showGameLoadError();
      return false;
    }
  }

  // ══════════════════════════════════════════════════
  //   RACE FLOW: START, CALIBRATION & EXECUTION
  // ══════════════════════════════════════════════════

  private async startRaceWithMode(modeId: RaceModeId): Promise<void> {
    this.currentModeId = modeId;
    progressionStore.setSelectedMode(modeId);
    this.trafficCount = RACE_MODES[modeId].defaultTrafficCount;

    if (this.mode === 'hands') {
      if (this.handController?.getStatus() === 'tracking') {
        await this.beginRun(modeId);
      } else {
        await this.useHandControls();
      }
    } else {
      await this.beginRun(modeId);
    }
  }

  private async useHandControls(): Promise<void> {
    this.mode = 'hands';
    progressionStore.setSelectedControlMode('hands');
    this.updateControlModeUi();
    this.showView('calibrate');

    const statusMsg = document.getElementById('calib-status-msg');
    const startBtn = document.getElementById('calib-start-btn') as HTMLButtonElement | null;
    const retryBtn = document.getElementById('calib-retry-btn') as HTMLButtonElement | null;
    if (statusMsg) statusMsg.textContent = 'CONNECTING TO CAMERA...';
    if (startBtn) startBtn.disabled = true;
    if (retryBtn) retryBtn.classList.add('is-hidden');

    this.setTracking('CONNECTING CAMERA', 'warn');
    this.cameraHint.textContent = 'CONNECTING CAMERA';

    this.handController?.stop();
    const { HandController } = await import('../controls/HandController');
    this.handController = new HandController(
      this.video,
      this.cameraCanvas,
      (status, progress = 0) => this.onHandStatus(status, progress),
    );
    this.handController.setGestureShiftingEnabled(this.gestureShiftingEnabled);

    try {
      await this.handController.start();
      if (retryBtn) retryBtn.classList.add('is-hidden');
    } catch (error) {
      let friendlyMessage = 'CAMERA UNAVAILABLE — CHECK PERMISSIONS & RETRY';
      if (error instanceof DOMException) {
        if (
          error.name === 'NotReadableError' ||
          error.message?.includes('in use') ||
          error.message?.includes('Device in use')
        ) {
          friendlyMessage =
            'WEBCAM IN USE BY ANOTHER APP — CLOSE ZOOM / TEAMS / DISCORD & CLICK RETRY';
        } else if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          friendlyMessage =
            'CAMERA PERMISSION BLOCKED — CLICK URL BAR LOCK ICON TO ALLOW CAMERA & RETRY';
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
          friendlyMessage = 'NO WEBCAM DETECTED — CONNECT A CAMERA & CLICK RETRY';
        }
      }
      if (statusMsg) statusMsg.textContent = friendlyMessage;
      this.setTracking('CAMERA UNAVAILABLE', 'off');
      this.cameraHint.textContent = 'CAMERA UNAVAILABLE';
      if (retryBtn) {
        retryBtn.classList.remove('is-hidden');
        retryBtn.disabled = false;
      }
    }
  }

  private onHandStatus(status: string, progress: number): void {
    const percent = Math.min(100, Math.round(progress * 100));
    const percentEl = document.getElementById('calibration-percent');
    if (percentEl) percentEl.textContent = `${percent}%`;
    const ringEl = document.querySelector<HTMLElement>('.calibration-ring');
    if (ringEl) ringEl.style.setProperty('--progress', `${Math.round((percent / 100) * 360)}deg`);

    const statusMsg = document.getElementById('calib-status-msg');
    const startBtn = document.getElementById('calib-start-btn') as HTMLButtonElement | null;

    if (status === 'calibrating') {
      this.setTracking('HOLD TWO HANDS LEVEL', 'warn');
      if (statusMsg) {
        statusMsg.textContent =
          progress > 0 ? `HOLD STEADY (${percent}%)` : 'HOLD TWO HANDS LEVEL IN FRONT OF CAMERA';
      }
      this.cameraHint.textContent = 'HOLD STEADY';
      if (startBtn) startBtn.disabled = true;
    } else if (status === 'tracking') {
      this.cameraShell?.classList.remove('is-calibrating');
      this.setTracking('HANDS ACTIVE', 'ok');
      if (statusMsg) statusMsg.textContent = 'CALIBRATION COMPLETE — READY TO DRIVE';
      this.cameraHint.textContent = 'STEERING ACTIVE';
      if (startBtn) {
        startBtn.disabled = false;
        startBtn.focus();
      }
      this.updateControlModeUi();
    } else if (status === 'lost') {
      this.setTracking('NO HANDS DETECTED', 'warn');
      if (statusMsg) statusMsg.textContent = 'HANDS LOST — SHOW BOTH HANDS TO CAMERA';
      this.cameraHint.textContent = 'SHOW TWO HANDS';
    } else if (status === 'error') {
      this.cameraShell?.classList.remove('is-calibrating');
      this.cameraShell?.classList.add('is-offline');
      this.setTracking('CAMERA UNAVAILABLE', 'off');
      if (statusMsg)
        statusMsg.textContent = 'CAMERA UNAVAILABLE — CLICK RETRY CAMERA OR USE KEYBOARD';
      this.cameraHint.textContent = 'CAMERA UNAVAILABLE';
      const retryBtn = document.getElementById('calib-retry-btn') as HTMLButtonElement | null;
      if (retryBtn) {
        retryBtn.classList.remove('is-hidden');
        retryBtn.disabled = false;
      }
    }
  }

  private async useKeyboard(): Promise<void> {
    this.mode = 'keyboard';
    progressionStore.setSelectedControlMode('keyboard');
    this.updateControlModeUi();
    this.handController?.stop();
    if (this.cameraShell && this.cameraShell.parentElement !== this.gameShell) {
      this.gameShell?.appendChild(this.cameraShell);
    }
    this.cameraShell?.classList.remove('is-calibrating');
    this.cameraShell?.classList.add('is-offline', 'is-hidden');
    this.setTracking('INPUT: KEYBOARD', 'ok');
    this.cameraHint.textContent = 'KEYBOARD ACTIVE';
    await this.beginRun(this.currentModeId);
  }

  private async beginRun(modeId?: RaceModeId): Promise<void> {
    if (modeId) this.currentModeId = modeId;
    if (!(await this.prepareSelectedCars())) return;
    if (!this.game) return;

    const modeConfig = RACE_MODES[this.currentModeId] ?? RACE_MODES.endless;
    this.game.setRaceMode(modeConfig);

    this.audio.setCarModel(this.driverCar);
    this.audio.startRacingMusic();

    this.showView('game');
    this.hud.show();
    this.radarHud.show();

    if (this.mode === 'hands') {
      if (!this.handController) {
        const { HandController } = await import('../controls/HandController');
        this.handController = new HandController(
          this.video,
          this.cameraCanvas,
          (status, progress = 0) => this.onHandStatus(status, progress),
        );
        this.handController.setGestureShiftingEnabled(this.gestureShiftingEnabled);
      }
      if (
        this.handController.getStatus() !== 'tracking' &&
        this.handController.getStatus() !== 'calibrating' &&
        this.handController.getStatus() !== 'ready'
      ) {
        try {
          await this.handController.start();
        } catch {
          this.setTracking('CAMERA UNAVAILABLE', 'off');
        }
      }
      if (this.video && this.video.paused) {
        void this.video.play().catch(() => {});
      }
    }

    this.game.start();
  }

  private async setControlMode(mode: ControlMode): Promise<void> {
    this.mode = mode;
    progressionStore.setSelectedControlMode(mode);
    this.updateControlModeUi();

    if (mode === 'hands') {
      if (this.currentView === 'game') {
        if (this.cameraShell && this.cameraShell.parentElement !== this.gameShell) {
          this.gameShell?.appendChild(this.cameraShell);
        }
        this.cameraShell?.classList.remove('is-hidden', 'is-offline', 'is-calibrating');
        byId('show-camera')?.classList.add('is-hidden');
        if (!this.handController) {
          const { HandController } = await import('../controls/HandController');
          this.handController = new HandController(
            this.video,
            this.cameraCanvas,
            (status, progress = 0) => this.onHandStatus(status, progress),
          );
          this.handController.setGestureShiftingEnabled(this.gestureShiftingEnabled);
        }
        try {
          await this.handController.start();
          this.setTracking('HANDS ACTIVE', 'ok');
        } catch {
          this.setTracking('CAMERA ERROR', 'off');
        }
      } else {
        await this.useHandControls();
      }
    } else {
      this.handController?.stop();
      if (this.cameraShell && this.cameraShell.parentElement !== this.gameShell) {
        this.gameShell?.appendChild(this.cameraShell);
      }
      this.cameraShell?.classList.remove('is-calibrating');
      this.cameraShell?.classList.add('is-offline', 'is-hidden');
      byId('show-camera')?.classList.add('is-hidden');
      this.setTracking('INPUT: KEYBOARD', 'ok');
    }
  }

  private updateControlModeUi(): void {
    const pill = document.getElementById('tracking-pill');
    const label = document.getElementById('tracking-label');
    const heroCtrl = document.getElementById('hero-control-mode');
    const select = document.getElementById('settings-control-mode') as HTMLSelectElement | null;

    if (this.mode === 'hands') {
      if (label) label.textContent = 'INPUT: HAND TRACKING';
      if (pill) {
        pill.dataset.state = this.handController?.getStatus() === 'tracking' ? 'ok' : 'warn';
      }
      if (heroCtrl) heroCtrl.textContent = 'WEBCAM HAND TRACKING';
      if (select) select.value = 'hands';
    } else {
      if (label) label.textContent = 'INPUT: KEYBOARD';
      if (pill) pill.dataset.state = 'off';
      if (heroCtrl) heroCtrl.textContent = 'KEYBOARD (WASD / ARROWS)';
      if (select) select.value = 'keyboard';
    }
  }

  // ══════════════════════════════════════════════════
  //   RACE COMPLETION & RESULTS PRESENTATION
  // ══════════════════════════════════════════════════

  private onRaceFinish(result: RaceResult): void {
    this.audio.setPlaying(false);
    this.audio.playFinishChime(result.won);

    const recordOutcome = progressionStore.recordRaceResult({
      mode: this.currentModeId,
      won: result.won,
      finishPosition: result.finishPosition,
      completionTimeSeconds: result.completionTimeSeconds,
      distanceMeters: result.distanceMeters,
      maxSpeedKph: result.maxSpeedKph,
      overtakes: result.overtakes,
      score: result.score,
      health: result.health,
      controlMode: this.mode,
    });

    this.showView('results');

    // Populate Results Screen
    const trophy = document.getElementById('results-trophy');
    const headline = document.getElementById('results-headline');
    const posBadge = document.getElementById('results-position-badge');
    const subtitle = document.getElementById('results-subtitle');

    if (result.won) {
      if (headline) headline.textContent = 'VICTORY!';
      if (posBadge) {
        posBadge.textContent = '1ST PLACE · WINNER';
        posBadge.className = 'results-position-badge is-gold';
      }
      if (trophy) trophy.textContent = '🏆';
      if (subtitle)
        subtitle.textContent = 'Flawless execution on the asphalt. The podium is yours!';
    } else if (result.health <= 0) {
      if (headline) headline.textContent = 'VEHICLE CRASHED';
      if (posBadge) {
        posBadge.textContent = 'CRASHED · DNF';
        posBadge.className = 'results-position-badge is-silver';
      }
      if (trophy) trophy.textContent = '💥';
      if (subtitle) {
        subtitle.textContent =
          'Critical collision damage sustained. Refocus, avoid roadblocks, and restart the run.';
      }
    } else {
      const isRivalLoss =
        (this.currentModeId === 'rival_race' || this.currentModeId === 'championship') &&
        result.finishPosition === 2;
      if (headline) headline.textContent = isRivalLoss ? '2ND PLACE' : 'TIME EXPIRED';
      if (posBadge) {
        posBadge.textContent = isRivalLoss ? '2ND PLACE · RUNNER UP' : 'TIME EXPIRED · DNF';
        posBadge.className = 'results-position-badge is-silver';
      }
      if (trophy) trophy.textContent = isRivalLoss ? '🥈' : '⏱️';
      if (subtitle) {
        subtitle.textContent = isRivalLoss
          ? 'The rival crossed the line ahead. Upgrade your top speed and take revenge!'
          : 'The countdown clock ran out before reaching the finish line. Push for faster lap times!';
      }
    }

    // Animate stats
    const rScore = document.getElementById('results-score');
    const rTime = document.getElementById('results-time');
    const rDist = document.getElementById('results-distance');
    const rSpeed = document.getElementById('results-max-speed');
    const rOvertakes = document.getElementById('results-overtakes');
    const rHealth = document.getElementById('results-health');
    const rCreds = document.getElementById('results-credits-earned');
    const pbBadge = document.getElementById('results-pb-callout');

    if (rScore) rScore.textContent = result.score.toLocaleString();
    if (rTime) {
      const m = Math.floor(result.completionTimeSeconds / 60);
      const s = Math.floor(result.completionTimeSeconds % 60);
      const cs = Math.floor((result.completionTimeSeconds % 1) * 100);
      rTime.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
    }
    if (rDist) rDist.textContent = `${(result.distanceMeters / 1000).toFixed(2)} KM`;
    if (rSpeed) rSpeed.textContent = `${result.maxSpeedKph} KM/H`;
    if (rOvertakes) rOvertakes.textContent = result.overtakes.toString();
    if (rHealth) rHealth.textContent = `${result.health}%`;
    if (rCreds) rCreds.textContent = `+${recordOutcome.creditsEarned.toLocaleString()} CR`;

    if (pbBadge) {
      pbBadge.classList.toggle('is-hidden', !recordOutcome.newPersonalBest);
    }

    this.updateCareerBadges();
  }

  private startNextRace(): void {
    const list: RaceModeId[] = [
      'endless',
      'time_attack',
      'traffic_challenge',
      'rival_race',
      'championship',
    ];
    const currIdx = list.indexOf(this.currentModeId);
    const nextMode = list[(currIdx + 1) % list.length];
    void this.beginRun(nextMode);
  }

  private showCrash(): void {
    this.audio.setPlaying(false);
    const snapshot = this.lastSnapshot;
    const score = snapshot?.score ?? 0;
    const hasRival = this.currentModeId === 'rival_race' || this.currentModeId === 'championship';

    this.onRaceFinish({
      won: false,
      finishPosition: hasRival ? 2 : 1,
      completionTimeSeconds: snapshot?.raceTimeSeconds ?? 0,
      distanceMeters: snapshot?.distance ?? 0,
      maxSpeedKph: Math.round(snapshot?.speedKph ?? 0),
      overtakes: snapshot?.overtakes ?? 0,
      score,
      health: 0,
      mode: this.currentModeId,
    });
  }

  // ══════════════════════════════════════════════════
  //   PAUSE & SETTINGS DIALOGS
  // ══════════════════════════════════════════════════

  private toggleTransmission(): void {
    if (!this.game) return;
    const mode = this.game.toggleTransmissionMode();
    this.transmissionMode = mode;
    progressionStore.setSelectedTransmissionMode(mode);
    const transSelect = document.getElementById(
      'settings-transmission-mode',
    ) as HTMLSelectElement | null;
    if (transSelect) transSelect.value = mode;
  }

  private togglePause(): void {
    if (!this.game) return;
    const phase = this.game.getPhase();
    if (this.isGameActivePhase()) {
      this.game.pause();
      this.audio.setPlaying(false);
      this.pauseButton.textContent = 'RESUME';
      this.overlay.classList.remove('is-hidden');
      this.overlay.innerHTML = `
        <div class="modal compact-modal pause-modal">
          <div class="eyebrow"><span></span> RUN PAUSED</div>
          <h2>TAKE A BREATH.</h2>
          <p>The road is waiting exactly where you left it.</p>
          <div class="modal-actions">
            <button id="resume-run-btn" class="primary-button"><span>RESUME DRIVE</span><i>→</i></button>
            <button id="pause-garage-btn" class="secondary-button">OPEN GARAGE</button>
            <button id="pause-menu-btn" class="secondary-button">MAIN MENU</button>
          </div>
        </div>`;
      byId('resume-run-btn').addEventListener('click', () => this.resumeRun(), {
        signal: this.events.signal,
      });
      byId('pause-garage-btn').addEventListener(
        'click',
        () => {
          this.overlay.classList.add('is-hidden');
          this.showView('garage');
        },
        { signal: this.events.signal },
      );
      byId('pause-menu-btn').addEventListener(
        'click',
        () => {
          this.overlay.classList.add('is-hidden');
          this.showView('home');
        },
        { signal: this.events.signal },
      );
    } else if (phase === 'paused') {
      this.resumeRun();
    }
  }

  private resumeRun(): void {
    this.game?.resume();
    this.audio.setPlaying(true);
    this.overlay.classList.add('is-hidden');
    this.pauseButton.textContent = 'PAUSE';
  }

  private openGeneralSettings(): void {
    const dialog = document.getElementById('general-settings');
    if (!dialog) return;
    const modeSelect = document.getElementById('settings-control-mode') as HTMLSelectElement | null;
    const camSelect = document.getElementById('settings-camera-view') as HTMLSelectElement | null;
    const transSelect = document.getElementById(
      'settings-transmission-mode',
    ) as HTMLSelectElement | null;
    const gestureSelect = document.getElementById(
      'settings-gesture-shift',
    ) as HTMLSelectElement | null;
    if (modeSelect) modeSelect.value = this.mode;
    if (camSelect) camSelect.value = String(this.selectedCameraMode);
    if (transSelect) transSelect.value = this.transmissionMode;
    if (gestureSelect) gestureSelect.value = this.gestureShiftingEnabled ? 'enabled' : 'disabled';
    dialog.classList.remove('is-hidden');
  }

  private closeGeneralSettings(): void {
    const dialog = document.getElementById('general-settings');
    if (dialog) dialog.classList.add('is-hidden');
  }

  private showGameLoadError(): void {
    this.overlay.classList.remove('is-hidden');
    this.overlay.innerHTML = `
      <div class="modal compact-modal">
        <div class="eyebrow danger"><span></span> LOADING INTERRUPTED</div>
        <h2>ASSETS NOT READY.</h2>
        <p>The game will not start until every required texture and model has loaded. Check your connection and try again.</p>
        <button id="reload-game" class="secondary-button">RELOAD GAME</button>
      </div>`;
    byId('reload-game').addEventListener('click', () => window.location.reload(), {
      signal: this.events.signal,
    });
  }

  private setTracking(text: string, state: TrackingState = 'off'): void {
    this.trackingLabel.textContent = text;
    this.trackingPill.dataset.state = state;
  }

  private setCameraVisible(visible: boolean): void {
    this.cameraShell?.classList.toggle('is-hidden', !visible);
    byId('show-camera').classList.toggle('is-hidden', visible);
  }

  private async toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch (error) {
      console.warn('Fullscreen request failed:', error);
    }
  }

  private onFullscreenChange(): void {
    const active = document.fullscreenElement !== null;
    this.fullscreenButton.textContent = active ? 'EXIT FULL SCREEN' : 'FULL SCREEN';
    this.fullscreenButton.setAttribute(
      'aria-label',
      active ? 'Exit full screen' : 'Enter full screen',
    );
    this.fullscreenButton.setAttribute('aria-pressed', active.toString());
    requestAnimationFrame(() => requestAnimationFrame(() => this.game?.refreshViewport()));
  }

  private onGlobalKeyDown(event: KeyboardEvent): void {
    if (event.code === 'Escape' && this.soundSettings.isOpen()) {
      event.preventDefault();
      this.closeSoundSettings();
      return;
    }
    if (event.code === 'Escape' && this.graphicsSettings.isOpen()) {
      event.preventDefault();
      this.closeGraphicsSettings();
      return;
    }
    const genSettings = document.getElementById('general-settings');
    if (event.code === 'Escape' && genSettings && !genSettings.classList.contains('is-hidden')) {
      event.preventDefault();
      this.closeGeneralSettings();
      return;
    }
    if (event.code === 'F3') {
      event.preventDefault();
      this.game?.setPerformanceMonitoring(this.performanceHud.toggle());
      return;
    }
    if (event.code === 'KeyC') {
      event.preventDefault();
      const mode = this.game?.toggleCameraAngle();
      this.updateCameraButton(mode);
      return;
    }
    if (event.code === 'KeyV') {
      event.preventDefault();
      const mode = this.game?.cycleWeather();
      this.updateWeatherButton(mode);
      return;
    }
    if (event.code === 'KeyH' || event.code === 'KeyL') {
      event.preventDefault();
      const mode = this.game?.cycleHeadlightMode() ?? 'auto';
      this.updateHeadlightButton(mode);
      return;
    }
    if (event.code === 'KeyM') {
      event.preventDefault();
      const zoom = this.radarHud.cycleZoom();
      this.updateRadarButton(zoom);
      return;
    }
    if (event.code === 'KeyT') {
      event.preventDefault();
      this.toggleTransmission();
      return;
    }
    if (event.code !== 'Escape') return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (this.currentView === 'game') this.pauseButton.click();
  }

  private isGameActivePhase(): boolean {
    const phase = this.game?.getPhase();
    return (
      phase === 'playing' ||
      phase === 'racing' ||
      phase === 'final_approach' ||
      phase === 'countdown'
    );
  }

  private openGraphicsSettings(): void {
    if (this.graphicsSettings.isOpen()) return;
    this.resumeAfterGraphics = this.isGameActivePhase();
    if (this.resumeAfterGraphics) {
      this.game?.pause();
      this.audio.setPlaying(false);
      this.pauseButton.textContent = 'RESUME';
    }
    this.graphicsSettings.open();
  }

  private closeGraphicsSettings(): void {
    if (!this.graphicsSettings.isOpen()) return;
    this.graphicsSettings.close();
    if (this.resumeAfterGraphics) {
      this.game?.resume();
      this.audio.setPlaying(true);
      this.pauseButton.textContent = 'PAUSE';
    }
    this.resumeAfterGraphics = false;
  }

  private openSoundSettings(): void {
    if (this.soundSettings.isOpen()) return;
    this.resumeAfterSound = this.isGameActivePhase();
    if (this.resumeAfterSound) {
      this.game?.pause();
      this.audio.setPlaying(false);
      this.pauseButton.textContent = 'RESUME';
    }
    this.soundSettings.open();
  }

  private closeSoundSettings(): void {
    if (!this.soundSettings.isOpen()) return;
    this.soundSettings.close();
    if (this.resumeAfterSound) {
      this.game?.resume();
      this.audio.setPlaying(true);
      this.pauseButton.textContent = 'PAUSE';
    }
    this.resumeAfterSound = false;
  }

  private updateWeatherButton(mode?: string): void {
    if (!mode) return;
    const label = this.weatherButton.querySelector('.weather-button-label');
    if (label) {
      label.textContent = `WEATHER: ${mode.toUpperCase()}`;
    }
    const compactLabel = this.weatherButton.querySelector('.weather-button-label-compact');
    if (compactLabel) {
      compactLabel.textContent = mode.slice(0, 3).toUpperCase();
    }
  }

  private updateHeadlightButton(mode?: string): void {
    if (!mode) return;
    const label = this.headlightButton.querySelector('.headlight-button-label');
    if (label) {
      label.textContent = `LIGHTS: ${mode.toUpperCase()}`;
    }
    const compactLabel = this.headlightButton.querySelector('.headlight-button-label-compact');
    if (compactLabel) {
      compactLabel.textContent = mode === 'auto' ? 'LGT-A' : mode === 'on' ? 'LGT-ON' : 'LGT-OFF';
    }
    this.headlightButton.classList.toggle('is-off', mode === 'off');
    this.headlightButton.setAttribute(
      'aria-label',
      `Cycle headlights (H / L) · currently ${mode.toUpperCase()}`,
    );
  }

  private updateCameraButton(modeName?: string): void {
    if (!modeName) return;
    const label = this.cameraButton.querySelector('.camera-button-label');
    if (label) {
      label.textContent = `CAM: ${modeName.toUpperCase()}`;
    }
    const compactLabel = this.cameraButton.querySelector('.camera-button-label-compact');
    if (compactLabel) {
      compactLabel.textContent = 'CAM';
    }
  }

  private updateRadarButton(zoom: number): void {
    const label = this.radarButton.querySelector('.radar-button-label');
    if (label) {
      label.textContent = `RADAR: ${zoom}M`;
    }
    const compactLabel = this.radarButton.querySelector('.radar-button-label-compact');
    if (compactLabel) {
      compactLabel.textContent = `${zoom}M`;
    }
  }
}
