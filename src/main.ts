import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { World } from './world';

// Custom vignette shader for subtle darkening at edges
const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    offset: { value: 1.0 },
    darkness: { value: 1.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float offset;
    uniform float darkness;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec2 uv = (vUv - vec2(0.5)) * vec2(offset);
      float vignette = 1.0 - dot(uv, uv);
      vignette = clamp(pow(vignette, darkness), 0.0, 1.0);
      gl_FragColor = vec4(texel.rgb * vignette, texel.a);
    }
  `,
};
import { Player } from './player';
import { BlockType, BLOCKS } from './blocks';
import { MobManager } from './mobs';
import { Inventory } from './inventory';
import { ParticleSystem } from './particles';
import { sound } from './sound';
import { FirstPersonHand } from './hand';
import { CraftingSystem } from './crafting';

class Game {
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloomPass: UnrealBloomPass;
  private scene: THREE.Scene;
  private hudScene: THREE.Scene;
  private hudCamera: THREE.PerspectiveCamera;
  private world: World;
  private player: Player;
  private mobManager: MobManager;
  private inventory: Inventory;
  private crafting: CraftingSystem;
  private particles: ParticleSystem;
  private hand: FirstPersonHand;

  // Inventory UI state
  private inventoryOpen = false;
  private heldItem: { type: string; count: number } | null = null;
  private inventoryScreen: HTMLElement;

  private clock: THREE.Clock;
  private dayTime = 0.25;
  private dayLength = 300;

  private targetBlock: { x: number; y: number; z: number } | null = null;
  private targetMesh: THREE.Mesh;

  // Mining state
  private isMining = false;
  private miningProgress = 0;
  private miningBlock: { x: number; y: number; z: number } | null = null;
  private miningOverlay: THREE.Mesh;

  private sunLight: THREE.DirectionalLight;
  private moonLight: THREE.DirectionalLight;
  private ambientLight: THREE.AmbientLight;
  private skyColor = new THREE.Color();

  private debugEl: HTMLElement;
  private loadingEl: HTMLElement;
  private healthBar: HTMLElement;
  private hungerBar: HTMLElement;
  private hotbarEl: HTMLElement;
  private deathScreen: HTMLElement;
  private damageOverlay: HTMLElement;

  private isNight = false;
  private gameStarted = false;

  private stars: THREE.Points;

  // Movement tracking for footsteps
  private lastFootstepTime = 0;
  private lastPlayerPos = new THREE.Vector3();

  // Screen shake
  private screenShake = 0;

  // Torch particle timing
  private torchParticleTime = 0;

  constructor() {
    // Setup renderer with shadows
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.autoClear = false;
    // Use Neutral tone mapping for more vibrant Minecraft-like colors
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    // Output color space for accurate colors
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(this.renderer.domElement);

    // Main scene - initialize before post-processing
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x87CEEB, 60, 180);

    // HUD scene for first-person hand
    this.hudScene = new THREE.Scene();
    this.hudCamera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 10);

    // Stars
    this.stars = this.createStars();
    this.scene.add(this.stars);

    // Lighting - Sun with shadow casting
    this.sunLight = new THREE.DirectionalLight(0xffffee, 1.2);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 400;
    this.sunLight.shadow.camera.left = -100;
    this.sunLight.shadow.camera.right = 100;
    this.sunLight.shadow.camera.top = 100;
    this.sunLight.shadow.camera.bottom = -100;
    this.sunLight.shadow.bias = -0.001;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);

    this.moonLight = new THREE.DirectionalLight(0x8888ff, 0.3);
    this.moonLight.castShadow = true;
    this.moonLight.shadow.mapSize.width = 1024;
    this.moonLight.shadow.mapSize.height = 1024;
    this.moonLight.shadow.camera.near = 10;
    this.moonLight.shadow.camera.far = 400;
    this.moonLight.shadow.camera.left = -80;
    this.moonLight.shadow.camera.right = 80;
    this.moonLight.shadow.camera.top = 80;
    this.moonLight.shadow.camera.bottom = -80;
    this.moonLight.shadow.bias = -0.001;
    this.scene.add(this.moonLight);

    // Add light targets to scene for shadow following
    this.scene.add(this.sunLight.target);
    this.scene.add(this.moonLight.target);

    this.ambientLight = new THREE.AmbientLight(0x404060, 0.3);
    this.scene.add(this.ambientLight);

    const hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x553322, 0.3);
    this.scene.add(hemiLight);

    // HUD lighting
    const hudLight = new THREE.DirectionalLight(0xffffff, 1);
    hudLight.position.set(1, 1, 1);
    this.hudScene.add(hudLight);
    this.hudScene.add(new THREE.AmbientLight(0xffffff, 0.5));

    // World and player
    this.world = new World(this.scene, 8);
    this.player = new Player(this.world);
    this.mobManager = new MobManager(this.scene, this.world);
    this.inventory = new Inventory();
    this.crafting = new CraftingSystem(2);
    this.particles = new ParticleSystem(this.scene);
    this.hand = new FirstPersonHand();
    this.hudScene.add(this.hand.group);

    // Post-processing with bloom for glowing effects
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.player.camera);
    this.composer.addPass(renderPass);

    // Bloom pass for glow effects (torches, glowstone, lava)
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.4,   // strength
      0.4,   // radius
      0.85   // threshold
    );
    this.composer.addPass(this.bloomPass);

    // Vignette pass - very subtle edge darkening
    const vignettePass = new ShaderPass(VignetteShader);
    vignettePass.uniforms['offset'].value = 1.1;    // Push vignette further to edges
    vignettePass.uniforms['darkness'].value = 0.8;  // Reduce intensity
    this.composer.addPass(vignettePass);

    // Inventory screen
    this.inventoryScreen = document.getElementById('inventory-screen')!;

    // Callbacks
    this.player.onDeath = () => {
      this.showDeathScreen();
      sound.playDeath();
    };
    this.player.onDamage = () => {
      this.flashDamage();
      sound.playHurt();
      this.screenShake = 0.3;
      this.particles.emitDamage(this.player.camera.position.clone());
    };

    this.mobManager.onExplosion = (position) => {
      this.particles.emitExplosion(position);
      this.screenShake = 0.5;
    };

    // Target block highlight
    const targetGeometry = new THREE.BoxGeometry(1.002, 1.002, 1.002);
    const targetMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      wireframe: true,
      transparent: true,
      opacity: 0.4,
    });
    this.targetMesh = new THREE.Mesh(targetGeometry, targetMaterial);
    this.targetMesh.visible = false;
    this.scene.add(this.targetMesh);

    // Mining crack overlay
    const miningGeometry = new THREE.BoxGeometry(1.003, 1.003, 1.003);
    const miningMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0,
    });
    this.miningOverlay = new THREE.Mesh(miningGeometry, miningMaterial);
    this.miningOverlay.visible = false;
    this.scene.add(this.miningOverlay);

    this.clock = new THREE.Clock();

    // UI elements
    this.debugEl = document.getElementById('debug')!;
    this.loadingEl = document.getElementById('loading')!;
    this.healthBar = document.getElementById('health-bar')!;
    this.hungerBar = document.getElementById('hunger-bar')!;
    this.hotbarEl = document.getElementById('hotbar')!;
    this.deathScreen = document.getElementById('death-screen')!;
    this.damageOverlay = document.getElementById('damage-overlay')!;

    this.setupUI();
    this.setupInput();

    // Generate spawn village first, then spawn player
    this.generateSpawnVillageAndStart();
  }

  private createStars(): THREE.Points {
    const geometry = new THREE.BufferGeometry();
    const vertices = [];

    for (let i = 0; i < 2000; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 400;

      vertices.push(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
      );
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.5,
      transparent: true,
      opacity: 0.8,
    });

    return new THREE.Points(geometry, material);
  }

  private generateSpawnVillageAndStart(): void {
    // First, update chunks near spawn to generate terrain
    // Run multiple times to ensure all nearby chunks are generated
    for (let i = 0; i < 20; i++) {
      this.world.updateChunks(0, 0);
    }

    // Wait a bit for terrain to fully generate, then create village
    setTimeout(() => {
      // Generate more chunks to ensure terrain exists
      for (let i = 0; i < 30; i++) {
        this.world.updateChunks(0, 0);
      }

      // Now generate the spawn village at (0, 0)
      this.world.getStructureGenerator().generateSpawnVillage();

      // Force rebuild of chunks near spawn to show the village
      for (let i = 0; i < 10; i++) {
        this.world.updateChunks(0, 0);
      }

      // Spawn player at village center
      const spawnY = this.world.getSpawnHeight(0, 0);
      this.player.position.set(0, spawnY + 2, 0);
      this.player.velocity.set(0, 0, 0);
      this.lastPlayerPos.copy(this.player.position);

      // Start the game loop
      this.animate();
    }, 500);
  }

  private setupUI(): void {
    this.updateHotbar();
    this.updateHandTool();
  }

  private updateHandTool(): void {
    const item = this.inventory.getSelectedItem();
    if (!item) {
      this.hand.setTool('none');
      return;
    }

    if (item.type.includes('sword')) {
      this.hand.setTool('sword');
    } else if (item.type.includes('pickaxe')) {
      this.hand.setTool('pickaxe');
    } else if (item.type.startsWith('block_')) {
      const blockType = parseInt(item.type.split('_')[1]) as BlockType;
      const color = BLOCKS[blockType]?.color;
      const hexColor = color ? (color[0] << 16) | (color[1] << 8) | color[2] : 0x888888;
      this.hand.setTool('block', hexColor);
    } else {
      this.hand.setTool('none');
    }
  }

  private updateHotbar(): void {
    this.hotbarEl.innerHTML = '';

    for (let i = 0; i < this.inventory.hotbarSize; i++) {
      const slot = document.createElement('div');
      slot.className = 'hotbar-slot' + (i === this.inventory.selectedSlot ? ' selected' : '');

      const item = this.inventory.slots[i].item;
      if (item) {
        const itemName = this.inventory.getItemName(item.type);
        slot.innerHTML = `
          <span class="item-name">${itemName}</span>
          ${item.count > 1 ? `<span class="item-count">${item.count}</span>` : ''}
        `;

        if (item.type.startsWith('block_')) {
          const blockType = parseInt(item.type.split('_')[1]) as BlockType;
          const color = BLOCKS[blockType]?.color;
          if (color) {
            slot.style.backgroundColor = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.6)`;
          }
        } else if (item.type.includes('sword')) {
          slot.style.backgroundColor = 'rgba(150, 150, 150, 0.6)';
        } else if (item.type.includes('pickaxe')) {
          slot.style.backgroundColor = 'rgba(139, 90, 43, 0.6)';
        } else {
          slot.style.backgroundColor = 'rgba(100, 80, 60, 0.6)';
        }
      }

      this.hotbarEl.appendChild(slot);
    }

    this.updateHandTool();
  }

  private updateHealthHunger(): void {
    const healthPercent = (this.player.health / this.player.maxHealth) * 100;
    const hungerPercent = (this.player.hunger / this.player.maxHunger) * 100;
    const oxygenPercent = (this.player.oxygen / this.player.maxOxygen) * 100;

    this.healthBar.style.width = `${healthPercent}%`;
    this.hungerBar.style.width = `${hungerPercent}%`;

    // Oxygen bar - only show when underwater
    const oxygenStat = document.getElementById('oxygen-stat')!;
    const oxygenBar = document.getElementById('oxygen-bar')!;
    if (this.player.isUnderwater || this.player.oxygen < this.player.maxOxygen) {
      oxygenStat.style.display = 'flex';
      oxygenBar.style.width = `${oxygenPercent}%`;
    } else {
      oxygenStat.style.display = 'none';
    }

    if (healthPercent > 50) {
      this.healthBar.style.backgroundColor = '#e74c3c';
    } else if (healthPercent > 25) {
      this.healthBar.style.backgroundColor = '#e67e22';
    } else {
      this.healthBar.style.backgroundColor = '#c0392b';
    }
  }

  private showDeathScreen(): void {
    this.deathScreen.classList.add('visible');
  }

  private hideDeathScreen(): void {
    this.deathScreen.classList.remove('visible');
  }

  private flashDamage(): void {
    this.damageOverlay.style.opacity = '0.4';
    setTimeout(() => {
      this.damageOverlay.style.opacity = '0';
    }, 100);
  }

  private setupInput(): void {
    // Start game on click
    this.loadingEl.addEventListener('click', async () => {
      await sound.init();
      this.loadingEl.style.display = 'none';
      this.gameStarted = true;
      this.player.lock();
    });

    this.renderer.domElement.addEventListener('click', async () => {
      if (this.gameStarted && !this.player.isLocked && !this.player.isDead) {
        await sound.init();
        this.player.lock();
      }
    });

    document.getElementById('respawn-btn')?.addEventListener('click', () => {
      this.player.respawn();
      this.hideDeathScreen();
      this.player.lock();
    });

    // Hotbar
    document.addEventListener('keydown', (e) => {
      const num = parseInt(e.key);
      if (num >= 1 && num <= 9) {
        this.selectSlot(num - 1);
      }

      if (e.code === 'KeyE' && !this.player.isDead && !this.inventoryOpen) {
        const item = this.inventory.getSelectedItem();
        if (item && this.player.hunger < this.player.maxHunger) {
          const food = this.inventory.getItemFood(item.type);
          if (food > 0) {
            this.player.feed(food);
            this.inventory.useSelectedItem();
            this.updateHotbar();
            sound.playEat();
          }
        }
      }

      // Open/close inventory
      if (e.code === 'KeyI' && !this.player.isDead) {
        this.toggleInventory();
      }

      // Close inventory with escape
      if (e.code === 'Escape' && this.inventoryOpen) {
        this.closeInventory();
        e.preventDefault();
      }
    });

    document.addEventListener('wheel', (e) => {
      if (!this.player.isLocked) return;
      if (e.deltaY > 0) {
        this.selectSlot((this.inventory.selectedSlot + 1) % this.inventory.hotbarSize);
      } else {
        this.selectSlot((this.inventory.selectedSlot - 1 + this.inventory.hotbarSize) % this.inventory.hotbarSize);
      }
    });

    // Mining (hold left click)
    document.addEventListener('mousedown', (e) => {
      if (this.inventoryOpen || !this.player.isLocked || this.player.isDead) return;

      if (e.button === 0) {
        this.startMining();
      } else if (e.button === 2) {
        this.placeBlock();
      }
    });

    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.stopMining();
      }
    });

    document.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('resize', () => {
      this.player.camera.aspect = window.innerWidth / window.innerHeight;
      this.player.camera.updateProjectionMatrix();
      this.hudCamera.aspect = window.innerWidth / window.innerHeight;
      this.hudCamera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.composer.setSize(window.innerWidth, window.innerHeight);
      this.bloomPass.resolution.set(window.innerWidth, window.innerHeight);
    });
  }

  private selectSlot(index: number): void {
    this.inventory.selectedSlot = index;
    this.updateHotbar();
  }

  // Inventory UI methods
  private toggleInventory(): void {
    if (this.inventoryOpen) {
      this.closeInventory();
    } else {
      this.openInventory();
    }
  }

  private openInventory(): void {
    this.inventoryOpen = true;
    this.inventoryScreen.classList.add('visible');
    this.player.unlock();
    this.renderInventoryUI();
  }

  private closeInventory(): void {
    this.inventoryOpen = false;
    this.inventoryScreen.classList.remove('visible');

    // Return held item to inventory
    if (this.heldItem) {
      this.inventory.addItem(this.heldItem.type, this.heldItem.count);
      this.heldItem = null;
      this.updateHeldItemDisplay();
    }

    // Return crafting grid items to inventory
    for (let y = 0; y < this.crafting.gridSize; y++) {
      for (let x = 0; x < this.crafting.gridSize; x++) {
        const item = this.crafting.getSlot(x, y);
        if (item) {
          this.inventory.addItem(item, 1);
        }
      }
    }
    this.crafting.clearGrid();

    this.player.lock();
    this.updateHotbar();
  }

  private renderInventoryUI(): void {
    // Render crafting grid (2x2)
    const craftingGrid = document.getElementById('crafting-grid')!;
    craftingGrid.innerHTML = '';
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 2; x++) {
        const slot = this.createSlot('crafting', x + y * 2);
        const item = this.crafting.getSlot(x, y);
        if (item) {
          this.populateSlot(slot, item, 1);
        }
        craftingGrid.appendChild(slot);
      }
    }

    // Render crafting result
    const resultContainer = document.getElementById('crafting-result')!;
    resultContainer.innerHTML = '';
    const resultSlot = this.createSlot('result', 0);
    resultSlot.classList.add('result-slot');
    if (this.crafting.result) {
      this.populateSlot(resultSlot, this.crafting.result.type, this.crafting.result.count);
      resultSlot.classList.add('has-result');
    }
    resultContainer.appendChild(resultSlot);

    // Render main inventory (slots 9-35)
    const inventoryGrid = document.getElementById('inventory-grid')!;
    inventoryGrid.innerHTML = '';
    for (let i = 9; i < 36; i++) {
      const slot = this.createSlot('inventory', i);
      const item = this.inventory.slots[i]?.item;
      if (item) {
        this.populateSlot(slot, item.type, item.count);
      }
      inventoryGrid.appendChild(slot);
    }

    // Render hotbar in inventory (slots 0-8)
    const hotbarGrid = document.getElementById('inventory-hotbar')!;
    hotbarGrid.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const slot = this.createSlot('hotbar', i);
      const item = this.inventory.slots[i]?.item;
      if (item) {
        this.populateSlot(slot, item.type, item.count);
      }
      if (i === this.inventory.selectedSlot) {
        slot.classList.add('selected');
      }
      hotbarGrid.appendChild(slot);
    }
  }

  private createSlot(type: string, index: number): HTMLDivElement {
    const slot = document.createElement('div');
    slot.className = 'inv-slot';
    slot.dataset.type = type;
    slot.dataset.index = String(index);

    slot.addEventListener('click', () => this.handleSlotClick(type, index));

    return slot;
  }

  private populateSlot(slot: HTMLDivElement, itemType: string, count: number): void {
    slot.classList.add('has-item');

    // Create color preview
    const preview = document.createElement('div');
    preview.className = 'item-preview';

    if (itemType.startsWith('block_')) {
      const blockType = parseInt(itemType.split('_')[1]) as BlockType;
      const color = BLOCKS[blockType]?.color;
      if (color) {
        preview.style.backgroundColor = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
      }
    } else {
      // Item colors
      const itemColors: Record<string, string> = {
        stick: '#8B4513',
        coal: '#333',
        iron_ingot: '#DDD',
        gold_ingot: '#FFD700',
        diamond: '#4AF',
        wooden_sword: '#A86032',
        stone_sword: '#888',
        iron_sword: '#DDD',
        diamond_sword: '#4AF',
        wooden_pickaxe: '#A86032',
        stone_pickaxe: '#888',
        iron_pickaxe: '#DDD',
        diamond_pickaxe: '#4AF',
        bread: '#D4A574',
        apple: '#E74C3C',
        torch: '#FFA500',
      };
      preview.style.backgroundColor = itemColors[itemType] || '#666';
    }
    slot.appendChild(preview);

    // Item name
    const name = document.createElement('div');
    name.className = 'slot-name';
    name.textContent = this.inventory.getItemName(itemType);
    slot.appendChild(name);

    // Count
    if (count > 1) {
      const countEl = document.createElement('div');
      countEl.className = 'slot-count';
      countEl.textContent = String(count);
      slot.appendChild(countEl);
    }
  }

  private handleSlotClick(type: string, index: number): void {
    if (type === 'result') {
      // Clicking result slot - craft the item
      if (this.crafting.result && !this.heldItem) {
        const success = this.crafting.craft(this.inventory);
        if (success) {
          sound.playPop();
        }
        this.renderInventoryUI();
      }
      return;
    }

    if (type === 'crafting') {
      const x = index % 2;
      const y = Math.floor(index / 2);
      const gridItem = this.crafting.getSlot(x, y);

      if (this.heldItem) {
        // Place held item
        if (!gridItem) {
          this.crafting.setSlot(x, y, this.heldItem.type);
          this.heldItem.count--;
          if (this.heldItem.count <= 0) {
            this.heldItem = null;
          }
        } else if (gridItem === this.heldItem.type) {
          // Can't stack in crafting grid
        } else {
          // Swap
          this.crafting.setSlot(x, y, this.heldItem.type);
          const tempType = this.heldItem.type;
          this.heldItem = { type: gridItem, count: 1 };
          this.crafting.setSlot(x, y, tempType);
        }
      } else if (gridItem) {
        // Pick up item
        this.heldItem = { type: gridItem, count: 1 };
        this.crafting.setSlot(x, y, null);
      }
    } else {
      // Inventory or hotbar slot
      const slotIndex = type === 'hotbar' ? index : index;
      const slot = this.inventory.slots[slotIndex];

      if (this.heldItem) {
        // Place held item
        if (!slot.item) {
          slot.item = {
            type: this.heldItem.type,
            count: this.heldItem.count,
            maxStack: 64
          };
          this.heldItem = null;
        } else if (slot.item.type === this.heldItem.type) {
          // Stack
          const canAdd = Math.min(this.heldItem.count, 64 - slot.item.count);
          slot.item.count += canAdd;
          this.heldItem.count -= canAdd;
          if (this.heldItem.count <= 0) {
            this.heldItem = null;
          }
        } else {
          // Swap
          const temp = slot.item;
          slot.item = {
            type: this.heldItem.type,
            count: this.heldItem.count,
            maxStack: 64
          };
          this.heldItem = { type: temp.type, count: temp.count };
        }
      } else if (slot.item) {
        // Pick up item
        this.heldItem = { type: slot.item.type, count: slot.item.count };
        slot.item = null;
      }
    }

    this.updateHeldItemDisplay();
    this.renderInventoryUI();
  }

  private updateHeldItemDisplay(): void {
    const heldItemEl = document.getElementById('held-item')!;

    if (this.heldItem) {
      heldItemEl.classList.add('visible');
      heldItemEl.innerHTML = '';

      const preview = document.createElement('div');
      preview.className = 'item-preview';

      if (this.heldItem.type.startsWith('block_')) {
        const blockType = parseInt(this.heldItem.type.split('_')[1]) as BlockType;
        const color = BLOCKS[blockType]?.color;
        if (color) {
          preview.style.backgroundColor = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
        }
      } else {
        preview.style.backgroundColor = '#666';
      }
      heldItemEl.appendChild(preview);

      if (this.heldItem.count > 1) {
        const count = document.createElement('div');
        count.className = 'item-count';
        count.textContent = String(this.heldItem.count);
        heldItemEl.appendChild(count);
      }

      // Follow mouse
      document.addEventListener('mousemove', this.updateHeldItemPosition);
    } else {
      heldItemEl.classList.remove('visible');
      document.removeEventListener('mousemove', this.updateHeldItemPosition);
    }
  }

  private updateHeldItemPosition = (e: MouseEvent): void => {
    const heldItemEl = document.getElementById('held-item')!;
    heldItemEl.style.left = `${e.clientX - 20}px`;
    heldItemEl.style.top = `${e.clientY - 20}px`;
  };

  private startMining(): void {
    // First try to attack
    const item = this.inventory.getSelectedItem();
    const damage = item ? this.inventory.getWeaponDamage(item.type) : 1;

    const hitMob = this.mobManager.attackMob(
      this.player.camera.position,
      this.player.getForwardDirection(),
      damage
    );

    if (hitMob) {
      this.player.startAttack();
      this.hand.swing();
      sound.playHurt();
      this.particles.emitDamage(hitMob.position.clone().add(new THREE.Vector3(0, 1, 0)));
      return;
    }

    // Start mining block
    if (this.targetBlock) {
      this.isMining = true;
      this.miningProgress = 0;
      this.miningBlock = { ...this.targetBlock };
      this.hand.swing();
    }
  }

  private stopMining(): void {
    this.isMining = false;
    this.miningProgress = 0;
    this.miningBlock = null;
    this.miningOverlay.visible = false;
    this.hand.setMiningProgress(0);
  }

  private updateMining(deltaTime: number): void {
    if (!this.isMining || !this.miningBlock || !this.targetBlock) {
      return;
    }

    // Check if still looking at same block
    if (
      this.targetBlock.x !== this.miningBlock.x ||
      this.targetBlock.y !== this.miningBlock.y ||
      this.targetBlock.z !== this.miningBlock.z
    ) {
      this.stopMining();
      return;
    }

    const block = this.world.getBlock(this.miningBlock.x, this.miningBlock.y, this.miningBlock.z);
    if (block === BlockType.BEDROCK) {
      this.stopMining();
      return;
    }

    // Calculate mining speed based on tool
    const item = this.inventory.getSelectedItem();
    let miningSpeed = 1;
    if (item) {
      if (item.type.includes('pickaxe')) {
        if (block === BlockType.STONE || block === BlockType.COBBLESTONE) {
          miningSpeed = 4;
        }
      }
    }

    // Get block hardness
    let hardness = 1;
    if (block === BlockType.STONE || block === BlockType.COBBLESTONE) hardness = 1.5;
    if (block === BlockType.DIRT || block === BlockType.GRASS) hardness = 0.5;
    if (block === BlockType.SAND) hardness = 0.5;
    if (block === BlockType.WOOD) hardness = 2;
    if (block === BlockType.LEAVES) hardness = 0.2;

    const mineTime = hardness / miningSpeed;
    this.miningProgress += deltaTime / mineTime;
    this.hand.setMiningProgress(this.miningProgress);

    // Mining tick sound
    if (Math.floor(this.miningProgress * 5) !== Math.floor((this.miningProgress - deltaTime / mineTime) * 5)) {
      sound.playMiningTick();
    }

    // Update mining overlay
    this.miningOverlay.visible = true;
    this.miningOverlay.position.set(
      this.miningBlock.x + 0.5,
      this.miningBlock.y + 0.5,
      this.miningBlock.z + 0.5
    );
    (this.miningOverlay.material as THREE.MeshBasicMaterial).opacity = this.miningProgress * 0.5;

    // Complete mining
    if (this.miningProgress >= 1) {
      const blockColor = BLOCKS[block]?.color || [128, 128, 128];
      this.particles.emitBlockBreak(
        new THREE.Vector3(this.miningBlock.x + 0.5, this.miningBlock.y + 0.5, this.miningBlock.z + 0.5),
        blockColor as [number, number, number]
      );

      sound.playBlockBreak();

      this.world.setBlock(this.miningBlock.x, this.miningBlock.y, this.miningBlock.z, BlockType.AIR);

      // Handle ore drops - ores drop items, not blocks
      if (block === BlockType.COAL_ORE) {
        this.inventory.addItem('coal', 1);
      } else if (block === BlockType.IRON_ORE) {
        // Iron ore drops the ore block (needs smelting)
        this.inventory.addBlockItem(block, 1);
      } else if (block === BlockType.GOLD_ORE) {
        // Gold ore drops the ore block (needs smelting)
        this.inventory.addBlockItem(block, 1);
      } else if (block === BlockType.DIAMOND_ORE) {
        this.inventory.addItem('diamond', 1);
      } else if (block === BlockType.STONE) {
        // Stone drops cobblestone
        this.inventory.addBlockItem(BlockType.COBBLESTONE, 1);
      } else if (block === BlockType.GRASS) {
        // Grass drops dirt
        this.inventory.addBlockItem(BlockType.DIRT, 1);
      } else if (block === BlockType.LEAVES) {
        // Leaves sometimes drop apples
        if (Math.random() < 0.05) {
          this.inventory.addItem('apple', 1);
        }
      } else {
        // Default: drop the block itself
        this.inventory.addBlockItem(block, 1);
      }

      this.updateHotbar();
      sound.playPop();

      this.stopMining();
    }
  }

  private placeBlock(): void {
    // First check if we're clicking on an interactive block (chest, crafting table)
    if (this.targetBlock) {
      const targetBlockType = this.world.getBlock(
        this.targetBlock.x,
        this.targetBlock.y,
        this.targetBlock.z
      );

      // Open chest and give loot!
      if (targetBlockType === BlockType.CHEST) {
        this.openChest(this.targetBlock.x, this.targetBlock.y, this.targetBlock.z);
        return;
      }

      // Open crafting table
      if (targetBlockType === BlockType.CRAFTING_TABLE) {
        this.openCraftingTable();
        return;
      }
    }

    const item = this.inventory.getSelectedItem();
    if (!item) return;

    // Check if it's a torch (special item) or a block
    let blockToPlace: BlockType | null = null;

    if (item.type === 'torch') {
      blockToPlace = BlockType.TORCH;
    } else {
      blockToPlace = this.inventory.getSelectedBlockType();
    }

    if (!blockToPlace) return;

    if (this.targetBlock) {
      const ray = this.world.raycast(
        this.player.camera.position,
        this.player.getForwardDirection()
      );

      if (ray.hit && ray.normal && ray.blockPos) {
        const placeX = ray.blockPos.x + ray.normal.x;
        const placeY = ray.blockPos.y + ray.normal.y;
        const placeZ = ray.blockPos.z + ray.normal.z;

        const px = Math.floor(this.player.position.x);
        const py = Math.floor(this.player.position.y);
        const pz = Math.floor(this.player.position.z);

        if (!(placeX === px && placeZ === pz && (placeY === py || placeY === py + 1))) {
          this.world.setBlock(placeX, placeY, placeZ, blockToPlace);
          this.inventory.useSelectedItem();
          this.updateHotbar();
          sound.playBlockPlace();
          this.hand.swing();
        }
      }
    }
  }

  // Store opened chest positions to track loot
  private openedChests: Set<string> = new Set();

  private openChest(x: number, y: number, z: number): void {
    const chestKey = `${x},${y},${z}`;

    // Check if chest was already opened
    if (this.openedChests.has(chestKey)) {
      // Already looted - show message
      console.log('This chest is empty!');
      sound.playPop();
      return;
    }

    // Mark as opened
    this.openedChests.add(chestKey);

    // Generate random loot!
    const lootTable = [
      { type: 'diamond', count: () => 1 + Math.floor(Math.random() * 3), chance: 0.3 },
      { type: 'gold_ingot', count: () => 2 + Math.floor(Math.random() * 6), chance: 0.5 },
      { type: 'iron_ingot', count: () => 3 + Math.floor(Math.random() * 8), chance: 0.7 },
      { type: 'bread', count: () => 2 + Math.floor(Math.random() * 5), chance: 0.6 },
      { type: 'apple', count: () => 1 + Math.floor(Math.random() * 4), chance: 0.5 },
      { type: 'torch', count: () => 4 + Math.floor(Math.random() * 8), chance: 0.6 },
      { type: 'iron_sword', count: () => 1, chance: 0.2 },
      { type: 'iron_pickaxe', count: () => 1, chance: 0.2 },
      { type: 'golden_apple', count: () => 1, chance: 0.1 },
      { type: 'ender_pearl', count: () => 1 + Math.floor(Math.random() * 2), chance: 0.15 },
    ];

    // Also give some random blocks
    const blockLoot = [
      { block: BlockType.COBBLESTONE, count: () => 16 + Math.floor(Math.random() * 32), chance: 0.5 },
      { block: BlockType.PLANKS, count: () => 8 + Math.floor(Math.random() * 16), chance: 0.4 },
      { block: BlockType.GLASS, count: () => 4 + Math.floor(Math.random() * 8), chance: 0.3 },
      { block: BlockType.OBSIDIAN, count: () => 1 + Math.floor(Math.random() * 3), chance: 0.1 },
    ];

    let gotLoot = false;

    // Roll for each item
    for (const loot of lootTable) {
      if (Math.random() < loot.chance) {
        const count = loot.count();
        this.inventory.addItem(loot.type, count);
        gotLoot = true;
      }
    }

    // Roll for block loot
    for (const loot of blockLoot) {
      if (Math.random() < loot.chance) {
        const count = loot.count();
        this.inventory.addBlockItem(loot.block, count);
        gotLoot = true;
      }
    }

    // Always give at least something!
    if (!gotLoot) {
      this.inventory.addItem('bread', 3);
      this.inventory.addItem('torch', 4);
    }

    this.updateHotbar();
    sound.playPop();
    sound.playPop(); // Double pop for excitement!

    console.log('You found loot!');
  }

  private openCraftingTable(): void {
    // For now, just open the inventory which has crafting
    this.toggleInventory();
  }

  private updateDayNight(deltaTime: number): void {
    // The End dimension has special lighting - always dark void
    if (this.world.currentDimension === 'end') {
      this.updateEndLighting();
      return;
    }

    this.dayTime += deltaTime / this.dayLength;
    if (this.dayTime > 1) this.dayTime -= 1;

    const sunAngle = this.dayTime * Math.PI * 2 - Math.PI / 2;
    const sunHeight = Math.sin(sunAngle);

    this.sunLight.position.set(
      Math.cos(sunAngle) * 150,
      Math.sin(sunAngle) * 150 + 50,
      50
    );
    this.sunLight.position.add(this.player.position);
    this.sunLight.target.position.copy(this.player.position);
    this.sunLight.target.updateMatrixWorld();

    this.moonLight.position.set(
      -Math.cos(sunAngle) * 150,
      -Math.sin(sunAngle) * 150 + 50,
      50
    );
    this.moonLight.position.add(this.player.position);
    this.moonLight.target.position.copy(this.player.position);
    this.moonLight.target.updateMatrixWorld();

    this.isNight = sunHeight < 0;

    const dayIntensity = Math.max(0, sunHeight);
    const twilight = Math.max(0, Math.min(1, sunHeight + 0.3));

    this.sunLight.intensity = dayIntensity * 1.8;
    this.moonLight.intensity = this.isNight ? 1.2 : 0;
    this.ambientLight.intensity = 0.2 + twilight * 0.4;

    // Night lighting - much brighter for playability (Minecraft-style)
    if (this.isNight) {
      // Significantly brighter ambient for playable nights
      this.ambientLight.intensity = 0.55;
      // Slightly bluish tint but not too dark
      this.ambientLight.color.setHex(0x9090c0);
    } else {
      // Warm daylight ambient
      this.ambientLight.color.setHex(0xffffff);
    }

    (this.stars.material as THREE.PointsMaterial).opacity = this.isNight ? 0.9 : 0;
    this.stars.position.copy(this.player.position);

    // Minecraft-style sky colors
    const dayColor = new THREE.Color(0x7BA4DB);     // Classic Minecraft day sky
    const sunsetColor = new THREE.Color(0xE8804C);  // Warm sunset orange
    const nightColor = new THREE.Color(0x1a1a2e);   // Brighter navy night (not pitch black)

    if (sunHeight > 0.15) {
      this.skyColor.copy(dayColor);
    } else if (sunHeight > -0.1) {
      const t = (sunHeight + 0.1) / 0.25;
      this.skyColor.lerpColors(nightColor, sunsetColor, Math.max(0, t));
      if (t > 0.6) {
        this.skyColor.lerpColors(sunsetColor, dayColor, (t - 0.6) / 0.4);
      }
    } else {
      this.skyColor.copy(nightColor);
    }

    // Underwater effect - tint everything blue with close fog
    if (this.player.isUnderwater) {
      const waterColor = new THREE.Color(0x2266aa);
      this.scene.background = waterColor;
      (this.scene.fog as THREE.Fog).color.copy(waterColor);
      (this.scene.fog as THREE.Fog).near = 1;
      (this.scene.fog as THREE.Fog).far = 40;
      this.sunLight.intensity *= 0.4;
      this.ambientLight.intensity = 0.2;
    } else {
      this.scene.background = this.skyColor;
      (this.scene.fog as THREE.Fog).color.copy(this.skyColor);
      // Push fog back at night for better visibility
      (this.scene.fog as THREE.Fog).near = this.isNight ? 60 : 60;
      (this.scene.fog as THREE.Fog).far = this.isNight ? 160 : 180;
    }
  }

  private updateEndLighting(): void {
    // The End has a dark void sky with a purplish tint
    const endSkyColor = new THREE.Color(0x0b0b14); // Very dark purple-black
    this.skyColor.copy(endSkyColor);
    this.scene.background = endSkyColor;

    // Dim ambient lighting with purple tint
    this.ambientLight.intensity = 0.4;
    this.ambientLight.color.setHex(0xb0a0c0); // Slight purple tint

    // No sun/moon in the End - just ambient from the void
    this.sunLight.intensity = 0;
    this.moonLight.intensity = 0.3; // Slight eerie glow

    // Stars always visible in the End
    (this.stars.material as THREE.PointsMaterial).opacity = 1.0;
    this.stars.position.copy(this.player.position);

    // Fog in the End - dark and mysterious
    (this.scene.fog as THREE.Fog).color.copy(endSkyColor);
    (this.scene.fog as THREE.Fog).near = 40;
    (this.scene.fog as THREE.Fog).far = 120;

    this.isNight = true; // Always night-like in The End
  }

  private updateTargetBlock(): void {
    const ray = this.world.raycast(
      this.player.camera.position,
      this.player.getForwardDirection()
    );

    if (ray.hit && ray.blockPos) {
      this.targetBlock = ray.blockPos;
      this.targetMesh.position.set(
        ray.blockPos.x + 0.5,
        ray.blockPos.y + 0.5,
        ray.blockPos.z + 0.5
      );
      this.targetMesh.visible = true;
    } else {
      this.targetBlock = null;
      this.targetMesh.visible = false;
    }
  }

  private updateFootsteps(deltaTime: number): void {
    const moved = this.player.position.distanceTo(this.lastPlayerPos);
    this.lastPlayerPos.copy(this.player.position);

    if (moved > 0.1 && !this.player.isDead) {
      this.lastFootstepTime += deltaTime;

      const footstepInterval = this.player.velocity.length() > 5 ? 0.3 : 0.5;

      if (this.lastFootstepTime > footstepInterval) {
        this.lastFootstepTime = 0;

        // Determine surface
        const groundY = Math.floor(this.player.position.y) - 1;
        const block = this.world.getBlock(
          Math.floor(this.player.position.x),
          groundY,
          Math.floor(this.player.position.z)
        );

        let surface: 'grass' | 'stone' | 'sand' | 'wood' = 'grass';
        if (block === BlockType.STONE || block === BlockType.COBBLESTONE) surface = 'stone';
        if (block === BlockType.SAND) surface = 'sand';
        if (block === BlockType.WOOD || block === BlockType.PLANKS) surface = 'wood';

        sound.playFootstep(surface);

        // Footstep particles
        const footPos = this.player.position.clone();
        footPos.y = Math.floor(this.player.position.y) + 0.1;
        const blockColor = BLOCKS[block]?.color || [100, 100, 100];
        this.particles.emitFootstep(footPos, blockColor as [number, number, number]);
      }
    }
  }

  private updateDebug(): void {
    const pos = this.player.position;
    const hours = Math.floor(this.dayTime * 24);
    const minutes = Math.floor((this.dayTime * 24 * 60) % 60);
    const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

    this.debugEl.innerHTML = `
      XYZ: ${pos.x.toFixed(1)} / ${pos.y.toFixed(1)} / ${pos.z.toFixed(1)}<br>
      Chunks: ${this.world.getChunkCount()}<br>
      Mobs: ${this.mobManager.getMobCount()}<br>
      Time: ${timeStr} ${this.isNight ? '🌙' : '☀️'}
    `;
  }

  private updateTorchParticles(deltaTime: number): void {
    this.torchParticleTime += deltaTime;

    // Emit particles every 0.15 seconds
    if (this.torchParticleTime >= 0.15) {
      this.torchParticleTime = 0;

      // Get torches within 32 blocks of player
      const nearbyTorches = this.world.getTorchPositionsNear(
        this.player.position.x,
        this.player.position.z,
        32
      );

      // Emit 1-2 particles per torch
      for (const torch of nearbyTorches) {
        const count = Math.random() < 0.5 ? 1 : 2;
        const position = new THREE.Vector3(
          torch.x + 0.5 + (Math.random() - 0.5) * 0.1,
          torch.y + 0.7,
          torch.z + 0.5 + (Math.random() - 0.5) * 0.1
        );

        // Random orange/yellow colors
        const colors: [number, number, number][] = [
          [255, 150, 50],  // Orange
          [255, 180, 60],  // Light orange
          [255, 200, 100], // Yellow-orange
        ];
        const color = colors[Math.floor(Math.random() * colors.length)];

        this.particles.emit(position, color, count, {
          upward: true,
          speed: 0.5,
          spread: 0.1,
          life: 0.6,
          size: 0.06,
          gravity: false,
        });
      }
    }
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);

    const deltaTime = Math.min(0.1, this.clock.getDelta());
    const elapsedTime = this.clock.elapsedTime; // Use property directly to avoid clock reset issues

    if (!this.gameStarted) {
      this.renderer.render(this.scene, this.player.camera);
      return;
    }

    // Update systems
    this.player.update(deltaTime);
    this.world.updateChunks(this.player.position.x, this.player.position.z);
    this.mobManager.update(deltaTime, this.player, this.isNight);
    this.updateDayNight(deltaTime);
    this.updateTargetBlock();
    this.updateMining(deltaTime);
    this.updateHealthHunger();
    this.updateFootsteps(deltaTime);
    this.particles.update(deltaTime);
    this.updateTorchParticles(deltaTime);
    this.world.updateTorchLights(elapsedTime);
    this.world.updateWater(elapsedTime, this.player.position);

    // Update hand
    const isMoving = this.player.velocity.length() > 0.5;
    const isRunning = this.player.velocity.length() > 5;
    this.hand.update(deltaTime, isMoving, isRunning);

    // Screen shake
    if (this.screenShake > 0) {
      this.screenShake -= deltaTime;
      const shakeAmount = this.screenShake * 0.1;
      this.player.camera.position.x += (Math.random() - 0.5) * shakeAmount;
      this.player.camera.position.y += (Math.random() - 0.5) * shakeAmount;
    }

    // Render main scene with post-processing (bloom)
    this.renderer.clear();
    this.composer.render();

    // Render HUD (hand) on top without post-processing
    this.renderer.clearDepth();
    this.renderer.render(this.hudScene, this.hudCamera);

    // Debug (throttled)
    if (Math.random() < 0.1) {
      this.updateDebug();
    }
  };
}

// Start the game
new Game();
