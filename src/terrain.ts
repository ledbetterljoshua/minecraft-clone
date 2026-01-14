import { createNoise2D, createNoise3D } from 'simplex-noise';
import { BlockType } from './blocks';
import { Chunk, CHUNK_SIZE, CHUNK_HEIGHT } from './chunk';

// Simple seeded PRNG (mulberry32)
function createPRNG(seed: number): () => number {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

export class TerrainGenerator {
  private noise2D: ReturnType<typeof createNoise2D>;
  private noise3D: ReturnType<typeof createNoise3D>;
  private caveNoise: ReturnType<typeof createNoise3D>;
  private caveNoise2: ReturnType<typeof createNoise3D>;
  private ravinNoise: ReturnType<typeof createNoise3D>;
  private treeNoise: ReturnType<typeof createNoise2D>;

  private readonly SEA_LEVEL = 40;
  private readonly BASE_HEIGHT = 45;

  constructor(seed: string = 'minecraft') {
    const seedNum = hashString(seed);
    this.noise2D = createNoise2D(createPRNG(seedNum));
    this.noise3D = createNoise3D(createPRNG(seedNum + 1));
    this.caveNoise = createNoise3D(createPRNG(seedNum + 2));
    this.caveNoise2 = createNoise3D(createPRNG(seedNum + 4));
    this.ravinNoise = createNoise3D(createPRNG(seedNum + 5));
    this.treeNoise = createNoise2D(createPRNG(seedNum + 3));
  }

  // Multi-octave noise for terrain
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

  private getTerrainHeight(worldX: number, worldZ: number): number {
    // Large scale terrain features
    const continentalness = this.fbm2D(worldX, worldZ, 4, 0.5, 0.001);

    // Medium scale hills
    const hills = this.fbm2D(worldX + 1000, worldZ + 1000, 4, 0.5, 0.008);

    // Small scale variation
    const detail = this.fbm2D(worldX + 2000, worldZ + 2000, 3, 0.5, 0.03);

    // Combine different scales
    const height = this.BASE_HEIGHT +
      continentalness * 30 +  // Large features
      hills * 15 +            // Hills
      detail * 5;             // Detail

    return Math.floor(height);
  }

  // Get terracotta layer for mesa biome - creates striped layers
  private getMesaTerracottaLayer(y: number): BlockType {
    const layerPattern = [
      BlockType.TERRACOTTA,
      BlockType.TERRACOTTA,
      BlockType.ORANGE_TERRACOTTA,
      BlockType.TERRACOTTA,
      BlockType.YELLOW_TERRACOTTA,
      BlockType.TERRACOTTA,
      BlockType.RED_TERRACOTTA,
      BlockType.TERRACOTTA,
      BlockType.BROWN_TERRACOTTA,
      BlockType.TERRACOTTA,
      BlockType.WHITE_TERRACOTTA,
      BlockType.TERRACOTTA,
      BlockType.ORANGE_TERRACOTTA,
      BlockType.YELLOW_TERRACOTTA,
    ];
    return layerPattern[y % layerPattern.length];
  }

  private getBiome(worldX: number, worldZ: number): 'plains' | 'desert' | 'mountains' | 'forest' | 'mesa' | 'ocean' {
    const temperature = this.fbm2D(worldX + 5000, worldZ + 5000, 2, 0.5, 0.0015);
    const moisture = this.fbm2D(worldX + 6000, worldZ + 6000, 2, 0.5, 0.0015);
    const continentalness = this.fbm2D(worldX + 7000, worldZ + 7000, 2, 0.5, 0.001);

    // Ocean biome for low continentalness
    if (continentalness < -0.3) return 'ocean';

    // Mesa/badlands - hot and very dry
    if (temperature > 0.4 && moisture < -0.2) return 'mesa';

    if (temperature > 0.3 && moisture < 0) return 'desert';
    if (this.fbm2D(worldX, worldZ, 2, 0.5, 0.002) > 0.4) return 'mountains';
    if (moisture > 0.2) return 'forest';
    return 'plains';
  }

  generateChunk(chunk: Chunk): void {
    const worldOffsetX = chunk.chunkX * CHUNK_SIZE;
    const worldOffsetZ = chunk.chunkZ * CHUNK_SIZE;

    // First pass: terrain
    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const worldX = worldOffsetX + x;
        const worldZ = worldOffsetZ + z;

        const height = this.getTerrainHeight(worldX, worldZ);
        const biome = this.getBiome(worldX, worldZ);

        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          let blockType = BlockType.AIR;

          if (y === 0) {
            blockType = BlockType.BEDROCK;
          } else if (y < height - 4) {
            blockType = BlockType.STONE;

            // Enhanced ore generation with multiple layers and frequencies
            if (y > 3) {
              // Coal ore (abundant, all levels)
              const coalNoise = this.noise3D(worldX * 0.15, y * 0.15, worldZ * 0.15);
              if (coalNoise > 0.65 && y < 80) {
                blockType = BlockType.COAL_ORE;
              }

              // Iron ore (common in lower levels)
              const ironNoise = this.noise3D(worldX * 0.12 + 100, y * 0.12, worldZ * 0.12 + 100);
              if (ironNoise > 0.7 && y < 64) {
                blockType = BlockType.IRON_ORE;
              }

              // Gold ore (rare, deep only)
              const goldNoise = this.noise3D(worldX * 0.1 + 200, y * 0.1, worldZ * 0.1 + 200);
              if (goldNoise > 0.75 && y < 32) {
                blockType = BlockType.GOLD_ORE;
              }

              // Diamond ore (very rare, very deep)
              const diamondNoise = this.noise3D(worldX * 0.08 + 300, y * 0.08, worldZ * 0.08 + 300);
              if (diamondNoise > 0.8 && y < 16) {
                blockType = BlockType.DIAMOND_ORE;
              }
            }
          } else if (y < height) {
            // Underground layers based on biome
            if (biome === 'desert') {
              blockType = BlockType.SAND;
            } else if (biome === 'mesa') {
              blockType = this.getMesaTerracottaLayer(y);
            } else if (biome === 'ocean') {
              // Ocean floor - gravel and clay
              blockType = y < height - 2 ? BlockType.STONE : BlockType.GRAVEL;
            } else {
              blockType = BlockType.DIRT;
            }
          } else if (y === height) {
            // Surface block
            if (biome === 'desert') {
              blockType = BlockType.SAND;
            } else if (biome === 'mesa') {
              blockType = BlockType.RED_SAND;
            } else if (biome === 'ocean') {
              // Ocean floor surface
              blockType = Math.random() < 0.3 ? BlockType.CLAY : BlockType.GRAVEL;
            } else if (height > 70) {
              blockType = BlockType.SNOW;
            } else {
              blockType = BlockType.GRASS;
            }
          } else if (y <= this.SEA_LEVEL && y > height) {
            blockType = BlockType.WATER;
          }

          // Enhanced cave generation with multiple layers
          if (y > 1 && y < height - 2 && blockType !== BlockType.BEDROCK) {
            // Main cave system - spaghetti caves
            const caveValue = this.caveNoise(worldX * 0.03, y * 0.05, worldZ * 0.03);
            const caveValue2 = this.caveNoise2(worldX * 0.05, y * 0.03, worldZ * 0.05);

            // Deep tunnels - larger, longer tunnels at depth
            const deepTunnel = this.caveNoise(worldX * 0.015 + 500, y * 0.02, worldZ * 0.015 + 500);
            const deepTunnel2 = this.caveNoise2(worldX * 0.02 + 500, y * 0.015, worldZ * 0.02 + 500);

            // Cavern rooms - large open spaces deep underground
            const cavernNoise = this.caveNoise(worldX * 0.008, y * 0.02, worldZ * 0.008);
            const cavernRoom = y < 40 && cavernNoise > 0.6;

            // Ravines - vertical cuts
            const ravineNoise = this.ravinNoise(worldX * 0.02, y * 0.1, worldZ * 0.02);
            const ravineNoise2 = this.ravinNoise(worldX * 0.03, 0, worldZ * 0.03);
            const ravine = Math.abs(ravineNoise) < 0.08 && ravineNoise2 > 0.5 && y < 50;

            // Combine cave systems
            const isMainCave = caveValue > 0.5 && caveValue2 > 0.4;
            const isDeepTunnel = y < 45 && deepTunnel > 0.55 && deepTunnel2 > 0.35;
            const isCave = isMainCave || isDeepTunnel || cavernRoom || ravine;

            if (isCave) {
              blockType = BlockType.AIR;
            }
          }

          chunk.setBlock(x, y, z, blockType);
        }
      }
    }

    // Second pass: trees (only on solid ground above sea level)
    for (let x = 2; x < CHUNK_SIZE - 2; x++) {
      for (let z = 2; z < CHUNK_SIZE - 2; z++) {
        const worldX = worldOffsetX + x;
        const worldZ = worldOffsetZ + z;

        const biome = this.getBiome(worldX, worldZ);
        if (biome === 'desert') continue;

        const treeChance = biome === 'forest' ? 0.03 : 0.01;
        const treeValue = (this.treeNoise(worldX * 0.5, worldZ * 0.5) + 1) / 2;

        if (treeValue < treeChance) {
          // Find ground level
          let groundY = -1;
          for (let y = CHUNK_HEIGHT - 1; y > this.SEA_LEVEL; y--) {
            const block = chunk.getBlock(x, y, z);
            if (block === BlockType.GRASS || block === BlockType.DIRT) {
              groundY = y;
              break;
            }
          }

          if (groundY > 0) {
            this.generateTree(chunk, x, groundY + 1, z);
          }
        }
      }
    }

    chunk.isGenerated = true;
    chunk.needsRebuild = true;
  }

  private generateTree(chunk: Chunk, x: number, y: number, z: number): void {
    const trunkHeight = 4 + Math.floor(Math.random() * 3);

    // Trunk
    for (let ty = 0; ty < trunkHeight; ty++) {
      if (y + ty < CHUNK_HEIGHT) {
        chunk.setBlock(x, y + ty, z, BlockType.WOOD);
      }
    }

    // Leaves (simple sphere-ish shape)
    const leavesStart = y + trunkHeight - 2;
    const leavesRadius = 2;

    for (let lx = -leavesRadius; lx <= leavesRadius; lx++) {
      for (let lz = -leavesRadius; lz <= leavesRadius; lz++) {
        for (let ly = 0; ly <= leavesRadius + 1; ly++) {
          const dist = Math.sqrt(lx * lx + lz * lz + (ly - 1) * (ly - 1));
          if (dist <= leavesRadius + 0.5) {
            const nx = x + lx;
            const ny = leavesStart + ly;
            const nz = z + lz;

            if (nx >= 0 && nx < CHUNK_SIZE && ny < CHUNK_HEIGHT && nz >= 0 && nz < CHUNK_SIZE) {
              if (chunk.getBlock(nx, ny, nz) === BlockType.AIR) {
                chunk.setBlock(nx, ny, nz, BlockType.LEAVES);
              }
            }
          }
        }
      }
    }
  }
}
