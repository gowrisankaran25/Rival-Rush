import * as THREE from 'three';
import { PerformanceMonitor } from '../diagnostics/PerformanceMonitor';
import type { PerformanceSnapshot } from '../diagnostics/PerformanceMonitor';
import { GAME, laneOffsets } from './config';
import {
  clamp,
  constrainToRoad,
  curveSpeedLimit,
  damp,
  progressiveSteering,
  proceduralTrack,
  roadCenter,
  roadCurvature,
  roadElevation,
  roadHeading,
  roadPitch,
  speedSensitiveSteering,
} from './math';
import { createHighwayRoadTexture, createRoadStrip, updateRoadStrip } from './roadSurface';
import { AdaptiveQuality, chooseInitialQuality } from './rendering/AdaptiveQuality';
import type { GraphicsQualityMode, RenderQualitySettings } from './rendering/AdaptiveQuality';
import { SceneryAssets } from './sceneryAssets';
import { createSpeedPlan, scanTraffic } from './simulation/drivingAssist';
import {
  addSceneLighting,
  createCloudTexture,
  createSnowPatchTexture,
  SurfaceTextureStore,
  updateSceneShadow,
} from './sceneAssets';
import type { SceneLighting } from './sceneAssets';
import type {
  ControlInput,
  GamePhase,
  GameSnapshot,
  HeadlightMode,
  RadarBlip,
  RadarRoadNode,
  RadarTelemetry,
  RaceResult,
} from './types';
import { VehicleAssets } from './vehicleAssets';
import { DEFAULT_CAR_MODEL_ID, selectCarModelIds } from './vehicleCatalog';
import type { CarModelId } from './vehicleCatalog';
import { RoadsideFenceSystem } from './world/RoadsideFenceSystem';
import { HighwayScenerySystem } from './world/HighwayScenerySystem';
import { FinishLineGantry } from './world/FinishLineGantry';
import type { RaceModeConfig } from './progression/raceModes';
import { WeatherSystem } from './weather/WeatherSystem';
import type { WeatherMode, WeatherType } from './weather/WeatherSystem';
import { WindshieldWeatherOverlay } from '../ui/WindshieldWeatherOverlay';

interface TrafficCar {
  mesh: THREE.Group;
  distance: number;
  lane: number;
  laneOffset: number;
  speed: number;
  targetSpeed: number;
  speedChangeTimer: number;
  direction: 1 | -1;
  counted: boolean;
  horned: boolean;
  isRival?: boolean;
}

interface Interactable {
  mesh: THREE.Mesh;
  type: 'coin' | 'nitro' | 'roadblock';
  distance: number;
  lane: number;
  laneOffset: number;
  active: boolean;
  rotationY: number;
}

interface VehicleLightRig {
  headLenses: THREE.Mesh[];
  headFlares: THREE.Mesh[];
  tailLenses: THREE.Mesh[];
  tailFlares: THREE.Mesh[];
}

let sharedLightFlareTexture: THREE.CanvasTexture | undefined;

function getLightFlareTexture(): THREE.CanvasTexture {
  if (sharedLightFlareTexture) return sharedLightFlareTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.25, 'rgba(255, 255, 255, 0.85)');
    grad.addColorStop(0.6, 'rgba(255, 255, 255, 0.3)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
  }
  sharedLightFlareTexture = new THREE.CanvasTexture(canvas);
  return sharedLightFlareTexture;
}

function createHeadlightBeamTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  ctx.clearRect(0, 0, 512, 512);

  // Left headlight beam cone
  const gradLeft = ctx.createRadialGradient(190, 70, 10, 190, 180, 290);
  gradLeft.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
  gradLeft.addColorStop(0.2, 'rgba(240, 248, 255, 0.80)');
  gradLeft.addColorStop(0.5, 'rgba(210, 235, 255, 0.40)');
  gradLeft.addColorStop(0.8, 'rgba(170, 210, 255, 0.14)');
  gradLeft.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = gradLeft;
  ctx.beginPath();
  ctx.ellipse(190, 200, 160, 260, 0, 0, Math.PI * 2);
  ctx.fill();

  // Right headlight beam cone
  const gradRight = ctx.createRadialGradient(322, 70, 10, 322, 180, 290);
  gradRight.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
  gradRight.addColorStop(0.2, 'rgba(240, 248, 255, 0.80)');
  gradRight.addColorStop(0.5, 'rgba(210, 235, 255, 0.40)');
  gradRight.addColorStop(0.8, 'rgba(170, 210, 255, 0.14)');
  gradRight.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = gradRight;
  ctx.beginPath();
  ctx.ellipse(322, 200, 160, 260, 0, 0, Math.PI * 2);
  ctx.fill();

  // Smooth longitudinal falloff mask
  ctx.globalCompositeOperation = 'destination-in';
  const longFade = ctx.createLinearGradient(0, 0, 0, 512);
  longFade.addColorStop(0, 'rgba(0, 0, 0, 0.05)');
  longFade.addColorStop(0.08, 'rgba(0, 0, 0, 1.0)');
  longFade.addColorStop(0.45, 'rgba(0, 0, 0, 0.95)');
  longFade.addColorStop(0.85, 'rgba(0, 0, 0, 0.35)');
  longFade.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = longFade;
  ctx.fillRect(0, 0, 512, 512);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function createHeadlightRoadBeam(): THREE.Mesh {
  const nearZ = -3.5;
  const farZ = -58.0;
  const nearHalfW = 1.35;
  const farHalfW = 7.2;

  const positions = new Float32Array([
    -nearHalfW,
    0,
    nearZ,
    nearHalfW,
    0,
    nearZ,
    farHalfW,
    0,
    farZ,
    -farHalfW,
    0,
    farZ,
  ]);
  const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
  const indices = [0, 1, 2, 0, 2, 3];

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);

  const texture = createHeadlightBeamTexture();
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.7,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 2;
  return mesh;
}

const GROUND_SIZE = 1200;
const GRASS_TEXTURE_REPEAT = 30;
const GRASS_TILE_METERS = GROUND_SIZE / GRASS_TEXTURE_REPEAT;
const SNOW_TEXTURE_REPEAT = 12;
const SNOW_TILE_METERS = GROUND_SIZE / SNOW_TEXTURE_REPEAT;
const ROAD_UPDATE_INTERVAL = 1 / 30;
const IDLE_RENDER_INTERVAL_MS = 200;

// ── Camera Modes & Perspective Configurations ──
export interface CameraModeConfig {
  id: number;
  name: string;
  label: string;
  camBack: number;
  camHeight: number;
  lookAhead: number;
  lookHeight: number;
  showCar: boolean;
}

const DRIVER_EYE_HEIGHT = 1.22; // Realistic driver eye height above road (meters)
const DRIVER_FORWARD_OFFSET = 0.55; // Forward position at driver's windshield eyeline
const ROAD_LOOK_AHEAD = 36.0; // Distance forward down the road
const ROAD_LOOK_HEIGHT = 1.16; // Horizon-level target height
const BASE_FOV = 72; // Wide FOV for immersion
const NITRO_FOV = 96; // Extreme FOV on nitro
const MAX_SHAKE_INTENSITY = 0.024; // Subtle, stable road vibration
const MAX_ROLL_ANGLE = 0.038; // Subtle body roll on steering turns
const SPEED_LINE_COUNT = 120; // Number of speed-line particles

export const CAMERA_CONFIGS: readonly CameraModeConfig[] = [
  {
    id: 0,
    name: 'FRONT ROAD',
    label: 'FRONT ROAD (FIRST PERSON)',
    camBack: -DRIVER_FORWARD_OFFSET,
    camHeight: DRIVER_EYE_HEIGHT,
    lookAhead: ROAD_LOOK_AHEAD,
    lookHeight: ROAD_LOOK_HEIGHT,
    showCar: false,
  },
  {
    id: 1,
    name: 'CHASE',
    label: 'CHASE (THIRD PERSON)',
    camBack: 6.2,
    camHeight: 2.35,
    lookAhead: 15.0,
    lookHeight: 1.35,
    showCar: true,
  },
  {
    id: 2,
    name: 'FAR CHASE',
    label: 'FAR CHASE (AERIAL)',
    camBack: 11.5,
    camHeight: 4.2,
    lookAhead: 19.0,
    lookHeight: 1.6,
    showCar: true,
  },
  {
    id: 3,
    name: 'HOOD',
    label: 'HOOD (BONNET MOUNT)',
    camBack: -0.55,
    camHeight: 1.05,
    lookAhead: 34.0,
    lookHeight: 1.0,
    showCar: false,
  },
  {
    id: 4,
    name: 'BUMPER',
    label: 'BUMPER (LOW ROAD)',
    camBack: -1.6,
    camHeight: 0.58,
    lookAhead: 36.0,
    lookHeight: 0.75,
    showCar: false,
  },
];

// ── Sequential Gearbox Specifications ──
export interface GearSpec {
  gear: number;
  label: string;
  name: string;
  maxSpeedKph: number;
  maxSpeedMs: number;
  accelMultiplier: number;
}

export const GEAR_SPECS: readonly GearSpec[] = [
  {
    gear: 1,
    label: '1ST',
    name: 'GEAR 1 · CITY',
    maxSpeedKph: 60,
    maxSpeedMs: 16.7,
    accelMultiplier: 1.4,
  },
  {
    gear: 2,
    label: '2ND',
    name: 'GEAR 2 · CRUISE',
    maxSpeedKph: 100,
    maxSpeedMs: 27.8,
    accelMultiplier: 1.25,
  },
  {
    gear: 3,
    label: '3RD',
    name: 'GEAR 3 · DRIVE',
    maxSpeedKph: 140,
    maxSpeedMs: 38.9,
    accelMultiplier: 1.1,
  },
  {
    gear: 4,
    label: '4TH',
    name: 'GEAR 4 · SPORT',
    maxSpeedKph: 180,
    maxSpeedMs: 50.0,
    accelMultiplier: 1.25,
  },
  {
    gear: 5,
    label: '5TH',
    name: 'GEAR 5 · SUPER',
    maxSpeedKph: 220,
    maxSpeedMs: 61.1,
    accelMultiplier: 1.4,
  },
  {
    gear: 6,
    label: '6TH',
    name: 'GEAR 6 · HYPER',
    maxSpeedKph: 260,
    maxSpeedMs: 72.2,
    accelMultiplier: 1.6,
  },
];

export class DrivingGame {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 800);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly performanceMonitor = new PerformanceMonitor();
  private readonly adaptiveQuality: AdaptiveQuality;
  private readonly clock = new THREE.Clock();
  private readonly vehicleAssets = new VehicleAssets();
  private readonly player = new THREE.Group();
  private readonly traffic: TrafficCar[] = [];
  private readonly highwayScenery: HighwayScenerySystem;
  private readonly mountains: THREE.Group[] = [];
  private readonly clouds: THREE.Sprite[] = [];
  private readonly lighting: SceneLighting;
  private readonly textureStore: SurfaceTextureStore;
  private readonly sceneryAssets: SceneryAssets;
  private readonly sceneAssetsReady: Promise<void>;
  private readonly roadsideFences: RoadsideFenceSystem;
  private readonly roadGeometry: THREE.BufferGeometry;
  private readonly roadMesh: THREE.Mesh;
  private readonly shoulderGeometry: THREE.BufferGeometry;
  private readonly shoulderMesh: THREE.Mesh;
  private readonly ground: THREE.Mesh;
  private readonly groundSnow: THREE.Mesh;
  private readonly forward = new THREE.Vector3();
  private readonly shadowCenter = new THREE.Vector3();
  private readonly desiredCamera = new THREE.Vector3();
  private readonly cameraTarget = new THREE.Vector3();
  private phase: GamePhase = 'ready';
  private distance = 0;
  private speed = 0;
  private lateral: number = laneOffsets[1];
  private worldX = roadCenter(0) + Math.cos(roadHeading(0)) * laneOffsets[1];
  private vehicleHeading = roadHeading(0);
  private steeringVisual = 0;
  private overtakes = 0;
  private assistMessage = 'READY';
  private hornCooldown = 0;
  private driverCar: CarModelId = DEFAULT_CAR_MODEL_ID;
  private driverColor?: number;
  private health = 100;
  private collisionCooldown = 0;
  private interactables: Interactable[] = [];
  private bonusScore = 0;
  private nitroTimer = 0;
  private carModelsApplied = false;
  private currentAppliedCarId: CarModelId | null = null;
  private currentAppliedColor: number | undefined = undefined;
  private sceneAssetsLoaded = false;
  private lastSnapshot = 0;
  private lastIdleRender = 0;
  private roadUpdateElapsed = Number.POSITIVE_INFINITY;
  private lastRoadUpdateDistance = Number.NaN;
  private animationFrame = 0;
  private performanceMonitoring = false;
  private graphicsQualityMode: GraphicsQualityMode = 'auto';
  private pendingRenderQuality?: RenderQualitySettings;

  // ── Immersive cockpit state ──
  private cameraRoll = 0;
  private cameraShakeOffset = new THREE.Vector3();
  private speedLineParticles?: THREE.LineSegments;
  private speedLinePositions?: Float32Array;
  private speedLineVelocities?: Float32Array;
  private currentFov = BASE_FOV;
  private cameraMode = 0; // 0: Cockpit, 1: Hood, 2: Chase
  private currentGear = 3; // Default 3rd gear (Drive / Highway Cruise)
  private gearShiftCooldown = 0;
  private gearShiftSurge = 0;
  private tireSlip = 0;
  private headlightMode: HeadlightMode = 'auto';
  private isPlayerBraking = false;

  // ── Dynamic Weather ──
  private readonly weatherSystem: WeatherSystem;
  private readonly windshieldOverlay: WindshieldWeatherOverlay;
  private readonly headlightBeam: THREE.Mesh;

  // ── Finish Line & Race State Management ──
  private readonly finishLine: FinishLineGantry;
  private raceModeConfig: RaceModeConfig | null = null;
  private currentRaceMode = 'endless';
  private finishDistance: number | null = null;
  private timeLimitSeconds: number | null = null;
  private raceTimeSeconds = 0;
  private countdownTimer = 0;
  private countdownValue: number | null = null;
  private lastBeepValue: number | null = null;
  private approachWarning: string | null = null;
  private finishResultEmitted = false;
  private finishEaseTimer = 0;
  private isFinishingSequence = false;
  private hasRival = false;
  private rivalCar: TrafficCar | null = null;
  private onFinishCallback?: (result: RaceResult) => void;
  private onCountdownBeepCallback?: (isGo: boolean) => void;
  private currentControl: ControlInput = { steering: 0, confidence: 1, active: false };

  // ── Showroom 3D Turntable & Inspection ──
  private isShowroomMode = false;
  private showroomOrbitAngle = -0.6;
  private showroomOrbitDistance = 5.4;
  private showroomOrbitHeight = 1.35;
  private isShowroomDragging = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly getControl: () => ControlInput,
    private readonly onUpdate: (snapshot: GameSnapshot) => void,
    private readonly onCrash: () => void,
    private readonly onHorn: () => void,
    private readonly onPerformanceUpdate: (snapshot: PerformanceSnapshot) => void,
    private readonly onGearShift?: (gear: number, direction: 1 | -1) => void,
  ) {
    this.scene.background = new THREE.Color(0x9bb8bd);
    this.scene.fog = new THREE.FogExp2(0x9bb8bd, 0.0025);

    const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    this.adaptiveQuality = new AdaptiveQuality(
      chooseInitialQuality(navigator.hardwareConcurrency || 2, deviceMemory),
    );
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, this.adaptiveQuality.settings.pixelRatioCap),
    );
    this.renderer.setSize(container.clientWidth, container.clientHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.textureStore = new SurfaceTextureStore(this.renderer.capabilities.getMaxAnisotropy());

    const roadTexture = createHighwayRoadTexture(this.renderer.capabilities.getMaxAnisotropy());
    this.textureStore.track(roadTexture);

    const roadMaterial = this.textureStore.createMaterial(
      '',
      'RoadLines_normal.png',
      'RoadLines_metallicRoughness.png',
      {
        textureRoot: 'roads/textures',
        normalScale: 0.34,
        tint: 0xffffff,
        customMap: roadTexture,
      },
    );
    const shoulderMaterial = this.textureStore.createMaterial(
      'Sidewalk01_baseColor.jpeg',
      'Sidewalk01_normal.png',
      'Sidewalk01_metallicRoughness.png',
      {
        textureRoot: 'roads/textures',
        normalScale: 0.38,
        tint: 0xffffff,
      },
    );
    const groundMaterial = this.textureStore.createMaterial(
      'Grass02_baseColor.jpeg',
      'Grass02_normal.png',
      'Grass02_metallicRoughness.png',
      {
        textureRoot: 'roads/textures',
        repeatX: GRASS_TEXTURE_REPEAT,
        repeatY: GRASS_TEXTURE_REPEAT,
        normalScale: 0.34,
        tint: 0xffffff,
      },
    );
    const rockMaterial = new THREE.MeshStandardMaterial({
      color: 0x77736b,
      roughness: 0.94,
      metalness: 0.02,
    });
    this.sceneryAssets = new SceneryAssets(rockMaterial);

    this.roadGeometry = createRoadStrip(GAME.roadWidth, 260, 0, 1, 12);
    this.roadMesh = new THREE.Mesh(this.roadGeometry, roadMaterial);
    this.roadMesh.receiveShadow = true;
    this.scene.add(this.roadMesh);

    this.shoulderGeometry = createRoadStrip(
      GAME.roadWidth + 7.5,
      260,
      0,
      Math.max(1, (GAME.roadWidth + 7.5) / 9),
      12,
    );
    this.shoulderGeometry.userData.isShoulder = true;
    this.shoulderMesh = new THREE.Mesh(this.shoulderGeometry, shoulderMaterial);
    this.shoulderMesh.position.y = 0;
    this.shoulderMesh.receiveShadow = true;
    this.scene.add(this.shoulderMesh);

    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE), groundMaterial);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.09;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    const groundSnowTexture = createSnowPatchTexture(0xb7e134);
    groundSnowTexture.repeat.set(SNOW_TEXTURE_REPEAT, SNOW_TEXTURE_REPEAT);
    groundSnowTexture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    this.textureStore.track(groundSnowTexture);
    this.groundSnow = new THREE.Mesh(
      this.ground.geometry,
      new THREE.MeshStandardMaterial({
        color: 0xe6edef,
        map: groundSnowTexture,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        roughness: 1,
        metalness: 0,
        side: THREE.DoubleSide,
      }),
    );
    this.groundSnow.rotation.x = -Math.PI / 2;
    this.groundSnow.position.y = -0.075;
    this.groundSnow.receiveShadow = true;
    this.groundSnow.renderOrder = 1;
    this.groundSnow.visible = false;
    this.scene.add(this.groundSnow);

    this.roadsideFences = new RoadsideFenceSystem(this.scene);
    this.highwayScenery = new HighwayScenerySystem(this.scene, this.sceneryAssets);

    this.lighting = addSceneLighting(this.scene, this.adaptiveQuality.settings.shadowMapSize);

    this.weatherSystem = new WeatherSystem({
      scene: this.scene,
      lighting: this.lighting,
      roadMaterial,
      shoulderMaterial,
      groundSnow: this.groundSnow,
    });
    this.windshieldOverlay = new WindshieldWeatherOverlay({ container });

    this.setupWorld();
    this.setupInteractables();
    this.finishLine = new FinishLineGantry(this.scene);
    const natureReady = this.sceneryAssets.loadNature(this.highwayScenery.getNatureTargets());
    const mountainsReady = this.sceneryAssets.loadMountains(this.mountains);
    this.sceneAssetsReady = Promise.all([
      this.textureStore.whenReady(),
      natureReady,
      mountainsReady,
    ]).then(() => {
      this.sceneAssetsLoaded = true;
    });

    this.player.visible = false;
    this.scene.add(this.player);

    this.headlightBeam = createHeadlightRoadBeam();
    this.scene.add(this.headlightBeam);

    // Initialize track geometry, camera, and player position at distance 0
    this.reset();

    // ── Speed-line particle system for immersive rushing feel ──
    this.initSpeedLines();

    this.resize();
    window.addEventListener('resize', this.resize);
    this.animationFrame = requestAnimationFrame(this.animate);
  }

  start(): void {
    if (!this.sceneAssetsLoaded || !this.carModelsApplied) {
      throw new Error('The game cannot start before all required assets load.');
    }
    this.setShowroomMode(false);
    this.reset();
    this.startCountdown();
  }

  setRaceMode(config: RaceModeConfig): void {
    this.raceModeConfig = config;
    this.currentRaceMode = config.id;
    this.finishDistance = config.distanceMeters;
    this.timeLimitSeconds = config.timeLimitSeconds;
    this.hasRival = config.hasRival;
    this.finishLine.setFinishDistance(this.finishDistance);

    this.setTrafficCount(config.defaultTrafficCount);

    if (this.hasRival && this.traffic.length > 0) {
      this.rivalCar = this.traffic[0];
      this.rivalCar.isRival = true;
      this.rivalCar.direction = 1;
      this.rivalCar.distance = this.distance + 42;
      this.rivalCar.speed = 46;
      this.rivalCar.targetSpeed = 58;
    } else {
      this.rivalCar = null;
      this.traffic.forEach((c) => {
        c.isRival = false;
      });
    }
  }

  setFinishCallback(cb: (result: RaceResult) => void): void {
    this.onFinishCallback = cb;
  }

  setCountdownCallback(cb: (isGo: boolean) => void): void {
    this.onCountdownBeepCallback = cb;
  }

  getRivalPosition(): number {
    if (!this.hasRival || !this.rivalCar) return 1;
    return this.distance >= this.rivalCar.distance ? 1 : 2;
  }

  getRaceModeConfig(): RaceModeConfig | null {
    return this.raceModeConfig;
  }

  startCountdown(): void {
    if (!this.sceneAssetsLoaded || !this.carModelsApplied) {
      throw new Error('The game cannot start before all required assets load.');
    }
    this.phase = 'countdown';
    this.countdownTimer = 1.6;
    this.countdownValue = 3;
    this.lastBeepValue = null;
    this.clock.getDelta();
  }

  restartRace(modeConfig?: RaceModeConfig): void {
    this.reset();
    if (modeConfig) {
      this.setRaceMode(modeConfig);
    }
    this.startCountdown();
  }

  toggleCameraAngle(): string {
    return this.cycleCameraMode();
  }

  cycleCameraMode(): string {
    this.cameraMode = (this.cameraMode + 1) % CAMERA_CONFIGS.length;
    const mode = CAMERA_CONFIGS[this.cameraMode];
    this.assistMessage = `CAM: ${mode.name} [C]`;
    if (this.phase === 'ready') this.setupInitialCamera();
    return mode.name;
  }

  setCameraMode(modeIndex: number): string {
    this.cameraMode = Math.max(0, Math.min(CAMERA_CONFIGS.length - 1, modeIndex));
    const mode = CAMERA_CONFIGS[this.cameraMode];
    this.assistMessage = `CAM: ${mode.name} [C]`;
    if (this.phase === 'ready') this.setupInitialCamera();
    return mode.name;
  }

  getCameraMode(): number {
    return this.cameraMode;
  }

  getCameraModeName(): string {
    return CAMERA_CONFIGS[this.cameraMode]?.name ?? 'FRONT ROAD';
  }

  setShowroomMode(active: boolean): void {
    this.isShowroomMode = active;
    if (active) {
      this.showroomOrbitAngle = -0.6;
      this.speed = 0;
    }
  }

  rotateShowroom(deltaX: number): void {
    this.showroomOrbitAngle -= deltaX * 0.007;
    this.isShowroomDragging = true;
  }

  endShowroomDrag(): void {
    this.isShowroomDragging = false;
  }

  shiftGear(direction: 1 | -1, force = false): number {
    if (!force && this.gearShiftCooldown > 0) {
      return this.currentGear;
    }
    const nextGear = Math.max(1, Math.min(GEAR_SPECS.length, this.currentGear + direction));
    if (nextGear !== this.currentGear) {
      this.gearShiftCooldown = 0.35;
      this.currentGear = nextGear;
      const spec = GEAR_SPECS[this.currentGear - 1];
      if (direction > 0) {
        this.assistMessage = `${spec.name} ▲ BOOST (${spec.maxSpeedKph} KM/H)`;
        this.gearShiftSurge = 0.08;
      } else {
        this.assistMessage = `${spec.name} ▼ BRAKE (${spec.maxSpeedKph} KM/H)`;
        this.gearShiftSurge = -0.04;
      }
      this.onGearShift?.(this.currentGear, direction);
    }
    return this.currentGear;
  }

  setGear(gear: number): number {
    const clamped = Math.max(1, Math.min(GEAR_SPECS.length, Math.round(gear)));
    if (clamped !== this.currentGear) {
      const direction = clamped > this.currentGear ? 1 : -1;
      this.currentGear = clamped;
      const spec = GEAR_SPECS[this.currentGear - 1];
      this.assistMessage = `${spec.name} (${spec.maxSpeedKph} KM/H)`;
      this.onGearShift?.(this.currentGear, direction);
    }
    return this.currentGear;
  }

  getCurrentGear(): number {
    return this.currentGear;
  }

  getGearSpec(): GearSpec {
    return GEAR_SPECS[this.currentGear - 1];
  }

  getWeatherType(): WeatherType {
    return this.weatherSystem.getWeatherType();
  }

  getWeatherMode(): WeatherMode {
    return this.weatherSystem.getMode();
  }

  setWeatherMode(mode: WeatherMode): void {
    this.weatherSystem.setMode(mode);
    this.refreshVehicleLighting();
  }

  cycleWeather(): WeatherMode {
    const nextMode = this.weatherSystem.cycleMode();
    const modeLabels: Record<WeatherMode, string> = {
      auto: 'DYNAMIC AUTO',
      clear: 'CLEAR SKIES',
      fog: 'MOUNTAIN FOG',
      rain: 'TORRENTIAL RAIN',
      storm: 'THUNDERSTORM',
      snow: 'WINTER BLIZZARD',
    };
    this.assistMessage = `WEATHER: ${modeLabels[nextMode]}`;
    this.refreshVehicleLighting();
    return nextMode;
  }

  getHeadlightMode(): HeadlightMode {
    return this.headlightMode;
  }

  isHeadlightsActive(): boolean {
    if (this.headlightMode === 'on') return true;
    if (this.headlightMode === 'off') return false;
    return (
      this.weatherSystem.getRainIntensity() > 0.04 ||
      this.weatherSystem.getStormIntensity() > 0.04 ||
      this.weatherSystem.getFogIntensity() > 0.04 ||
      this.weatherSystem.getSnowIntensity() > 0.12
    );
  }

  cycleHeadlightMode(): HeadlightMode {
    switch (this.headlightMode) {
      case 'auto':
        this.headlightMode = 'on';
        break;
      case 'on':
        this.headlightMode = 'off';
        break;
      case 'off':
        this.headlightMode = 'auto';
        break;
    }
    const modeLabels: Record<HeadlightMode, string> = {
      auto: 'LIGHTS: AUTO (CLIMATE-SENSITIVE)',
      on: 'LIGHTS: ON (ACTIVE BEAM)',
      off: 'LIGHTS: OFF',
    };
    this.assistMessage = modeLabels[this.headlightMode];
    this.refreshVehicleLighting();
    return this.headlightMode;
  }

  setHeadlightMode(mode: HeadlightMode): void {
    this.headlightMode = mode;
    this.refreshVehicleLighting();
  }

  private refreshVehicleLighting(): void {
    const active = this.isHeadlightsActive();
    this.updateVehicleHeadlights(this.player, active);
    this.setVehicleBrake(this.player, this.isPlayerBraking);
    this.headlightBeam.visible = active;
  }

  private updateVehicleHeadlights(carMesh: THREE.Group, active: boolean): void {
    const rig = carMesh.userData.lightRig as VehicleLightRig | undefined;
    if (!rig) return;
    for (const flare of rig.headFlares) {
      flare.visible = active;
      (flare.material as THREE.MeshBasicMaterial).opacity = active ? 0.88 : 0;
    }
    for (const lens of rig.headLenses) {
      (lens.material as THREE.MeshBasicMaterial).color.setHex(active ? 0xffffff : 0x3a4048);
    }
  }

  getRadarTelemetry(rangeMeters = 160): RadarTelemetry {
    const playerDistance = this.distance;
    const playerLateral = this.lateral;
    const playerSpeedKph = Math.round(this.speed * 3.6);
    const roadWidth = GAME.roadWidth;

    // Road curve nodes: sampled every 15 meters from 25m behind to rangeMeters ahead
    const roadNodes: RadarRoadNode[] = [];
    const step = 15;
    for (let rel = -25; rel <= rangeMeters + 15; rel += step) {
      const worldDist = playerDistance + rel;
      const curveOffset = roadCenter(worldDist) - roadCenter(playerDistance);
      roadNodes.push({
        relDistance: rel,
        curveOffset,
      });
    }

    // Collect radar blips for traffic and interactables
    const blips: RadarBlip[] = [
      {
        type: 'player',
        relDistance: 0,
        lateral: playerLateral,
        speedKph: playerSpeedKph,
      },
    ];

    for (const car of this.traffic) {
      const relDistance = car.distance - playerDistance;
      if (relDistance >= -30 && relDistance <= rangeMeters + 20) {
        const lateral = laneOffsets[car.lane] + car.laneOffset;
        blips.push({
          type: car.direction === 1 ? 'traffic-lead' : 'traffic-incoming',
          relDistance,
          lateral,
          speedKph: Math.round(car.speed * 3.6),
          isRival: car.isRival,
        });
      }
    }

    for (const item of this.interactables) {
      if (!item.active) continue;
      const relDistance = item.distance - playerDistance;
      if (relDistance >= -15 && relDistance <= rangeMeters + 20) {
        const lateral = laneOffsets[item.lane] + item.laneOffset;
        blips.push({
          type: item.type,
          relDistance,
          lateral,
        });
      }
    }

    // Detect upcoming turns in the next 120 meters
    let maxCurvature = 0;
    let peakDistance = 0;
    let turnHeadingDelta = 0;
    for (let ahead = 20; ahead <= 120; ahead += 10) {
      const c = roadCurvature(playerDistance + ahead);
      if (c > maxCurvature) {
        maxCurvature = c;
        peakDistance = ahead;
        const h0 = roadHeading(playerDistance);
        const h1 = roadHeading(playerDistance + ahead);
        turnHeadingDelta = Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0));
      }
    }

    let upcomingTurn: RadarTelemetry['upcomingTurn'] | undefined;
    if (maxCurvature > 0.0035) {
      const direction: 'left' | 'right' = turnHeadingDelta > 0 ? 'left' : 'right';
      const severity: 'gentle' | 'sharp' | 'hairpin' =
        maxCurvature > 0.009 ? 'hairpin' : maxCurvature > 0.0055 ? 'sharp' : 'gentle';
      upcomingTurn = {
        direction,
        severity,
        distanceMeters: Math.round(peakDistance),
      };
    }

    return {
      playerDistance,
      playerLateral,
      playerSpeedKph,
      roadWidth,
      blips,
      roadNodes,
      upcomingTurn,
      roadCondition: this.weatherSystem.getRoadCondition(playerSpeedKph, this.tireSlip),
      headlightsActive: this.isHeadlightsActive(),
    };
  }

  pause(): void {
    if (this.phase === 'playing') {
      this.phase = 'paused';
      this.assistMessage = 'PAUSED';
    }
  }

  resume(): void {
    if (this.phase === 'paused') {
      this.phase = 'playing';
      this.clock.getDelta();
    }
  }

  reset(): void {
    // 1. Reset track and scenery FIRST so roadCenter(0) and roadHeading(0) are accurate
    proceduralTrack.reset();
    this.highwayScenery.reset();
    this.finishDistance = this.raceModeConfig?.distanceMeters ?? null;
    this.timeLimitSeconds = this.raceModeConfig?.timeLimitSeconds ?? null;
    this.hasRival = this.raceModeConfig?.hasRival ?? false;
    this.finishLine.setFinishDistance(this.finishDistance);

    // 2. Position player in the exact center lane of the road at distance 0
    this.distance = 0;
    this.speed = 0;
    this.health = 100;
    this.collisionCooldown = 0;
    this.bonusScore = 0;
    this.nitroTimer = 0;
    this.overtakes = 0;
    this.assistMessage = 'READY';
    this.hornCooldown = 0;
    this.phase = 'ready';
    this.currentGear = 1;
    this.gearShiftCooldown = 0;
    this.gearShiftSurge = 0;
    this.steeringVisual = 0;
    this.cameraRoll = 0;
    this.tireSlip = 0;
    this.isFinishingSequence = false;
    this.finishResultEmitted = false;
    this.finishEaseTimer = 0;
    this.countdownValue = null;
    this.lastBeepValue = null;
    this.approachWarning = null;

    // Reset lane and coordinates to safe center lane on track
    this.lateral = laneOffsets[1]; // 0: middle lane
    this.vehicleHeading = roadHeading(0);
    this.worldX = roadCenter(0) + Math.cos(this.vehicleHeading) * this.lateral;

    const playerElevation = roadElevation(0);
    const playerPitch = roadPitch(0);
    this.player.position.set(this.worldX, playerElevation + 0.02, 0);
    this.player.rotation.set(-playerPitch, this.vehicleHeading, 0);
    this.setVehicleBrake(this.player, false);

    // 3. Immediately rebuild road and shoulder strips at distance 0
    if (this.shoulderGeometry && this.roadGeometry) {
      const start = Math.max(-40, -GAME.lookBehind);
      const length = GAME.lookAhead + GAME.lookBehind + 150;
      updateRoadStrip(this.shoulderGeometry, start, length);
      updateRoadStrip(this.roadGeometry, start, length);
      this.lastRoadUpdateDistance = 0;
      this.roadUpdateElapsed = 0;
    }

    // 4. Reset interactables
    this.interactables.forEach((item) => {
      item.active = false;
      item.mesh.visible = false;
    });
    let interactableCursor = 100;
    for (let i = 0; i < 8; i++) {
      this.spawnInteractable(interactableCursor);
      interactableCursor += 80 + Math.random() * 120;
    }

    // 5. Reset traffic
    let ongoingCursor = 45;
    let incomingCursor = 62;
    this.traffic.forEach((car, index) => {
      car.direction = index === 0 ? 1 : index === 1 ? -1 : Math.random() < 0.56 ? 1 : -1;
      if (car.direction === 1) {
        ongoingCursor += 34 + Math.random() * 48;
        this.spawnTraffic(car, ongoingCursor);
      } else {
        incomingCursor += 38 + Math.random() * 58;
        this.spawnTraffic(car, incomingCursor);
      }
    });

    if (this.hasRival && this.traffic.length > 0) {
      this.rivalCar = this.traffic[0];
      this.rivalCar.isRival = true;
      this.rivalCar.direction = 1;
      this.rivalCar.distance = 42;
      this.rivalCar.speed = 46;
      this.rivalCar.targetSpeed = 58;
    } else {
      this.rivalCar = null;
    }

    // 6. Reset camera directly behind/inside the player
    this.setupInitialCamera();
  }

  getPhase(): GamePhase {
    return this.phase;
  }

  refreshViewport(): void {
    this.resize();
  }

  setPerformanceMonitoring(enabled: boolean): void {
    this.performanceMonitoring = enabled;
    this.performanceMonitor.reset();
  }

  setGraphicsQuality(mode: GraphicsQualityMode): void {
    this.graphicsQualityMode = mode;
    // Re-selecting the current tier clears stale adaptive samples. Fixed
    // presets are applied inside the render loop so resizing the drawing
    // buffer and repainting always happen in the same animation frame.
    const level = mode === 'auto' ? this.adaptiveQuality.settings.level : mode;
    const settings = this.adaptiveQuality.setLevel(level);
    if (mode !== 'auto') this.pendingRenderQuality = settings;
  }

  whenReady(): Promise<void> {
    return this.sceneAssetsReady;
  }

  async setCars(
    driverCar: CarModelId = DEFAULT_CAR_MODEL_ID,
    trafficCount: number = GAME.trafficCount,
    modelCount = 1,
    driverColor?: number,
  ): Promise<void> {
    this.driverCar = driverCar;
    this.driverColor = driverColor;
    this.setTrafficCount(trafficCount);
    await this.loadCarModels(driverCar, this.traffic.length === 0 ? 1 : modelCount, true);
  }

  dispose(): void {
    cancelAnimationFrame(this.animationFrame);
    window.removeEventListener('resize', this.resize);
    this.finishLine.dispose();
    this.roadsideFences.dispose();
    this.highwayScenery.dispose();
    this.textureStore.dispose();
    this.renderer.dispose();
  }

  private setupWorld(): void {
    for (let index = 0; index < 4; index += 1) {
      const mountain = this.sceneryAssets.createMountain();
      mountain.userData.slot = index;
      this.mountains.push(mountain);
      this.scene.add(mountain);
    }

    const cloudTexture = createCloudTexture();
    for (let index = 0; index < 11; index += 1) {
      const cloud = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: cloudTexture,
          color: index % 3 === 0 ? 0xe8f2ef : 0xffffff,
          transparent: true,
          opacity: 0.58 + (index % 4) * 0.07,
          depthWrite: false,
          fog: false,
        }),
      );
      const width = 54 + (index % 5) * 13;
      cloud.scale.set(width, width * (0.3 + (index % 2) * 0.04), 1);
      cloud.userData.baseX = -250 + index * 49;
      cloud.userData.height = 58 + (index % 4) * 15;
      cloud.userData.distanceOffset = 155 + (index % 3) * 68;
      cloud.userData.speed = (index % 2 === 0 ? 1 : -1) * (1.3 + (index % 4) * 0.42);
      this.clouds.push(cloud);
      this.scene.add(cloud);
    }
  }

  private setupInteractables(): void {
    for (let i = 0; i < 15; i++) {
      const typeRoll = Math.random();
      let type: 'coin' | 'nitro' | 'roadblock' = 'coin';
      let mesh: THREE.Mesh;

      if (typeRoll < 0.65) {
        type = 'coin';
        mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.5, 0.5, 0.15, 16),
          new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.9, roughness: 0.1 }),
        );
        mesh.rotation.x = Math.PI / 2;
      } else if (typeRoll < 0.8) {
        type = 'nitro';
        mesh = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.3, 0.8, 4, 8),
          new THREE.MeshStandardMaterial({
            color: 0x00ffff,
            emissive: 0x00ffff,
            emissiveIntensity: 0.5,
          }),
        );
        mesh.rotation.x = Math.PI / 2;
      } else {
        type = 'roadblock';
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(2, 0.8, 0.6),
          new THREE.MeshStandardMaterial({ color: 0xff5500 }),
        );
      }

      mesh.visible = false;
      this.scene.add(mesh);
      this.interactables.push({
        mesh,
        type,
        distance: 0,
        lane: 0,
        laneOffset: 0,
        active: false,
        rotationY: 0,
      });
    }
  }

  private spawnInteractable(ahead: number): void {
    const inactive = this.interactables.find((i) => !i.active);
    if (!inactive) return;
    inactive.active = true;
    inactive.distance = this.distance + ahead;
    inactive.lane = Math.floor(Math.random() * laneOffsets.length);
    inactive.laneOffset = (Math.random() - 0.5) * 1.0;
    if (this.finishDistance !== null && inactive.distance >= this.finishDistance - 150) {
      if (inactive.type === 'roadblock') {
        inactive.type = 'coin';
      }
    }
    inactive.mesh.visible = true;
    inactive.rotationY = 0;
  }

  private setTrafficCount(requestedCount: number): void {
    const trafficCount = Math.round(clamp(requestedCount, 0, GAME.trafficCount));
    while (this.traffic.length > trafficCount) {
      const removed = this.traffic.pop();
      if (removed) this.scene.remove(removed.mesh);
    }
    while (this.traffic.length < trafficCount) {
      const carMesh = new THREE.Group();
      this.scene.add(carMesh);
      this.traffic.push({
        mesh: carMesh,
        speed: 0,
        targetSpeed: 0,
        distance: 0,
        lane: 0,
        laneOffset: 0,
        direction: 1,
        speedChangeTimer: 0,
        counted: true,
        horned: false,
        isRival: false,
      });
    }
  }

  private async loadCarModels(
    driverCar: CarModelId,
    modelCount: number,
    forceRefresh = false,
  ): Promise<void> {
    if (
      !forceRefresh &&
      this.carModelsApplied &&
      this.currentAppliedCarId === driverCar &&
      this.currentAppliedColor === this.driverColor
    ) {
      return;
    }
    const available = await this.vehicleAssets.loadCarModels(driverCar, modelCount);
    const expectedModelCount = selectCarModelIds(driverCar, modelCount).length;
    if (available.length !== expectedModelCount) {
      throw new Error('One or more selected car models could not be loaded.');
    }

    const playerModel =
      available.find((model) => model.id === driverCar && model.playerPrototype) ??
      available.find((model) => model.playerPrototype) ??
      available.find((model) => model.id === driverCar);
    if (!playerModel?.playerPrototype && !playerModel?.trafficPrototype) {
      throw new Error('The selected driver car could not be loaded.');
    }
    const prototype = playerModel.playerPrototype ?? playerModel.trafficPrototype;
    this.vehicleAssets.replaceVisual(
      this.player,
      prototype,
      true,
      playerModel.id,
      this.driverColor,
    );
    this.attachVehicleLightRig(this.player, true);
    this.updateVehicleHeadlights(this.player, this.isHeadlightsActive());
    this.setVehicleBrake(this.player, false);
    const initialCamConfig = CAMERA_CONFIGS[this.cameraMode] ?? CAMERA_CONFIGS[0];
    this.player.visible = initialCamConfig.showCar;
    this.player.traverse((child) => {
      child.visible = initialCamConfig.showCar;
    });

    const trafficStart = Math.floor(Math.random() * available.length);
    this.traffic.forEach((car, index) => {
      const model = available[(trafficStart + index) % available.length];
      this.vehicleAssets.replaceVisual(car.mesh, model.trafficPrototype, false, model.id);
      this.attachVehicleLightRig(car.mesh, false);
      this.updateVehicleHeadlights(
        car.mesh,
        this.weatherSystem.getRainIntensity() > 0.04 ||
          this.weatherSystem.getStormIntensity() > 0.04,
      );
      this.setVehicleBrake(car.mesh, false);
    });
    this.currentAppliedCarId = driverCar;
    this.currentAppliedColor = this.driverColor;
    this.carModelsApplied = true;
  }

  private attachVehicleLightRig(carGroup: THREE.Group, _isPlayer: boolean): void {
    const existing = carGroup.getObjectByName('vehicle-light-rig');
    if (existing) carGroup.remove(existing);

    const rigGroup = new THREE.Group();
    rigGroup.name = 'vehicle-light-rig';

    const flareTex = getLightFlareTexture();
    const headActive = _isPlayer
      ? this.isHeadlightsActive()
      : this.weatherSystem.getRainIntensity() > 0.04 ||
        this.weatherSystem.getStormIntensity() > 0.04 ||
        this.weatherSystem.getFogIntensity() > 0.04;

    // ── Front Xenon Headlights (shines forward along -Z) ──
    const headLenses: THREE.Mesh[] = [];
    const headFlares: THREE.Mesh[] = [];
    const headLensMat = new THREE.MeshBasicMaterial({ color: headActive ? 0xffffff : 0x3a4048 });
    const headFlareMat = new THREE.MeshBasicMaterial({
      map: flareTex,
      color: 0xf5f8ff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: headActive ? 0.88 : 0,
    });

    const headLensGeom = new THREE.BoxGeometry(0.18, 0.1, 0.08);
    const headFlareGeom = new THREE.PlaneGeometry(0.55, 0.55);

    for (const x of [-0.74, 0.74]) {
      const lens = new THREE.Mesh(headLensGeom, headLensMat);
      lens.position.set(x, 0.58, -2.18);
      rigGroup.add(lens);
      headLenses.push(lens);

      const flare = new THREE.Mesh(headFlareGeom, headFlareMat);
      flare.position.set(x, 0.58, -2.22);
      flare.rotation.y = Math.PI;
      flare.visible = headActive;
      rigGroup.add(flare);
      headFlares.push(flare);
    }

    // ── Rear Ruby Taillights (shines rearward along +Z) ──
    const tailLenses: THREE.Mesh[] = [];
    const tailFlares: THREE.Mesh[] = [];
    const tailLensMat = new THREE.MeshBasicMaterial({ color: headActive ? 0xcc1018 : 0x44080c });
    const tailFlareMat = new THREE.MeshBasicMaterial({
      map: flareTex,
      color: 0xff1e28,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: headActive ? 0.32 : 0,
    });

    const tailLensGeom = new THREE.BoxGeometry(0.2, 0.1, 0.08);
    const tailFlareGeom = new THREE.PlaneGeometry(0.55, 0.55);

    for (const x of [-0.74, 0.74]) {
      const lens = new THREE.Mesh(tailLensGeom, tailLensMat);
      lens.position.set(x, 0.64, 2.18);
      rigGroup.add(lens);
      tailLenses.push(lens);

      const flare = new THREE.Mesh(tailFlareGeom, tailFlareMat);
      flare.position.set(x, 0.64, 2.22);
      flare.visible = headActive;
      rigGroup.add(flare);
      tailFlares.push(flare);
    }

    carGroup.add(rigGroup);
    carGroup.userData.lightRig = {
      headLenses,
      headFlares,
      tailLenses,
      tailFlares,
    };
  }

  private setVehicleBrake(carMesh: THREE.Group, braking: boolean): void {
    const isPlayer = carMesh === this.player;
    const headlightsActive = isPlayer
      ? this.isHeadlightsActive()
      : this.weatherSystem.getRainIntensity() > 0.04 ||
        this.weatherSystem.getStormIntensity() > 0.04 ||
        this.weatherSystem.getFogIntensity() > 0.04 ||
        this.weatherSystem.getSnowIntensity() > 0.12;

    this.vehicleAssets.setBrakeLights(carMesh, braking, headlightsActive);
    const rig = carMesh.userData.lightRig as VehicleLightRig | undefined;
    if (rig) {
      const isBadWeather =
        this.weatherSystem.getRainIntensity() > 0.08 ||
        this.weatherSystem.getStormIntensity() > 0.08 ||
        this.weatherSystem.getFogIntensity() > 0.08;

      if (braking) {
        for (const flare of rig.tailFlares) {
          flare.visible = true;
          (flare.material as THREE.MeshBasicMaterial).opacity = 0.98;
          flare.scale.set(1.35, 1.35, 1.35);
        }
        for (const lens of rig.tailLenses) {
          (lens.material as THREE.MeshBasicMaterial).color.setHex(0xff4455);
        }
      } else if (headlightsActive) {
        const baseOpacity = isBadWeather ? 0.48 : 0.32;
        for (const flare of rig.tailFlares) {
          flare.visible = true;
          (flare.material as THREE.MeshBasicMaterial).opacity = baseOpacity;
          flare.scale.set(0.85, 0.85, 0.85);
        }
        for (const lens of rig.tailLenses) {
          (lens.material as THREE.MeshBasicMaterial).color.setHex(0xcc1018);
        }
      } else {
        for (const flare of rig.tailFlares) {
          flare.visible = false;
          (flare.material as THREE.MeshBasicMaterial).opacity = 0;
        }
        for (const lens of rig.tailLenses) {
          (lens.material as THREE.MeshBasicMaterial).color.setHex(0x44080c);
        }
      }
    }
  }

  private spawnTraffic(car: TrafficCar, ahead?: number, randomizeDirection = false): void {
    if (randomizeDirection) car.direction = Math.random() < 0.56 ? 1 : -1;
    let candidateLane = car.direction === 1 ? (Math.random() < 0.5 ? 0 : 1) : 2;
    const minAhead = car.direction === 1 ? 85 : 110;
    const furthest = this.traffic
      .filter((other) => other !== car && other.direction === car.direction)
      .reduce((max, other) => Math.max(max, other.distance), this.distance + minAhead);
    let candidateDist =
      ahead ?? Math.max(this.distance + minAhead, furthest + 38 + Math.random() * 80);

    // Collision buffer: ensure car does not spawn overlapping another car in the same lane
    for (let attempt = 0; attempt < 6; attempt++) {
      const conflict = this.traffic.some(
        (other) =>
          other !== car &&
          other.lane === candidateLane &&
          Math.abs(other.distance - candidateDist) < 32,
      );
      if (!conflict) break;
      if (car.direction === 1) {
        candidateLane = candidateLane === 0 ? 1 : 0;
      }
      candidateDist += 36;
    }

    car.distance = candidateDist;
    car.lane = candidateLane;
    car.laneOffset = (Math.random() * 2 - 1) * 1.25;

    car.isRival = false;
    if (car.direction === 1 && Math.random() < 0.15) {
      car.isRival = true;
      car.speed = 40 + Math.random() * 10;
    } else {
      car.speed = car.direction === 1 ? 20 + Math.random() * 16 : 24 + Math.random() * 12;
    }

    car.targetSpeed = car.speed;
    car.speedChangeTimer = 2.5 + Math.random() * 6;
    car.counted = false;
    car.horned = false;
    this.setVehicleBrake(car.mesh, false);
  }

  private updateSimulation(dt: number): void {
    if (this.collisionCooldown > 0) this.collisionCooldown -= dt;
    if (this.gearShiftCooldown > 0) this.gearShiftCooldown -= dt;
    if (this.nitroTimer > 0) {
      this.nitroTimer -= dt;
      this.speed = Math.max(this.speed, 35);
    }

    for (const item of this.interactables) {
      if (!item.active) continue;
      const gap = item.distance - this.distance;
      if (gap < -15) {
        item.active = false;
        item.mesh.visible = false;
        this.spawnInteractable(150 + Math.random() * 200);
        continue;
      }
      const laneGap = Math.abs(this.lateral - (laneOffsets[item.lane] + item.laneOffset));
      if (Math.abs(gap) < 2.0 && laneGap < 1.5) {
        item.active = false;
        item.mesh.visible = false;
        this.spawnInteractable(150 + Math.random() * 200);

        if (item.type === 'coin') {
          this.bonusScore += 500;
          this.health = Math.min(100, this.health + 10);
          this.assistMessage = 'COIN +500 · REPAIR +10%';
        } else if (item.type === 'nitro') {
          this.nitroTimer = 2.5;
          this.assistMessage = 'NITRO BOOST!';
        } else if (item.type === 'roadblock') {
          if (this.collisionCooldown <= 0 && !this.isFinishingSequence) {
            this.health = Math.max(0, this.health - 25);
            this.collisionCooldown = 1.2;
            if (this.health <= 0) {
              this.phase = 'crashed';
              this.speed = 0;
              this.setVehicleBrake(this.player, true);
              this.assistMessage = 'CRASHED';
              this.onCrash();
              break;
            } else {
              this.assistMessage = 'ROADBLOCK HIT -25 HP';
              this.speed *= 0.5;
            }
          }
        }
      }
    }

    this.currentControl = this.getControl();
    const control = this.currentControl;

    // Process gear shift inputs from webcam gesture (paddle shift) or keyboard
    if (control.gearShift) {
      this.shiftGear(control.gearShift);
    } else if (control.targetGear !== undefined) {
      this.setGear(control.targetGear);
    }

    const currentGearSpec = GEAR_SPECS[this.currentGear - 1];
    const gearMaxSpeed = currentGearSpec.maxSpeedMs;

    // Smart auto-transmission assist: smoothly upshift at optimal powerband peak
    if (
      control.accelerating &&
      !control.braking &&
      this.speed >= gearMaxSpeed * 0.86 &&
      this.currentGear < GEAR_SPECS.length &&
      this.gearShiftCooldown <= 0
    ) {
      this.shiftGear(1);
    } else if (
      this.currentGear > 1 &&
      this.gearShiftCooldown <= 0 &&
      this.speed < (GEAR_SPECS[this.currentGear - 2]?.maxSpeedMs ?? 0) * 0.72
    ) {
      this.shiftGear(-1);
    }
    const curveLimit = curveSpeedLimit(this.distance, gearMaxSpeed, GAME.minCurveSpeed);
    const conceptDriver = this.driverCar === 'luxury-concept';
    const collisionLength = conceptDriver ? GAME.conceptCollisionLength : GAME.collisionLength;
    const collisionWidth = conceptDriver ? GAME.conceptCollisionWidth : GAME.collisionWidth;
    this.hornCooldown = Math.max(0, this.hornCooldown - dt);

    // Horn state is an audiovisual side effect; speed planning stays pure and testable.
    for (const car of this.traffic) {
      const gap = car.distance - this.distance;
      const laneGap = Math.abs(laneOffsets[car.lane] + car.laneOffset - this.lateral);
      if (!car.horned && gap > collisionLength && gap < 32 && laneGap < collisionWidth + 0.8) {
        car.horned = true;
        if (this.hornCooldown === 0) {
          this.hornCooldown = 3.5;
          this.onHorn();
        }
      }
    }

    const speedKph = Math.round(this.speed * 3.6);
    const roadCondition = this.weatherSystem.getRoadCondition(speedKph, this.tireSlip);

    const threat = scanTraffic(this.traffic, this.distance, this.lateral, curveLimit, gearMaxSpeed);
    const speedPlan = createSpeedPlan(
      control,
      this.speed,
      curveLimit,
      threat,
      gearMaxSpeed,
      currentGearSpec.accelMultiplier,
      roadCondition.grip,
    );
    const { targetSpeed, acceleration, safetyBraking } = speedPlan;
    this.assistMessage = speedPlan.assistMessage;
    this.isPlayerBraking = safetyBraking || control.braking === true;
    this.setVehicleBrake(this.player, this.isPlayerBraking);
    const accelLambda = Math.max(
      3.2,
      acceleration / Math.max(5, Math.abs(targetSpeed - this.speed)),
    );
    this.speed = damp(this.speed, targetSpeed, accelLambda, dt);
    if (targetSpeed === 0 && Math.abs(this.speed) < 0.3) this.speed = 0;

    this.steeringVisual = damp(this.steeringVisual, control.steering, 20, dt);

    // Progressive non-linear steering response curve:
    // Gentle 1.15 power curve provides solid center-line stability without lag or dead zones.
    const progressiveSteer = progressiveSteering(this.steeringVisual, 1.15);

    // Speed-sensitive steering authority & tire grip dynamics:
    const lowSpeedRamp = clamp(Math.abs(this.speed) / 6.0, 0.35, 1.0);
    const gripAuthority = 0.65 + 0.35 * roadCondition.grip;
    let effectiveTurnRate = speedSensitiveSteering(
      progressiveSteer,
      Math.abs(this.speed),
      0.95 * lowSpeedRamp * gripAuthority,
    );

    // Lateral tire load & slip:
    const lateralG = Math.abs(progressiveSteer) * (Math.abs(this.speed) / 16);
    const maxTireGripG = roadCondition.grip * 1.1;
    const targetSlip = Math.max(0, (lateralG - maxTireGripG) / Math.max(0.15, maxTireGripG));
    this.tireSlip = damp(this.tireSlip, targetSlip, 5, dt);

    // Hydroplaning or black-ice sliding warnings & authority loss:
    if (roadCondition.hydroplaneRisk > 0.35) {
      effectiveTurnRate *= 0.65;
      this.assistMessage = '⚠️ HYDROPLANING · EASE THROTTLE';
    } else if (this.tireSlip > 0.22 && roadCondition.surface === 'icy') {
      this.assistMessage = '❄️ BLACK ICE SLIP · COUNTER-STEER';
    }

    const currentRoadHeading = roadHeading(this.distance);
    const headingDiff = Math.atan2(
      Math.sin(currentRoadHeading - this.vehicleHeading),
      Math.cos(currentRoadHeading - this.vehicleHeading),
    );

    // Natural caster self-aligning torque:
    // When the driver holds neutral/gentle steering, vehicle heading stabilizes along highway curves.
    // When the driver turns firmly for an evasive lane change, alignment yields 100% authority to the player.
    if (Math.abs(this.speed) > 1.0) {
      const alignTorque = (1.0 - Math.min(1.0, Math.abs(this.steeringVisual) * 1.3)) * 3.2;
      this.vehicleHeading += headingDiff * alignTorque * dt;
    }

    this.vehicleHeading -= effectiveTurnRate * dt;

    // Lateral drift from tire slip on wet/flooded/icy asphalt:
    const slipDrift = Math.sign(this.steeringVisual) * this.tireSlip * 1.6 * dt;
    this.worldX += (-Math.sin(this.vehicleHeading) * this.speed + slipDrift) * dt;
    this.distance += Math.cos(this.vehicleHeading - roadHeading(this.distance)) * this.speed * dt;

    const roadHeadingAtDistance = roadHeading(this.distance);
    const currentRoadCenter = roadCenter(this.distance);
    const roadConstraint = constrainToRoad(
      this.worldX,
      currentRoadCenter,
      roadHeadingAtDistance,
      GAME.roadWidth,
      GAME.roadEdgeMargin,
    );
    this.worldX = roadConstraint.worldX;
    this.lateral = roadConstraint.lateral;
    const boundaryLimit = GAME.roadWidth / 2 - GAME.roadEdgeMargin;
    const edgeProximity = clamp((Math.abs(this.lateral) - (boundaryLimit - 1.6)) / 1.6, 0, 1);
    if (edgeProximity > 0) {
      const relativeHeading = Math.atan2(
        Math.sin(this.vehicleHeading - currentRoadHeading),
        Math.cos(this.vehicleHeading - currentRoadHeading),
      );
      const pointsOutward =
        (this.lateral > 0 && relativeHeading < 0) || (this.lateral < 0 && relativeHeading > 0);
      if (pointsOutward) {
        // Reduced edge friction, removed forced forward heading so you can turn around
        this.speed -= (1 + edgeProximity * 2.5) * dt;
        if (this.speed * Math.cos(this.vehicleHeading - currentRoadHeading) > 0) {
          this.speed = Math.max(0, this.speed); // Slow down if driving forward into edge
        }
      }
      this.assistMessage = 'ROAD EDGE';
      if (edgeProximity > 0.55) this.setVehicleBrake(this.player, true);
    }

    for (const car of this.traffic) {
      car.speedChangeTimer -= dt;
      if (car.speedChangeTimer <= 0) {
        car.targetSpeed = car.direction === 1 ? 19 + Math.random() * 18 : 23 + Math.random() * 14;
        car.speedChangeTimer = 2.5 + Math.random() * 7;
      }
      let trafficTargetSpeed = car.targetSpeed;
      for (const other of this.traffic) {
        if (other === car || other.direction !== car.direction || other.lane !== car.lane) continue;
        const forwardGap = (other.distance - car.distance) * car.direction;
        if (forwardGap > 0 && forwardGap < 22) {
          trafficTargetSpeed = Math.min(
            trafficTargetSpeed,
            other.speed * clamp((forwardGap - 5) / 12, 0, 1),
          );
        }
      }
      this.setVehicleBrake(car.mesh, trafficTargetSpeed < car.speed - 0.35);
      car.speed = damp(car.speed, trafficTargetSpeed, 1.25, dt);
      car.distance += car.speed * car.direction * dt;
      const gap = car.distance - this.distance;
      const laneGap = Math.abs(laneOffsets[car.lane] + car.laneOffset - this.lateral);
      if (car.direction === 1 && !car.counted && gap < -collisionLength) {
        car.counted = true;
        this.overtakes += car.isRival ? 10 : 1;
        if (car.isRival) {
          this.assistMessage = 'RIVAL PASSED! +BONUS';
        }
      }
      if (Math.abs(gap) < collisionLength && laneGap < collisionWidth) {
        if (this.collisionCooldown <= 0 && !this.isFinishingSequence) {
          this.health = Math.max(0, this.health - 20);
          this.collisionCooldown = 1.2;
          if (this.health <= 0) {
            this.phase = 'crashed';
            this.speed = 0;
            this.setVehicleBrake(this.player, true);
            this.assistMessage = 'CRASHED';
            this.onCrash();
            break;
          } else {
            this.assistMessage = 'DAMAGE TAKEN -20 HP';
            this.speed *= 0.65;
            this.setVehicleBrake(this.player, true);
          }
        }
      }
      if (gap < (car.direction === -1 ? -45 : -70)) {
        if (car === this.rivalCar || car.isRival) {
          // Rival stays behind once overtaken, do not teleport ahead of player!
          continue;
        }
        this.spawnTraffic(car, undefined, true);
      }
    }
  }

  private updateWorld(dt: number): void {
    proceduralTrack.update(this.distance);
    this.roadUpdateElapsed += dt;
    const roadJumped =
      !Number.isFinite(this.lastRoadUpdateDistance) ||
      Math.abs(this.distance - this.lastRoadUpdateDistance) > 5;
    if (roadJumped || this.roadUpdateElapsed >= ROAD_UPDATE_INTERVAL) {
      const start = Math.max(-40, this.distance - GAME.lookBehind);
      const length = GAME.lookAhead + GAME.lookBehind + 150;
      updateRoadStrip(this.shoulderGeometry, start, length);
      updateRoadStrip(this.roadGeometry, start, length);
      this.lastRoadUpdateDistance = this.distance;
      this.roadUpdateElapsed = 0;
    }
    this.roadsideFences.update(this.distance);
    this.highwayScenery.update(this.distance);

    const centerX = roadCenter(this.distance);
    const playerElevation = roadElevation(this.distance);
    const playerPitch = roadPitch(this.distance);
    this.player.position.set(this.worldX, playerElevation + 0.02, -this.distance);
    this.player.rotation.set(
      -playerPitch,
      this.vehicleHeading,
      damp(this.player.rotation.z, -this.steeringVisual * 0.06, 6, dt),
    );
    this.vehicleAssets.updateWheelAnimation(this.player, this.speed * dt, this.steeringVisual, dt);

    const headlightsActive = this.isHeadlightsActive();
    this.headlightBeam.visible = headlightsActive;
    if (headlightsActive) {
      this.headlightBeam.position.set(this.worldX, playerElevation + 0.038, -this.distance);
      this.headlightBeam.rotation.set(-playerPitch, this.vehicleHeading, 0);
      const wetness = this.weatherSystem.getRoadWetness();
      const isBadWeather =
        this.weatherSystem.getRainIntensity() > 0.05 ||
        this.weatherSystem.getStormIntensity() > 0.05 ||
        this.weatherSystem.getFogIntensity() > 0.05;
      const beamMat = this.headlightBeam.material as THREE.MeshBasicMaterial;
      beamMat.opacity = isBadWeather ? 0.72 + wetness * 0.22 : 0.58;
    }
    this.updateVehicleHeadlights(this.player, headlightsActive);

    const trafficHeadlightsActive =
      this.weatherSystem.getRainIntensity() > 0.04 ||
      this.weatherSystem.getStormIntensity() > 0.04 ||
      this.weatherSystem.getFogIntensity() > 0.04 ||
      this.weatherSystem.getSnowIntensity() > 0.12;

    for (const car of this.traffic) {
      const gap = car.distance - this.distance;
      const visible = gap > -90 && gap < GAME.lookAhead + 80;
      car.mesh.visible = visible;
      if (!visible) continue;
      this.updateVehicleHeadlights(car.mesh, trafficHeadlightsActive);
      const carHeading = roadHeading(car.distance);
      const carElevation = roadElevation(car.distance);
      const carPitch = roadPitch(car.distance);
      const offset = laneOffsets[car.lane] + car.laneOffset;
      car.mesh.position.set(
        roadCenter(car.distance) + Math.cos(carHeading) * offset,
        carElevation + 0.02,
        -car.distance - Math.sin(carHeading) * offset,
      );
      car.mesh.rotation.set(
        -carPitch * car.direction,
        carHeading + (car.direction === -1 ? Math.PI : 0),
        0,
      );
      const detailDistance = Math.abs(gap);
      this.vehicleAssets.setShadowCasting(car.mesh, detailDistance < 65);
      if (detailDistance < 70) {
        this.vehicleAssets.updateWheelAnimation(car.mesh, car.speed * dt, 0, dt);
      }
    }

    this.highwayScenery.update(this.distance);

    for (const item of this.interactables) {
      if (!item.active) continue;
      const gap = item.distance - this.distance;
      const visible = gap > -15 && gap < GAME.lookAhead + 80;
      item.mesh.visible = visible;
      if (!visible) continue;

      const itemHeading = roadHeading(item.distance);
      const itemElevation = roadElevation(item.distance);
      const itemPitch = roadPitch(item.distance);
      const offset = laneOffsets[item.lane] + item.laneOffset;
      item.mesh.position.set(
        roadCenter(item.distance) + Math.cos(itemHeading) * offset,
        itemElevation + 0.5,
        -item.distance - Math.sin(itemHeading) * offset,
      );
      item.mesh.rotation.x = -itemPitch;
      if (item.type === 'coin' || item.type === 'nitro') {
        item.rotationY += dt * 3;
        item.mesh.rotation.y = itemHeading + item.rotationY;
      } else {
        item.mesh.rotation.y = itemHeading + 0.2;
      }
    }

    // ── Immersive cockpit FOV (dynamic velocity expansion in top gears) ──
    const targetFov =
      this.nitroTimer > 0
        ? NITRO_FOV
        : this.currentGear >= 5
          ? BASE_FOV + (this.currentGear - 4) * 6
          : BASE_FOV;
    this.currentFov = damp(this.currentFov, targetFov, 5, dt);
    this.camera.fov = this.currentFov;
    this.camera.updateProjectionMatrix();

    for (const mountain of this.mountains) {
      const slot = mountain.userData.slot as number;
      const pair = Math.floor(slot / 2);
      const isLeft = slot % 2 === 0;
      const distance = this.distance + 275 + pair * 95;
      const horizonOffset = (pair === 0 ? 215 : 390) * (isLeft ? -1 : 1);
      mountain.position.set(roadCenter(distance) + horizonOffset, -6, -distance);
      mountain.rotation.y = roadHeading(distance) * 0.25 + (isLeft ? 0.18 : -0.18) + pair * 0.12;
      mountain.scale.setScalar(pair === 0 ? 1 : 0.86);
    }

    const sunDistance = this.distance + 350;
    this.lighting.visual.position.set(roadCenter(sunDistance) - 92, 102, -sunDistance);

    const cloudTime = performance.now() * 0.001;
    for (const cloud of this.clouds) {
      const cloudDistance = this.distance + (cloud.userData.distanceOffset as number);
      const drift = (cloud.userData.baseX as number) + cloudTime * (cloud.userData.speed as number);
      const wrappedX = ((((drift + 270) % 540) + 540) % 540) - 270;
      cloud.position.set(
        roadCenter(cloudDistance) + wrappedX,
        cloud.userData.height as number,
        -cloudDistance,
      );
    }

    this.ground.position.set(centerX, -0.09, -this.distance - 180);
    this.groundSnow.position.set(centerX, -0.075, -this.distance - 180);
    const groundMaterial = this.ground.material as THREE.MeshStandardMaterial;
    // PlaneGeometry's V axis points toward negative world Z after the ground is
    // rotated flat. Offset from the plane's world position so recentering the
    // large ground mesh never makes its texture travel with the player.
    const grassOffsetX = this.ground.position.x / GRASS_TILE_METERS;
    const grassOffsetY = -this.ground.position.z / GRASS_TILE_METERS;
    groundMaterial.map?.offset.set(grassOffsetX, grassOffsetY);
    groundMaterial.normalMap?.offset.set(grassOffsetX, grassOffsetY);
    groundMaterial.roughnessMap?.offset.set(grassOffsetX, grassOffsetY);
    groundMaterial.metalnessMap?.offset.set(grassOffsetX, grassOffsetY);
    const groundSnowMaterial = this.groundSnow.material as THREE.MeshStandardMaterial;
    groundSnowMaterial.map?.offset.set(
      this.groundSnow.position.x / SNOW_TILE_METERS,
      -this.groundSnow.position.z / SNOW_TILE_METERS,
    );

    // ── Dynamic Camera Placement by Mode ──
    const camConfig = CAMERA_CONFIGS[this.cameraMode] ?? CAMERA_CONFIGS[0];
    this.player.visible = camConfig.showCar;
    this.player.traverse((child) => {
      child.visible = camConfig.showCar;
    });

    this.forward.set(-Math.sin(this.vehicleHeading), 0, -Math.cos(this.vehicleHeading));
    this.shadowCenter.copy(this.player.position).addScaledVector(this.forward, 32);
    updateSceneShadow(this.lighting, this.shadowCenter);

    const control = this.currentControl;
    const gearMaxSpeed = GEAR_SPECS[this.currentGear - 1].maxSpeedMs;

    // Subtle pitch dynamics on throttle and braking
    let pitchOffset = 0;
    let surgeOffset = 0;
    this.gearShiftSurge = damp(this.gearShiftSurge, 0, 8, dt);
    surgeOffset += this.gearShiftSurge;
    if (control.braking) {
      const brakeStrength = control.brakePressure ?? 1.0;
      pitchOffset -= (camConfig.showCar ? 0.03 : 0.05) * brakeStrength; // Nose dips under braking
      surgeOffset += 0.04 * brakeStrength;
    } else if (control.accelerating && this.speed < gearMaxSpeed) {
      pitchOffset += camConfig.showCar ? 0.018 : 0.025; // Nose lifts under acceleration
      surgeOffset -= 0.025;
    }

    // Collision reaction: tactile jolt without nausea
    let collisionJoltY = 0;
    if (this.collisionCooldown > 0) {
      collisionJoltY =
        Math.sin(this.collisionCooldown * 25) * 0.04 * clamp(this.collisionCooldown, 0, 1);
    }

    // Desired camera position
    this.desiredCamera
      .copy(this.player.position)
      .addScaledVector(this.forward, -camConfig.camBack + surgeOffset);
    this.desiredCamera.y = this.player.position.y + camConfig.camHeight + collisionJoltY;

    // Stable road vibration at high speed (avoiding excessive shaking)
    const speedRatio = clamp(this.speed / gearMaxSpeed, 0, 1);
    const shakeIntensity = speedRatio * speedRatio * MAX_SHAKE_INTENSITY;
    const shakeTime = performance.now() * 0.012;
    this.cameraShakeOffset.set(
      Math.sin(shakeTime * 1.5) * shakeIntensity * 0.4,
      Math.sin(shakeTime * 2.1 + 1.1) * shakeIntensity * 0.25,
      0,
    );
    this.desiredCamera.add(this.cameraShakeOffset);

    if (this.isShowroomMode) {
      this.player.visible = true;
      this.player.traverse((child) => {
        child.visible = true;
      });

      if (!this.isShowroomDragging) {
        this.showroomOrbitAngle += dt * 0.22;
      }

      const dist = this.showroomOrbitDistance;
      const phi = this.vehicleHeading + this.showroomOrbitAngle;
      const rightX = Math.cos(this.vehicleHeading);
      const rightZ = -Math.sin(this.vehicleHeading);

      // Offset camera target to the left so the 3D car is framed on the open right side of screen
      const screenOffsetX = -rightX * 1.4;
      const screenOffsetZ = -rightZ * 1.4;

      const camX = this.player.position.x + Math.sin(phi) * dist + screenOffsetX;
      const camZ = this.player.position.z + Math.cos(phi) * dist + screenOffsetZ;
      const camY = this.player.position.y + this.showroomOrbitHeight;

      this.desiredCamera.set(camX, camY, camZ);
      this.camera.position.lerp(this.desiredCamera, 1 - Math.exp(-12 * dt));

      this.cameraTarget.set(
        this.player.position.x + screenOffsetX,
        this.player.position.y + 0.72,
        this.player.position.z + screenOffsetZ,
      );
      this.camera.lookAt(this.cameraTarget);
      this.camera.rotation.z = 0;
    } else {
      // Smooth position tracking (graceful chase follow or tight front tracking)
      const lerpRate = camConfig.showCar ? 11 : 14;
      this.camera.position.lerp(this.desiredCamera, 1 - Math.exp(-lerpRate * dt));

      // Look directly ahead toward target
      this.cameraTarget
        .copy(this.player.position)
        .addScaledVector(this.forward, camConfig.lookAhead);
      this.cameraTarget.y = this.player.position.y + camConfig.lookHeight + pitchOffset;
      this.camera.lookAt(this.cameraTarget);

      // Subtle lateral G-force body roll on steering turns
      const rollScale = camConfig.showCar ? 0.65 : 1.0;
      const targetRoll =
        -this.steeringVisual * MAX_ROLL_ANGLE * rollScale * (0.35 + speedRatio * 0.65);
      this.cameraRoll = damp(this.cameraRoll, targetRoll, 7, dt);
      this.camera.rotation.z += this.cameraRoll;
    }

    // ── Update speed-line particles ──
    this.updateSpeedLines(dt, speedRatio);
    this.weatherSystem.update(
      dt,
      this.distance,
      this.speed,
      this.vehicleHeading,
      this.camera.position,
      this.player.position,
      this.isHeadlightsActive(),
    );
    this.windshieldOverlay.update(
      dt,
      this.weatherSystem.getRainIntensity(),
      this.weatherSystem.getSnowIntensity(),
      Math.round(this.speed * 3.6),
      !camConfig.showCar,
      this.steeringVisual,
    );

    const climateNotice = this.weatherSystem.getClimateChangedNotice();
    if (climateNotice && this.weatherSystem.getMode() === 'auto') {
      this.assistMessage = climateNotice;
    }
  }

  private triggerFinishLineCrossed(reachedEnd = true): void {
    if (this.isFinishingSequence) return;
    this.isFinishingSequence = true;
    this.phase = 'finishing';
    this.finishEaseTimer = 0;
    this.approachWarning = null;
    if (reachedEnd) {
      this.finishLine.triggerVictoryConfetti(this.player.position);
      this.assistMessage = '🏁 FINISH LINE CROSSED!';
    } else {
      this.assistMessage = '⏱️ TIME EXPIRED';
    }
  }

  private emitRaceResult(): void {
    if (this.finishResultEmitted) return;
    this.finishResultEmitted = true;

    const reachedFinish = this.finishDistance !== null && this.distance >= this.finishDistance - 15;
    const withinTime =
      this.timeLimitSeconds === null || this.raceTimeSeconds <= this.timeLimitSeconds;

    let won = false;
    let position = 1;

    if (this.currentRaceMode === 'rival_race' || this.currentRaceMode === 'championship') {
      const rivalDist = this.rivalCar?.distance ?? 0;
      const beatRival = !this.hasRival || !this.rivalCar || this.distance >= rivalDist;
      if (reachedFinish && withinTime && beatRival) {
        won = true;
        position = 1;
      } else if (!beatRival) {
        won = false;
        position = 2;
      } else {
        won = reachedFinish && withinTime;
        position = beatRival ? 1 : 2;
      }
    } else if (this.currentRaceMode === 'time_attack') {
      // Time Attack: Reaching the sprint finish line before the timer expires is a 1st place victory!
      if (reachedFinish && withinTime) {
        won = true;
        position = 1;
      } else {
        won = false;
        position = 1;
      }
    } else if (this.currentRaceMode === 'traffic_challenge') {
      // Traffic Gauntlet: Completing the course distance awards completion victory!
      if (reachedFinish) {
        won = true;
        position = 1;
      } else {
        won = false;
        position = 1;
      }
    } else {
      // Endless highway
      won = true;
      position = 1;
    }

    const result: RaceResult = {
      won,
      finishPosition: position,
      completionTimeSeconds: Number(this.raceTimeSeconds.toFixed(2)),
      distanceMeters: Math.round(this.distance),
      maxSpeedKph: Math.round(this.speed * 3.6),
      overtakes: this.overtakes,
      score: Math.floor(this.distance + this.overtakes * 250) + this.bonusScore,
      health: this.health,
      mode: this.currentRaceMode,
    };

    this.onFinishCallback?.(result);
  }

  private animate = (): void => {
    this.animationFrame = requestAnimationFrame(this.animate);
    const frameSeconds = this.clock.getDelta();
    const dt = Math.min(frameSeconds, 0.05);
    const now = performance.now();

    const isRacingPhase =
      this.phase === 'playing' ||
      this.phase === 'racing' ||
      this.phase === 'final_approach' ||
      this.phase === 'finishing';
    const isLive = isRacingPhase || this.phase === 'countdown';

    if (!isLive && now - this.lastIdleRender < IDLE_RENDER_INTERVAL_MS) return;

    if (this.phase === 'countdown') {
      this.countdownTimer -= dt;
      if (this.countdownTimer > 1.1) this.countdownValue = 3;
      else if (this.countdownTimer > 0.6) this.countdownValue = 2;
      else if (this.countdownTimer > 0.1) this.countdownValue = 1;
      else this.countdownValue = 0;

      if (this.countdownValue !== this.lastBeepValue) {
        this.lastBeepValue = this.countdownValue;
        this.onCountdownBeepCallback?.(this.countdownValue === 0);
      }

      if (this.countdownTimer <= -0.35) {
        this.phase = 'racing';
        this.countdownValue = null;
        this.assistMessage = 'GO! RACE ACTIVE';
      }
    } else if (
      this.phase === 'racing' ||
      this.phase === 'final_approach' ||
      this.phase === 'playing'
    ) {
      this.raceTimeSeconds += dt;
      if (this.timeLimitSeconds && this.raceTimeSeconds >= this.timeLimitSeconds) {
        this.triggerFinishLineCrossed(false);
      } else if (this.finishDistance !== null) {
        const remaining = this.finishDistance - this.distance;
        if (remaining <= 0) {
          this.triggerFinishLineCrossed(true);
        } else if (remaining <= 120) {
          this.approachWarning = 'FINAL SPRINT · 100M';
          this.phase = 'final_approach';
        } else if (remaining <= 220) {
          this.approachWarning = 'CHECKPOINT · 200M';
        } else if (remaining <= 320) {
          this.approachWarning = 'APPROACHING · 300M';
        } else if (remaining <= 520) {
          this.approachWarning = 'APPROACHING · 500M';
        } else {
          this.approachWarning = null;
        }
      }
      this.updateSimulation(dt);
    } else if (this.phase === 'finishing') {
      this.speed = damp(this.speed, 0, 1.8, dt);
      this.distance += this.speed * dt;
      this.finishEaseTimer += dt;
      this.updateSimulation(dt);
      if (this.finishEaseTimer >= 2.2) {
        this.phase = 'results';
        this.emitRaceResult();
      }
    }

    this.updateWorld(dt);
    this.finishLine.update(dt);

    let qualitySettings = this.pendingRenderQuality;
    this.pendingRenderQuality = undefined;
    if (isRacingPhase && this.graphicsQualityMode === 'auto') {
      const settings = this.adaptiveQuality.recordFrame(frameSeconds);
      if (settings) qualitySettings = settings;
    }
    if (qualitySettings) this.applyRenderQuality(qualitySettings);
    this.renderer.render(this.scene, this.camera);

    if (this.performanceMonitoring && isRacingPhase) {
      const render = this.renderer.info.render;
      const memory = this.renderer.info.memory;
      const snapshot = this.performanceMonitor.recordFrame(
        frameSeconds,
        {
          drawCalls: render.calls,
          triangles: render.triangles,
          geometries: memory.geometries,
          textures: memory.textures,
        },
        this.adaptiveQuality.settings.level,
      );
      if (snapshot) this.onPerformanceUpdate(snapshot);
    }
    if (!isLive) this.lastIdleRender = now;

    if (now - this.lastSnapshot > 80) {
      this.lastSnapshot = now;
      this.onUpdate({
        speedKph: this.speed * 3.6,
        distance: this.distance,
        overtakes: this.overtakes,
        score: Math.floor(this.distance + this.overtakes * 250) + this.bonusScore,
        phase: this.phase,
        assistMessage: this.assistMessage,
        health: this.health,
        weatherType: this.weatherSystem.getWeatherType(),
        rainIntensity: this.weatherSystem.getRainIntensity(),
        snowIntensity: this.weatherSystem.getSnowIntensity(),
        fogIntensity: this.weatherSystem.getFogIntensity(),
        stormIntensity: this.weatherSystem.getStormIntensity(),
        weatherMode: this.weatherSystem.getMode(),
        cameraMode: this.cameraMode,
        cameraModeName: this.getCameraModeName(),
        currentGear: this.currentGear,
        gearLabel: GEAR_SPECS[this.currentGear - 1].label,
        gearMaxKph: GEAR_SPECS[this.currentGear - 1].maxSpeedKph,
        radar: this.getRadarTelemetry(),
        roadCondition: this.weatherSystem.getRoadCondition(this.speed * 3.6, this.tireSlip),
        headlightMode: this.headlightMode,
        headlightsActive: this.isHeadlightsActive(),
        raceTimeSeconds: this.raceTimeSeconds,
        distanceRemaining:
          this.finishDistance !== null ? Math.max(0, this.finishDistance - this.distance) : null,
        finishDistance: this.finishDistance,
        position: this.getRivalPosition(),
        countdownValue: this.countdownValue,
        approachWarning: this.approachWarning,
        raceModeName: this.currentRaceMode,
        steering: this.steeringVisual,
      });
    }
  };

  private resize = (): void => {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };

  private applyRenderQuality(settings: RenderQualitySettings): void {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.pixelRatioCap));
    const shadow = this.lighting.sun.shadow;
    if (shadow.mapSize.x !== settings.shadowMapSize) {
      shadow.mapSize.set(settings.shadowMapSize, settings.shadowMapSize);
      shadow.map?.dispose();
      shadow.map = null;
    }
  }

  // ══════════════════════════════════════════════════
  //   IMMERSIVE COCKPIT – Speed Lines Particle System
  // ══════════════════════════════════════════════════

  private initSpeedLines(): void {
    const count = SPEED_LINE_COUNT;
    const positions = new Float32Array(count * 2 * 3);
    const velocities = new Float32Array(count * 3);
    const colors = new Float32Array(count * 2 * 3);

    for (let i = 0; i < count; i++) {
      this.resetSpeedLineParticle(positions, velocities, i, true);
      // Slight warm-white tint for headlight reflection feel
      const color = [
        0.95 + Math.random() * 0.05,
        0.92 + Math.random() * 0.08,
        0.85 + Math.random() * 0.15,
      ];
      colors[i * 6] = color[0];
      colors[i * 6 + 1] = color[1];
      colors[i * 6 + 2] = color[2];
      colors[i * 6 + 3] = color[0];
      colors[i * 6 + 4] = color[1];
      colors[i * 6 + 5] = color[2];
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.speedLineParticles = new THREE.LineSegments(geometry, material);
    this.speedLineParticles.frustumCulled = false;
    this.scene.add(this.speedLineParticles);
    this.speedLinePositions = positions;
    this.speedLineVelocities = velocities;
  }

  private resetSpeedLineParticle(
    positions: Float32Array,
    velocities: Float32Array,
    index: number,
    scatter = false,
  ): void {
    const i3 = index * 3;
    const i6 = index * 6;
    const spreadX = 18;
    const spreadY = 8;
    const forwardRange = scatter ? 60 : 30;

    const x = (Math.random() - 0.5) * spreadX;
    const y = Math.random() * spreadY + 0.3;
    const z = -Math.random() * forwardRange;

    positions[i6] = x;
    positions[i6 + 1] = y;
    positions[i6 + 2] = z; // Start point
    positions[i6 + 3] = x;
    positions[i6 + 4] = y;
    positions[i6 + 5] = z; // End point

    velocities[i3] = (Math.random() - 0.5) * 0.5;
    velocities[i3 + 1] = (Math.random() - 0.5) * 0.2;
    velocities[i3 + 2] = 8 + Math.random() * 20;
  }

  private updateSpeedLines(dt: number, speedRatio: number): void {
    if (!this.speedLineParticles || !this.speedLinePositions || !this.speedLineVelocities) return;

    const positions = this.speedLinePositions;
    const velocities = this.speedLineVelocities;
    const count = velocities.length / 3;
    const material = this.speedLineParticles.material as THREE.LineBasicMaterial;

    // Only show speed lines when moving fast enough and in hood mode
    const lineOpacity = this.cameraMode !== 0 ? 0 : clamp((speedRatio - 0.3) / 0.4, 0, 0.65);
    material.opacity = lineOpacity;

    if (lineOpacity <= 0) return;

    // Position the speed-line system around the camera
    this.speedLineParticles.position.copy(this.camera.position);
    this.speedLineParticles.rotation.y = this.vehicleHeading;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const i6 = i * 6;

      const vZ = velocities[i3 + 2] * speedRatio;

      // Move end point (front of streak)
      positions[i6 + 3] += velocities[i3] * dt;
      positions[i6 + 4] += velocities[i3 + 1] * dt;
      positions[i6 + 5] += vZ * dt;

      // Stretch the streak based on speed
      positions[i6] = positions[i6 + 3];
      positions[i6 + 1] = positions[i6 + 4];
      positions[i6 + 2] = positions[i6 + 5] - Math.max(0.2, vZ * 0.08);

      // Recycle particles that have passed the camera
      if (positions[i6 + 5] > 15) {
        this.resetSpeedLineParticle(positions, velocities, i);
      }
    }

    const posAttr = this.speedLineParticles.geometry.getAttribute(
      'position',
    ) as THREE.BufferAttribute;
    posAttr.needsUpdate = true;
  }

  private setupInitialCamera(): void {
    const camConfig = CAMERA_CONFIGS[this.cameraMode] ?? CAMERA_CONFIGS[0];
    this.player.visible = camConfig.showCar;
    this.player.traverse((child) => {
      child.visible = camConfig.showCar;
    });
    this.forward.set(-Math.sin(this.vehicleHeading), 0, -Math.cos(this.vehicleHeading));
    this.desiredCamera.copy(this.player.position).addScaledVector(this.forward, -camConfig.camBack);
    this.desiredCamera.y = this.player.position.y + camConfig.camHeight;
    this.camera.position.copy(this.desiredCamera);
    this.cameraTarget.copy(this.player.position).addScaledVector(this.forward, camConfig.lookAhead);
    this.cameraTarget.y = this.player.position.y + camConfig.lookHeight;
    this.camera.lookAt(this.cameraTarget);
    this.cameraRoll = 0;
  }
}
