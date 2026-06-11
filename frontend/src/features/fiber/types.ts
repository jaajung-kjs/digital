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

export interface CreateFiberPathInput {
  ofdAId: string;
  ofdBId: string;
  portCount: 24 | 48;
  description?: string;
}
