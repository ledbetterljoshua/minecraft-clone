import { Inventory } from './inventory';

// Crafting grid pattern using null for empty, string for items
// Pattern is read left-to-right, top-to-bottom
// 'W' = wood, 'P' = planks, 'S' = stick, 'C' = cobblestone, 'I' = iron, 'D' = diamond, 'G' = gold
// Block types use their enum number as string

export interface Recipe {
  pattern: (string | null)[][];  // 2D grid, can be 1x1, 2x2, or 3x3
  result: { type: string; count: number };
  shapeless?: boolean;  // If true, pattern position doesn't matter
}

// Item codes for recipes
const W = 'block_6';   // Wood
const P = 'block_17';  // Planks
const S = 'stick';     // Stick
const C = 'block_16';  // Cobblestone
const I = 'iron_ingot';
const D = 'diamond';
const _ = null;        // Empty

export const RECIPES: Recipe[] = [
  // Basic materials
  { pattern: [[W]], result: { type: 'block_17', count: 4 } },  // Wood -> 4 Planks
  { pattern: [[P], [P]], result: { type: 'stick', count: 4 } },  // 2 Planks -> 4 Sticks

  // Crafting table (needed for 3x3 recipes)
  { pattern: [[P, P], [P, P]], result: { type: 'crafting_table', count: 1 } },

  // Wooden tools
  { pattern: [[P, P, P], [_, S, _], [_, S, _]], result: { type: 'wooden_pickaxe', count: 1 } },
  { pattern: [[P, P], [P, S], [_, S]], result: { type: 'wooden_axe', count: 1 } },
  { pattern: [[P], [S], [S]], result: { type: 'wooden_sword', count: 1 } },
  { pattern: [[P], [P], [S]], result: { type: 'wooden_shovel', count: 1 } },

  // Stone tools
  { pattern: [[C, C, C], [_, S, _], [_, S, _]], result: { type: 'stone_pickaxe', count: 1 } },
  { pattern: [[C, C], [C, S], [_, S]], result: { type: 'stone_axe', count: 1 } },
  { pattern: [[C], [S], [S]], result: { type: 'stone_sword', count: 1 } },
  { pattern: [[C], [C], [S]], result: { type: 'stone_shovel', count: 1 } },

  // Iron tools
  { pattern: [[I, I, I], [_, S, _], [_, S, _]], result: { type: 'iron_pickaxe', count: 1 } },
  { pattern: [[I, I], [I, S], [_, S]], result: { type: 'iron_axe', count: 1 } },
  { pattern: [[I], [S], [S]], result: { type: 'iron_sword', count: 1 } },
  { pattern: [[I], [I], [S]], result: { type: 'iron_shovel', count: 1 } },

  // Diamond tools
  { pattern: [[D, D, D], [_, S, _], [_, S, _]], result: { type: 'diamond_pickaxe', count: 1 } },
  { pattern: [[D, D], [D, S], [_, S]], result: { type: 'diamond_axe', count: 1 } },
  { pattern: [[D], [S], [S]], result: { type: 'diamond_sword', count: 1 } },
  { pattern: [[D], [D], [S]], result: { type: 'diamond_shovel', count: 1 } },

  // Furnace
  { pattern: [[C, C, C], [C, _, C], [C, C, C]], result: { type: 'furnace', count: 1 } },

  // Chest
  { pattern: [[P, P, P], [P, _, P], [P, P, P]], result: { type: 'chest', count: 1 } },

  // Torches
  { pattern: [['coal'], [S]], result: { type: 'torch', count: 4 } },

  // Bread from wheat
  { pattern: [['wheat', 'wheat', 'wheat']], result: { type: 'bread', count: 1 } },

  // Glass from sand (smelting placeholder - can craft directly for now)
  { pattern: [['block_4']], result: { type: 'block_14', count: 1 }, shapeless: true },  // Sand -> Glass

  // Brick block from bricks
  { pattern: [['brick', 'brick'], ['brick', 'brick']], result: { type: 'block_15', count: 1 } },
];

export class CraftingSystem {
  public grid: (string | null)[][] = [];
  public gridSize: 2 | 3 = 2;  // 2x2 (inventory) or 3x3 (crafting table)
  public result: { type: string; count: number } | null = null;

  constructor(size: 2 | 3 = 2) {
    this.gridSize = size;
    this.clearGrid();
  }

  clearGrid(): void {
    this.grid = [];
    for (let y = 0; y < this.gridSize; y++) {
      const row: (string | null)[] = [];
      for (let x = 0; x < this.gridSize; x++) {
        row.push(null);
      }
      this.grid.push(row);
    }
    this.result = null;
  }

  setSlot(x: number, y: number, item: string | null): void {
    if (x >= 0 && x < this.gridSize && y >= 0 && y < this.gridSize) {
      this.grid[y][x] = item;
      this.checkRecipe();
    }
  }

  getSlot(x: number, y: number): string | null {
    if (x >= 0 && x < this.gridSize && y >= 0 && y < this.gridSize) {
      return this.grid[y][x];
    }
    return null;
  }

  // Normalize pattern to remove empty rows/columns
  private normalizePattern(pattern: (string | null)[][]): (string | null)[][] {
    // Find bounds of non-null cells
    let minX = Infinity, maxX = -1, minY = Infinity, maxY = -1;

    for (let y = 0; y < pattern.length; y++) {
      for (let x = 0; x < pattern[y].length; x++) {
        if (pattern[y][x] !== null) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
    }

    if (maxX < 0) return []; // Empty pattern

    // Extract normalized pattern
    const normalized: (string | null)[][] = [];
    for (let y = minY; y <= maxY; y++) {
      const row: (string | null)[] = [];
      for (let x = minX; x <= maxX; x++) {
        row.push(pattern[y][x]);
      }
      normalized.push(row);
    }

    return normalized;
  }

  // Check if patterns match (allowing for horizontal flip)
  private patternsMatch(grid: (string | null)[][], recipe: (string | null)[][]): boolean {
    if (grid.length !== recipe.length) return false;
    if (grid.length === 0) return false;
    if (grid[0].length !== recipe[0].length) return false;

    // Direct match
    let matches = true;
    for (let y = 0; y < grid.length && matches; y++) {
      for (let x = 0; x < grid[y].length && matches; x++) {
        if (grid[y][x] !== recipe[y][x]) matches = false;
      }
    }
    if (matches) return true;

    // Horizontally flipped match
    matches = true;
    for (let y = 0; y < grid.length && matches; y++) {
      for (let x = 0; x < grid[y].length && matches; x++) {
        const flippedX = grid[y].length - 1 - x;
        if (grid[y][x] !== recipe[y][flippedX]) matches = false;
      }
    }
    return matches;
  }

  checkRecipe(): void {
    this.result = null;
    const normalizedGrid = this.normalizePattern(this.grid);

    if (normalizedGrid.length === 0) return;

    for (const recipe of RECIPES) {
      // Check if recipe fits in current grid size
      if (recipe.pattern.length > this.gridSize) continue;
      if (recipe.pattern[0] && recipe.pattern[0].length > this.gridSize) continue;

      if (recipe.shapeless) {
        // For shapeless recipes, just check if all ingredients are present
        const gridItems: string[] = [];
        for (const row of this.grid) {
          for (const cell of row) {
            if (cell) gridItems.push(cell);
          }
        }

        const recipeItems: string[] = [];
        for (const row of recipe.pattern) {
          for (const cell of row) {
            if (cell) recipeItems.push(cell);
          }
        }

        if (gridItems.length !== recipeItems.length) continue;

        // Sort and compare
        gridItems.sort();
        recipeItems.sort();
        let match = true;
        for (let i = 0; i < gridItems.length; i++) {
          if (gridItems[i] !== recipeItems[i]) {
            match = false;
            break;
          }
        }

        if (match) {
          this.result = recipe.result;
          return;
        }
      } else {
        // Shaped recipe - check pattern match
        if (this.patternsMatch(normalizedGrid, recipe.pattern)) {
          this.result = recipe.result;
          return;
        }
      }
    }
  }

  // Craft the item - returns true if successful
  craft(inventory: Inventory): boolean {
    if (!this.result) return false;

    // Remove ingredients from grid
    const consumed: { x: number; y: number }[] = [];
    for (let y = 0; y < this.gridSize; y++) {
      for (let x = 0; x < this.gridSize; x++) {
        if (this.grid[y][x]) {
          consumed.push({ x, y });
        }
      }
    }

    // Add result to inventory
    const remaining = inventory.addItem(this.result.type, this.result.count);
    if (remaining > 0) {
      // Inventory full - don't consume ingredients
      return false;
    }

    // Clear consumed slots
    for (const pos of consumed) {
      this.grid[pos.y][pos.x] = null;
    }

    this.checkRecipe();
    return true;
  }
}

// Add new items to the ITEMS list
export const CRAFTING_ITEMS = {
  stick: { name: 'Stick', maxStack: 64 },
  coal: { name: 'Coal', maxStack: 64 },
  iron_ingot: { name: 'Iron Ingot', maxStack: 64 },
  gold_ingot: { name: 'Gold Ingot', maxStack: 64 },
  diamond: { name: 'Diamond', maxStack: 64 },
  crafting_table: { name: 'Crafting Table', maxStack: 64 },
  furnace: { name: 'Furnace', maxStack: 64 },
  chest: { name: 'Chest', maxStack: 64 },
  torch: { name: 'Torch', maxStack: 64 },
  brick: { name: 'Brick', maxStack: 64 },
  wheat: { name: 'Wheat', maxStack: 64 },
  wooden_axe: { name: 'Wooden Axe', maxStack: 1 },
  stone_axe: { name: 'Stone Axe', maxStack: 1 },
  iron_axe: { name: 'Iron Axe', maxStack: 1 },
  diamond_axe: { name: 'Diamond Axe', maxStack: 1 },
  wooden_shovel: { name: 'Wooden Shovel', maxStack: 1 },
  stone_shovel: { name: 'Stone Shovel', maxStack: 1 },
  iron_shovel: { name: 'Iron Shovel', maxStack: 1 },
  diamond_shovel: { name: 'Diamond Shovel', maxStack: 1 },
  iron_pickaxe: { name: 'Iron Pickaxe', maxStack: 1 },
  diamond_pickaxe: { name: 'Diamond Pickaxe', maxStack: 1 },
  iron_sword: { name: 'Iron Sword', maxStack: 1 },
  diamond_sword: { name: 'Diamond Sword', maxStack: 1 },
};
