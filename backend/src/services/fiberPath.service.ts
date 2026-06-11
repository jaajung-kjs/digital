import prisma from '../config/prisma.js';
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors.js';

// ==================== Types ====================

export interface FiberPathDetail {
  id: string;
  ofdA: { id: string; name: string; substationName: string; floorId: string | null };
  ofdB: { id: string; name: string; substationName: string; floorId: string | null };
  portCount: number;
  description: string | null;
  ports: FiberPortStatus[];
  createdAt: Date;
  updatedAt: Date;
}

export interface FiberPortStatus {
  portNumber: number;
  sideA: { cableId: string; equipmentId: string; equipmentName: string } | null;
  sideB: { cableId: string; equipmentId: string; equipmentName: string } | null;
}

export interface CreateFiberPathInput {
  ofdAId: string;
  ofdBId: string;
  portCount: number;
  description?: string;
}

// ==================== Helpers ====================

const equipmentWithSubstation = {
  select: {
    id: true,
    name: true,
    floorId: true,
    floor: {
      select: {
        id: true,
        substation: { select: { name: true } },
      },
    },
  },
} as const;

function getSubstationName(equipment: any): string {
  return equipment.floor?.substation?.name ?? '';
}

function getFloorId(equipment: any): string | null {
  return equipment.floorId ?? equipment.floor?.id ?? null;
}

// Cable include shape — endpoint 는 equipment 또는 rackModule 중 한 쪽.
// (cable.service.ts 와 동일한 polymorphic 패턴; fiberPath 화면에서도 모듈 endpoint 를 표시해야
//  port status build 시 null deref 없이 "OFD 반대편" 을 식별할 수 있다.)
// 단계4c — endpoint = 단일 Asset 노드. source/target asset 만 조인한다.
const fiberPathCablesInclude = {
  cables: {
    include: {
      sourceAsset: { select: { id: true, name: true } },
      targetAsset: { select: { id: true, name: true } },
    },
  },
} as const;

// OFD 가 cable 한 쪽 endpoint 일 때 "반대편" 을 {equipmentId, equipmentName} 형태로 반환.
// endpoint = 단일 Asset 이므로 반대편 asset 의 id 를 그대로 반환 — frontend 의 endpoint 모델
// (asset id space) 과 일치한다. 그래서 BFS 의 노드 id 와 fiberPath sideX.equipmentId 가 같은 ID space.
function resolveOtherEndpoint(
  cable: any,
  ofdSide: 'source' | 'target',
): { equipmentId: string; equipmentName: string } | null {
  const other = ofdSide === 'source' ? cable.targetAsset : cable.sourceAsset;
  if (other) return { equipmentId: other.id, equipmentName: other.name };
  return null;
}

// ==================== Service ====================

class FiberPathService {
  async getByOfdId(ofdId: string): Promise<FiberPathDetail[]> {
    const paths = await prisma.fiberPath.findMany({
      where: {
        OR: [{ ofdAId: ofdId }, { ofdBId: ofdId }],
      },
      include: {
        ofdA: equipmentWithSubstation,
        ofdB: equipmentWithSubstation,
        ...fiberPathCablesInclude,
      },
      orderBy: { createdAt: 'desc' },
    });

    return paths.map((p) => this.mapToDetail(p));
  }

  /**
   * 전체 광경로 리스트 — 네트워크 토폴로지 시각화의 single fetch source.
   * 응답 shape 는 getByOfdId 와 동일 (ports[].sideA/sideB 포함) 이라 frontend 단일 코드 경로.
   */
  async getAll(): Promise<FiberPathDetail[]> {
    const paths = await prisma.fiberPath.findMany({
      include: {
        ofdA: equipmentWithSubstation,
        ofdB: equipmentWithSubstation,
        ...fiberPathCablesInclude,
      },
      orderBy: { createdAt: 'desc' },
    });
    return paths.map((p) => this.mapToDetail(p));
  }

  async getById(id: string): Promise<FiberPathDetail> {
    const path = await prisma.fiberPath.findUnique({
      where: { id },
      include: {
        ofdA: equipmentWithSubstation,
        ofdB: equipmentWithSubstation,
        ...fiberPathCablesInclude,
      },
    });

    if (!path) throw new NotFoundError('경로');
    return this.mapToDetail(path);
  }

  async create(input: CreateFiberPathInput, userId: string): Promise<FiberPathDetail> {
    // Invariant: portCount must be 24 or 48
    if (input.portCount !== 24 && input.portCount !== 48) {
      throw new ValidationError('포트 수는 24 또는 48이어야 합니다.');
    }

    // Invariant: no self-loop
    if (input.ofdAId === input.ofdBId) {
      throw new ValidationError('OFD A와 OFD B는 서로 달라야 합니다.');
    }

    // Validate both assets exist and are OFD (AssetType.placementKind === 'OFD')
    const [ofdA, ofdB] = await Promise.all([
      prisma.asset.findUnique({
        where: { id: input.ofdAId },
        select: { id: true, assetType: { select: { placementKind: true } } },
      }),
      prisma.asset.findUnique({
        where: { id: input.ofdBId },
        select: { id: true, assetType: { select: { placementKind: true } } },
      }),
    ]);

    if (!ofdA) throw new NotFoundError('OFD A 설비');
    if (!ofdB) throw new NotFoundError('OFD B 설비');

    if (ofdA.assetType.placementKind !== 'OFD') {
      throw new ValidationError('OFD A 설비의 종류가 OFD가 아닙니다.');
    }
    if (ofdB.assetType.placementKind !== 'OFD') {
      throw new ValidationError('OFD B 설비의 종류가 OFD가 아닙니다.');
    }

    // Normalize UUID order: ofdAId < ofdBId (alphabetical)
    const [normalizedAId, normalizedBId] =
      input.ofdAId < input.ofdBId
        ? [input.ofdAId, input.ofdBId]
        : [input.ofdBId, input.ofdAId];

    // Check for duplicate path
    const existing = await prisma.fiberPath.findUnique({
      where: { ofdAId_ofdBId: { ofdAId: normalizedAId, ofdBId: normalizedBId } },
    });

    if (existing) {
      throw new ConflictError('해당 OFD 간 경로가 이미 존재합니다.');
    }

    const created = await prisma.fiberPath.create({
      data: {
        ofdAId: normalizedAId,
        ofdBId: normalizedBId,
        portCount: input.portCount,
        description: input.description,
        createdById: userId,
        updatedById: userId,
      },
      include: {
        ofdA: equipmentWithSubstation,
        ofdB: equipmentWithSubstation,
        ...fiberPathCablesInclude,
      },
    });

    return this.mapToDetail(created);
  }

  async delete(id: string): Promise<void> {
    const path = await prisma.fiberPath.findUnique({ where: { id } });
    if (!path) throw new NotFoundError('경로');
    await prisma.fiberPath.delete({ where: { id } });
  }

  private buildPortStatuses(fiberPath: any): FiberPortStatus[] {
    const ports: FiberPortStatus[] = [];
    const cables: any[] = fiberPath.cables || [];
    const ofdAId: string = fiberPath.ofdAId;
    const ofdBId: string = fiberPath.ofdBId;

    for (let portNumber = 1; portNumber <= fiberPath.portCount; portNumber++) {
      let sideA: FiberPortStatus['sideA'] = null;
      let sideB: FiberPortStatus['sideB'] = null;

      for (const cable of cables) {
        if (cable.fiberPortNumber !== portNumber) continue;

        // OFD 는 단일 asset endpoint → sourceAssetId/targetAssetId 로 식별.
        // 반대편 endpoint 도 단일 asset 이라 resolveOtherEndpoint 가 그대로 반환.
        const attach =
          cable.sourceAssetId === ofdAId ? { fpSide: 'A' as const, ofdSide: 'source' as const } :
          cable.targetAssetId === ofdAId ? { fpSide: 'A' as const, ofdSide: 'target' as const } :
          cable.sourceAssetId === ofdBId ? { fpSide: 'B' as const, ofdSide: 'source' as const } :
          cable.targetAssetId === ofdBId ? { fpSide: 'B' as const, ofdSide: 'target' as const } :
          null;
        if (!attach) continue;

        const other = resolveOtherEndpoint(cable, attach.ofdSide);
        if (!other) continue;
        const usage = {
          cableId: cable.id,
          equipmentId: other.equipmentId,
          equipmentName: other.equipmentName,
        };
        if (attach.fpSide === 'A') sideA = usage;
        else sideB = usage;
      }

      ports.push({ portNumber, sideA, sideB });
    }

    return ports;
  }

  private mapToDetail(p: any): FiberPathDetail {
    return {
      id: p.id,
      ofdA: {
        id: p.ofdA.id,
        name: p.ofdA.name,
        substationName: getSubstationName(p.ofdA),
        floorId: getFloorId(p.ofdA),
      },
      ofdB: {
        id: p.ofdB.id,
        name: p.ofdB.name,
        substationName: getSubstationName(p.ofdB),
        floorId: getFloorId(p.ofdB),
      },
      portCount: p.portCount,
      description: p.description,
      ports: this.buildPortStatuses(p),
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }
}

export const fiberPathService = new FiberPathService();
