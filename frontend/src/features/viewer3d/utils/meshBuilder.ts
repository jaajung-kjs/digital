import * as THREE from 'three';

/**
 * Convert 2D canvas coordinates to 3D world positions.
 * 2D canvas: origin at top-left, Y increases downward.
 * 3D world: Y is up, origin at center of floor plane.
 */
export function canvasToWorld(
  x: number,
  y: number,
  canvasWidth: number,
  canvasHeight: number
): [number, number, number] {
  const worldX = x - canvasWidth / 2;
  const worldZ = y - canvasHeight / 2;
  return [worldX, 0, worldZ];
}

/**
 * Create a wall geometry from a pair of 2D line segment endpoints.
 * The wall is a box oriented along the segment direction with the given width (thickness) and height.
 */
export function createWallSegmentGeometry(
  p1: [number, number],
  p2: [number, number],
  width: number,
  height: number,
  canvasWidth: number,
  canvasHeight: number
): { geometry: THREE.BoxGeometry; position: THREE.Vector3; rotationY: number } {
  const dx = p2[0] - p1[0];
  const dz = p2[1] - p1[1];
  const length = Math.sqrt(dx * dx + dz * dz);

  if (length < 0.01) {
    return {
      geometry: new THREE.BoxGeometry(1, height, 1),
      position: new THREE.Vector3(
        p1[0] - canvasWidth / 2,
        height / 2,
        p1[1] - canvasHeight / 2
      ),
      rotationY: 0,
    };
  }

  const angle = Math.atan2(dz, dx);
  const midX = (p1[0] + p2[0]) / 2 - canvasWidth / 2;
  const midZ = (p1[1] + p2[1]) / 2 - canvasHeight / 2;

  return {
    geometry: new THREE.BoxGeometry(length, height, width),
    position: new THREE.Vector3(midX, height / 2, midZ),
    rotationY: -angle,
  };
}

/**
 * Scale factor for 2D pixels to 3D units.
 * Using 1:1 mapping (1 px = 1 unit) keeps things simple.
 */
export const SCALE = 1;

/**
 * Default wall height in 3D units (px).
 */
export const DEFAULT_WALL_HEIGHT = 280;

/**
 * Default rack height in 3D units.
 */
export const DEFAULT_RACK_HEIGHT = 200;

/**
 * Default object extrusion height.
 */
export const DEFAULT_OBJECT_HEIGHT = 100;
