import type { StatusRow } from './statusRows';

/**
 * 현황을 **집계로 읽는다** — 「무엇이 몇 개 있고, 어디에 있고, 손볼 것이 있나」.
 *
 * 목록은 그 다음이다. 실제로 묻는 말이 「강원본부에 L3 스위치가 몇 개지」·「광전송장치는
 * 어디에 있지」인데, 표는 자산을 한 줄씩 늘어놓기만 했다 — 세는 일은 사람이 눈으로 했다.
 *
 * 여기서 세는 것은 **사실뿐**이다: 개수, 상태(어휘가 정한 값 그대로), 점검 이력이 없는 것.
 * 「6개월 지난 점검」 같은 것은 두지 않는다 — 몇 달이 맞는지는 이 코드가 알 수 없고, 그런
 * 기준을 하나 들이면 화면마다 다른 숫자가 생긴다.
 */
export interface SummaryItem {
  /** 품목 하나 — 이 줄이 곧 「L3 스위치 2대」다. */
  key: string;
  categoryName: string;
  itemName: string;
  /** 설비인가 그 안의 장비인가 — 「현황엔 설비만」과 「L3 스위치 몇 개」가 둘 다 필요하다. */
  kind: '설비' | '장비';
  count: number;
  /** 상태값 → 개수. 어휘는 `ASSET_STATUSES` 가 정하고 여기서는 세기만 한다. */
  byStatus: Record<string, number>;
  /** 점검 이력이 하나도 없는 것 — 임의의 기간 기준 없이 말할 수 있는 사실이다. */
  neverInspected: number;
  /**
   * 이 품목의 개체들 — **자리 순**으로.
   *
   * 집계 줄에는 「어디에 몇 개」를 적지 않는다: 펼치면 그 자리들이 순서대로 나오므로 같은
   * 말을 두 번 하는 셈이고, 접힌 줄에 분포를 욱여넣으면 긴 목록에서 줄이 길어져 개수가
   * 묻힌다. 접힌 줄은 **얼마나 · 성한가**만 말한다.
   */
  rows: StatusRow[];
}

export interface SummaryGroup {
  categoryName: string;
  count: number;
  items: SummaryItem[];
}

export interface Summary {
  groups: SummaryGroup[];
  total: number;
  assemblies: number;
  devices: number;
  byStatus: Record<string, number>;
  neverInspected: number;
}

/** 이름 없는 자리 — 층이 없거나(미배치) 분류가 비었을 때. */
export const UNSET = '미지정';

/**
 * 개체 줄들을 **분류 ▸ 품목**으로 접는다.
 *
 * 순서는 개수 많은 것부터다(「무엇이 많은가」가 현황에서 먼저 궁금하다), 같으면 이름순.
 */
export function summarize(rows: StatusRow[]): Summary {
  const items = new Map<string, SummaryItem>();
  const byStatus: Record<string, number> = {};
  let assemblies = 0;
  let devices = 0;
  let neverInspected = 0;

  for (const r of rows) {
    const categoryName = r.categoryName || UNSET;
    const key = `${categoryName} ${r.typeName} ${r.kind}`;
    const item = items.get(key) ?? {
      key,
      categoryName,
      itemName: r.typeName,
      kind: r.kind,
      count: 0,
      byStatus: {} as Record<string, number>,
      neverInspected: 0,
      rows: [] as StatusRow[],
    };
    item.count += 1;
    item.byStatus[r.status] = (item.byStatus[r.status] ?? 0) + 1;
    if (r.lastInspectedAt == null) item.neverInspected += 1;
    item.rows.push(r);
    items.set(key, item);

    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    if (r.kind === '설비') assemblies += 1;
    else devices += 1;
    if (r.lastInspectedAt == null) neverInspected += 1;
  }

  /* 펼쳤을 때 **같은 자리 것끼리 붙어** 보이게 — 어디에 몇 개인지가 순서로 읽힌다. */
  for (const item of items.values()) {
    item.rows.sort((a, b) => (a.where || '').localeCompare(b.where || '', 'ko') || a.name.localeCompare(b.name, 'ko'));
  }

  const groups = new Map<string, SummaryGroup>();
  for (const item of items.values()) {
    const g = groups.get(item.categoryName) ?? { categoryName: item.categoryName, count: 0, items: [] };
    g.count += item.count;
    g.items.push(item);
    groups.set(item.categoryName, g);
  }
  for (const g of groups.values()) {
    g.items.sort((a, b) => b.count - a.count || a.itemName.localeCompare(b.itemName, 'ko'));
  }

  return {
    groups: [...groups.values()].sort(
      (a, b) => b.count - a.count || a.categoryName.localeCompare(b.categoryName, 'ko'),
    ),
    total: rows.length,
    assemblies,
    devices,
    byStatus,
    neverInspected,
  };
}
