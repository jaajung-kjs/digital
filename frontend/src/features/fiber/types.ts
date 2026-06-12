export interface FiberPathDetail {
  id: string;
  ofdA: { id: string; name: string; substationName: string; floorId: string | null };
  ofdB: { id: string; name: string; substationName: string; floorId: string | null };
  portCount: number;
  description: string | null;
  ports: FiberPortStatus[];
  createdAt: string;
  updatedAt: string;
}

export interface FiberPortStatus {
  portNumber: number;
  sideA: FiberPortUsage | null;
  sideB: FiberPortUsage | null;
}

export interface FiberPortUsage {
  cableId: string;
  assetId: string;
  assetName: string;
}

/** 광코어 희소 메타(선번장) — DB FiberCore 와 1:1. updatedAt 은 OCC 용. */
export interface FiberCore {
  id: string;
  fiberPathId: string;
  coreNumber: number;
  purpose: string | null;
  circuitText: string | null;
  spliceType: string | null;
  usageOverride: string | null;
  updatedAt?: string | null;
}

/** 선번장 한 행 — 도출 점유(near/far/occupied) + 저장 메타(용도/수용내역/융착/사용). */
export interface FiberCoreRow {
  fiberPathId: string;
  coreNumber: number;
  near: FiberPortUsage | null;   // 보고 있는 OFD(로컬) 측 자산
  far: FiberPortUsage | null;    // 상대국 측 자산
  occupied: boolean;
  coreRecordId: string | null;   // FiberCore 행 id(없으면 null=메타 미입력 → 편집 시 신규 생성)
  purpose: string | null;
  circuitText: string | null;
  spliceType: string | null;
  usage: '사용' | '미사용';       // usageOverride ?? (occupied ? 사용 : 미사용)
}
