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
