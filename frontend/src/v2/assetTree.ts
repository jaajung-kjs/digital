import type { V2Asset } from './types';

/**
 * 자산을 **위로 거슬러 오르는** 일 — 한 곳에서만 한다.
 *
 * 자산은 도면에 놓이거나(층) 설비 안에 든다(부모). 그래서 「이건 어느 층 것인가」·「어느
 * 설비 것인가」를 물으려면 늘 부모를 따라 올라가야 하는데, 그 걸음이 화면마다 손으로
 * 다시 적혀 있었다 — 상세 패널·평면도·현황표가 각자 `while (cur.parentAssetId) …` 를
 * 굴렸고, **순환을 막는 것은 그중 하나뿐**이었다. 자료가 한 번 꼬이면 나머지 둘은 화면이
 * 멈춘다. 걸음을 여기 한 번만 적는다.
 */

/** 부모를 따라 오르며 **처음 참이 되는** 자산 — 없으면 `null`. 순환해도 멈춘다. */
function climb(
  from: V2Asset | undefined,
  byId: ReadonlyMap<string, V2Asset>,
  hit: (a: V2Asset) => boolean,
): V2Asset | null {
  const seen = new Set<string>();
  let cur = from;
  while (cur && !seen.has(cur.id)) {
    if (hit(cur)) return cur;
    seen.add(cur.id);
    cur = cur.parentAssetId ? byId.get(cur.parentAssetId) : undefined;
  }
  return null;
}

/**
 * 이 자산이 실제로 놓여 있는 **도면 위의 것** — 자기 자신이거나, 자기를 담은 설비.
 *
 * 장비는 층을 갖지 않는다(층을 가진 것은 그 장비를 담은 설비다). 그래서 「평면도에서 보기」와
 * 「그 층으로 옮겨 가기」는 둘 다 이 걸음을 거쳐야 한다.
 */
export function floorAnchorOf(assetId: string, byId: ReadonlyMap<string, V2Asset>): V2Asset | null {
  return climb(byId.get(assetId), byId, (a) => a.floorId != null);
}

/** 그 자산이 놓인 층 — 도면에 없으면 `null`. */
export function floorIdOf(assetId: string, byId: ReadonlyMap<string, V2Asset>): string | null {
  return floorAnchorOf(assetId, byId)?.floorId ?? null;
}

/**
 * 이 자산과 **그 아래 전부** — 뿌리가 맨 앞, 그 아래는 이름순.
 *
 * 내려가는 걸음도 화면마다 다시 적혀 있었다: 케이블 셀렉터에 하나(여기로 옮긴 것), 산출
 * 내역에 하나, 평면도와 정보 탭에 각각 손으로 짠 재귀가 하나씩. **그 둘에는 순환을 막는
 * 것이 없어서**, 자료가 한 번 꼬이면 「삭제하시겠습니까」를 띄우려다 화면이 멈춘다.
 * 오르는 걸음(`climb`)을 여기 모은 것과 같은 이유로 내려가는 걸음도 여기 하나만 둔다.
 */
export function withDescendants(assets: readonly V2Asset[], rootId: string): V2Asset[] {
  const root = assets.find((a) => a.id === rootId);
  if (!root) return [];

  const byParent = new Map<string, V2Asset[]>();
  for (const a of assets) {
    if (a.parentAssetId == null) continue;
    const list = byParent.get(a.parentAssetId);
    if (list) list.push(a);
    else byParent.set(a.parentAssetId, [a]);
  }

  const out: V2Asset[] = [root];
  const seen = new Set<string>([rootId]);
  /* 너비 우선 — 같은 깊이끼리 이름순으로 선다. 본 것을 다시 담지 않으므로 순환해도 멈춘다. */
  let frontier: V2Asset[] = [root];
  while (frontier.length > 0) {
    const next: V2Asset[] = [];
    for (const parent of frontier) {
      for (const child of byParent.get(parent.id) ?? []) {
        if (seen.has(child.id)) continue;
        seen.add(child.id);
        next.push(child);
      }
    }
    next.sort((a, b) => a.name.localeCompare(b.name));
    out.push(...next);
    frontier = next;
  }
  return out;
}

/** 이 자산에 **딸린** 것의 수 — 자기 자신은 빼고 센다(삭제 확인 문구가 쓴다). */
export function descendantCount(assets: readonly V2Asset[], rootId: string): number {
  return Math.max(withDescendants(assets, rootId).length - 1, 0);
}

/** 자산 목록 → id 색인. 걸음마다 만들지 않도록 부르는 쪽에서 한 번 만들어 쓴다. */
export function assetsById(assets: readonly V2Asset[]): Map<string, V2Asset> {
  return new Map(assets.map((a) => [a.id, a]));
}
