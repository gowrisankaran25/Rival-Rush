import type { GameSnapshot } from '../game/types';
import { byId } from './dom';

/** Updates the in-run HUD without exposing its DOM structure to the game loop. */
export class GameHud {
  private readonly root = byId<HTMLElement>('hud');
  private readonly speed = byId<HTMLElement>('speed');
  private readonly speedFill = byId<HTMLElement>('speed-fill');
  private readonly distance = byId<HTMLElement>('distance');
  private readonly overtakes = byId<HTMLElement>('overtakes');
  private readonly score = byId<HTMLElement>('score');
  private readonly health = byId<HTMLElement>('health');
  private readonly assist = byId<HTMLElement>('assist').querySelector<HTMLElement>('span')!;
  private readonly steering = byId<HTMLElement>('steer-indicator');
  private readonly gearIndicator = document.getElementById('gear-indicator');
  private readonly gearName = document.getElementById('gear-name');
  private readonly roadConditionBadge = document.getElementById('road-condition-badge');
  private readonly roadConditionIcon = document.getElementById('road-condition-icon');
  private readonly roadConditionText = document.getElementById('road-condition-text');

  show(): void {
    this.root.classList.remove('is-hidden');
  }

  update(snapshot: GameSnapshot, steering: number): void {
    this.speed.textContent = Math.round(snapshot.speedKph).toString().padStart(3, '0');
    this.speedFill.style.width = `${Math.min(100, snapshot.speedKph / 1.62)}%`;
    this.distance.innerHTML = `${(snapshot.distance / 1000).toFixed(2)} <small>KM</small>`;
    this.overtakes.textContent = snapshot.overtakes.toString();
    this.score.textContent = snapshot.score.toString().padStart(6, '0');
    this.health.textContent = `${snapshot.health}%`;
    this.assist.textContent = snapshot.assistMessage;
    this.steering.style.left = `${50 + steering * 46}%`;
    if (this.gearIndicator && snapshot.currentGear !== undefined) {
      this.gearIndicator.textContent = String(snapshot.currentGear);
    }
    if (this.gearName && snapshot.gearLabel) {
      this.gearName.textContent = snapshot.gearLabel;
    }
    if (this.roadConditionBadge && snapshot.roadCondition) {
      const cond = snapshot.roadCondition;
      if (this.roadConditionText) {
        this.roadConditionText.textContent = cond.label;
      }
      if (this.roadConditionIcon) {
        const icon =
          cond.surface === 'icy'
            ? '❄️'
            : cond.surface === 'flooded'
              ? '⛈️'
              : cond.surface === 'wet'
                ? '🌧️'
                : cond.surface === 'damp'
                  ? '🌫️'
                  : '☀️';
        this.roadConditionIcon.textContent = icon;
      }
      this.roadConditionBadge.classList.remove('is-optimal', 'is-warning', 'is-danger');
      this.roadConditionBadge.classList.add(`is-${cond.statusType}`);
    }
  }
}
