import { DEFAULT_ASSET_STATUS, DEFAULT_FACING } from '@twin/core';
import { portsForNewAsset } from './newAsset';
import type { V2Assembly, V2Asset, V2AssetType, V2Cable } from './types';
import { newId } from './newId';

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
 * **내부 배선도 함께 선다**(`assembly.links`) — 랙 한 대짜리 설비의 안쪽 배선은 어느 국에
 * 놓든 같다. 예전에는 자산과 포트만 만들어서, 같은 결선을 설비를 놓을 때마다 손으로 다시
 * 이어야 했다. 포트 id 를 여기서 붙이므로(`portsForNewAsset`) 링크의 `묶음:번호` 를 그
 * 자리에서 풀 수 있다 — 서버에 새 길을 낼 것이 없다(커밋이 이미 케이블을 받는다).
 *
 * @returns 설비가 첫 번째. 커밋이 이 순서대로 만들면서 부모를 찾는다.
 */
export function assemblyToPlacement(args: {
  assembly: V2Assembly;
  substationId: string;
  /** 설비 이름 — 설비 품목 이름이 아니라 현장 이름이 붙는다("통신랙 A"). */
  name: string;
  floorId: string;
  rect: { x: number; y: number; width: number; height: number };
  /** 장비의 포트를 지금 만들기 위한 장비 품목들 — 저장 전에도 포트가 보여야 한다. */
  typesById: Map<string, V2AssetType>;
}): { assets: V2Asset[]; cables: V2Cable[] } {
  const equipmentId = newId();

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
    /* **놓는 순간 정면이 선다**(아래). 비워 두면 도면에 굵은 변이 없어 「앞이 어디인지
       아직 아무도 모른다」가 되는데, 반·랙은 놓는 사람이 이미 방향을 보고 놓는다.
       틀리면 도구바의 회전 한 번이다. 안쪽 장비에는 주지 않는다 — 정면이 뜻 없다. */
    fieldValues: { facing: DEFAULT_FACING },
    updatedAt: '',
    ports: [],
  };

  /**
   * **빈 슬롯은 자산이 아니다** — 자리와 이름만 설비 품목에 남는다.
   *
   * 없는 물건이 산출·현황·미점검에 세어지면 안 된다. 그 자리는 나중에 그 설비의 구성 격자에서
   * 누르면 **선언된 크기·이름 그대로** 장비가 선다.
   */
  const filled = args.assembly.items.filter((item) => item.typeId != null);

  const parts: V2Asset[] = filled.map((item) => {
    const id = newId();
    const type = args.typesById.get(item.typeId!);
    return {
    id,
    name: item.name,
    typeId: item.typeId!,
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

  /* 구성 항목 id → 그 항목에서 나온 자산. 배선이 항목을 가리키므로 이 다리가 필요하다. */
  const partByItem = new Map(filled.map((item, i) => [item.id, parts[i]!]));
  const portIdAt = (itemId: string, group: string, index: number): string | undefined =>
    partByItem.get(itemId)?.ports.find((p) => p.group === group && p.index === index)?.id;

  const cables: V2Cable[] = [];
  for (const link of args.assembly.links ?? []) {
    const aPortId = portIdAt(link.aItemId, link.aGroup, link.aIndex);
    const bPortId = portIdAt(link.bItemId, link.bGroup, link.bIndex);
    /* 한쪽이라도 없으면 **그 줄만 거른다** — 설비는 그대로 선다. 품목을 고치면서 포트 수를
       줄이면 번호가 사라질 수 있는데(저장은 막지만 이미 놓인 설비는 스냅샷이다), 그때
       설비 전체를 못 놓게 하는 것은 과하다. */
    if (!aPortId || !bPortId) continue;
    cables.push({
      id: newId(),
      name: null,
      substationId: args.substationId,
      aPortId,
      bPortId,
      categoryId: link.categoryId,
      pathPoints: [],
      specParams: link.specParams ?? {},
      updatedAt: '',
    });
  }

  return { assets: [equipment, ...parts], cables };
}
