import type { V2Asset, V2Cable } from './types';

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
