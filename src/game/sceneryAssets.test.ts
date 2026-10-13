import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PINE_TREE_MODEL_PATH, SceneryAssets } from './sceneryAssets';
import { HighwayScenerySystem } from './world/HighwayScenerySystem';

describe('SceneryAssets', () => {
  it('uses the optimized pine tree variant', () => {
    expect(PINE_TREE_MODEL_PATH).toBe('tree/pine_tree_1.glb');
  });

  it('creates highway infrastructure landmarks with valid hierarchies', () => {
    const assets = new SceneryAssets(new THREE.MeshStandardMaterial());

    const gantry = assets.createHighwayGantry();
    expect(gantry.userData.kind).toBe('highway-gantry');
    expect(gantry.children.length).toBeGreaterThanOrEqual(4);

    const tunnelIn = assets.createTunnelPortal('CEDAR RIDGE TUNNEL', false);
    expect(tunnelIn.userData.kind).toBe('tunnel-portal');

    const tunnelOut = assets.createTunnelPortal('CEDAR RIDGE TUNNEL', true);
    expect(tunnelOut.userData.kind).toBe('tunnel-exit');

    const tunnelRing = assets.createTunnelRing();
    expect(tunnelRing.userData.kind).toBe('tunnel-ring');

    const pylons = assets.createBridgePylons();
    expect(pylons.userData.kind).toBe('bridge-pylons');

    const skyline = assets.createDistantBuildingCluster(0);
    expect(skyline.userData.kind).toBe('distant-buildings');

    const billboard = assets.createHighwayBillboard(0);
    expect(billboard.userData.kind).toBe('highway-billboard');

    const chevron = assets.createCurveChevronSign('left');
    expect(chevron.userData.kind).toBe('chevron-sign');

    const hill = assets.createRoadsideHill();
    expect(hill.userData.kind).toBe('roadside-hill');

    const sos = assets.createEmergencyBay();
    expect(sos.userData.kind).toBe('emergency-bay');
  });
});

describe('HighwayScenerySystem', () => {
  it('initializes landmarks and verge ring without throwing', () => {
    const scene = new THREE.Scene();
    const assets = new SceneryAssets(new THREE.MeshStandardMaterial());
    const system = new HighwayScenerySystem(scene, assets);

    expect(system.getNatureTargets().length).toBeGreaterThan(0);

    // Update at straight, left curve, tunnel, right curve, and bridge distances
    system.update(50);
    system.update(350);
    system.update(580); // Tunnel interior
    system.update(850);
    system.update(1150); // Bridge overpass

    // Endless mode wrap
    system.update(2100);

    system.reset();
    system.dispose();
  });

  it('supports long-distance endless driving with landmark recycling', () => {
    const scene = new THREE.Scene();
    const assets = new SceneryAssets(new THREE.MeshStandardMaterial());
    const system = new HighwayScenerySystem(scene, assets);

    // Drive for 25,000 meters across procedural segments
    for (let dist = 0; dist <= 25000; dist += 250) {
      system.update(dist);
    }

    system.reset();
    system.dispose();
  });
});
