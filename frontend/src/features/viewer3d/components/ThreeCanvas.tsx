import { Canvas } from '@react-three/fiber';
import type { FloorPlanElement, RackItem, FloorPlanEquipment } from '@/types/floorPlan';
import { FloorPlanScene } from './FloorPlanScene';
import { CameraControls } from './CameraControls';

interface ThreeCanvasProps {
  elements: FloorPlanElement[];
  racks: RackItem[];
  equipment: FloorPlanEquipment[];
  canvasWidth: number;
  canvasHeight: number;
}

/**
 * R3F Canvas wrapper for the 3D floor plan viewer.
 * Sets up lighting, camera, and renders the scene.
 */
export function ThreeCanvas({
  elements,
  racks,
  equipment,
  canvasWidth,
  canvasHeight,
}: ThreeCanvasProps) {
  // Position camera at a diagonal overview position
  const maxDim = Math.max(canvasWidth, canvasHeight);
  const cameraDistance = maxDim * 0.8;

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Canvas
        shadows
        camera={{
          position: [cameraDistance * 0.5, cameraDistance * 0.6, cameraDistance * 0.5],
          fov: 50,
          near: 1,
          far: maxDim * 10,
        }}
        style={{ background: '#f3f4f6' }}
      >
        {/* Ambient light for base illumination */}
        <ambientLight intensity={0.5} />

        {/* Directional light for shadows and depth */}
        <directionalLight
          position={[cameraDistance * 0.3, cameraDistance * 0.8, cameraDistance * 0.3]}
          intensity={0.8}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-maxDim}
          shadow-camera-right={maxDim}
          shadow-camera-top={maxDim}
          shadow-camera-bottom={-maxDim}
          shadow-camera-near={1}
          shadow-camera-far={maxDim * 5}
        />

        {/* Hemisphere light for natural ambient */}
        <hemisphereLight
          args={['#b1e1ff', '#b97a20', 0.3]}
        />

        <FloorPlanScene
          elements={elements}
          racks={racks}
          equipment={equipment}
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
        />

        <CameraControls />
      </Canvas>
    </div>
  );
}
