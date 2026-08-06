import type { V2Asset, V2Cable, V2CableRef } from './types';

/** Peer(대국) 표시 정보 — fiber/power 셀렉터 공유 형태 */
export interface PeerInfo {
  assetName: string;
  portName: string;
  substationName: string | null;
  remote: boolean;
}

export interface PortIndexEntry {
  port: V2Asset['ports'][number];
  asset: V2Asset;
}

export type PortIndex = Map<string, PortIndexEntry>;

/** portId → { port, asset } 인덱스 (호이스트해 O(1) 조회) */
export function buildPortIndex(assets: V2Asset[]): PortIndex {
  const index: PortIndex = new Map();
  for (const a of assets) {
    for (const p of a.ports) {
      index.set(p.id, { port: p, asset: a });
    }
  }
  return index;
}

/** 선번장·계통이 한 표로 다루는 단위 — 자산 하나가 아니라 **자산의 컨테이너 하나**. */
export interface MediumContainer {
  asset: V2Asset;
  /** 이 매체 자식들이 들어 있는 컨테이너 키. 자리에 놓이지 않은 자식은 null. */
  containerKey: string | null;
}

/**
 * medium(fiber/power) 포트를 가진 자식을 보유한 **컨테이너** 목록 — fiber/power 셀렉터 공유 판정.
 * medium 값 자체(FIBER_MEDIUM/POWER_MEDIUM)는 각 셀렉터 모듈에 그대로 선언된 §6-1 뷰 파라미터이며,
 * 이 함수는 그 값을 인자로 받을 뿐 재선언하지 않는다.
 *
 * **왜 자산이 아니라 (자산, 컨테이너) 인가**: 타입은 컨테이너를 여러 개 선언할 수 있고
 * (카탈로그 관리자에서 추가 가능), 자리 번호는 백엔드가 `(부모, containerKey)` 단위로
 * 유일성을 강제한다. 그래서 서로 다른 컨테이너의 0번 자리는 **둘 다 정상**이다.
 * 자산 단위로 뭉치면 그 둘이 같은 회로 번호를 가진 두 행이 되고, 빈 자리도 잘못 세어진다.
 *
 * 결과는 자산 이름 → 컨테이너 키 순 정렬.
 */
export function mediumContainers(assets: V2Asset[], medium: string): MediumContainer[] {
  // (부모, 컨테이너) → 이 medium 포트를 가진 자식 보유 여부, 1패스로 색인 (O(n))
  const byParent = new Map<string, Set<string | null>>();
  for (const asset of assets) {
    if (asset.parentAssetId && asset.ports.some((p) => p.medium === medium)) {
      const keys = byParent.get(asset.parentAssetId) ?? new Set<string | null>();
      keys.add(asset.containerKey);
      byParent.set(asset.parentAssetId, keys);
    }
  }

  const result: MediumContainer[] = [];
  for (const asset of assets) {
    const keys = byParent.get(asset.id);
    if (!keys) continue;
    for (const containerKey of keys) result.push({ asset, containerKey });
  }

  return result.sort(
    (a, b) =>
      a.asset.name.localeCompare(b.asset.name) ||
      (a.containerKey ?? '').localeCompare(b.containerKey ?? ''),
  );
}

/** cable[] → aPortId/bPortId 로 색인한 Map 쌍 — fiber/power 행 빌더 공유 플러밍 */
export function indexCablesByPort(cables: V2Cable[]): {
  cablesByAPortId: Map<string, V2Cable>;
  cablesByBPortId: Map<string, V2Cable>;
} {
  const cablesByAPortId = new Map<string, V2Cable>();
  const cablesByBPortId = new Map<string, V2Cable>();

  for (const cable of cables) {
    cablesByAPortId.set(cable.aPortId, cable);
    cablesByBPortId.set(cable.bPortId, cable);
  }

  return { cablesByAPortId, cablesByBPortId };
}

/**
 * 케이블 끝점(endpoint) 자신의 saved ref 판정 — 한 곳 규칙.
 *
 * portId가 케이블의 bPortId이면 bRef, aPortId이면 aRef를 반환한다 (그 포트 자신을 기술하는 ref).
 * resolvePeer의 '반대편(peer)' 규칙과 구분: 이 함수는 도착 포트 자신을 표기할 때 쓴다
 * (예: ConnectionsTab hopText — trace hop의 toPortId가 로컬 미해소일 때).
 */
export function endpointRef(
  cable: Pick<V2Cable, 'aPortId' | 'bPortId' | 'aRef' | 'bRef'>,
  portId: string,
): V2CableRef | null {
  if (cable.bPortId === portId) return cable.bRef ?? null;
  if (cable.aPortId === portId) return cable.aRef ?? null;
  return null;
}

/**
 * 케이블 끝점 이름 해소 — 한 곳 규칙.
 *
 * portId에 해당하는 끝점의 이름을 반환한다:
 *   1. portIndex에서 asset.name 조회 (로컬 effective)
 *   2. 해당 끝점의 saved ref assetName (endpointRef 경유 — aRef/bRef 접근 단일화)
 *   3. fallback 문자열
 *
 * 용도: 삭제된 케이블처럼 portIndex에서 미해소인 끝점의 이름을 report 등에서 참조할 때.
 */
export function cableEndpointName(
  cable: Pick<V2Cable, 'aPortId' | 'bPortId' | 'aRef' | 'bRef'>,
  portId: string,
  portIndex: PortIndex,
  fallback = '?',
): string {
  const entry = portIndex.get(portId);
  if (entry) return entry.asset.name;
  const ref = endpointRef(cable, portId);
  if (ref) return ref.assetName;
  return fallback;
}

/**
 * 3단 peer 해소 (fiber/power 공통 규칙):
 * 1. 로컬 effective: portIndex에서 반대편 포트 조회
 * 2. saved refs: cable.aRef/bRef 폴백 (remote = 다른 변전소 여부)
 * 3. null: 미해소
 */
export function resolvePeer(
  port: { id: string },
  cable: V2Cable,
  portIndex: PortIndex,
  localSubstationId: string
): PeerInfo | null {
  const otherPortId = cable.aPortId === port.id ? cable.bPortId : cable.aPortId;
  const entry = portIndex.get(otherPortId);

  if (entry) {
    // Tier 1: local effective peer
    return {
      assetName: entry.asset.name,
      portName: entry.port.name,
      substationName: null,
      remote: false,
    };
  }

  if (cable.aPortId === port.id && cable.bRef) {
    // Tier 2: saved bRef
    return {
      assetName: cable.bRef.assetName,
      portName: cable.bRef.portName,
      substationName: cable.bRef.substationName ?? null,
      remote: cable.bRef.substationId !== localSubstationId,
    };
  }

  if (cable.bPortId === port.id && cable.aRef) {
    // Tier 2: saved aRef
    return {
      assetName: cable.aRef.assetName,
      portName: cable.aRef.portName,
      substationName: cable.aRef.substationName ?? null,
      remote: cable.aRef.substationId !== localSubstationId,
    };
  }

  // Tier 3: unresolved
  return null;
}
