import type { RadarBlip, RadarTelemetry } from '../game/types';
import { byId } from './dom';

export const RADAR_ZOOM_LEVELS = [100, 160, 240] as const;
export type RadarZoom = (typeof RADAR_ZOOM_LEVELS)[number];

export class RadarHud {
  private readonly root = byId<HTMLElement>('radar-hud');
  private readonly canvas = byId<HTMLCanvasElement>('radar-canvas');
  private readonly context = this.canvas.getContext('2d')!;
  private readonly zoomButton = byId<HTMLButtonElement>('radar-zoom-btn');
  private readonly turnWarning = byId<HTMLElement>('radar-turn-warning');
  private readonly turnText = byId<HTMLElement>('radar-turn-text');
  private readonly turnArrow = byId<HTMLElement>('radar-turn-arrow');

  private zoomIndex = 1; // Default: 160m
  private visible = true;
  private sweepAngle = 0;
  private lastRenderTime = 0;
  private lastTelemetry: RadarTelemetry | null = null;
  private animFrame = 0;

  constructor() {
    this.bindEvents();
    this.updateZoomLabel();
    this.setupCanvasDpi();
    this.startRenderLoop();
  }

  getZoom(): RadarZoom {
    return RADAR_ZOOM_LEVELS[this.zoomIndex];
  }

  cycleZoom(): RadarZoom {
    this.zoomIndex = (this.zoomIndex + 1) % RADAR_ZOOM_LEVELS.length;
    this.updateZoomLabel();
    if (this.lastTelemetry) {
      this.render(this.lastTelemetry);
    }
    return this.getZoom();
  }

  show(): void {
    this.visible = true;
    this.root.classList.remove('is-hidden');
  }

  hide(): void {
    this.visible = false;
    this.root.classList.add('is-hidden');
  }

  toggle(): boolean {
    if (this.visible) this.hide();
    else this.show();
    return this.visible;
  }

  update(telemetry?: RadarTelemetry): void {
    if (!telemetry) return;
    this.lastTelemetry = telemetry;
    this.updateTurnWarning(telemetry);
  }

  dispose(): void {
    cancelAnimationFrame(this.animFrame);
  }

  private bindEvents(): void {
    this.zoomButton.addEventListener('click', (event) => {
      event.stopPropagation();
      this.cycleZoom();
    });
    this.canvas.addEventListener('click', () => {
      this.cycleZoom();
    });
  }

  private updateZoomLabel(): void {
    this.zoomButton.textContent = `${this.getZoom()}M`;
  }

  private setupCanvasDpi(): void {
    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width || 210;
    const height = rect.height || 210;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.context.scale(dpr, dpr);
  }

  private startRenderLoop = (): void => {
    const now = performance.now();
    const dt = Math.min((now - this.lastRenderTime) * 0.001, 0.1);
    this.lastRenderTime = now;

    // Sweep line rotates continuously (one full revolution every ~3.5 seconds)
    this.sweepAngle = (this.sweepAngle + dt * 1.8) % (Math.PI * 2);

    if (this.visible && this.lastTelemetry) {
      this.render(this.lastTelemetry);
    }

    this.animFrame = requestAnimationFrame(this.startRenderLoop);
  };

  private updateTurnWarning(telemetry: RadarTelemetry): void {
    const turn = telemetry.upcomingTurn;
    if (turn && turn.distanceMeters <= 95) {
      this.turnWarning.classList.remove('is-hidden');
      const isLeft = turn.direction === 'left';
      this.turnArrow.textContent = isLeft ? '◀◀' : '▶▶';
      this.turnText.textContent = `${turn.severity.toUpperCase()} ${turn.direction.toUpperCase()} (${turn.distanceMeters}M)`;
      this.turnWarning.dataset.severity = turn.severity;
    } else {
      this.turnWarning.classList.add('is-hidden');
    }
  }

  private render(telemetry: RadarTelemetry): void {
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width || 210;
    const height = rect.height || 210;
    const ctx = this.context;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
    ctx.scale(dpr, dpr);

    const centerX = width * 0.5;
    // Player is positioned at 78% down the radar display (shows ~25m behind, zoomRange ahead)
    const playerY = height * 0.78;
    const zoomRange = this.getZoom();
    const forwardSpanPixels = playerY - 14; // pixels from player to top of radar
    const pixelsPerMeter = forwardSpanPixels / zoomRange;
    const lateralScale = pixelsPerMeter * 1.25;

    // ── 1. Circular Radar Clipping & Background ──
    const radius = Math.min(width, height) * 0.48;
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, height * 0.5, radius, 0, Math.PI * 2);
    ctx.clip();

    // Dark grid background
    ctx.fillStyle = '#050a0e';
    ctx.fill();

    // Subtle crosshairs
    ctx.strokeStyle = 'rgba(0, 255, 204, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, height);
    ctx.moveTo(0, height * 0.5);
    ctx.lineTo(width, height * 0.5);
    ctx.stroke();

    // Concentric Range Rings
    const rings = [0.33, 0.66, 1.0];
    ctx.strokeStyle = 'rgba(0, 255, 204, 0.14)';
    ctx.setLineDash([3, 5]);
    for (const fraction of rings) {
      const ringRadius = radius * fraction;
      ctx.beginPath();
      ctx.arc(centerX, height * 0.5, ringRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Range text labels
      ctx.fillStyle = 'rgba(0, 255, 204, 0.35)';
      ctx.font = '700 7px "DM Mono", monospace';
      const rangeVal = Math.round(zoomRange * fraction);
      ctx.fillText(`${rangeVal}M`, centerX + 3, height * 0.5 - ringRadius + 9);
    }
    ctx.setLineDash([]);

    // ── 2. Rotating Radar Sweep Ray ──
    ctx.save();
    ctx.translate(centerX, height * 0.5);
    const sweepGrad = ctx.createConicGradient(this.sweepAngle, 0, 0);
    sweepGrad.addColorStop(0, 'rgba(0, 255, 204, 0.16)');
    sweepGrad.addColorStop(0.12, 'rgba(0, 255, 204, 0.01)');
    sweepGrad.addColorStop(1, 'rgba(0, 255, 204, 0)');
    ctx.fillStyle = sweepGrad;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ── 3. Road Ribbon & Curvature Projection ──
    const nodes = telemetry.roadNodes;
    if (nodes.length >= 2) {
      const halfWidth = telemetry.roadWidth * 0.5 * lateralScale;

      // Draw road asphalt body
      ctx.beginPath();
      // Left edge points going forward
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const ny = playerY - node.relDistance * pixelsPerMeter;
        const nx = centerX + node.curveOffset * lateralScale - halfWidth;
        if (i === 0) ctx.moveTo(nx, ny);
        else ctx.lineTo(nx, ny);
      }
      // Right edge points returning backward
      for (let i = nodes.length - 1; i >= 0; i--) {
        const node = nodes[i];
        const ny = playerY - node.relDistance * pixelsPerMeter;
        const nx = centerX + node.curveOffset * lateralScale + halfWidth;
        ctx.lineTo(nx, ny);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(16, 28, 38, 0.75)';
      ctx.fill();

      // Guardrails / Edge glow
      ctx.strokeStyle = 'rgba(0, 255, 204, 0.45)';
      ctx.lineWidth = 1.5;
      // Left rail
      ctx.beginPath();
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const ny = playerY - node.relDistance * pixelsPerMeter;
        const nx = centerX + node.curveOffset * lateralScale - halfWidth;
        if (i === 0) ctx.moveTo(nx, ny);
        else ctx.lineTo(nx, ny);
      }
      ctx.stroke();

      // Right rail
      ctx.beginPath();
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const ny = playerY - node.relDistance * pixelsPerMeter;
        const nx = centerX + node.curveOffset * lateralScale + halfWidth;
        if (i === 0) ctx.moveTo(nx, ny);
        else ctx.lineTo(nx, ny);
      }
      ctx.stroke();

      // Center dashed road divider line
      ctx.strokeStyle = 'rgba(236, 255, 118, 0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const ny = playerY - node.relDistance * pixelsPerMeter;
        const nx = centerX + node.curveOffset * lateralScale;
        if (i === 0) ctx.moveTo(nx, ny);
        else ctx.lineTo(nx, ny);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ── 4. Blip Rendering (Traffic, Hazards, Collectibles) ──
    for (const blip of telemetry.blips) {
      if (blip.type === 'player') continue;
      this.drawBlip(ctx, blip, centerX, playerY, pixelsPerMeter, lateralScale, nodes);
    }

    // ── 5. Player Vehicle Marker & Headlight Beam ──
    this.drawPlayer(ctx, centerX, playerY, telemetry.playerLateral * lateralScale);

    ctx.restore(); // Restore clipping

    // ── 6. Outer Neon Radar Bezel & Heading Ticks ──
    ctx.strokeStyle = 'rgba(0, 255, 204, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, height * 0.5, radius, 0, Math.PI * 2);
    ctx.stroke();

    // North / Forward apex pip
    ctx.fillStyle = '#ecff76';
    ctx.beginPath();
    ctx.arc(centerX, height * 0.5 - radius, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private drawPlayer(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    playerY: number,
    playerOffsetPx: number,
  ): void {
    const px = centerX + playerOffsetPx;
    const py = playerY;

    // Headlight cone
    const grad = ctx.createLinearGradient(px, py, px, py - 35);
    grad.addColorStop(0, 'rgba(0, 255, 204, 0.3)');
    grad.addColorStop(1, 'rgba(0, 255, 204, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(px, py - 2);
    ctx.lineTo(px - 14, py - 35);
    ctx.lineTo(px + 14, py - 35);
    ctx.closePath();
    ctx.fill();

    // Player arrow (pointing forward)
    ctx.fillStyle = '#00ffcc';
    ctx.shadowColor = '#00ffcc';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(px, py - 8);
    ctx.lineTo(px - 6, py + 6);
    ctx.lineTo(px, py + 3);
    ctx.lineTo(px + 6, py + 6);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  private drawBlip(
    ctx: CanvasRenderingContext2D,
    blip: RadarBlip,
    centerX: number,
    playerY: number,
    pixelsPerMeter: number,
    lateralScale: number,
    nodes: RadarTelemetry['roadNodes'],
  ): void {
    // Interpolate curve offset at blip distance
    const curveOffset = this.sampleCurveOffset(blip.relDistance, nodes);
    const bx = centerX + (curveOffset + blip.lateral) * lateralScale;
    const by = playerY - blip.relDistance * pixelsPerMeter;

    switch (blip.type) {
      case 'traffic-lead': {
        // Amber lead traffic moving ahead
        ctx.fillStyle = blip.isRival ? '#d98cff' : '#ffb866';
        ctx.strokeStyle = '#050a0e';
        ctx.lineWidth = 1;
        ctx.fillRect(bx - 3.5, by - 6, 7, 12);
        ctx.strokeRect(bx - 3.5, by - 6, 7, 12);

        // Tail lights
        ctx.fillStyle = '#ff3344';
        ctx.fillRect(bx - 3, by + 4, 2, 2);
        ctx.fillRect(bx + 1, by + 4, 2, 2);
        break;
      }
      case 'traffic-incoming': {
        // Red flashing oncoming traffic (head-on collision hazard)
        ctx.fillStyle = '#ff3b5c';
        ctx.shadowColor = '#ff3b5c';
        ctx.shadowBlur = 6;
        ctx.fillRect(bx - 3.5, by - 6, 7, 12);
        ctx.shadowBlur = 0;

        // Front headlights facing toward player
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(bx - 3, by + 4, 2, 2);
        ctx.fillRect(bx + 1, by + 4, 2, 2);
        break;
      }
      case 'roadblock': {
        // Orange/red hazard barricade
        ctx.fillStyle = '#ff5533';
        ctx.shadowColor = '#ff5533';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(bx, by, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(bx - 2.5, by - 1, 5, 2);
        break;
      }
      case 'coin': {
        // Golden bonus coin
        ctx.fillStyle = '#ffd700';
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(bx, by, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        break;
      }
      case 'nitro': {
        // Electric cyan nitro spark
        ctx.fillStyle = '#00f0ff';
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(bx, by, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        break;
      }
    }
  }

  private sampleCurveOffset(relDistance: number, nodes: RadarTelemetry['roadNodes']): number {
    if (nodes.length === 0) return 0;
    if (relDistance <= nodes[0].relDistance) return nodes[0].curveOffset;
    if (relDistance >= nodes[nodes.length - 1].relDistance) {
      return nodes[nodes.length - 1].curveOffset;
    }
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i];
      const b = nodes[i + 1];
      if (relDistance >= a.relDistance && relDistance <= b.relDistance) {
        const t = (relDistance - a.relDistance) / (b.relDistance - a.relDistance);
        return a.curveOffset + (b.curveOffset - a.curveOffset) * t;
      }
    }
    return 0;
  }
}
