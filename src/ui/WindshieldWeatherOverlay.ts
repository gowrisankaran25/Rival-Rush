export interface WindshieldOverlayOptions {
  container: HTMLElement;
}

interface WindshieldDroplet {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  streak: number;
  life: number;
}

/**
 * Screen-space weather overlay for the front-facing road driving camera.
 * Displays subtle aerodynamic droplets, high-speed blur, and winter frost
 * directly on screen without any cockpit, dashboard, or car interior geometry.
 */
export class WindshieldWeatherOverlay {
  private readonly root: HTMLDivElement;
  private readonly speedBlur: HTMLDivElement;
  private readonly frost: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;

  private droplets: WindshieldDroplet[] = [];
  private width = 0;
  private height = 0;

  constructor(options: WindshieldOverlayOptions) {
    this.root = document.createElement('div');
    this.root.className = 'cockpit-glass-overlay';

    this.speedBlur = document.createElement('div');
    this.speedBlur.className = 'cockpit-speed-blur';

    this.frost = document.createElement('div');
    this.frost.className = 'cockpit-frost';

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'windshield-weather-canvas';

    this.root.appendChild(this.speedBlur);
    this.root.appendChild(this.frost);
    this.root.appendChild(this.canvas);

    options.container.appendChild(this.root);

    this.ctx = this.canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', this.resize);
  }

  resize = (): void => {
    if (!this.root.parentElement) return;
    this.width = this.root.parentElement.clientWidth;
    this.height = this.root.parentElement.clientHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  };

  update(
    dt: number,
    rainIntensity: number,
    snowIntensity: number,
    speedKph: number,
    _isCockpitView = true,
    _steeringVisual = 0,
  ): void {
    // 1. High-speed radial edge blur (subtle and stable)
    const blurOpacity = speedKph > 75 ? Math.min(0.35, (speedKph - 75) / 100) : 0;
    this.speedBlur.style.opacity = blurOpacity.toFixed(2);

    // 2. Subtle winter edge frost during snowstorms
    const frostOpacity = snowIntensity > 0.05 ? Math.min(0.7, snowIntensity * 0.75) : 0;
    this.frost.style.opacity = frostOpacity.toFixed(2);

    if (!this.ctx) return;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    const hasMoisture = rainIntensity > 0.04 || snowIntensity > 0.04;
    if (!hasMoisture && this.droplets.length === 0) return;

    // 3. Spawn raindrops on the screen
    if (rainIntensity > 0.06) {
      const spawnChance = Math.min(0.85, rainIntensity * 1.1 * (0.5 + speedKph * 0.005));
      const spawnCount = Math.floor(spawnChance * 4);
      for (let i = 0; i < spawnCount; i++) {
        if (this.droplets.length < 180) {
          this.droplets.push({
            x: Math.random() * this.width,
            y: Math.random() * this.height,
            radius: 1.5 + Math.random() * 3.2,
            alpha: 0.35 + Math.random() * 0.45,
            streak: 0,
            life: 1.0,
          });
        }
      }
    }

    // 4. Update and render droplets with aerodynamic wind streaking
    const speedRatio = Math.min(1.6, speedKph / 75);

    for (let i = this.droplets.length - 1; i >= 0; i--) {
      const drop = this.droplets[i];

      // Aerodynamic wind shear: drops streak upward & sideways off screen as car speeds forward
      if (speedKph > 25) {
        drop.y -= speedRatio * 52 * dt;
        drop.streak = Math.min(24, drop.streak + speedRatio * 22 * dt);
      }

      // Natural evaporation / clearing
      drop.alpha -= dt * 0.28;

      if (drop.y < -25 || drop.alpha <= 0.04) {
        this.droplets.splice(i, 1);
        continue;
      }

      const r = drop.radius;
      ctx.save();
      ctx.globalAlpha = drop.alpha;

      // Aerodynamic streak trail
      if (drop.streak > 2.5) {
        ctx.strokeStyle = 'rgba(235, 246, 255, 0.38)';
        ctx.lineWidth = r * 0.7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(drop.x, drop.y + drop.streak);
        ctx.lineTo(drop.x, drop.y);
        ctx.stroke();
      }

      // Refractive droplet core with specular highlight
      const grad = ctx.createRadialGradient(
        drop.x - r * 0.3,
        drop.y - r * 0.3,
        r * 0.08,
        drop.x,
        drop.y,
        r,
      );
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
      grad.addColorStop(0.45, 'rgba(215, 235, 255, 0.55)');
      grad.addColorStop(0.85, 'rgba(150, 185, 215, 0.2)');
      grad.addColorStop(1, 'rgba(80, 120, 160, 0.5)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(drop.x, drop.y, r, 0, Math.PI * 2);
      ctx.fill();

      // Specular shine pinprick
      ctx.fillStyle = 'rgba(255, 255, 255, 0.98)';
      ctx.beginPath();
      ctx.arc(drop.x - r * 0.35, drop.y - r * 0.35, r * 0.25, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    this.root.remove();
  }
}
