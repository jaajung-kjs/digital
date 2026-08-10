import { DEFAULT_ASSET_STATUS } from '@twin/core';
import type { V2Assembly, V2Asset } from './types';

/**
 * 형판을 도면에 놓는다 — **설비 하나 + 그 안의 부품들**.
 *
 * 배치에 새 API 를 두지 않는다. 커밋 경로가 이미 자산 여러 개를 부모·자리와 함께 만들 수
 * 있으므로, 형판을 펴서 그대로 스테이지하면 검증·OCC·워킹카피가 전부 지금 길을 탄다.
 *
 * 설비는 **타입이 없다** — 분류가 형판이다. 형판을 가리켜 두면 형판 이름을 고쳐도 분류가
 * 따라온다(글자로 굳혀 두면 같은 형판인데 집계가 둘로 갈린다).
 *
 * **구성은 스냅샷** — 형판을 고쳐도 이미 놓인 설비의 안쪽은 그대로고, 그 설비만 따로
 * 고칠 수 있다.
 *
 * @returns 설비가 첫 번째. 커밋이 이 순서대로 만들면서 부모를 찾는다.
 */
export function assemblyToAssets(args: {
  assembly: V2Assembly;
  substationId: string;
  /** 설비 이름 — 형판 이름이 아니라 현장 이름이 붙는다("통신랙 A"). */
  name: string;
  floorId: string;
  rect: { x: number; y: number; width: number; height: number };
}): V2Asset[] {
  const equipmentId = crypto.randomUUID();

  const equipment: V2Asset = {
    id: equipmentId,
    name: args.name,
    typeId: null,
    substationId: args.substationId,
    status: DEFAULT_ASSET_STATUS,
    floorId: args.floorId,
    x: args.rect.x,
    y: args.rect.y,
    width: args.rect.width,
    height: args.rect.height,
    parentAssetId: null,
    assemblyId: args.assembly.id,
    col: null,
    row: null,
    colSpan: null,
    rowSpan: null,
    fieldValues: {},
    updatedAt: '',
    ports: [],
  };

  const parts: V2Asset[] = args.assembly.items.map((item) => ({
    id: crypto.randomUUID(),
    name: item.name,
    typeId: item.typeId,
    substationId: args.substationId,
    status: DEFAULT_ASSET_STATUS,
    floorId: null,
    x: null, y: null, width: null, height: null,
    parentAssetId: equipmentId,
    assemblyId: null,
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
  }));

  return [equipment, ...parts];
}
