import prisma from '../config/prisma.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { CableType, Prisma } from '@prisma/client';
import { placementKindToKind, type PlacementKind } from './assetPlanMapper.js';

/** Build specification string from specTemplate format + specParams */
function buildCableSpecification(specTemplate: unknown, specParams: unknown): string | null {
  if (!specTemplate || !specParams || typeof specTemplate !== 'object') return null;
  const tmpl = specTemplate as { format?: string };
  const params = specParams as Record<string, unknown>;
  if (!tmpl.format) return null;
  let result = tmpl.format;
  for (const [key, value] of Object.entries(params)) {
    result = result.replace(`{${key}}`, String(value ?? ''));
  }
  return result;
}

// ==================== Types ====================

export interface CableEndpointRef {
  equipmentId: string | null;
  moduleId: string | null;
  name: string;
  floorId: string | null;
}

export interface CableDetail {
  id: string;
  source: CableEndpointRef;
  target: CableEndpointRef;
  cableType: CableType;
  label: string | null;
  length: number | null;
  color: string | null;
  pathPoints: unknown;
  description: string | null;
  fiberPathId: string | null;
  fiberPortNumber: number | null;
  fiberPathDescription: string | null;
  categoryId: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  displayColor: string | null;
  specification: string | null;
  specParams: unknown;
  pathLength: number | null;
  bufferLength: number;
  totalLength: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 케이블 endpoint 입력. equipmentId XOR moduleId — 한 쪽만 채워야 한다.
 */
export interface CableEndpointInput {
  equipmentId?: string | null;
  moduleId?: string | null;
}

export interface CreateCableInput {
  source: CableEndpointInput;
  target: CableEndpointInput;
  cableType: CableType;
  categoryId?: string | null;
  specParams?: unknown;
  label?: string | null;
  length?: number | null;
  color?: string | null;
  description?: string | null;
  fiberPathId?: string | null;
  fiberPortNumber?: number | null;
  pathPoints?: unknown;
  pathLength?: number | null;
  bufferLength?: number | null;
  totalLength?: number | null;
}

export interface UpdateCableInput {
  cableType?: CableType;
  label?: string | null;
  length?: number | null;
  color?: string | null;
  pathPoints?: unknown;
  description?: string | null;
  categoryId?: string | null;
  specParams?: unknown;
  fiberPathId?: string | null;
  fiberPortNumber?: number | null;
  pathLength?: number | null;
  bufferLength?: number | null;
  totalLength?: number | null;
}

// ==================== Helpers ====================

const cableInclude = {
  sourceEquipment: {
    select: { id: true, name: true, floorId: true, assetType: { select: { placementKind: true } } },
  },
  sourceModule: {
    select: {
      id: true,
      name: true,
      parentAssetId: true,
      parent: { select: { id: true, floorId: true } },
    },
  },
  targetEquipment: {
    select: { id: true, name: true, floorId: true, assetType: { select: { placementKind: true } } },
  },
  targetModule: {
    select: {
      id: true,
      name: true,
      parentAssetId: true,
      parent: { select: { id: true, floorId: true } },
    },
  },
  sourceCircuit: {
    select: { id: true, feederName: true, branchName: true, distributionEquipmentId: true },
  },
  targetCircuit: {
    select: { id: true, feederName: true, branchName: true, distributionEquipmentId: true },
  },
  fiberPath: {
    select: {
      id: true,
      ofdAId: true,
      ofdBId: true,
      ofdA: { select: { floor: { select: { substation: { select: { name: true } } } } } },
      ofdB: { select: { floor: { select: { substation: { select: { name: true } } } } } },
    },
  },
  category: { select: { code: true, name: true, displayColor: true, specTemplate: true } },
} as const;

/**
 * Resolve an endpoint payload into validated FK fields.
 * Throws if neither/both are populated, if the equipment is RACK kind, or if
 * the referenced row doesn't exist.
 *
 * Returns kind for upstream OFD-fiberPath validation.
 */
async function resolveEndpoint(
  side: 'source' | 'target',
  ep: CableEndpointInput,
): Promise<{
  equipmentId: string | null;
  moduleId: string | null;
  floorId: string | null;
  kind: PlacementKind | null;
}> {
  const hasEq = !!ep.equipmentId;
  const hasMod = !!ep.moduleId;
  if (hasEq === hasMod) {
    throw new ValidationError(
      `${side} endpoint 는 equipmentId 또는 moduleId 중 정확히 한 쪽만 지정해야 합니다.`,
    );
  }

  if (hasEq) {
    const eq = await prisma.asset.findUnique({
      where: { id: ep.equipmentId! },
      select: { id: true, floorId: true, assetType: { select: { placementKind: true } } },
    });
    if (!eq) throw new NotFoundError(`${side} 설비`);
    const kind = placementKindToKind(eq.assetType.placementKind);
    if (kind === 'RACK') {
      throw new ValidationError(`RACK 설비는 케이블 endpoint 가 될 수 없습니다. 랙 안 모듈에 연결하세요.`);
    }
    return { equipmentId: eq.id, moduleId: null, floorId: eq.floorId, kind };
  }

  const mod = await prisma.asset.findUnique({
    where: { id: ep.moduleId! },
    select: { id: true, parent: { select: { floorId: true } } },
  });
  if (!mod) throw new NotFoundError(`${side} 랙 모듈`);
  return { equipmentId: null, moduleId: mod.id, floorId: mod.parent?.floorId ?? null, kind: null };
}

/**
 * Build fiber path label oriented "자국-대국".
 * Module-level export so other services (e.g. floor.service) can reuse without
 * duplicating the orientation logic.
 */
export function buildFiberPathLabel(c: any): string | null {
  const fp = c.fiberPath;
  if (!fp) return null;

  const nameA = fp.ofdA?.floor?.substation?.name;
  const nameB = fp.ofdB?.floor?.substation?.name;
  if (!nameA || !nameB) return null;

  // 케이블의 한 쪽이 OFD Equipment 면 그쪽이 local
  const cableOfdId = c.sourceEquipmentId === fp.ofdAId || c.targetEquipmentId === fp.ofdAId
    ? fp.ofdAId
    : c.sourceEquipmentId === fp.ofdBId || c.targetEquipmentId === fp.ofdBId
      ? fp.ofdBId
      : null;
  if (!cableOfdId) return `${nameA}-${nameB}`;

  const localName = cableOfdId === fp.ofdAId ? nameA : nameB;
  const remoteName = cableOfdId === fp.ofdAId ? nameB : nameA;
  return `${localName}-${remoteName}`;
}

/**
 * OFD 한 쪽이라도 endpoint 면 fiberPathId + fiberPortNumber 필수.
 * 외부에서 호출하므로 export.
 */
export function assertOfdFiberPath(
  sourceKind: PlacementKind | null,
  targetKind: PlacementKind | null,
  fiberPathId: string | null | undefined,
  fiberPortNumber: number | null | undefined,
): void {
  const hasOfd = sourceKind === 'OFD' || targetKind === 'OFD';
  if (!hasOfd) return;
  if (!fiberPathId || !fiberPortNumber) {
    throw new ValidationError(
      'OFD 가 endpoint 인 케이블은 fiberPathId 와 fiberPortNumber 가 필요합니다.',
    );
  }
}

// ==================== Service ====================

class CableService {
  async getAll(): Promise<CableDetail[]> {
    const cables = await prisma.cable.findMany({
      include: cableInclude,
      orderBy: { createdAt: 'desc' },
    });
    return cables.map((c) => this.mapToDetail(c));
  }

  async getById(id: string): Promise<CableDetail> {
    const cable = await prisma.cable.findUnique({ where: { id }, include: cableInclude });
    if (!cable) throw new NotFoundError('케이블');
    return this.mapToDetail(cable);
  }

  async create(input: CreateCableInput, userId: string): Promise<CableDetail> {
    const source = await resolveEndpoint('source', input.source);
    const target = await resolveEndpoint('target', input.target);

    const sameEndpoint =
      (source.equipmentId && source.equipmentId === target.equipmentId) ||
      (source.moduleId && source.moduleId === target.moduleId);
    if (sameEndpoint) {
      throw new ValidationError('소스와 타겟 endpoint 는 서로 달라야 합니다.');
    }

    assertOfdFiberPath(source.kind, target.kind, input.fiberPathId, input.fiberPortNumber);

    const cable = await prisma.cable.create({
      data: {
        sourceEquipmentId: source.equipmentId,
        sourceModuleId: source.moduleId,
        targetEquipmentId: target.equipmentId,
        targetModuleId: target.moduleId,
        cableType: input.cableType,
        categoryId: input.categoryId ?? null,
        specParams: input.specParams as Prisma.InputJsonValue | undefined,
        label: input.label,
        length: input.length,
        color: input.color,
        description: input.description,
        fiberPathId: input.fiberPathId ?? null,
        fiberPortNumber: input.fiberPortNumber ?? null,
        pathPoints: input.pathPoints as Prisma.InputJsonValue | undefined,
        pathLength: input.pathLength ?? null,
        bufferLength: input.bufferLength ?? 4,
        totalLength: input.totalLength ?? null,
        createdById: userId,
        updatedById: userId,
      },
      include: cableInclude,
    });

    return this.mapToDetail(cable);
  }

  async update(id: string, input: UpdateCableInput, userId: string): Promise<CableDetail> {
    const existing = await prisma.cable.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('케이블');

    // Re-check OFD fiberPath requirement when fiber-related fields are touched.
    if (
      input.fiberPathId !== undefined ||
      input.fiberPortNumber !== undefined
    ) {
      const [srcKind, tgtKind] = await Promise.all([
        existing.sourceEquipmentId
          ? prisma.asset
              .findUnique({
                where: { id: existing.sourceEquipmentId },
                select: { assetType: { select: { placementKind: true } } },
              })
              .then((e) => placementKindToKind(e?.assetType.placementKind ?? null))
          : Promise.resolve<PlacementKind | null>(null),
        existing.targetEquipmentId
          ? prisma.asset
              .findUnique({
                where: { id: existing.targetEquipmentId },
                select: { assetType: { select: { placementKind: true } } },
              })
              .then((e) => placementKindToKind(e?.assetType.placementKind ?? null))
          : Promise.resolve<PlacementKind | null>(null),
      ]);
      const nextFiberPathId = input.fiberPathId !== undefined ? input.fiberPathId : existing.fiberPathId;
      const nextFiberPortNumber =
        input.fiberPortNumber !== undefined ? input.fiberPortNumber : existing.fiberPortNumber;
      assertOfdFiberPath(srcKind, tgtKind, nextFiberPathId, nextFiberPortNumber);
    }

    const cable = await prisma.cable.update({
      where: { id },
      data: {
        cableType: input.cableType,
        label: input.label,
        length: input.length,
        color: input.color,
        pathPoints: input.pathPoints as Prisma.InputJsonValue | undefined,
        description: input.description,
        categoryId: input.categoryId,
        specParams: input.specParams as Prisma.InputJsonValue | undefined,
        fiberPathId: input.fiberPathId,
        fiberPortNumber: input.fiberPortNumber,
        pathLength: input.pathLength,
        bufferLength: input.bufferLength ?? undefined,
        totalLength: input.totalLength,
        updatedById: userId,
      },
      include: cableInclude,
    });

    return this.mapToDetail(cable);
  }

  async delete(id: string): Promise<void> {
    const cable = await prisma.cable.findUnique({ where: { id } });
    if (!cable) throw new NotFoundError('케이블');
    await prisma.cable.delete({ where: { id } });
  }

  /**
   * 도면(Floor) 에 연결된 모든 케이블 조회.
   * Equipment endpoint 의 floorId 또는 RackModule.rack.floorId 가 매칭되는 케이블.
   */
  async getByFloorId(floorId: string): Promise<CableDetail[]> {
    const floor = await prisma.floor.findUnique({ where: { id: floorId } });
    if (!floor) throw new NotFoundError('층');

    const cables = await prisma.cable.findMany({
      where: {
        OR: [
          { sourceEquipment: { floorId } },
          { targetEquipment: { floorId } },
          { sourceModule: { parent: { floorId } } },
          { targetModule: { parent: { floorId } } },
        ],
      },
      include: cableInclude,
      orderBy: { createdAt: 'desc' },
    });

    return cables.map((c) => this.mapToDetail(c));
  }

  /**
   * 변전소(Substation) 에 연결된 모든 케이블 조회.
   * 변전소 소속 Asset(설비/모듈) 또는 그 설비의 DistributionCircuit 이
   * source/target endpoint 인 케이블.
   */
  async getBySubstationId(substationId: string): Promise<CableDetail[]> {
    const ids = (
      await prisma.asset.findMany({ where: { substationId }, select: { id: true } })
    ).map((a) => a.id);
    const circuitIds = (
      await prisma.distributionCircuit.findMany({
        where: { distributionEquipmentId: { in: ids } },
        select: { id: true },
      })
    ).map((c) => c.id);

    const cables = await prisma.cable.findMany({
      where: {
        OR: [
          { sourceEquipmentId: { in: ids } },
          { targetEquipmentId: { in: ids } },
          { sourceModuleId: { in: ids } },
          { targetModuleId: { in: ids } },
          { sourceCircuitId: { in: circuitIds } },
          { targetCircuitId: { in: circuitIds } },
        ],
      },
      include: cableInclude,
      orderBy: { createdAt: 'desc' },
    });

    return cables.map((c) => this.mapToDetail(c));
  }

  /**
   * 특정 자산(Asset) 에 연결된 모든 케이블 조회.
   * 자산 자체, 그 자산의 자식 모듈, 또는 자산의 DistributionCircuit 이
   * source/target endpoint 인 케이블.
   */
  async getByAssetId(assetId: string): Promise<CableDetail[]> {
    const moduleIds = (
      await prisma.asset.findMany({ where: { parentAssetId: assetId }, select: { id: true } })
    ).map((m) => m.id);
    const endpointIds = [assetId, ...moduleIds];
    const circuitIds = (
      await prisma.distributionCircuit.findMany({
        where: { distributionEquipmentId: assetId },
        select: { id: true },
      })
    ).map((c) => c.id);

    const cables = await prisma.cable.findMany({
      where: {
        OR: [
          { sourceEquipmentId: { in: endpointIds } },
          { targetEquipmentId: { in: endpointIds } },
          { sourceModuleId: { in: endpointIds } },
          { targetModuleId: { in: endpointIds } },
          { sourceCircuitId: { in: circuitIds } },
          { targetCircuitId: { in: circuitIds } },
        ],
      },
      include: cableInclude,
      orderBy: { createdAt: 'desc' },
    });

    return cables.map((c) => this.mapToDetail(c));
  }

  // 내부 — endpoint 모양을 정규화
  private endpointFromIncluded(
    side: 'source' | 'target',
    c: any,
  ): CableEndpointRef {
    const equipment = side === 'source' ? c.sourceEquipment : c.targetEquipment;
    const module = side === 'source' ? c.sourceModule : c.targetModule;
    if (equipment) {
      return {
        equipmentId: equipment.id,
        moduleId: null,
        name: equipment.name,
        floorId: equipment.floorId ?? null,
      };
    }
    if (module) {
      return {
        equipmentId: null,
        moduleId: module.id,
        name: module.name,
        floorId: module.parent?.floorId ?? null,
      };
    }
    const circuit = side === 'source' ? c.sourceCircuit : c.targetCircuit;
    if (circuit) {
      return {
        equipmentId: circuit.distributionEquipmentId,
        moduleId: null,
        name: `${circuit.feederName} / ${circuit.branchName}`,
        floorId: null,
      };
    }
    return { equipmentId: null, moduleId: null, name: '', floorId: null };
  }

  private mapToDetail(c: any): CableDetail {
    return {
      id: c.id,
      source: this.endpointFromIncluded('source', c),
      target: this.endpointFromIncluded('target', c),
      cableType: c.cableType,
      label: c.label,
      length: c.length,
      color: c.color,
      pathPoints: c.pathPoints,
      description: c.description,
      fiberPathId: c.fiberPathId ?? null,
      fiberPortNumber: c.fiberPortNumber ?? null,
      fiberPathDescription: buildFiberPathLabel(c),
      categoryId: c.categoryId ?? null,
      categoryCode: c.category?.code ?? null,
      categoryName: c.category?.name ?? null,
      displayColor: c.category?.displayColor ?? null,
      specification: buildCableSpecification(c.category?.specTemplate, c.specParams),
      specParams: c.specParams ?? null,
      pathLength: c.pathLength ?? null,
      bufferLength: c.bufferLength ?? 4,
      totalLength: c.totalLength ?? null,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }

}

export const cableService = new CableService();
