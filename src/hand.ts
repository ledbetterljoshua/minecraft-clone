import * as THREE from 'three';

export class FirstPersonHand {
  public group: THREE.Group;
  private hand: THREE.Mesh;
  private tool: THREE.Group | null = null;

  private bobPhase = 0;
  private swingPhase = 0;
  private isSwinging = false;
  private miningProgress = 0;

  private basePosition = new THREE.Vector3(0.4, -0.35, -0.5);
  private baseRotation = new THREE.Euler(-0.2, -0.3, 0);

  constructor() {
    this.group = new THREE.Group();

    // Hand (skin colored arm)
    const handGeom = new THREE.BoxGeometry(0.15, 0.4, 0.15);
    const handMat = new THREE.MeshLambertMaterial({ color: 0xd4a574 });
    this.hand = new THREE.Mesh(handGeom, handMat);
    this.hand.position.set(0, 0, 0);
    this.group.add(this.hand);

    this.group.position.copy(this.basePosition);
    this.group.rotation.copy(this.baseRotation);
  }

  setTool(toolType: 'none' | 'sword' | 'pickaxe' | 'block', blockColor?: number): void {
    // Remove old tool
    if (this.tool) {
      this.group.remove(this.tool);
      this.tool.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      });
      this.tool = null;
    }

    if (toolType === 'none') return;

    this.tool = new THREE.Group();

    if (toolType === 'sword') {
      // Sword handle
      const handleGeom = new THREE.BoxGeometry(0.05, 0.2, 0.05);
      const handleMat = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
      const handle = new THREE.Mesh(handleGeom, handleMat);
      handle.position.set(0, 0.1, 0);
      this.tool.add(handle);

      // Sword guard
      const guardGeom = new THREE.BoxGeometry(0.15, 0.03, 0.05);
      const guardMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
      const guard = new THREE.Mesh(guardGeom, guardMat);
      guard.position.set(0, 0.2, 0);
      this.tool.add(guard);

      // Sword blade
      const bladeGeom = new THREE.BoxGeometry(0.06, 0.5, 0.02);
      const bladeMat = new THREE.MeshLambertMaterial({ color: 0xcccccc });
      const blade = new THREE.Mesh(bladeGeom, bladeMat);
      blade.position.set(0, 0.5, 0);
      this.tool.add(blade);

      this.tool.position.set(0.05, 0.2, 0);
      this.tool.rotation.set(0, 0, -0.3);
    } else if (toolType === 'pickaxe') {
      // Handle
      const handleGeom = new THREE.BoxGeometry(0.05, 0.5, 0.05);
      const handleMat = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
      const handle = new THREE.Mesh(handleGeom, handleMat);
      handle.position.set(0, 0.15, 0);
      this.tool.add(handle);

      // Pick head
      const headGeom = new THREE.BoxGeometry(0.25, 0.08, 0.05);
      const headMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
      const head = new THREE.Mesh(headGeom, headMat);
      head.position.set(0, 0.45, 0);
      this.tool.add(head);

      // Pick points
      const pointGeom = new THREE.BoxGeometry(0.04, 0.15, 0.04);
      const point1 = new THREE.Mesh(pointGeom, headMat);
      point1.position.set(-0.1, 0.5, 0);
      point1.rotation.z = 0.3;
      this.tool.add(point1);

      const point2 = new THREE.Mesh(pointGeom, headMat);
      point2.position.set(0.1, 0.5, 0);
      point2.rotation.z = -0.3;
      this.tool.add(point2);

      this.tool.position.set(0.05, 0.15, 0);
      this.tool.rotation.set(0.2, 0, -0.4);
    } else if (toolType === 'block') {
      // Block in hand
      const blockGeom = new THREE.BoxGeometry(0.2, 0.2, 0.2);
      const blockMat = new THREE.MeshLambertMaterial({ color: blockColor || 0x888888 });
      const block = new THREE.Mesh(blockGeom, blockMat);
      this.tool.add(block);
      this.tool.position.set(0.05, 0.2, 0);
    }

    if (this.tool) {
      this.group.add(this.tool);
    }
  }

  swing(): void {
    if (!this.isSwinging) {
      this.isSwinging = true;
      this.swingPhase = 0;
    }
  }

  setMiningProgress(progress: number): void {
    this.miningProgress = progress;
  }

  update(deltaTime: number, isMoving: boolean, isRunning: boolean): void {
    // Walking bob
    if (isMoving) {
      const bobSpeed = isRunning ? 15 : 10;
      this.bobPhase += deltaTime * bobSpeed;
    } else {
      // Subtle idle bob
      this.bobPhase += deltaTime * 2;
    }

    const bobAmount = isMoving ? (isRunning ? 0.04 : 0.025) : 0.005;
    const bobX = Math.sin(this.bobPhase) * bobAmount * 0.5;
    const bobY = Math.abs(Math.sin(this.bobPhase * 2)) * bobAmount;

    // Swing animation
    let swingRotation = 0;
    if (this.isSwinging) {
      this.swingPhase += deltaTime * 12;
      if (this.swingPhase < Math.PI) {
        swingRotation = Math.sin(this.swingPhase) * 1.2;
      } else {
        this.isSwinging = false;
        this.swingPhase = 0;
      }
    }

    // Mining animation
    let miningRotation = 0;
    if (this.miningProgress > 0) {
      miningRotation = Math.sin(performance.now() * 0.02) * 0.3;
    }

    // Apply transformations
    this.group.position.set(
      this.basePosition.x + bobX,
      this.basePosition.y + bobY,
      this.basePosition.z
    );

    this.group.rotation.set(
      this.baseRotation.x - swingRotation - miningRotation,
      this.baseRotation.y,
      this.baseRotation.z
    );
  }
}
