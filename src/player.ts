import * as THREE from 'three';
import { World } from './world';
import { BlockType, BLOCKS } from './blocks';

export class Player {
  public camera: THREE.PerspectiveCamera;
  public position: THREE.Vector3;
  public velocity: THREE.Vector3;

  private pitch = 0;
  private yaw = 0;

  private moveForward = false;
  private moveBackward = false;
  private moveLeft = false;
  private moveRight = false;
  private jumping = false;
  private sprinting = false;

  private readonly WALK_SPEED = 4.3;
  private readonly SPRINT_SPEED = 5.6;
  private readonly JUMP_VELOCITY = 8;
  private readonly GRAVITY = 25;
  private readonly PLAYER_HEIGHT = 1.8;
  private readonly PLAYER_WIDTH = 0.6;

  private onGround = false;
  public isLocked = false;

  // Flying mode (creative)
  public isFlying = false;
  private lastSpacePress = 0;
  private readonly FLY_SPEED = 10;
  private readonly FLY_VERTICAL_SPEED = 8;

  // Survival stats
  public health = 20;
  public maxHealth = 20;
  public hunger = 20;
  public maxHunger = 20;
  private hungerTimer = 0;
  private regenTimer = 0;
  public isDead = false;

  // Fall damage
  private fallStartY = 0;
  private wasFalling = false;

  // Swimming
  public isSwimming = false;
  public isUnderwater = false;
  public oxygen = 20;
  public maxOxygen = 20;
  private oxygenTimer = 0;
  private readonly SWIM_SPEED = 2.5;

  // Attack cooldown
  private attackCooldown = 0;
  public canAttack = true;

  // Callbacks
  public onDeath?: () => void;
  public onDamage?: () => void;

  constructor(private world: World) {
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.position = new THREE.Vector3(0, 60, 0);
    this.velocity = new THREE.Vector3();

    this.setupControls();
  }

  private setupControls(): void {
    // Keyboard controls
    document.addEventListener('keydown', (e) => {
      if (this.isDead) return;
      switch (e.code) {
        case 'KeyW': this.moveForward = true; break;
        case 'KeyS': this.moveBackward = true; break;
        case 'KeyA': this.moveLeft = true; break;
        case 'KeyD': this.moveRight = true; break;
        case 'Space':
          this.jumping = true;
          e.preventDefault();
          // Double-tap space to toggle flying
          const now = Date.now();
          if (now - this.lastSpacePress < 300) {
            this.isFlying = !this.isFlying;
            this.velocity.y = 0;
          }
          this.lastSpacePress = now;
          break;
        case 'ShiftLeft': this.sprinting = true; break;
      }
    });

    document.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW': this.moveForward = false; break;
        case 'KeyS': this.moveBackward = false; break;
        case 'KeyA': this.moveLeft = false; break;
        case 'KeyD': this.moveRight = false; break;
        case 'Space': this.jumping = false; break;
        case 'ShiftLeft': this.sprinting = false; break;
      }
    });

    // Mouse look - attach to document for better capture
    document.addEventListener('mousemove', (e) => {
      if (!this.isLocked || this.isDead) return;

      const sensitivity = 0.002;
      this.yaw -= e.movementX * sensitivity;
      this.pitch -= e.movementY * sensitivity;
      this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
    });

    // Pointer lock change
    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement !== null;
    });

    // Also handle pointer lock error
    document.addEventListener('pointerlockerror', () => {
      console.error('Pointer lock failed');
    });
  }

  lock(): void {
    document.body.requestPointerLock();
  }

  unlock(): void {
    document.exitPointerLock();
  }

  takeDamage(amount: number, knockbackDir?: THREE.Vector3): void {
    if (this.isDead) return;

    this.health -= amount;
    this.onDamage?.();

    if (knockbackDir) {
      this.velocity.x += knockbackDir.x * 8;
      this.velocity.y += 4;
      this.velocity.z += knockbackDir.z * 8;
    }

    if (this.health <= 0) {
      this.health = 0;
      this.isDead = true;
      this.onDeath?.();
    }
  }

  heal(amount: number): void {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  feed(amount: number): void {
    this.hunger = Math.min(this.maxHunger, this.hunger + amount);
  }

  respawn(): void {
    this.health = this.maxHealth;
    this.hunger = this.maxHunger;
    this.isDead = false;
    this.velocity.set(0, 0, 0);
    this.spawn();
  }

  update(deltaTime: number): void {
    if (this.isDead) {
      // Camera looks at ground when dead
      this.pitch = Math.min(this.pitch + deltaTime * 2, Math.PI / 4);
      this.updateCamera();
      return;
    }

    // Attack cooldown
    if (this.attackCooldown > 0) {
      this.attackCooldown -= deltaTime;
      this.canAttack = this.attackCooldown <= 0;
    }

    // Hunger system
    this.hungerTimer += deltaTime;
    if (this.hungerTimer >= 4) { // Lose hunger every 4 seconds when moving
      this.hungerTimer = 0;
      if (this.sprinting && (this.moveForward || this.moveBackward || this.moveLeft || this.moveRight)) {
        this.hunger = Math.max(0, this.hunger - 0.5);
      } else if (this.moveForward || this.moveBackward || this.moveLeft || this.moveRight) {
        this.hunger = Math.max(0, this.hunger - 0.1);
      }
    }

    // Regeneration when full hunger
    if (this.hunger >= 18 && this.health < this.maxHealth) {
      this.regenTimer += deltaTime;
      if (this.regenTimer >= 2) {
        this.regenTimer = 0;
        this.heal(1);
        this.hunger -= 1;
      }
    }

    // Starvation damage
    if (this.hunger <= 0) {
      this.hungerTimer += deltaTime;
      if (this.hungerTimer >= 2) {
        this.hungerTimer = 0;
        this.takeDamage(1);
      }
    }

    // Calculate movement direction
    const moveDir = new THREE.Vector3();

    if (this.moveForward) moveDir.z -= 1;
    if (this.moveBackward) moveDir.z += 1;
    if (this.moveLeft) moveDir.x -= 1;
    if (this.moveRight) moveDir.x += 1;

    // Can't sprint without hunger
    const actualSprinting = this.sprinting && this.hunger > 6;

    // Flying mode
    if (this.isFlying) {
      // Flying movement
      if (moveDir.length() > 0) {
        moveDir.normalize();
        const cos = Math.cos(this.yaw);
        const sin = Math.sin(this.yaw);
        const rotatedX = moveDir.x * cos + moveDir.z * sin;
        const rotatedZ = -moveDir.x * sin + moveDir.z * cos;

        const speed = actualSprinting ? this.FLY_SPEED * 2 : this.FLY_SPEED;
        this.velocity.x = rotatedX * speed;
        this.velocity.z = rotatedZ * speed;
      } else {
        this.velocity.x *= 0.8;
        this.velocity.z *= 0.8;
      }

      // Fly up/down
      if (this.jumping) {
        this.velocity.y = this.FLY_VERTICAL_SPEED;
      } else if (this.sprinting) {
        this.velocity.y = -this.FLY_VERTICAL_SPEED;
      } else {
        this.velocity.y *= 0.8; // Slow to a hover
      }

      // No fall damage while flying
      this.wasFalling = false;
    } else {
      // Normal walking mode
      if (moveDir.length() > 0) {
        moveDir.normalize();

        // Rotate by yaw (fixed rotation direction)
        const cos = Math.cos(this.yaw);
        const sin = Math.sin(this.yaw);
        const rotatedX = moveDir.x * cos + moveDir.z * sin;
        const rotatedZ = -moveDir.x * sin + moveDir.z * cos;

        const speed = actualSprinting ? this.SPRINT_SPEED : this.WALK_SPEED;
        this.velocity.x = rotatedX * speed;
        this.velocity.z = rotatedZ * speed;
      } else {
        this.velocity.x *= 0.8;
        this.velocity.z *= 0.8;
      }

      // Jumping
      if (this.jumping && this.onGround) {
        this.velocity.y = this.JUMP_VELOCITY;
        this.onGround = false;
      }

      // Track falling for fall damage
      if (!this.onGround && this.velocity.y < 0 && !this.wasFalling) {
        this.fallStartY = this.position.y;
        this.wasFalling = true;
      }

      // Apply gravity
      this.velocity.y -= this.GRAVITY * deltaTime;
    }

    // Check if in water (body and head separately)
    const bodyInWater = this.world.getBlock(
      Math.floor(this.position.x),
      Math.floor(this.position.y + 0.5),
      Math.floor(this.position.z)
    ) === BlockType.WATER;

    const headPos = this.position.clone();
    headPos.y += this.PLAYER_HEIGHT - 0.1;
    const headInWater = this.world.getBlock(
      Math.floor(headPos.x),
      Math.floor(headPos.y),
      Math.floor(headPos.z)
    ) === BlockType.WATER;

    this.isSwimming = bodyInWater && !this.isFlying;
    this.isUnderwater = headInWater && !this.isFlying;

    if (this.isSwimming) {
      // Swimming physics
      this.velocity.x *= 0.85;
      this.velocity.z *= 0.85;
      this.velocity.y *= 0.85;
      this.wasFalling = false; // No fall damage in water

      // Swimming movement
      if (this.jumping) {
        // Swim up
        this.velocity.y = this.SWIM_SPEED;
      } else if (this.sprinting) {
        // Dive down (using shift to sink)
        this.velocity.y = -this.SWIM_SPEED;
      } else {
        // Slow sink / float
        this.velocity.y = Math.max(this.velocity.y, -1);
      }

      // Horizontal swimming speed
      if (moveDir.length() > 0) {
        const cos = Math.cos(this.yaw);
        const sin = Math.sin(this.yaw);
        const rotatedX = moveDir.x * cos + moveDir.z * sin;
        const rotatedZ = -moveDir.x * sin + moveDir.z * cos;
        this.velocity.x = rotatedX * this.SWIM_SPEED;
        this.velocity.z = rotatedZ * this.SWIM_SPEED;
      }
    }

    // Oxygen / drowning system (skip when flying)
    if (!this.isFlying) {
      if (this.isUnderwater) {
        this.oxygenTimer += deltaTime;
        if (this.oxygenTimer >= 1) {
          this.oxygenTimer = 0;
          this.oxygen = Math.max(0, this.oxygen - 1);

          // Drowning damage when out of oxygen
          if (this.oxygen <= 0) {
            this.takeDamage(2);
          }
        }
      } else {
        // Recover oxygen when above water
        this.oxygenTimer += deltaTime;
        if (this.oxygenTimer >= 0.5) {
          this.oxygenTimer = 0;
          this.oxygen = Math.min(this.maxOxygen, this.oxygen + 2);
        }
      }
    }

    // Move with collision detection (or no-clip when flying)
    if (this.isFlying) {
      // No-clip flying - just move directly
      this.position.x += this.velocity.x * deltaTime;
      this.position.y += this.velocity.y * deltaTime;
      this.position.z += this.velocity.z * deltaTime;
    } else {
      this.moveWithCollision(deltaTime);
    }

    // Check for fall damage on landing
    if (this.onGround && this.wasFalling) {
      const fallDistance = this.fallStartY - this.position.y;
      if (fallDistance > 3) {
        const damage = Math.floor(fallDistance - 3);
        this.takeDamage(damage);
      }
      this.wasFalling = false;
    }

    this.updateCamera();
  }

  private updateCamera(): void {
    this.camera.position.copy(this.position);
    this.camera.position.y += this.PLAYER_HEIGHT - 0.1;

    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  private moveWithCollision(deltaTime: number): void {
    const halfWidth = this.PLAYER_WIDTH / 2;

    // Move X
    const newX = this.position.x + this.velocity.x * deltaTime;
    if (!this.checkCollision(newX, this.position.y, this.position.z, halfWidth)) {
      this.position.x = newX;
    } else {
      this.velocity.x = 0;
    }

    // Move Y
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

    // Move Z
    const newZ = this.position.z + this.velocity.z * deltaTime;
    if (!this.checkCollision(this.position.x, this.position.y, newZ, halfWidth)) {
      this.position.z = newZ;
    } else {
      this.velocity.z = 0;
    }
  }

  private checkCollision(x: number, y: number, z: number, halfWidth: number): boolean {
    const checkPoints = [
      [x - halfWidth, y, z - halfWidth],
      [x + halfWidth, y, z - halfWidth],
      [x - halfWidth, y, z + halfWidth],
      [x + halfWidth, y, z + halfWidth],
      [x - halfWidth, y + this.PLAYER_HEIGHT / 2, z - halfWidth],
      [x + halfWidth, y + this.PLAYER_HEIGHT / 2, z - halfWidth],
      [x - halfWidth, y + this.PLAYER_HEIGHT / 2, z + halfWidth],
      [x + halfWidth, y + this.PLAYER_HEIGHT / 2, z + halfWidth],
      [x - halfWidth, y + this.PLAYER_HEIGHT - 0.1, z - halfWidth],
      [x + halfWidth, y + this.PLAYER_HEIGHT - 0.1, z - halfWidth],
      [x - halfWidth, y + this.PLAYER_HEIGHT - 0.1, z + halfWidth],
      [x + halfWidth, y + this.PLAYER_HEIGHT - 0.1, z + halfWidth],
    ];

    for (const [px, py, pz] of checkPoints) {
      const block = this.world.getBlock(Math.floor(px), Math.floor(py), Math.floor(pz));
      if (BLOCKS[block].solid) {
        return true;
      }
    }

    return false;
  }

  getForwardDirection(): THREE.Vector3 {
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    return dir;
  }

  startAttack(): void {
    if (this.canAttack) {
      this.attackCooldown = 0.5;
      this.canAttack = false;
    }
  }

  spawn(): void {
    this.position.set(0, 80, 0);

    setTimeout(() => {
      const spawnY = this.world.getSpawnHeight(0, 0);
      this.position.y = spawnY + 1;
    }, 500);
  }
}
