/**
 * Connection overlay renderer for cable connections on the floor plan canvas.
 */
import { formatCableLength } from '../../../utils/cable/pathLength';

export interface ConnectionRenderContext {
  ctx: CanvasRenderingContext2D;
  zoom: number;
  panX: number;
  panY: number;
  selectedCableId?: string | null;
}

export interface RenderableConnection {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  cableType: string;
  label?: string;
  color: string;
  highlighted?: boolean;
  /** Cable ID for hit-testing */
  id?: string;
  /** Path waypoints. 없으면 source→target 2점 직선으로 렌더. */
  pathPoints?: [number, number][];
  /** Path length details for hover display */
  pathLength?: number | null;
  totalLength?: number | null;
  /** Material category code from DB (used for filtering) */
  materialCategoryCode?: string | null;
  /** Internal flag: set by renderConnections when cable is selected */
  _selected?: boolean;
}

/**
 * 케이블이 도면에서 점유하는 경로 — pathPoints 가 있으면 그대로, 없으면 source→target 2점 직선.
 * 렌더(drawConnection)와 히트테스트(ConnectionOverlay)가 **같은** 경로를 쓰도록 단일 소스로 둔다.
 * (분기 시: 그려진 선과 클릭 가능한 선이 달라져 "보이는데 클릭 안 되는" 버그가 재발하지 않게.)
 */
export function pathOf(conn: RenderableConnection): [number, number][] {
  return conn.pathPoints && conn.pathPoints.length >= 2
    ? conn.pathPoints
    : [
        [conn.sourceX, conn.sourceY],
        [conn.targetX, conn.targetY],
      ];
}

/** Draw a connection as a polyline through `points` (직선 = 2점 polyline). */
function drawConnection(
  ctx: CanvasRenderingContext2D,
  conn: RenderableConnection,
  points: [number, number][],
): void {
  const tracePath = () => {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.stroke();
  };

  if (conn.highlighted) {
    ctx.save();
    ctx.shadowColor = conn.color;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = conn.color;
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.4;
    tracePath();
    ctx.restore();
  }

  const isSelected = conn._selected;
  ctx.strokeStyle = conn.color;
  ctx.lineWidth = isSelected ? 3.5 : 2;
  ctx.globalAlpha = 1;
  if (isSelected) {
    ctx.shadowColor = conn.color;
    ctx.shadowBlur = 8;
  }
  tracePath();
  if (isSelected) {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }

  // 양 끝 마커 + 중간 waypoint 마커 (2점 직선이면 중간점 없음 → 루프 무동작).
  ctx.fillStyle = conn.color;
  ctx.beginPath();
  ctx.arc(points[0][0], points[0][1], 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(points[points.length - 1][0], points[points.length - 1][1], 4, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 1; i < points.length - 1; i++) {
    ctx.fillRect(points[i][0] - 2, points[i][1] - 2, 4, 4);
  }
}

/** Draw cable type label at the path midpoint. */
function drawConnectionLabel(
  ctx: CanvasRenderingContext2D,
  conn: RenderableConnection,
  points: [number, number][],
): void {
  const mid = Math.floor(points.length / 2);
  const even = points.length % 2 === 0;
  const midX = even ? (points[mid - 1][0] + points[mid][0]) / 2 : points[mid][0];
  const midY = even ? (points[mid - 1][1] + points[mid][1]) / 2 : points[mid][1];

  let text = conn.label || conn.materialCategoryCode || '';
  if (conn.totalLength != null) {
    // totalLength 는 cm. 표/캔버스 공통 포맷(formatCableLength)으로 단위 일치.
    text += ` (${formatCableLength(conn.totalLength)})`;
  }

  ctx.font = '11px sans-serif';
  const metrics = ctx.measureText(text);
  const padding = 4;
  const bgWidth = metrics.width + padding * 2;
  const bgHeight = 16;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.beginPath();
  ctx.roundRect(midX - bgWidth / 2, midY - bgHeight / 2, bgWidth, bgHeight, 4);
  ctx.fill();

  ctx.strokeStyle = conn.color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(midX - bgWidth / 2, midY - bgHeight / 2, bgWidth, bgHeight, 4);
  ctx.stroke();

  ctx.fillStyle = conn.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, midX, midY);
}

/** Render all connections overlay on the canvas */
export function renderConnections(
  context: ConnectionRenderContext,
  connections: RenderableConnection[],
): void {
  const { ctx, zoom, panX, panY, selectedCableId } = context;
  if (connections.length === 0) return;

  ctx.save();
  const scale = zoom / 100;
  ctx.setTransform(scale, 0, 0, scale, panX, panY);

  // Mark/unmark selected cable. selectedCableId 가 null 로 바뀌었을 때도
  // 직전 프레임에 남은 _selected = true 플래그가 stale 로 남지 않도록 항상 갱신.
  for (const conn of connections) {
    conn._selected = !!selectedCableId && conn.id === selectedCableId;
  }

  // 라벨이 모든 연결선 위에 오도록 두 패스로 그린다.
  const paths = connections.map(pathOf);
  connections.forEach((conn, i) => drawConnection(ctx, conn, paths[i]));
  connections.forEach((conn, i) => drawConnectionLabel(ctx, conn, paths[i]));

  ctx.restore();
}
