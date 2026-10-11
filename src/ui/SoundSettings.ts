import { byId } from './dom';

export interface SoundSettingsHandlers {
  onOpen(): void;
  onClose(): void;
  onMasterVolumeChange(volume: number): void;
  onEngineVolumeChange(volume: number): void;
  onMusicVolumeChange(volume: number): void;
  onMuteToggle(enabled: boolean): void;
  onTestSound(): void;
}

export interface SoundSettingsInitialValues {
  masterVolume: number;
  engineVolume: number;
  musicVolume: number;
  enabled: boolean;
}

/** Owns the sound settings modal, sliders, presets, and events. */
export class SoundSettings {
  private readonly root = byId<HTMLElement>('sound-settings');
  private readonly openButton = byId<HTMLButtonElement>('sound-button');
  private readonly closeButton = byId<HTMLButtonElement>('sound-close');
  private readonly backdrop = byId<HTMLButtonElement>('sound-backdrop');

  private readonly masterSlider = byId<HTMLInputElement>('sound-master-volume');
  private readonly masterValue = byId<HTMLElement>('sound-master-value');
  private readonly engineSlider = byId<HTMLInputElement>('sound-engine-volume');
  private readonly engineValue = byId<HTMLElement>('sound-engine-value');
  private readonly musicSlider = byId<HTMLInputElement>('sound-music-volume');
  private readonly musicValue = byId<HTMLElement>('sound-music-value');

  private readonly muteToggle = byId<HTMLButtonElement>('sound-mute-toggle');
  private readonly testButton = byId<HTMLButtonElement>('sound-test-button');
  private readonly presetButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('.sound-preset-btn'),
  );

  private masterVolume = 1.0;
  private engineVolume = 1.0;
  private musicVolume = 1.0;
  private enabled = true;

  constructor(initial?: Partial<SoundSettingsInitialValues>) {
    if (initial) {
      if (typeof initial.masterVolume === 'number') this.masterVolume = initial.masterVolume;
      if (typeof initial.engineVolume === 'number') this.engineVolume = initial.engineVolume;
      if (typeof initial.musicVolume === 'number') this.musicVolume = initial.musicVolume;
      if (typeof initial.enabled === 'boolean') this.enabled = initial.enabled;
    }
    this.syncUi();
  }

  bind(handlers: SoundSettingsHandlers, signal: AbortSignal): void {
    this.openButton.addEventListener('click', handlers.onOpen, { signal });
    this.closeButton.addEventListener('click', handlers.onClose, { signal });
    this.backdrop.addEventListener('click', handlers.onClose, { signal });

    this.masterSlider.addEventListener(
      'input',
      () => {
        const val = Number(this.masterSlider.value) / 100;
        this.masterVolume = val;
        this.updateMasterDisplay();
        handlers.onMasterVolumeChange(val);
      },
      { signal },
    );

    this.engineSlider.addEventListener(
      'input',
      () => {
        const val = Number(this.engineSlider.value) / 100;
        this.engineVolume = val;
        this.updateEngineDisplay();
        handlers.onEngineVolumeChange(val);
      },
      { signal },
    );

    this.musicSlider.addEventListener(
      'input',
      () => {
        const val = Number(this.musicSlider.value) / 100;
        this.musicVolume = val;
        this.updateMusicDisplay();
        handlers.onMusicVolumeChange(val);
      },
      { signal },
    );

    this.muteToggle.addEventListener(
      'click',
      () => {
        this.enabled = !this.enabled;
        this.updateMuteDisplay();
        handlers.onMuteToggle(this.enabled);
      },
      { signal },
    );

    this.testButton.addEventListener(
      'click',
      () => {
        handlers.onTestSound();
      },
      { signal },
    );

    for (const btn of this.presetButtons) {
      btn.addEventListener(
        'click',
        () => {
          const preset = Number(btn.dataset.preset);
          if (Number.isFinite(preset)) {
            const val = preset / 100;
            this.masterVolume = val;
            this.masterSlider.value = String(preset);
            this.updateMasterDisplay();
            handlers.onMasterVolumeChange(val);
          }
        },
        { signal },
      );
    }
  }

  setValues(values: Partial<SoundSettingsInitialValues>): void {
    if (typeof values.masterVolume === 'number') this.masterVolume = values.masterVolume;
    if (typeof values.engineVolume === 'number') this.engineVolume = values.engineVolume;
    if (typeof values.musicVolume === 'number') this.musicVolume = values.musicVolume;
    if (typeof values.enabled === 'boolean') this.enabled = values.enabled;
    this.syncUi();
  }

  isOpen(): boolean {
    return !this.root.classList.contains('is-hidden');
  }

  open(): void {
    this.root.classList.remove('is-hidden');
    this.masterSlider.focus();
  }

  close(): void {
    this.root.classList.add('is-hidden');
    this.openButton.focus();
  }

  private syncUi(): void {
    this.masterSlider.value = String(Math.round(this.masterVolume * 100));
    this.engineSlider.value = String(Math.round(this.engineVolume * 100));
    this.musicSlider.value = String(Math.round(this.musicVolume * 100));
    this.updateMasterDisplay();
    this.updateEngineDisplay();
    this.updateMusicDisplay();
    this.updateMuteDisplay();
  }

  private updateMasterDisplay(): void {
    const pct = Math.round(this.masterVolume * 100);
    if (pct > 100) {
      this.masterValue.innerHTML = `${pct}% <span class="sound-boost-badge">BOOST</span>`;
    } else {
      this.masterValue.textContent = `${pct}%`;
    }
    const labelSpan = this.openButton.querySelector('.sound-button-label');
    if (labelSpan) {
      labelSpan.textContent = this.enabled ? `SOUND ${pct}%` : 'MUTED';
    }
  }

  private updateEngineDisplay(): void {
    const pct = Math.round(this.engineVolume * 100);
    this.engineValue.textContent = pct > 100 ? `${pct}% (BOOST)` : `${pct}%`;
  }

  private updateMusicDisplay(): void {
    const pct = Math.round(this.musicVolume * 100);
    this.musicValue.textContent = pct > 100 ? `${pct}% (BOOST)` : `${pct}%`;
  }

  private updateMuteDisplay(): void {
    this.muteToggle.textContent = this.enabled ? 'MUTE AUDIO' : 'UNMUTE AUDIO';
    this.muteToggle.classList.toggle('is-muted', !this.enabled);
    const labelSpan = this.openButton.querySelector('.sound-button-label');
    if (labelSpan) {
      const pct = Math.round(this.masterVolume * 100);
      labelSpan.textContent = this.enabled ? `SOUND ${pct}%` : 'MUTED';
    }
  }
}
