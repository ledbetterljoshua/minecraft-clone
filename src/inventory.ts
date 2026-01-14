import { BlockType, BLOCKS } from './blocks';

export interface ItemStack {
  type: string;
  count: number;
  maxStack: number;
}

export interface InventorySlot {
  item: ItemStack | null;
}

// Items that aren't blocks
export const ITEMS: Record<string, { name: string; maxStack: number; food?: number; healing?: number }> = {
  // Food
  rotten_flesh: { name: 'Rotten Flesh', maxStack: 64, food: 4 },
  bone: { name: 'Bone', maxStack: 64 },
  porkchop: { name: 'Raw Porkchop', maxStack: 64, food: 3 },
  cooked_porkchop: { name: 'Cooked Porkchop', maxStack: 64, food: 8 },
  beef: { name: 'Raw Beef', maxStack: 64, food: 3 },
  cooked_beef: { name: 'Steak', maxStack: 64, food: 8 },
  apple: { name: 'Apple', maxStack: 64, food: 4 },
  bread: { name: 'Bread', maxStack: 64, food: 5 },
  // Materials
  stick: { name: 'Stick', maxStack: 64 },
  coal: { name: 'Coal', maxStack: 64 },
  iron_ingot: { name: 'Iron Ingot', maxStack: 64 },
  gold_ingot: { name: 'Gold Ingot', maxStack: 64 },
  diamond: { name: 'Diamond', maxStack: 64 },
  brick: { name: 'Brick', maxStack: 64 },
  wheat: { name: 'Wheat', maxStack: 64 },
  // Wooden tools
  wooden_sword: { name: 'Wooden Sword', maxStack: 1 },
  wooden_pickaxe: { name: 'Wooden Pickaxe', maxStack: 1 },
  wooden_axe: { name: 'Wooden Axe', maxStack: 1 },
  wooden_shovel: { name: 'Wooden Shovel', maxStack: 1 },
  // Stone tools
  stone_sword: { name: 'Stone Sword', maxStack: 1 },
  stone_pickaxe: { name: 'Stone Pickaxe', maxStack: 1 },
  stone_axe: { name: 'Stone Axe', maxStack: 1 },
  stone_shovel: { name: 'Stone Shovel', maxStack: 1 },
  // Iron tools
  iron_sword: { name: 'Iron Sword', maxStack: 1 },
  iron_pickaxe: { name: 'Iron Pickaxe', maxStack: 1 },
  iron_axe: { name: 'Iron Axe', maxStack: 1 },
  iron_shovel: { name: 'Iron Shovel', maxStack: 1 },
  // Diamond tools
  diamond_sword: { name: 'Diamond Sword', maxStack: 1 },
  diamond_pickaxe: { name: 'Diamond Pickaxe', maxStack: 1 },
  diamond_axe: { name: 'Diamond Axe', maxStack: 1 },
  diamond_shovel: { name: 'Diamond Shovel', maxStack: 1 },
  // Placeable items
  crafting_table: { name: 'Crafting Table', maxStack: 64 },
  furnace: { name: 'Furnace', maxStack: 64 },
  chest: { name: 'Chest', maxStack: 64 },
  torch: { name: 'Torch', maxStack: 64 },
};

export class Inventory {
  public slots: InventorySlot[] = [];
  public hotbarSize = 9;
  public inventorySize = 36;
  public selectedSlot = 0;

  constructor() {
    // Initialize all slots
    for (let i = 0; i < this.inventorySize; i++) {
      this.slots.push({ item: null });
    }

    // Start with basic items - give player lots of building blocks!
    this.addItem('wooden_sword', 1);
    this.addItem('wooden_pickaxe', 1);
    this.addBlockItem(BlockType.COBBLESTONE, 64);
    this.addBlockItem(BlockType.PLANKS, 64);
    this.addBlockItem(BlockType.WOOD, 64);
    this.addBlockItem(BlockType.DIRT, 64);
    this.addBlockItem(BlockType.STONE, 64);
    this.addBlockItem(BlockType.GLASS, 64);
    this.addBlockItem(BlockType.CRAFTING_TABLE, 4);  // Crafting tables!
    this.addBlockItem(BlockType.CHEST, 8);           // Chests!
    this.addBlockItem(BlockType.FURNACE, 4);         // Furnaces!
    this.addItem('bread', 10);
    this.addItem('torch', 32);  // Give player some torches!
  }

  addBlockItem(blockType: BlockType, count: number): number {
    const blockName = `block_${blockType}`;
    return this.addItem(blockName, count);
  }

  addItem(type: string, count: number): number {
    const maxStack = this.getMaxStack(type);
    let remaining = count;

    // First, try to stack with existing items
    for (const slot of this.slots) {
      if (slot.item && slot.item.type === type && slot.item.count < maxStack) {
        const canAdd = Math.min(remaining, maxStack - slot.item.count);
        slot.item.count += canAdd;
        remaining -= canAdd;
        if (remaining <= 0) return 0;
      }
    }

    // Then, find empty slots
    for (const slot of this.slots) {
      if (!slot.item) {
        const stackSize = Math.min(remaining, maxStack);
        slot.item = { type, count: stackSize, maxStack };
        remaining -= stackSize;
        if (remaining <= 0) return 0;
      }
    }

    return remaining; // Return items that couldn't be added
  }

  removeItem(slotIndex: number, count: number = 1): ItemStack | null {
    const slot = this.slots[slotIndex];
    if (!slot.item) return null;

    if (slot.item.count <= count) {
      const item = slot.item;
      slot.item = null;
      return item;
    } else {
      slot.item.count -= count;
      return { ...slot.item, count };
    }
  }

  getSelectedItem(): ItemStack | null {
    return this.slots[this.selectedSlot].item;
  }

  getSelectedBlockType(): BlockType | null {
    const item = this.getSelectedItem();
    if (!item) return null;

    if (item.type.startsWith('block_')) {
      return parseInt(item.type.split('_')[1]) as BlockType;
    }
    return null;
  }

  useSelectedItem(): boolean {
    const slot = this.slots[this.selectedSlot];
    if (!slot.item) return false;

    slot.item.count--;
    if (slot.item.count <= 0) {
      slot.item = null;
    }
    return true;
  }

  private getMaxStack(type: string): number {
    if (type.startsWith('block_')) {
      return 64;
    }
    return ITEMS[type]?.maxStack || 64;
  }

  getItemName(type: string): string {
    if (type.startsWith('block_')) {
      const blockType = parseInt(type.split('_')[1]) as BlockType;
      return BLOCKS[blockType]?.name || 'Unknown';
    }
    return ITEMS[type]?.name || type;
  }

  getItemFood(type: string): number {
    return ITEMS[type]?.food || 0;
  }

  isWeapon(type: string): boolean {
    return type.includes('sword');
  }

  isTool(type: string): boolean {
    return type.includes('pickaxe') || type.includes('axe') || type.includes('shovel');
  }

  getWeaponDamage(type: string): number {
    if (type === 'wooden_sword') return 4;
    if (type === 'stone_sword') return 5;
    if (type === 'iron_sword') return 6;
    if (type === 'diamond_sword') return 7;
    return 1; // Fist
  }
}
