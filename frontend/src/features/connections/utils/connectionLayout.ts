/**
 * Cable path auto-routing utilities.
 * Calculates curved paths between equipment, avoiding overlaps when possible.
 */

export interface EquipmentPosition {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Calculate connection anchor point on the edge of an equipment rectangle
 * facing toward the target position.
 */
export function getConnectionAnchor(
  equipment: EquipmentPosition,
  targetX: number,
  targetY: number
): { x: number; y: number } {
  const cx = equipment.x + equipment.width / 2;
  const cy = equipment.y + equipment.height / 2;

  const dx = targetX - cx;
  const dy = targetY - cy;

  if (dx === 0 && dy === 0) {
    return { x: cx, y: cy };
  }

  const halfW = equipment.width / 2;
  const halfH = equipment.height / 2;

  // Determine which edge the line from center to target intersects
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  if (absDx * halfH > absDy * halfW) {
    // Intersects left or right edge
    const sign = dx > 0 ? 1 : -1;
    return {
      x: cx + sign * halfW,
      y: cy + (dy / absDx) * halfW,
    };
  } else {
    // Intersects top or bottom edge
    const sign = dy > 0 ? 1 : -1;
    return {
      x: cx + (dx / absDy) * halfH,
      y: cy + sign * halfH,
    };
  }
}

/**
 * Check if a point is inside an equipment bounding box (with padding).
 */
function isInsideEquipment(
  x: number,
  y: number,
  eq: EquipmentPosition,
  padding = 10
): boolean {
  return (
    x >= eq.x - padding &&
    x <= eq.x + eq.width + padding &&
    y >= eq.y - padding &&
    y <= eq.y + eq.height + padding
  );
}

/**
 * Calculate a curved cable path between two equipment positions.
 * Returns an array of [x, y] control points for the path.
 * Attempts to route around other equipment when possible.
 */
export function calculateCablePath(
  source: EquipmentPosition,
  target: EquipmentPosition,
  allEquipment: EquipmentPosition[]
): [number, number][] {
  const sourceCx = source.x + source.width / 2;
  const sourceCy = source.y + source.height / 2;
  const targetCx = target.x + target.width / 2;
  const targetCy = target.y + target.height / 2;

  // Get anchor points on equipment edges
  const start = getConnectionAnchor(source, targetCx, targetCy);
  const end = getConnectionAnchor(target, sourceCx, sourceCy);

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Simple curve offset based on distance
  const curveOffset = Math.min(distance * 0.3, 80);

  // Default control points for a smooth bezier
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;

  // Check if midpoint collides with any other equipment
  const obstacles = allEquipment.filter(
    (eq) => eq.id !== source.id && eq.id !== target.id
  );

  let cp1x = midX;
  let cp1y = midY - curveOffset;

  const hasCollision = obstacles.some((eq) =>
    isInsideEquipment(midX, midY, eq)
  );

  if (hasCollision) {
    // Route around by pushing control point further
    const perpX = -dy / distance;
    const perpY = dx / distance;
    const pushDistance = curveOffset * 2;
    cp1x = midX + perpX * pushDistance;
    cp1y = midY + perpY * pushDistance;
  }

  return [
    [start.x, start.y],
    [cp1x, cp1y],
    [end.x, end.y],
  ];
}
