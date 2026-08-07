import { isMultiCorePort, portValuesAt, type SeededMediumKey } from '@twin/core';
import { buildPortIndex, indexCablesByPort, mediumContainers, resolvePeer, type MediumContainer, type PeerInfo, type PortIndex } from './peerResolve';
import type { V2Asset, V2Cable } from './types';

export const FIBER_MEDIUM: SeededMediumKey = 'fiber';
/** 다심 인입 — OPGW 한 가닥이 물리는 자리. 선번장이 다루는 판은 이 포트를 가진 슬롯이다. */
export const FIBER_TRUNK_MEDIUM: SeededMediumKey = 'fiber-trunk';

/**
 * 선번장 대상 — **인입 포트를 가진 슬롯**을 품은 함체.
 *
 * 예전에는 "광 포트를 가진 자식" 이면 다 걸려서, 장비쪽 광 포트만 있는 광단말까지 대상이 됐다.
 * 선번장에 적는 것(성단 손실·점검일)은 OTDR 로 재는 인입 심선의 값이라 인입이 없는 자산에는
 * 적을 것이 없다. 조건을 인입 포트로 바꾸면 그 사실이 선언에서 그대로 나온다.
 */
export function fiberContainers(assets: V2Asset[]): MediumContainer[] {
  return mediumContainers(assets, FIBER_TRUNK_MEDIUM);
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
  return slot.ports.find((p) => p.medium === FIBER_TRUNK_MEDIUM && isMultiCorePort(p.positions)) ?? null;
}

function cableOf(portId: string, byA: Map<string, V2Cable>, byB: Map<string, V2Cable>): V2Cable | null {
  return byA.get(portId) ?? byB.get(portId) ?? null;
}

/**
 * 인입 건너편에서 이 코어가 닿는 곳.
 *
 * 인입 케이블 → 건너편 슬롯 → 같은 번호의 심선 포트 → 거기 물린 점퍼의 상대. 건너편 슬롯이
 * 이 변전소에 없으면(대국 변전소) 인입 케이블의 saved ref 까지가 우리가 아는 전부다.
 */
function resolveFarEnd(
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
    // 건너편 슬롯이 로컬에 없다 — 인입 케이블이 말해 주는 대국 슬롯까지만 안다.
    return resolvePeer({ id: trunkPortId }, trunkCable, portIndex, localSubstationId);
  }
  const peerCore = peerSlot.ports.find((p) => p.medium === FIBER_MEDIUM && p.index === coreIndex);
  if (!peerCore) return null;
  const jumper = cableOf(peerCore.id, byA, byB);
  if (!jumper) {
    // 건너편 심선은 있는데 아직 장비로 안 나갔다 — 성단까지가 끝이다.
    return { assetName: peerSlot.name, portName: peerCore.name, substationName: null, remote: false };
  }
  return resolvePeer(peerCore, jumper, portIndex, localSubstationId);
}

/**
 * 한 함체(컨테이너)의 선번장 행을 만든다.
 *
 * 행의 단위는 **인입 포트의 코어**다 — 슬롯 × 코어 1..positions. 열은 그 슬롯의 단심 광 포트
 * 그룹들(장비쪽 성단)과 대국이다.
 */
export function buildFiberRows(
  container: V2Asset,
  assets: V2Asset[],
  cables: V2Cable[],
  /** 이 표가 다루는 컨테이너 — 같은 함체의 다른 컨테이너 슬롯은 섞이면 안 된다. */
  containerKey?: string | null,
): BuildFiberRowsResult {
  const { cablesByAPortId: byA, cablesByBPortId: byB } = indexCablesByPort(cables);
  const portIndex = buildPortIndex(assets);

  const slots = assets
    .filter(
      (a) =>
        a.parentAssetId === container.id &&
        (containerKey === undefined || a.containerKey === containerKey) &&
        trunkPortOf(a) !== null,
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  // 열 = 슬롯들이 가진 단심 광 포트 그룹의 합집합(포트 순서 보존).
  const groupsOrder: string[] = [];
  const labelByGroup = new Map<string, string>();
  for (const slot of slots) {
    for (const port of slot.ports) {
      if (port.medium !== FIBER_MEDIUM || labelByGroup.has(port.group)) continue;
      groupsOrder.push(port.group);
      const base = port.name.replace(/\s*\d+\s*$/, '').trim();
      labelByGroup.set(port.group, base.length > 0 ? base : port.group);
    }
  }

  const rows: FiberRow[] = [];
  for (const slot of slots) {
    const trunk = trunkPortOf(slot)!;
    const trunkCable = cableOf(trunk.id, byA, byB);

    for (let coreIndex = 1; coreIndex <= trunk.positions; coreIndex++) {
      const cells: FiberRowCell[] = groupsOrder.map((group) => {
        const port = slot.ports.find((p) => p.medium === FIBER_MEDIUM && p.group === group && p.index === coreIndex);
        if (!port) return { group, portId: null, portName: null, cableId: null, peer: null };
        const cable = cableOf(port.id, byA, byB);
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
          ? resolveFarEnd(trunk.id, trunkCable, coreIndex, portIndex, byA, byB, container.substationId)
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
