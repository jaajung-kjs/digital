import type { RectProperties, CircleProperties } from '@/types/floorPlan';
import { DEFAULT_OBJECT_HEIGHT } from '../utils/meshBuilder';

interface RectMeshProps {
  type: 'rect';
  properties: RectProperties;
  canvasWidth: number;
  canvasHeight: number;
}

interface CircleMeshProps {
  type: 'circle';
  properties: CircleProperties;
  canvasWidth: number;
  canvasHeight: number;
}

type ObjectMeshProps = RectMeshProps | CircleMeshProps;

/**
 * Renders a rect or circle element as an extruded 3D object.
 * Rect -> BoxGeometry, Circle -> CylinderGeometry.
 */
export function ObjectMesh(props: ObjectMeshProps) {
  const { type, canvasWidth, canvasHeight } = props;

  if (type === 'rect') {
    const p = props.properties;
    const height3d = p.height3d ?? DEFAULT_OBJECT_HEIGHT;
    const elevation = p.elevation3d ?? 0;
    const worldX = p.x + p.width / 2 - canvasWidth / 2;
    const worldZ = p.y + p.height / 2 - canvasHeight / 2;
    const worldY = elevation + height3d / 2;
    const rotationY = -(p.rotation * Math.PI) / 180;

    const fillColor = p.fillColor === 'transparent' ? '#9ca3af' : p.fillColor;

    return (
      <mesh
        position={[worldX, worldY, worldZ]}
        rotation={[0, rotationY, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[p.width, height3d, p.height]} />
        <meshStandardMaterial color={fillColor} />
      </mesh>
    );
  }

  // Circle
  const p = props.properties;
  const height3d = DEFAULT_OBJECT_HEIGHT;
  const worldX = p.cx - canvasWidth / 2;
  const worldZ = p.cy - canvasHeight / 2;
  const worldY = height3d / 2;

  const fillColor = p.fillColor === 'transparent' ? '#9ca3af' : p.fillColor;

  return (
    <mesh
      position={[worldX, worldY, worldZ]}
      castShadow
      receiveShadow
    >
      <cylinderGeometry args={[p.radius, p.radius, height3d, 32]} />
      <meshStandardMaterial color={fillColor} />
    </mesh>
  );
}
