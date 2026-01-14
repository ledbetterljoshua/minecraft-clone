import { createNoise2D, createNoise3D } from 'simplex-noise';
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

export class NetherGenerator {
  private noise2D: ReturnType<typeof createNoise2D>;
  private noise3D: ReturnType<typeof createNoise3D>;
  private biomeNoise: ReturnType<typeof createNoise2D>;

  private readonly NETHER_CEILING = 127;
  private readonly LAVA_LEVEL = 31;

  constructor(seed: number = 666) {
    this.noise2D = createNoise2D(createPRNG(seed));
    this.noise3D = createNoise3D(createPRNG(seed + 1));
    this.biomeNoise = createNoise2D(createPRNG(seed + 2));
  }

  private fbm3D(x: number, y: number, z: number, octaves: number, persistence: number, scale: number): number {
    let value = 0;
    let amplitude = 1;
    let frequency = scale;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      value += this.noise3D(x * frequency, y * frequency, z * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= 2;
    }

    return value / maxValue;
  }

  private getBiome(worldX: number, worldZ: number): 'wastes' | 'crimson' | 'warped' | 'basalt' | 'soul_valley' {
    const biome1 = this.biomeNoise(worldX * 0.005, worldZ * 0.005);
    const biome2 = this.biomeNoise(worldX * 0.008 + 100, worldZ * 0.008 + 100);

    if (biome1 > 0.3 && biome2 > 0) return 'crimson';
    if (biome1 > 0.3 && biome2 <= 0) return 'warped';
    if (biome1 < -0.3 && biome2 > 0.2) return 'basalt';
    if (biome1 < -0.3 && biome2 <= 0.2) return 'soul_valley';
    return 'wastes';
  }

  generateChunk(chunk: Chunk): void {
    const worldOffsetX = chunk.chunkX * CHUNK_SIZE;
    const worldOffsetZ = chunk.chunkZ * CHUNK_SIZE;

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const worldX = worldOffsetX + x;
        const worldZ = worldOffsetZ + z;
        const biome = this.getBiome(worldX, worldZ);

        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          let blockType = BlockType.AIR;

          // Bedrock floor and ceiling
          if (y === 0 || y === this.NETHER_CEILING) {
            blockType = BlockType.BEDROCK;
          }
          // Near bedrock (irregular)
          else if (y <= 4) {
            const bedrockNoise = this.noise3D(worldX * 0.3, y * 0.5, worldZ * 0.3);
            if (bedrockNoise > (y - 1) * 0.25) {
              blockType = BlockType.BEDROCK;
            } else {
              blockType = BlockType.NETHERRACK;
            }
          }
          else if (y >= this.NETHER_CEILING - 4) {
            const bedrockNoise = this.noise3D(worldX * 0.3, y * 0.5, worldZ * 0.3);
            if (bedrockNoise > (this.NETHER_CEILING - y - 1) * 0.25) {
              blockType = BlockType.BEDROCK;
            } else {
              blockType = BlockType.NETHERRACK;
            }
          }
          // Main terrain generation
          else {
            // Generate cave-like terrain using 3D noise
            const density = this.fbm3D(worldX, y, worldZ, 4, 0.5, 0.02);

            // Vertical gradient - more solid near floor and ceiling
            const heightGradient = Math.abs((y - 64) / 64);
            const threshold = 0.1 + heightGradient * 0.3;

            if (density > threshold) {
              // Solid block
              if (biome === 'basalt') {
                blockType = BlockType.BASALT;
              } else if (biome === 'soul_valley' && y < 40) {
                blockType = BlockType.SOUL_SAND;
              } else if (biome === 'crimson' || biome === 'warped') {
                blockType = BlockType.NETHERRACK;
              } else {
                blockType = BlockType.NETHERRACK;
              }

              // Ore generation
              if (blockType === BlockType.NETHERRACK) {
                // Nether Quartz
                const quartzNoise = this.noise3D(worldX * 0.1 + 500, y * 0.1, worldZ * 0.1 + 500);
                if (quartzNoise > 0.7) {
                  blockType = BlockType.NETHER_QUARTZ_ORE;
                }

                // Gold ore (ancient debris replacement)
                const goldNoise = this.noise3D(worldX * 0.08 + 1000, y * 0.08, worldZ * 0.08 + 1000);
                if (goldNoise > 0.85 && y < 30) {
                  blockType = BlockType.GOLD_ORE;
                }
              }
            } else if (y <= this.LAVA_LEVEL) {
              // Lava ocean (using water block visually for now, could be separate)
              blockType = BlockType.MAGMA; // Using magma as lava stand-in
            }
          }

          // Biome surface decorations
          if (blockType === BlockType.NETHERRACK || blockType === BlockType.BASALT) {
            // Check if this is a surface block
            const aboveBlock = this.isSolid(worldX, y + 1, worldZ);
            const isSurface = !aboveBlock;

            if (isSurface && y > this.LAVA_LEVEL + 5) {
              if (biome === 'crimson') {
                blockType = BlockType.CRIMSON_NYLIUM;
              } else if (biome === 'warped') {
                blockType = BlockType.WARPED_NYLIUM;
              }
            }
          }

          // Glowstone clusters in ceiling
          if (y >= 100 && y < 120) {
            const glowNoise = this.noise3D(worldX * 0.15, y * 0.15, worldZ * 0.15);
            if (glowNoise > 0.65 && blockType === BlockType.NETHERRACK) {
              blockType = BlockType.GLOWSTONE;
            }
          }

          chunk.setBlock(x, y, z, blockType);
        }
      }
    }

    // Second pass: Nether fortress remnants (occasional)
    const fortressChance = this.noise2D(chunk.chunkX * 0.1, chunk.chunkZ * 0.1);
    if (fortressChance > 0.8) {
      this.generateFortressSection(chunk, worldOffsetX, worldOffsetZ);
    }

    chunk.isGenerated = true;
    chunk.needsRebuild = true;
  }

  private isSolid(worldX: number, y: number, worldZ: number): boolean {
    const density = this.fbm3D(worldX, y, worldZ, 4, 0.5, 0.02);
    const heightGradient = Math.abs((y - 64) / 64);
    const threshold = 0.1 + heightGradient * 0.3;
    return density > threshold;
  }

  private generateFortressSection(chunk: Chunk, worldX: number, worldZ: number): void {
    // Simple nether brick platform/corridor
    const centerX = 8;
    const centerZ = 8;
    const y = 45 + Math.floor(this.noise2D(worldX, worldZ) * 10);

    // Platform
    for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
        if (centerX + dx >= 0 && centerX + dx < CHUNK_SIZE &&
            centerZ + dz >= 0 && centerZ + dz < CHUNK_SIZE) {
          chunk.setBlock(centerX + dx, y, centerZ + dz, BlockType.NETHER_BRICK);
          // Clear space above
          for (let dy = 1; dy <= 4; dy++) {
            chunk.setBlock(centerX + dx, y + dy, centerZ + dz, BlockType.AIR);
          }
        }
      }
    }

    // Walls
    for (let dy = 1; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        if (centerX + dx >= 0 && centerX + dx < CHUNK_SIZE) {
          chunk.setBlock(centerX + dx, y + dy, centerZ - 3, BlockType.NETHER_BRICK);
          chunk.setBlock(centerX + dx, y + dy, centerZ + 3, BlockType.NETHER_BRICK);
        }
      }
      for (let dz = -3; dz <= 3; dz++) {
        if (centerZ + dz >= 0 && centerZ + dz < CHUNK_SIZE) {
          chunk.setBlock(centerX - 3, y + dy, centerZ + dz, BlockType.NETHER_BRICK);
          chunk.setBlock(centerX + 3, y + dy, centerZ + dz, BlockType.NETHER_BRICK);
        }
      }
    }
  }
}
