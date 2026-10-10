import * as THREE from 'three';
import { PerformanceMonitor } from '../diagnostics/PerformanceMonitor';
import type { PerformanceSnapshot } from '../diagnostics/PerformanceMonitor';
import { GAME, laneOffsets } from './config';
import { clamp, constrainToRoad, curveSpeedLimit, damp, roadCenter, roadHeading } from './math';
import { createRoadStrip, updateRoadStrip } from './roadSurface';
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
import type { ControlInput, GamePhase, GameSnapshot } from './types';
import { VehicleAssets } from './vehicleAssets';
import type { LoadedCarModel } from './vehicleAssets';
import { DEFAULT_CAR_MODEL_ID, selectCarModelIds } from './vehicleCatalog';
import type { CarModelId } from './vehicleCatalog';
import { RoadsideFenceSystem } from './world/RoadsideFenceSystem';

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

const GROUND_SIZE = 1200;
const GRASS_TEXTURE_REPEAT = 30;
const GRASS_TILE_METERS = GROUND_SIZE / GRASS_TEXTURE_REPEAT;
const SNOW_TEXTURE_REPEAT = 12;
const SNOW_TILE_METERS = GROUND_SIZE / SNOW_TEXTURE_REPEAT;
const ROAD_UPDATE_INTERVAL = 1 / 30;
const IDLE_RENDER_INTERVAL_MS = 200;

export class DrivingGame {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(58, 1, 0.1, 800);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly performanceMonitor = new PerformanceMonitor();
  private readonly adaptiveQuality: AdaptiveQuality;
  private readonly clock = new THREE.Clock();
  private readonly vehicleAssets = new VehicleAssets();
  private readonly player = new THREE.Group();
  private readonly traffic: TrafficCar[] = [];
  private readonly scenery: THREE.Group[] = [];
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
  private lateral: number = laneOffsets[0];
  private worldX = roadCenter(0) + Math.cos(roadHeading(0)) * laneOffsets[0];
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
  private carModelsPromise?: Promise<LoadedCarModel[]>;
  private carModelsApplied = false;
  private sceneAssetsLoaded = false;
  private lastSnapshot = 0;
  private lastIdleRender = 0;
  private roadUpdateElapsed = Number.POSITIVE_INFINITY;
  private lastRoadUpdateDistance = Number.NaN;
  private animationFrame = 0;
  private performanceMonitoring = false;
  private graphicsQualityMode: GraphicsQualityMode = 'auto';
  private pendingRenderQuality?: RenderQualitySettings;

  constructor(
    private readonly container: HTMLElement,
    private readonly getControl: () => ControlInput,
    private readonly onUpdate: (snapshot: GameSnapshot) => void,
    private readonly onCrash: () => void,
    private readonly onHorn: () => void,
    private readonly onPerformanceUpdate: (snapshot: PerformanceSnapshot) => void,
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

    const roadMaterial = this.textureStore.createMaterial(
      'RoadLines_baseColor.jpeg',
      'RoadLines_normal.png',
      'RoadLines_metallicRoughness.png',
      {
        textureRoot: 'roads/textures',
        normalScale: 0.34,
        tint: 0xffffff,
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

    this.roadGeometry = createRoadStrip(GAME.roadWidth, 220, 0, 1, GAME.roadWidth);
    this.roadMesh = new THREE.Mesh(this.roadGeometry, roadMaterial);
    this.roadMesh.receiveShadow = true;
    this.scene.add(this.roadMesh);

    this.shoulderGeometry = createRoadStrip(GAME.roadWidth + 5.5, 220);
    this.shoulderMesh = new THREE.Mesh(this.shoulderGeometry, shoulderMaterial);
    this.shoulderMesh.position.y = -0.055;
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
        opacity: 0.72,
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
    this.scene.add(this.groundSnow);

    this.roadsideFences = new RoadsideFenceSystem(this.scene);

    this.lighting = addSceneLighting(this.scene, this.adaptiveQuality.settings.shadowMapSize);
    this.setupWorld();
    this.setupInteractables();
    const natureReady = this.sceneryAssets.loadNature(this.scenery);
    const mountainsReady = this.sceneryAssets.loadMountains(this.mountains);
    this.sceneAssetsReady = Promise.all([
      this.textureStore.whenReady(),
      natureReady,
      mountainsReady,
    ]).then(() => {
      this.sceneAssetsLoaded = true;
    });

    const leftHeadlight = new THREE.SpotLight(0xffffee, 0, 300, 0.7, 0.5, 1);
    leftHeadlight.position.set(-0.7, 0.5, -2);
    leftHeadlight.target.position.set(-0.7, 0, -20);
    this.player.add(leftHeadlight);
    this.player.add(leftHeadlight.target);

    const rightHeadlight = new THREE.SpotLight(0xffffee, 0, 300, 0.7, 0.5, 1);
    rightHeadlight.position.set(0.7, 0.5, -2);
    rightHeadlight.target.position.set(0.7, 0, -20);
    this.player.add(rightHeadlight);
    this.player.add(rightHeadlight.target);
    this.player.userData.headlights = [leftHeadlight, rightHeadlight];

    this.scene.add(this.player);
    this.resize();
    window.addEventListener('resize', this.resize);
    this.animationFrame = requestAnimationFrame(this.animate);
  }

  start(): void {
    if (!this.sceneAssetsLoaded || !this.carModelsApplied) {
      throw new Error('The game cannot start before all required assets load.');
    }
    if (this.phase === 'crashed') this.reset();
    this.phase = 'playing';
    this.clock.getDelta();
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
    this.distance = 0;
    this.speed = 0;
    this.health = 100;
    this.collisionCooldown = 0;
    this.bonusScore = 0;
    this.nitroTimer = 0;
    this.interactables.forEach(item => {
      item.active = false;
      item.mesh.visible = false;
    });
    this.lateral = laneOffsets[0];
    this.worldX = roadCenter(0) + Math.cos(roadHeading(0)) * laneOffsets[0];
    this.vehicleHeading = roadHeading(0);
    this.overtakes = 0;
    this.assistMessage = 'READY';
    this.hornCooldown = 0;
    this.phase = 'ready';
    this.vehicleAssets.setBrakeLights(this.player, false);
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
    
    let interactableCursor = 100;
    for (let i = 0; i < 8; i++) {
      this.spawnInteractable(interactableCursor);
      interactableCursor += 80 + Math.random() * 120;
    }

    this.scenery.forEach((object, index) => {
      object.userData.distance = -45 + index * 12.5;
      object.userData.worldPositioned = false;
    });
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
    await this.loadCarModels(driverCar, this.traffic.length === 0 ? 1 : modelCount);
  }

  dispose(): void {
    cancelAnimationFrame(this.animationFrame);
    window.removeEventListener('resize', this.resize);
    this.roadsideFences.dispose();
    this.textureStore.dispose();
    this.renderer.dispose();
  }

  private setupWorld(): void {
    for (let index = 0; index < 44; index += 1) {
      const object =
        index % 6 === 0 ? this.sceneryAssets.createRock() : this.sceneryAssets.createTree();
      object.userData.slot = index;
      object.userData.distance = -45 + index * 12.5;
      object.userData.side = index % 2 === 0 ? -1 : 1;
      object.userData.offset = GAME.roadWidth / 2 + 6 + ((index * 7) % 10);
      object.userData.worldPositioned = false;
      object.rotation.y = (index * 2.39) % (Math.PI * 2);
      object.scale.setScalar(0.72 + (index % 5) * 0.11);
      this.scenery.push(object);
      this.scene.add(object);
    }

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
          new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.9, roughness: 0.1 })
        );
        mesh.rotation.x = Math.PI / 2;
      } else if (typeRoll < 0.8) {
        type = 'nitro';
        mesh = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.3, 0.8, 4, 8),
          new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 0.5 })
        );
        mesh.rotation.x = Math.PI / 2;
      } else {
        type = 'roadblock';
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(2, 0.8, 0.6),
          new THREE.MeshStandardMaterial({ color: 0xff5500 })
        );
      }
      
      mesh.visible = false;
      this.scene.add(mesh);
      this.interactables.push({ mesh, type, distance: 0, lane: 0, laneOffset: 0, active: false, rotationY: 0 });
    }
  }

  private spawnInteractable(ahead: number): void {
    const inactive = this.interactables.find(i => !i.active);
    if (!inactive) return;
    inactive.active = true;
    inactive.distance = this.distance + ahead;
    inactive.lane = Math.floor(Math.random() * 4);
    inactive.laneOffset = (Math.random() - 0.5) * 1.0;
    inactive.mesh.visible = true;
    inactive.rotationY = 0;
  }



  private setTrafficCount(requestedCount: number): void {
    const trafficCount = Math.round(clamp(requestedCount, 0, GAME.trafficCount));
    while (this.traffic.length > trafficCount) {
      const removed = this.traffic.pop();
      if (removed) this.scene.remove(removed.mesh);
    }
  }

  private async loadCarModels(driverCar: CarModelId, modelCount: number): Promise<void> {
    if (this.carModelsApplied) return;
    this.carModelsPromise ??= this.vehicleAssets.loadCarModels(driverCar, modelCount);
    const available = await this.carModelsPromise;
    const expectedModelCount = selectCarModelIds(driverCar, modelCount).length;
    if (available.length !== expectedModelCount) {
      throw new Error('One or more selected car models could not be loaded.');
    }

    const playerModel = available.find((model) => model.playerPrototype);
    if (!playerModel?.playerPrototype) {
      throw new Error('The selected driver car could not be loaded.');
    }
    this.vehicleAssets.replaceVisual(
      this.player,
      playerModel.playerPrototype,
      true,
      playerModel.id,
      this.driverColor,
    );

    const trafficStart = Math.floor(Math.random() * available.length);
    this.traffic.forEach((car, index) => {
      const model = available[(trafficStart + index) % available.length];
      this.vehicleAssets.replaceVisual(car.mesh, model.trafficPrototype, false, model.id);
    });
    this.carModelsApplied = true;
  }

  private spawnTraffic(car: TrafficCar, ahead?: number, randomizeDirection = false): void {
    if (randomizeDirection) car.direction = Math.random() < 0.56 ? 1 : -1;
    const furthest = this.traffic
      .filter((other) => other !== car && other.direction === car.direction)
      .reduce((max, other) => Math.max(max, other.distance), this.distance + 120);
    car.distance = ahead ?? furthest + 48 + Math.random() * 95;
    car.lane = car.direction === 1 ? 0 : 1;
    car.laneOffset = (Math.random() * 2 - 1) * 1.35;
    
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
    this.vehicleAssets.setBrakeLights(car.mesh, false);
  }

  private updateSimulation(dt: number): void {
    if (this.collisionCooldown > 0) this.collisionCooldown -= dt;
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
           this.assistMessage = 'COIN +500';
         } else if (item.type === 'nitro') {
           this.nitroTimer = 2.5;
           this.assistMessage = 'NITRO BOOST!';
         } else if (item.type === 'roadblock') {
           if (this.collisionCooldown <= 0) {
             this.health -= 50;
             this.collisionCooldown = 1.5;
             if (this.health <= 0) {
               this.phase = 'crashed';
               this.speed = 0;
               this.vehicleAssets.setBrakeLights(this.player, true);
               this.assistMessage = 'CRASHED';
               this.onCrash();
               break;
             } else {
               this.assistMessage = 'ROADBLOCK HIT';
               this.speed *= 0.3;
             }
           }
         }
      }
    }

    const control = this.getControl();
    const curveLimit = curveSpeedLimit(this.distance, GAME.maxSpeed, GAME.minCurveSpeed);
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

    const threat = scanTraffic(this.traffic, this.distance, this.lateral, curveLimit);
    const speedPlan = createSpeedPlan(control, this.speed, curveLimit, threat);
    const { targetSpeed, acceleration, safetyBraking } = speedPlan;
    this.assistMessage = speedPlan.assistMessage;
    this.vehicleAssets.setBrakeLights(this.player, safetyBraking || control.braking === true);
    this.speed = Math.max(
      0,
      damp(
        this.speed,
        targetSpeed,
        acceleration / Math.max(8, Math.abs(targetSpeed - this.speed)),
        dt,
      ),
    );
    if (targetSpeed === 0 && this.speed < 0.3) this.speed = 0;

    this.steeringVisual = damp(this.steeringVisual, control.steering, 10, dt);
    const steeringAuthority = 0.28 + 0.72 * clamp(this.speed / 18, 0, 1);
    this.vehicleHeading -= this.steeringVisual * 0.82 * steeringAuthority * dt;
    this.worldX += -Math.sin(this.vehicleHeading) * this.speed * dt;
    this.distance += Math.max(0.12, Math.cos(this.vehicleHeading)) * this.speed * dt;

    const currentRoadHeading = roadHeading(this.distance);
    const currentRoadCenter = roadCenter(this.distance);
    const roadConstraint = constrainToRoad(
      this.worldX,
      currentRoadCenter,
      currentRoadHeading,
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
        const softenedHeading = damp(relativeHeading, 0, 2.5 + edgeProximity * 5.5, dt);
        this.vehicleHeading = currentRoadHeading + softenedHeading;
        this.speed = Math.max(0, this.speed - (2 + edgeProximity * 5) * dt);
      }
      this.assistMessage = 'ROAD EDGE';
      if (edgeProximity > 0.55) this.vehicleAssets.setBrakeLights(this.player, true);
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
      this.vehicleAssets.setBrakeLights(car.mesh, trafficTargetSpeed < car.speed - 0.35);
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
        if (this.collisionCooldown <= 0) {
          this.health -= 25;
          this.collisionCooldown = 1.5;
          if (this.health <= 0) {
            this.phase = 'crashed';
            this.speed = 0;
            this.vehicleAssets.setBrakeLights(this.player, true);
            this.assistMessage = 'CRASHED';
            this.onCrash();
            break;
          } else {
            this.assistMessage = 'DAMAGE TAKEN';
            this.speed *= 0.5;
            this.vehicleAssets.setBrakeLights(this.player, true);
          }
        }
      }
      if (gap < (car.direction === -1 ? -45 : -70)) this.spawnTraffic(car, undefined, true);
    }
  }

  private updateWorld(dt: number): void {
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

    const centerX = roadCenter(this.distance);
    this.player.position.set(this.worldX, 0.02, -this.distance);
    this.player.rotation.y = this.vehicleHeading;
    this.player.rotation.z = damp(this.player.rotation.z, -this.steeringVisual * 0.06, 6, dt);
    this.vehicleAssets.updateWheelAnimation(this.player, this.speed * dt, this.steeringVisual, dt);

    for (const car of this.traffic) {
      const gap = car.distance - this.distance;
      const visible = gap > -90 && gap < GAME.lookAhead + 80;
      car.mesh.visible = visible;
      if (!visible) continue;
      const carHeading = roadHeading(car.distance);
      const offset = laneOffsets[car.lane] + car.laneOffset;
      car.mesh.position.set(
        roadCenter(car.distance) + Math.cos(carHeading) * offset,
        0.02,
        -car.distance - Math.sin(carHeading) * offset,
      );
      car.mesh.rotation.y = carHeading + (car.direction === -1 ? Math.PI : 0);
      const detailDistance = Math.abs(gap);
      this.vehicleAssets.setShadowCasting(car.mesh, detailDistance < 65);
      if (detailDistance < 70) {
        this.vehicleAssets.updateWheelAnimation(car.mesh, car.speed * dt, 0, dt);
      }
    }

    for (const object of this.scenery) {
      let distance = object.userData.distance as number;
      let needsPosition = object.userData.worldPositioned !== true;
      if (distance < this.distance - 70) {
        distance += this.scenery.length * 12.5;
        object.userData.distance = distance;
        needsPosition = true;
      }
      if (needsPosition) {
        const headingAtObject = roadHeading(distance);
        const offset = (object.userData.side as number) * (object.userData.offset as number);
        object.position.set(
          roadCenter(distance) + Math.cos(headingAtObject) * offset,
          0,
          -distance - Math.sin(headingAtObject) * offset,
        );
        object.userData.worldPositioned = true;
      }
    }

    for (const item of this.interactables) {
      if (!item.active) continue;
      const gap = item.distance - this.distance;
      const visible = gap > -15 && gap < GAME.lookAhead + 80;
      item.mesh.visible = visible;
      if (!visible) continue;
      
      const itemHeading = roadHeading(item.distance);
      const offset = laneOffsets[item.lane] + item.laneOffset;
      item.mesh.position.set(
        roadCenter(item.distance) + Math.cos(itemHeading) * offset,
        0.5,
        -item.distance - Math.sin(itemHeading) * offset,
      );
      if (item.type === 'coin' || item.type === 'nitro') {
        item.rotationY += dt * 3;
        item.mesh.rotation.y = itemHeading + item.rotationY;
      } else {
        item.mesh.rotation.y = itemHeading + 0.2;
      }
    }

    if (this.nitroTimer > 0) {
      this.camera.fov = damp(this.camera.fov, 90, 5, dt);
    } else {
      this.camera.fov = damp(this.camera.fov, 65, 5, dt);
    }
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
    
    // Day/Night Cycle
    const dayCycle = (this.distance / 12000) * Math.PI;
    const sunHeight = Math.sin(dayCycle);
    const ambientLight = Math.max(0.3, sunHeight);
    
    this.lighting.sun.intensity = Math.max(0, sunHeight * 3.2);
    this.lighting.hemisphere.intensity = ambientLight * 1.55;
    
    const bgColor = new THREE.Color().lerpColors(
      new THREE.Color(0x071018),
      new THREE.Color(0x9bb8bd),
      ambientLight
    );
    this.scene.background = bgColor;
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color = bgColor;
    }
    // Fade out sun visual
    this.lighting.visual.children.forEach(c => {
      const mat = (c as THREE.Mesh).material as THREE.Material;
      if (mat) mat.opacity = Math.max(0, sunHeight);
    });

    // Toggle headlights based on sun height
    const targetIntensity = sunHeight < 0.2 ? 4000 : 0;
    const headlights = this.player.userData.headlights as THREE.SpotLight[];
    if (headlights) {
      headlights.forEach(light => {
        light.intensity = damp(light.intensity, targetIntensity, 5, dt);
      });
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

    this.forward.set(-Math.sin(this.vehicleHeading), 0, -Math.cos(this.vehicleHeading));
    this.shadowCenter.copy(this.player.position).addScaledVector(this.forward, 32);
    updateSceneShadow(this.lighting, this.shadowCenter);
    this.desiredCamera.copy(this.player.position).addScaledVector(this.forward, -8.5);
    this.desiredCamera.y += 4.3;
    this.camera.position.lerp(this.desiredCamera, 1 - Math.exp(-5 * dt));
    this.cameraTarget.copy(this.player.position).addScaledVector(this.forward, 12);
    this.cameraTarget.y += 1;
    this.camera.lookAt(this.cameraTarget);
  }

  private animate = (): void => {
    this.animationFrame = requestAnimationFrame(this.animate);
    const frameSeconds = this.clock.getDelta();
    const dt = Math.min(frameSeconds, 0.05);
    const now = performance.now();
    const playing = this.phase === 'playing';
    if (!playing && now - this.lastIdleRender < IDLE_RENDER_INTERVAL_MS) return;
    if (playing) this.updateSimulation(dt);
    this.updateWorld(dt);
    let qualitySettings = this.pendingRenderQuality;
    this.pendingRenderQuality = undefined;
    if (playing && this.graphicsQualityMode === 'auto') {
      const settings = this.adaptiveQuality.recordFrame(frameSeconds);
      if (settings) qualitySettings = settings;
    }
    if (qualitySettings) this.applyRenderQuality(qualitySettings);
    // Quality changes resize and clear the WebGL drawing buffer. Rendering
    // afterward fills it in the same animation frame and prevents a black flash.
    this.renderer.render(this.scene, this.camera);
    if (this.performanceMonitoring && playing) {
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
    if (!playing) this.lastIdleRender = now;

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
}
