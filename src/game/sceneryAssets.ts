import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

interface NatureModelOptions {
  kind: 'pine-tree';
  path: string;
  targetHeight: number;
  castShadow: boolean;
}

export const PINE_TREE_MODEL_PATH = 'tree/pine_tree_1.glb';

export class SceneryAssets {
  private pineTreePrototype?: THREE.Group;
  private greatMountainPrototype?: THREE.Group;

  constructor(private readonly rockMaterial: THREE.MeshStandardMaterial) {}

  createTree(): THREE.Group {
    const group = new THREE.Group();
    group.userData.kind = 'pine-tree';
    if (this.pineTreePrototype) group.add(this.pineTreePrototype.clone(true));
    return group;
  }

  createRock(): THREE.Group {
    const group = new THREE.Group();
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.25, 0), this.rockMaterial);
    rock.scale.set(1.2, 0.7, 0.9);
    rock.position.y = 0.7;
    rock.castShadow = true;
    group.add(rock);
    return group;
  }

  createHighwayLightPole(): THREE.Group {
    const group = new THREE.Group();
    group.userData.kind = 'highway-pole';

    const steelMat = new THREE.MeshStandardMaterial({
      color: 0x8a95a0,
      metalness: 0.85,
      roughness: 0.35,
    });

    // Vertical mast: height 7.5m, tapered cylinder
    const poleGeom = new THREE.CylinderGeometry(0.12, 0.22, 7.5, 8);
    const pole = new THREE.Mesh(poleGeom, steelMat);
    pole.position.y = 3.75;
    pole.castShadow = true;
    group.add(pole);

    // Cantilever arm extending inward over shoulder
    const armGeom = new THREE.CylinderGeometry(0.08, 0.11, 3.2, 8);
    const arm = new THREE.Mesh(armGeom, steelMat);
    arm.position.set(1.2, 7.3, 0);
    arm.rotation.z = -Math.PI / 3.2;
    group.add(arm);

    // Luminaire fixture head
    const headGeom = new THREE.BoxGeometry(0.4, 0.16, 0.7);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0x4a525d,
      roughness: 0.5,
      metalness: 0.7,
    });
    const head = new THREE.Mesh(headGeom, headMat);
    head.position.set(2.4, 7.7, 0);
    group.add(head);

    // Emissive lamp underside lens
    const lampGeom = new THREE.PlaneGeometry(0.32, 0.55);
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xfff3d6,
      emissive: 0xffe6a3,
      emissiveIntensity: 0.8,
      roughness: 0.1,
    });
    const lamp = new THREE.Mesh(lampGeom, lampMat);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(2.4, 7.61, 0);
    group.add(lamp);

    return group;
  }

  createHighwayMarker(): THREE.Group {
    const group = new THREE.Group();
    group.userData.kind = 'highway-marker';

    const postMat = new THREE.MeshStandardMaterial({
      color: 0x6e7682,
      metalness: 0.7,
      roughness: 0.4,
    });
    const post1 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), postMat);
    post1.position.set(-0.4, 1.1, 0);
    const post2 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), postMat);
    post2.position.set(0.4, 1.1, 0);
    group.add(post1, post2);

    // Green highway sign board
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.9, 0.06),
      new THREE.MeshStandardMaterial({
        color: 0x0f5b34,
        roughness: 0.35,
        metalness: 0.1,
      }),
    );
    board.position.y = 1.7;
    board.castShadow = true;
    group.add(board);

    // White reflective marker decal
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(1.22, 0.72),
      new THREE.MeshStandardMaterial({
        color: 0xf5f7fa,
        roughness: 0.2,
        metalness: 0.05,
      }),
    );
    decal.position.set(0, 1.7, 0.032);
    group.add(decal);

    return group;
  }

  createHighwayGantry(
    dest1 = '⬉ RIVAL CITY / METRO',
    dest2 = 'NORTH EXPRESSWAY ⬈',
  ): THREE.Group {
    const group = new THREE.Group();
    group.userData.kind = 'highway-gantry';
    group.userData.dest1 = dest1;
    group.userData.dest2 = dest2;

    const steelMat = new THREE.MeshStandardMaterial({
      color: 0x6e7884,
      metalness: 0.85,
      roughness: 0.35,
    });
    const signMat = new THREE.MeshStandardMaterial({
      color: 0x0f5b34,
      roughness: 0.3,
      metalness: 0.1,
    });
    const textMat = new THREE.MeshStandardMaterial({
      color: 0xf5f7fa,
      roughness: 0.2,
      metalness: 0.05,
    });

    // Twin vertical support columns on left & right verge (height 9.2m)
    const colGeom = new THREE.BoxGeometry(0.7, 9.2, 0.7);
    const colLeft = new THREE.Mesh(colGeom, steelMat);
    colLeft.position.set(-16.8, 4.6, 0);
    colLeft.castShadow = true;
    const colRight = new THREE.Mesh(colGeom, steelMat);
    colRight.position.set(16.8, 4.6, 0);
    colRight.castShadow = true;
    group.add(colLeft, colRight);

    // Diagonal base stay struts
    const strutGeom = new THREE.CylinderGeometry(0.12, 0.12, 4.5, 6);
    const strutL = new THREE.Mesh(strutGeom, steelMat);
    strutL.position.set(-17.8, 2.2, 0);
    strutL.rotation.z = -Math.PI / 6;
    const strutR = new THREE.Mesh(strutGeom, steelMat);
    strutR.position.set(17.8, 2.2, 0);
    strutR.rotation.z = Math.PI / 6;
    group.add(strutL, strutR);

    // Horizontal truss box beam spanning 34.5m across highway at clearance height 7.8m
    const trussTop = new THREE.Mesh(new THREE.BoxGeometry(34.5, 0.5, 1.2), steelMat);
    trussTop.position.set(0, 8.8, 0);
    const trussBot = new THREE.Mesh(new THREE.BoxGeometry(34.5, 0.5, 1.2), steelMat);
    trussBot.position.set(0, 7.3, 0);
    group.add(trussTop, trussBot);

    // Green highway directional exit signs
    const signGeom = new THREE.BoxGeometry(11.2, 2.8, 0.15);
    const sign1 = new THREE.Mesh(signGeom, signMat);
    sign1.position.set(-6.8, 8.0, 0.7);
    const sign2 = new THREE.Mesh(signGeom, signMat);
    sign2.position.set(6.8, 8.0, 0.7);
    group.add(sign1, sign2);

    // Retroreflective white sign face panels
    const panelGeom = new THREE.PlaneGeometry(10.6, 2.4);
    const panel1 = new THREE.Mesh(panelGeom, textMat);
    panel1.position.set(-6.8, 8.0, 0.79);
    const panel2 = new THREE.Mesh(panelGeom, textMat);
    panel2.position.set(6.8, 8.0, 0.79);
    group.add(panel1, panel2);

    // Overhead floodlight fixtures shining down
    const lightGeom = new THREE.BoxGeometry(0.6, 0.25, 0.4);
    const lightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xfff3cc,
      emissiveIntensity: 0.8,
    });
    for (let x = -11; x <= 11; x += 5.5) {
      const lamp = new THREE.Mesh(lightGeom, lightMat);
      lamp.position.set(x, 9.6, 1.1);
      group.add(lamp);
    }

    return group;
  }

  createTunnelPortal(name = 'CEDAR RIDGE TUNNEL', isExit = false): THREE.Group {
    const group = new THREE.Group();
    group.userData.kind = isExit ? 'tunnel-exit' : 'tunnel-portal';
    group.userData.name = name;

    const concreteMat = new THREE.MeshStandardMaterial({
      color: 0x58606a,
      roughness: 0.94,
      metalness: 0.08,
    });
    const headerMat = new THREE.MeshStandardMaterial({
      color: 0x1b2832,
      roughness: 0.5,
      metalness: 0.4,
    });
    const beaconMat = new THREE.MeshStandardMaterial({
      color: 0xff8800,
      emissive: 0xff7700,
      emissiveIntensity: 1.2,
      roughness: 0.2,
    });

    // Massive left & right portal concrete abutments (clear width 31.5m)
    const abutmentGeom = new THREE.BoxGeometry(4.2, 11.5, 6.0);
    const abutmentL = new THREE.Mesh(abutmentGeom, concreteMat);
    abutmentL.position.set(-17.8, 5.75, 0);
    abutmentL.castShadow = true;
    const abutmentR = new THREE.Mesh(abutmentGeom, concreteMat);
    abutmentR.position.set(17.8, 5.75, 0);
    abutmentR.castShadow = true;
    group.add(abutmentL, abutmentR);

    // Angled wingwalls extending into mountain slope
    const wingGeom = new THREE.BoxGeometry(8.0, 11.5, 2.5);
    const wingL = new THREE.Mesh(wingGeom, concreteMat);
    wingL.position.set(-22.8, 5.75, isExit ? 2.5 : -2.5);
    wingL.rotation.y = isExit ? -Math.PI / 5 : Math.PI / 5;
    const wingR = new THREE.Mesh(wingGeom, concreteMat);
    wingR.position.set(22.8, 5.75, isExit ? 2.5 : -2.5);
    wingR.rotation.y = isExit ? Math.PI / 5 : -Math.PI / 5;
    group.add(wingL, wingR);

    // Massive overhead lintel arch beam across road (height 8.5m - 12.5m)
    const lintelGeom = new THREE.BoxGeometry(39.0, 3.8, 6.0);
    const lintel = new THREE.Mesh(lintelGeom, concreteMat);
    lintel.position.set(0, 10.4, 0);
    lintel.castShadow = true;
    group.add(lintel);

    // Architectural concrete parapet header above the portal lintel
    const parapetGeom = new THREE.BoxGeometry(37.0, 1.4, 4.5);
    const parapet = new THREE.Mesh(parapetGeom, concreteMat);
    parapet.position.set(0, 12.5, 0);
    parapet.castShadow = true;
    group.add(parapet);

    // Portal illuminated name plate / LED sign
    const signBoard = new THREE.Mesh(
      new THREE.BoxGeometry(18.5, 1.7, 0.35),
      headerMat,
    );
    signBoard.position.set(0, 10.5, isExit ? -3.1 : 3.1);
    group.add(signBoard);

    const signFace = new THREE.Mesh(
      new THREE.PlaneGeometry(17.8, 1.3),
      new THREE.MeshStandardMaterial({
        color: 0x00ffcc,
        emissive: 0x00aa88,
        emissiveIntensity: 0.6,
        roughness: 0.3,
      }),
    );
    signFace.position.set(0, 10.5, isExit ? -3.29 : 3.29);
    if (isExit) signFace.rotation.y = Math.PI;
    group.add(signFace);

    // Flashing amber hazard beacons on portal lintel corners
    const beaconGeom = new THREE.CylinderGeometry(0.28, 0.35, 0.7, 8);
    const beaconL = new THREE.Mesh(beaconGeom, beaconMat);
    beaconL.position.set(-16.0, 12.6, isExit ? -2.8 : 2.8);
    const beaconR = new THREE.Mesh(beaconGeom, beaconMat);
    beaconR.position.set(16.0, 12.6, isExit ? -2.8 : 2.8);
    group.add(beaconL, beaconR);

    return group;
  }

  createTunnelRing(): THREE.Group {
    const group = new THREE.Group();
    group.userData.kind = 'tunnel-ring';

    const concreteMat = new THREE.MeshStandardMaterial({
      color: 0x3d434c,
      roughness: 0.92,
      metalness: 0.12,
    });
    const stripMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffeaae,
      emissiveIntensity: 1.8,
      roughness: 0.1,
    });

    // Left and right tunnel interior wall ribs
    const wallGeom = new THREE.BoxGeometry(1.6, 9.2, 2.2);
    const wallL = new THREE.Mesh(wallGeom, concreteMat);
    wallL.position.set(-16.5, 4.6, 0);
    const wallR = new THREE.Mesh(wallGeom, concreteMat);
    wallR.position.set(16.5, 4.6, 0);
    group.add(wallL, wallR);

    // Overhead tunnel roof ceiling rib (clearance 8.4m)
    const roofGeom = new THREE.BoxGeometry(34.5, 1.4, 2.2);
    const roof = new THREE.Mesh(roofGeom, concreteMat);
    roof.position.set(0, 9.2, 0);
    group.add(roof);

    // High-output ceiling LED illumination tube strip
    const stripGeom = new THREE.BoxGeometry(26.0, 0.18, 0.45);
    const strip = new THREE.Mesh(stripGeom, stripMat);
    strip.position.set(0, 8.45, 0);
    group.add(strip);

    return group;
  }

  createBridgePylons(): THREE.Group {
    const group = new THREE.Group();
    group.userData.kind = 'bridge-pylons';

    const pylonMat = new THREE.MeshStandardMaterial({
      color: 0x828c98,
      metalness: 0.8,
      roughness: 0.35,
    });
    const cableMat = new THREE.MeshStandardMaterial({
      color: 0x4d545e,
      metalness: 0.92,
      roughness: 0.25,
    });
    const lightMat = new THREE.MeshStandardMaterial({
      color: 0xff2222,
      emissive: 0xff1111,
      emissiveIntensity: 1.5,
    });

    // Twin majestic cable-stay pylon columns (height 26m above deck)
    const colGeom = new THREE.CylinderGeometry(0.75, 1.35, 26.0, 8);
    const colL = new THREE.Mesh(colGeom, pylonMat);
    colL.position.set(-16.5, 13.0, 0);
    colL.castShadow = true;
    const colR = new THREE.Mesh(colGeom, pylonMat);
    colR.position.set(16.5, 13.0, 0);
    colR.castShadow = true;
    group.add(colL, colR);

    // Transverse cross tie-beam connecting pylon peaks
    const crossGeom = new THREE.BoxGeometry(33.0, 1.2, 1.2);
    const cross = new THREE.Mesh(crossGeom, pylonMat);
    cross.position.set(0, 24.5, 0);
    group.add(cross);

    // Aviation red warning beacon lights on pylon crowns
    const redLightGeom = new THREE.SphereGeometry(0.35, 8, 8);
    const lightL = new THREE.Mesh(redLightGeom, lightMat);
    lightL.position.set(-16.5, 26.4, 0);
    const lightR = new THREE.Mesh(redLightGeom, lightMat);
    lightR.position.set(16.5, 26.4, 0);
    group.add(lightL, lightR);

    // Stay-cable steel tension bars connecting peak to deck edges
    const cableGeom = new THREE.CylinderGeometry(0.06, 0.06, 28.0, 6);
    for (const side of [-1, 1]) {
      for (const zOffset of [-18, -9, 9, 18]) {
        const cable = new THREE.Mesh(cableGeom, cableMat);
        cable.position.set(side * 15.8, 12.5, zOffset * 0.5);
        cable.rotation.x = Math.atan2(zOffset, 24);
        group.add(cable);
      }
    }

    return group;
  }

  createDistantBuildingCluster(variant = 0): THREE.Group {
    const group = new THREE.Group();
    group.userData.kind = 'distant-buildings';

    const glassMat = new THREE.MeshStandardMaterial({
      color: variant === 0 ? 0x1d2733 : 0x242e3b,
      metalness: 0.85,
      roughness: 0.25,
    });
    const concreteMat = new THREE.MeshStandardMaterial({
      color: 0x3a4552,
      metalness: 0.3,
      roughness: 0.88,
    });
    const windowMat = new THREE.MeshStandardMaterial({
      color: 0xffe899,
      emissive: 0x775522,
      emissiveIntensity: 0.7,
      roughness: 0.2,
    });

    const towerConfigs = [
      { x: -16, w: 18, h: 62, d: 18, mat: glassMat },
      { x: 12, w: 22, h: 84, d: 20, mat: glassMat },
      { x: -38, w: 20, h: 48, d: 16, mat: concreteMat },
      { x: 36, w: 24, h: 54, d: 22, mat: concreteMat },
    ];

    for (const cfg of towerConfigs) {
      const tower = new THREE.Mesh(
        new THREE.BoxGeometry(cfg.w, cfg.h, cfg.d),
        cfg.mat,
      );
      tower.position.set(cfg.x, cfg.h * 0.5, 0);
      group.add(tower);

      // Window grid band panels on tower facade
      for (let floorY = 8; floorY < cfg.h - 6; floorY += 10) {
        const winBand = new THREE.Mesh(
          new THREE.PlaneGeometry(cfg.w * 0.82, 3.2),
          windowMat,
        );
        winBand.position.set(cfg.x, floorY, cfg.d * 0.5 + 0.1);
        group.add(winBand);
      }

      // Roof plant structure
      const roofBox = new THREE.Mesh(
        new THREE.BoxGeometry(cfg.w * 0.45, 3.5, cfg.d * 0.45),
        concreteMat,
      );
      roofBox.position.set(cfg.x, cfg.h + 1.75, 0);
      group.add(roofBox);
    }

    // Tall communication antenna spire on highest tower
    const spireGeom = new THREE.CylinderGeometry(0.12, 0.45, 16.0, 6);
    const spire = new THREE.Mesh(
      spireGeom,
      new THREE.MeshStandardMaterial({ color: 0x8a929c, metalness: 0.9, roughness: 0.3 }),
    );
    spire.position.set(12, 84 + 8.0, 0);
    group.add(spire);

    return group;
  }

  createHighwayBillboard(variant = 0): THREE.Group {
    const group = new THREE.Group();
    group.userData.kind = 'highway-billboard';

    const steelMat = new THREE.MeshStandardMaterial({
      color: 0x5a6370,
      metalness: 0.85,
      roughness: 0.35,
    });
    const boardMat = new THREE.MeshStandardMaterial({
      color: variant === 0 ? 0x0a1e2f : 0x221100,
      roughness: 0.4,
      metalness: 0.2,
    });
    const graphicMat = new THREE.MeshStandardMaterial({
      color: variant === 0 ? 0x00ffcc : 0xffaa00,
      emissive: variant === 0 ? 0x005544 : 0x553300,
      emissiveIntensity: 0.5,
      roughness: 0.25,
    });

    // Heavy support pylon (height 13m)
    const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.65, 13.0, 8), steelMat);
    pylon.position.y = 6.5;
    pylon.castShadow = true;
    group.add(pylon);

    // Horizontal display billboard face (14m x 6.5m)
    const board = new THREE.Mesh(new THREE.BoxGeometry(14.0, 6.5, 0.6), boardMat);
    board.position.y = 14.5;
    board.castShadow = true;
    group.add(board);

    // Graphic banner plate
    const graphic = new THREE.Mesh(new THREE.PlaneGeometry(13.2, 5.8), graphicMat);
    graphic.position.set(0, 14.5, 0.32);
    group.add(graphic);

    return group;
  }

  createCurveChevronSign(direction: 'left' | 'right'): THREE.Group {
    const group = new THREE.Group();
    group.userData.kind = 'chevron-sign';
    group.userData.direction = direction;

    const postMat = new THREE.MeshStandardMaterial({
      color: 0x6e7682,
      metalness: 0.7,
      roughness: 0.4,
    });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.8, 6), postMat);
    post.position.y = 1.4;
    group.add(post);

    // Chevron board (bright yellow/black warning plate)
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 1.4, 0.08),
      new THREE.MeshStandardMaterial({
        color: 0xffcc00,
        roughness: 0.3,
        metalness: 0.1,
      }),
    );
    board.position.y = 2.1;
    group.add(board);

    // High-contrast chevron arrows decal
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 1.2),
      new THREE.MeshStandardMaterial({
        color: 0x11161d,
        roughness: 0.5,
        metalness: 0.1,
      }),
    );
    decal.position.set(0, 2.1, 0.045);
    group.add(decal);

    return group;
  }

  createRoadsideHill(radiusX = 38, height = 24, radiusZ = 38): THREE.Group {
    const group = new THREE.Group();
    group.userData.kind = 'roadside-hill';

    const hillGeom = new THREE.ConeGeometry(radiusX, height, 8, 1);
    const hillMat = new THREE.MeshStandardMaterial({
      color: 0x3f5436,
      roughness: 0.96,
      metalness: 0.02,
    });
    const hill = new THREE.Mesh(hillGeom, hillMat);
    hill.scale.set(1, 1, radiusZ / radiusX);
    hill.position.y = height * 0.48;
    group.add(hill);

    return group;
  }

  createEmergencyBay(): THREE.Group {
    const group = new THREE.Group();
    group.userData.kind = 'emergency-bay';

    const postMat = new THREE.MeshStandardMaterial({
      color: 0x7a838f,
      metalness: 0.8,
      roughness: 0.3,
    });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.2, 6), postMat);
    post.position.y = 1.6;
    group.add(post);

    // SOS Box (orange telephone booth cabinet)
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 1.1, 0.5),
      new THREE.MeshStandardMaterial({
        color: 0xff6600,
        roughness: 0.4,
        metalness: 0.2,
      }),
    );
    box.position.y = 1.8;
    group.add(box);

    // Blue SOS reflective sign
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 0.85, 0.06),
      new THREE.MeshStandardMaterial({
        color: 0x0055bb,
        roughness: 0.25,
        metalness: 0.1,
      }),
    );
    sign.position.y = 2.9;
    group.add(sign);

    return group;
  }

  createMountain(): THREE.Group {
    const group = new THREE.Group();
    if (this.greatMountainPrototype) group.add(this.greatMountainPrototype.clone(true));
    return group;
  }

  loadNature(targets: readonly THREE.Group[]): Promise<void> {
    return this.loadNatureModel(targets, {
      kind: 'pine-tree',
      path: PINE_TREE_MODEL_PATH,
      targetHeight: 11,
      castShadow: true,
    });
  }

  private async loadNatureModel(
    targets: readonly THREE.Group[],
    options: NatureModelOptions,
  ): Promise<void> {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}${options.path}`);
    const prototype = this.prepareNatureModel(gltf.scene, options);
    if (options.kind === 'pine-tree') this.pineTreePrototype = prototype;

    for (const object of targets) {
      if (object.userData.kind === options.kind) {
        object.clear();
        object.add(prototype.clone(true));
      }
    }
  }

  private prepareNatureModel(source: THREE.Group, options: NatureModelOptions): THREE.Group {
    source.updateMatrixWorld(true);
    const materialClones = new Map<THREE.Material, THREE.Material>();
    const buckets = new Map<
      string,
      { material: THREE.Material; geometries: THREE.BufferGeometry[] }
    >();

    source.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
      const sourceMaterial = object.material;
      const cachedMaterial = materialClones.get(sourceMaterial);
      let material: THREE.Material;
      if (cachedMaterial) {
        material = cachedMaterial;
      } else {
        const clonedMaterial = sourceMaterial.clone();
        if (clonedMaterial instanceof THREE.MeshStandardMaterial) {
          clonedMaterial.metalness = 0;
          clonedMaterial.roughness = Math.max(0.82, clonedMaterial.roughness);
          clonedMaterial.emissiveMap = null;
          clonedMaterial.emissive.setHex(0x000000);
        }
        materialClones.set(sourceMaterial, clonedMaterial);
        material = clonedMaterial;
      }

      const geometry = object.geometry.clone();
      geometry.applyMatrix4(object.matrixWorld);
      for (const attribute of Object.keys(geometry.attributes)) {
        if (!['position', 'normal', 'uv', 'uv1'].includes(attribute)) {
          geometry.deleteAttribute(attribute);
        }
      }
      if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
      const signature = Object.keys(geometry.attributes).sort().join(',');
      const key = `${material.uuid}|${signature}|${geometry.index ? 'indexed' : 'plain'}`;
      const bucket = buckets.get(key);
      if (bucket) bucket.geometries.push(geometry);
      else buckets.set(key, { material, geometries: [geometry] });
    });

    const content = new THREE.Group();
    for (const bucket of buckets.values()) {
      const merged = mergeGeometries(bucket.geometries, false);
      bucket.geometries.forEach((geometry) => geometry.dispose());
      if (!merged) continue;
      merged.computeBoundingBox();
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, bucket.material);
      mesh.castShadow = options.castShadow;
      mesh.receiveShadow = true;
      content.add(mesh);
    }

    if (content.children.length === 0) {
      throw new Error(`${options.kind} contains no usable geometry.`);
    }
    const bounds = new THREE.Box3().setFromObject(content);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    if (!Number.isFinite(size.y) || size.y <= 0) {
      throw new Error(`${options.kind} has invalid bounds.`);
    }
    content.position.set(-center.x, -bounds.min.y, -center.z);

    const prototype = new THREE.Group();
    prototype.scale.setScalar(options.targetHeight / size.y);
    prototype.add(content);
    return prototype;
  }

  async loadMountains(targets: readonly THREE.Group[]): Promise<void> {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(
      `${import.meta.env.BASE_URL}great_mountain/landscape_mountain_optimized.glb`,
    );
    gltf.scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(gltf.scene);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    if (!Number.isFinite(size.y) || size.y <= 0) {
      throw new Error('The mountain bounds could not be calculated.');
    }

    gltf.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = false;
      object.receiveShadow = false;
    });

    const content = new THREE.Group();
    content.position.set(-center.x, -bounds.min.y, -center.z);
    content.add(gltf.scene);

    const prototype = new THREE.Group();
    prototype.scale.setScalar(85 / size.y);
    prototype.add(content);
    this.greatMountainPrototype = prototype;

    for (const mountain of targets) {
      mountain.clear();
      mountain.add(prototype.clone(true));
    }
  }
}
