// Block types and their properties
export enum BlockType {
  AIR = 0,
  GRASS = 1,
  DIRT = 2,
  STONE = 3,
  SAND = 4,
  WATER = 5,
  WOOD = 6,
  LEAVES = 7,
  BEDROCK = 8,
  COAL_ORE = 9,
  IRON_ORE = 10,
  GOLD_ORE = 11,
  DIAMOND_ORE = 12,
  SNOW = 13,
  GLASS = 14,
  BRICK = 15,
  COBBLESTONE = 16,
  PLANKS = 17,
  TORCH = 18,
  // Mesa/Badlands blocks
  RED_SAND = 19,
  TERRACOTTA = 20,
  ORANGE_TERRACOTTA = 21,
  YELLOW_TERRACOTTA = 22,
  RED_TERRACOTTA = 23,
  BROWN_TERRACOTTA = 24,
  WHITE_TERRACOTTA = 25,
  // Ocean blocks
  GRAVEL = 26,
  CLAY = 27,
  PRISMARINE = 28,
  // Nether blocks
  NETHERRACK = 29,
  SOUL_SAND = 30,
  GLOWSTONE = 31,
  NETHER_BRICK = 32,
  NETHER_QUARTZ_ORE = 33,
  MAGMA = 34,
  BASALT = 35,
  BLACKSTONE = 36,
  CRIMSON_NYLIUM = 37,
  WARPED_NYLIUM = 38,
  // Portal
  OBSIDIAN = 39,
  PORTAL = 40,
  // End blocks
  END_STONE = 41,
  END_STONE_BRICKS = 42,
  PURPUR_BLOCK = 43,
  CHORUS_PLANT = 44,
  CHORUS_FLOWER = 45,
  END_PORTAL = 46,
  DRAGON_EGG = 47,
  // Functional blocks
  CRAFTING_TABLE = 48,
  CHEST = 49,
  FURNACE = 50,
}

export interface BlockInfo {
  name: string;
  solid: boolean;
  transparent: boolean;
  color: [number, number, number]; // RGB 0-255
  topColor?: [number, number, number];
  bottomColor?: [number, number, number];
}

export const BLOCKS: Record<BlockType, BlockInfo> = {
  [BlockType.AIR]: { name: 'Air', solid: false, transparent: true, color: [0, 0, 0] },
  [BlockType.GRASS]: {
    name: 'Grass', solid: true, transparent: false,
    color: [134, 96, 67], // sides (dirt)
    topColor: [95, 159, 53], // top (grass)
    bottomColor: [134, 96, 67] // bottom (dirt)
  },
  [BlockType.DIRT]: { name: 'Dirt', solid: true, transparent: false, color: [134, 96, 67] },
  [BlockType.STONE]: { name: 'Stone', solid: true, transparent: false, color: [128, 128, 128] },
  [BlockType.SAND]: { name: 'Sand', solid: true, transparent: false, color: [219, 211, 160] },
  [BlockType.WATER]: { name: 'Water', solid: false, transparent: true, color: [64, 164, 223] },
  [BlockType.WOOD]: { name: 'Wood', solid: true, transparent: false, color: [156, 127, 78] },
  [BlockType.LEAVES]: { name: 'Leaves', solid: true, transparent: true, color: [67, 124, 37] },
  [BlockType.BEDROCK]: { name: 'Bedrock', solid: true, transparent: false, color: [50, 50, 50] },
  [BlockType.COAL_ORE]: { name: 'Coal Ore', solid: true, transparent: false, color: [70, 70, 70] },
  [BlockType.IRON_ORE]: { name: 'Iron Ore', solid: true, transparent: false, color: [136, 130, 127] },
  [BlockType.GOLD_ORE]: { name: 'Gold Ore', solid: true, transparent: false, color: [143, 140, 125] },
  [BlockType.DIAMOND_ORE]: { name: 'Diamond Ore', solid: true, transparent: false, color: [129, 140, 143] },
  [BlockType.SNOW]: { name: 'Snow', solid: true, transparent: false, color: [240, 240, 255] },
  [BlockType.GLASS]: { name: 'Glass', solid: true, transparent: true, color: [200, 220, 255] },
  [BlockType.BRICK]: { name: 'Brick', solid: true, transparent: false, color: [156, 91, 77] },
  [BlockType.COBBLESTONE]: { name: 'Cobblestone', solid: true, transparent: false, color: [100, 100, 100] },
  [BlockType.PLANKS]: { name: 'Planks', solid: true, transparent: false, color: [180, 144, 90] },
  [BlockType.TORCH]: { name: 'Torch', solid: false, transparent: true, color: [255, 200, 50] },
  // Mesa/Badlands
  [BlockType.RED_SAND]: { name: 'Red Sand', solid: true, transparent: false, color: [190, 102, 53] },
  [BlockType.TERRACOTTA]: { name: 'Terracotta', solid: true, transparent: false, color: [152, 94, 67] },
  [BlockType.ORANGE_TERRACOTTA]: { name: 'Orange Terracotta', solid: true, transparent: false, color: [161, 83, 37] },
  [BlockType.YELLOW_TERRACOTTA]: { name: 'Yellow Terracotta', solid: true, transparent: false, color: [186, 133, 35] },
  [BlockType.RED_TERRACOTTA]: { name: 'Red Terracotta', solid: true, transparent: false, color: [143, 61, 46] },
  [BlockType.BROWN_TERRACOTTA]: { name: 'Brown Terracotta', solid: true, transparent: false, color: [77, 51, 35] },
  [BlockType.WHITE_TERRACOTTA]: { name: 'White Terracotta', solid: true, transparent: false, color: [209, 178, 161] },
  // Ocean
  [BlockType.GRAVEL]: { name: 'Gravel', solid: true, transparent: false, color: [136, 126, 126] },
  [BlockType.CLAY]: { name: 'Clay', solid: true, transparent: false, color: [160, 166, 179] },
  [BlockType.PRISMARINE]: { name: 'Prismarine', solid: true, transparent: false, color: [99, 171, 158] },
  // Nether
  [BlockType.NETHERRACK]: { name: 'Netherrack', solid: true, transparent: false, color: [111, 54, 53] },
  [BlockType.SOUL_SAND]: { name: 'Soul Sand', solid: true, transparent: false, color: [81, 62, 50] },
  [BlockType.GLOWSTONE]: { name: 'Glowstone', solid: true, transparent: false, color: [255, 240, 180] },
  [BlockType.NETHER_BRICK]: { name: 'Nether Brick', solid: true, transparent: false, color: [44, 22, 26] },
  [BlockType.NETHER_QUARTZ_ORE]: { name: 'Nether Quartz Ore', solid: true, transparent: false, color: [117, 65, 62] },
  [BlockType.MAGMA]: { name: 'Magma Block', solid: true, transparent: false, color: [200, 100, 50] },
  [BlockType.BASALT]: { name: 'Basalt', solid: true, transparent: false, color: [72, 72, 78] },
  [BlockType.BLACKSTONE]: { name: 'Blackstone', solid: true, transparent: false, color: [42, 36, 41] },
  [BlockType.CRIMSON_NYLIUM]: {
    name: 'Crimson Nylium', solid: true, transparent: false,
    color: [111, 54, 53],
    topColor: [167, 54, 77], // Red fungus top
  },
  [BlockType.WARPED_NYLIUM]: {
    name: 'Warped Nylium', solid: true, transparent: false,
    color: [111, 54, 53],
    topColor: [22, 126, 134], // Cyan fungus top
  },
  [BlockType.OBSIDIAN]: { name: 'Obsidian', solid: true, transparent: false, color: [15, 10, 24] },
  [BlockType.PORTAL]: { name: 'Portal', solid: false, transparent: true, color: [148, 77, 229] },
  // End
  [BlockType.END_STONE]: { name: 'End Stone', solid: true, transparent: false, color: [219, 222, 158] },
  [BlockType.END_STONE_BRICKS]: { name: 'End Stone Bricks', solid: true, transparent: false, color: [226, 230, 171] },
  [BlockType.PURPUR_BLOCK]: { name: 'Purpur Block', solid: true, transparent: false, color: [169, 125, 169] },
  [BlockType.CHORUS_PLANT]: { name: 'Chorus Plant', solid: true, transparent: false, color: [92, 54, 92] },
  [BlockType.CHORUS_FLOWER]: { name: 'Chorus Flower', solid: true, transparent: false, color: [151, 120, 151] },
  [BlockType.END_PORTAL]: { name: 'End Portal', solid: false, transparent: true, color: [20, 20, 30] },
  [BlockType.DRAGON_EGG]: { name: 'Dragon Egg', solid: true, transparent: false, color: [12, 9, 15] },
  // Functional blocks
  [BlockType.CRAFTING_TABLE]: {
    name: 'Crafting Table', solid: true, transparent: false,
    color: [139, 90, 43],      // Sides (oak planks)
    topColor: [101, 67, 33],   // Top (crafting grid - darker)
  },
  [BlockType.CHEST]: {
    name: 'Chest', solid: true, transparent: false,
    color: [139, 90, 43],      // Sides (oak color)
    topColor: [110, 70, 35],   // Top (slightly different)
  },
  [BlockType.FURNACE]: {
    name: 'Furnace', solid: true, transparent: false,
    color: [100, 100, 100],    // Stone sides
    topColor: [80, 80, 80],    // Darker top
  },
};

export const HOTBAR_BLOCKS = [
  BlockType.GRASS,
  BlockType.DIRT,
  BlockType.STONE,
  BlockType.COBBLESTONE,
  BlockType.PLANKS,
  BlockType.WOOD,
  BlockType.GLASS,
  BlockType.BRICK,
  BlockType.SAND,
];
