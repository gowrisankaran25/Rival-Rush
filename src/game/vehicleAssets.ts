import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { selectCarModelIds } from './vehicleCatalog';
import type { CarModelId } from './vehicleCatalog';

export {
  CAR_MODEL_OPTIONS,
  CAR_MODEL_VARIETY_OPTIONS,
  DEFAULT_CAR_MODEL_ID,
  selectCarModelIds,
} from './vehicleCatalog';
export type { CarModelId } from './vehicleCatalog';
export type VehicleModelId = CarModelId;

interface CarModelSpec {
  id: VehicleModelId;
  path: string;
  rotationY: number;
  displayScale: number;
  paintMaterials: readonly string[];
  rimMaterials?: readonly string[];
  wheelMaterials?: readonly string[];
  tailMaterials?: readonly string[];
  tailLightProfile?: Omit<ModelBrakeLight, 'material'>;
  preserveTailColor?: boolean;
  removePaintTexture?: boolean;
}

interface AnimatedWheel {
  steeringPivot: THREE.Object3D;
  roller: THREE.Object3D;
  radius: number;
  front: boolean;
  rollAxis: 'x' | 'y';
  baseRoll: number;
  baseSteering: number;
  rollAngle: number;
}

interface WheelAssembly {
  parts: THREE.Object3D[];
  front: boolean;
}

interface ModelBrakeLight {
  material: THREE.MeshStandardMaterial;
  restColor: number;
  restEmissive: number;
  restIntensity: number;
  brakingColor: number;
  brakingEmissive: number;
  brakingIntensity: number;
}

export interface LoadedCarModel {
  id: VehicleModelId;
  trafficPrototype: THREE.Group;
  playerPrototype?: THREE.Group;
}

const CAR_COLORS = [
  0xf2f1ea, // Pearl white
  0xb8bec4, // Metallic silver
  0x353a40, // Graphite grey
  0x183f68, // Midnight blue
  0x7a1f2b, // Burgundy red
  0x254c3b, // Forest green
  0x9a5131, // Copper bronze
];
const DRIVER_CAR_COLOR = 0xf5f7f4;
const REAL_CAR_SCALE = 2;
const CONCEPT_CAR_SCALE = 2;
const BASE_MODEL_SPECS: readonly CarModelSpec[] = [
  {
    id: 'ford-f150-raptor',
    path: 'models/2017_ford_f-150_raptor.glb',
    rotationY: Math.PI,
    displayScale: 2.1,
    paintMaterials: ['RaptorM_CarPaint_Max1'],
    tailMaterials: ['RaptorM_LightGlass_Red_Low1'],
  },
  {
    id: 'ford-everest-sport',
    path: 'models/ford_everest_sport_2023.glb',
    rotationY: Math.PI,
    displayScale: 2.2,
    paintMaterials: ['carpaint'],
    tailMaterials: ['redglass'],
  },
  {
    id: 'ioniq-5',
    path: 'models/hyundai_ioniq_5_-_lowpoly.glb',
    rotationY: Math.PI,
    displayScale: 1.9,
    paintMaterials: ['M_Gravity_Gold_Matte'],
    tailMaterials: ['M_Emission'],
    preserveTailColor: true,
  },
  {
    id: 'oldsmobile-cutlass',
    path: 'models/oldsmobile_cutlass_supreme_sedan_71.glb',
    rotationY: 0,
    displayScale: 2.0,
    paintMaterials: ['M_Paint'],
    tailMaterials: ['M_Taillights'],
    tailLightProfile: {
      restColor: 0x8f1118,
      restEmissive: 0x320003,
      restIntensity: 0.85,
      brakingColor: 0xff2732,
      brakingEmissive: 0xff0712,
      brakingIntensity: 5.2,
    },
  },
  {
    id: 'ford-gt40',
    path: 'models/Sketchfab_2026_10_02_18_56_34.glb',
    rotationY: Math.PI,
    displayScale: 2.0,
    paintMaterials: ['Car_body'],
    tailMaterials: ['EXTERIOR_LIGHT_BRAKE'],
    tailLightProfile: {
      restColor: 0x8a0000,
      restEmissive: 0x280000,
      restIntensity: 1.0,
      brakingColor: 0xff1522,
      brakingEmissive: 0xff050d,
      brakingIntensity: 6.0,
    },
  },
  {
    id: 'skyline-r34',
    path: 'models/brians_r34_from_2_fast_2_furious.glb',
    rotationY: Math.PI,
    displayScale: 2.0,
    paintMaterials: ['rNissan_SkylineGTRR34F2_1999Paint_Material1'],
    tailMaterials: ['red_glass'],
    tailLightProfile: {
      restColor: 0x9e0000,
      restEmissive: 0x300000,
      restIntensity: 1.1,
      brakingColor: 0xff1c28,
      brakingEmissive: 0xff0a16,
      brakingIntensity: 6.5,
    },
  },
  {
    id: 'ford-gt-2006',
    path: 'models/ford_gt_2006.glb',
    rotationY: Math.PI,
    displayScale: 2.0,
    paintMaterials: ['Body', 'White_Body'],
    tailMaterials: ['Red_Light'],
    tailLightProfile: {
      restColor: 0x900000,
      restEmissive: 0x2b0000,
      restIntensity: 1.0,
      brakingColor: 0xff1822,
      brakingEmissive: 0xff0610,
      brakingIntensity: 6.0,
    },
  },
];
const AUDI_ETRON_MODEL_SPEC: CarModelSpec = {
  id: 'luxury-concept',
  path: 'models/2018_audi_e-tron_gt_concept.glb',
  rotationY: Math.PI,
  displayScale: CONCEPT_CAR_SCALE,
  paintMaterials: ['CarPaint'],
  rimMaterials: ['gtVehicle_Exterior_mm_wheel_009'],
  wheelMaterials: [
    'gtVehicle_Exterior_mm_rotor_009',
    'gtVehicle_Exterior_mm_wheel_009',
    'gtVehicle_Exterior_mm_tyre_009',
  ],
  tailMaterials: ['Emiss'],
  tailLightProfile: {
    restColor: 0xa80000,
    restEmissive: 0x400000,
    restIntensity: 1.2,
    brakingColor: 0xff0000,
    brakingEmissive: 0xff0000,
    brakingIntensity: 8.5,
  },
};
const CAR_MODEL_SPECS: readonly CarModelSpec[] = [...BASE_MODEL_SPECS, AUDI_ETRON_MODEL_SPEC];

export class VehicleAssets {
  private readonly prototypeCache = new Map<VehicleModelId, THREE.Group>();

  randomColor(): number {
    return CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
  }

  async loadCarModels(playerModelId: CarModelId, modelCount = 1): Promise<LoadedCarModel[]> {
    const loader = new GLTFLoader();
    const selectedIds = selectCarModelIds(playerModelId, modelCount);
    const selectedSpecs = selectedIds.map((id) => {
      const spec = CAR_MODEL_SPECS.find((candidate) => candidate.id === id);
      if (!spec) throw new Error(`Missing specification for car model: ${id}`);
      return spec;
    });
    const loadedModels = await Promise.all(
      selectedSpecs.map(async (spec): Promise<LoadedCarModel | null> => {
        try {
          let trafficPrototype = this.prototypeCache.get(spec.id);
          if (!trafficPrototype) {
            const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}${spec.path}`);
            trafficPrototype = this.prepareCarModel(gltf.scene, spec.rotationY, true, spec.id);
            this.prototypeCache.set(spec.id, trafficPrototype);
          }
          return {
            id: spec.id,
            trafficPrototype,
            playerPrototype: spec.id === playerModelId ? trafficPrototype : undefined,
          };
        } catch (error) {
          console.error(`Could not load the ${spec.id} car model.`, error);
          return null;
        }
      }),
    );
    return loadedModels.filter((model): model is LoadedCarModel => model !== null);
  }

  replaceVisual(
    car: THREE.Group,
    prototype: THREE.Group,
    player: boolean,
    modelId: VehicleModelId,
    playerColor?: number,
  ): void {
    const oldGeometries = new Set<THREE.BufferGeometry>();
    const oldMaterials = new Set<THREE.Material>();
    car.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      oldGeometries.add(object.geometry);
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => oldMaterials.add(material));
    });
    car.clear();
    oldGeometries.forEach((geometry) => geometry.dispose());
    oldMaterials.forEach((material) => material.dispose());

    const instance = prototype.clone(true);
    const color = player ? (playerColor ?? DRIVER_CAR_COLOR) : this.randomColor();
    this.applyCarColor(instance, modelId, color, player);
    const modelBrakeLights = this.prepareModelBrakeLights(instance, modelId);
    car.add(instance);
    const modelSpec = CAR_MODEL_SPECS.find((spec) => spec.id === modelId);
    car.scale.setScalar(modelSpec?.displayScale ?? REAL_CAR_SCALE);
    car.userData.modelId = modelId;
    car.userData.frontWheels = [];
    car.userData.animatedWheels = [];
    car.userData.tailMaterial = undefined;
    car.userData.modelBrakeLights = modelBrakeLights;
    car.userData.brakeGlow = undefined;
    car.userData.highBrakeOnly = false;
    const shadowMeshes: THREE.Mesh[] = [];
    car.traverse((object) => {
      if (object instanceof THREE.Mesh) shadowMeshes.push(object);
    });
    car.userData.shadowMeshes = shadowMeshes;
    car.userData.castsShadow = true;

    const animatedWheels: AnimatedWheel[] = [];
    instance.traverse((object) => {
      if (object.userData.isWheelPivot !== true) return;
      const roller = object.children.find((child) => child.userData.isWheelRoller === true);
      if (!roller) return;
      const radius = (object.userData.wheelRadius as number) * car.scale.x;
      animatedWheels.push({
        steeringPivot: object,
        roller,
        radius: Math.max(0.1, radius),
        front: object.userData.frontWheel === true,
        rollAxis: 'x',
        baseRoll: roller.rotation.x,
        baseSteering: object.rotation.y,
        rollAngle: 0,
      });
    });
    car.userData.animatedWheels = animatedWheels;
    car.userData.frontWheels = animatedWheels
      .filter((wheel) => wheel.front)
      .map((wheel) => wheel.steeringPivot);
  }

  setBrakeLights(car: THREE.Group, braking: boolean, headlightsActive = true): void {
    const modelBrakeLights = car.userData.modelBrakeLights as ModelBrakeLight[] | undefined;
    for (const light of modelBrakeLights ?? []) {
      if (braking) {
        light.material.color.setHex(light.brakingColor);
        light.material.emissive.setHex(light.brakingEmissive);
        light.material.emissiveIntensity = light.brakingIntensity;
      } else if (headlightsActive) {
        light.material.color.setHex(light.restColor);
        light.material.emissive.setHex(light.restEmissive);
        light.material.emissiveIntensity = light.restIntensity;
      } else {
        light.material.color.setHex(light.restColor);
        light.material.emissive.setHex(0x000000);
        light.material.emissiveIntensity = 0;
      }
    }

    const material = car.userData.tailMaterial as THREE.MeshStandardMaterial | undefined;
    if (material) {
      const highBrakeOnly = car.userData.highBrakeOnly === true;
      if (braking) {
        material.color.setHex(0xff1d29);
        material.emissive.setHex(0xff0712);
        material.emissiveIntensity = 4.5;
      } else if (headlightsActive) {
        material.color.setHex(highBrakeOnly ? 0x260205 : 0x681015);
        material.emissive.setHex(highBrakeOnly ? 0x000000 : 0x240003);
        material.emissiveIntensity = highBrakeOnly ? 0 : 0.7;
      } else {
        material.color.setHex(0x220204);
        material.emissive.setHex(0x000000);
        material.emissiveIntensity = 0;
      }
    }
    const glow = car.userData.brakeGlow as THREE.PointLight | undefined;
    if (glow) glow.intensity = braking ? 4.2 : 0;
  }

  updateWheelAnimation(
    car: THREE.Group,
    distanceMoved: number,
    steering: number,
    dt: number,
  ): void {
    const wheels = car.userData.animatedWheels as AnimatedWheel[] | undefined;
    if (!wheels) return;

    for (const wheel of wheels) {
      wheel.rollAngle = (wheel.rollAngle - distanceMoved / wheel.radius) % (Math.PI * 2);
      wheel.roller.rotation[wheel.rollAxis] = wheel.baseRoll + wheel.rollAngle;
      if (wheel.front) {
        wheel.steeringPivot.rotation.y = THREE.MathUtils.damp(
          wheel.steeringPivot.rotation.y,
          wheel.baseSteering - steering * 0.48,
          14,
          dt,
        );
      }
    }
  }

  setShadowCasting(car: THREE.Group, enabled: boolean): void {
    if (car.userData.castsShadow === enabled) return;
    const meshes = car.userData.shadowMeshes as THREE.Mesh[] | undefined;
    for (const mesh of meshes ?? []) mesh.castShadow = enabled;
    car.userData.castsShadow = enabled;
  }

  private prepareCarModel(
    source: THREE.Group,
    rotationY: number,
    optimize: boolean,
    modelId: VehicleModelId,
  ): THREE.Group {
    const content = source.clone(true);
    this.removeDisabledModelParts(content, modelId);
    const orientation = new THREE.Group();
    orientation.rotation.y = rotationY;
    orientation.add(content);
    orientation.updateMatrixWorld(true);

    const wheelPivots = this.extractWheelPivots(orientation, modelId);

    const modelRoot = optimize ? this.mergeStaticCarMeshes(orientation) : orientation;
    for (const pivot of wheelPivots) {
      if (optimize) modelRoot.add(pivot);
      else orientation.attach(pivot);
    }
    const prototype = new THREE.Group();
    prototype.add(modelRoot);
    prototype.updateMatrixWorld(true);

    let bounds = new THREE.Box3().setFromObject(prototype);
    const size = bounds.getSize(new THREE.Vector3());
    const horizontalLength = Math.max(size.x, size.z);
    if (!Number.isFinite(horizontalLength) || horizontalLength <= 0) {
      throw new Error('The car model has invalid bounds.');
    }

    modelRoot.scale.setScalar(4.6 / horizontalLength);
    prototype.updateMatrixWorld(true);
    bounds = new THREE.Box3().setFromObject(prototype);
    const center = bounds.getCenter(new THREE.Vector3());
    modelRoot.position.set(-center.x, -bounds.min.y, -center.z);
    prototype.updateMatrixWorld(true);
    prototype.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;
    });
    prototype.updateMatrixWorld(true);
    for (const pivot of wheelPivots) {
      const wheelSize = new THREE.Box3().setFromObject(pivot, true).getSize(new THREE.Vector3());
      pivot.userData.wheelRadius = Math.max(0.1, wheelSize.y * 0.5);
    }
    return prototype;
  }

  private extractWheelPivots(root: THREE.Group, modelId: VehicleModelId): THREE.Group[] {
    const assemblies = this.findWheelAssemblies(root, modelId);
    root.updateMatrixWorld(true);

    return assemblies.map((assembly, index) => {
      const bounds = new THREE.Box3();
      for (const part of assembly.parts) bounds.expandByObject(part, true);
      const pivot = new THREE.Group();
      pivot.name = `driving-wheel-${index}`;
      pivot.position.copy(bounds.getCenter(new THREE.Vector3()));
      pivot.userData.isWheelPivot = true;
      pivot.userData.frontWheel = assembly.front;
      const roller = new THREE.Group();
      roller.name = `driving-wheel-roller-${index}`;
      roller.userData.isWheelRoller = true;
      pivot.add(roller);
      pivot.updateMatrixWorld(true);
      for (const part of assembly.parts) roller.attach(part);
      this.mergeWheelMeshes(roller);
      return pivot;
    });
  }

  private mergeWheelMeshes(pivot: THREE.Group): void {
    pivot.updateMatrixWorld(true);
    const inversePivot = pivot.matrixWorld.clone().invert();
    const buckets = new Map<
      string,
      { material: THREE.Material; geometries: THREE.BufferGeometry[] }
    >();

    pivot.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
      const geometry = object.geometry.clone();
      geometry.applyMatrix4(object.matrixWorld);
      geometry.applyMatrix4(inversePivot);
      const attributeSignature = Object.keys(geometry.attributes).sort().join(',');
      const key = `${object.material.uuid}|${attributeSignature}|${
        geometry.index ? 'indexed' : 'plain'
      }`;
      const bucket = buckets.get(key);
      if (bucket) bucket.geometries.push(geometry);
      else
        buckets.set(key, {
          material: object.material,
          geometries: [geometry],
        });
    });

    const optimizedMeshes: THREE.Mesh[] = [];
    for (const bucket of buckets.values()) {
      const merged =
        bucket.geometries.length === 1
          ? bucket.geometries[0]
          : mergeGeometries(bucket.geometries, false);
      if (merged) {
        optimizedMeshes.push(new THREE.Mesh(merged, bucket.material));
        continue;
      }
      for (const geometry of bucket.geometries) {
        optimizedMeshes.push(new THREE.Mesh(geometry, bucket.material));
      }
    }

    if (optimizedMeshes.length === 0) return;
    pivot.clear();
    for (const mesh of optimizedMeshes) pivot.add(mesh);
  }

  private findWheelAssemblies(root: THREE.Group, modelId: VehicleModelId): WheelAssembly[] {
    const exact = (names: readonly string[]): WheelAssembly[] =>
      this.groupWheelPartsByPosition(
        root,
        names.flatMap((name) => {
          const part = root.getObjectByName(name);
          return part ? [part] : [];
        }),
      );

    const modelSpec = CAR_MODEL_SPECS.find((spec) => spec.id === modelId);
    const wheelMaterialNames = new Set(modelSpec?.wheelMaterials ?? []);
    if (wheelMaterialNames.size > 0) {
      const parts: THREE.Object3D[] = [];
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        if (materials.some((material) => wheelMaterialNames.has(material.name))) {
          parts.push(object);
        }
      });
      return this.groupWheelPartsByPosition(root, parts);
    }

    if (
      modelId === 'ford-f150-raptor' ||
      modelId === 'ford-everest-sport' ||
      modelId === 'ford-gt40'
    ) {
      return exact(['WHEEL_RF', 'WHEEL_RR', 'WHEEL_LF', 'WHEEL_LR']);
    }
    if (modelId === 'oldsmobile-cutlass') {
      return exact([
        'wheels_M_Wheel_0_fl',
        'wheels_M_Wheel_0_fr',
        'wheels_M_Wheel_0_rl',
        'wheels_M_Wheel_0_rr',
      ]);
    }
    if (modelId === 'skyline-r34') {
      const candidates = [
        ['3DWheel_Front_L_6', '3DWheel Front L_6'],
        ['3DWheel_Front_R_639', '3DWheel Front R_639'],
        ['3DWheel_Rear_L_1272', '3DWheel Rear L_1272'],
        ['3DWheel_Rear_R_1905', '3DWheel Rear R_1905'],
      ];
      const parts: THREE.Object3D[] = [];
      for (const [n1, n2] of candidates) {
        const part = root.getObjectByName(n1) ?? root.getObjectByName(n2);
        if (part) parts.push(part);
      }
      return this.groupWheelPartsByPosition(root, parts);
    }
    if (modelId === 'ford-gt-2006') {
      const parts: THREE.Object3D[] = [];
      for (const name of [
        'Object_68_left',
        'Object_68_right',
        'Object_69_left',
        'Object_69_right',
        'Object_71_left',
        'Object_71_right',
        'Object_72_left',
        'Object_72_right',
      ]) {
        const part = root.getObjectByName(name);
        if (part) parts.push(part);
      }
      return this.groupWheelPartsByPosition(root, parts);
    }
    if (modelId === 'ioniq-5') {
      return exact(['SM_Wheel_BL_0', 'SM_Wheel_BR_1', 'SM_Wheel_FL_2', 'SM_Wheel_FR_3']);
    }
    return [];
  }

  private removeDisabledModelParts(root: THREE.Group, modelId: VehicleModelId): void {
    if (modelId === 'luxury-concept') {
      const highBrakeLights: THREE.Object3D[] = [];
      root.traverse((object) => {
        if (
          object instanceof THREE.Mesh &&
          object.name.includes('LOD_A_BRAKES_mm_lights') &&
          !object.name.includes('BRAKES_LEFT') &&
          !object.name.includes('BRAKES_RIGHT')
        ) {
          highBrakeLights.push(object);
        }
      });
      highBrakeLights.forEach((light) => light.removeFromParent());
    }

    if (modelId === 'oldsmobile-cutlass') {
      // Remove the decorative ground plane that ships with the Sketchfab model
      const groundParts: THREE.Object3D[] = [];
      root.traverse((object) => {
        if (object.name === 'ground' || object.name === 'ground_M_Dome_0') {
          groundParts.push(object);
        }
      });
      groundParts.forEach((part) => part.removeFromParent());
      this.splitOldsmobileWheels(root);
      this.splitOldsmobileTaillights(root);
    }

    if (modelId === 'ford-gt40') {
      const unwanted: THREE.Object3D[] = [];
      root.traverse((object) => {
        if (
          object.name.startsWith('FLYCAM_') ||
          object.name.startsWith('RIM_BLUR_') ||
          (object instanceof THREE.Mesh &&
            (Array.isArray(object.material)
              ? object.material.some((m) => m.name === 'RIM_BLUR')
              : object.material?.name === 'RIM_BLUR'))
        ) {
          unwanted.push(object);
        }
      });
      unwanted.forEach((part) => part.removeFromParent());
    }

    if (modelId === 'ford-gt-2006') {
      this.splitFordGtWheels(root);
    }
  }

  private splitOldsmobileTaillights(root: THREE.Group): void {
    const targetNames = ['lights_M_Lights_0', 'lights-glass_M_Lights_0', 'trim2_M_Lights_0'];
    for (const name of targetNames) {
      const mesh = root.getObjectByName(name);
      if (!(mesh instanceof THREE.Mesh)) continue;
      const parent = mesh.parent;
      if (!parent) continue;

      mesh.updateWorldMatrix(true, false);
      const nonIndexed = mesh.geometry.toNonIndexed();
      const pos = nonIndexed.attributes.position;
      const mat = mesh.matrixWorld;
      const attrNames = Object.keys(nonIndexed.attributes);

      const frontAttrs: Record<string, number[]> = {};
      const rearAttrs: Record<string, number[]> = {};
      for (const attr of attrNames) {
        frontAttrs[attr] = [];
        rearAttrs[attr] = [];
      }

      const va = new THREE.Vector3();
      const vb = new THREE.Vector3();
      const vc = new THREE.Vector3();

      for (let i = 0; i < pos.count; i += 3) {
        va.fromBufferAttribute(pos, i).applyMatrix4(mat);
        vb.fromBufferAttribute(pos, i + 1).applyMatrix4(mat);
        vc.fromBufferAttribute(pos, i + 2).applyMatrix4(mat);
        const triZ = (va.z + vb.z + vc.z) / 3;
        // In raw model: triZ > 120 is rear taillights, triZ <= 120 is front headlights
        const target = triZ > 120 ? rearAttrs : frontAttrs;
        for (const attrName of attrNames) {
          const attr = nonIndexed.attributes[attrName];
          const itemSize = attr.itemSize;
          const out = target[attrName];
          for (let vertexIndex = i; vertexIndex < i + 3; vertexIndex++) {
            for (let k = 0; k < itemSize; k++) {
              out.push(attr.getComponent(vertexIndex, k));
            }
          }
        }
      }

      if (frontAttrs.position.length > 0) {
        const frontGeom = new THREE.BufferGeometry();
        for (const [attrName, values] of Object.entries(frontAttrs)) {
          frontGeom.setAttribute(
            attrName,
            new THREE.Float32BufferAttribute(values, nonIndexed.attributes[attrName].itemSize),
          );
        }
        const frontMesh = new THREE.Mesh(frontGeom, mesh.material);
        frontMesh.name = `${name}_front`;
        frontMesh.position.copy(mesh.position);
        frontMesh.rotation.copy(mesh.rotation);
        frontMesh.scale.copy(mesh.scale);
        parent.add(frontMesh);
      }

      if (rearAttrs.position.length > 0) {
        const rearGeom = new THREE.BufferGeometry();
        for (const [attrName, values] of Object.entries(rearAttrs)) {
          rearGeom.setAttribute(
            attrName,
            new THREE.Float32BufferAttribute(values, nonIndexed.attributes[attrName].itemSize),
          );
        }
        const tailMaterial = Array.isArray(mesh.material)
          ? mesh.material[0].clone()
          : mesh.material.clone();
        tailMaterial.name = 'M_Taillights';
        const rearMesh = new THREE.Mesh(rearGeom, tailMaterial);
        rearMesh.name = `${name}_rear`;
        rearMesh.position.copy(mesh.position);
        rearMesh.rotation.copy(mesh.rotation);
        rearMesh.scale.copy(mesh.scale);
        parent.add(rearMesh);
      }

      mesh.removeFromParent();
    }
  }

  private splitOldsmobileWheels(root: THREE.Group): void {
    const mesh = root.getObjectByName('wheels_M_Wheel_0');
    if (!(mesh instanceof THREE.Mesh)) return;
    const parent = mesh.parent;
    if (!parent) return;

    mesh.updateWorldMatrix(true, false);
    const nonIndexed = mesh.geometry.toNonIndexed();
    const pos = nonIndexed.attributes.position;
    const mat = mesh.matrixWorld;
    const box = new THREE.Box3().setFromObject(mesh);
    const center = box.getCenter(new THREE.Vector3());

    const attrNames = Object.keys(nonIndexed.attributes);
    const bucketAttrs: Record<string, Record<string, number[]>> = {
      fl: {},
      fr: {},
      rl: {},
      rr: {},
    };
    for (const key of ['fl', 'fr', 'rl', 'rr']) {
      bucketAttrs[key] = {};
      for (const name of attrNames) bucketAttrs[key][name] = [];
    }

    const va = new THREE.Vector3();
    const vb = new THREE.Vector3();
    const vc = new THREE.Vector3();

    for (let i = 0; i < pos.count; i += 3) {
      va.fromBufferAttribute(pos, i).applyMatrix4(mat);
      vb.fromBufferAttribute(pos, i + 1).applyMatrix4(mat);
      vc.fromBufferAttribute(pos, i + 2).applyMatrix4(mat);
      const triX = (va.x + vb.x + vc.x) / 3;
      const triZ = (va.z + vb.z + vc.z) / 3;
      // In raw Oldsmobile model: hood/front is at Z < center.z, trunk/rear is at Z > center.z.
      // Facing -Z (forward): left is triX < center.x (-X), right is triX > center.x (+X).
      const left = triX < center.x;
      const front = triZ < center.z;
      const key = `${front ? 'f' : 'r'}${left ? 'l' : 'r'}`;

      for (const name of attrNames) {
        const attr = nonIndexed.attributes[name];
        const itemSize = attr.itemSize;
        const target = bucketAttrs[key][name];
        for (let vertexIndex = i; vertexIndex < i + 3; vertexIndex++) {
          for (let k = 0; k < itemSize; k++) {
            target.push(attr.getComponent(vertexIndex, k));
          }
        }
      }
    }

    for (const [key, attrs] of Object.entries(bucketAttrs)) {
      if (attrs.position.length === 0) continue;
      const geom = new THREE.BufferGeometry();
      for (const [name, values] of Object.entries(attrs)) {
        geom.setAttribute(
          name,
          new THREE.Float32BufferAttribute(values, nonIndexed.attributes[name].itemSize),
        );
      }
      const subMesh = new THREE.Mesh(geom, mesh.material);
      subMesh.name = `${mesh.name}_${key}`;
      subMesh.position.copy(mesh.position);
      subMesh.rotation.copy(mesh.rotation);
      subMesh.scale.copy(mesh.scale);
      parent.add(subMesh);
    }
    mesh.removeFromParent();
  }

  private splitFordGtWheels(root: THREE.Group): void {
    root.updateMatrixWorld(true);
    const targetNames = ['Object_68', 'Object_69', 'Object_71', 'Object_72'];
    for (const name of targetNames) {
      const mesh = root.getObjectByName(name);
      if (!(mesh instanceof THREE.Mesh)) continue;
      const parent = mesh.parent;
      if (!parent) continue;

      const nonIndexed = mesh.geometry.toNonIndexed();
      const pos = nonIndexed.attributes.position;
      const mat = mesh.matrixWorld;
      const attrNames = Object.keys(nonIndexed.attributes);
      const leftAttrs: Record<string, number[]> = {};
      const rightAttrs: Record<string, number[]> = {};
      for (const name of attrNames) {
        leftAttrs[name] = [];
        rightAttrs[name] = [];
      }

      const va = new THREE.Vector3();
      const vb = new THREE.Vector3();
      const vc = new THREE.Vector3();

      for (let i = 0; i < pos.count; i += 3) {
        va.fromBufferAttribute(pos, i).applyMatrix4(mat);
        vb.fromBufferAttribute(pos, i + 1).applyMatrix4(mat);
        vc.fromBufferAttribute(pos, i + 2).applyMatrix4(mat);
        const centerX = (va.x + vb.x + vc.x) / 3;
        const target = centerX > 0 ? leftAttrs : rightAttrs;
        for (const attrName of attrNames) {
          const attr = nonIndexed.attributes[attrName];
          const itemSize = attr.itemSize;
          const out = target[attrName];
          for (let vertexIndex = i; vertexIndex < i + 3; vertexIndex++) {
            for (let k = 0; k < itemSize; k++) {
              out.push(attr.getComponent(vertexIndex, k));
            }
          }
        }
      }

      if (leftAttrs.position.length > 0) {
        const leftGeom = new THREE.BufferGeometry();
        for (const [attrName, values] of Object.entries(leftAttrs)) {
          leftGeom.setAttribute(
            attrName,
            new THREE.Float32BufferAttribute(values, nonIndexed.attributes[attrName].itemSize),
          );
        }
        const leftMesh = new THREE.Mesh(leftGeom, mesh.material);
        leftMesh.name = `${name}_left`;
        leftMesh.position.copy(mesh.position);
        leftMesh.rotation.copy(mesh.rotation);
        leftMesh.scale.copy(mesh.scale);
        parent.add(leftMesh);
      }

      if (rightAttrs.position.length > 0) {
        const rightGeom = new THREE.BufferGeometry();
        for (const [attrName, values] of Object.entries(rightAttrs)) {
          rightGeom.setAttribute(
            attrName,
            new THREE.Float32BufferAttribute(values, nonIndexed.attributes[attrName].itemSize),
          );
        }
        const rightMesh = new THREE.Mesh(rightGeom, mesh.material);
        rightMesh.name = `${name}_right`;
        rightMesh.position.copy(mesh.position);
        rightMesh.rotation.copy(mesh.rotation);
        rightMesh.scale.copy(mesh.scale);
        parent.add(rightMesh);
      }

      mesh.removeFromParent();
    }
  }

  private groupWheelPartsByPosition(
    root: THREE.Group,
    parts: readonly THREE.Object3D[],
  ): WheelAssembly[] {
    if (parts.length === 0) return [];
    root.updateMatrixWorld(true);
    const modelCenter = new THREE.Box3().setFromObject(root, true).getCenter(new THREE.Vector3());
    const groups = new Map<string, WheelAssembly>();

    for (const part of new Set(parts)) {
      const bounds = new THREE.Box3().setFromObject(part, true);
      if (bounds.isEmpty()) continue;
      const center = bounds.getCenter(new THREE.Vector3());
      const front = center.z < modelCenter.z;
      const key = `${center.x < modelCenter.x ? 'left' : 'right'}-${front ? 'front' : 'rear'}`;
      const assembly = groups.get(key);
      if (assembly) assembly.parts.push(part);
      else groups.set(key, { parts: [part], front });
    }

    return [...groups.values()];
  }

  private mergeStaticCarMeshes(root: THREE.Group): THREE.Group {
    const buckets = new Map<
      string,
      { material: THREE.Material; geometries: THREE.BufferGeometry[] }
    >();
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
      const geometry = object.geometry.clone();
      geometry.applyMatrix4(object.matrixWorld);
      const attributeSignature = Object.keys(geometry.attributes).sort().join(',');
      const key = `${object.material.uuid}|${attributeSignature}|${geometry.index ? 'indexed' : 'plain'}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { material: object.material, geometries: [] };
        buckets.set(key, bucket);
      }
      bucket.geometries.push(geometry);
    });

    const mergedRoot = new THREE.Group();
    for (const bucket of buckets.values()) {
      const merged = mergeGeometries(bucket.geometries, false);
      bucket.geometries.forEach((geometry) => geometry.dispose());
      if (!merged) continue;
      merged.computeBoundingBox();
      merged.computeBoundingSphere();
      mergedRoot.add(new THREE.Mesh(merged, bucket.material));
    }
    if (mergedRoot.children.length === 0)
      throw new Error('The car geometry could not be optimized.');
    return mergedRoot;
  }

  private applyCarColor(
    car: THREE.Group,
    modelId: VehicleModelId,
    color: number,
    metallicFinish = false,
  ): void {
    const modelSpec = CAR_MODEL_SPECS.find((spec) => spec.id === modelId);
    if (!modelSpec) return;
    const paintNames = new Set(modelSpec.paintMaterials);
    const rimNames = new Set(modelSpec.rimMaterials ?? []);
    const materialClones = new Map<THREE.Material, THREE.Material>();
    const tintMaterial = (source: THREE.Material): THREE.Material => {
      const isPaint = paintNames.has(source.name);
      const isRim = rimNames.has(source.name);
      if (!isPaint && !isRim) return source;
      const existing = materialClones.get(source);
      if (existing) return existing;
      const material = source.clone();
      if (material instanceof THREE.MeshStandardMaterial) {
        material.color.setHex(isRim ? 0xffffff : color);
        material.emissive.setHex(0x000000);
        material.emissiveMap = null;
        if (isRim) {
          material.map = null;
          material.metalnessMap = null;
          material.roughnessMap = null;
          material.metalness = 0.7;
          material.roughness = 0.2;
          material.envMapIntensity = 1.4;
        } else {
          if (modelSpec.removePaintTexture) material.map = null;
          material.metalness = metallicFinish ? 0.78 : Math.max(material.metalness, 0.48);
          material.roughness = metallicFinish ? 0.18 : Math.min(material.roughness, 0.32);
          material.envMapIntensity = metallicFinish ? 1.35 : material.envMapIntensity;
        }
        material.needsUpdate = true;
      }
      materialClones.set(source, material);
      return material;
    };

    car.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.material = Array.isArray(object.material)
        ? object.material.map(tintMaterial)
        : tintMaterial(object.material);
    });
  }

  private prepareModelBrakeLights(car: THREE.Group, modelId: VehicleModelId): ModelBrakeLight[] {
    const modelSpec = CAR_MODEL_SPECS.find((spec) => spec.id === modelId);
    const tailNames = new Set(modelSpec?.tailMaterials ?? []);
    if (tailNames.size === 0) return [];

    const materialClones = new Map<THREE.MeshStandardMaterial, ModelBrakeLight>();
    const prepareMaterial = (source: THREE.Material): THREE.Material => {
      if (!(source instanceof THREE.MeshStandardMaterial) || !tailNames.has(source.name)) {
        return source;
      }
      const existing = materialClones.get(source);
      if (existing) return existing.material;

      const material = source.clone();
      const preserveColor = modelSpec?.preserveTailColor === true;
      const defaultProfile: Omit<ModelBrakeLight, 'material'> = {
        restColor: preserveColor ? source.color.getHex() : 0x8f1118,
        restEmissive: preserveColor ? source.emissive.getHex() : 0x320003,
        restIntensity: preserveColor ? source.emissiveIntensity : 0.85,
        brakingColor: preserveColor ? source.color.getHex() : 0xff2732,
        brakingEmissive: preserveColor ? source.emissive.getHex() : 0xff0712,
        brakingIntensity: preserveColor ? 3.2 : 5.2,
      };
      const light: ModelBrakeLight = {
        material,
        ...(modelSpec?.tailLightProfile ?? defaultProfile),
      };
      material.color.setHex(light.restColor);
      material.emissive.setHex(light.restEmissive);
      material.emissiveIntensity = light.restIntensity;
      material.needsUpdate = true;
      materialClones.set(source, light);
      return material;
    };

    car.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.material = Array.isArray(object.material)
        ? object.material.map(prepareMaterial)
        : prepareMaterial(object.material);
    });
    return [...materialClones.values()];
  }
}
