import { useMemo } from 'react';
import type { RackItem } from '@/types/floorPlan';
import { useImageTexture } from '../utils/textureLoader';
import { DEFAULT_RACK_HEIGHT } from '../utils/meshBuilder';

interface RackMeshProps {
  rack: RackItem;
  canvasWidth: number;
  canvasHeight: number;
}

/**
 * Renders a rack as a 3D box with optional front/rear photo textures.
 * Label with rack name displayed on top is omitted for simplicity
 * (Three.js text rendering requires additional font loading).
 */
export function RackMesh({ rack, canvasWidth, canvasHeight }: RackMeshProps) {
  const height3d = rack.height3d ?? DEFAULT_RACK_HEIGHT;
  const worldX = rack.positionX + rack.width / 2 - canvasWidth / 2;
  const worldZ = rack.positionY + rack.height / 2 - canvasHeight / 2;
  const worldY = height3d / 2;
  const rotationY = -(rack.rotation * Math.PI) / 180;

  const frontTexture = useImageTexture(rack.frontImageUrl);
  const rearTexture = useImageTexture(rack.rearImageUrl);

  // Build materials array for each face of the box:
  // Order: +X (right), -X (left), +Y (top), -Y (bottom), +Z (front), -Z (back)
  const materials = useMemo(() => {
    const sideMat = { color: '#374151' as const };
    const topMat = { color: '#4b5563' as const };

    return { sideMat, topMat };
  }, []);

  return (
    <mesh
      position={[worldX, worldY, worldZ]}
      rotation={[0, rotationY, 0]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[rack.width, height3d, rack.height]} />
      {/* Right face */}
      <meshStandardMaterial attach="material-0" color={materials.sideMat.color} />
      {/* Left face */}
      <meshStandardMaterial attach="material-1" color={materials.sideMat.color} />
      {/* Top face */}
      <meshStandardMaterial attach="material-2" color={materials.topMat.color} />
      {/* Bottom face */}
      <meshStandardMaterial attach="material-3" color={materials.sideMat.color} />
      {/* Front face (+Z) */}
      <meshStandardMaterial
        attach="material-4"
        color={frontTexture ? '#ffffff' : '#374151'}
        map={frontTexture ?? undefined}
      />
      {/* Rear face (-Z) */}
      <meshStandardMaterial
        attach="material-5"
        color={rearTexture ? '#ffffff' : '#374151'}
        map={rearTexture ?? undefined}
      />
    </mesh>
  );
}
