import { OrbitControls } from '@react-three/drei';

/**
 * Camera controls wrapper using OrbitControls from drei.
 * Provides orbit, pan, and zoom with reasonable constraints.
 */
export function CameraControls() {
  return (
    <OrbitControls
      enableDamping
      dampingFactor={0.1}
      minDistance={50}
      maxDistance={5000}
      maxPolarAngle={Math.PI / 2 - 0.05}
      makeDefault
    />
  );
}
