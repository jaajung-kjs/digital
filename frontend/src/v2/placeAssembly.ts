import { DEFAULT_ASSET_STATUS } from '@twin/core';
import type { V2Assembly, V2Asset } from './types';

/**
 * 형판을 도면에 놓는다 — **자산 묶음 하나로 편다**.
 *
 * 배치에 새 API 를 두지 않는다. 커밋 경로가 이미 자산 여러 개를 부모·자리와 함께 만들 수
 * 있으므로, 형판을 펴서 그대로 스테이지하면 검증·OCC·워킹카피가 전부 지금 길을 탄다.
 *
 * 놓을 때의 **형판 이름을 뿌리에 굳힌다**(스냅샷). 형판을 나중에 고쳐도 이미 놓인 설비는
 * 그때 만든 모습 그대로다 — 현장 설비는 형판이 바뀌어도 물리적으로 그대로이고, 랙마다
 * 다른 구성이 들어가 있는 것이 정상이다.
 *
 * @returns 부모가 자식보다 먼저 오도록 정렬된 자산 목록. 커밋이 이 순서대로 만든다.
 */
export function assemblyToAssets(args: {
  assembly: V2Assembly;
  substationId: string;
  /** 뿌리 자산의 이름 — 형판 이름이 아니라 현장 이름이 붙는다("통신랙 A"). */
  rootName: string;
  floorId: string;
  rect: { x: number; y: number; width: number; height: number };
}): V2Asset[] {
  /** 형판 부품 id → 새로 만들 자산 id. 자식이 부모를 가리키는 데 쓴다. */
  const assetIdByItemId = new Map(args.assembly.items.map((i) => [i.id, crypto.randomUUID()]));

  /* 부모가 자식보다 먼저 와야 한다 — 커밋이 순서대로 만들면서 부모를 찾기 때문이다.
     형판은 트리이므로 뿌리에서 너비 우선으로 훑으면 그 순서가 나온다. */
  const ordered: typeof args.assembly.items = [];
  const queue = args.assembly.items.filter((i) => i.parentItemId === null);
  while (queue.length > 0) {
    const item = queue.shift()!;
    ordered.push(item);
    queue.push(...args.assembly.items.filter((i) => i.parentItemId === item.id));
  }

  return ordered.map((item) => {
    const isRoot = item.parentItemId === null;
    return {
      id: assetIdByItemId.get(item.id)!,
      name: isRoot ? args.rootName : item.name,
      typeId: item.typeId,
      substationId: args.substationId,
      status: DEFAULT_ASSET_STATUS,
      // 뿌리만 도면에 놓인다 — 나머지는 그 안의 자리에 든다.
      floorId: isRoot ? args.floorId : null,
      x: isRoot ? args.rect.x : null,
      y: isRoot ? args.rect.y : null,
      width: isRoot ? args.rect.width : null,
      height: isRoot ? args.rect.height : null,
      parentAssetId: isRoot ? null : assetIdByItemId.get(item.parentItemId!) ?? null,
      assemblyName: isRoot ? args.assembly.name : null,
      containerKey: item.containerKey,
      col: item.col,
      row: item.row,
      colSpan: item.colSpan,
      rowSpan: item.rowSpan,
      fieldValues: {},
      updatedAt: '',
      ports: [],
      // 포트는 서버가 타입 명세대로 만든다 — 부품이 선언한 오버라이드를 실어 보낸다.
      ...(item.portCounts ? { portCounts: item.portCounts } : {}),
      ...(item.portPositions ? { portPositions: item.portPositions } : {}),
    };
  });
}
