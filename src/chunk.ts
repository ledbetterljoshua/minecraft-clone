import * as THREE from 'three';
import { BlockType, BLOCKS } from './blocks';

export const CHUNK_SIZE = 32;
export const CHUNK_HEIGHT = 128;

// Direction vectors for block faces
const DIRECTIONS = [
  { dir: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], name: 'right' },
  { dir: [-1, 0, 0], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], name: 'left' },
  { dir: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], name: 'top' },
  { dir: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], name: 'bottom' },
  { dir: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], name: 'front' },
  { dir: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], name: 'back' },
];

export class Chunk {
  public blocks: Uint8Array;
  public mesh: THREE.Mesh | null = null;
  public waterMesh: THREE.Mesh | null = null;
  public torchGroup: THREE.Group | null = null;
  public torchPositions: { x: number; y: number; z: number }[] = [];
  public needsRebuild = true;
  public isGenerated = false;

  constructor(
    public readonly chunkX: number,
    public readonly chunkZ: number
  ) {
    this.blocks = new Uint8Array(CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE);
  }

  getBlockIndex(x: number, y: number, z: number): number {
    return y * CHUNK_SIZE * CHUNK_SIZE + z * CHUNK_SIZE + x;
  }

  getBlock(x: number, y: number, z: number): BlockType {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT || z < 0 || z >= CHUNK_SIZE) {
      return BlockType.AIR;
    }
    return this.blocks[this.getBlockIndex(x, y, z)];
  }

  setBlock(x: number, y: number, z: number, type: BlockType): void {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT || z < 0 || z >= CHUNK_SIZE) {
      return;
    }
    this.blocks[this.getBlockIndex(x, y, z)] = type;
    this.needsRebuild = true;
  }

  // Calculate ambient occlusion for a vertex
  private calculateAO(
    x: number, y: number, z: number,
    d1: [number, number, number],
    d2: [number, number, number],
    getBlock: (bx: number, by: number, bz: number) => BlockType
  ): number {
    const side1 = BLOCKS[getBlock(x + d1[0], y + d1[1], z + d1[2])].solid ? 1 : 0;
    const side2 = BLOCKS[getBlock(x + d2[0], y + d2[1], z + d2[2])].solid ? 1 : 0;
    const corner = BLOCKS[getBlock(x + d1[0] + d2[0], y + d1[1] + d2[1], z + d1[2] + d2[2])].solid ? 1 : 0;

    if (side1 && side2) {
      return 0; // Full occlusion
    }
    return 3 - (side1 + side2 + corner); // 0-3 scale
  }

  buildMesh(getNeighborBlock: (wx: number, wy: number, wz: number) => BlockType): void {
    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const uvs: number[] = [];
    const aos: number[] = [];
    const indices: number[] = [];

    const waterPositions: number[] = [];
    const waterNormals: number[] = [];
    const waterColors: number[] = [];
    const waterUvs: number[] = [];
    const waterIndices: number[] = [];

    const worldOffsetX = this.chunkX * CHUNK_SIZE;
    const worldOffsetZ = this.chunkZ * CHUNK_SIZE;

    // Reset torch positions
    this.torchPositions = [];

    // Helper to get block at world position
    const getBlockAt = (wx: number, wy: number, wz: number): BlockType => {
      const lx = wx - worldOffsetX;
      const lz = wz - worldOffsetZ;
      if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) {
        return getNeighborBlock(wx, wy, wz);
      }
      if (wy < 0 || wy >= CHUNK_HEIGHT) {
        return BlockType.AIR;
      }
      return this.getBlock(lx, wy, lz);
    };

    for (let y = 0; y < CHUNK_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const blockType = this.getBlock(x, y, z);
          if (blockType === BlockType.AIR) continue;

          // Track torch positions for special rendering
          if (blockType === BlockType.TORCH) {
            this.torchPositions.push({ x: worldOffsetX + x, y, z: worldOffsetZ + z });
            continue; // Don't add to regular mesh
          }

          const blockInfo = BLOCKS[blockType];
          const isWater = blockType === BlockType.WATER;
          const isGlowing = blockType === BlockType.GLOWSTONE || blockType === BlockType.MAGMA;

          const targetPositions = isWater ? waterPositions : positions;
          const targetNormals = isWater ? waterNormals : normals;
          const targetColors = isWater ? waterColors : colors;
          const targetUvs = isWater ? waterUvs : uvs;
          const targetIndices = isWater ? waterIndices : indices;

          const wx = worldOffsetX + x;
          const wz = worldOffsetZ + z;

          for (const { dir, corners, name } of DIRECTIONS) {
            const nx = x + dir[0];
            const ny = y + dir[1];
            const nz = z + dir[2];

            let neighborBlock: BlockType;
            if (nx < 0 || nx >= CHUNK_SIZE || nz < 0 || nz >= CHUNK_SIZE) {
              neighborBlock = getNeighborBlock(worldOffsetX + nx, ny, worldOffsetZ + nz);
            } else if (ny < 0 || ny >= CHUNK_HEIGHT) {
              neighborBlock = BlockType.AIR;
            } else {
              neighborBlock = this.getBlock(nx, ny, nz);
            }

            const neighborInfo = BLOCKS[neighborBlock];

            // Skip face if neighbor is solid and opaque (or same block type for water)
            if (isWater) {
              if (neighborBlock === BlockType.WATER) continue;
              if (neighborInfo.solid && !neighborInfo.transparent) continue;
            } else {
              if (neighborInfo.solid && !neighborInfo.transparent) continue;
            }

            // Get color based on face
            let color = blockInfo.color;
            if (name === 'top' && blockInfo.topColor) {
              color = blockInfo.topColor;
            } else if (name === 'bottom' && blockInfo.bottomColor) {
              color = blockInfo.bottomColor;
            }

            // Minecraft-style directional face lighting
            // This creates the classic blocky look with distinct brightness per face
            let lightMod = 1.0;
            if (name === 'top') lightMod = 1.0;           // Top faces are brightest
            if (name === 'left' || name === 'right') lightMod = 0.8;  // X-axis sides
            if (name === 'front' || name === 'back') lightMod = 0.9;  // Z-axis sides
            if (name === 'bottom') lightMod = 0.5;        // Bottom faces are darkest

            // Glowing blocks emit HDR light for bloom effect
            const emissiveBoost = isGlowing ? 2.0 : 0;

            // Calculate ambient occlusion for each corner
            let aoValues: number[] = [];
            if (!isWater) {
              // AO directions based on face
              const aoOffsets: [number, number, number][][] = [];
              if (name === 'top') {
                aoOffsets.push([[-1, 1, 0], [0, 1, -1]], [[1, 1, 0], [0, 1, -1]], [[1, 1, 0], [0, 1, 1]], [[-1, 1, 0], [0, 1, 1]]);
              } else if (name === 'bottom') {
                aoOffsets.push([[-1, -1, 0], [0, -1, 1]], [[1, -1, 0], [0, -1, 1]], [[1, -1, 0], [0, -1, -1]], [[-1, -1, 0], [0, -1, -1]]);
              } else if (name === 'front') {
                aoOffsets.push([[-1, 0, 1], [0, -1, 1]], [[1, 0, 1], [0, -1, 1]], [[1, 0, 1], [0, 1, 1]], [[-1, 0, 1], [0, 1, 1]]);
              } else if (name === 'back') {
                aoOffsets.push([[1, 0, -1], [0, -1, -1]], [[-1, 0, -1], [0, -1, -1]], [[-1, 0, -1], [0, 1, -1]], [[1, 0, -1], [0, 1, -1]]);
              } else if (name === 'right') {
                aoOffsets.push([[1, 0, -1], [1, -1, 0]], [[1, 0, 1], [1, -1, 0]], [[1, 0, 1], [1, 1, 0]], [[1, 0, -1], [1, 1, 0]]);
              } else if (name === 'left') {
                aoOffsets.push([[-1, 0, 1], [-1, -1, 0]], [[-1, 0, -1], [-1, -1, 0]], [[-1, 0, -1], [-1, 1, 0]], [[-1, 0, 1], [-1, 1, 0]]);
              }

              for (const [d1, d2] of aoOffsets) {
                const ao = this.calculateAO(wx, y, wz, d1, d2, getBlockAt);
                aoValues.push(ao);
              }
            } else {
              aoValues = [3, 3, 3, 3]; // No AO for water
            }

            const ndx = targetPositions.length / 3;

            // Minecraft-style procedural texture noise per block face
            // Creates subtle pixel-like variation within each face
            const blockSeed = wx * 73856093 ^ y * 19349663 ^ wz * 83492791;
            const faceVariation = ((blockSeed >> 8) & 0xFF) / 255 * 0.12 - 0.06;

            for (let i = 0; i < corners.length; i++) {
              const corner = corners[i];
              targetPositions.push(x + corner[0], y + corner[1], z + corner[2]);
              targetNormals.push(dir[0], dir[1], dir[2]);

              // Apply AO to color (0=dark, 3=bright)
              const aoFactor = isWater ? 1.0 : (0.5 + aoValues[i] / 6);
              const finalLight = lightMod * aoFactor;

              // For glowing blocks, push colors above 1.0 for HDR bloom
              // Add per-corner variation for more texture-like appearance
              const cornerSeed = (blockSeed + i * 12345) & 0xFFFF;
              const cornerVariation = (cornerSeed / 65535) * 0.06 - 0.03;
              const totalVariation = faceVariation + cornerVariation;

              const r = (color[0] / 255) * finalLight + totalVariation + emissiveBoost;
              const g = (color[1] / 255) * finalLight + totalVariation + emissiveBoost;
              const b = (color[2] / 255) * finalLight + totalVariation + emissiveBoost;

              targetColors.push(
                isGlowing ? r : Math.min(1, r),
                isGlowing ? g : Math.min(1, g),
                isGlowing ? b : Math.min(1, b)
              );

              // UV coordinates for potential texture mapping
              targetUvs.push(corner[0] === corner[2] ? corner[1] : corner[0], corner[1] === 0 ? 0 : 1);

              if (!isWater) {
                aos.push(aoValues[i] / 3);
              }
            }

            targetIndices.push(ndx, ndx + 1, ndx + 2, ndx, ndx + 2, ndx + 3);
          }
        }
      }
    }

    // Create solid mesh
    if (this.mesh) {
      this.mesh.geometry.dispose();
    }

    if (positions.length > 0) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setAttribute('ao', new THREE.Float32BufferAttribute(aos, 1));
      geometry.setIndex(indices);
      geometry.computeBoundingSphere();

      if (!this.mesh) {
        // MeshStandardMaterial with flat shading for blocky Minecraft look
        const material = new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 1.0,      // Fully rough for matte look
          metalness: 0.0,
          flatShading: true,   // Enable flat shading for crisp block edges
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(worldOffsetX, 0, worldOffsetZ);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
      } else {
        this.mesh.geometry = geometry;
      }
    } else {
      this.mesh = null;
    }

    // Create water mesh with improved material
    if (this.waterMesh) {
      this.waterMesh.geometry.dispose();
    }

    if (waterPositions.length > 0) {
      const waterGeometry = new THREE.BufferGeometry();
      waterGeometry.setAttribute('position', new THREE.Float32BufferAttribute(waterPositions, 3));
      waterGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(waterNormals, 3));
      waterGeometry.setAttribute('color', new THREE.Float32BufferAttribute(waterColors, 3));
      waterGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(waterUvs, 2));
      waterGeometry.setIndex(waterIndices);
      waterGeometry.computeBoundingSphere();

      if (!this.waterMesh) {
        const waterMaterial = new THREE.MeshStandardMaterial({
          vertexColors: true,
          transparent: true,
          opacity: 0.75,
          side: THREE.DoubleSide,
          roughness: 0.1,
          metalness: 0.3,
          envMapIntensity: 0.5,
        });
        this.waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
        this.waterMesh.position.set(worldOffsetX, 0, worldOffsetZ);
        this.waterMesh.receiveShadow = true;
      } else {
        this.waterMesh.geometry = waterGeometry;
      }
    } else {
      this.waterMesh = null;
    }

    this.needsRebuild = false;
  }

  dispose(): void {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
    }
    if (this.waterMesh) {
      this.waterMesh.geometry.dispose();
      (this.waterMesh.material as THREE.Material).dispose();
    }
    if (this.torchGroup) {
      this.torchGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      });
    }
  }
}
