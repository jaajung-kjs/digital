interface FloorMeshProps {
  canvasWidth: number;
  canvasHeight: number;
}

/**
 * Floor plane rendered at y=0.
 * Light gray material, receives shadows.
 */
export function FloorMesh({ canvasWidth, canvasHeight }: FloorMeshProps) {
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0, 0]}
      receiveShadow
    >
      <planeGeometry args={[canvasWidth, canvasHeight]} />
      <meshStandardMaterial color="#e5e7eb" side={2} />
    </mesh>
  );
}
