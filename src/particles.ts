import * as THREE from 'three';

interface Particle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  color: THREE.Color;
  size: number;
  life: number;
  maxLife: number;
  gravity: boolean;
}

export class ParticleSystem {
  private particles: Particle[] = [];
  private geometry: THREE.BufferGeometry;
  private material: THREE.PointsMaterial;
  private points: THREE.Points;
  private maxParticles = 2000;

  constructor(scene: THREE.Scene) {
    this.geometry = new THREE.BufferGeometry();

    // Initialize with empty arrays
    const positions = new Float32Array(this.maxParticles * 3);
    const colors = new Float32Array(this.maxParticles * 3);
    const sizes = new Float32Array(this.maxParticles);

    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    this.material = new THREE.PointsMaterial({
      size: 0.15,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(
    position: THREE.Vector3,
    color: [number, number, number],
    count: number,
    options: {
      spread?: number;
      speed?: number;
      life?: number;
      size?: number;
      gravity?: boolean;
      upward?: boolean;
    } = {}
  ): void {
    const {
      spread = 0.5,
      speed = 3,
      life = 1,
      size = 0.1,
      gravity = true,
      upward = false,
    } = options;

    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) {
        this.particles.shift(); // Remove oldest
      }

      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * spread * speed,
        upward ? Math.random() * speed : (Math.random() - 0.5) * spread * speed,
        (Math.random() - 0.5) * spread * speed
      );

      this.particles.push({
        position: position.clone().add(new THREE.Vector3(
          (Math.random() - 0.5) * 0.5,
          (Math.random() - 0.5) * 0.5,
          (Math.random() - 0.5) * 0.5
        )),
        velocity,
        color: new THREE.Color(color[0] / 255, color[1] / 255, color[2] / 255),
        size: size * (0.5 + Math.random() * 0.5),
        life,
        maxLife: life,
        gravity,
      });
    }
  }

  // Block break particles
  emitBlockBreak(position: THREE.Vector3, color: [number, number, number]): void {
    this.emit(position, color, 30, {
      spread: 1,
      speed: 4,
      life: 0.8,
      size: 0.15,
      gravity: true,
    });
  }

  // Explosion particles
  emitExplosion(position: THREE.Vector3): void {
    // Fire/smoke
    this.emit(position, [255, 200, 50], 50, {
      spread: 2,
      speed: 8,
      life: 0.5,
      size: 0.3,
      gravity: false,
    });
    this.emit(position, [255, 100, 0], 40, {
      spread: 1.5,
      speed: 6,
      life: 0.7,
      size: 0.25,
      gravity: false,
    });
    this.emit(position, [100, 100, 100], 30, {
      spread: 1,
      speed: 4,
      life: 1.2,
      size: 0.4,
      gravity: false,
      upward: true,
    });
  }

  // Walking dust
  emitFootstep(position: THREE.Vector3, color: [number, number, number]): void {
    this.emit(position, color, 3, {
      spread: 0.3,
      speed: 1,
      life: 0.4,
      size: 0.08,
      gravity: false,
    });
  }

  // Damage particles
  emitDamage(position: THREE.Vector3): void {
    this.emit(position, [255, 0, 0], 10, {
      spread: 0.5,
      speed: 2,
      life: 0.3,
      size: 0.1,
      gravity: true,
    });
  }

  // Mob death poof
  emitMobDeath(position: THREE.Vector3): void {
    this.emit(position, [200, 200, 200], 20, {
      spread: 1,
      speed: 3,
      life: 0.6,
      size: 0.2,
      gravity: false,
      upward: true,
    });
  }

  // Creeper fuse sparks
  emitFuseSparks(position: THREE.Vector3): void {
    this.emit(position, [255, 255, 255], 2, {
      spread: 0.2,
      speed: 1,
      life: 0.2,
      size: 0.05,
      gravity: false,
    });
  }

  update(deltaTime: number): void {
    const positions = this.geometry.attributes.position.array as Float32Array;
    const colors = this.geometry.attributes.color.array as Float32Array;
    const sizes = this.geometry.attributes.size.array as Float32Array;

    // Update and remove dead particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= deltaTime;

      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      // Physics
      if (p.gravity) {
        p.velocity.y -= 15 * deltaTime;
      }
      p.position.add(p.velocity.clone().multiplyScalar(deltaTime));

      // Fade out
      p.velocity.multiplyScalar(0.98);
    }

    // Update buffers
    for (let i = 0; i < this.maxParticles; i++) {
      if (i < this.particles.length) {
        const p = this.particles[i];
        const fadeRatio = p.life / p.maxLife;

        positions[i * 3] = p.position.x;
        positions[i * 3 + 1] = p.position.y;
        positions[i * 3 + 2] = p.position.z;

        colors[i * 3] = p.color.r * fadeRatio;
        colors[i * 3 + 1] = p.color.g * fadeRatio;
        colors[i * 3 + 2] = p.color.b * fadeRatio;

        sizes[i] = p.size * fadeRatio;
      } else {
        sizes[i] = 0;
      }
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;
  }
}
