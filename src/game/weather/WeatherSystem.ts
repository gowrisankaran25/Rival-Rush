import * as THREE from 'three';
import { damp, lerp } from '../math';
import type { SceneLighting } from '../sceneAssets';
import type { RoadCondition, WeatherMode, WeatherType } from '../types';

export type { WeatherMode, WeatherType } from '../types';

export interface WeatherSystemOptions {
  scene: THREE.Scene;
  lighting: SceneLighting;
  roadMaterial: THREE.MeshStandardMaterial;
  shoulderMaterial: THREE.MeshStandardMaterial;
  groundSnow: THREE.Mesh;
  onLightningStrike?: () => void;
}

const RAIN_COUNT = 2400;
const SNOW_COUNT = 2000;
const SPRAY_COUNT = 140;

// Volume dimensions around camera (meters)
const VOL_WIDTH = 64;
const VOL_HEIGHT = 28;
const VOL_DEPTH = 64;
const HALF_W = VOL_WIDTH / 2;
const HALF_D = VOL_DEPTH / 2;
const MIN_Y = -3;
const MAX_Y = 25;

export function createSnowflakeTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const center = size / 2;

  // Soft glowing circular radial gradient
  const grad = ctx.createRadialGradient(center, center, 1, center, center, center - 2);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.35, 'rgba(235, 245, 255, 0.85)');
  grad.addColorStop(0.75, 'rgba(215, 235, 250, 0.35)');
  grad.addColorStop(1, 'rgba(200, 225, 245, 0)');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(center, center, center - 2, 0, Math.PI * 2);
  ctx.fill();

  // Six delicate crystalline arms for authentic snowflake structure
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.lineWidth = 1.5;
  for (let a = 0; a < 6; a++) {
    const angle = (a * Math.PI) / 3;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.lineTo(center + cos * (center - 6), center + sin * (center - 6));
    ctx.stroke();

    // Small branchlets
    const midX = center + cos * 14;
    const midY = center + sin * 14;
    const bCos1 = Math.cos(angle + 0.6);
    const bSin1 = Math.sin(angle + 0.6);
    const bCos2 = Math.cos(angle - 0.6);
    const bSin2 = Math.sin(angle - 0.6);
    ctx.beginPath();
    ctx.moveTo(midX, midY);
    ctx.lineTo(midX + bCos1 * 6, midY + bSin1 * 6);
    ctx.moveTo(midX, midY);
    ctx.lineTo(midX + bCos2 * 6, midY + bSin2 * 6);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

export class WeatherSystem {
  private mode: WeatherMode = 'auto';
  private currentWeatherType: WeatherType = 'clear';
  private previousWeatherType: WeatherType = 'clear';
  private rainIntensity = 0;
  private snowIntensity = 0;
  private fogIntensity = 0;
  private stormIntensity = 0;
  private wetness = 0;
  private snowAccumulation = 0;
  private elapsedTime = 0;
  private lightningTimer = 12;
  private lightningFlash = 0;
  private readonly onLightningStrike?: () => void;

  // Scene references
  private readonly scene: THREE.Scene;
  private readonly lighting: SceneLighting;
  private readonly roadMaterial: THREE.MeshStandardMaterial;
  private readonly shoulderMaterial: THREE.MeshStandardMaterial;
  private readonly groundSnow: THREE.Mesh;

  // Rain streak system (LineSegments)
  private rainLines?: THREE.LineSegments;
  private rainPositions?: Float32Array; // count * 2 * 3 (head & tail)
  private rainColors?: Float32Array;
  private rainDropBase?: Float32Array; // count * 3 (head positions in camera volume)
  private rainDropSpeeds?: Float32Array; // count (fall speeds)

  // Snow particle system (Points)
  private snowPoints?: THREE.Points;
  private snowPositions?: Float32Array;
  private snowPhases?: Float32Array;
  private snowSpeeds?: Float32Array;

  // Wet road tire spray system (Points)
  private sprayPoints?: THREE.Points;
  private sprayPositions?: Float32Array;
  private sprayVelocities?: Float32Array;
  private sprayLifetimes?: Float32Array;

  // Sky and fog colors for lerping
  private readonly clearSkyColor = new THREE.Color(0x9bb8bd);
  private readonly fogSkyColor = new THREE.Color(0xb0c0ca);
  private readonly rainSkyColor = new THREE.Color(0x8ea2b0);
  private readonly stormSkyColor = new THREE.Color(0x485866);
  private readonly snowSkyColor = new THREE.Color(0xd2dce6);

  private readonly clearSunColor = new THREE.Color(0xfff1ce);
  private readonly fogSunColor = new THREE.Color(0xc4d4de);
  private readonly rainSunColor = new THREE.Color(0xe0ecf4);
  private readonly stormSunColor = new THREE.Color(0x9cb2c4);
  private readonly snowSunColor = new THREE.Color(0xdce6f0);

  private readonly clearHemiSky = new THREE.Color(0xdaf7ff);
  private readonly fogHemiSky = new THREE.Color(0xa2b6c4);
  private readonly rainHemiSky = new THREE.Color(0xa4b8c7);
  private readonly stormHemiSky = new THREE.Color(0x627788);
  private readonly snowHemiSky = new THREE.Color(0xdce6f0);

  private readonly clearHemiGround = new THREE.Color(0x31442c);
  private readonly fogHemiGround = new THREE.Color(0x2c3b31);
  private readonly rainHemiGround = new THREE.Color(0x566773);
  private readonly stormHemiGround = new THREE.Color(0x36444e);
  private readonly snowHemiGround = new THREE.Color(0x6b7b85);

  private readonly workingColor = new THREE.Color();

  constructor(options: WeatherSystemOptions) {
    this.scene = options.scene;
    this.lighting = options.lighting;
    this.roadMaterial = options.roadMaterial;
    this.shoulderMaterial = options.shoulderMaterial;
    this.groundSnow = options.groundSnow;
    this.onLightningStrike = options.onLightningStrike;

    // Start ground snow at 0 opacity (fades in only during snow)
    const groundSnowMat = this.groundSnow.material as THREE.MeshStandardMaterial;
    if (groundSnowMat) groundSnowMat.opacity = 0;

    this.initRain();
    this.initSnow();
    this.initTireSpray();
  }

  getMode(): WeatherMode {
    return this.mode;
  }

  setMode(mode: WeatherMode): void {
    this.mode = mode;
  }

  cycleMode(): WeatherMode {
    const modes: WeatherMode[] = ['auto', 'rain', 'storm', 'snow', 'fog', 'clear'];
    const currentIndex = modes.indexOf(this.mode);
    const nextIndex = (currentIndex + 1) % modes.length;
    this.mode = modes[nextIndex];
    return this.mode;
  }

  getWeatherType(): WeatherType {
    return this.currentWeatherType;
  }

  getClimateChangedNotice(): string | null {
    if (this.currentWeatherType !== this.previousWeatherType) {
      this.previousWeatherType = this.currentWeatherType;
      const climateLabels: Record<WeatherType, string> = {
        clear: 'CLIMATE: CRISP SUNNY SKIES',
        fog: 'CLIMATE: ALPINE MOUNTAIN FOG',
        rain: 'CLIMATE: TORRENTIAL RAINSTORM',
        storm: 'CLIMATE: THUNDERSTORM & TEMPEST',
        snow: 'CLIMATE: ALPINE BLIZZARD',
      };
      return climateLabels[this.currentWeatherType];
    }
    return null;
  }

  getRainIntensity(): number {
    return this.rainIntensity;
  }

  getSnowIntensity(): number {
    return this.snowIntensity;
  }

  getFogIntensity(): number {
    return this.fogIntensity;
  }

  getStormIntensity(): number {
    return this.stormIntensity;
  }

  getRoadWetness(): number {
    return this.wetness;
  }

  getSnowAccumulation(): number {
    return this.snowAccumulation;
  }

  getRoadCondition(speedKph: number, tireSlip = 0): RoadCondition {
    if (this.snowAccumulation > 0.18 || this.currentWeatherType === 'snow') {
      const snow = Math.min(1.0, Math.max(this.snowAccumulation, this.snowIntensity));
      const grip = lerp(1.0, 0.46, snow);
      const brakingFactor = lerp(1.0, 2.3, snow);
      const curveSpeedFactor = lerp(1.0, 0.5, snow);
      const statusType: 'optimal' | 'warning' | 'danger' =
        snow > 0.35 || tireSlip > 0.18 ? 'danger' : 'warning';
      const label =
        tireSlip > 0.18 ? 'ROAD: BLACK ICE · ❄️ DRIFT SLIPPING' : 'ROAD: ICY SLUSH · ❄️ 46% GRIP';
      return {
        surface: 'icy',
        grip,
        brakingFactor,
        curveSpeedFactor,
        hydroplaneRisk: 0,
        tireSlip,
        label,
        statusType,
      };
    }

    if (this.currentWeatherType === 'storm' || this.stormIntensity > 0.35) {
      const storm = Math.min(1.0, Math.max(this.stormIntensity, this.wetness));
      const grip = lerp(1.0, 0.58, storm);
      const brakingFactor = lerp(1.0, 1.85, storm);
      const curveSpeedFactor = lerp(1.0, 0.62, storm);
      const hydroplaneRisk = speedKph > 110 ? Math.min(1.0, ((speedKph - 110) / 45) * storm) : 0;
      const statusType: 'optimal' | 'warning' | 'danger' =
        hydroplaneRisk > 0.28 || tireSlip > 0.2 ? 'danger' : 'warning';
      const label =
        hydroplaneRisk > 0.28
          ? 'ROAD: FLOODED · ⚠️ HYDROPLANE RISK'
          : `ROAD: FLOODED · ⚠️ ${Math.round(grip * 100)}% GRIP`;
      return {
        surface: 'flooded',
        grip,
        brakingFactor,
        curveSpeedFactor,
        hydroplaneRisk,
        tireSlip,
        label,
        statusType,
      };
    }

    if (this.wetness > 0.18 || this.currentWeatherType === 'rain') {
      const wet = Math.min(1.0, Math.max(this.wetness, this.rainIntensity));
      const grip = lerp(1.0, 0.72, wet);
      const brakingFactor = lerp(1.0, 1.45, wet);
      const curveSpeedFactor = lerp(1.0, 0.76, wet);
      const hydroplaneRisk = speedKph > 135 ? Math.min(1.0, ((speedKph - 135) / 60) * wet) : 0;
      const statusType: 'optimal' | 'warning' | 'danger' =
        hydroplaneRisk > 0.35 || tireSlip > 0.2 ? 'danger' : 'warning';
      const label =
        hydroplaneRisk > 0.35
          ? 'ROAD: WET · ⚠️ HYDROPLANE RISK'
          : `ROAD: WET · ⚠️ ${Math.round(grip * 100)}% GRIP`;
      return {
        surface: 'wet',
        grip,
        brakingFactor,
        curveSpeedFactor,
        hydroplaneRisk,
        tireSlip,
        label,
        statusType,
      };
    }

    if (this.fogIntensity > 0.2 || this.currentWeatherType === 'fog') {
      const fog = Math.min(1.0, this.fogIntensity);
      const grip = lerp(1.0, 0.85, fog);
      const brakingFactor = lerp(1.0, 1.22, fog);
      const curveSpeedFactor = lerp(1.0, 0.88, fog);
      return {
        surface: 'damp',
        grip,
        brakingFactor,
        curveSpeedFactor,
        hydroplaneRisk: 0,
        tireSlip,
        label: `ROAD: DAMP FOG · 🌫️ ${Math.round(grip * 100)}% GRIP`,
        statusType: 'warning',
      };
    }

    return {
      surface: 'dry',
      grip: 1.0,
      brakingFactor: 1.0,
      curveSpeedFactor: 1.0,
      hydroplaneRisk: 0,
      tireSlip,
      label: 'ROAD: DRY · ☀️ 100% GRIP',
      statusType: 'optimal',
    };
  }

  private initRain(): void {
    const pos = new Float32Array(RAIN_COUNT * 2 * 3);
    const cols = new Float32Array(RAIN_COUNT * 2 * 3);
    const base = new Float32Array(RAIN_COUNT * 3);
    const speeds = new Float32Array(RAIN_COUNT);

    for (let i = 0; i < RAIN_COUNT; i++) {
      const bx = (Math.random() - 0.5) * VOL_WIDTH;
      const by = MIN_Y + Math.random() * VOL_HEIGHT;
      const bz = (Math.random() - 0.5) * VOL_DEPTH;

      base[i * 3] = bx;
      base[i * 3 + 1] = by;
      base[i * 3 + 2] = bz;

      speeds[i] = 48 + Math.random() * 16; // 48 - 64 m/s fall speed

      const i6 = i * 6;
      // Head vertex
      pos[i6] = bx;
      pos[i6 + 1] = by;
      pos[i6 + 2] = bz;
      // Tail vertex (initial downward streak)
      pos[i6 + 3] = bx;
      pos[i6 + 4] = by + 0.8;
      pos[i6 + 5] = bz;

      // Head color: glossy bright cyan-white
      cols[i6] = 0.85;
      cols[i6 + 1] = 0.94;
      cols[i6 + 2] = 1.0;

      // Tail color: translucent fading blue
      cols[i6 + 3] = 0.35;
      cols[i6 + 4] = 0.55;
      cols[i6 + 5] = 0.85;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(cols, 3));

    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.rainLines = new THREE.LineSegments(geometry, material);
    this.rainLines.frustumCulled = false;
    this.scene.add(this.rainLines);

    this.rainPositions = pos;
    this.rainColors = cols;
    this.rainDropBase = base;
    this.rainDropSpeeds = speeds;
  }

  private initSnow(): void {
    const pos = new Float32Array(SNOW_COUNT * 3);
    const phases = new Float32Array(SNOW_COUNT * 2);
    const speeds = new Float32Array(SNOW_COUNT);

    for (let i = 0; i < SNOW_COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * VOL_WIDTH;
      pos[i * 3 + 1] = MIN_Y + Math.random() * VOL_HEIGHT;
      pos[i * 3 + 2] = (Math.random() - 0.5) * VOL_DEPTH;

      phases[i * 2] = Math.random() * Math.PI * 2;
      phases[i * 2 + 1] = 0.6 + Math.random() * 0.8; // flutter amplitude

      speeds[i] = 2.8 + Math.random() * 2.2; // 2.8 - 5.0 m/s gentle fall
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    const texture = createSnowflakeTexture();

    const materialOptions: THREE.PointsMaterialParameters = {
      size: 0.42,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.NormalBlending,
      color: 0xf5faff,
    };
    if (texture) materialOptions.map = texture;

    const material = new THREE.PointsMaterial(materialOptions);

    this.snowPoints = new THREE.Points(geometry, material);
    this.snowPoints.frustumCulled = false;
    this.scene.add(this.snowPoints);

    this.snowPositions = pos;
    this.snowPhases = phases;
    this.snowSpeeds = speeds;
  }

  private initTireSpray(): void {
    const pos = new Float32Array(SPRAY_COUNT * 3);
    const vel = new Float32Array(SPRAY_COUNT * 3);
    const life = new Float32Array(SPRAY_COUNT);

    for (let i = 0; i < SPRAY_COUNT; i++) {
      life[i] = 1.0; // expired
      pos[i * 3 + 1] = -100; // hidden initially
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    const material = new THREE.PointsMaterial({
      size: 0.6,
      transparent: true,
      opacity: 0.28,
      color: 0xd8eaf4,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    this.sprayPoints = new THREE.Points(geometry, material);
    this.sprayPoints.frustumCulled = false;
    this.scene.add(this.sprayPoints);

    this.sprayPositions = pos;
    this.sprayVelocities = vel;
    this.sprayLifetimes = life;
  }

  update(
    dt: number,
    distance: number,
    speed: number,
    vehicleHeading: number,
    cameraPosition: THREE.Vector3,
    playerPosition: THREE.Vector3,
    headlightsActive = true,
  ): void {
    this.elapsedTime += dt;

    // 1. Determine target weather condition
    let targetRain = 0;
    let targetSnow = 0;
    let targetFog = 0;
    let targetStorm = 0;

    if (this.mode === 'rain') {
      targetRain = 1.0;
    } else if (this.mode === 'storm') {
      targetStorm = 1.0;
      targetRain = 1.0;
    } else if (this.mode === 'snow') {
      targetSnow = 1.0;
    } else if (this.mode === 'fog') {
      targetFog = 1.0;
    } else if (this.mode === 'clear') {
      targetRain = 0.0;
      targetSnow = 0.0;
      targetFog = 0.0;
      targetStorm = 0.0;
    } else {
      // Dynamic automatic climate: smoothly transitions continuously over time (~100s cycle),
      // with a distance boost so high-speed driving travels through regional climate zones faster.
      const CYCLE_DURATION = 100;
      const progress = ((this.elapsedTime + distance * 0.015) % CYCLE_DURATION) / CYCLE_DURATION;

      // 0.00 - 0.20 (0s - 20s): Clear Crisp Sunshine (Dry road)
      // 0.20 - 0.44 (20s - 44s): Torrential Rainstorm (Wet asphalt, tire spray)
      // 0.44 - 0.62 (44s - 62s): Heavy Thunderstorm & Tempest (Flooded road, lightning, hydroplane)
      // 0.62 - 0.82 (62s - 82s): Alpine Blizzard & Snowfall (Black ice, drifting)
      // 0.82 - 0.96 (82s - 96s): Mountain Fog & Misty Morning (Damp road)
      // 0.96 - 1.00 (96s - 100s): Gentle clearing return to Sunshine
      if (progress >= 0.2 && progress < 0.44) {
        const t = (progress - 0.2) / 0.24;
        targetRain = Math.sin(t * Math.PI);
      } else if (progress >= 0.44 && progress < 0.62) {
        const t = (progress - 0.44) / 0.18;
        targetStorm = Math.sin(t * Math.PI);
        targetRain = 0.6 + 0.4 * Math.sin(t * Math.PI);
      } else if (progress >= 0.62 && progress < 0.82) {
        const t = (progress - 0.62) / 0.2;
        targetSnow = Math.sin(t * Math.PI);
      } else if (progress >= 0.82 && progress < 0.96) {
        const t = (progress - 0.82) / 0.14;
        targetFog = Math.sin(t * Math.PI);
      }
    }

    // Smoothly transition intensities
    this.rainIntensity = damp(this.rainIntensity, targetRain, 1.4, dt);
    this.snowIntensity = damp(this.snowIntensity, targetSnow, 1.2, dt);
    this.fogIntensity = damp(this.fogIntensity, targetFog, 1.3, dt);
    this.stormIntensity = damp(this.stormIntensity, targetStorm, 1.3, dt);

    // Road wetness accumulates with rain and storms and slowly evaporates
    if (this.rainIntensity > 0.05 || this.stormIntensity > 0.05) {
      const targetWetness = Math.min(1.0, this.rainIntensity * 1.1 + this.stormIntensity * 1.35);
      this.wetness = damp(this.wetness, targetWetness, 1.0, dt);
    } else if (this.fogIntensity > 0.15) {
      this.wetness = damp(this.wetness, this.fogIntensity * 0.35, 0.4, dt);
    } else {
      this.wetness = damp(this.wetness, 0.0, 0.18, dt); // gentle drying delay
    }

    // Snow accumulates and gradually melts
    if (this.snowIntensity > 0.05) {
      this.snowAccumulation = damp(
        this.snowAccumulation,
        Math.min(1.0, this.snowIntensity * 1.1),
        0.8,
        dt,
      );
    } else {
      this.snowAccumulation = damp(this.snowAccumulation, 0.0, 0.3, dt);
    }

    // Determine primary current weather type
    if (this.stormIntensity > 0.35) {
      this.currentWeatherType = 'storm';
    } else if (this.snowIntensity > 0.35) {
      this.currentWeatherType = 'snow';
    } else if (this.rainIntensity > 0.35) {
      this.currentWeatherType = 'rain';
    } else if (this.fogIntensity > 0.35) {
      this.currentWeatherType = 'fog';
    } else {
      this.currentWeatherType = 'clear';
    }

    // Atmospheric lightning strikes during storms and heavy rain
    const lightningActive = this.stormIntensity > 0.35 || this.rainIntensity > 0.45;
    if (lightningActive) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        const strikeDelay =
          this.stormIntensity > 0.35 ? 6 + Math.random() * 8 : 14 + Math.random() * 16;
        this.lightningTimer = strikeDelay;
        this.lightningFlash = 1.0;
        this.onLightningStrike?.();
      }
    }
    if (this.lightningFlash > 0) {
      this.lightningFlash = Math.max(0, this.lightningFlash - dt * 6.0);
    }

    // 2. Update environmental materials and lighting
    this.updateEnvironment(dt);

    // 3. Update rain streaks
    this.updateRain(dt, speed, vehicleHeading, cameraPosition, headlightsActive);

    // 4. Update snowflakes
    this.updateSnow(dt, speed, vehicleHeading, cameraPosition);

    // 5. Update tire spray on wet asphalt
    this.updateTireSpray(dt, speed, vehicleHeading, playerPosition);
  }

  private updateEnvironment(dt: number): void {
    // ── Wet Asphalt Simulation ──
    // Wet road becomes dark, glossy, and highly specular
    const baseRoughness = 0.96;
    const wetRoughness = this.stormIntensity > 0.25 ? 0.18 : 0.26;
    const targetRoughness = baseRoughness - this.wetness * (baseRoughness - wetRoughness);
    this.roadMaterial.roughness = damp(this.roadMaterial.roughness, targetRoughness, 2.5, dt);

    const baseMetalness = 0.02;
    const wetMetalness = this.stormIntensity > 0.25 ? 0.35 : 0.22;
    const targetMetalness = baseMetalness + this.wetness * (wetMetalness - baseMetalness);
    this.roadMaterial.metalness = damp(this.roadMaterial.metalness, targetMetalness, 2.5, dt);

    // Preserve road surface luminance; wetness is conveyed through specular shine and lowered roughness
    const roadDarken = 1.0 - this.wetness * 0.05;
    this.roadMaterial.color.setRGB(roadDarken, roadDarken, roadDarken);

    // Shoulder wetness
    this.shoulderMaterial.roughness = damp(
      this.shoulderMaterial.roughness,
      0.96 - this.wetness * 0.55,
      2.0,
      dt,
    );

    // Ground snow layer accumulation
    const groundSnowMat = this.groundSnow.material as THREE.MeshStandardMaterial;
    if (groundSnowMat) {
      const targetSnowOpacity = this.snowAccumulation * 0.82;
      groundSnowMat.opacity = damp(groundSnowMat.opacity, targetSnowOpacity, 1.5, dt);
      this.groundSnow.visible = groundSnowMat.opacity > 0.01;
    }

    // ── Atmospheric Lighting & Sky Color ──
    const bg = this.scene.background as THREE.Color;
    const fog = this.scene.fog as THREE.FogExp2;

    // Blend sky color across all climates
    this.workingColor.copy(this.clearSkyColor);
    if (this.fogIntensity > 0.001) {
      this.workingColor.lerp(this.fogSkyColor, this.fogIntensity);
    }
    if (this.rainIntensity > 0.001) {
      this.workingColor.lerp(this.rainSkyColor, this.rainIntensity);
    }
    if (this.stormIntensity > 0.001) {
      this.workingColor.lerp(this.stormSkyColor, this.stormIntensity);
    }
    if (this.snowIntensity > 0.001) {
      this.workingColor.lerp(this.snowSkyColor, this.snowIntensity);
    }
    bg.lerp(this.workingColor, 1.8 * dt);
    fog.color.lerp(this.workingColor, 1.8 * dt);

    // Atmospheric Fog density:
    // Clear = 0.0025, Rain = 0.0033 (gentle mist), Storm = 0.0048, Snow = 0.0038, Fog = 0.0175
    const targetFogDensity =
      0.0025 +
      this.rainIntensity * 0.0008 +
      this.stormIntensity * 0.0023 +
      this.snowIntensity * 0.0013 +
      this.fogIntensity * 0.015;
    fog.density = damp(fog.density, targetFogDensity, 1.5, dt);

    // Directional Sun Light:
    const sun = this.lighting.sun;
    const targetSunIntensity =
      3.2 *
      (1.0 - this.rainIntensity * 0.2) *
      (1.0 - this.stormIntensity * 0.45) *
      (1.0 - this.snowIntensity * 0.25) *
      (1.0 - this.fogIntensity * 0.4);
    sun.intensity = damp(sun.intensity, targetSunIntensity, 2.0, dt);

    this.workingColor.copy(this.clearSunColor);
    if (this.fogIntensity > 0.001) {
      this.workingColor.lerp(this.fogSunColor, this.fogIntensity);
    }
    if (this.rainIntensity > 0.001) {
      this.workingColor.lerp(this.rainSunColor, this.rainIntensity);
    }
    if (this.stormIntensity > 0.001) {
      this.workingColor.lerp(this.stormSunColor, this.stormIntensity);
    }
    if (this.snowIntensity > 0.001) {
      this.workingColor.lerp(this.snowSunColor, this.snowIntensity);
    }
    sun.color.lerp(this.workingColor, 2.0 * dt);

    // Hemisphere Light:
    const hemi = this.lighting.hemisphere;
    const targetHemiIntensity =
      1.55 *
      (1.0 - this.rainIntensity * 0.12) *
      (1.0 - this.stormIntensity * 0.3) *
      (1.0 - this.snowIntensity * 0.05) *
      (1.0 - this.fogIntensity * 0.25);
    hemi.intensity = damp(hemi.intensity, targetHemiIntensity, 2.0, dt);

    // Apply lightning flash illumination burst
    if (this.lightningFlash > 0.01) {
      sun.intensity += this.lightningFlash * 6.5;
      hemi.intensity += this.lightningFlash * 3.0;
      sun.color.lerp(new THREE.Color(0xdce5ff), this.lightningFlash);
      bg.lerp(new THREE.Color(0x758aa0), this.lightningFlash * 0.7);
      fog.color.lerp(new THREE.Color(0x758aa0), this.lightningFlash * 0.7);
      this.roadMaterial.roughness = Math.max(
        0.14,
        this.roadMaterial.roughness - this.lightningFlash * 0.15,
      );
      this.roadMaterial.metalness = Math.min(
        0.55,
        this.roadMaterial.metalness + this.lightningFlash * 0.35,
      );
    }

    this.workingColor.copy(this.clearHemiSky);
    if (this.fogIntensity > 0.001) {
      this.workingColor.lerp(this.fogHemiSky, this.fogIntensity);
    }
    if (this.rainIntensity > 0.001) {
      this.workingColor.lerp(this.rainHemiSky, this.rainIntensity);
    }
    if (this.stormIntensity > 0.001) {
      this.workingColor.lerp(this.stormHemiSky, this.stormIntensity);
    }
    if (this.snowIntensity > 0.001) {
      this.workingColor.lerp(this.snowHemiSky, this.snowIntensity);
    }
    hemi.color.lerp(this.workingColor, 2.0 * dt);

    this.workingColor.copy(this.clearHemiGround);
    if (this.fogIntensity > 0.001) {
      this.workingColor.lerp(this.fogHemiGround, this.fogIntensity);
    }
    if (this.rainIntensity > 0.001) {
      this.workingColor.lerp(this.rainHemiGround, this.rainIntensity);
    }
    if (this.stormIntensity > 0.001) {
      this.workingColor.lerp(this.stormHemiGround, this.stormIntensity);
    }
    if (this.snowIntensity > 0.001) {
      this.workingColor.lerp(this.snowHemiGround, this.snowIntensity);
    }
    hemi.groundColor.lerp(this.workingColor, 2.0 * dt);
  }

  private updateRain(
    dt: number,
    speed: number,
    vehicleHeading: number,
    cameraPosition: THREE.Vector3,
    headlightsActive = true,
  ): void {
    if (!this.rainLines || !this.rainPositions || !this.rainDropBase || !this.rainDropSpeeds)
      return;

    const mat = this.rainLines.material as THREE.LineBasicMaterial;
    mat.opacity = this.rainIntensity * 0.78;

    if (mat.opacity < 0.01) {
      this.rainLines.visible = false;
      return;
    }
    this.rainLines.visible = true;

    // Anchor the rain system at camera position, aligned with vehicle heading
    this.rainLines.position.copy(cameraPosition);
    this.rainLines.rotation.y = vehicleHeading;

    const base = this.rainDropBase;
    const speeds = this.rainDropSpeeds;
    const pos = this.rainPositions;
    const cols = this.rainColors;

    // Wind oscillation in local coordinates
    const windX = Math.sin(this.elapsedTime * 0.8) * 2.2 - 2.0; // slight left gust
    const windZ = 1.0;

    // Trail persistence time (seconds). At high speeds, streaks stretch longer.
    const trailTime = 0.016 + Math.min(speed, 65) * 0.0003;

    // Relative speed forward: drops rush backward in local +Z direction
    const relSpeedZ = speed + windZ;

    for (let i = 0; i < RAIN_COUNT; i++) {
      const i3 = i * 3;
      const i6 = i * 6;
      const fallSpeed = speeds[i];

      // Update head position relative to camera
      base[i3] += windX * dt;
      base[i3 + 1] -= fallSpeed * dt;
      base[i3 + 2] += relSpeedZ * dt;

      // Toroidal volume wrapping: guarantees continuous, uniform rain field
      if (base[i3 + 1] < MIN_Y) {
        base[i3 + 1] += VOL_HEIGHT;
        base[i3] = (Math.random() - 0.5) * VOL_WIDTH;
        base[i3 + 2] = (Math.random() - 0.5) * VOL_DEPTH;
      } else if (base[i3 + 1] > MAX_Y) {
        base[i3 + 1] -= VOL_HEIGHT;
      }
      if (base[i3] < -HALF_W) base[i3] += VOL_WIDTH;
      else if (base[i3] > HALF_W) base[i3] -= VOL_WIDTH;
      if (base[i3 + 2] < -HALF_D) base[i3 + 2] += VOL_DEPTH;
      else if (base[i3 + 2] > HALF_D) base[i3 + 2] -= VOL_DEPTH;

      const hx = base[i3];
      const hy = base[i3 + 1];
      const hz = base[i3 + 2];

      // Streak head
      pos[i6] = hx;
      pos[i6 + 1] = hy;
      pos[i6 + 2] = hz;

      // Streak tail slants along relative motion vector
      pos[i6 + 3] = hx - windX * trailTime;
      pos[i6 + 4] = hy + fallSpeed * trailTime;
      pos[i6 + 5] = hz - relSpeedZ * trailTime;

      // Headlight cone boost:
      // In front of the car: z in [-22, -1], |x| < 4.5, y in [-1, 2.5]
      if (cols) {
        if (headlightsActive && hz < -1 && hz > -22 && Math.abs(hx) < 4.5 && hy > -1 && hy < 2.5) {
          // Drops illuminated by headlights shine brilliant white
          cols[i6] = 1.0;
          cols[i6 + 1] = 1.0;
          cols[i6 + 2] = 1.0;
          cols[i6 + 3] = 0.55;
          cols[i6 + 4] = 0.75;
          cols[i6 + 5] = 0.95;
        } else {
          // Ambient stormy raindrops
          cols[i6] = 0.82;
          cols[i6 + 1] = 0.92;
          cols[i6 + 2] = 1.0;
          cols[i6 + 3] = 0.32;
          cols[i6 + 4] = 0.52;
          cols[i6 + 5] = 0.82;
        }
      }
    }

    const posAttr = this.rainLines.geometry.getAttribute('position') as THREE.BufferAttribute;
    posAttr.needsUpdate = true;
    if (cols) {
      const colAttr = this.rainLines.geometry.getAttribute('color') as THREE.BufferAttribute;
      colAttr.needsUpdate = true;
    }
  }

  private updateSnow(
    dt: number,
    speed: number,
    vehicleHeading: number,
    cameraPosition: THREE.Vector3,
  ): void {
    if (!this.snowPoints || !this.snowPositions || !this.snowPhases || !this.snowSpeeds) return;

    const mat = this.snowPoints.material as THREE.PointsMaterial;
    mat.opacity = this.snowIntensity * 0.88;

    if (mat.opacity < 0.01) {
      this.snowPoints.visible = false;
      return;
    }
    this.snowPoints.visible = true;

    this.snowPoints.position.copy(cameraPosition);
    this.snowPoints.rotation.y = vehicleHeading;

    const pos = this.snowPositions;
    const phases = this.snowPhases;
    const speeds = this.snowSpeeds;
    const time = this.elapsedTime;

    // Aerodynamic slipstream: flakes are light and pushed gently around car
    const relativeCarPushZ = speed * 0.38;

    for (let i = 0; i < SNOW_COUNT; i++) {
      const i3 = i * 3;
      const phase = phases[i * 2];
      const amp = phases[i * 2 + 1];
      const fallSpeed = speeds[i];

      // Gentle horizontal flutter & swirl
      const flutterX = Math.sin(time * 1.8 + phase) * amp;
      const flutterZ = Math.cos(time * 1.3 + phase) * (amp * 0.6);

      pos[i3] += flutterX * dt;
      pos[i3 + 1] -= fallSpeed * dt;
      pos[i3 + 2] += (relativeCarPushZ + flutterZ) * dt;

      // Toroidal volume wrapping
      if (pos[i3 + 1] < MIN_Y) {
        pos[i3 + 1] += VOL_HEIGHT;
        pos[i3] = (Math.random() - 0.5) * VOL_WIDTH;
        pos[i3 + 2] = (Math.random() - 0.5) * VOL_DEPTH;
      } else if (pos[i3 + 1] > MAX_Y) {
        pos[i3 + 1] -= VOL_HEIGHT;
      }
      if (pos[i3] < -HALF_W) pos[i3] += VOL_WIDTH;
      else if (pos[i3] > HALF_W) pos[i3] -= VOL_WIDTH;
      if (pos[i3 + 2] < -HALF_D) pos[i3 + 2] += VOL_DEPTH;
      else if (pos[i3 + 2] > HALF_D) pos[i3 + 2] -= VOL_DEPTH;
    }

    const posAttr = this.snowPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
    posAttr.needsUpdate = true;
  }

  private updateTireSpray(
    dt: number,
    speed: number,
    vehicleHeading: number,
    playerPosition: THREE.Vector3,
  ): void {
    if (!this.sprayPoints || !this.sprayPositions || !this.sprayVelocities || !this.sprayLifetimes)
      return;

    // Spray occurs on wet roads (water mist) and snowy roads (snow flurries)
    const inRain = this.wetness > 0.18;
    const inSnow = this.snowAccumulation > 0.15;
    const canSpray = (inRain || inSnow) && speed > 5.0;
    const mat = this.sprayPoints.material as THREE.PointsMaterial;

    if (!canSpray) {
      this.sprayPoints.visible = false;
      return;
    }
    this.sprayPoints.visible = true;

    if (inSnow && !inRain) {
      mat.color.setRGB(0.96, 0.98, 1.0);
      mat.opacity = Math.min(0.52, this.snowAccumulation * 0.5);
    } else {
      mat.color.setRGB(0.72, 0.84, 0.95);
      mat.opacity = Math.min(0.38, this.wetness * 0.42);
    }

    const pos = this.sprayPositions;
    const vel = this.sprayVelocities;
    const life = this.sprayLifetimes;

    const cosH = Math.cos(vehicleHeading);
    const sinH = Math.sin(vehicleHeading);

    // Left and right rear tire offsets relative to player car center
    const tireOffsets = [
      { x: -0.85, y: 0.15, z: 1.8 },
      { x: 0.85, y: 0.15, z: 1.8 },
    ];

    for (let i = 0; i < SPRAY_COUNT; i++) {
      const i3 = i * 3;
      life[i] += dt * 3.2; // ~0.3s particle lifespan

      if (life[i] >= 1.0) {
        // Respawn behind rear tire
        life[i] = 0.0;
        const tire = tireOffsets[i % 2];
        const worldX = playerPosition.x + (cosH * tire.x - sinH * tire.z);
        const worldZ = playerPosition.z + (sinH * tire.x + cosH * tire.z);

        pos[i3] = worldX + (Math.random() - 0.5) * 0.25;
        pos[i3 + 1] = tire.y + Math.random() * 0.1;
        pos[i3 + 2] = worldZ + (Math.random() - 0.5) * 0.25;

        // Backward and upward spray velocity
        const backSpeed = speed * (0.3 + Math.random() * 0.3);
        vel[i3] = -sinH * backSpeed + (Math.random() - 0.5) * 1.5;
        vel[i3 + 1] = 0.6 + Math.random() * 1.2; // upward rooster-tail
        vel[i3 + 2] = cosH * backSpeed + (Math.random() - 0.5) * 1.5;
      } else {
        // Advance spray particle
        pos[i3] += vel[i3] * dt;
        pos[i3 + 1] += vel[i3 + 1] * dt;
        pos[i3 + 2] += vel[i3 + 2] * dt;
        vel[i3 + 1] -= 2.5 * dt; // gravity deceleration
      }
    }

    const posAttr = this.sprayPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
    posAttr.needsUpdate = true;
  }

  dispose(): void {
    if (this.rainLines) {
      this.scene.remove(this.rainLines);
      this.rainLines.geometry.dispose();
      (this.rainLines.material as THREE.Material).dispose();
    }
    if (this.snowPoints) {
      this.scene.remove(this.snowPoints);
      this.snowPoints.geometry.dispose();
      const mat = this.snowPoints.material as THREE.PointsMaterial;
      if (mat.map) mat.map.dispose();
      mat.dispose();
    }
    if (this.sprayPoints) {
      this.scene.remove(this.sprayPoints);
      this.sprayPoints.geometry.dispose();
      (this.sprayPoints.material as THREE.Material).dispose();
    }
  }
}
