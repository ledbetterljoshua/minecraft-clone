import { World } from './world';
import { BlockType } from './blocks';
import { Chunk, CHUNK_SIZE } from './chunk';

// Simple seeded random for deterministic structure placement
function seededRandom(seed: number): () => number {
  return function() {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

export interface LootItem {
  type: string;
  count: number;
}

export interface LootChest {
  x: number;
  y: number;
  z: number;
  items: LootItem[];
}

export interface VillageLocation {
  x: number;
  z: number;
  buildingPositions: Array<{ x: number; z: number; type: string }>;
}

export class StructureGenerator {
  private world: World;
  private generatedStructures: Set<string> = new Set();
  public lootChests: LootChest[] = [];
  public villageLocations: VillageLocation[] = [];

  private spawnVillageGenerated = false;

  constructor(world: World) {
    this.world = world;
  }

  // Generate a village at spawn point (0, 0) - ALWAYS generates
  generateSpawnVillage(): void {
    if (this.spawnVillageGenerated) return;
    this.spawnVillageGenerated = true;

    // Force generate village at spawn - skip terrain checks
    this.forceGenerateVillage(0, 0);
  }

  // Force a village to generate at exact location (no terrain checks)
  private forceGenerateVillage(centerX: number, centerZ: number): void {
    // Find ground level at center
    let groundY = 64; // Default height
    for (let ty = 80; ty > 30; ty--) {
      const block = this.world.getBlock(centerX, ty, centerZ);
      if (block !== BlockType.AIR && block !== BlockType.WATER) {
        groundY = ty;
        break;
      }
    }

    // Create village record
    const village: VillageLocation = {
      x: centerX,
      z: centerZ,
      buildingPositions: []
    };

    // Flatten the area first and make it grass
    for (let dx = -25; dx <= 25; dx++) {
      for (let dz = -25; dz <= 25; dz++) {
        // Set ground level
        this.world.setBlock(centerX + dx, groundY, centerZ + dz, BlockType.GRASS);
        this.world.setBlock(centerX + dx, groundY - 1, centerZ + dz, BlockType.DIRT);
        this.world.setBlock(centerX + dx, groundY - 2, centerZ + dz, BlockType.DIRT);
        // Clear above
        for (let dy = 1; dy <= 15; dy++) {
          this.world.setBlock(centerX + dx, groundY + dy, centerZ + dz, BlockType.AIR);
        }
      }
    }

    // Generate village well in center
    this.generateVillageWell(centerX, groundY, centerZ);

    // Generate 4 houses around the well
    this.generateVillageHouse(centerX + 8, groundY, centerZ);
    village.buildingPositions.push({ x: centerX + 8, z: centerZ, type: 'house' });

    this.generateVillageHouse(centerX - 8, groundY, centerZ);
    village.buildingPositions.push({ x: centerX - 8, z: centerZ, type: 'house' });

    this.generateVillageHouse(centerX, groundY, centerZ + 8);
    village.buildingPositions.push({ x: centerX, z: centerZ + 8, type: 'house' });

    this.generateVillageHouse(centerX, groundY, centerZ - 8);
    village.buildingPositions.push({ x: centerX, z: centerZ - 8, type: 'house' });

    // Add a blacksmith
    this.generateVillageBlacksmith(centerX + 12, groundY, centerZ + 12);
    village.buildingPositions.push({ x: centerX + 12, z: centerZ + 12, type: 'blacksmith' });

    // Add a church
    this.generateVillageChurch(centerX - 12, groundY, centerZ - 12);
    village.buildingPositions.push({ x: centerX - 12, z: centerZ - 12, type: 'church' });

    // Add farms
    this.generateVillageFarm(centerX + 15, groundY, centerZ - 8);
    village.buildingPositions.push({ x: centerX + 15, z: centerZ - 8, type: 'farm' });

    this.generateVillageFarm(centerX - 15, groundY, centerZ + 8);
    village.buildingPositions.push({ x: centerX - 15, z: centerZ + 8, type: 'farm' });

    // Generate paths connecting buildings
    // Path from well to each building
    for (let i = 1; i <= 20; i++) {
      this.world.setBlock(centerX + i, groundY, centerZ, BlockType.COBBLESTONE);
      this.world.setBlock(centerX - i, groundY, centerZ, BlockType.COBBLESTONE);
      this.world.setBlock(centerX, groundY, centerZ + i, BlockType.COBBLESTONE);
      this.world.setBlock(centerX, groundY, centerZ - i, BlockType.COBBLESTONE);
    }

    // Diagonal paths
    for (let i = 1; i <= 15; i++) {
      this.world.setBlock(centerX + i, groundY, centerZ + i, BlockType.COBBLESTONE);
      this.world.setBlock(centerX - i, groundY, centerZ - i, BlockType.COBBLESTONE);
    }

    this.villageLocations.push(village);
  }

  // Check if a structure should generate at this chunk
  private shouldGenerateStructure(chunkX: number, chunkZ: number, frequency: number, seed: number): boolean {
    const rand = seededRandom(chunkX * 73856093 + chunkZ * 19349663 + seed);
    return rand() < frequency;
  }

  // Generate structures for a chunk
  generateStructures(chunk: Chunk): void {
    const key = `${chunk.chunkX},${chunk.chunkZ}`;
    if (this.generatedStructures.has(key)) return;
    this.generatedStructures.add(key);

    const worldX = chunk.chunkX * CHUNK_SIZE;
    const worldZ = chunk.chunkZ * CHUNK_SIZE;

    // Desert temple (rare, in desert-ish areas)
    if (this.shouldGenerateStructure(chunk.chunkX, chunk.chunkZ, 0.02, 12345)) {
      this.tryGenerateDesertTemple(worldX + 8, worldZ + 8);
    }

    // Underwater shipwreck
    if (this.shouldGenerateStructure(chunk.chunkX, chunk.chunkZ, 0.03, 54321)) {
      this.tryGenerateShipwreck(worldX + 8, worldZ + 8);
    }

    // Ruined portal
    if (this.shouldGenerateStructure(chunk.chunkX, chunk.chunkZ, 0.01, 99999)) {
      this.tryGenerateRuinedPortal(worldX + 8, worldZ + 8);
    }

    // Small dungeon entrance
    if (this.shouldGenerateStructure(chunk.chunkX, chunk.chunkZ, 0.025, 77777)) {
      this.tryGenerateDungeon(worldX + 8, worldZ + 8);
    }

    // Villages - spawn on grass plains, rare
    if (this.shouldGenerateStructure(chunk.chunkX, chunk.chunkZ, 0.008, 55555)) {
      this.tryGenerateVillage(worldX, worldZ);
    }
  }

  private tryGenerateDesertTemple(x: number, z: number): void {
    // Find ground level
    let y = -1;
    for (let ty = 80; ty > 20; ty--) {
      const block = this.world.getBlock(x, ty, z);
      if (block === BlockType.SAND) {
        y = ty;
        break;
      }
    }

    if (y < 0) return;

    // Build temple structure
    const sandstone = BlockType.TERRACOTTA; // Using terracotta as sandstone
    const orange = BlockType.ORANGE_TERRACOTTA;

    // Base platform
    for (let dx = -4; dx <= 4; dx++) {
      for (let dz = -4; dz <= 4; dz++) {
        this.world.setBlock(x + dx, y, z + dz, sandstone);
        this.world.setBlock(x + dx, y + 1, z + dz, sandstone);
      }
    }

    // Walls
    for (let dy = 2; dy <= 6; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        this.world.setBlock(x + dx, y + dy, z - 4, sandstone);
        this.world.setBlock(x + dx, y + dy, z + 4, sandstone);
      }
      for (let dz = -4; dz <= 4; dz++) {
        this.world.setBlock(x - 4, y + dy, z + dz, sandstone);
        this.world.setBlock(x + 4, y + dy, z + dz, sandstone);
      }
    }

    // Door opening
    for (let dy = 2; dy <= 4; dy++) {
      this.world.setBlock(x, y + dy, z - 4, BlockType.AIR);
      this.world.setBlock(x - 1, y + dy, z - 4, BlockType.AIR);
      this.world.setBlock(x + 1, y + dy, z - 4, BlockType.AIR);
    }

    // Roof (flat with raised center)
    for (let dx = -4; dx <= 4; dx++) {
      for (let dz = -4; dz <= 4; dz++) {
        this.world.setBlock(x + dx, y + 7, z + dz, sandstone);
      }
    }

    // Central pyramid top
    for (let level = 0; level < 3; level++) {
      const size = 2 - level;
      for (let dx = -size; dx <= size; dx++) {
        for (let dz = -size; dz <= size; dz++) {
          this.world.setBlock(x + dx, y + 8 + level, z + dz, orange);
        }
      }
    }

    // Clear interior
    for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
        for (let dy = 2; dy <= 6; dy++) {
          this.world.setBlock(x + dx, y + dy, z + dz, BlockType.AIR);
        }
      }
    }

    // Underground treasure room
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let dy = -5; dy <= -1; dy++) {
          this.world.setBlock(x + dx, y + dy, z + dz, BlockType.AIR);
        }
      }
    }

    // Treasure chest location (marked with gold ore for now)
    this.world.setBlock(x, y - 4, z, BlockType.GOLD_ORE);

    // Add loot
    this.lootChests.push({
      x, y: y - 4, z,
      items: [
        { type: 'diamond', count: 3 },
        { type: 'gold_ingot', count: 8 },
        { type: 'iron_ingot', count: 12 },
        { type: 'emerald', count: 5 },
      ]
    });

    // Pressure plate trap (TNT underneath - just visual)
    this.world.setBlock(x, y - 3, z, BlockType.STONE);
  }

  private tryGenerateShipwreck(x: number, z: number): void {
    // Find water
    let waterSurface = -1;
    let oceanFloor = -1;

    for (let ty = 60; ty > 10; ty--) {
      const block = this.world.getBlock(x, ty, z);
      if (block === BlockType.WATER && waterSurface < 0) {
        waterSurface = ty;
      }
      if (waterSurface > 0 && block !== BlockType.WATER && block !== BlockType.AIR) {
        oceanFloor = ty;
        break;
      }
    }

    if (oceanFloor < 0 || waterSurface < 0) return;
    if (waterSurface - oceanFloor < 5) return; // Not deep enough

    const y = oceanFloor;

    // Ship hull
    const wood = BlockType.WOOD;
    const planks = BlockType.PLANKS;

    // Tilted shipwreck
    const tilt = 0.3;

    // Hull base
    for (let dz = -6; dz <= 6; dz++) {
      const width = Math.max(1, 3 - Math.abs(dz) / 3);
      const heightOffset = Math.floor(Math.abs(dz) * tilt);

      for (let dx = -width; dx <= width; dx++) {
        // Bottom of hull
        this.world.setBlock(x + dx, y + 1 + heightOffset, z + dz, wood);
        // Sides
        if (Math.abs(dx) === Math.floor(width)) {
          this.world.setBlock(x + dx, y + 2 + heightOffset, z + dz, planks);
          this.world.setBlock(x + dx, y + 3 + heightOffset, z + dz, planks);
        }
      }
    }

    // Mast (partially broken)
    for (let dy = 1; dy <= 5; dy++) {
      this.world.setBlock(x, y + dy + 2, z, wood);
    }

    // Crow's nest platform
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        this.world.setBlock(x + dx, y + 8, z + dz, planks);
      }
    }

    // Treasure chest (gold ore marker)
    this.world.setBlock(x, y + 2, z - 3, BlockType.GOLD_ORE);

    // Add loot
    this.lootChests.push({
      x, y: y + 2, z: z - 3,
      items: [
        { type: 'gold_ingot', count: 5 },
        { type: 'iron_ingot', count: 8 },
        { type: 'diamond', count: 1 },
        { type: 'emerald', count: 3 },
        { type: 'trident', count: 1 },
      ]
    });
  }

  private tryGenerateRuinedPortal(x: number, z: number): void {
    // Find ground level
    let y = -1;
    for (let ty = 80; ty > 20; ty--) {
      const block = this.world.getBlock(x, ty, z);
      if (block !== BlockType.AIR && block !== BlockType.WATER) {
        y = ty;
        break;
      }
    }

    if (y < 0) return;

    // Obsidian-like portal frame (using bedrock as obsidian stand-in)
    const obsidian = BlockType.BEDROCK;
    const netherBlock = BlockType.BRICK; // Red brick as netherrack stand-in

    // Ground netherrack scatter
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        if (Math.random() < 0.4) {
          this.world.setBlock(x + dx, y, z + dz, netherBlock);
        }
      }
    }

    // Incomplete portal frame
    // Left pillar
    this.world.setBlock(x - 2, y + 1, z, obsidian);
    this.world.setBlock(x - 2, y + 2, z, obsidian);
    this.world.setBlock(x - 2, y + 3, z, obsidian);
    this.world.setBlock(x - 2, y + 4, z, obsidian);

    // Right pillar (incomplete)
    this.world.setBlock(x + 2, y + 1, z, obsidian);
    this.world.setBlock(x + 2, y + 2, z, obsidian);
    // Missing top blocks (ruined)

    // Top (partial)
    this.world.setBlock(x - 1, y + 5, z, obsidian);
    this.world.setBlock(x, y + 5, z, obsidian);

    // Gold blocks nearby (loot)
    this.world.setBlock(x + 1, y + 1, z - 1, BlockType.GOLD_ORE);

    this.lootChests.push({
      x: x + 1, y: y + 1, z: z - 1,
      items: [
        { type: 'gold_ingot', count: 12 },
        { type: 'obsidian', count: 4 },
        { type: 'flint_and_steel', count: 1 },
      ]
    });
  }

  private tryGenerateDungeon(x: number, z: number): void {
    // Find underground stone
    let y = -1;
    for (let ty = 40; ty > 10; ty--) {
      const block = this.world.getBlock(x, ty, z);
      if (block === BlockType.STONE) {
        y = ty;
        break;
      }
    }

    if (y < 0) return;

    const cobble = BlockType.COBBLESTONE;
    const mossy = BlockType.STONE; // Using stone as mossy cobblestone stand-in

    // Carve out room
    for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
        for (let dy = 0; dy <= 4; dy++) {
          this.world.setBlock(x + dx, y - dy, z + dz, BlockType.AIR);
        }
      }
    }

    // Floor
    for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
        const block = Math.random() < 0.5 ? cobble : mossy;
        this.world.setBlock(x + dx, y - 5, z + dz, block);
      }
    }

    // Walls
    for (let dy = -4; dy <= 0; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        this.world.setBlock(x + dx, y + dy, z - 3, cobble);
        this.world.setBlock(x + dx, y + dy, z + 3, cobble);
      }
      for (let dz = -3; dz <= 3; dz++) {
        this.world.setBlock(x - 3, y + dy, z + dz, cobble);
        this.world.setBlock(x + 3, y + dy, z + dz, cobble);
      }
    }

    // Ceiling
    for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
        this.world.setBlock(x + dx, y + 1, z + dz, cobble);
      }
    }

    // Monster spawner (using coal ore as stand-in)
    this.world.setBlock(x, y - 3, z, BlockType.COAL_ORE);

    // Treasure chests
    this.world.setBlock(x - 2, y - 4, z, BlockType.DIAMOND_ORE);
    this.world.setBlock(x + 2, y - 4, z, BlockType.DIAMOND_ORE);

    this.lootChests.push({
      x: x - 2, y: y - 4, z,
      items: [
        { type: 'iron_ingot', count: 6 },
        { type: 'gold_ingot', count: 3 },
        { type: 'bread', count: 4 },
        { type: 'redstone', count: 8 },
      ]
    });

    this.lootChests.push({
      x: x + 2, y: y - 4, z,
      items: [
        { type: 'diamond', count: 2 },
        { type: 'golden_apple', count: 1 },
        { type: 'enchanted_book', count: 1 },
      ]
    });

    // Entrance shaft from surface
    let surfaceY = y;
    for (let ty = y; ty < 80; ty++) {
      const block = this.world.getBlock(x, ty, z - 4);
      if (block === BlockType.AIR || block === BlockType.WATER) {
        surfaceY = ty - 1;
        break;
      }
    }

    // Dig stairs down
    for (let step = 0; step <= (surfaceY - y); step++) {
      this.world.setBlock(x, y + step, z - 3 - step, BlockType.AIR);
      this.world.setBlock(x, y + step + 1, z - 3 - step, BlockType.AIR);
      this.world.setBlock(x - 1, y + step, z - 3 - step, cobble);
      this.world.setBlock(x + 1, y + step, z - 3 - step, cobble);
    }
  }

  // Check if player found a loot chest
  checkLootChest(x: number, y: number, z: number): LootChest | null {
    for (let i = 0; i < this.lootChests.length; i++) {
      const chest = this.lootChests[i];
      if (chest.x === x && chest.y === y && chest.z === z) {
        this.lootChests.splice(i, 1);
        return chest;
      }
    }
    return null;
  }

  tryGenerateVillage(worldX: number, worldZ: number): void {
    // Check if this is a valid village location (grass biome, relatively flat)
    const centerX = worldX + 16;
    const centerZ = worldZ + 16;

    // Find ground level at center
    let groundY = -1;
    for (let ty = 80; ty > 30; ty--) {
      const block = this.world.getBlock(centerX, ty, centerZ);
      if (block === BlockType.GRASS || block === BlockType.DIRT) {
        groundY = ty;
        break;
      }
    }

    if (groundY < 0) return; // Not grass biome

    // Check flatness - village needs relatively flat terrain
    let heightVariation = 0;
    for (let dx = -20; dx <= 20; dx += 10) {
      for (let dz = -20; dz <= 20; dz += 10) {
        for (let ty = groundY + 5; ty > groundY - 10; ty--) {
          const block = this.world.getBlock(centerX + dx, ty, centerZ + dz);
          if (block !== BlockType.AIR && block !== BlockType.WATER) {
            heightVariation += Math.abs(ty - groundY);
            break;
          }
        }
      }
    }

    if (heightVariation > 30) return; // Too hilly for village

    // Create village!
    const village: VillageLocation = {
      x: centerX,
      z: centerZ,
      buildingPositions: []
    };

    // Generate village well in center
    this.generateVillageWell(centerX, groundY, centerZ);

    // Generate paths from center
    const pathDirections = [
      { dx: 1, dz: 0 },
      { dx: -1, dz: 0 },
      { dx: 0, dz: 1 },
      { dx: 0, dz: -1 }
    ];

    // Generate buildings along paths
    const rand = seededRandom(centerX * 31337 + centerZ * 73856);

    for (const dir of pathDirections) {
      // Path length
      const pathLength = 15 + Math.floor(rand() * 10);

      // Generate path
      for (let i = 1; i <= pathLength; i++) {
        const pathX = centerX + dir.dx * i;
        const pathZ = centerZ + dir.dz * i;

        // Find ground at path position
        let pathY = groundY;
        for (let ty = groundY + 5; ty > groundY - 10; ty--) {
          const block = this.world.getBlock(pathX, ty, pathZ);
          if (block !== BlockType.AIR && block !== BlockType.WATER) {
            pathY = ty;
            break;
          }
        }

        // Place path block
        this.world.setBlock(pathX, pathY, pathZ, BlockType.COBBLESTONE);
      }

      // Generate buildings along path (every 8-12 blocks)
      let buildingDist = 6;
      while (buildingDist < pathLength - 4) {
        const buildX = centerX + dir.dx * buildingDist + (dir.dz !== 0 ? 0 : (rand() > 0.5 ? 5 : -5));
        const buildZ = centerZ + dir.dz * buildingDist + (dir.dx !== 0 ? 0 : (rand() > 0.5 ? 5 : -5));

        // Find ground at building position
        let buildY = groundY;
        for (let ty = groundY + 5; ty > groundY - 10; ty--) {
          const block = this.world.getBlock(buildX, ty, buildZ);
          if (block !== BlockType.AIR && block !== BlockType.WATER) {
            buildY = ty;
            break;
          }
        }

        // Random building type
        const buildingType = rand();
        if (buildingType < 0.4) {
          this.generateVillageHouse(buildX, buildY, buildZ);
          village.buildingPositions.push({ x: buildX, z: buildZ, type: 'house' });
        } else if (buildingType < 0.6) {
          this.generateVillageFarm(buildX, buildY, buildZ);
          village.buildingPositions.push({ x: buildX, z: buildZ, type: 'farm' });
        } else if (buildingType < 0.8) {
          this.generateVillageChurch(buildX, buildY, buildZ);
          village.buildingPositions.push({ x: buildX, z: buildZ, type: 'church' });
        } else {
          this.generateVillageBlacksmith(buildX, buildY, buildZ);
          village.buildingPositions.push({ x: buildX, z: buildZ, type: 'blacksmith' });
        }

        buildingDist += 8 + Math.floor(rand() * 5);
      }
    }

    this.villageLocations.push(village);
  }

  private generateVillageWell(x: number, y: number, z: number): void {
    const cobble = BlockType.COBBLESTONE;

    // Well walls
    for (let dy = 0; dy < 3; dy++) {
      this.world.setBlock(x - 1, y + dy, z - 1, cobble);
      this.world.setBlock(x + 1, y + dy, z - 1, cobble);
      this.world.setBlock(x - 1, y + dy, z + 1, cobble);
      this.world.setBlock(x + 1, y + dy, z + 1, cobble);
    }

    // Roof
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        this.world.setBlock(x + dx, y + 3, z + dz, BlockType.PLANKS);
      }
    }

    // Water inside
    this.world.setBlock(x, y, z, BlockType.WATER);
    this.world.setBlock(x, y - 1, z, BlockType.WATER);
    this.world.setBlock(x, y - 2, z, BlockType.WATER);

    // Posts
    this.world.setBlock(x - 1, y + 4, z - 1, BlockType.WOOD);
    this.world.setBlock(x + 1, y + 4, z + 1, BlockType.WOOD);
  }

  private generateVillageHouse(x: number, y: number, z: number): void {
    const planks = BlockType.PLANKS;
    const wood = BlockType.WOOD;
    const cobble = BlockType.COBBLESTONE;

    // Foundation
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        this.world.setBlock(x + dx, y, z + dz, cobble);
      }
    }

    // Walls
    for (let dy = 1; dy <= 3; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.world.setBlock(x + dx, y + dy, z - 2, planks);
        this.world.setBlock(x + dx, y + dy, z + 2, planks);
      }
      for (let dz = -2; dz <= 2; dz++) {
        this.world.setBlock(x - 2, y + dy, z + dz, planks);
        this.world.setBlock(x + 2, y + dy, z + dz, planks);
      }
    }

    // Corner posts (wood logs)
    for (let dy = 1; dy <= 4; dy++) {
      this.world.setBlock(x - 2, y + dy, z - 2, wood);
      this.world.setBlock(x + 2, y + dy, z - 2, wood);
      this.world.setBlock(x - 2, y + dy, z + 2, wood);
      this.world.setBlock(x + 2, y + dy, z + 2, wood);
    }

    // Door opening
    this.world.setBlock(x, y + 1, z - 2, BlockType.AIR);
    this.world.setBlock(x, y + 2, z - 2, BlockType.AIR);

    // Window
    this.world.setBlock(x, y + 2, z + 2, BlockType.GLASS);

    // Interior (clear it)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dy = 1; dy <= 3; dy++) {
          this.world.setBlock(x + dx, y + dy, z + dz, BlockType.AIR);
        }
      }
    }

    // Roof (stairs pattern using planks)
    for (let dx = -3; dx <= 3; dx++) {
      this.world.setBlock(x + dx, y + 4, z - 2, planks);
      this.world.setBlock(x + dx, y + 4, z + 2, planks);
      this.world.setBlock(x + dx, y + 4, z - 1, planks);
      this.world.setBlock(x + dx, y + 4, z + 1, planks);
      this.world.setBlock(x + dx, y + 4, z, planks);
    }
    // Peak
    for (let dx = -2; dx <= 2; dx++) {
      this.world.setBlock(x + dx, y + 5, z, planks);
    }

    // Torch inside
    this.world.setBlock(x, y + 2, z, BlockType.TORCH);
  }

  private generateVillageFarm(x: number, y: number, z: number): void {
    const wood = BlockType.WOOD;

    // Fence posts around farm (using wood)
    for (let dx = -3; dx <= 3; dx++) {
      this.world.setBlock(x + dx, y + 1, z - 3, wood);
      this.world.setBlock(x + dx, y + 1, z + 3, wood);
    }
    for (let dz = -3; dz <= 3; dz++) {
      this.world.setBlock(x - 3, y + 1, z + dz, wood);
      this.world.setBlock(x + 3, y + 1, z + dz, wood);
    }

    // Farmland (using dirt)
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        this.world.setBlock(x + dx, y, z + dz, BlockType.DIRT);
      }
    }

    // Water channel in middle
    this.world.setBlock(x, y, z, BlockType.WATER);

    // Opening in fence
    this.world.setBlock(x, y + 1, z - 3, BlockType.AIR);
  }

  private generateVillageChurch(x: number, y: number, z: number): void {
    const cobble = BlockType.COBBLESTONE;
    const planks = BlockType.PLANKS;

    // Foundation (larger than house)
    for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -4; dz <= 4; dz++) {
        this.world.setBlock(x + dx, y, z + dz, cobble);
      }
    }

    // Walls
    for (let dy = 1; dy <= 5; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        this.world.setBlock(x + dx, y + dy, z - 4, cobble);
        this.world.setBlock(x + dx, y + dy, z + 4, cobble);
      }
      for (let dz = -4; dz <= 4; dz++) {
        this.world.setBlock(x - 3, y + dy, z + dz, cobble);
        this.world.setBlock(x + 3, y + dy, z + dz, cobble);
      }
    }

    // Interior
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
        for (let dy = 1; dy <= 4; dy++) {
          this.world.setBlock(x + dx, y + dy, z + dz, BlockType.AIR);
        }
      }
    }

    // Door
    this.world.setBlock(x, y + 1, z - 4, BlockType.AIR);
    this.world.setBlock(x, y + 2, z - 4, BlockType.AIR);

    // Windows
    this.world.setBlock(x - 3, y + 3, z, BlockType.GLASS);
    this.world.setBlock(x + 3, y + 3, z, BlockType.GLASS);

    // Roof
    for (let dx = -4; dx <= 4; dx++) {
      for (let dz = -5; dz <= 5; dz++) {
        this.world.setBlock(x + dx, y + 6, z + dz, planks);
      }
    }

    // Bell tower
    for (let dy = 6; dy <= 10; dy++) {
      this.world.setBlock(x - 1, y + dy, z + 2, cobble);
      this.world.setBlock(x + 1, y + dy, z + 2, cobble);
      this.world.setBlock(x - 1, y + dy, z + 4, cobble);
      this.world.setBlock(x + 1, y + dy, z + 4, cobble);
    }

    // Bell (gold ore as placeholder)
    this.world.setBlock(x, y + 9, z + 3, BlockType.GOLD_ORE);

    // Tower roof
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = 2; dz <= 4; dz++) {
        this.world.setBlock(x + dx, y + 11, z + dz, planks);
      }
    }

    // Torches inside
    this.world.setBlock(x - 2, y + 3, z, BlockType.TORCH);
    this.world.setBlock(x + 2, y + 3, z, BlockType.TORCH);
  }

  private generateVillageBlacksmith(x: number, y: number, z: number): void {
    const cobble = BlockType.COBBLESTONE;
    const planks = BlockType.PLANKS;

    // Foundation
    for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        this.world.setBlock(x + dx, y, z + dz, cobble);
      }
    }

    // Walls
    for (let dy = 1; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        this.world.setBlock(x + dx, y + dy, z - 2, cobble);
        this.world.setBlock(x + dx, y + dy, z + 2, cobble);
      }
      for (let dz = -2; dz <= 2; dz++) {
        this.world.setBlock(x - 3, y + dy, z + dz, cobble);
        this.world.setBlock(x + 3, y + dy, z + dz, cobble);
      }
    }

    // Interior
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dy = 1; dy <= 2; dy++) {
          this.world.setBlock(x + dx, y + dy, z + dz, BlockType.AIR);
        }
      }
    }

    // Door
    this.world.setBlock(x, y + 1, z - 2, BlockType.AIR);
    this.world.setBlock(x, y + 2, z - 2, BlockType.AIR);

    // Forge (using brick and magma blocks)
    this.world.setBlock(x + 2, y + 1, z, BlockType.BRICK);
    this.world.setBlock(x + 2, y + 1, z + 1, BlockType.BRICK);
    this.world.setBlock(x + 2, y + 2, z, BlockType.MAGMA);

    // Roof
    for (let dx = -4; dx <= 4; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
        this.world.setBlock(x + dx, y + 4, z + dz, planks);
      }
    }

    // Loot chest - now uses actual CHEST block!
    this.world.setBlock(x - 2, y + 1, z, BlockType.CHEST);

    // Torch
    this.world.setBlock(x, y + 2, z, BlockType.TORCH);
  }

  // Check if position is near a village
  isNearVillage(x: number, z: number, radius: number = 50): boolean {
    for (const village of this.villageLocations) {
      const dist = Math.sqrt((x - village.x) ** 2 + (z - village.z) ** 2);
      if (dist <= radius) {
        return true;
      }
    }
    return false;
  }

  // Get village locations for villager spawning
  getVillageLocations(): VillageLocation[] {
    return this.villageLocations;
  }
}
