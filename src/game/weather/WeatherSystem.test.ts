import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { WeatherSystem } from './WeatherSystem';
import type { SceneLighting } from '../sceneAssets';

describe('WeatherSystem', () => {
  let scene: THREE.Scene;
  let lighting: SceneLighting;
  let roadMaterial: THREE.MeshStandardMaterial;
  let shoulderMaterial: THREE.MeshStandardMaterial;
  let groundSnow: THREE.Mesh;
  let weather: WeatherSystem;

  beforeEach(() => {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9bb8bd);
    scene.fog = new THREE.FogExp2(0x9bb8bd, 0.0025);

    lighting = {
      sun: new THREE.DirectionalLight(0xfff1ce, 3.2),
      hemisphere: new THREE.HemisphereLight(0xdaf7ff, 0x31442c, 1.55),
      target: new THREE.Object3D(),
      visual: new THREE.Group(),
    };

    roadMaterial = new THREE.MeshStandardMaterial({ roughness: 0.96, metalness: 0.02 });
    shoulderMaterial = new THREE.MeshStandardMaterial({ roughness: 0.96 });
    groundSnow = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.72 }),
    );

    weather = new WeatherSystem({
      scene,
      lighting,
      roadMaterial,
      shoulderMaterial,
      groundSnow,
    });
  });

  it('initializes with clear weather and starts ground snow at opacity 0', () => {
    expect(weather.getMode()).toBe('auto');
    expect(weather.getWeatherType()).toBe('clear');
    expect((groundSnow.material as THREE.MeshStandardMaterial).opacity).toBe(0);
  });

  it('cycles weather modes correctly', () => {
    expect(weather.cycleMode()).toBe('rain');
    expect(weather.cycleMode()).toBe('storm');
    expect(weather.cycleMode()).toBe('snow');
    expect(weather.cycleMode()).toBe('fog');
    expect(weather.cycleMode()).toBe('clear');
    expect(weather.cycleMode()).toBe('auto');
  });

  it('updates rain intensity, darkens and increases gloss of wet road during rain', () => {
    weather.setMode('rain');
    const camPos = new THREE.Vector3(0, 1, 0);
    const playerPos = new THREE.Vector3(0, 0, 0);

    // Simulate several frames of rain
    for (let i = 0; i < 20; i++) {
      weather.update(0.1, 100, 25, 0, camPos, playerPos);
    }

    expect(weather.getRainIntensity()).toBeGreaterThan(0.5);
    expect(weather.getWeatherType()).toBe('rain');
    expect(weather.getRoadWetness()).toBeGreaterThan(0.5);

    // Road roughness should have dropped significantly (glossy wet asphalt)
    expect(roadMaterial.roughness).toBeLessThan(0.7);
    expect(roadMaterial.metalness).toBeGreaterThan(0.1);

    // Road surface remains bright and legible for high road visibility (not pitch black)
    expect(roadMaterial.color.r).toBeGreaterThan(0.9);

    // Sun and ambient hemisphere lighting stay bright for clear car visibility
    expect(lighting.sun.intensity).toBeGreaterThan(2.0);
    expect(lighting.hemisphere.intensity).toBeGreaterThan(1.2);

    // Fog remains gentle to allow long-distance visibility of traffic
    expect((scene.fog as THREE.FogExp2).density).toBeLessThan(0.0045);
  });

  it('updates snow intensity and increases ground snow layer opacity during snowfall', () => {
    weather.setMode('snow');
    const camPos = new THREE.Vector3(0, 1, 0);
    const playerPos = new THREE.Vector3(0, 0, 0);

    for (let i = 0; i < 30; i++) {
      weather.update(0.1, 100, 25, 0, camPos, playerPos);
    }

    expect(weather.getSnowIntensity()).toBeGreaterThan(0.5);
    expect(weather.getWeatherType()).toBe('snow');
    const snowMat = groundSnow.material as THREE.MeshStandardMaterial;
    expect(snowMat.opacity).toBeGreaterThan(0.4);
    expect(groundSnow.visible).toBe(true);
  });

  it('automatically transitions climates and emits notices over time in auto mode', () => {
    weather.setMode('auto');
    const camPos = new THREE.Vector3(0, 1, 0);
    const playerPos = new THREE.Vector3(0, 0, 0);

    // Initial weather is clear
    weather.update(0.1, 0, 0, 0, camPos, playerPos);
    expect(weather.getWeatherType()).toBe('clear');

    // Advance time into the rainstorm climate phase (around 27 seconds)
    for (let i = 0; i < 270; i++) {
      weather.update(0.1, 0, 0, 0, camPos, playerPos);
    }
    expect(weather.getRainIntensity()).toBeGreaterThan(0.3);
    expect(weather.getWeatherType()).toBe('rain');

    const notice = weather.getClimateChangedNotice();
    expect(notice).toBe('CLIMATE: TORRENTIAL RAINSTORM');
  });

  it('updates fog intensity and increases fog density during mountain fog', () => {
    weather.setMode('fog');
    const camPos = new THREE.Vector3(0, 1, 0);
    const playerPos = new THREE.Vector3(0, 0, 0);

    for (let i = 0; i < 20; i++) {
      weather.update(0.1, 100, 25, 0, camPos, playerPos);
    }

    expect(weather.getFogIntensity()).toBeGreaterThan(0.5);
    expect(weather.getWeatherType()).toBe('fog');
    const condition = weather.getRoadCondition(80);
    expect(condition.surface).toBe('damp');
    expect(condition.grip).toBeLessThan(0.95);
    expect(condition.grip).toBeGreaterThan(0.75);
    expect(condition.label).toContain('DAMP FOG');
  });

  it('updates storm mode with flooded road condition and hydroplane risk at high speed', () => {
    weather.setMode('storm');
    const camPos = new THREE.Vector3(0, 1, 0);
    const playerPos = new THREE.Vector3(0, 0, 0);

    for (let i = 0; i < 20; i++) {
      weather.update(0.1, 100, 25, 0, camPos, playerPos);
    }

    expect(weather.getStormIntensity()).toBeGreaterThan(0.5);
    expect(weather.getWeatherType()).toBe('storm');
    const highSpeedCondition = weather.getRoadCondition(150);
    expect(highSpeedCondition.surface).toBe('flooded');
    expect(highSpeedCondition.hydroplaneRisk).toBeGreaterThan(0.5);
    expect(highSpeedCondition.statusType).toBe('danger');
    expect(highSpeedCondition.label).toContain('HYDROPLANE RISK');
  });

  it('cleans up resources on dispose', () => {
    weather.dispose();
    // After dispose, scene should no longer have the particles attached
    expect(() => weather.dispose()).not.toThrow();
  });
});
