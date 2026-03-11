import type {
  FloorPlanElement,
  RackItem,
  FloorPlanEquipment,
  LineProperties,
  RectProperties,
  CircleProperties,
  DoorProperties,
  WindowProperties,
} from '@/types/floorPlan';
import { FloorMesh } from './FloorMesh';
import { WallMesh } from './WallMesh';
import { ObjectMesh } from './ObjectMesh';
import { RackMesh } from './RackMesh';
import { EquipmentMesh } from './EquipmentMesh';

interface FloorPlanSceneProps {
  elements: FloorPlanElement[];
  racks: RackItem[];
  equipment: FloorPlanEquipment[];
  canvasWidth: number;
  canvasHeight: number;
}

/**
 * Scene orchestrator that iterates over floor plan elements
 * and renders appropriate 3D mesh components for each.
 */
export function FloorPlanScene({
  elements,
  racks,
  equipment,
  canvasWidth,
  canvasHeight,
}: FloorPlanSceneProps) {
  const visibleElements = elements.filter((el) => el.isVisible);

  return (
    <group>
      <FloorMesh canvasWidth={canvasWidth} canvasHeight={canvasHeight} />

      {visibleElements.map((element) => {
        switch (element.elementType) {
          case 'line':
            return (
              <WallMesh
                key={element.id}
                properties={element.properties as LineProperties}
                canvasWidth={canvasWidth}
                canvasHeight={canvasHeight}
              />
            );

          case 'rect':
            return (
              <ObjectMesh
                key={element.id}
                type="rect"
                properties={element.properties as RectProperties}
                canvasWidth={canvasWidth}
                canvasHeight={canvasHeight}
              />
            );

          case 'circle':
            return (
              <ObjectMesh
                key={element.id}
                type="circle"
                properties={element.properties as CircleProperties}
                canvasWidth={canvasWidth}
                canvasHeight={canvasHeight}
              />
            );

          case 'door': {
            // Render door as a shorter wall segment (door frame)
            const doorProps = element.properties as DoorProperties;
            const height3d = doorProps.height3d ?? 210;
            const elevation = doorProps.elevation3d ?? 0;
            const worldX = doorProps.x + doorProps.width / 2 - canvasWidth / 2;
            const worldZ = doorProps.y + doorProps.height / 2 - canvasHeight / 2;
            const worldY = elevation + height3d / 2;
            const rotationY = -(doorProps.rotation * Math.PI) / 180;

            return (
              <mesh
                key={element.id}
                position={[worldX, worldY, worldZ]}
                rotation={[0, rotationY, 0]}
              >
                <boxGeometry args={[doorProps.width, height3d, doorProps.height]} />
                <meshStandardMaterial
                  color={doorProps.strokeColor}
                  transparent
                  opacity={0.3}
                />
              </mesh>
            );
          }

          case 'window': {
            // Render window as a transparent glass panel
            const winProps = element.properties as WindowProperties;
            const height3d = winProps.height3d ?? 120;
            const elevation = winProps.elevation3d ?? 100;
            const worldX = winProps.x + winProps.width / 2 - canvasWidth / 2;
            const worldZ = winProps.y + winProps.height / 2 - canvasHeight / 2;
            const worldY = elevation + height3d / 2;
            const rotationY = -(winProps.rotation * Math.PI) / 180;

            return (
              <mesh
                key={element.id}
                position={[worldX, worldY, worldZ]}
                rotation={[0, rotationY, 0]}
              >
                <boxGeometry args={[winProps.width, height3d, winProps.height]} />
                <meshStandardMaterial
                  color="#87ceeb"
                  transparent
                  opacity={0.4}
                />
              </mesh>
            );
          }

          case 'text':
            // Text elements are 2D-only, skip in 3D view
            return null;

          default:
            return null;
        }
      })}

      {racks.map((rack) => (
        <RackMesh
          key={rack.id}
          rack={rack}
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
        />
      ))}

      {equipment.map((eq) => (
        <EquipmentMesh
          key={eq.id}
          equipment={eq}
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
        />
      ))}
    </group>
  );
}
