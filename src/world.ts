import * as THREE from 'three';
import { Chunk, CHUNK_SIZE, CHUNK_HEIGHT } from './chunk';
import { TerrainGenerator } from './terrain';
import { EndGenerator } from './end';
import { BlockType, BLOCKS } from './blocks';
import { StructureGenerator } from './structures';

export type Dimension = 'overworld' | 'end';

export class World {
  private chunks: Map<string, Chunk> = new Map();
  private scene: THREE.Scene;
  private terrain: TerrainGenerator;
  private endGenerator: EndGenerator;
  private structures: StructureGenerator;
  private renderDistance: number;
  public currentDimension: Dimension = 'overworld';
  private chunksToGenerate: Array<{ x: number; z: number; priority: number }> = [];
  private chunksToRebuild: Chunk[] = [];

  // Torch management
  private torchLights: Map<string, THREE.PointLight[]> = new Map();
  private torchLightOffsets: Map<THREE.PointLight, number> = new Map(); // Random offset for flicker timing
  private static MAX_TORCH_LIGHTS = 20; // Limit for performance

  constructor(scene: THREE.Scene, renderDistance: number = 6) {
    this.scene = scene;
    this.terrain = new TerrainGenerator();
    this.endGenerator = new EndGenerator();
    this.structures = new StructureGenerator(this);
    this.renderDistance = renderDistance;
  }

  setDimension(dimension: Dimension): void {
    if (this.currentDimension === dimension) return;

    // Clear all existing chunks
    for (const [, chunk] of this.chunks.entries()) {
      if (chunk.mesh) this.scene.remove(chunk.mesh);
      if (chunk.waterMesh) this.scene.remove(chunk.waterMesh);
      if (chunk.torchGroup) this.scene.remove(chunk.torchGroup);

      const chunkKey = `${chunk.chunkX},${chunk.chunkZ}`;
      const lights = this.torchLights.get(chunkKey);
      if (lights) {
        for (const light of lights) {
          this.scene.remove(light);
          this.torchLightOffsets.delete(light);
        }
        this.torchLights.delete(chunkKey);
      }

      chunk.dispose();
    }
    this.chunks.clear();
    this.chunksToGenerate = [];
    this.chunksToRebuild = [];

    this.currentDimension = dimension;
  }

  getStructureGenerator(): StructureGenerator {
    return this.structures;
  }

  private getChunkKey(x: number, z: number): string {
    return `${x},${z}`;
  }

  getChunk(chunkX: number, chunkZ: number): Chunk | undefined {
    return this.chunks.get(this.getChunkKey(chunkX, chunkZ));
  }

  getBlock(worldX: number, worldY: number, worldZ: number): BlockType {
    const chunkX = Math.floor(worldX / CHUNK_SIZE);
    const chunkZ = Math.floor(worldZ / CHUNK_SIZE);
    const chunk = this.getChunk(chunkX, chunkZ);

    if (!chunk || !chunk.isGenerated) return BlockType.AIR;

    const localX = ((worldX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((worldZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

    return chunk.getBlock(localX, worldY, localZ);
  }

  setBlock(worldX: number, worldY: number, worldZ: number, type: BlockType): void {
    const chunkX = Math.floor(worldX / CHUNK_SIZE);
    const chunkZ = Math.floor(worldZ / CHUNK_SIZE);
    const chunk = this.getChunk(chunkX, chunkZ);

    if (!chunk || !chunk.isGenerated) return;

    const localX = ((worldX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((worldZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

    chunk.setBlock(localX, worldY, localZ, type);

    // Mark neighbor chunks for rebuild if on edge
    if (localX === 0) this.markChunkForRebuild(chunkX - 1, chunkZ);
    if (localX === CHUNK_SIZE - 1) this.markChunkForRebuild(chunkX + 1, chunkZ);
    if (localZ === 0) this.markChunkForRebuild(chunkX, chunkZ - 1);
    if (localZ === CHUNK_SIZE - 1) this.markChunkForRebuild(chunkX, chunkZ + 1);
  }

  private markChunkForRebuild(chunkX: number, chunkZ: number): void {
    const chunk = this.getChunk(chunkX, chunkZ);
    if (chunk && chunk.isGenerated) {
      chunk.needsRebuild = true;
    }
  }

  updateChunks(playerX: number, playerZ: number): void {
    const currentChunkX = Math.floor(playerX / CHUNK_SIZE);
    const currentChunkZ = Math.floor(playerZ / CHUNK_SIZE);

    // Queue chunks that need to be generated
    for (let dx = -this.renderDistance; dx <= this.renderDistance; dx++) {
      for (let dz = -this.renderDistance; dz <= this.renderDistance; dz++) {
        const chunkX = currentChunkX + dx;
        const chunkZ = currentChunkZ + dz;
        const key = this.getChunkKey(chunkX, chunkZ);

        if (!this.chunks.has(key)) {
          const distance = Math.sqrt(dx * dx + dz * dz);
          this.chunksToGenerate.push({ x: chunkX, z: chunkZ, priority: distance });
        }
      }
    }

    // Sort by priority (closest first)
    this.chunksToGenerate.sort((a, b) => a.priority - b.priority);

    // Generate a few chunks per frame
    const chunksPerFrame = 2;
    for (let i = 0; i < chunksPerFrame && this.chunksToGenerate.length > 0; i++) {
      const { x, z } = this.chunksToGenerate.shift()!;
      const key = this.getChunkKey(x, z);

      if (!this.chunks.has(key)) {
        const chunk = new Chunk(x, z);
        // Use appropriate generator based on dimension
        if (this.currentDimension === 'end') {
          this.endGenerator.generateChunk(chunk);
        } else {
          this.terrain.generateChunk(chunk);
          // Generate structures only in overworld
          this.structures.generateStructures(chunk);
        }
        this.chunks.set(key, chunk);
        this.chunksToRebuild.push(chunk);
      }
    }

    // Rebuild meshes for chunks that need it
    const rebuildsPerFrame = 4;
    let rebuilds = 0;

    // First, check existing chunks
    for (const chunk of this.chunks.values()) {
      if (chunk.needsRebuild && chunk.isGenerated && rebuilds < rebuildsPerFrame) {
        this.rebuildChunkMesh(chunk);
        rebuilds++;
      }
    }

    // Then process rebuild queue
    while (this.chunksToRebuild.length > 0 && rebuilds < rebuildsPerFrame) {
      const chunk = this.chunksToRebuild.shift()!;
      if (chunk.needsRebuild) {
        this.rebuildChunkMesh(chunk);
        rebuilds++;
      }
    }

    // Unload distant chunks
    const unloadDistance = this.renderDistance + 2;
    for (const [key, chunk] of this.chunks.entries()) {
      const dx = chunk.chunkX - currentChunkX;
      const dz = chunk.chunkZ - currentChunkZ;
      const distance = Math.sqrt(dx * dx + dz * dz);

      if (distance > unloadDistance) {
        if (chunk.mesh) this.scene.remove(chunk.mesh);
        if (chunk.waterMesh) this.scene.remove(chunk.waterMesh);
        if (chunk.torchGroup) this.scene.remove(chunk.torchGroup);

        // Remove torch lights
        const chunkKey = `${chunk.chunkX},${chunk.chunkZ}`;
        const lights = this.torchLights.get(chunkKey);
        if (lights) {
          for (const light of lights) {
            this.scene.remove(light);
            this.torchLightOffsets.delete(light);
          }
          this.torchLights.delete(chunkKey);
        }

        chunk.dispose();
        this.chunks.delete(key);
      }
    }
  }

  private rebuildChunkMesh(chunk: Chunk): void {
    const getNeighborBlock = (wx: number, wy: number, wz: number) => {
      return this.getBlock(wx, wy, wz);
    };

    // Remove old meshes from scene
    if (chunk.mesh) this.scene.remove(chunk.mesh);
    if (chunk.waterMesh) this.scene.remove(chunk.waterMesh);
    if (chunk.torchGroup) this.scene.remove(chunk.torchGroup);

    // Remove old torch lights
    const chunkKey = `${chunk.chunkX},${chunk.chunkZ}`;
    const oldLights = this.torchLights.get(chunkKey);
    if (oldLights) {
      for (const light of oldLights) {
        this.scene.remove(light);
        this.torchLightOffsets.delete(light);
      }
      this.torchLights.delete(chunkKey);
    }

    chunk.buildMesh(getNeighborBlock);

    // Add new meshes to scene
    if (chunk.mesh) this.scene.add(chunk.mesh);
    if (chunk.waterMesh) this.scene.add(chunk.waterMesh);

    // Create torch meshes and lights
    if (chunk.torchPositions.length > 0) {
      chunk.torchGroup = new THREE.Group();
      const newLights: THREE.PointLight[] = [];

      for (const pos of chunk.torchPositions) {
        // Create torch mesh
        const torchMesh = this.createTorchMesh();
        torchMesh.position.set(pos.x + 0.5, pos.y, pos.z + 0.5);
        chunk.torchGroup.add(torchMesh);

        // Create point light (limit total lights for performance)
        if (this.getTotalTorchLights() < World.MAX_TORCH_LIGHTS) {
          const light = new THREE.PointLight(0xff9933, 1.5, 12, 1.5);
          light.position.set(pos.x + 0.5, pos.y + 0.8, pos.z + 0.5);
          light.castShadow = true;
          light.shadow.mapSize.width = 256;
          light.shadow.mapSize.height = 256;
          light.shadow.camera.near = 0.1;
          light.shadow.camera.far = 12;
          this.scene.add(light);
          newLights.push(light);
          // Store random offset for flicker timing (0 to 2π)
          this.torchLightOffsets.set(light, Math.random() * Math.PI * 2);
        }
      }

      this.scene.add(chunk.torchGroup);
      if (newLights.length > 0) {
        this.torchLights.set(chunkKey, newLights);
      }
    }
  }

  private createTorchMesh(): THREE.Group {
    const group = new THREE.Group();

    // Torch stick
    const stickGeom = new THREE.BoxGeometry(0.15, 0.6, 0.15);
    const stickMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.9 });
    const stick = new THREE.Mesh(stickGeom, stickMat);
    stick.position.y = 0.3;
    stick.castShadow = true;
    group.add(stick);

    // Torch flame (HDR emissive for bloom)
    const flameGeom = new THREE.BoxGeometry(0.1, 0.2, 0.1);
    const flameMat = new THREE.MeshStandardMaterial({
      color: 0xff9933,
      emissive: 0xff9933,
      emissiveIntensity: 3.0,
    });
    const flame = new THREE.Mesh(flameGeom, flameMat);
    flame.position.y = 0.7;
    group.add(flame);

    // Flame glow (slightly larger, more transparent, also emissive)
    const glowGeom = new THREE.BoxGeometry(0.25, 0.35, 0.25);
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0xffcc00,
      emissive: 0xffaa00,
      emissiveIntensity: 2.0,
      transparent: true,
      opacity: 0.4
    });
    const glow = new THREE.Mesh(glowGeom, glowMat);
    glow.position.y = 0.7;
    group.add(glow);

    return group;
  }

  private getTotalTorchLights(): number {
    let total = 0;
    for (const lights of this.torchLights.values()) {
      total += lights.length;
    }
    return total;
  }

  raycast(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number = 8): {
    hit: boolean;
    position: THREE.Vector3 | null;
    normal: THREE.Vector3 | null;
    blockPos: { x: number; y: number; z: number } | null;
  } {
    // Simple voxel raycast using DDA algorithm
    const step = 0.1;
    const pos = origin.clone();
    const dir = direction.clone().normalize();

    for (let t = 0; t < maxDistance; t += step) {
      pos.copy(origin).addScaledVector(dir, t);

      const bx = Math.floor(pos.x);
      const by = Math.floor(pos.y);
      const bz = Math.floor(pos.z);

      const block = this.getBlock(bx, by, bz);
      if (block !== BlockType.AIR && BLOCKS[block].solid) {
        // Found a block, calculate normal
        const center = new THREE.Vector3(bx + 0.5, by + 0.5, bz + 0.5);
        const diff = pos.clone().sub(center);

        let normal = new THREE.Vector3();
        const absDiff = new THREE.Vector3(Math.abs(diff.x), Math.abs(diff.y), Math.abs(diff.z));

        if (absDiff.x > absDiff.y && absDiff.x > absDiff.z) {
          normal.x = Math.sign(diff.x);
        } else if (absDiff.y > absDiff.z) {
          normal.y = Math.sign(diff.y);
        } else {
          normal.z = Math.sign(diff.z);
        }

        return {
          hit: true,
          position: pos,
          normal,
          blockPos: { x: bx, y: by, z: bz }
        };
      }
    }

    return { hit: false, position: null, normal: null, blockPos: null };
  }

  getSpawnHeight(x: number, z: number): number {
    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
      const block = this.getBlock(Math.floor(x), y, Math.floor(z));
      if (BLOCKS[block].solid) {
        return y + 1;
      }
    }
    return 50;
  }

  getChunkCount(): number {
    return this.chunks.size;
  }

  // Update torch light flickering
  updateTorchLights(time: number): void {
    for (const lights of this.torchLights.values()) {
      for (const light of lights) {
        const offset = this.torchLightOffsets.get(light) || 0;
        // Flicker between 1.2 and 1.8 intensity using sin wave with random offset
        const flicker = 1.5 + 0.3 * Math.sin(time * 3 + offset);
        light.intensity = flicker;
      }
    }
  }

  // Get torch positions near a point (for particle emission)
  getTorchPositionsNear(x: number, z: number, radius: number): Array<{ x: number; y: number; z: number }> {
    const torchPositions: Array<{ x: number; y: number; z: number }> = [];
    const chunkRadius = Math.ceil(radius / CHUNK_SIZE);
    const centerChunkX = Math.floor(x / CHUNK_SIZE);
    const centerChunkZ = Math.floor(z / CHUNK_SIZE);

    for (let dx = -chunkRadius; dx <= chunkRadius; dx++) {
      for (let dz = -chunkRadius; dz <= chunkRadius; dz++) {
        const chunk = this.getChunk(centerChunkX + dx, centerChunkZ + dz);
        if (chunk && chunk.isGenerated) {
          for (const pos of chunk.torchPositions) {
            const distSq = (pos.x - x) ** 2 + (pos.z - z) ** 2;
            if (distSq <= radius * radius) {
              torchPositions.push(pos);
            }
          }
        }
      }
    }

    return torchPositions;
  }

  // Update water animation with gentle waves (only nearby chunks for performance)
  updateWater(time: number, playerPos: THREE.Vector3): void {
    const playerChunkX = Math.floor(playerPos.x / CHUNK_SIZE);
    const playerChunkZ = Math.floor(playerPos.z / CHUNK_SIZE);
    const animationRadius = 3; // Only animate water within 3 chunks of player

    for (const chunk of this.chunks.values()) {
      if (!chunk.waterMesh) continue;

      // Skip chunks too far from player
      const chunkDist = Math.max(
        Math.abs(chunk.chunkX - playerChunkX),
        Math.abs(chunk.chunkZ - playerChunkZ)
      );
      if (chunkDist > animationRadius) continue;

      const geometry = chunk.waterMesh.geometry;
      const positionAttribute = geometry.getAttribute('position');

      if (!positionAttribute) continue;

      const positions = positionAttribute.array as Float32Array;
      const worldOffsetX = chunk.chunkX * CHUNK_SIZE;
      const worldOffsetZ = chunk.chunkZ * CHUNK_SIZE;

      // Store original Y positions if not already stored
      if (!(geometry as any).originalPositions) {
        (geometry as any).originalPositions = new Float32Array(positions.length);
        for (let i = 0; i < positions.length; i++) {
          (geometry as any).originalPositions[i] = positions[i];
        }
      }

      const originalPositions = (geometry as any).originalPositions;

      // Animate vertices
      for (let i = 0; i < positions.length; i += 3) {
        const localX = originalPositions[i];
        const localZ = originalPositions[i + 2];
        const worldX = worldOffsetX + localX;
        const worldZ = worldOffsetZ + localZ;

        // Use multiple sine waves for more natural wave pattern
        const wave1 = Math.sin(time * 1.5 + worldX * 0.5 + worldZ * 0.3) * 0.04;
        const wave2 = Math.sin(time * 2.0 + worldX * 0.3 - worldZ * 0.4) * 0.03;
        const wave3 = Math.sin(time * 1.0 + (worldX + worldZ) * 0.2) * 0.02;

        // Apply wave displacement to Y position
        positions[i + 1] = originalPositions[i + 1] + wave1 + wave2 + wave3;
      }

      positionAttribute.needsUpdate = true;
    }
  }
}
