import { isMultiCorePort, portValuesAt, type SeededMediumKey } from '@twin/core';
import {
  buildPortIndex,
  cableAt,
  endpointRef,
  indexCablesByPort,
  mediumContainers,
  resolvePeer,
  type PeerInfo,
  type PortIndex,
} from './peerResolve';
import type { V2Asset, V2Cable } from './types';

export const FIBER_MEDIUM: SeededMediumKey = 'fiber';

/**
 * 인입(성단)인가 — **심선 수로** 가른다.
 *
 * 예전에는 매체 키가 갈려 있었다(`fiber` vs `fiber-trunk`). 그런데 그 둘을 가르던 것이
 * 결국 심선 수였고 심선 수는 포트가 이미 들고 있으므로, 물어야 할 것을 직접 묻는다.
 */
const isTrunk = (p: { positions?: number | null }) => isMultiCorePort(p.positions);

/**
 * 선번장 대상 — **인입 포트를 가진 장비**을 품은 설비(OFD 설비 품목 등).
 *
 * 예전에는 "광 포트를 가진 자식" 이면 다 걸려서, 장비쪽 광 포트만 있는 광단말까지 대상이 됐다.
 * 선번장에 적는 것(성단 손실·점검일)은 OTDR 로 재는 인입 심선의 값이라 인입이 없는 자산에는
 * 적을 것이 없다. 조건을 인입 포트로 바꾸면 그 사실이 선언에서 그대로 나온다.
 */
export function fiberContainers(assets: V2Asset[]): V2Asset[] {
  return mediumContainers(assets, FIBER_MEDIUM, isTrunk);
}

export interface FiberRowCell {
  group: string;
  portId: string | null;
  portName: string | null;
  cableId: string | null;
  peer: PeerInfo | null;
}

/**
 * 이 심선에 적히는 값들.
 *
 * 무엇이 케이블의 것이고 무엇이 심선의 것인지는 종류 선언(`cableFieldsFor`/`portFieldsFor`)이
 * 정한다. 길이는 인입 케이블 **한 가닥**의 값이라 같은 슬롯의 모든 심선이 같은 수를 본다 —
 * 40m 짜리 OPGW 는 24심이어도 40m 다.
 */
export interface FiberRowMeta {
  /** 인입 케이블 — 길이가 여기 담긴다. 한 슬롯의 모든 심선이 같은 케이블을 가리킨다. */
  cableId: string | null;
  cableValues: Record<string, unknown>;
  /** 인입 포트 — 손실·점검일처럼 **코어마다 다른** 값이 코어 번호 아래 담긴다. */
  portId: string | null;
  portAssetId: string | null;
  portValues: Record<string, unknown>;
}

export interface FiberRow {
  slotId: string;
  slotName: string;
  coreIndex: number;
  cells: FiberRowCell[];
  meta: FiberRowMeta;
  /**
   * 이 심선이 인입 케이블 건너편에서 최종적으로 닿는 곳.
   *
   * 예전 모델에서는 대국을 슬롯 하나 더 만들어 표현했기 때문에 추적이 거기서 끊겼다 —
   * "슬롯 3 성단 1" 까지만 보이고 그 심선이 어느 장비로 가는지는 알 수 없었다. 인입이 케이블
   * 한 본이 되면서 코어 번호로 건너편 심선이 정해지고, 거기 물린 점퍼의 상대까지 이어진다.
   */
  farEnd: PeerInfo | null;
}

export interface BuildFiberRowsResult {
  /** 열 머리글에 쓸 그룹 이름 — 포트 이름에서 번호를 뗀 것(`광 1` → `광`).
   *  그룹 키(`CORE`)는 영문만 허용되는 식별자라 사람에게 보여 줄 이름이 못 된다. */
  groupLabels: string[];
  groups: string[];
  rows: FiberRow[];
}

/** 이 슬롯의 인입 포트. 없으면 선번장에 올릴 판이 아니다. */
function trunkPortOf(slot: V2Asset) {
  return slot.ports.find((p) => p.medium === FIBER_MEDIUM && isTrunk(p)) ?? null;
}

/**
 * 인입 건너편에서 이 코어가 닿는 곳.
 *
 * 인입 케이블 → 건너편 슬롯 → 같은 번호의 심선 포트 → 거기 물린 점퍼의 상대. 건너편 슬롯이
 * 이 변전소에 없으면(대국 변전소) 인입 케이블의 saved ref 까지가 우리가 아는 전부다.
 */
export function resolveFiberFarEnd(
  trunkPortId: string,
  trunkCable: V2Cable,
  coreIndex: number,
  portIndex: PortIndex,
  byA: Map<string, V2Cable>,
  byB: Map<string, V2Cable>,
  localSubstationId: string,
): PeerInfo | null {
  const otherTrunkId = trunkCable.aPortId === trunkPortId ? trunkCable.bPortId : trunkCable.aPortId;
  const peerSlot = portIndex.get(otherTrunkId)?.asset;
  if (!peerSlot) {
    /* 건너편 슬롯이 상대 국에 있다 — 서버가 풀어 실어 준 **코어별 대국**을 읽는다.
       대국은 「OPGW 를 타고 넘어가 같은 번호에 물린 장비」이지 건너편 슬롯이 아니다. */
    const ref = endpointRef(trunkCable, otherTrunkId);
    const core = ref?.cores?.find((c) => c.index === coreIndex);
    if (core) {
      return {
        assemblyName: core.assemblyName,
        assetName: core.assetName,
        portName: core.portName,
        portIndex: core.portIndex,
        substationName: ref!.substationName,
        remote: ref!.substationId !== localSubstationId,
        /* 상대 국의 장비다 — 이 워킹 카피에 없으므로 갈 자리가 없다. */
        assetId: null,
        portId: null,
      };
    }
    /* 건너편 심선이 아직 장비로 안 나갔다 — **대국이 없는 것이다.**
       한때는 인입 케이블 건너편의 슬롯을 대신 적었다. 그러나 그것은 이 OPGW 가 어디에
       꽂혔나일 뿐 이 심선이 무엇에 닿았나가 아니다 — 성단되지 않은 스물두 줄이 모두
       `…#1` 로 채워져 다 이어진 것처럼 읽혔다. 대국 칸이 말할 것은 장비뿐이다. */
    return null;
  }
  // 건너편의 **단심** 성단 — 인입 자신(index 1)을 집지 않도록 심선 수로 가른다.
  const peerCore = peerSlot.ports.find((p) => p.medium === FIBER_MEDIUM && !isTrunk(p) && p.index === coreIndex);
  if (!peerCore) return null;
  const jumper = cableAt(peerCore.id, byA, byB);
  /* 건너편 성단까지는 왔는데 거기서 장비로 안 나갔다 — 이 심선은 아직 아무 데도 닿지 않았다.
     성단 포트는 판의 자리이지 대국이 아니다. 대국 칸은 **장비만** 적는다. */
  if (!jumper) return null;
  return resolvePeer(peerCore, jumper, portIndex, localSubstationId);
}

/**
 * 한 설비의 선번장 행을 만든다.
 *
 * 행의 단위는 **인입 포트의 코어**다 — 슬롯 × 코어 1..positions. 열은 그 슬롯의 단심 광 포트
 * 그룹들(장비쪽 성단)과 대국이다.
 */
export function buildFiberRows(
  container: V2Asset,
  assets: V2Asset[],
  cables: V2Cable[],
): BuildFiberRowsResult {
  const { cablesByAPortId: byA, cablesByBPortId: byB } = indexCablesByPort(cables);
  const portIndex = buildPortIndex(assets);

  /* **인입이 물린 판만** 적는다 — 선번장은 실제로 들어온 광케이블의 성단표다. 케이블이
     없는 판은 코어마다 빈 줄만 스물넉 줄을 만들어, 정작 읽을 줄을 파묻는다. */
  const slots = assets
    .filter((a) => {
      if (a.parentAssetId !== container.id) return false;
      const trunk = trunkPortOf(a);
      return trunk !== null && cableAt(trunk.id, byA, byB) !== null;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // 열 = 슬롯들이 가진 단심 광 포트 그룹의 합집합(포트 순서 보존).
  const groupsOrder: string[] = [];
  const labelByGroup = new Map<string, string>();
  for (const slot of slots) {
    for (const port of slot.ports) {
      // 인입은 열이 아니다 — 행이 그 인입의 코어다. 매체가 같아졌으니 심선 수로 가른다.
      if (port.medium !== FIBER_MEDIUM || isTrunk(port) || labelByGroup.has(port.group)) continue;
      groupsOrder.push(port.group);
      const base = port.name.replace(/\s*\d+\s*$/, '').trim();
      labelByGroup.set(port.group, base.length > 0 ? base : port.group);
    }
  }

  const rows: FiberRow[] = [];
  for (const slot of slots) {
    const trunk = trunkPortOf(slot)!;
    const trunkCable = cableAt(trunk.id, byA, byB);

    for (let coreIndex = 1; coreIndex <= trunk.positions; coreIndex++) {
      const cells: FiberRowCell[] = groupsOrder.map((group) => {
        const port = slot.ports.find(
          (p) => p.medium === FIBER_MEDIUM && !isTrunk(p) && p.group === group && p.index === coreIndex,
        );
        if (!port) return { group, portId: null, portName: null, cableId: null, peer: null };
        const cable = cableAt(port.id, byA, byB);
        return {
          group,
          portId: port.id,
          portName: port.name,
          cableId: cable?.id ?? null,
          peer: cable ? resolvePeer(port, cable, portIndex, container.substationId) : null,
        };
      });

      rows.push({
        slotId: slot.id,
        slotName: slot.name,
        coreIndex,
        cells,
        meta: {
          cableId: trunkCable?.id ?? null,
          cableValues: trunkCable?.specParams ?? {},
          portId: trunk.id,
          portAssetId: slot.id,
          /* 코어별 값은 인입 포트 하나에 코어 번호 아래 담긴다 — 저장 형상을 아는 곳은 코어뿐이다. */
          portValues: portValuesAt(trunk, coreIndex),
        },
        farEnd: trunkCable
          ? resolveFiberFarEnd(trunk.id, trunkCable, coreIndex, portIndex, byA, byB, container.substationId)
          : null,
      });
    }
  }

  return {
    groups: groupsOrder,
    groupLabels: groupsOrder.map((g) => labelByGroup.get(g) ?? g),
    rows,
  };
}
