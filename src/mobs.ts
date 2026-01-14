import * as THREE from 'three';
import { World } from './world';
import { Player } from './player';
import { BLOCKS, BlockType } from './blocks';
import { sound } from './sound';

export type MobType = 'zombie' | 'skeleton' | 'creeper' | 'pig' | 'cow' | 'drowned' | 'turtle' | 'villager' | 'chicken' | 'ghast' | 'zombified_piglin' | 'enderman' | 'ender_dragon';

interface MobConfig {
  health: number;
  speed: number;
  damage: number;
  color: number;
  hostile: boolean;
  drops: { type: string; count: number }[];
}

const MOB_CONFIGS: Record<MobType, MobConfig> = {
  zombie: {
    health: 20,
    speed: 2.5,
    damage: 3,
    color: 0x4a7c59,
    hostile: true,
    drops: [{ type: 'rotten_flesh', count: 2 }],
  },
  skeleton: {
    health: 20,
    speed: 2.0,
    damage: 4,
    color: 0xcccccc,
    hostile: true,
    drops: [{ type: 'bone', count: 2 }],
  },
  creeper: {
    health: 20,
    speed: 1.8,
    damage: 0, // Damage handled by explosion
    color: 0x4dcc4d,
    hostile: true,
    drops: [{ type: 'gunpowder', count: 2 }],
  },
  pig: {
    health: 10,
    speed: 1.5,
    damage: 0,
    color: 0xffc0cb,
    hostile: false,
    drops: [{ type: 'porkchop', count: 2 }],
  },
  cow: {
    health: 10,
    speed: 1.2,
    damage: 0,
    color: 0x8b4513,
    hostile: false,
    drops: [{ type: 'beef', count: 2 }],
  },
  drowned: {
    health: 20,
    speed: 2.0,
    damage: 3,
    color: 0x3d7a7a, // Teal/cyan zombie color
    hostile: true,
    drops: [{ type: 'gold_ingot', count: 1 }, { type: 'rotten_flesh', count: 2 }],
  },
  turtle: {
    health: 30,
    speed: 0.8,
    damage: 0,
    color: 0x3d8c40, // Green shell
    hostile: false,
    drops: [{ type: 'scute', count: 1 }],
  },
  villager: {
    health: 20,
    speed: 1.0,
    damage: 0,
    color: 0x8b6914, // Brown robe
    hostile: false,
    drops: [], // Villagers don't drop items
  },
  chicken: {
    health: 4,
    speed: 1.5,
    damage: 0,
    color: 0xffffff, // White
    hostile: false,
    drops: [{ type: 'feather', count: 2 }, { type: 'chicken', count: 1 }],
  },
  ghast: {
    health: 10,
    speed: 1.5,
    damage: 6,
    color: 0xf0f0f0, // White/gray
    hostile: true,
    drops: [{ type: 'ghast_tear', count: 1 }, { type: 'gunpowder', count: 2 }],
  },
  zombified_piglin: {
    health: 20,
    speed: 2.3,
    damage: 5,
    color: 0x7d5538, // Piglin color
    hostile: false, // Neutral until attacked
    drops: [{ type: 'gold_nugget', count: 3 }, { type: 'rotten_flesh', count: 1 }],
  },
  enderman: {
    health: 40,
    speed: 3.0,
    damage: 7,
    color: 0x161616, // Dark black
    hostile: false, // Hostile when looked at
    drops: [{ type: 'ender_pearl', count: 1 }],
  },
  ender_dragon: {
    health: 200,
    speed: 8.0,
    damage: 15,
    color: 0x1a1a2e, // Dark purple-black
    hostile: true,
    drops: [{ type: 'dragon_breath', count: 1 }],
  },
};

export class Mob {
  public mesh: THREE.Group;
  public position: THREE.Vector3;
  public velocity: THREE.Vector3;
  public health: number;
  public maxHealth: number;
  public isDead = false;
  public deathTimer = 0;

  public config: MobConfig;
  private targetPlayer: Player | null = null;
  private attackCooldown = 0;
  private wanderTimer = 0;
  private wanderDirection = new THREE.Vector3();
  private hurtTimer = 0;
  private onGround = false;

  // Creeper specific
  public isFusing = false;
  public fuseTimer = 0;
  private readonly FUSE_TIME = 1.5;
  public hasExploded = false;

  // Sound timers
  private soundTimer = 0;

  // Drowned swimming
  public isInWater = false;
  private readonly SWIM_SPEED = 3.0;

  // Enderman specific
  public isAngry = false;
  private stareTimer = 0;
  private teleportCooldown = 0;
  private shakeOffset = new THREE.Vector3();

  // Ender Dragon AI
  private dragonPhase: 'circling' | 'diving' | 'perching' = 'circling';
  private dragonPhaseTimer = 0;
  private dragonCircleAngle = 0;
  private dragonTargetHeight = 64;

  constructor(
    public type: MobType,
    x: number,
    y: number,
    z: number,
    private world: World
  ) {
    this.config = MOB_CONFIGS[type];
    this.health = this.config.health;
    this.maxHealth = this.config.health;
    this.position = new THREE.Vector3(x, y, z);
    this.velocity = new THREE.Vector3();
    this.mesh = this.createMesh();
    this.mesh.position.copy(this.position);
  }

  private createMesh(): THREE.Group {
    const group = new THREE.Group();

    if (this.type === 'creeper') {
      return this.createCreeperMesh(group);
    }

    if (this.type === 'drowned') {
      return this.createDrownedMesh(group);
    }

    if (this.type === 'turtle') {
      return this.createTurtleMesh(group);
    }

    if (this.type === 'villager') {
      return this.createVillagerMesh(group);
    }

    if (this.type === 'chicken') {
      return this.createChickenMesh(group);
    }

    if (this.type === 'ghast') {
      return this.createGhastMesh(group);
    }

    if (this.type === 'zombified_piglin') {
      return this.createZombifiedPiglinMesh(group);
    }

    if (this.type === 'enderman') {
      return this.createEndermanMesh(group);
    }

    if (this.type === 'ender_dragon') {
      return this.createEnderDragonMesh(group);
    }

    // Body
    const bodyGeom = new THREE.BoxGeometry(0.6, 1.0, 0.3);
    const bodyMat = new THREE.MeshLambertMaterial({ color: this.config.color });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.position.y = 0.9;
    body.name = 'body';
    group.add(body);

    // Head
    const headGeom = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const headMat = new THREE.MeshLambertMaterial({
      color: this.type === 'skeleton' ? 0xeeeeee : this.config.color
    });
    const head = new THREE.Mesh(headGeom, headMat);
    head.position.y = 1.65;
    head.name = 'head';
    group.add(head);

    // Eyes (for hostile mobs)
    if (this.config.hostile) {
      const eyeGeom = new THREE.BoxGeometry(0.08, 0.08, 0.1);
      const eyeMat = new THREE.MeshBasicMaterial({
        color: this.type === 'skeleton' ? 0x000000 : 0xff0000
      });

      const leftEye = new THREE.Mesh(eyeGeom, eyeMat);
      leftEye.position.set(-0.12, 1.7, 0.25);
      group.add(leftEye);

      const rightEye = new THREE.Mesh(eyeGeom, eyeMat);
      rightEye.position.set(0.12, 1.7, 0.25);
      group.add(rightEye);
    }

    // Legs
    const legGeom = new THREE.BoxGeometry(0.2, 0.5, 0.2);
    const legMat = new THREE.MeshLambertMaterial({
      color: this.type === 'skeleton' ? 0xdddddd : this.config.color
    });

    const leftLeg = new THREE.Mesh(legGeom, legMat);
    leftLeg.position.set(-0.15, 0.25, 0);
    leftLeg.name = 'leftLeg';
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeom, legMat);
    rightLeg.position.set(0.15, 0.25, 0);
    rightLeg.name = 'rightLeg';
    group.add(rightLeg);

    // Arms
    const armGeom = new THREE.BoxGeometry(0.2, 0.6, 0.2);

    const leftArm = new THREE.Mesh(armGeom, legMat);
    leftArm.position.set(-0.4, 1.0, 0);
    leftArm.name = 'leftArm';
    group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeom, legMat);
    rightArm.position.set(0.4, 1.0, 0);
    rightArm.name = 'rightArm';
    group.add(rightArm);

    // For skeleton, add bow
    if (this.type === 'skeleton') {
      const bowGeom = new THREE.BoxGeometry(0.05, 0.4, 0.05);
      const bowMat = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
      const bow = new THREE.Mesh(bowGeom, bowMat);
      bow.position.set(0.5, 1.0, 0.2);
      group.add(bow);
    }

    return group;
  }

  private createCreeperMesh(group: THREE.Group): THREE.Group {
    const creeperGreen = 0x4dcc4d;
    const creeperDark = 0x2d7a2d;

    // Tall body
    const bodyGeom = new THREE.BoxGeometry(0.5, 1.2, 0.3);
    const bodyMat = new THREE.MeshLambertMaterial({ color: creeperGreen });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.position.y = 1.0;
    body.name = 'body';
    group.add(body);

    // Head (larger, iconic)
    const headGeom = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    const headMat = new THREE.MeshLambertMaterial({ color: creeperGreen });
    const head = new THREE.Mesh(headGeom, headMat);
    head.position.y = 1.9;
    head.name = 'head';
    group.add(head);

    // Creeper face - the iconic frown
    const faceMat = new THREE.MeshBasicMaterial({ color: 0x000000 });

    // Eyes (vertical rectangles)
    const leftEye = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.02), faceMat);
    leftEye.position.set(-0.12, 2.0, 0.3);
    group.add(leftEye);

    const rightEye = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.02), faceMat);
    rightEye.position.set(0.12, 2.0, 0.3);
    group.add(rightEye);

    // Mouth (frowny shape)
    const mouth1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.02), faceMat);
    mouth1.position.set(0, 1.75, 0.3);
    group.add(mouth1);

    const mouth2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.02), faceMat);
    mouth2.position.set(-0.1, 1.7, 0.3);
    group.add(mouth2);

    const mouth3 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.02), faceMat);
    mouth3.position.set(0.1, 1.7, 0.3);
    group.add(mouth3);

    // 4 short legs
    const legGeom = new THREE.BoxGeometry(0.2, 0.4, 0.2);
    const legMat = new THREE.MeshLambertMaterial({ color: creeperDark });

    const leg1 = new THREE.Mesh(legGeom, legMat);
    leg1.position.set(-0.15, 0.2, 0.1);
    leg1.name = 'leftLeg';
    group.add(leg1);

    const leg2 = new THREE.Mesh(legGeom, legMat);
    leg2.position.set(0.15, 0.2, 0.1);
    leg2.name = 'rightLeg';
    group.add(leg2);

    const leg3 = new THREE.Mesh(legGeom, legMat);
    leg3.position.set(-0.15, 0.2, -0.1);
    group.add(leg3);

    const leg4 = new THREE.Mesh(legGeom, legMat);
    leg4.position.set(0.15, 0.2, -0.1);
    group.add(leg4);

    return group;
  }

  private createDrownedMesh(group: THREE.Group): THREE.Group {
    const drownedColor = 0x3d7a7a; // Teal/cyan
    const drownedDark = 0x2a5555;
    const seaweedColor = 0x2d5a3d;

    // Body with tattered appearance
    const bodyGeom = new THREE.BoxGeometry(0.6, 1.0, 0.3);
    const bodyMat = new THREE.MeshLambertMaterial({ color: drownedColor });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.position.y = 0.9;
    body.name = 'body';
    group.add(body);

    // Head
    const headGeom = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const headMat = new THREE.MeshLambertMaterial({ color: drownedColor });
    const head = new THREE.Mesh(headGeom, headMat);
    head.position.y = 1.65;
    head.name = 'head';
    group.add(head);

    // Glowing eyes (cyan)
    const eyeGeom = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    const leftEye = new THREE.Mesh(eyeGeom, eyeMat);
    leftEye.position.set(-0.12, 1.7, 0.25);
    group.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeom, eyeMat);
    rightEye.position.set(0.12, 1.7, 0.25);
    group.add(rightEye);

    // Legs
    const legGeom = new THREE.BoxGeometry(0.2, 0.5, 0.2);
    const legMat = new THREE.MeshLambertMaterial({ color: drownedDark });

    const leftLeg = new THREE.Mesh(legGeom, legMat);
    leftLeg.position.set(-0.15, 0.25, 0);
    leftLeg.name = 'leftLeg';
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeom, legMat);
    rightLeg.position.set(0.15, 0.25, 0);
    rightLeg.name = 'rightLeg';
    group.add(rightLeg);

    // Arms (extended forward like swimming zombie)
    const armGeom = new THREE.BoxGeometry(0.2, 0.6, 0.2);
    const armMat = new THREE.MeshLambertMaterial({ color: drownedDark });

    const leftArm = new THREE.Mesh(armGeom, armMat);
    leftArm.position.set(-0.4, 1.0, 0.3);
    leftArm.rotation.x = -Math.PI / 3; // Arms reaching forward
    leftArm.name = 'leftArm';
    group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeom, armMat);
    rightArm.position.set(0.4, 1.0, 0.3);
    rightArm.rotation.x = -Math.PI / 3;
    rightArm.name = 'rightArm';
    group.add(rightArm);

    // Seaweed/kelp strands hanging from body
    const seaweedGeom = new THREE.BoxGeometry(0.05, 0.3, 0.05);
    const seaweedMat = new THREE.MeshLambertMaterial({ color: seaweedColor });

    // Head seaweed
    const kelp1 = new THREE.Mesh(seaweedGeom, seaweedMat);
    kelp1.position.set(0.15, 1.95, 0);
    kelp1.rotation.z = 0.3;
    group.add(kelp1);

    const kelp2 = new THREE.Mesh(seaweedGeom, seaweedMat);
    kelp2.position.set(-0.2, 1.9, 0.1);
    kelp2.rotation.z = -0.2;
    group.add(kelp2);

    // Body seaweed
    const kelp3 = new THREE.Mesh(seaweedGeom, seaweedMat);
    kelp3.position.set(0.25, 0.9, 0.1);
    kelp3.rotation.z = 0.4;
    group.add(kelp3);

    const kelp4 = new THREE.Mesh(seaweedGeom, seaweedMat);
    kelp4.position.set(-0.3, 0.7, -0.1);
    kelp4.rotation.z = -0.3;
    group.add(kelp4);

    // Trident (sometimes drowned carry tridents!)
    if (Math.random() < 0.3) { // 30% chance to have trident
      const tridentHandle = new THREE.BoxGeometry(0.06, 0.8, 0.06);
      const tridentMat = new THREE.MeshLambertMaterial({ color: 0x1a6b6b });
      const trident = new THREE.Mesh(tridentHandle, tridentMat);
      trident.position.set(0.5, 1.2, 0.3);
      trident.rotation.x = -Math.PI / 4;
      group.add(trident);

      // Trident prongs
      const prongGeom = new THREE.BoxGeometry(0.04, 0.25, 0.04);
      const prongMat = new THREE.MeshLambertMaterial({ color: 0x20aaaa });

      const prong1 = new THREE.Mesh(prongGeom, prongMat);
      prong1.position.set(0.5, 1.7, 0.6);
      prong1.rotation.x = -Math.PI / 4;
      group.add(prong1);

      const prong2 = new THREE.Mesh(prongGeom, prongMat);
      prong2.position.set(0.42, 1.6, 0.55);
      prong2.rotation.x = -Math.PI / 4;
      prong2.rotation.z = 0.2;
      group.add(prong2);

      const prong3 = new THREE.Mesh(prongGeom, prongMat);
      prong3.position.set(0.58, 1.6, 0.55);
      prong3.rotation.x = -Math.PI / 4;
      prong3.rotation.z = -0.2;
      group.add(prong3);
    }

    return group;
  }

  private createTurtleMesh(group: THREE.Group): THREE.Group {
    const shellGreen = 0x3d8c40;
    const shellDark = 0x2a5e2c;
    const skinGreen = 0x5da860;

    // Shell (oval-ish)
    const shellGeom = new THREE.BoxGeometry(0.8, 0.4, 1.0);
    const shellMat = new THREE.MeshLambertMaterial({ color: shellGreen });
    const shell = new THREE.Mesh(shellGeom, shellMat);
    shell.position.y = 0.35;
    shell.name = 'body';
    group.add(shell);

    // Shell pattern (darker spots)
    const spotGeom = new THREE.BoxGeometry(0.2, 0.05, 0.2);
    const spotMat = new THREE.MeshLambertMaterial({ color: shellDark });
    for (let i = 0; i < 4; i++) {
      const spot = new THREE.Mesh(spotGeom, spotMat);
      spot.position.set(
        (i % 2 === 0 ? -0.2 : 0.2),
        0.58,
        (i < 2 ? -0.2 : 0.2)
      );
      group.add(spot);
    }

    // Head
    const headGeom = new THREE.BoxGeometry(0.25, 0.2, 0.25);
    const headMat = new THREE.MeshLambertMaterial({ color: skinGreen });
    const head = new THREE.Mesh(headGeom, headMat);
    head.position.set(0, 0.35, 0.55);
    head.name = 'head';
    group.add(head);

    // Eyes
    const eyeGeom = new THREE.BoxGeometry(0.06, 0.06, 0.02);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const leftEye = new THREE.Mesh(eyeGeom, eyeMat);
    leftEye.position.set(-0.08, 0.4, 0.67);
    group.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeom, eyeMat);
    rightEye.position.set(0.08, 0.4, 0.67);
    group.add(rightEye);

    // Flippers (4)
    const flipperGeom = new THREE.BoxGeometry(0.3, 0.08, 0.15);
    const flipperMat = new THREE.MeshLambertMaterial({ color: skinGreen });

    // Front flippers
    const fl = new THREE.Mesh(flipperGeom, flipperMat);
    fl.position.set(-0.45, 0.2, 0.3);
    fl.rotation.z = 0.3;
    fl.name = 'leftArm';
    group.add(fl);

    const fr = new THREE.Mesh(flipperGeom, flipperMat);
    fr.position.set(0.45, 0.2, 0.3);
    fr.rotation.z = -0.3;
    fr.name = 'rightArm';
    group.add(fr);

    // Back flippers
    const bl = new THREE.Mesh(flipperGeom, flipperMat);
    bl.position.set(-0.4, 0.2, -0.35);
    bl.rotation.z = 0.4;
    bl.name = 'leftLeg';
    group.add(bl);

    const br = new THREE.Mesh(flipperGeom, flipperMat);
    br.position.set(0.4, 0.2, -0.35);
    br.rotation.z = -0.4;
    br.name = 'rightLeg';
    group.add(br);

    return group;
  }

  private createVillagerMesh(group: THREE.Group): THREE.Group {
    const robeColor = 0x8b6914;
    const skinColor = 0xc9a86c;
    const noseColor = 0xb08858;

    // Body/Robe
    const bodyGeom = new THREE.BoxGeometry(0.5, 1.2, 0.4);
    const bodyMat = new THREE.MeshLambertMaterial({ color: robeColor });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.position.y = 0.8;
    body.name = 'body';
    group.add(body);

    // Head
    const headGeom = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const headMat = new THREE.MeshLambertMaterial({ color: skinColor });
    const head = new THREE.Mesh(headGeom, headMat);
    head.position.y = 1.65;
    head.name = 'head';
    group.add(head);

    // Big nose (villager characteristic!)
    const noseGeom = new THREE.BoxGeometry(0.15, 0.2, 0.2);
    const noseMat = new THREE.MeshLambertMaterial({ color: noseColor });
    const nose = new THREE.Mesh(noseGeom, noseMat);
    nose.position.set(0, 1.55, 0.35);
    group.add(nose);

    // Eyes
    const eyeGeom = new THREE.BoxGeometry(0.08, 0.08, 0.02);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x2d5a27 }); // Green eyes
    const leftEye = new THREE.Mesh(eyeGeom, eyeMat);
    leftEye.position.set(-0.12, 1.7, 0.25);
    group.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeom, eyeMat);
    rightEye.position.set(0.12, 1.7, 0.25);
    group.add(rightEye);

    // Unibrow
    const browGeom = new THREE.BoxGeometry(0.35, 0.06, 0.02);
    const browMat = new THREE.MeshLambertMaterial({ color: 0x3d2314 });
    const brow = new THREE.Mesh(browGeom, browMat);
    brow.position.set(0, 1.78, 0.25);
    group.add(brow);

    // Arms (hidden in robe)
    const armGeom = new THREE.BoxGeometry(0.15, 0.8, 0.15);
    const armMat = new THREE.MeshLambertMaterial({ color: robeColor });

    const leftArm = new THREE.Mesh(armGeom, armMat);
    leftArm.position.set(-0.35, 0.8, 0);
    leftArm.name = 'leftArm';
    group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeom, armMat);
    rightArm.position.set(0.35, 0.8, 0);
    rightArm.name = 'rightArm';
    group.add(rightArm);

    // Legs (under robe)
    const legGeom = new THREE.BoxGeometry(0.15, 0.4, 0.15);

    const leftLeg = new THREE.Mesh(legGeom, armMat);
    leftLeg.position.set(-0.12, 0.2, 0);
    leftLeg.name = 'leftLeg';
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeom, armMat);
    rightLeg.position.set(0.12, 0.2, 0);
    rightLeg.name = 'rightLeg';
    group.add(rightLeg);

    return group;
  }

  private createChickenMesh(group: THREE.Group): THREE.Group {
    const whiteColor = 0xffffff;
    const beakColor = 0xffa500;
    const wattleColor = 0xff0000;

    // Body
    const bodyGeom = new THREE.BoxGeometry(0.35, 0.3, 0.5);
    const bodyMat = new THREE.MeshLambertMaterial({ color: whiteColor });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.position.y = 0.4;
    body.name = 'body';
    group.add(body);

    // Head
    const headGeom = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    const head = new THREE.Mesh(headGeom, bodyMat);
    head.position.set(0, 0.6, 0.25);
    head.name = 'head';
    group.add(head);

    // Beak
    const beakGeom = new THREE.BoxGeometry(0.08, 0.06, 0.1);
    const beakMat = new THREE.MeshLambertMaterial({ color: beakColor });
    const beak = new THREE.Mesh(beakGeom, beakMat);
    beak.position.set(0, 0.55, 0.38);
    group.add(beak);

    // Wattle (red thing under beak)
    const wattleGeom = new THREE.BoxGeometry(0.06, 0.08, 0.04);
    const wattleMat = new THREE.MeshLambertMaterial({ color: wattleColor });
    const wattle = new THREE.Mesh(wattleGeom, wattleMat);
    wattle.position.set(0, 0.48, 0.35);
    group.add(wattle);

    // Comb (red thing on top)
    const combGeom = new THREE.BoxGeometry(0.04, 0.1, 0.12);
    const comb = new THREE.Mesh(combGeom, wattleMat);
    comb.position.set(0, 0.74, 0.25);
    group.add(comb);

    // Eyes
    const eyeGeom = new THREE.BoxGeometry(0.04, 0.04, 0.02);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const leftEye = new THREE.Mesh(eyeGeom, eyeMat);
    leftEye.position.set(-0.08, 0.62, 0.35);
    group.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeom, eyeMat);
    rightEye.position.set(0.08, 0.62, 0.35);
    group.add(rightEye);

    // Legs
    const legGeom = new THREE.BoxGeometry(0.05, 0.2, 0.05);
    const legMat = new THREE.MeshLambertMaterial({ color: beakColor });

    const leftLeg = new THREE.Mesh(legGeom, legMat);
    leftLeg.position.set(-0.08, 0.1, 0);
    leftLeg.name = 'leftLeg';
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeom, legMat);
    rightLeg.position.set(0.08, 0.1, 0);
    rightLeg.name = 'rightLeg';
    group.add(rightLeg);

    // Wings
    const wingGeom = new THREE.BoxGeometry(0.08, 0.2, 0.3);

    const leftWing = new THREE.Mesh(wingGeom, bodyMat);
    leftWing.position.set(-0.22, 0.4, 0);
    leftWing.name = 'leftArm';
    group.add(leftWing);

    const rightWing = new THREE.Mesh(wingGeom, bodyMat);
    rightWing.position.set(0.22, 0.4, 0);
    rightWing.name = 'rightArm';
    group.add(rightWing);

    // Tail feathers
    const tailGeom = new THREE.BoxGeometry(0.15, 0.2, 0.08);
    const tail = new THREE.Mesh(tailGeom, bodyMat);
    tail.position.set(0, 0.5, -0.3);
    tail.rotation.x = -0.5;
    group.add(tail);

    return group;
  }

  private createGhastMesh(group: THREE.Group): THREE.Group {
    const bodyColor = 0xf0f0f0;
    const eyeColor = 0x000000;
    const mouthColor = 0x555555;

    // Large cube body (ghasts are big floating cubes)
    const bodyGeom = new THREE.BoxGeometry(2.5, 2.5, 2.5);
    const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.position.y = 3;
    body.name = 'body';
    group.add(body);

    // Eyes (sad looking)
    const eyeGeom = new THREE.BoxGeometry(0.4, 0.5, 0.1);
    const eyeMat = new THREE.MeshBasicMaterial({ color: eyeColor });

    const leftEye = new THREE.Mesh(eyeGeom, eyeMat);
    leftEye.position.set(-0.5, 3.2, 1.26);
    group.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeom, eyeMat);
    rightEye.position.set(0.5, 3.2, 1.26);
    group.add(rightEye);

    // Sad mouth
    const mouthGeom = new THREE.BoxGeometry(0.8, 0.3, 0.1);
    const mouthMat = new THREE.MeshBasicMaterial({ color: mouthColor });
    const mouth = new THREE.Mesh(mouthGeom, mouthMat);
    mouth.position.set(0, 2.5, 1.26);
    group.add(mouth);

    // Tentacles (9 of them hanging down)
    const tentacleGeom = new THREE.BoxGeometry(0.2, 1.5, 0.2);
    const tentacleMat = new THREE.MeshLambertMaterial({ color: 0xdddddd });

    for (let i = 0; i < 9; i++) {
      const tentacle = new THREE.Mesh(tentacleGeom, tentacleMat);
      const row = Math.floor(i / 3);
      const col = i % 3;
      tentacle.position.set(-0.7 + col * 0.7, 0.8, -0.7 + row * 0.7);
      tentacle.name = i === 0 ? 'leftLeg' : (i === 2 ? 'rightLeg' : '');
      group.add(tentacle);
    }

    return group;
  }

  private createZombifiedPiglinMesh(group: THREE.Group): THREE.Group {
    const skinColor = 0x7d5538; // Rotten pink/brown
    const rotColor = 0x5a3d28;
    const goldColor = 0xffd700;

    // Body
    const bodyGeom = new THREE.BoxGeometry(0.6, 1.0, 0.3);
    const bodyMat = new THREE.MeshLambertMaterial({ color: skinColor });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.position.y = 0.9;
    body.name = 'body';
    group.add(body);

    // Piglin head (snout!)
    const headGeom = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const headMat = new THREE.MeshLambertMaterial({ color: skinColor });
    const head = new THREE.Mesh(headGeom, headMat);
    head.position.y = 1.65;
    head.name = 'head';
    group.add(head);

    // Snout
    const snoutGeom = new THREE.BoxGeometry(0.25, 0.2, 0.2);
    const snoutMat = new THREE.MeshLambertMaterial({ color: rotColor });
    const snout = new THREE.Mesh(snoutGeom, snoutMat);
    snout.position.set(0, 1.55, 0.35);
    group.add(snout);

    // Piglin ears
    const earGeom = new THREE.BoxGeometry(0.15, 0.3, 0.08);
    const leftEar = new THREE.Mesh(earGeom, headMat);
    leftEar.position.set(-0.3, 1.85, 0);
    leftEar.rotation.z = 0.3;
    group.add(leftEar);

    const rightEar = new THREE.Mesh(earGeom, headMat);
    rightEar.position.set(0.3, 1.85, 0);
    rightEar.rotation.z = -0.3;
    group.add(rightEar);

    // Glowing eyes (zombie effect)
    const eyeGeom = new THREE.BoxGeometry(0.08, 0.08, 0.02);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 }); // Green zombie eyes
    const leftEye = new THREE.Mesh(eyeGeom, eyeMat);
    leftEye.position.set(-0.12, 1.7, 0.25);
    group.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeom, eyeMat);
    rightEye.position.set(0.12, 1.7, 0.25);
    group.add(rightEye);

    // Gold armor piece (loincloth/belt)
    const armorGeom = new THREE.BoxGeometry(0.65, 0.15, 0.35);
    const armorMat = new THREE.MeshLambertMaterial({ color: goldColor });
    const armor = new THREE.Mesh(armorGeom, armorMat);
    armor.position.set(0, 0.5, 0);
    group.add(armor);

    // Legs
    const legGeom = new THREE.BoxGeometry(0.2, 0.5, 0.2);
    const legMat = new THREE.MeshLambertMaterial({ color: rotColor });

    const leftLeg = new THREE.Mesh(legGeom, legMat);
    leftLeg.position.set(-0.15, 0.25, 0);
    leftLeg.name = 'leftLeg';
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeom, legMat);
    rightLeg.position.set(0.15, 0.25, 0);
    rightLeg.name = 'rightLeg';
    group.add(rightLeg);

    // Arms
    const armGeom = new THREE.BoxGeometry(0.2, 0.6, 0.2);

    const leftArm = new THREE.Mesh(armGeom, bodyMat);
    leftArm.position.set(-0.4, 1.0, 0);
    leftArm.name = 'leftArm';
    group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeom, bodyMat);
    rightArm.position.set(0.4, 1.0, 0);
    rightArm.name = 'rightArm';
    group.add(rightArm);

    // Golden sword
    const swordHandle = new THREE.BoxGeometry(0.08, 0.3, 0.08);
    const swordBlade = new THREE.BoxGeometry(0.06, 0.6, 0.06);
    const swordMat = new THREE.MeshLambertMaterial({ color: goldColor });

    const handle = new THREE.Mesh(swordHandle, new THREE.MeshLambertMaterial({ color: 0x4a3728 }));
    handle.position.set(0.5, 0.85, 0.25);
    group.add(handle);

    const blade = new THREE.Mesh(swordBlade, swordMat);
    blade.position.set(0.5, 1.3, 0.25);
    group.add(blade);

    return group;
  }

  private createEndermanMesh(group: THREE.Group): THREE.Group {
    const bodyColor = 0x161616;
    const eyeColor = 0xcc00ff; // Purple eyes

    // Tall slender body
    const bodyGeom = new THREE.BoxGeometry(0.4, 1.8, 0.25);
    const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.position.y = 2.0;
    group.add(body);

    // Head (small)
    const headGeom = new THREE.BoxGeometry(0.4, 0.4, 0.4);
    const head = new THREE.Mesh(headGeom, bodyMat);
    head.position.y = 3.1;
    group.add(head);

    // Glowing purple eyes
    const eyeGeom = new THREE.BoxGeometry(0.08, 0.04, 0.02);
    const eyeMat = new THREE.MeshBasicMaterial({ color: eyeColor });
    const leftEye = new THREE.Mesh(eyeGeom, eyeMat);
    leftEye.position.set(-0.1, 3.15, 0.21);
    group.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeom, eyeMat);
    rightEye.position.set(0.1, 3.15, 0.21);
    group.add(rightEye);

    // Very long thin legs
    const legGeom = new THREE.BoxGeometry(0.12, 1.1, 0.12);
    const legMat = new THREE.MeshLambertMaterial({ color: bodyColor });
    const leftLeg = new THREE.Mesh(legGeom, legMat);
    leftLeg.position.set(-0.1, 0.55, 0);
    leftLeg.name = 'leftLeg';
    group.add(leftLeg);
    const rightLeg = new THREE.Mesh(legGeom, legMat);
    rightLeg.position.set(0.1, 0.55, 0);
    rightLeg.name = 'rightLeg';
    group.add(rightLeg);

    // Very long thin arms
    const armGeom = new THREE.BoxGeometry(0.1, 1.4, 0.1);
    const leftArm = new THREE.Mesh(armGeom, legMat);
    leftArm.position.set(-0.3, 1.8, 0);
    leftArm.name = 'leftArm';
    group.add(leftArm);
    const rightArm = new THREE.Mesh(armGeom, legMat);
    rightArm.position.set(0.3, 1.8, 0);
    rightArm.name = 'rightArm';
    group.add(rightArm);

    // Particle effect hint (purple sparkles would be added via particle system)
    const particleGeom = new THREE.BoxGeometry(0.05, 0.05, 0.05);
    const particleMat = new THREE.MeshBasicMaterial({ color: eyeColor, transparent: true, opacity: 0.6 });
    for (let i = 0; i < 5; i++) {
      const particle = new THREE.Mesh(particleGeom, particleMat);
      particle.position.set(
        (Math.random() - 0.5) * 0.8,
        1 + Math.random() * 2.5,
        (Math.random() - 0.5) * 0.5
      );
      group.add(particle);
    }

    return group;
  }

  private createEnderDragonMesh(group: THREE.Group): THREE.Group {
    const bodyColor = 0x1a1a2e;
    const wingColor = 0x2d2d44;
    const eyeColor = 0xff00ff;

    // Large body (dragon is much bigger)
    const bodyGeom = new THREE.BoxGeometry(3, 1.5, 5);
    const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.position.y = 3;
    group.add(body);

    // Neck
    const neckGeom = new THREE.BoxGeometry(0.8, 0.8, 2);
    const neck = new THREE.Mesh(neckGeom, bodyMat);
    neck.position.set(0, 3.5, 3);
    neck.rotation.x = 0.3;
    group.add(neck);

    // Head
    const headGeom = new THREE.BoxGeometry(1.2, 1, 1.8);
    const head = new THREE.Mesh(headGeom, bodyMat);
    head.position.set(0, 4.2, 4.5);
    group.add(head);

    // Snout
    const snoutGeom = new THREE.BoxGeometry(0.6, 0.5, 1);
    const snout = new THREE.Mesh(snoutGeom, bodyMat);
    snout.position.set(0, 4, 5.4);
    group.add(snout);

    // Glowing eyes
    const eyeGeom = new THREE.BoxGeometry(0.2, 0.15, 0.05);
    const eyeMat = new THREE.MeshBasicMaterial({ color: eyeColor });
    const leftEye = new THREE.Mesh(eyeGeom, eyeMat);
    leftEye.position.set(-0.35, 4.3, 5.35);
    group.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeom, eyeMat);
    rightEye.position.set(0.35, 4.3, 5.35);
    group.add(rightEye);

    // Wings
    const wingMat = new THREE.MeshLambertMaterial({ color: wingColor, side: THREE.DoubleSide });
    const wingGeom = new THREE.BoxGeometry(6, 0.1, 3);
    const leftWing = new THREE.Mesh(wingGeom, wingMat);
    leftWing.position.set(-4.5, 3.5, 0);
    leftWing.rotation.z = 0.2;
    leftWing.name = 'leftWing';
    group.add(leftWing);
    const rightWing = new THREE.Mesh(wingGeom, wingMat);
    rightWing.position.set(4.5, 3.5, 0);
    rightWing.rotation.z = -0.2;
    rightWing.name = 'rightWing';
    group.add(rightWing);

    // Wing tips
    const wingTipGeom = new THREE.BoxGeometry(4, 0.08, 2);
    const leftWingTip = new THREE.Mesh(wingTipGeom, wingMat);
    leftWingTip.position.set(-8.5, 3.2, -0.5);
    leftWingTip.rotation.z = 0.4;
    group.add(leftWingTip);
    const rightWingTip = new THREE.Mesh(wingTipGeom, wingMat);
    rightWingTip.position.set(8.5, 3.2, -0.5);
    rightWingTip.rotation.z = -0.4;
    group.add(rightWingTip);

    // Tail
    const tailGeom1 = new THREE.BoxGeometry(0.8, 0.8, 2);
    const tail1 = new THREE.Mesh(tailGeom1, bodyMat);
    tail1.position.set(0, 2.8, -3.5);
    group.add(tail1);

    const tailGeom2 = new THREE.BoxGeometry(0.5, 0.5, 2);
    const tail2 = new THREE.Mesh(tailGeom2, bodyMat);
    tail2.position.set(0, 2.5, -5);
    group.add(tail2);

    // Tail spike
    const spikeGeom = new THREE.ConeGeometry(0.4, 1, 4);
    const spike = new THREE.Mesh(spikeGeom, bodyMat);
    spike.position.set(0, 2.3, -6.2);
    spike.rotation.x = Math.PI / 2;
    group.add(spike);

    // Legs (4)
    const legGeom = new THREE.BoxGeometry(0.6, 1.5, 0.6);
    const positions = [
      { x: -1, z: 1.5 },
      { x: 1, z: 1.5 },
      { x: -1, z: -1.5 },
      { x: 1, z: -1.5 },
    ];
    for (const pos of positions) {
      const leg = new THREE.Mesh(legGeom, bodyMat);
      leg.position.set(pos.x, 1.5, pos.z);
      group.add(leg);
    }

    // Horns on head
    const hornGeom = new THREE.ConeGeometry(0.15, 0.6, 4);
    const leftHorn = new THREE.Mesh(hornGeom, bodyMat);
    leftHorn.position.set(-0.4, 4.9, 4.2);
    leftHorn.rotation.z = 0.3;
    group.add(leftHorn);
    const rightHorn = new THREE.Mesh(hornGeom, bodyMat);
    rightHorn.position.set(0.4, 4.9, 4.2);
    rightHorn.rotation.z = -0.3;
    group.add(rightHorn);

    // Scale up the whole dragon
    group.scale.set(1.5, 1.5, 1.5);

    return group;
  }

  update(deltaTime: number, player: Player): { exploded: boolean; position: THREE.Vector3 } {
    const result = { exploded: false, position: this.position.clone() };

    if (this.isDead) {
      this.deathTimer += deltaTime;
      this.mesh.rotation.z = Math.min(Math.PI / 2, this.mesh.rotation.z + deltaTime * 3);
      this.mesh.position.y -= deltaTime * 0.5;
      return result;
    }

    // Hurt flash
    if (this.hurtTimer > 0) {
      this.hurtTimer -= deltaTime;
      this.mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          (child.material as THREE.MeshLambertMaterial).emissive.setHex(
            this.hurtTimer > 0 ? 0xff0000 : 0x000000
          );
        }
      });
    }

    // Attack cooldown
    this.attackCooldown = Math.max(0, this.attackCooldown - deltaTime);

    // Sound timer
    this.soundTimer -= deltaTime;

    const distanceToPlayer = this.position.distanceTo(player.position);

    // Enderman specific behavior - neutral until looked at
    if (this.type === 'enderman' && !player.isDead) {
      this.updateEndermanBehavior(deltaTime, player, distanceToPlayer);
    }

    // Dragon has its own AI, skip standard hostile logic
    if (this.type === 'ender_dragon') {
      // Dragon AI is handled separately in updateDragonAI
    } else if (this.config.hostile && !player.isDead) {
      if (distanceToPlayer < 32) {
        this.targetPlayer = player;
      } else {
        this.targetPlayer = null;
      }

      if (this.targetPlayer) {
        const dir = new THREE.Vector3()
          .subVectors(this.targetPlayer.position, this.position)
          .normalize();

        // Creeper behavior
        if (this.type === 'creeper') {
          if (distanceToPlayer < 3) {
            // Start fusing when close
            if (!this.isFusing) {
              this.isFusing = true;
              this.fuseTimer = 0;
              sound.playCreeperHiss();
            }

            this.fuseTimer += deltaTime;

            // Flash white when fusing
            const flashRate = Math.floor(this.fuseTimer * 10) % 2;
            this.mesh.traverse((child) => {
              if (child instanceof THREE.Mesh && child.name === 'body') {
                (child.material as THREE.MeshLambertMaterial).emissive.setHex(
                  flashRate ? 0xffffff : 0x000000
                );
              }
            });

            // Swell up
            const swellAmount = 1 + (this.fuseTimer / this.FUSE_TIME) * 0.3;
            this.mesh.scale.set(swellAmount, swellAmount, swellAmount);

            if (this.fuseTimer >= this.FUSE_TIME) {
              this.hasExploded = true;
              this.isDead = true;
              result.exploded = true;
              result.position = this.position.clone();
              return result;
            }

            // Move slower while fusing
            this.velocity.x = dir.x * this.config.speed * 0.3;
            this.velocity.z = dir.z * this.config.speed * 0.3;
          } else {
            // Stop fusing if player moves away
            if (this.isFusing && distanceToPlayer > 5) {
              this.isFusing = false;
              this.fuseTimer = 0;
              this.mesh.scale.set(1, 1, 1);
              this.mesh.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  (child.material as THREE.MeshLambertMaterial).emissive.setHex(0x000000);
                }
              });
            }

            this.velocity.x = dir.x * this.config.speed;
            this.velocity.z = dir.z * this.config.speed;
          }
        } else if (this.type === 'drowned') {
          // Drowned behavior - can swim in 3D toward player
          const block = this.world.getBlock(
            Math.floor(this.position.x),
            Math.floor(this.position.y + 0.5),
            Math.floor(this.position.z)
          );
          this.isInWater = block === BlockType.WATER;

          if (this.isInWater) {
            // Swimming - move in 3D toward player
            const dir3D = new THREE.Vector3()
              .subVectors(this.targetPlayer.position, this.position)
              .normalize();

            this.velocity.x = dir3D.x * this.SWIM_SPEED;
            this.velocity.y = dir3D.y * this.SWIM_SPEED;
            this.velocity.z = dir3D.z * this.SWIM_SPEED;

            // Tilt body when swimming
            this.mesh.rotation.x = -dir3D.y * 0.5;
          } else {
            // On land - walk like normal zombie but slower
            this.velocity.x = dir.x * this.config.speed * 0.7;
            this.velocity.z = dir.z * this.config.speed * 0.7;
            this.mesh.rotation.x = 0;
          }

          if (distanceToPlayer < 1.5 && this.attackCooldown <= 0) {
            this.attack(player);
          }
        } else {
          // Normal hostile mob behavior
          this.velocity.x = dir.x * this.config.speed;
          this.velocity.z = dir.z * this.config.speed;

          if (distanceToPlayer < 1.5 && this.attackCooldown <= 0) {
            this.attack(player);
          }

          if (this.type === 'skeleton' && distanceToPlayer > 3 && distanceToPlayer < 16 && this.attackCooldown <= 0) {
            this.shootArrow(player);
          }
        }

        this.mesh.rotation.y = Math.atan2(dir.x, dir.z);

        // Mob sounds
        if (this.soundTimer <= 0) {
          this.soundTimer = 3 + Math.random() * 5;
          if (this.type === 'zombie' || this.type === 'drowned') {
            sound.playZombieGroan();
          } else if (this.type === 'skeleton') {
            sound.playSkeletonRattle();
          }
        }
      }
    } else if (this.type !== 'enderman') {
      // Passive mob AI (enderman has its own behavior)
      this.wanderTimer -= deltaTime;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = 3 + Math.random() * 5;
        const angle = Math.random() * Math.PI * 2;
        this.wanderDirection.set(Math.cos(angle), 0, Math.sin(angle));
      }

      this.velocity.x = this.wanderDirection.x * this.config.speed * 0.3;
      this.velocity.z = this.wanderDirection.z * this.config.speed * 0.3;

      if (this.velocity.length() > 0.1) {
        this.mesh.rotation.y = Math.atan2(this.velocity.x, this.velocity.z);
      }
    }

    // Ender Dragon AI - special flying behavior
    if (this.type === 'ender_dragon') {
      this.updateDragonAI(deltaTime, player);
    }

    // Apply gravity (reduced for drowned in water, disabled for dragon)
    if (this.type === 'ender_dragon') {
      // Dragon controls its own Y movement, no gravity
    } else if (this.type === 'drowned' && this.isInWater) {
      // Drowned float/sink slowly in water
      this.velocity.y -= 2 * deltaTime;
    } else {
      this.velocity.y -= 25 * deltaTime;
    }

    // Move with collision
    this.moveWithCollision(deltaTime);

    // Animate legs when moving
    const speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
    if (speed > 0.1) {
      const walkCycle = Math.sin(performance.now() * 0.01 * speed) * 0.5;
      const leftLeg = this.mesh.getObjectByName('leftLeg');
      const rightLeg = this.mesh.getObjectByName('rightLeg');
      const leftArm = this.mesh.getObjectByName('leftArm');
      const rightArm = this.mesh.getObjectByName('rightArm');

      if (leftLeg) leftLeg.rotation.x = walkCycle;
      if (rightLeg) rightLeg.rotation.x = -walkCycle;
      if (leftArm) leftArm.rotation.x = -walkCycle * 0.5;
      if (rightArm) rightArm.rotation.x = walkCycle * 0.5;
    }

    // Update mesh position (enderman shake is already applied in updateEndermanBehavior)
    if (this.type !== 'enderman' || !this.isAngry) {
      this.mesh.position.copy(this.position);
    }
    return result;
  }

  private updateEndermanBehavior(deltaTime: number, player: Player, distanceToPlayer: number): void {
    // Update teleport cooldown
    if (this.teleportCooldown > 0) {
      this.teleportCooldown -= deltaTime;
    }

    // Check if player is looking at enderman
    const playerForward = player.getForwardDirection();
    const toEnderman = new THREE.Vector3()
      .subVectors(this.position, player.position)
      .normalize();

    // Dot product tells us if player is facing the enderman
    // Higher dot = more directly looking at
    const lookingAtEnderman = playerForward.dot(toEnderman);

    // Player must be looking directly at enderman (within ~45 degree cone) and close enough
    if (lookingAtEnderman > 0.7 && distanceToPlayer < 64) {
      this.stareTimer += deltaTime;

      // Become angry after being stared at for 0.5 seconds
      if (this.stareTimer > 0.5 && !this.isAngry) {
        this.isAngry = true;
      }
    } else {
      // Reset stare timer if player looks away
      if (this.stareTimer > 0 && !this.isAngry) {
        this.stareTimer = 0;
      }
    }

    if (this.isAngry) {
      // Hostile behavior when angry
      if (distanceToPlayer < 64) {
        this.targetPlayer = player;
      } else {
        this.targetPlayer = null;
        this.isAngry = false; // Calm down if player gets too far
      }

      if (this.targetPlayer) {
        const dir = new THREE.Vector3()
          .subVectors(this.targetPlayer.position, this.position)
          .normalize();

        // Move toward player
        this.velocity.x = dir.x * this.config.speed;
        this.velocity.z = dir.z * this.config.speed;

        // Teleport randomly while chasing (every 2-3 seconds)
        if (this.teleportCooldown <= 0 && Math.random() < 0.02) {
          this.teleportEnderman();
          this.teleportCooldown = 2 + Math.random(); // 2-3 seconds
        }

        // Attack when close
        if (distanceToPlayer < 2.0 && this.attackCooldown <= 0) {
          this.attack(player);
        }

        // Face the player
        this.mesh.rotation.y = Math.atan2(dir.x, dir.z);

        // Shake/vibrate when angry
        this.shakeOffset.set(
          (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 0.1
        );
        this.mesh.position.copy(this.position).add(this.shakeOffset);
      }
    } else {
      // Neutral behavior - wander like passive mob
      this.wanderTimer -= deltaTime;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = 3 + Math.random() * 5;
        const angle = Math.random() * Math.PI * 2;
        this.wanderDirection.set(Math.cos(angle), 0, Math.sin(angle));
      }

      this.velocity.x = this.wanderDirection.x * this.config.speed * 0.3;
      this.velocity.z = this.wanderDirection.z * this.config.speed * 0.3;

      if (this.velocity.length() > 0.1) {
        this.mesh.rotation.y = Math.atan2(this.velocity.x, this.velocity.z);
      }

      // Update mesh position for neutral enderman (no shake)
      this.mesh.position.copy(this.position);
    }
  }

  private teleportEnderman(): void {
    // Try to find a valid teleport location nearby
    for (let attempts = 0; attempts < 10; attempts++) {
      // Teleport within 16 blocks randomly
      const offsetX = (Math.random() - 0.5) * 32;
      const offsetZ = (Math.random() - 0.5) * 32;
      const newX = this.position.x + offsetX;
      const newZ = this.position.z + offsetZ;

      // Find ground level at new position
      for (let y = Math.floor(this.position.y) + 10; y > Math.floor(this.position.y) - 10; y--) {
        const block = this.world.getBlock(Math.floor(newX), y, Math.floor(newZ));
        const blockAbove = this.world.getBlock(Math.floor(newX), y + 1, Math.floor(newZ));
        const blockAbove2 = this.world.getBlock(Math.floor(newX), y + 2, Math.floor(newZ));
        const blockAbove3 = this.world.getBlock(Math.floor(newX), y + 3, Math.floor(newZ));

        if (BLOCKS[block].solid &&
            !BLOCKS[blockAbove].solid &&
            !BLOCKS[blockAbove2].solid &&
            !BLOCKS[blockAbove3].solid) {
          // Valid location found - teleport!
          this.position.set(newX, y + 1, newZ);
          this.velocity.set(0, 0, 0); // Reset velocity on teleport

          // Particle effect would go here (purple particles)
          return;
        }
      }
    }
    // If no valid location found after 10 attempts, don't teleport
  }

  private updateDragonAI(deltaTime: number, player: Player): void {
    const centerX = 0;
    const centerZ = 0;
    const circleRadius = 40;

    // Update phase timer
    this.dragonPhaseTimer += deltaTime;

    // Wing animation - always flap wings
    const wingFlap = Math.sin(performance.now() * 0.003) * 0.4;
    const leftWing = this.mesh.getObjectByName('leftWing');
    const rightWing = this.mesh.getObjectByName('rightWing');
    if (leftWing) leftWing.rotation.z = 0.2 + wingFlap;
    if (rightWing) rightWing.rotation.z = -0.2 - wingFlap;

    // Phase management and behavior
    switch (this.dragonPhase) {
      case 'circling': {
        // Circle around the center of the End at varying heights
        this.dragonCircleAngle += deltaTime * 0.5;

        // Vary height in a slow sine wave
        const heightVariation = Math.sin(this.dragonCircleAngle * 0.3) * 15;
        this.dragonTargetHeight = 64 + heightVariation;

        // Calculate circular position
        const targetX = centerX + Math.cos(this.dragonCircleAngle) * circleRadius;
        const targetZ = centerZ + Math.sin(this.dragonCircleAngle) * circleRadius;

        // Move toward target position
        const dx = targetX - this.position.x;
        const dz = targetZ - this.position.z;
        const horizontalDist = Math.sqrt(dx * dx + dz * dz);

        if (horizontalDist > 0.1) {
          this.velocity.x = (dx / horizontalDist) * this.config.speed;
          this.velocity.z = (dz / horizontalDist) * this.config.speed;
        }

        // Smooth vertical movement toward target height
        const dy = this.dragonTargetHeight - this.position.y;
        this.velocity.y = dy * 2;

        // Point dragon in direction of movement
        this.mesh.rotation.y = Math.atan2(this.velocity.x, this.velocity.z);

        // Tilt slightly based on turning
        this.mesh.rotation.z = -this.velocity.x * 0.05;

        // Occasionally dive at player
        const distanceToPlayer = this.position.distanceTo(player.position);
        if (this.dragonPhaseTimer > 8 && distanceToPlayer < 60 && !player.isDead) {
          this.dragonPhase = 'diving';
          this.dragonPhaseTimer = 0;
        }

        // Occasionally perch
        if (this.dragonPhaseTimer > 20 && Math.random() < 0.3) {
          this.dragonPhase = 'perching';
          this.dragonPhaseTimer = 0;
        }
        break;
      }

      case 'diving': {
        // Dive toward player position
        const targetPos = player.position.clone();
        targetPos.y += 1; // Aim for player's head

        const dx = targetPos.x - this.position.x;
        const dy = targetPos.y - this.position.y;
        const dz = targetPos.z - this.position.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist > 0.1) {
          // Dive at high speed
          const diveSpeed = this.config.speed * 1.5;
          this.velocity.x = (dx / dist) * diveSpeed;
          this.velocity.y = (dy / dist) * diveSpeed;
          this.velocity.z = (dz / dist) * diveSpeed;
        }

        // Point at player
        this.mesh.rotation.y = Math.atan2(dx, dz);

        // Tilt down when diving
        this.mesh.rotation.x = Math.atan2(-dy, Math.sqrt(dx * dx + dz * dz));

        // Attack if close enough
        const distanceToPlayer = this.position.distanceTo(player.position);
        if (distanceToPlayer < 4 && this.attackCooldown <= 0) {
          this.attack(player);
        }

        // Pull up after diving for 3 seconds or if close to ground
        if (this.dragonPhaseTimer > 3 || this.position.y < 30) {
          this.dragonPhase = 'circling';
          this.dragonPhaseTimer = 0;
          this.dragonTargetHeight = 70; // Pull up high
        }
        break;
      }

      case 'perching': {
        // Find a perching position and land
        const perchY = 65;
        const perchX = centerX + Math.cos(this.dragonCircleAngle) * 20;
        const perchZ = centerZ + Math.sin(this.dragonCircleAngle) * 20;

        const dx = perchX - this.position.x;
        const dy = perchY - this.position.y;
        const dz = perchZ - this.position.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist > 2) {
          // Move toward perch
          this.velocity.x = (dx / dist) * this.config.speed * 0.5;
          this.velocity.y = (dy / dist) * this.config.speed * 0.5;
          this.velocity.z = (dz / dist) * this.config.speed * 0.5;
        } else {
          // Perched - minimal movement
          this.velocity.x = 0;
          this.velocity.y = 0;
          this.velocity.z = 0;
        }

        // Level out when perching
        this.mesh.rotation.x *= 0.9;
        this.mesh.rotation.z *= 0.9;

        // Slow wing flapping when perched
        if (dist < 3) {
          const slowFlap = Math.sin(performance.now() * 0.001) * 0.2;
          if (leftWing) leftWing.rotation.z = 0.1 + slowFlap;
          if (rightWing) rightWing.rotation.z = -0.1 - slowFlap;
        }

        // Take off after perching for a while
        if (this.dragonPhaseTimer > 5) {
          this.dragonPhase = 'circling';
          this.dragonPhaseTimer = 0;
        }
        break;
      }
    }
  }

  private moveWithCollision(deltaTime: number): void {
    const halfWidth = 0.3;

    const newX = this.position.x + this.velocity.x * deltaTime;
    if (!this.checkCollision(newX, this.position.y, this.position.z, halfWidth)) {
      this.position.x = newX;
    } else {
      this.velocity.x = 0;
      if (this.onGround && this.targetPlayer) {
        this.velocity.y = 7;
      }
    }

    const newY = this.position.y + this.velocity.y * deltaTime;
    if (!this.checkCollision(this.position.x, newY, this.position.z, halfWidth)) {
      this.position.y = newY;
      this.onGround = false;
    } else {
      if (this.velocity.y < 0) {
        this.onGround = true;
        this.position.y = Math.floor(this.position.y) + 0.001;
      }
      this.velocity.y = 0;
    }

    const newZ = this.position.z + this.velocity.z * deltaTime;
    if (!this.checkCollision(this.position.x, this.position.y, newZ, halfWidth)) {
      this.position.z = newZ;
    } else {
      this.velocity.z = 0;
      if (this.onGround && this.targetPlayer) {
        this.velocity.y = 7;
      }
    }
  }

  private checkCollision(x: number, y: number, z: number, halfWidth: number): boolean {
    const checkPoints = [
      [x - halfWidth, y, z - halfWidth],
      [x + halfWidth, y, z - halfWidth],
      [x - halfWidth, y, z + halfWidth],
      [x + halfWidth, y, z + halfWidth],
      [x - halfWidth, y + 1, z - halfWidth],
      [x + halfWidth, y + 1, z - halfWidth],
      [x - halfWidth, y + 1, z + halfWidth],
      [x + halfWidth, y + 1, z + halfWidth],
    ];

    for (const [px, py, pz] of checkPoints) {
      const block = this.world.getBlock(Math.floor(px), Math.floor(py), Math.floor(pz));
      if (BLOCKS[block].solid) {
        return true;
      }
    }

    return false;
  }

  private attack(player: Player): void {
    const knockbackDir = new THREE.Vector3()
      .subVectors(player.position, this.position)
      .normalize();
    player.takeDamage(this.config.damage, knockbackDir);
    this.attackCooldown = 1.0;
  }

  private shootArrow(player: Player): void {
    const accuracy = 0.7;
    if (Math.random() < accuracy) {
      player.takeDamage(this.config.damage);
    }
    this.attackCooldown = 1.5;
  }

  takeDamage(amount: number, knockbackDir?: THREE.Vector3): void {
    this.health -= amount;
    this.hurtTimer = 0.2;

    if (knockbackDir) {
      this.velocity.x += knockbackDir.x * 5;
      this.velocity.y += 3;
      this.velocity.z += knockbackDir.z * 5;
    }

    if (this.health <= 0) {
      this.isDead = true;
    }
  }

  dispose(): void {
    this.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
  }
}

export class MobManager {
  private mobs: Mob[] = [];
  private scene: THREE.Scene;
  private world: World;
  private spawnTimer = 0;
  private maxMobs = 30;

  public onMobKilled?: (mob: Mob) => void;
  public onExplosion?: (position: THREE.Vector3) => void;

  constructor(scene: THREE.Scene, world: World) {
    this.scene = scene;
    this.world = world;
  }

  update(deltaTime: number, player: Player, isNight: boolean): void {
    this.spawnTimer += deltaTime;
    if (this.spawnTimer >= 3 && this.mobs.length < this.maxMobs) {
      this.spawnTimer = 0;

      // Always try to spawn drowned in nearby water
      if (Math.random() < 0.15) {
        this.trySpawnDrowned(player);
      }

      if (isNight) {
        // Spawn hostile mobs at night - creepers are rarer
        const rand = Math.random();
        if (rand < 0.4) {
          this.trySpawnMob(player, 'zombie');
        } else if (rand < 0.7) {
          this.trySpawnMob(player, 'skeleton');
        } else {
          this.trySpawnMob(player, 'creeper');
        }
      } else {
        // Spawn passive mobs during day (NOT villagers - they spawn at villages only)
        if (Math.random() < 0.4) {
          const rand = Math.random();
          if (rand < 0.33) {
            this.trySpawnMob(player, 'pig');
          } else if (rand < 0.66) {
            this.trySpawnMob(player, 'cow');
          } else {
            this.trySpawnMob(player, 'chicken');
          }
        }

        // Spawn villagers ONLY at villages
        if (Math.random() < 0.2) {
          this.trySpawnVillagerAtVillage(player);
        }
      }

      // Try to spawn turtles near water (beach areas)
      if (Math.random() < 0.1) {
        this.trySpawnTurtle(player);
      }
    }

    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const mob = this.mobs[i];
      const updateResult = mob.update(deltaTime, player);

      // Handle creeper explosion
      if (updateResult.exploded) {
        this.handleExplosion(updateResult.position, player);
      }

      if (mob.isDead && mob.deathTimer > 1) {
        this.scene.remove(mob.mesh);
        mob.dispose();
        this.mobs.splice(i, 1);
        if (!mob.hasExploded) {
          this.onMobKilled?.(mob);
        }
      }

      if (mob.position.distanceTo(player.position) > 80) {
        this.scene.remove(mob.mesh);
        mob.dispose();
        this.mobs.splice(i, 1);
      }

      // Burn hostile mobs in sunlight (except creepers and drowned)
      if (!isNight && mob.config.hostile && !mob.isDead && mob.type !== 'creeper' && mob.type !== 'drowned') {
        const skyVisible = this.checkSkyVisible(mob.position);
        if (skyVisible) {
          mob.takeDamage(deltaTime * 5);
        }
      }
    }
  }

  private handleExplosion(position: THREE.Vector3, player: Player): void {
    sound.playExplosion();
    this.onExplosion?.(position);

    // Damage player if close
    const distToPlayer = position.distanceTo(player.position);
    if (distToPlayer < 6) {
      const damage = Math.floor(20 * (1 - distToPlayer / 6));
      const knockback = new THREE.Vector3()
        .subVectors(player.position, position)
        .normalize();
      player.takeDamage(damage, knockback);
    }

    // Destroy blocks in radius
    const radius = 3;
    for (let x = -radius; x <= radius; x++) {
      for (let y = -radius; y <= radius; y++) {
        for (let z = -radius; z <= radius; z++) {
          const dist = Math.sqrt(x * x + y * y + z * z);
          if (dist <= radius) {
            const bx = Math.floor(position.x) + x;
            const by = Math.floor(position.y) + y;
            const bz = Math.floor(position.z) + z;

            const block = this.world.getBlock(bx, by, bz);
            if (block !== BlockType.BEDROCK && block !== BlockType.AIR) {
              // Random chance to destroy based on distance
              if (Math.random() > dist / radius * 0.5) {
                this.world.setBlock(bx, by, bz, BlockType.AIR);
              }
            }
          }
        }
      }
    }
  }

  private checkSkyVisible(pos: THREE.Vector3): boolean {
    for (let y = Math.floor(pos.y) + 2; y < 128; y++) {
      const block = this.world.getBlock(Math.floor(pos.x), y, Math.floor(pos.z));
      if (BLOCKS[block].solid) return false;
    }
    return true;
  }

  private trySpawnMob(player: Player, type: MobType): void {
    const angle = Math.random() * Math.PI * 2;
    const distance = 16 + Math.random() * 16;
    const x = player.position.x + Math.cos(angle) * distance;
    const z = player.position.z + Math.sin(angle) * distance;

    let y = -1;
    for (let ty = 100; ty > 0; ty--) {
      const block = this.world.getBlock(Math.floor(x), ty, Math.floor(z));
      const blockAbove = this.world.getBlock(Math.floor(x), ty + 1, Math.floor(z));
      const blockAbove2 = this.world.getBlock(Math.floor(x), ty + 2, Math.floor(z));

      if (BLOCKS[block].solid && !BLOCKS[blockAbove].solid && !BLOCKS[blockAbove2].solid) {
        y = ty + 1;
        break;
      }
    }

    if (y > 0) {
      const mob = new Mob(type, x, y, z, this.world);
      this.mobs.push(mob);
      this.scene.add(mob.mesh);
    }
  }

  private trySpawnDrowned(player: Player): void {
    // Try to find water nearby to spawn drowned
    const angle = Math.random() * Math.PI * 2;
    const distance = 20 + Math.random() * 20;
    const x = player.position.x + Math.cos(angle) * distance;
    const z = player.position.z + Math.sin(angle) * distance;

    // Look for water blocks
    for (let ty = 60; ty > 10; ty--) {
      const block = this.world.getBlock(Math.floor(x), ty, Math.floor(z));

      if (block === BlockType.WATER) {
        // Check if there's enough water depth
        const blockBelow = this.world.getBlock(Math.floor(x), ty - 1, Math.floor(z));
        const blockAbove = this.world.getBlock(Math.floor(x), ty + 1, Math.floor(z));

        // Spawn in middle of water column
        if (blockBelow === BlockType.WATER || BLOCKS[blockBelow].solid) {
          if (blockAbove === BlockType.WATER || blockAbove === BlockType.AIR) {
            const mob = new Mob('drowned', x, ty, z, this.world);
            this.mobs.push(mob);
            this.scene.add(mob.mesh);
            return;
          }
        }
      }
    }
  }

  private trySpawnTurtle(player: Player): void {
    // Try to find beach areas (near water but on sand)
    const angle = Math.random() * Math.PI * 2;
    const distance = 20 + Math.random() * 25;
    const x = player.position.x + Math.cos(angle) * distance;
    const z = player.position.z + Math.sin(angle) * distance;

    // Look for sand blocks near water (beach)
    for (let ty = 60; ty > 30; ty--) {
      const block = this.world.getBlock(Math.floor(x), ty, Math.floor(z));
      const blockAbove = this.world.getBlock(Math.floor(x), ty + 1, Math.floor(z));
      const blockAbove2 = this.world.getBlock(Math.floor(x), ty + 2, Math.floor(z));

      if (block === BlockType.SAND && blockAbove === BlockType.AIR && blockAbove2 === BlockType.AIR) {
        // Check if near water
        let nearWater = false;
        for (let dx = -3; dx <= 3; dx++) {
          for (let dz = -3; dz <= 3; dz++) {
            const checkBlock = this.world.getBlock(Math.floor(x) + dx, ty, Math.floor(z) + dz);
            if (checkBlock === BlockType.WATER) {
              nearWater = true;
              break;
            }
          }
          if (nearWater) break;
        }

        if (nearWater) {
          const mob = new Mob('turtle', x, ty + 1, z, this.world);
          this.mobs.push(mob);
          this.scene.add(mob.mesh);
          return;
        }
      }
    }
  }

  getMobsNear(position: THREE.Vector3, radius: number): Mob[] {
    return this.mobs.filter(
      (mob) => !mob.isDead && mob.position.distanceTo(position) < radius
    );
  }

  attackMob(position: THREE.Vector3, direction: THREE.Vector3, damage: number): Mob | null {
    for (const mob of this.mobs) {
      if (mob.isDead) continue;

      const toMob = new THREE.Vector3().subVectors(mob.position, position);
      toMob.y += 1;

      if (toMob.length() < 4) {
        const dot = toMob.normalize().dot(direction);
        if (dot > 0.5) {
          mob.takeDamage(damage, direction);
          return mob;
        }
      }
    }
    return null;
  }

  getMobCount(): number {
    return this.mobs.length;
  }

  private trySpawnVillagerAtVillage(player: Player): void {
    // Get village locations from the world's structure generator
    const structureGen = this.world.getStructureGenerator();
    const villages = structureGen.getVillageLocations();

    if (villages.length === 0) return;

    // Find villages near the player
    const nearbyVillages = villages.filter(village => {
      const dist = Math.sqrt(
        (player.position.x - village.x) ** 2 +
        (player.position.z - village.z) ** 2
      );
      return dist < 100; // Only spawn at villages within 100 blocks of player
    });

    if (nearbyVillages.length === 0) return;

    // Pick a random nearby village
    const village = nearbyVillages[Math.floor(Math.random() * nearbyVillages.length)];

    // Count existing villagers at this village
    const villagersAtVillage = this.mobs.filter(mob => {
      if (mob.type !== 'villager' || mob.isDead) return false;
      const dist = Math.sqrt(
        (mob.position.x - village.x) ** 2 +
        (mob.position.z - village.z) ** 2
      );
      return dist < 50;
    });

    // Max 6 villagers per village
    if (villagersAtVillage.length >= 6) return;

    // Spawn villager at random position in village
    const spawnX = village.x + (Math.random() - 0.5) * 30;
    const spawnZ = village.z + (Math.random() - 0.5) * 30;

    // Find ground level
    let y = -1;
    for (let ty = 100; ty > 0; ty--) {
      const block = this.world.getBlock(Math.floor(spawnX), ty, Math.floor(spawnZ));
      const blockAbove = this.world.getBlock(Math.floor(spawnX), ty + 1, Math.floor(spawnZ));
      const blockAbove2 = this.world.getBlock(Math.floor(spawnX), ty + 2, Math.floor(spawnZ));

      if (BLOCKS[block].solid && !BLOCKS[blockAbove].solid && !BLOCKS[blockAbove2].solid) {
        y = ty + 1;
        break;
      }
    }

    if (y > 0) {
      const mob = new Mob('villager', spawnX, y, spawnZ, this.world);
      this.mobs.push(mob);
      this.scene.add(mob.mesh);
    }
  }
}
