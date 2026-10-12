import { describe, expect, it } from 'vitest';
import { KeyboardController } from './KeyboardController';

class FakeKeyboardTarget {
  private readonly listeners = new Map<string, Set<EventListener>>();

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: 'keydown' | 'keyup', code: string, repeat = false): void {
    const event = { code, repeat } as KeyboardEvent;
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }

  blur(): void {
    this.listeners.get('blur')?.forEach((listener) => listener(new Event('blur')));
  }
}

describe('KeyboardController', () => {
  it('maps acceleration, braking, and steering keys independently', () => {
    const target = new FakeKeyboardTarget();
    const keyboard = new KeyboardController(target as unknown as Window);

    target.dispatch('keydown', 'KeyW');
    target.dispatch('keydown', 'ArrowLeft');
    expect(keyboard.getInput()).toMatchObject({
      steering: -1,
      accelerating: true,
      braking: false,
    });

    target.dispatch('keydown', 'KeyS');
    expect(keyboard.getInput().braking).toBe(true);

    target.dispatch('keyup', 'KeyW');
    target.dispatch('keyup', 'ArrowLeft');
    expect(keyboard.getInput()).toMatchObject({
      steering: 0,
      accelerating: false,
      braking: true,
    });

    keyboard.dispose();
  });

  it('clears held controls when the window loses focus', () => {
    const target = new FakeKeyboardTarget();
    const keyboard = new KeyboardController(target as unknown as Window);
    target.dispatch('keydown', 'ArrowUp');
    target.dispatch('keydown', 'ArrowRight');

    target.blur();

    expect(keyboard.getInput()).toMatchObject({
      steering: 0,
      accelerating: false,
      braking: false,
      active: false,
    });
    keyboard.dispose();
  });

  it('shifts gear step-by-step and ignores held key repeats', () => {
    const target = new FakeKeyboardTarget();
    const keyboard = new KeyboardController(target as unknown as Window);

    // Initial upshift via ShiftLeft
    target.dispatch('keydown', 'ShiftLeft');
    expect(keyboard.getInput().gearShift).toBe(1);
    // Consumed immediately on read (single-shot)
    expect(keyboard.getInput().gearShift).toBeUndefined();

    // Key repeat from holding down Shift should be ignored
    target.dispatch('keydown', 'ShiftLeft', true);
    expect(keyboard.getInput().gearShift).toBeUndefined();

    // Explicit downshift via KeyQ
    target.dispatch('keydown', 'KeyQ');
    expect(keyboard.getInput().gearShift).toBe(-1);
    expect(keyboard.getInput().gearShift).toBeUndefined();

    // Key repeat from holding down Q should be ignored
    target.dispatch('keydown', 'KeyQ', true);
    expect(keyboard.getInput().gearShift).toBeUndefined();

    keyboard.dispose();
  });
});
