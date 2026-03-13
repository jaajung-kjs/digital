import type { FloorPlanEquipment } from '@/types/floorPlan';
import { useImageTexture } from '../utils/textureLoader';

const CATEGORY_COLORS: Record<string, string> = {
  NETWORK: '#22c55e',
  CHARGER: '#f97316',
  UPS: '#ef4444',
  DISTRIBUTION_BOARD: '#a855f7',
  OFD: '#3b82f6',
};

const DEFAULT_EQUIPMENT_HEIGHT = 50;

interface EquipmentMeshProps {
  equipment: FloorPlanEquipment;
  canvasWidth: number;
  canvasHeight: number;
}

/**
 * Renders equipment as a 3D box, color-coded by category.
 * Applies front/rear photo textures when available.
 */
export function EquipmentMesh({ equipment, canvasWidth, canvasHeight }: EquipmentMeshProps) {
  const height3d = (equipment as FloorPlanEquipment & { height3d?: number }).height3d ?? DEFAULT_EQUIPMENT_HEIGHT;
  const worldX = equipment.positionX + equipment.width / 2 - canvasWidth / 2;
  const worldZ = equipment.positionY + equipment.height / 2 - canvasHeight / 2;
  const worldY = height3d / 2;
  const rotationY = -(equipment.rotation * Math.PI) / 180;

  const baseColor = CATEGORY_COLORS[equipment.category] ?? '#6b7280';

  const frontTexture = useImageTexture(equipment.frontImageUrl ?? null);
  const rearTexture = useImageTexture(equipment.rearImageUrl ?? null);

  return (
    <mesh
      position={[worldX, worldY, worldZ]}
      rotation={[0, rotationY, 0]}
      castShadow
    >
      <boxGeometry args={[equipment.width, height3d, equipment.height]} />
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
