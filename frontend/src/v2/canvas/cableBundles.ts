export interface Point {
  x: number;
  y: number;
}

export interface CableLine {
  id: string;
  categoryId: string | null;
  color: string;
  points: Point[];
  selected: boolean;
}

export interface CableBundle {
  /** 이 묶음을 대표하는 케이블(선택·히트테스트 기준). */
  id: string;
  color: string;
  /** 겹치는 묶음끼리 어긋나게 그린 뒤의 점들. */
  points: Point[];
  /** 묶인 케이블 수 — 2 이상이면 선 위에 ×N 을 적는다. */
  count: number;
  selected: boolean;
}

/** 같은 자리에 겹친 묶음들을 서로 떼어 놓는 간격(월드 단위). */
const BUNDLE_GAP = 5;

/**
 * 점 목록이 같은 선인지 판별하는 열쇠.
 *
 * A→B 와 B→A 는 **화면에서 같은 선**이다(케이블에 방향이 있어도 그림은 하나). 그래서
 * 뒤집은 것도 같은 열쇠가 되도록 정방향/역방향 중 사전순으로 앞선 쪽을 쓴다.
 * 이걸 빼먹으면 4본이 "×2 두 개" 로 갈려 세어진다.
 */
function geometryKey(points: readonly Point[]): string {
  const fwd = points.map((p) => `${p.x},${p.y}`).join('|');
  const rev = [...points].reverse().map((p) => `${p.x},${p.y}`).join('|');
  return fwd <= rev ? fwd : rev;
}

/**
 * 겹쳐 그려지는 케이블을 묶는다.
 *
 * 도면에서 함체와 함체를 잇는 케이블은 **양 끝 자산의 중심**을 잇는 선으로 그려진다.
 * 그래서 같은 두 함체 사이의 케이블은 몇 본이든 똑같은 자리에 겹쳐, 4본이 1본처럼 보였다.
 *
 * 묶는 기준은 두 가지다:
 * - **같은 선 + 같은 종류** → 한 선으로 합치고 `×N` 을 적는다. 색이 같아 어차피 구분되지
 *   않고, 개별 관리는 선번장·계통 등록표가 맡는다.
 * - **같은 선 + 다른 종류** → 합치지 않는다. 종류마다 색이 다른데 합치면 그 정보가 사라진다.
 *   대신 선에 수직으로 조금씩 어긋나게 놓아 나란히 보이게 한다.
 */
export function bundleCables(lines: readonly CableLine[]): CableBundle[] {
  // ① 같은 기하 → 같은 자리에 그려질 것들
  const byGeometry = new Map<string, CableLine[]>();
  for (const line of lines) {
    if (line.points.length < 2) continue;
    const key = geometryKey(line.points);
    const list = byGeometry.get(key);
    if (list) list.push(line);
    else byGeometry.set(key, [line]);
  }

  const result: CableBundle[] = [];
  for (const group of byGeometry.values()) {
    // ② 같은 자리 안에서 종류별로 나눈다
    const byCategory = new Map<string, CableLine[]>();
    for (const line of group) {
      const key = line.categoryId ?? '';
      const list = byCategory.get(key);
      if (list) list.push(line);
      else byCategory.set(key, [line]);
    }

    const bundles = [...byCategory.values()];
    // 가운데를 기준으로 좌우 대칭이 되게 어긋난다(1개면 0 → 제자리).
    const start = -((bundles.length - 1) / 2) * BUNDLE_GAP;

    bundles.forEach((sameCategory, i) => {
      const offset = start + i * BUNDLE_GAP;
      // 선택된 케이블이 있으면 그것을 대표로 삼는다 — 선택 표시가 사라지지 않게.
      const head = sameCategory.find((c) => c.selected) ?? sameCategory[0]!;
      result.push({
        id: head.id,
        color: head.color,
        points: offset === 0 ? head.points : offsetPolyline(head.points, offset),
        count: sameCategory.length,
        selected: sameCategory.some((c) => c.selected),
      });
    });
  }
  return result;
}

/** 꺾은선을 자기 방향의 수직으로 평행 이동한다(각 점을 이웃 방향 기준으로 민다). */
function offsetPolyline(points: readonly Point[], offset: number): Point[] {
  return points.map((p, i) => {
    const prev = points[i - 1] ?? p;
    const next = points[i + 1] ?? p;
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) return { x: p.x, y: p.y };
    // 수직 단위 벡터
    return { x: p.x + (-dy / len) * offset, y: p.y + (dx / len) * offset };
  });
}

/** 선 한가운데 — `×N` 을 적을 자리. */
export function polylineMidpoint(points: readonly Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return { ...points[0]! };
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += Math.hypot(points[i + 1]!.x - points[i]!.x, points[i + 1]!.y - points[i]!.y);
  }
  let walked = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (walked + seg >= total / 2) {
      const t = seg === 0 ? 0 : (total / 2 - walked) / seg;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    walked += seg;
  }
  return { ...points[points.length - 1]! };
}
