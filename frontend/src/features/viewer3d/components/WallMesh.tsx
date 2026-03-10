import { useMemo } from 'react';
import type { LineProperties } from '@/types/floorPlan';
import { createWallSegmentGeometry, DEFAULT_WALL_HEIGHT } from '../utils/meshBuilder';

interface WallMeshProps {
  properties: LineProperties;
  canvasWidth: number;
  canvasHeight: number;
}

/**
 * Renders a line element as extruded 3D walls.
 * Each consecutive pair of points creates a wall segment.
 */
export function WallMesh({ properties, canvasWidth, canvasHeight }: WallMeshProps) {
  const { points, strokeWidth, strokeColor } = properties;
  const wallHeight = DEFAULT_WALL_HEIGHT;
  const wallThickness = Math.max(strokeWidth * 5, 10);

  const segments = useMemo(() => {
    const segs: Array<{
      key: string;
      position: [number, number, number];
      size: [number, number, number];
      rotationY: number;
    }> = [];

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const { position, rotationY } = createWallSegmentGeometry(
        p1,
        p2,
        wallThickness,
        wallHeight,
        canvasWidth,
        canvasHeight
      );

      const dx = p2[0] - p1[0];
      const dz = p2[1] - p1[1];
      const length = Math.sqrt(dx * dx + dz * dz);

      segs.push({
        key: `wall-${i}`,
        position: [position.x, position.y, position.z],
        size: [length, wallHeight, wallThickness],
        rotationY,
      });
    }

    return segs;
  }, [points, wallThickness, wallHeight, canvasWidth, canvasHeight]);

  return (
    <group>
      {segments.map((seg) => (
        <mesh
          key={seg.key}
          position={seg.position}
          rotation={[0, seg.rotationY, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={seg.size} />
          <meshStandardMaterial color={strokeColor} />
        </mesh>
      ))}
    </group>
  );
}
