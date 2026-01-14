import { createNoise2D } from 'simplex-noise';
import { BlockType } from './blocks';
import { Chunk, CHUNK_SIZE, CHUNK_HEIGHT } from './chunk';

// Simple seeded PRNG
function createPRNG(seed: number): () => number {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export class EndGenerator {
  private noise2D: ReturnType<typeof createNoise2D>;
  private islandNoise: ReturnType<typeof createNoise2D>;

  private readonly END_HEIGHT = 64; // Main island height

  constructor(seed: number = 999) {
    this.noise2D = createNoise2D(createPRNG(seed));
    this.islandNoise = createNoise2D(createPRNG(seed + 2));
  }

  private fbm2D(x: number, z: number, octaves: number, persistence: number, scale: number): number {
    let value = 0;
    let amplitude = 1;
    let frequency = scale;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      value += this.noise2D(x * frequency, z * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= 2;
    }

    return value / maxValue;
  }

  private getIslandDensity(worldX: number, worldZ: number): number {
    // Central main island
    const distFromCenter = Math.sqrt(worldX * worldX + worldZ * worldZ);

    // Main island (within ~150 blocks of center)
    if (distFromCenter < 150) {
      const mainIsland = 1 - (distFromCenter / 150);
      const noise = this.fbm2D(worldX, worldZ, 3, 0.5, 0.02);
      return Math.max(0, mainIsland + noise * 0.3);
    }

    // Outer islands (floating islands in the void)
    const outerNoise = this.islandNoise(worldX * 0.008, worldZ * 0.008);
    const detailNoise = this.fbm2D(worldX, worldZ, 4, 0.5, 0.03);

    // Create island clusters
    if (outerNoise > 0.4) {
      return (outerNoise - 0.4) * 1.5 + detailNoise * 0.2;
    }

    return 0;
  }

  generateChunk(chunk: Chunk): void {
    const worldOffsetX = chunk.chunkX * CHUNK_SIZE;
    const worldOffsetZ = chunk.chunkZ * CHUNK_SIZE;

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const worldX = worldOffsetX + x;
        const worldZ = worldOffsetZ + z;

        const islandDensity = this.getIslandDensity(worldX, worldZ);

        if (islandDensity <= 0) continue; // Void

        // Calculate surface height
        const baseHeight = this.END_HEIGHT + islandDensity * 30;
        const heightVariation = this.fbm2D(worldX, worldZ, 4, 0.5, 0.05) * 10;
        const surfaceHeight = Math.floor(baseHeight + heightVariation);

        // Island thickness
        const thickness = Math.floor(10 + islandDensity * 15);
        const bottomY = Math.max(1, surfaceHeight - thickness);

        for (let y = bottomY; y <= surfaceHeight && y < CHUNK_HEIGHT; y++) {
          let blockType = BlockType.END_STONE;

          // Surface layer variations
          if (y === surfaceHeight) {
            // Small chance for chorus plants
            const chorusNoise = this.noise2D(worldX * 0.3, worldZ * 0.3);
            if (chorusNoise > 0.7 && islandDensity > 0.3) {
              // Place chorus flower on top
              if (y + 1 < CHUNK_HEIGHT) {
                chunk.setBlock(x, y + 1, z, BlockType.CHORUS_PLANT);
                // Sometimes add flower on top
                if (this.noise2D(worldX * 0.5, worldZ * 0.5) > 0.8 && y + 2 < CHUNK_HEIGHT) {
                  chunk.setBlock(x, y + 2, z, BlockType.CHORUS_FLOWER);
                }
              }
            }
          }

          chunk.setBlock(x, y, z, blockType);
        }
      }
    }

    // Generate End city remnants on outer islands
    const distFromCenter = Math.sqrt(
      Math.pow(worldOffsetX + CHUNK_SIZE / 2, 2) +
      Math.pow(worldOffsetZ + CHUNK_SIZE / 2, 2)
    );

    if (distFromCenter > 200) {
      const cityNoise = this.noise2D(chunk.chunkX * 0.15, chunk.chunkZ * 0.15);
      if (cityNoise > 0.75) {
        this.generateEndCityRemnant(chunk, worldOffsetX, worldOffsetZ);
      }
    }

    // Generate the obsidian towers on the main island
    if (Math.abs(worldOffsetX) < 100 && Math.abs(worldOffsetZ) < 100) {
      this.generateObsidianTowers(chunk, worldOffsetX, worldOffsetZ);
    }

    // Generate dragon platform at center
    if (chunk.chunkX === 0 && chunk.chunkZ === 0) {
      this.generateDragonPlatform(chunk);
    }

    chunk.isGenerated = true;
    chunk.needsRebuild = true;
  }

  private generateObsidianTowers(chunk: Chunk, worldX: number, worldZ: number): void {
    // Fixed tower positions around the center
    const towerPositions = [
      { x: 42, z: 0, height: 76 },
      { x: -42, z: 0, height: 79 },
      { x: 0, z: 42, height: 82 },
      { x: 0, z: -42, height: 73 },
      { x: 30, z: 30, height: 70 },
      { x: -30, z: 30, height: 85 },
      { x: 30, z: -30, height: 77 },
      { x: -30, z: -30, height: 80 },
      { x: 21, z: 0, height: 68 },
      { x: -21, z: 0, height: 71 },
    ];

    for (const tower of towerPositions) {
      const localX = tower.x - worldX;
      const localZ = tower.z - worldZ;

      // Check if tower is in this chunk
      if (localX >= -3 && localX < CHUNK_SIZE + 3 && localZ >= -3 && localZ < CHUNK_SIZE + 3) {
        this.generateTower(chunk, localX, localZ, tower.height);
      }
    }
  }

  private generateTower(chunk: Chunk, centerX: number, centerZ: number, height: number): void {
    const radius = 3;

    for (let y = 60; y < height + 4; y++) {
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const x = centerX + dx;
          const z = centerZ + dz;

          if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) continue;
          if (y >= CHUNK_HEIGHT) continue;

          const dist = Math.sqrt(dx * dx + dz * dz);

          if (dist <= radius) {
            if (y < height) {
              chunk.setBlock(x, y, z, BlockType.OBSIDIAN);
            } else if (y === height && dist < radius - 0.5) {
              // Top platform
              chunk.setBlock(x, y, z, BlockType.OBSIDIAN);
            }
          }
        }
      }
    }

    // End crystal pedestal on top (using bedrock as placeholder)
    if (centerX >= 0 && centerX < CHUNK_SIZE && centerZ >= 0 && centerZ < CHUNK_SIZE) {
      if (height + 1 < CHUNK_HEIGHT) {
        chunk.setBlock(centerX, height + 1, centerZ, BlockType.BEDROCK);
      }
    }
  }

  private generateDragonPlatform(chunk: Chunk): void {
    // Central bedrock platform where the dragon spawns
    const centerX = CHUNK_SIZE / 2;
    const centerZ = CHUNK_SIZE / 2;
    const platformY = 64;

    // Bedrock base
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        const x = centerX + dx;
        const z = centerZ + dz;
        if (x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE) {
          chunk.setBlock(x, platformY, z, BlockType.BEDROCK);
        }
      }
    }

    // End portal frame
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const x = centerX + dx;
        const z = centerZ + dz;
        if (x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE) {
          if (Math.abs(dx) === 1 || Math.abs(dz) === 1) {
            chunk.setBlock(x, platformY + 1, z, BlockType.END_STONE_BRICKS);
          }
        }
      }
    }

    // Dragon egg (spawns after dragon defeat, but we'll show it)
    chunk.setBlock(centerX, platformY + 4, centerZ, BlockType.DRAGON_EGG);
  }

  private generateEndCityRemnant(chunk: Chunk, worldX: number, worldZ: number): void {
    // Simple purpur tower structure
    const centerX = 8;
    const centerZ = 8;

    // Find surface height at this position
    const islandDensity = this.getIslandDensity(worldX + centerX, worldZ + centerZ);
    if (islandDensity <= 0) return;

    const baseHeight = Math.floor(this.END_HEIGHT + islandDensity * 30);
    const towerHeight = 15 + Math.floor(this.noise2D(worldX, worldZ) * 10);

    // Tower base
    for (let y = baseHeight; y < baseHeight + towerHeight && y < CHUNK_HEIGHT; y++) {
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          const x = centerX + dx;
          const z = centerZ + dz;

          if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) continue;

          const isEdge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
          const isCorner = Math.abs(dx) === 2 && Math.abs(dz) === 2;

          if (isCorner) continue; // No corners for rounded look

          if (isEdge) {
            chunk.setBlock(x, y, z, BlockType.PURPUR_BLOCK);
          } else if (y === baseHeight || y === baseHeight + towerHeight - 1) {
            chunk.setBlock(x, y, z, BlockType.PURPUR_BLOCK);
          } else {
            chunk.setBlock(x, y, z, BlockType.AIR); // Hollow inside
          }
        }
      }
    }

    // End rod lights (using glowstone as substitute)
    const rodY = baseHeight + towerHeight;
    if (rodY < CHUNK_HEIGHT) {
      chunk.setBlock(centerX, rodY, centerZ, BlockType.GLOWSTONE);
    }
  }
}
