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
  // 단계4b — endpoint 는 단일 Asset 노드. assetId 가 곧 정밀 endpoint id(설비/모듈/분기).
  assetId: string | null;
  name: string;
  kind: PlacementKind | null;
  floorId: string | null;
}

export interface CableDetail {
  id: string;
  source: CableEndpointRef;
  target: CableEndpointRef;
  // endpoint 의 단일 Asset id (source/target.assetId 와 동일 값, 평탄 노출).
  sourceAssetId: string | null;
  targetAssetId: string | null;
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

export interface CreateCableInput {
  // 단계4b — endpoint 는 단일 Asset 노드(설비/랙 모듈/분전 분기).
  sourceAssetId: string;
  targetAssetId: string;
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
  // 단계4b — endpoint = 단일 Asset 노드. source/target asset 만 조인한다.
  // floorId(직접 배치면 자신) + parent.floorId(모듈은 랙) + grandparent.floorId
  // (분기는 feeder→분전반) 까지 끌어와 endpoint 의 anchor floor 를 derive.
  sourceAsset: {
    select: {
      id: true,
      name: true,
      floorId: true,
      assetType: { select: { placementKind: true } },
      parent: { select: { floorId: true, parent: { select: { floorId: true } } } },
    },
  },
  targetAsset: {
    select: {
      id: true,
      name: true,
      floorId: true,
      assetType: { select: { placementKind: true } },
      parent: { select: { floorId: true, parent: { select: { floorId: true } } } },
    },
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
 * Resolve a single-asset endpoint into validated FK + kind.
 * Throws if the asset doesn't exist or is a RACK/DISTRIBUTION container
 * (connect to the inner module / branch instead).
 */
async function resolveEndpoint(
  side: 'source' | 'target',
  assetId: string,
): Promise<{ assetId: string; floorId: string | null; kind: PlacementKind | null }> {
  const a = await prisma.asset.findUnique({
    where: { id: assetId },
    select: {
      id: true,
      floorId: true,
      assetType: { select: { placementKind: true } },
      parent: { select: { floorId: true, parent: { select: { floorId: true } } } },
    },
  });
  if (!a) throw new NotFoundError(`${side} endpoint asset`);
  const kind = placementKindToKind(a.assetType.placementKind);
  if (kind === 'RACK') {
    throw new ValidationError(`${side}: RACK 설비는 케이블 endpoint 가 될 수 없습니다. 랙 안 모듈에 연결하세요.`);
  }
  if (kind === 'DISTRIBUTION') {
    throw new ValidationError(`${side}: 분전반은 케이블 endpoint 가 될 수 없습니다. 회로(분기)에 연결하세요.`);
  }
  const floorId = a.floorId ?? a.parent?.floorId ?? a.parent?.parent?.floorId ?? null;
  return { assetId: a.id, floorId, kind };
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

  // 케이블의 한 쪽 endpoint asset 이 OFD 면 그쪽이 local
  const cableOfdId = c.sourceAssetId === fp.ofdAId || c.targetAssetId === fp.ofdAId
    ? fp.ofdAId
    : c.sourceAssetId === fp.ofdBId || c.targetAssetId === fp.ofdBId
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
    const source = await resolveEndpoint('source', input.sourceAssetId);
    const target = await resolveEndpoint('target', input.targetAssetId);

    if (source.assetId === target.assetId) {
      throw new ValidationError('소스와 타겟 endpoint 는 서로 달라야 합니다.');
    }

    assertOfdFiberPath(source.kind, target.kind, input.fiberPathId, input.fiberPortNumber);

    const cable = await prisma.cable.create({
      data: {
        sourceAssetId: source.assetId,
        targetAssetId: target.assetId,
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
        existing.sourceAssetId
          ? prisma.asset
              .findUnique({
                where: { id: existing.sourceAssetId },
                select: { assetType: { select: { placementKind: true } } },
              })
              .then((e) => placementKindToKind(e?.assetType.placementKind ?? null))
          : Promise.resolve<PlacementKind | null>(null),
        existing.targetAssetId
          ? prisma.asset
              .findUnique({
                where: { id: existing.targetAssetId },
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
   * endpoint asset 의 anchor floor(자신 / 부모 랙 / 분기→피더→분전반)가 매칭되는 케이블.
   */
  async getByFloorId(floorId: string): Promise<CableDetail[]> {
    const floor = await prisma.floor.findUnique({ where: { id: floorId } });
    if (!floor) throw new NotFoundError('층');

    const cables = await prisma.cable.findMany({
      where: {
        OR: [
          { sourceAsset: { floorId } },
          { targetAsset: { floorId } },
          { sourceAsset: { parent: { floorId } } },
          { targetAsset: { parent: { floorId } } },
          { sourceAsset: { parent: { parent: { floorId } } } },
          { targetAsset: { parent: { parent: { floorId } } } },
        ],
      },
      include: cableInclude,
      orderBy: { createdAt: 'desc' },
    });

    return cables.map((c) => this.mapToDetail(c));
  }

  /**
   * 변전소(Substation) 에 연결된 모든 케이블 조회.
   * endpoint asset(설비/모듈/분기 — 모두 substationId 보유)이 이 변전소 소속인 케이블.
   */
  async getBySubstationId(substationId: string): Promise<CableDetail[]> {
    const cables = await prisma.cable.findMany({
      where: {
        OR: [
          { sourceAsset: { substationId } },
          { targetAsset: { substationId } },
        ],
      },
      include: cableInclude,
      orderBy: { createdAt: 'desc' },
    });

    return cables.map((c) => this.mapToDetail(c));
  }

  /**
   * 특정 자산(Asset) 에 연결된 모든 케이블 조회.
   * 자산 자체, 또는 그 자산의 자식(모듈/피더) 및 손자(분기) endpoint 케이블.
   */
  async getByAssetId(assetId: string): Promise<CableDetail[]> {
    const cables = await prisma.cable.findMany({
      where: {
        OR: [
          { sourceAssetId: assetId },
          { targetAssetId: assetId },
          { sourceAsset: { parentAssetId: assetId } },
          { targetAsset: { parentAssetId: assetId } },
          { sourceAsset: { parent: { parentAssetId: assetId } } },
          { targetAsset: { parent: { parentAssetId: assetId } } },
        ],
      },
      include: cableInclude,
      orderBy: { createdAt: 'desc' },
    });

    return cables.map((c) => this.mapToDetail(c));
  }

  // 내부 — endpoint asset → endpoint ref. assetId/name/kind/floorId(anchor) 노출.
  private endpointFromIncluded(
    side: 'source' | 'target',
    c: any,
  ): CableEndpointRef {
    const asset = side === 'source' ? c.sourceAsset : c.targetAsset;
    if (!asset) return { assetId: null, name: '', kind: null, floorId: null };
    const floorId =
      asset.floorId ?? asset.parent?.floorId ?? asset.parent?.parent?.floorId ?? null;
    return {
      assetId: asset.id,
      name: asset.name,
      kind: placementKindToKind(asset.assetType?.placementKind ?? null),
      floorId,
    };
  }

  private mapToDetail(c: any): CableDetail {
    return {
      id: c.id,
      source: this.endpointFromIncluded('source', c),
      target: this.endpointFromIncluded('target', c),
      sourceAssetId: c.sourceAssetId ?? null,
      targetAssetId: c.targetAssetId ?? null,
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
