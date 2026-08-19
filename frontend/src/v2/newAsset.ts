import { DEFAULT_ASSET_STATUS, coreCount, instantiatePorts, portTemplatesFrom } from '@twin/core';
import type { V2Asset, V2AssetType, V2Port } from './types';

/**
 * 자산이 갖는 포트 — **놓는 순간 화면이 만든다**.
 *
 * 예전에는 서버가 커밋 때 만들었고 화면은 빈 배열을 들고 있었다. 그래서 저장하기 전에는
 * 포트 탭이 사라지고, 선번장·계통에도 안 나타나고, 케이블을 이을 수도 없었다 — 워킹카피는
 * 「저장하면 이렇게 된다」인데 포트만 그 그림에서 빠져 있었다.
 *
 * id 도 여기서 붙인다(자산 id 를 그렇게 하는 것과 같다). 저장할 때 그 id 를 함께 보내
 * 서버가 그대로 쓰므로, 저장 전에 이어 둔 케이블이 저장 뒤에도 같은 포트를 가리킨다.
 * **구조는 명세가 정한다** — 서버는 제 명세로 포트를 만들고 id 만 받는다.
 */
export function portsForNewAsset(
  type: V2AssetType,
  assetId: string,
  portCounts: Record<string, number> = {},
  portPositions: Record<string, number> = {},
): V2Port[] {
  return instantiatePorts(portTemplatesFrom(type.portTemplates), assetId, portCounts, portPositions).map((p) => ({
    ...p,
    id: crypto.randomUUID(),
    positions: coreCount(p.positions),
    // 값은 아직 없다 — 손실·점검일은 놓고 나서 적는다.
    fieldValues: {},
  }));
}

/**
 * 자산이 놓이는 자리 — 도면 위이거나, 설비 격자 안이거나.
 *
 * 예전에는 "어느 컨테이너의" 라는 축이 하나 더 있었다. 자리를 자산 종류가 선언했기
 * 때문인데, 이제 자리는 설비 종류의 격자 하나뿐이라 그 축이 사라졌다.
 */
export type PlacementInput =
  | { kind: 'grid'; parentAssetId: string; col: number | null; row: number | null; colSpan: number; rowSpan: number }
  | { kind: 'floor'; floorId: string; x: number; y: number; width: number; height: number };

/**
 * 자산은 **반드시 어딘가에 놓인다** — 도면 위이거나, 설비 격자 안이거나.
 *
 * 예전에는 자리를 안 줄 수도 있었고, 그렇게 만든 자산은 도면에도 설비 안에도 없이 현황표에만
 * 존재했다. 그런 자산은 세기만 할 뿐 아무 데서도 만질 수 없다 — 그 길을 없앤다.
 */
export function makeNewAsset(args: {
  /**
   * 무엇인가 — **아직 모를 수 있다**(`null`).
   *
   * 빈 자리를 눌러 만든 자산은 종류를 고르기 전이다. 포트는 종류가 정하므로 그때는 비어 있고,
   * 종류를 고르는 순간 그 명세대로 만들어진다(`portsForNewAsset`).
   */
  type: V2AssetType | null;
  name: string;
  substationId: string;
  placement: PlacementInput;
}): V2Asset {
  const p = args.placement;
  const isContainer = p.kind === 'grid';
  const isFloor = p.kind === 'floor';
  const id = crypto.randomUUID();

  return {
    id,
    name: args.name,
    typeId: args.type?.id ?? null,
    substationId: args.substationId,
    status: DEFAULT_ASSET_STATUS,
    floorId: isFloor ? p.floorId : null,
    x: isFloor ? p.x : null,
    y: isFloor ? p.y : null,
    width: isFloor ? p.width : null,
    height: isFloor ? p.height : null,
    parentAssetId: isContainer ? p.parentAssetId : null,
    col: isContainer ? p.col : null,
    row: isContainer ? p.row : null,
    colSpan: isContainer ? p.colSpan : null,
    rowSpan: isContainer ? p.rowSpan : null,
    fieldValues: {},
    updatedAt: '',
    ports: args.type ? portsForNewAsset(args.type, id) : [],
  };
}
