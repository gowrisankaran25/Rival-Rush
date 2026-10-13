import * as THREE from 'three';
import { GAME } from '../config';
import { roadCenter, roadElevation, roadHeading, roadPitch } from '../math';

interface GuardrailSlot {
  distance: number;
}

const SEGMENT_LENGTH = 8.0;
const SEGMENT_COUNT = 36; // 36 * 8.0 = 288m total active highway coverage

/**
 * Maintains a recycled ring of instanced galvanized steel highway guardrails along
 * BOTH sides of the highway, conforming to road curves and elevation changes.
 * Also generates instanced concrete bridge support piers beneath elevated spans.
 */
export class RoadsideFenceSystem {
  private readonly slots: GuardrailSlot[] = [];
  private readonly postGeometry = new THREE.BoxGeometry(0.16, 1.1, 0.16);
  private readonly railGeometry = new THREE.BoxGeometry(0.14, 0.36, SEGMENT_LENGTH + 0.1);
  private readonly rubRailGeometry = new THREE.BoxGeometry(0.1, 0.22, SEGMENT_LENGTH + 0.1);
  private readonly delineatorGeometry = new THREE.BoxGeometry(0.08, 0.18, 0.08);
  private readonly pierGeometry = new THREE.BoxGeometry(GAME.roadWidth - 2.0, 1.0, 3.2);

  private readonly steelMaterial = new THREE.MeshStandardMaterial({
    color: 0xc4cbd5,
    roughness: 0.32,
    metalness: 0.82,
  });

  private readonly delineatorMaterial = new THREE.MeshStandardMaterial({
    color: 0xffaa00,
    emissive: 0x442a00,
    roughness: 0.22,
    metalness: 0.1,
  });

  private readonly concreteMaterial = new THREE.MeshStandardMaterial({
    color: 0x66707c,
    roughness: 0.94,
    metalness: 0.04,
  });

  private readonly transform = new THREE.Object3D();

  private readonly posts = new THREE.InstancedMesh(
    this.postGeometry,
    this.steelMaterial,
    SEGMENT_COUNT * 2,
  );
  private readonly rails = new THREE.InstancedMesh(
    this.railGeometry,
    this.steelMaterial,
    SEGMENT_COUNT * 2,
  );
  private readonly rubRails = new THREE.InstancedMesh(
    this.rubRailGeometry,
    this.steelMaterial,
    SEGMENT_COUNT * 2,
  );
  private readonly delineators = new THREE.InstancedMesh(
    this.delineatorGeometry,
    this.delineatorMaterial,
    SEGMENT_COUNT * 2,
  );
  private readonly piers = new THREE.InstancedMesh(
    this.pierGeometry,
    this.concreteMaterial,
    SEGMENT_COUNT,
  );

  private initialized = false;
  private lastPlayerDistance = 0;
  private nextRecycleDistance = Number.NEGATIVE_INFINITY;

  constructor(private readonly scene: THREE.Scene) {
    this.posts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rails.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rubRails.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.delineators.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.piers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    this.posts.castShadow = true;
    this.posts.receiveShadow = true;
    this.rails.castShadow = true;
    this.rails.receiveShadow = true;
    this.rubRails.castShadow = true;
    this.rubRails.receiveShadow = true;
    this.delineators.castShadow = false;
    this.delineators.receiveShadow = false;
    this.piers.castShadow = true;
    this.piers.receiveShadow = true;

    // Recycled around player; disable static bounding box culling
    this.posts.frustumCulled = false;
    this.rails.frustumCulled = false;
    this.rubRails.frustumCulled = false;
    this.delineators.frustumCulled = false;
    this.piers.frustumCulled = false;

    for (let index = 0; index < SEGMENT_COUNT; index += 1) {
      this.slots.push({
        distance: -48 + index * SEGMENT_LENGTH,
      });
    }
    this.scene.add(this.posts, this.rails, this.rubRails, this.delineators, this.piers);
  }

  update(playerDistance: number): void {
    if (this.initialized && playerDistance < this.lastPlayerDistance - 1) {
      this.resetSlots();
    }
    this.lastPlayerDistance = playerDistance;
    if (this.initialized && playerDistance <= this.nextRecycleDistance) return;

    const ringLength = this.slots.length * SEGMENT_LENGTH;

    for (let slotIdx = 0; slotIdx < this.slots.length; slotIdx += 1) {
      const slot = this.slots[slotIdx];
      while (slot.distance < playerDistance - 52) slot.distance += ringLength;
      const midpoint = slot.distance + SEGMENT_LENGTH * 0.5;

      const leftIdx = slotIdx * 2;
      const rightIdx = slotIdx * 2 + 1;

      // Both sides: Left (-1) and Right (1)
      this.setInstance(this.posts, leftIdx, slot.distance, -1, 0.52);
      this.setInstance(this.posts, rightIdx, slot.distance, 1, 0.52);

      this.setInstance(this.rails, leftIdx, midpoint, -1, 0.72);
      this.setInstance(this.rails, rightIdx, midpoint, 1, 0.72);

      this.setInstance(this.rubRails, leftIdx, midpoint, -1, 0.38);
      this.setInstance(this.rubRails, rightIdx, midpoint, 1, 0.38);

      this.setInstance(this.delineators, leftIdx, slot.distance, -1, 0.98);
      this.setInstance(this.delineators, rightIdx, slot.distance, 1, 0.98);

      // Elevated bridge support piers
      const elevation = roadElevation(slot.distance);
      if (elevation > 0.8 && slotIdx % 3 === 0) {
        const center = roadCenter(slot.distance);
        const heading = roadHeading(slot.distance);
        this.transform.position.set(center, elevation * 0.5, -slot.distance);
        this.transform.rotation.set(0, heading, 0);
        this.transform.scale.set(1, elevation, 1);
        this.transform.updateMatrix();
        this.piers.setMatrixAt(slotIdx, this.transform.matrix);
      } else {
        this.transform.position.set(0, -100, 0);
        this.transform.scale.set(0, 0, 0);
        this.transform.updateMatrix();
        this.piers.setMatrixAt(slotIdx, this.transform.matrix);
      }
    }

    this.posts.instanceMatrix.needsUpdate = true;
    this.rails.instanceMatrix.needsUpdate = true;
    this.rubRails.instanceMatrix.needsUpdate = true;
    this.delineators.instanceMatrix.needsUpdate = true;
    this.piers.instanceMatrix.needsUpdate = true;
    this.initialized = true;
    this.nextRecycleDistance = Math.min(...this.slots.map((slot) => slot.distance + 52));
  }

  dispose(): void {
    this.scene.remove(this.posts, this.rails, this.rubRails, this.delineators, this.piers);
    this.postGeometry.dispose();
    this.railGeometry.dispose();
    this.rubRailGeometry.dispose();
    this.delineatorGeometry.dispose();
    this.pierGeometry.dispose();
    this.steelMaterial.dispose();
    this.delineatorMaterial.dispose();
    this.concreteMaterial.dispose();
  }

  private setInstance(
    mesh: THREE.InstancedMesh,
    index: number,
    distance: number,
    side: -1 | 1,
    height: number,
  ): void {
    const heading = roadHeading(distance);
    const pitch = roadPitch(distance);
    const elevation = roadElevation(distance);
    // Align right outside asphalt edge (roadWidth / 2 = 14.25m + 1.15m margin = 15.4m)
    const offset = side * (GAME.roadWidth * 0.5 + 1.15);
    this.transform.position.set(
      roadCenter(distance) + Math.cos(heading) * offset,
      elevation + height,
      -distance - Math.sin(heading) * offset,
    );
    this.transform.rotation.set(-pitch, heading, 0);
    this.transform.scale.set(1, 1, 1);
    this.transform.updateMatrix();
    mesh.setMatrixAt(index, this.transform.matrix);
  }

  reset(): void {
    this.resetSlots();
  }

  private resetSlots(): void {
    this.slots.forEach((slot, index) => {
      slot.distance = -48 + index * SEGMENT_LENGTH;
    });
    this.initialized = false;
    this.nextRecycleDistance = Number.NEGATIVE_INFINITY;
  }
}
