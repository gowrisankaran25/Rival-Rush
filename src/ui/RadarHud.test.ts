import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RadarTelemetry } from '../game/types';
import { RadarHud } from './RadarHud';

class MockElement {
  public id: string;
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
  public width: number = 220;
  public height: number = 220;

  constructor(id: string) {
    this.id = id;
  }

  addEventListener(type: string, fn: Function): void {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }

  dispatchEvent(event: { type: string; stopPropagation?: () => void }): void {
    const list = this.listeners.get(event.type) ?? [];
    for (const fn of list) fn(event);
  }

  click(): void {
    this.dispatchEvent({ type: 'click', stopPropagation: vi.fn() });
  }

  getContext(_type: string): unknown {
    return {
      save: vi.fn(),
      restore: vi.fn(),
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      scale: vi.fn(),
      translate: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      arc: vi.fn(),
      clip: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      strokeRect: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      setLineDash: vi.fn(),
      createConicGradient: vi.fn().mockReturnValue({
        addColorStop: vi.fn(),
      }),
      createLinearGradient: vi.fn().mockReturnValue({
        addColorStop: vi.fn(),
      }),
    };
  }

  getBoundingClientRect(): {
    width: number;
    height: number;
    top: number;
    left: number;
    right: number;
    bottom: number;
  } {
    return {
      width: 220,
      height: 220,
      top: 0,
      left: 0,
      right: 220,
      bottom: 220,
    };
  }
}

describe('RadarHud', () => {
  const elements = new Map<string, MockElement>();

  beforeEach(() => {
    elements.clear();

    const ids = [
      'radar-hud',
      'radar-canvas',
      'radar-zoom-btn',
      'radar-turn-warning',
      'radar-turn-text',
      'radar-turn-arrow',
    ];

    for (const id of ids) {
      elements.set(id, new MockElement(id));
    }

    (globalThis as unknown as { document: unknown }).document = {
      getElementById: (id: string) => elements.get(id) ?? null,
    };

    (globalThis as unknown as { requestAnimationFrame: unknown }).requestAnimationFrame = vi
      .fn()
      .mockReturnValue(1);
    (globalThis as unknown as { cancelAnimationFrame: unknown }).cancelAnimationFrame = vi.fn();
  });

  it('initializes with default 160M zoom level', () => {
    const radar = new RadarHud();
    expect(radar.getZoom()).toBe(160);
    expect(elements.get('radar-zoom-btn')?.textContent).toBe('160M');
    radar.dispose();
  });

  it('cycles zoom levels between 100M, 160M, and 240M', () => {
    const radar = new RadarHud();
    expect(radar.getZoom()).toBe(160);

    expect(radar.cycleZoom()).toBe(240);
    expect(elements.get('radar-zoom-btn')?.textContent).toBe('240M');

    expect(radar.cycleZoom()).toBe(100);
    expect(elements.get('radar-zoom-btn')?.textContent).toBe('100M');

    expect(radar.cycleZoom()).toBe(160);
    expect(elements.get('radar-zoom-btn')?.textContent).toBe('160M');

    radar.dispose();
  });

  it('toggles visibility and controls DOM is-hidden class', () => {
    const radar = new RadarHud();
    const root = elements.get('radar-hud')!;

    expect(root.classList.contains('is-hidden')).toBe(false);

    radar.hide();
    expect(root.classList.contains('is-hidden')).toBe(true);

    radar.show();
    expect(root.classList.contains('is-hidden')).toBe(false);

    const visibleAfterToggle = radar.toggle();
    expect(visibleAfterToggle).toBe(false);
    expect(root.classList.contains('is-hidden')).toBe(true);

    radar.dispose();
  });

  it('displays turn warning banner when a sharp turn is upcoming', () => {
    const radar = new RadarHud();
    const warning = elements.get('radar-turn-warning')!;
    const turnText = elements.get('radar-turn-text')!;
    const turnArrow = elements.get('radar-turn-arrow')!;

    warning.classList.add('is-hidden');

    const telemetry: RadarTelemetry = {
      playerDistance: 100,
      playerLateral: 0,
      playerSpeedKph: 120,
      roadWidth: 28,
      blips: [],
      roadNodes: [
        { relDistance: -25, curveOffset: 0 },
        { relDistance: 50, curveOffset: 12 },
        { relDistance: 100, curveOffset: 25 },
      ],
      upcomingTurn: {
        direction: 'right',
        severity: 'sharp',
        distanceMeters: 65,
      },
    };

    radar.update(telemetry);

    expect(warning.classList.contains('is-hidden')).toBe(false);
    expect(turnText.textContent).toContain('SHARP RIGHT (65M)');
    expect(turnArrow.textContent).toBe('▶▶');
    expect(warning.dataset.severity).toBe('sharp');

    // Should hide when turn is completed or distant
    radar.update({
      ...telemetry,
      upcomingTurn: undefined,
    });
    expect(warning.classList.contains('is-hidden')).toBe(true);

    radar.dispose();
  });
});
