import * as THREE from 'three';
import { roadCenter, roadElevation, roadHeading, roadPitch } from '../math';
import { GAME } from '../config';

/**
 * 3D Finish Line Gantry, asphalt checkered strip, approach markers, and victory celebration confetti.
 */
export class FinishLineGantry {
  private readonly group = new THREE.Group();
  private readonly markerGroup = new THREE.Group();
  private finishDistance: number | null = null;
  private confettiMesh?: THREE.Points;
  private confettiPositions?: Float32Array;
  private confettiVelocities?: Float32Array;
  private confettiActive = false;
  private confettiElapsed = 0;

  constructor(private readonly scene: THREE.Scene) {
    this.scene.add(this.group);
    this.scene.add(this.markerGroup);
  }

  setFinishDistance(distance: number | null): void {
    this.finishDistance = distance;
    this.confettiActive = false;
    this.confettiElapsed = 0;
    if (this.confettiMesh) this.confettiMesh.visible = false;

    if (distance === null) {
      this.group.visible = false;
      this.markerGroup.visible = false;
      return;
    }

    this.buildGantry(distance);
    this.buildApproachMarkers(distance);
    this.group.visible = true;
    this.markerGroup.visible = true;
  }

  getFinishDistance(): number | null {
    return this.finishDistance;
  }

  private buildGantry(distance: number): void {
    // Clear previous children
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      this.group.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    }

    const roadW = GAME.roadWidth;
    const span = roadW + 10;
    const height = 7.2;

    const steelMat = new THREE.MeshStandardMaterial({
      color: 0x1a1e24,
      metalness: 0.85,
      roughness: 0.25,
    });

    const yellowAccentMat = new THREE.MeshBasicMaterial({
      color: 0xe9ff42,
    });

    // Left & Right Pillars
    const pillarGeom = new THREE.BoxGeometry(0.8, height, 0.8);
    const leftPillar = new THREE.Mesh(pillarGeom, steelMat);
    leftPillar.position.set(-span / 2, height / 2, 0);
    this.group.add(leftPillar);

    const rightPillar = new THREE.Mesh(pillarGeom, steelMat);
    rightPillar.position.set(span / 2, height / 2, 0);
    this.group.add(rightPillar);

    // Cross beam truss
    const beamGeom = new THREE.BoxGeometry(span + 1.2, 0.7, 0.9);
    const crossBeam = new THREE.Mesh(beamGeom, steelMat);
    crossBeam.position.set(0, height, 0);
    this.group.add(crossBeam);

    // LED Finish Banner Canvas
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#0a0d12';
      ctx.fillRect(0, 0, 1024, 256);

      // Checkered borders
      const checkSize = 24;
      for (let x = 0; x < 1024; x += checkSize) {
        for (let row = 0; row < 2; row++) {
          const isWhite = (Math.floor(x / checkSize) + row) % 2 === 0;
          ctx.fillStyle = isWhite ? '#ffffff' : '#000000';
          ctx.fillRect(x, row * checkSize, checkSize, checkSize);
          ctx.fillRect(x, 256 - (row + 1) * checkSize, checkSize, checkSize);
        }
      }

      // Neon frame
      ctx.strokeStyle = '#e9ff42';
      ctx.lineWidth = 6;
      ctx.strokeRect(12, 54, 1000, 148);

      // Digital Text
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 68px "Arial Black", Impact, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('FINISH LINE', 512, 115);

      ctx.fillStyle = '#e9ff42';
      ctx.font = '700 28px sans-serif';
      ctx.fillText('▼  R I V A L   R U S H   C H E C K P O I N T  ▼', 512, 168);
    }

    const bannerTex = new THREE.CanvasTexture(canvas);
    const bannerMat = new THREE.MeshBasicMaterial({
      map: bannerTex,
      side: THREE.DoubleSide,
    });
    const bannerGeom = new THREE.PlaneGeometry(span - 2, 2.6);
    const bannerMesh = new THREE.Mesh(bannerGeom, bannerMat);
    bannerMesh.position.set(0, height - 1.2, 0);
    this.group.add(bannerMesh);

    // Asphalt checkered finish stripe on the road
    const stripCanvas = document.createElement('canvas');
    stripCanvas.width = 512;
    stripCanvas.height = 128;
    const sCtx = stripCanvas.getContext('2d');
    if (sCtx) {
      const sz = 32;
      for (let y = 0; y < 128; y += sz) {
        for (let x = 0; x < 512; x += sz) {
          const isWhite = (Math.floor(x / sz) + Math.floor(y / sz)) % 2 === 0;
          sCtx.fillStyle = isWhite ? '#ffffff' : '#111317';
          sCtx.fillRect(x, y, sz, sz);
        }
      }
    }
    const stripTex = new THREE.CanvasTexture(stripCanvas);
    stripTex.wrapS = THREE.RepeatWrapping;
    stripTex.repeat.set(4, 1);
    const stripMat = new THREE.MeshBasicMaterial({
      map: stripTex,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    const stripGeom = new THREE.PlaneGeometry(roadW, 3.2);
    const stripMesh = new THREE.Mesh(stripGeom, stripMat);
    stripMesh.rotation.x = -Math.PI / 2;
    stripMesh.position.set(0, 0.05, 0);
    this.group.add(stripMesh);

    // Overhead spotlights
    for (let i = -2; i <= 2; i++) {
      const lightMesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.25, 0.5), yellowAccentMat);
      lightMesh.position.set(i * (span / 6), height + 0.35, 0);
      this.group.add(lightMesh);
    }

    this.updateGantryTransform(distance);
  }

  private buildApproachMarkers(finishDist: number): void {
    while (this.markerGroup.children.length > 0) {
      const child = this.markerGroup.children[0];
      this.markerGroup.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    }

    const offsets = [500, 300, 200, 100];
    for (const offset of offsets) {
      const markerDist = finishDist - offset;
      if (markerDist <= 50) continue;

      const marker = this.createDistanceSign(`${offset}M`);
      const h = roadHeading(markerDist);
      const elev = roadElevation(markerDist);
      const pitch = roadPitch(markerDist);
      const cx = roadCenter(markerDist);
      const roadW = GAME.roadWidth;

      // Place signs on both sides of the highway
      const leftX = cx + Math.cos(h) * (-roadW / 2 - 2.8);
      const leftZ = -markerDist - Math.sin(h) * (-roadW / 2 - 2.8);
      marker.position.set(leftX, elev + 2.2, leftZ);
      marker.rotation.set(-pitch, h, 0);
      this.markerGroup.add(marker);
    }
  }

  private createDistanceSign(text: string): THREE.Group {
    const group = new THREE.Group();
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#11141b';
      ctx.fillRect(0, 0, 256, 128);
      ctx.strokeStyle = '#e9ff42';
      ctx.lineWidth = 8;
      ctx.strokeRect(6, 6, 244, 116);

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 52px "Arial Black", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 128, 55);

      ctx.fillStyle = '#e9ff42';
      ctx.font = '700 20px sans-serif';
      ctx.fillText('FINISH AHEAD', 128, 98);
    }

    const tex = new THREE.CanvasTexture(canvas);
    const signMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
    const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), signMat);
    group.add(signMesh);

    // Pole
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x333a44, metalness: 0.8 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4), poleMat);
    pole.position.set(0, -1.2, 0);
    group.add(pole);

    return group;
  }

  private updateGantryTransform(distance: number): void {
    const h = roadHeading(distance);
    const elev = roadElevation(distance);
    const pitch = roadPitch(distance);
    const cx = roadCenter(distance);

    this.group.position.set(cx, elev, -distance);
    this.group.rotation.set(-pitch, h, 0);
  }

  triggerVictoryConfetti(playerPos: THREE.Vector3): void {
    if (this.confettiActive) return;
    this.confettiActive = true;
    this.confettiElapsed = 0;

    const count = 350;
    if (!this.confettiMesh) {
      const positions = new Float32Array(count * 3);
      const velocities = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);

      const palette = [
        [0.91, 1.0, 0.26], // neon lime #e9ff42
        [1.0, 0.84, 0.0], // gold
        [0.0, 0.9, 1.0], // cyan
        [1.0, 0.2, 0.4], // magenta/red
        [1.0, 1.0, 1.0], // pure white
      ];

      for (let i = 0; i < count; i++) {
        const color = palette[Math.floor(Math.random() * palette.length)];
        colors[i * 3] = color[0];
        colors[i * 3 + 1] = color[1];
        colors[i * 3 + 2] = color[2];
      }

      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

      const mat = new THREE.PointsMaterial({
        size: 0.35,
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      });

      this.confettiMesh = new THREE.Points(geom, mat);
      this.confettiMesh.frustumCulled = false;
      this.scene.add(this.confettiMesh);
      this.confettiPositions = positions;
      this.confettiVelocities = velocities;
    }

    const pos = this.confettiPositions!;
    const vel = this.confettiVelocities!;
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      pos[i3] = playerPos.x + (Math.random() - 0.5) * 14;
      pos[i3 + 1] = playerPos.y + 2.5 + Math.random() * 6;
      pos[i3 + 2] = playerPos.z + (Math.random() - 0.5) * 12;

      vel[i3] = (Math.random() - 0.5) * 8;
      vel[i3 + 1] = 4 + Math.random() * 8;
      vel[i3 + 2] = (Math.random() - 0.5) * 8;
    }

    this.confettiMesh.visible = true;
    const posAttr = this.confettiMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    posAttr.needsUpdate = true;
  }

  update(dt: number): void {
    if (
      !this.confettiActive ||
      !this.confettiMesh ||
      !this.confettiPositions ||
      !this.confettiVelocities
    ) {
      return;
    }

    this.confettiElapsed += dt;
    const pos = this.confettiPositions;
    const vel = this.confettiVelocities;
    const count = pos.length / 3;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      vel[i3 + 1] -= 9.8 * dt; // gravity
      pos[i3] += (vel[i3] + Math.sin(this.confettiElapsed * 4 + i) * 1.5) * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += vel[i3 + 2] * dt;
    }

    const posAttr = this.confettiMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    posAttr.needsUpdate = true;

    if (this.confettiElapsed > 6) {
      this.confettiActive = false;
      this.confettiMesh.visible = false;
    }
  }

  dispose(): void {
    if (this.confettiMesh) {
      this.scene.remove(this.confettiMesh);
      this.confettiMesh.geometry.dispose();
      (this.confettiMesh.material as THREE.Material).dispose();
    }
    this.scene.remove(this.group);
    this.scene.remove(this.markerGroup);
  }
}
