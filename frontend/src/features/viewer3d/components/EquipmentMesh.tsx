import type { EquipmentItem } from '@/types/floorPlan';
import { useImageTexture } from '../utils/textureLoader';

const CATEGORY_COLORS: Record<string, string> = {
  SERVER: '#3b82f6',
  NETWORK: '#22c55e',
  STORAGE: '#a855f7',
  POWER: '#ef4444',
  SECURITY: '#f97316',
  OTHER: '#6b7280',
};

const DEFAULT_EQUIPMENT_HEIGHT = 50;

interface EquipmentMeshProps {
  equipment: EquipmentItem;
  canvasWidth: number;
  canvasHeight: number;
}

/**
 * Renders equipment as a smaller 3D box, color-coded by category.
 * Applies front/rear photo textures when available.
 */
export function EquipmentMesh({ equipment, canvasWidth, canvasHeight }: EquipmentMeshProps) {
  const height3d = equipment.height3d ?? DEFAULT_EQUIPMENT_HEIGHT;
  const worldX = equipment.positionX + equipment.width2d / 2 - canvasWidth / 2;
  const worldZ = equipment.positionY + equipment.height2d / 2 - canvasHeight / 2;
  const worldY = height3d / 2;
  const rotationY = -(equipment.rotation * Math.PI) / 180;

  const baseColor = CATEGORY_COLORS[equipment.category] ?? CATEGORY_COLORS.OTHER;

  const frontTexture = useImageTexture(equipment.frontImageUrl ?? null);
  const rearTexture = useImageTexture(equipment.rearImageUrl ?? null);

  return (
    <mesh
      position={[worldX, worldY, worldZ]}
      rotation={[0, rotationY, 0]}
      castShadow
    >
      <boxGeometry args={[equipment.width2d, height3d, equipment.height2d]} />
      {/* Right */}
      <meshStandardMaterial attach="material-0" color={baseColor} />
      {/* Left */}
      <meshStandardMaterial attach="material-1" color={baseColor} />
      {/* Top */}
      <meshStandardMaterial attach="material-2" color={baseColor} />
      {/* Bottom */}
      <meshStandardMaterial attach="material-3" color={baseColor} />
      {/* Front (+Z) */}
      <meshStandardMaterial
        attach="material-4"
        color={frontTexture ? '#ffffff' : baseColor}
        map={frontTexture ?? undefined}
      />
      {/* Rear (-Z) */}
      <meshStandardMaterial
        attach="material-5"
        color={rearTexture ? '#ffffff' : baseColor}
        map={rearTexture ?? undefined}
      />
    </mesh>
  );
}
