import type { GameSnapshot } from '../game/types';
import { byId } from './dom';

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
}

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

  // AAA Racing enhancements
  private readonly raceTimer = document.getElementById('race-timer');
  private readonly remainingPanel = document.getElementById('remaining-panel');
  private readonly remainingValue = document.getElementById('remaining-value');
  private readonly positionBadge = document.getElementById('position-badge');
  private readonly positionValue = document.getElementById('position-value');
  private readonly countdownOverlay = document.getElementById('countdown-overlay');
  private readonly countdownText = document.getElementById('countdown-text');
  private readonly approachAlert = document.getElementById('approach-alert');
  private readonly approachText = document.getElementById('approach-text');

  show(): void {
    this.root.classList.remove('is-hidden');
  }

  hide(): void {
    this.root.classList.add('is-hidden');
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

    // Race timer
    if (this.raceTimer && snapshot.raceTimeSeconds !== undefined) {
      this.raceTimer.textContent = formatTimer(snapshot.raceTimeSeconds);
    }

    // Distance remaining
    if (this.remainingPanel && this.remainingValue) {
      if (snapshot.distanceRemaining !== null && snapshot.distanceRemaining !== undefined) {
        this.remainingPanel.classList.remove('is-hidden');
        this.remainingValue.textContent = `${Math.round(snapshot.distanceRemaining)} M`;
      } else {
        this.remainingPanel.classList.add('is-hidden');
      }
    }

    // Position indicator for Rival races
    if (this.positionBadge && this.positionValue) {
      if (snapshot.position !== undefined) {
        this.positionBadge.classList.remove('is-hidden');
        this.positionValue.textContent = snapshot.position === 1 ? '1ST' : '2ND';
        this.positionBadge.classList.toggle('is-leading', snapshot.position === 1);
      } else {
        this.positionBadge.classList.add('is-hidden');
      }
    }

    // Countdown overlay
    if (this.countdownOverlay && this.countdownText) {
      if (snapshot.countdownValue !== null && snapshot.countdownValue !== undefined) {
        this.countdownOverlay.classList.remove('is-hidden');
        this.countdownText.textContent = snapshot.countdownValue === 0 ? 'GO!' : String(snapshot.countdownValue);
        this.countdownText.className = `countdown-number num-${snapshot.countdownValue}`;
      } else {
        this.countdownOverlay.classList.add('is-hidden');
      }
    }

    // Approach warning marker
    if (this.approachAlert && this.approachText) {
      if (snapshot.approachWarning) {
        this.approachAlert.classList.remove('is-hidden');
        this.approachText.textContent = snapshot.approachWarning;
      } else {
        this.approachAlert.classList.add('is-hidden');
      }
    }

    // Weather road conditions
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
