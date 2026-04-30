/**
 * Calculate cable path length from canvas coordinates.
 *
 * CM-B: 캔버스 좌표는 cm 단위 (1 unit = 1 cm). 따라서 점 사이 거리 합 자체가
 * cable 의 cm 길이. m 환산은 호출자가 ÷100. buffer 는 출발/도착 양 끝의
 * 여유분 — 예전 px 시절엔 4(px) 였으나 cm 단위에서도 같은 4 를 cm 로 본다
 * (≈ 4 cm 짧음 — 후속 CM-C 에서 50~100 cm 로 조정 예정).
 */
export function calculatePathLength(
  points: [number, number][] | number[][],
): { pathLength: number; bufferLength: number; totalLength: number } {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i - 1][0];
    const dy = points[i][1] - points[i - 1][1];
    length += Math.hypot(dx, dy);
  }
  const pathLength = Math.round(length); // cm, 정수 반올림
  const bufferLength = 4; // cm, 출발+도착 여유
  const totalLength = pathLength + bufferLength;
  return { pathLength, bufferLength, totalLength };
}
