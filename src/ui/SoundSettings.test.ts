import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SoundSettings } from './SoundSettings';

class MockElement {
  public id: string;
  public value: string = '100';
  public textContent: string = '';
  public innerHTML: string = '';
  public classList = {
    classes: new Set<string>(),
    add: (c: string) => this.classList.classes.add(c),
    remove: (c: string) => this.classList.classes.delete(c),
    contains: (c: string) => this.classList.classes.has(c),
    toggle: (c: string, force?: boolean) => {
      if (force === true) this.classList.classes.add(c);
      else if (force === false) this.classList.classes.delete(c);
      else if (this.classList.classes.has(c)) this.classList.classes.delete(c);
      else this.classList.classes.add(c);
    },
  };
  public dataset: Record<string, string> = {};
  public listeners = new Map<string, Function[]>();

  constructor(id: string) {
    this.id = id;
    if (id === 'sound-settings') {
      this.classList.add('is-hidden');
    }
  }

  addEventListener(type: string, fn: Function): void {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }

  dispatchEvent(event: { type: string }): void {
    const list = this.listeners.get(event.type) ?? [];
    for (const fn of list) fn(event);
  }

  click(): void {
    this.dispatchEvent({ type: 'click' });
  }

  focus(): void {}

  querySelector(selector: string): MockElement | null {
    if (selector === '.sound-button-label') {
      return new MockElement('label-span');
    }
    return null;
  }
}

describe('SoundSettings', () => {
  const elements = new Map<string, MockElement>();
  const presets: MockElement[] = [];

  beforeEach(() => {
    elements.clear();
    presets.length = 0;

    const ids = [
      'sound-settings',
      'sound-button',
      'sound-close',
      'sound-backdrop',
      'sound-master-volume',
      'sound-master-value',
      'sound-engine-volume',
      'sound-engine-value',
      'sound-music-volume',
      'sound-music-value',
      'sound-mute-toggle',
      'sound-test-button',
    ];
    for (const id of ids) {
      elements.set(id, new MockElement(id));
    }

    for (const p of ['0', '50', '100', '150', '200']) {
      const el = new MockElement(`preset-${p}`);
      el.dataset.preset = p;
      presets.push(el);
    }

    (globalThis as any).document = {
      getElementById: (id: string) => elements.get(id) ?? null,
      querySelectorAll: (sel: string) => (sel === '.sound-preset-btn' ? presets : []),
    };
  });

  it('initializes sliders and displays with provided values', () => {
    const settings = new SoundSettings({
      masterVolume: 1.5,
      engineVolume: 1.2,
      musicVolume: 0.8,
      enabled: true,
    });

    expect(settings.isOpen()).toBe(false);
    const masterSlider = elements.get('sound-master-volume')!;
    const masterValue = elements.get('sound-master-value')!;
    expect(masterSlider.value).toBe('150');
    expect(masterValue.innerHTML).toContain('BOOST');

    const engineSlider = elements.get('sound-engine-volume')!;
    expect(engineSlider.value).toBe('120');

    const musicSlider = elements.get('sound-music-volume')!;
    expect(musicSlider.value).toBe('80');
  });

  it('dispatches volume change events and updates displays when sliders move', () => {
    const settings = new SoundSettings();
    expect(settings.isOpen()).toBe(false);
    const handlers = {
      onOpen: vi.fn(),
      onClose: vi.fn(),
      onMasterVolumeChange: vi.fn(),
      onEngineVolumeChange: vi.fn(),
      onMusicVolumeChange: vi.fn(),
      onMuteToggle: vi.fn(),
      onTestSound: vi.fn(),
    };
    const abort = new AbortController();
    settings.bind(handlers, abort.signal);

    const masterSlider = elements.get('sound-master-volume')!;
    masterSlider.value = '180';
    masterSlider.dispatchEvent({ type: 'input' });

    expect(handlers.onMasterVolumeChange).toHaveBeenCalledWith(1.8);

    // Preset button click
    const preset200 = presets.find((p) => p.dataset.preset === '200')!;
    preset200.click();
    expect(handlers.onMasterVolumeChange).toHaveBeenCalledWith(2.0);
    expect(masterSlider.value).toBe('200');

    // Test sound button
    const testBtn = elements.get('sound-test-button')!;
    testBtn.click();
    expect(handlers.onTestSound).toHaveBeenCalled();

    // Mute toggle
    const muteToggle = elements.get('sound-mute-toggle')!;
    muteToggle.click();
    expect(handlers.onMuteToggle).toHaveBeenCalledWith(false);
  });

  it('opens and closes modal cleanly', () => {
    const settings = new SoundSettings();
    const modal = elements.get('sound-settings')!;

    expect(settings.isOpen()).toBe(false);
    expect(modal.classList.contains('is-hidden')).toBe(true);

    settings.open();
    expect(settings.isOpen()).toBe(true);
    expect(modal.classList.contains('is-hidden')).toBe(false);

    settings.close();
    expect(settings.isOpen()).toBe(false);
    expect(modal.classList.contains('is-hidden')).toBe(true);
  });
});
