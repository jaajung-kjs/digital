import { DEFAULT_ASSET_STATUS } from '@twin/core';
import { portsForNewAsset } from './newAsset';
import type { V2Assembly, V2Asset, V2AssetType } from './types';

/**
 * 설비 품목을 도면에 놓는다 — **설비 하나 + 그 안의 장비들**.
 *
 * 배치에 새 API 를 두지 않는다. 커밋 경로가 이미 자산 여러 개를 부모·자리와 함께 만들 수
 * 있으므로, 설비 품목을 펴서 그대로 스테이지하면 검증·OCC·워킹카피가 전부 지금 길을 탄다.
 *
 * 설비는 **장비 품목이 없다** — 분류가 설비 품목이다. 설비 품목을 가리켜 두면 그 이름을 고쳐도
 * 분류가 따라온다(글자로 굳혀 두면 같은 설비 품목인데 집계가 둘로 갈린다).
 *
 * **구성은 스냅샷** — 설비 품목을 고쳐도 이미 놓인 설비의 안쪽은 그대로고, 그 설비만 따로
 * 고칠 수 있다.
 *
 * @returns 설비가 첫 번째. 커밋이 이 순서대로 만들면서 부모를 찾는다.
 */
export function assemblyToAssets(args: {
  assembly: V2Assembly;
  substationId: string;
  /** 설비 이름 — 설비 품목 이름이 아니라 현장 이름이 붙는다("통신랙 A"). */
  name: string;
  floorId: string;
  rect: { x: number; y: number; width: number; height: number };
  /** 장비의 포트를 지금 만들기 위한 장비 품목들 — 저장 전에도 포트가 보여야 한다. */
  typesById: Map<string, V2AssetType>;
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

  const parts: V2Asset[] = args.assembly.items.map((item) => {
    const id = crypto.randomUUID();
    const type = args.typesById.get(item.typeId);
    return {
    id,
    name: item.name,
    typeId: item.typeId,
    substationId: args.substationId,
    status: DEFAULT_ASSET_STATUS,
    floorId: null,
    x: null, y: null, width: null, height: null,
    parentAssetId: equipmentId,
    assemblyId: null,
    /* **어느 항목에서 나왔는가** — 자리를 옮기든 형제가 지워지든 신원이 흔들리지 않는다. */
    assemblyItemId: item.id,
    col: item.col,
    row: item.row,
    colSpan: item.colSpan,
    rowSpan: item.rowSpan,
    fieldValues: {},
    updatedAt: '',
    /* 포트를 **지금** 만든다 — 저장 전에도 포트 탭·선번장·계통이 보이고 케이블을 이을 수
       있어야 한다. 구조는 서버가 제 명세로 다시 만들고 여기서 정한 id 만 받는다. */
    ports: type ? portsForNewAsset(type, id, item.portCounts ?? {}, item.portPositions ?? {}) : [],
    // 오버라이드는 서버도 알아야 한다 — 12심 판과 24심 판이 같은 타입일 수 있다.
    ...(item.portCounts ? { portCounts: item.portCounts } : {}),
    ...(item.portPositions ? { portPositions: item.portPositions } : {}),
    };
  });

  return [equipment, ...parts];
}
