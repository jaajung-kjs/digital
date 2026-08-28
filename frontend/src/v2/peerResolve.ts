import type { V2Asset, V2Cable, V2CableRef } from './types';

/** Peer(대국) 표시 정보 — fiber/power 셀렉터 공유 형태 */
export interface PeerInfo extends Endpoint {
  substationName: string | null;
  remote: boolean;
}

/**
 * 끝점 하나를 부르는 데 필요한 것 — **`설비명 - 장비이름#포트번호`**.
 *
 * 장비 이름만으로는 어느 것인지 못 고른다. 「광단말 A」는 송광치마다 하나씩 있고, 「슬롯 1」은
 * OFD 마다 있다. 포트도 이름(`광 3`·`포트 12`·`전원 출력 1`)은 종류마다 제각각이라 두 자리를
 * 견줄 수가 없어 번호로 적는다.
 */
export interface Endpoint {
  /** 이 장비를 담고 있는 설비. 설비 자신이 끝점이면 없다. */
  assemblyName: string | null;
  assetName: string;
  portName: string;
  portIndex: number;
}

/**
 * 끝점 이름을 **앞자리와 번호**로 가른다.
 *
 * 한 판의 여러 줄은 앞이 다 같고(`송광치 - 광단말 A`) 뒤의 번호만 다르다. 칸(`PeerCell`)이
 * 앞을 한 단 흐리게 두려면 그 경계를 알아야 하는데, 예전에는 칸이 이름에서 `#` 를 찾아
 * 갈랐다 — 이름을 짓는 곳이 직접 알려 주면 그 하나가 바뀌어도 칸은 그대로다.
 */
export function endpointLabelParts(e: Endpoint): { prefix: string; tail: string } {
  return { prefix: e.assemblyName ? `${e.assemblyName} - ${e.assetName}` : e.assetName, tail: `#${e.portIndex}` };
}

/** 끝점을 부르는 **한 가지** 이름 — 화면마다 다르게 적던 것을 여기로 모았다. */
export function endpointLabel(e: Endpoint): string {
  const { prefix, tail } = endpointLabelParts(e);
  return prefix + tail;
}

export interface PortIndexEntry {
  port: V2Asset['ports'][number];
  asset: V2Asset;
  /** 이 장비를 담고 있는 설비의 이름 — 끝점을 부를 때 앞에 붙는다. */
  assemblyName: string | null;
}

export type PortIndex = Map<string, PortIndexEntry>;

/** portId → { port, asset } 인덱스 (호이스트해 O(1) 조회) */
export function buildPortIndex(assets: V2Asset[]): PortIndex {
  const nameById = new Map(assets.map((a) => [a.id, a.name]));
  const index: PortIndex = new Map();
  for (const a of assets) {
    const assemblyName = a.parentAssetId ? nameById.get(a.parentAssetId) ?? null : null;
    for (const p of a.ports) {
      index.set(p.id, { port: p, asset: a, assemblyName });
    }
  }
  return index;
}

/**
 * 이 매체의 포트를 가진 **장비를 담고 있는 설비** 목록.
 *
 * 예전에는 (자산, 컨테이너) 쌍을 돌려줬다 — 자리를 장비 품목이 선언했고 컨테이너가 여럿일
 * 수 있었기 때문이다. 이제 자리는 설비 품목의 격자 하나뿐이라 단위가 설비 하나로 줄었다.
 *
 * 결과는 이름순.
 */
export function mediumContainers(
  assets: V2Asset[],
  medium: string,
  /** 그 매체 안에서 더 좁히고 싶을 때 — 선번장은 **다심** 포트를 가진 것만 본다. */
  where?: (port: V2Asset['ports'][number]) => boolean,
): V2Asset[] {
  const holders = new Set<string>();
  for (const asset of assets) {
    const has = asset.ports.some((p) => p.medium === medium && (where?.(p) ?? true));
    if (asset.parentAssetId && has) holders.add(asset.parentAssetId);
  }
  return assets.filter((a) => holders.has(a.id)).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * 그 포트에 물린 케이블 — 어느 쪽 끝인지는 묻지 않는다.
 *
 * 선번장과 계통이 각자 같은 줄을 적고 있었다(`byA.get(id) ?? byB.get(id) ?? null`). 케이블은
 * 방향이 없고 끝이 둘일 뿐이라, 「내 쪽이 a 인가 b 인가」는 어디서도 물을 일이 아니다.
 */
export function cableAt(
  portId: string,
  byA: Map<string, V2Cable>,
  byB: Map<string, V2Cable>,
): V2Cable | null {
  return byA.get(portId) ?? byB.get(portId) ?? null;
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
      assemblyName: entry.assemblyName,
      assetName: entry.asset.name,
      portName: entry.port.name,
      portIndex: entry.port.index,
      substationName: null,
      remote: false,
    };
  }

  // Tier 2: 저장된 ref — 이 워킹카피에 없는 끝점(상대 국·삭제된 자산)은 이게 아는 전부다.
  const ref = endpointRef(cable, otherPortId);
  if (ref) {
    return {
      assemblyName: ref.assemblyName ?? null,
      assetName: ref.assetName,
      portName: ref.portName,
      portIndex: ref.portIndex,
      substationName: ref.substationName ?? null,
      remote: ref.substationId !== localSubstationId,
    };
  }

  // Tier 3: unresolved
  return null;
}
