import * as THREE from 'three';
import { GAME } from '../config';
import {
  isBridgeSection,
  isTunnelSection,
  proceduralTrack,
  roadCenter,
  roadElevation,
  roadHeading,
  roadPitch,
} from '../math';
import type { SceneryAssets } from '../sceneryAssets';

interface VergeSlot {
  distance: number;
  side: -1 | 1;
  offset: number;
  mesh: THREE.Group;
}

const VERGE_COUNT = 64;
const VERGE_SPACING = 14.0; // 64 * 14 = 896m active ring coverage

/**
 * Manages roadside scenery and procedural landmarks for the endless highway.
 * - Pools and recycles landmark meshes across procedural road segments.
 * - Suppresses outdoor vegetation inside tunnels and on elevated bridges.
 * - Reuses 100% of geometries and materials with zero memory growth.
 */
export class HighwayScenerySystem {
  private readonly vergeSlots: VergeSlot[] = [];

  // Bounded pools of reusable landmark meshes
  private readonly gantries: THREE.Group[] = [];
  private readonly tunnelEntrances: THREE.Group[] = [];
  private readonly tunnelExits: THREE.Group[] = [];
  private readonly tunnelRings: THREE.Group[] = [];
  private readonly bridgePylons: THREE.Group[] = [];
  private readonly skylines: THREE.Group[] = [];
  private readonly billboards: THREE.Group[] = [];
  private readonly chevrons: THREE.Group[] = [];
  private readonly emergencyBays: THREE.Group[] = [];
  private readonly markers: THREE.Group[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly assets: SceneryAssets,
  ) {
    this.buildLandmarkPools();
    this.buildVergeRing();
  }

  update(playerDistance: number): void {
    // ── 1. Hide all pooled landmark meshes before reassignment ──
    this.hideAllLandmarks();

    // ── 2. Assign pooled landmarks to active procedural road segments ──
    let gantryIdx = 0;
    let tunnelInIdx = 0;
    let tunnelOutIdx = 0;
    let tunnelRingIdx = 0;
    let bridgePylonIdx = 0;
    let skylineIdx = 0;
    let billboardIdx = 0;
    let chevronIdx = 0;
    let emergencyIdx = 0;
    let markerIdx = 0;

    const activeSegments = proceduralTrack.getActiveSegments();

    for (const seg of activeSegments) {
      // Only populate segments within player view frustum window
      if (seg.endDist < playerDistance - 80 || seg.startDist > playerDistance + 360) {
        continue;
      }

      switch (seg.type) {
        case 'straight':
          if (seg.id % 2 === 0 && gantryIdx < this.gantries.length) {
            this.placeMesh(this.gantries[gantryIdx++], seg.startDist + 75, 0);
          }
          if (billboardIdx < this.billboards.length) {
            this.placeMesh(
              this.billboards[billboardIdx++],
              seg.startDist + 140,
              (seg.id % 2 === 0 ? 1 : -1) * (GAME.roadWidth * 0.5 + 7.5),
              0,
            );
          }
          if (markerIdx < this.markers.length) {
            this.placeMesh(
              this.markers[markerIdx++],
              seg.startDist + 35,
              GAME.roadWidth * 0.5 + 2.5,
            );
          }
          break;

        case 'gentle_left':
          if (chevronIdx < this.chevrons.length) {
            this.placeMesh(
              this.chevrons[chevronIdx++],
              seg.startDist + seg.length * 0.35,
              GAME.roadWidth * 0.5 + 2.4,
              Math.PI,
            );
          }
          if (chevronIdx < this.chevrons.length) {
            this.placeMesh(
              this.chevrons[chevronIdx++],
              seg.startDist + seg.length * 0.65,
              GAME.roadWidth * 0.5 + 2.4,
              Math.PI,
            );
          }
          if (billboardIdx < this.billboards.length) {
            this.placeMesh(
              this.billboards[billboardIdx++],
              seg.startDist + seg.length * 0.15,
              -(GAME.roadWidth * 0.5 + 6.5),
              Math.PI / 10,
            );
          }
          if (emergencyIdx < this.emergencyBays.length) {
            this.placeMesh(
              this.emergencyBays[emergencyIdx++],
              seg.startDist + seg.length * 0.85,
              GAME.roadWidth * 0.5 + 2.8,
              Math.PI,
            );
          }
          break;

        case 'gentle_right':
          if (chevronIdx < this.chevrons.length) {
            this.placeMesh(
              this.chevrons[chevronIdx++],
              seg.startDist + seg.length * 0.35,
              -(GAME.roadWidth * 0.5 + 2.4),
            );
          }
          if (chevronIdx < this.chevrons.length) {
            this.placeMesh(
              this.chevrons[chevronIdx++],
              seg.startDist + seg.length * 0.65,
              -(GAME.roadWidth * 0.5 + 2.4),
            );
          }
          if (billboardIdx < this.billboards.length) {
            this.placeMesh(
              this.billboards[billboardIdx++],
              seg.startDist + seg.length * 0.15,
              GAME.roadWidth * 0.5 + 6.5,
              -Math.PI / 10,
            );
          }
          if (markerIdx < this.markers.length) {
            this.placeMesh(
              this.markers[markerIdx++],
              seg.startDist + 25,
              -(GAME.roadWidth * 0.5 + 2.5),
            );
          }
          break;

        case 'bridge':
          // Cable-stay suspension towers at bridge deck start and end
          if (bridgePylonIdx < this.bridgePylons.length) {
            this.placeMesh(this.bridgePylons[bridgePylonIdx++], seg.startDist + 110, 0);
          }
          if (bridgePylonIdx < this.bridgePylons.length) {
            this.placeMesh(this.bridgePylons[bridgePylonIdx++], seg.endDist - 110, 0);
          }
          break;

        case 'tunnel':
          // Concrete portal at entrance
          if (tunnelInIdx < this.tunnelEntrances.length) {
            this.placeMesh(this.tunnelEntrances[tunnelInIdx++], seg.startDist, 0);
          }
          // Interior arch rings with ceiling lighting every 30m
          for (let d = seg.startDist + 30; d <= seg.endDist - 25; d += 30) {
            if (tunnelRingIdx < this.tunnelRings.length) {
              this.placeMesh(this.tunnelRings[tunnelRingIdx++], d, 0);
            }
          }
          // Concrete portal at exit
          if (tunnelOutIdx < this.tunnelExits.length) {
            this.placeMesh(this.tunnelExits[tunnelOutIdx++], seg.endDist, 0);
          }
          break;

        case 'scenic':
          if (skylineIdx < this.skylines.length) {
            this.placeMesh(
              this.skylines[skylineIdx++],
              seg.startDist + 80,
              125,
              Math.PI,
              -2,
              false,
            );
          }
          if (skylineIdx < this.skylines.length) {
            this.placeMesh(this.skylines[skylineIdx++], seg.startDist + 160, -135, 0, -2, false);
          }
          if (billboardIdx < this.billboards.length) {
            this.placeMesh(
              this.billboards[billboardIdx++],
              seg.startDist + 50,
              GAME.roadWidth * 0.5 + 7.5,
              -Math.PI / 8,
            );
          }
          if (emergencyIdx < this.emergencyBays.length) {
            this.placeMesh(
              this.emergencyBays[emergencyIdx++],
              seg.startDist + 140,
              GAME.roadWidth * 0.5 + 2.8,
              Math.PI,
            );
          }
          break;
      }
    }

    // ── 3. Update Recycling Verge Scenery (Streetlights, Pines, Rocks) ──
    const ringLength = this.vergeSlots.length * VERGE_SPACING;
    for (const slot of this.vergeSlots) {
      while (slot.distance < playerDistance - 65) {
        slot.distance += ringLength;
      }

      const gap = slot.distance - playerDistance;
      const inRange = gap >= -65 && gap <= 240;
      if (!inRange) {
        slot.mesh.visible = false;
        continue;
      }

      // Suppress trees & rocks inside tunnels and on elevated bridges
      const isInsideTunnel = isTunnelSection(slot.distance);
      const isBridge = isBridgeSection(slot.distance);
      const kind = slot.mesh.userData.kind;

      if ((isInsideTunnel || isBridge) && (kind === 'pine-tree' || kind === 'rock')) {
        slot.mesh.visible = false;
        continue;
      }

      slot.mesh.visible = true;
      const center = roadCenter(slot.distance);
      const heading = roadHeading(slot.distance);
      const pitch = roadPitch(slot.distance);
      const elevation = roadElevation(slot.distance);

      const isVergeMount = kind === 'highway-pole' || kind === 'highway-marker';
      const objElevation = isVergeMount ? elevation : Math.min(0, elevation);

      const sideX = Math.cos(heading);
      const sideZ = -Math.sin(heading);
      const lateral = slot.side * slot.offset;

      slot.mesh.position.set(
        center + sideX * lateral,
        objElevation,
        -slot.distance + sideZ * lateral,
      );

      if (isVergeMount) {
        slot.mesh.rotation.set(-pitch, heading + (slot.side === 1 ? Math.PI : 0), 0);
      } else {
        slot.mesh.rotation.set(0, heading + slot.mesh.userData.baseAngle, 0);
      }
    }
  }

  reset(): void {
    this.vergeSlots.forEach((slot, index) => {
      slot.distance = -48 + index * VERGE_SPACING;
    });
    this.hideAllLandmarks();
  }

  getNatureTargets(): readonly THREE.Group[] {
    return this.vergeSlots
      .map((slot) => slot.mesh)
      .filter((mesh) => mesh.userData.kind === 'pine-tree');
  }

  dispose(): void {
    const allPools = [
      this.gantries,
      this.tunnelEntrances,
      this.tunnelExits,
      this.tunnelRings,
      this.bridgePylons,
      this.skylines,
      this.billboards,
      this.chevrons,
      this.emergencyBays,
      this.markers,
    ];
    for (const pool of allPools) {
      for (const mesh of pool) {
        this.scene.remove(mesh);
      }
      pool.length = 0;
    }
    for (const slot of this.vergeSlots) {
      this.scene.remove(slot.mesh);
    }
    this.vergeSlots.length = 0;
  }

  private placeMesh(
    mesh: THREE.Group,
    dist: number,
    offset: number,
    rotY = 0,
    baseY = 0,
    alignPitch = true,
  ): void {
    const center = roadCenter(dist);
    const heading = roadHeading(dist);
    const pitch = alignPitch ? roadPitch(dist) : 0;
    const elevation = roadElevation(dist);

    const sideX = Math.cos(heading);
    const sideZ = -Math.sin(heading);

    mesh.position.set(center + sideX * offset, elevation + baseY, -dist + sideZ * offset);
    mesh.rotation.set(-pitch, heading + rotY, 0);
    mesh.visible = true;
  }

  private hideAllLandmarks(): void {
    const allPools = [
      this.gantries,
      this.tunnelEntrances,
      this.tunnelExits,
      this.tunnelRings,
      this.bridgePylons,
      this.skylines,
      this.billboards,
      this.chevrons,
      this.emergencyBays,
      this.markers,
    ];
    for (const pool of allPools) {
      for (let i = 0; i < pool.length; i++) {
        pool[i].visible = false;
      }
    }
  }

  private buildLandmarkPools(): void {
    // 3 Overhead Gantries
    for (let i = 0; i < 3; i++) {
      const gantry = this.assets.createHighwayGantry(
        i === 0 ? '⬉ RIVAL CITY / METRO' : 'EXPRESSWAY WAY ⬈',
        i === 0 ? 'NORTH EXPRESSWAY ⬈' : 'ALL LANES OPEN',
      );
      gantry.visible = false;
      this.gantries.push(gantry);
      this.scene.add(gantry);
    }

    // 2 Tunnel Entrance Portals & 2 Exit Portals
    for (let i = 0; i < 2; i++) {
      const portalIn = this.assets.createTunnelPortal('CEDAR RIDGE TUNNEL', false);
      portalIn.visible = false;
      this.tunnelEntrances.push(portalIn);
      this.scene.add(portalIn);

      const portalOut = this.assets.createTunnelPortal('CEDAR RIDGE TUNNEL', true);
      portalOut.visible = false;
      this.tunnelExits.push(portalOut);
      this.scene.add(portalOut);
    }

    // 12 Tunnel Interior Arch Rings
    for (let i = 0; i < 12; i++) {
      const ring = this.assets.createTunnelRing();
      ring.visible = false;
      this.tunnelRings.push(ring);
      this.scene.add(ring);
    }

    // 4 Cable-Stay Bridge Pylon Pairs
    for (let i = 0; i < 4; i++) {
      const pylons = this.assets.createBridgePylons();
      pylons.visible = false;
      this.bridgePylons.push(pylons);
      this.scene.add(pylons);
    }

    // 4 Distant Skyline Clusters
    for (let i = 0; i < 4; i++) {
      const skyline = this.assets.createDistantBuildingCluster(i % 2);
      skyline.visible = false;
      this.skylines.push(skyline);
      this.scene.add(skyline);
    }

    // 6 Commercial Highway Billboards
    for (let i = 0; i < 6; i++) {
      const billboard = this.assets.createHighwayBillboard(i % 2);
      billboard.visible = false;
      this.billboards.push(billboard);
      this.scene.add(billboard);
    }

    // 8 Curve Chevrons
    for (let i = 0; i < 8; i++) {
      const chevron = this.assets.createCurveChevronSign(i % 2 === 0 ? 'left' : 'right');
      chevron.visible = false;
      this.chevrons.push(chevron);
      this.scene.add(chevron);
    }

    // 3 Emergency SOS Bays
    for (let i = 0; i < 3; i++) {
      const sos = this.assets.createEmergencyBay();
      sos.visible = false;
      this.emergencyBays.push(sos);
      this.scene.add(sos);
    }

    // 4 Highway Markers
    for (let i = 0; i < 4; i++) {
      const marker = this.assets.createHighwayMarker();
      marker.visible = false;
      this.markers.push(marker);
      this.scene.add(marker);
    }
  }

  private buildVergeRing(): void {
    for (let i = 0; i < VERGE_COUNT; i++) {
      const isRight = i % 2 !== 0;
      const side = isRight ? 1 : -1;
      let mesh: THREE.Group;
      let offset: number;

      if (i % 4 === 0) {
        mesh = this.assets.createHighwayLightPole();
        offset = GAME.roadWidth * 0.5 + 2.2;
      } else if (i % 6 === 0) {
        mesh = this.assets.createRock();
        offset = GAME.roadWidth * 0.5 + 6.0 + ((i * 4) % 7);
      } else {
        mesh = this.assets.createTree();
        offset = GAME.roadWidth * 0.5 + 5.5 + ((i * 7) % 9);
      }

      mesh.userData.baseAngle = (i * 2.39) % (Math.PI * 2);
      this.vergeSlots.push({
        distance: -48 + i * VERGE_SPACING,
        side,
        offset,
        mesh,
      });
      this.scene.add(mesh);
    }
  }
}
