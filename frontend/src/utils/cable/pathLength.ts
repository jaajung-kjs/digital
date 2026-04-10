/**
 * Calculate path length from pixel coordinates and scale ratio.
 */
export function calculatePathLength(
  points: [number, number][],
  scaleRatio: number // 1px = ?mm
): { pathLength: number; bufferLength: number; totalLength: number } {
  let pixelLength = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i - 1][0];
    const dy = points[i][1] - points[i - 1][1];
    pixelLength += Math.sqrt(dx * dx + dy * dy);
  }
  const meters = (pixelLength * scaleRatio) / 1000; // mm -> m
  const pathLength = Math.ceil(meters); // round up to 1m
  const bufferLength = 4; // 출발 2m + 도착 2m
  const totalLength = pathLength + bufferLength;
  return { pathLength, bufferLength, totalLength };
}
