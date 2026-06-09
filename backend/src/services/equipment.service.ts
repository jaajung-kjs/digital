import prisma from '../config/prisma.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';
import { Prisma } from '@prisma/client';
import type { Asset, AssetType } from '@prisma/client';
import { placementKindToKind, kindToPlacementCode, type PlacementKind } from './assetPlanMapper.js';

// ==================== Types ====================

/**
 * 과거 EquipmentKind enum 자리. Asset 모델로 이행하면서 enum 은 삭제됐고,
 * 프론트/컨트롤러 계약은 동일한 string union 으로 유지된다. ('DIST' 가 아닌 'DISTRIBUTION')
 */
export type EquipmentKind = PlacementKind;

export interface EquipmentDetail {
  id: string;
  floorId: string;
  kind: EquipmentKind;
  name: string;
  positionX: number;
  positionY: number;
  width2d: number;
  height2d: number;
  rotation: number;
  totalU: number | null;
  installDate: Date | null;
  manager: string | null;
  description: string | null;
  properties: unknown;
  frontImageUrl: string | null;
  rearImageUrl: string | null;
  height3d: number | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateFloorPlanEquipmentInput {
  kind: EquipmentKind;
  name: string;
  positionX: number;
  positionY: number;
  width2d: number;
  height2d: number;
  rotation?: number;
  totalU?: number | null;
  height3d?: number | null;
  installDate?: string;
  manager?: string;
  description?: string;
  properties?: unknown;
}

export interface UpdateEquipmentInput {
  kind?: EquipmentKind;
  name?: string;
  positionX?: number;
  positionY?: number;
  width2d?: number;
  height2d?: number;
  rotation?: number;
  totalU?: number | null;
  height3d?: number | null;
  frontImageUrl?: string | null;
  rearImageUrl?: string | null;
  installDate?: string | null;
  manager?: string | null;
  description?: string | null;
  properties?: unknown;
  sortOrder?: number;
}

type AssetWithType = Asset & { assetType: AssetType };

// ==================== Service ====================

class EquipmentService {
  /**
   * 배치된 top-level Asset → EquipmentDetail.
   * 과거 Equipment 테이블 전용 필드(frontImageUrl/rearImageUrl/height3d)는 Asset 에 없으므로
   * null 로 채운다 (사진은 EquipmentPhoto 관계로 별도 관리됨).
   */
  private mapToDetail(a: AssetWithType): EquipmentDetail {
    const kind = placementKindToKind(a.assetType.placementKind);
    if (!kind) throw new Error(`Asset ${a.id} 는 placementKind 가 없어 설비로 매핑할 수 없습니다.`);
    return {
      id: a.id,
      floorId: a.floorId ?? '',
      kind,
      name: a.name,
      positionX: a.positionX ?? 0,
      positionY: a.positionY ?? 0,
      width2d: a.width2d ?? 0,
      height2d: a.height2d ?? 0,
      rotation: a.rotation,
      totalU: a.totalU,
      installDate: a.installDate,
      manager: a.manager,
      description: a.description,
      properties: a.attributes,
      frontImageUrl: null,
      rearImageUrl: null,
      height3d: null,
      sortOrder: a.sortOrder,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  }

  /** placement code(RACK/OFD/DIST/...) 로 AssetType 해석. */
  private async resolveAssetType(kind: EquipmentKind): Promise<AssetType> {
    const code = kindToPlacementCode(kind);
    return await prisma.assetType.findUniqueOrThrow({ where: { code } });
  }

  /** 도면 객체 목록 조회 (kind 필터 지원). */
  async getAll(filters?: { kind?: EquipmentKind }): Promise<(EquipmentDetail & { substationName?: string })[]> {
    const where: Prisma.AssetWhereInput = {
      parentAssetId: null,
      floorId: { not: null },
      assetType: { placementKind: { not: null } },
    };
    if (filters?.kind) {
      where.assetType = { placementKind: kindToPlacementCode(filters.kind) };
    }

    const assets = await prisma.asset.findMany({
      where,
      include: {
        assetType: true,
        floor: { include: { substation: { select: { name: true } } } },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    return assets.map((a) => ({
      ...this.mapToDetail(a),
      substationName: a.floor?.substation?.name ?? undefined,
    }));
  }

  /** 도면(층)에 배치된 설비 조회 */
  async getByFloorId(floorId: string): Promise<EquipmentDetail[]> {
    const floor = await prisma.floor.findUnique({ where: { id: floorId } });
    if (!floor) throw new NotFoundError('층');

    const assets = await prisma.asset.findMany({
      where: { floorId, parentAssetId: null, assetType: { placementKind: { not: null } } },
      include: { assetType: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });

    return assets.map((a) => this.mapToDetail(a));
  }

  async getById(id: string): Promise<EquipmentDetail> {
    const asset = await prisma.asset.findFirst({ where: { id, parentAssetId: null }, include: { assetType: true } });
    if (!asset) throw new NotFoundError('설비');
    return this.mapToDetail(asset);
  }

  /** 도면(Floor)에 직접 배치하는 설비 생성 */
  async createOnFloorPlan(
    floorId: string,
    input: CreateFloorPlanEquipmentInput,
    userId: string
  ): Promise<EquipmentDetail> {
    const floor = await prisma.floor.findUnique({ where: { id: floorId } });
    if (!floor) throw new NotFoundError('층');

    // NOTE: 변전소당 OFD 1개 제약 제거 — 변전소는 여러 광단국(OFD)을 가질 수 있다.

    const assetType = await this.resolveAssetType(input.kind);

    const asset = await prisma.asset.create({
      data: {
        substationId: floor.substationId,
        floorId,
        assetTypeId: assetType.id,
        parentAssetId: null,
        name: input.name,
        positionX: input.positionX,
        positionY: input.positionY,
        width2d: input.width2d,
        height2d: input.height2d,
        rotation: input.rotation ?? 0,
        totalU: input.kind === 'RACK' ? (input.totalU ?? 42) : null,
        installDate: input.installDate ? new Date(input.installDate) : null,
        manager: input.manager,
        description: input.description,
        attributes: (input.properties ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        createdById: userId,
        updatedById: userId,
      },
      include: { assetType: true },
    });

    return this.mapToDetail(asset);
  }

  async update(id: string, input: UpdateEquipmentInput, userId: string): Promise<EquipmentDetail> {
    const existing = await prisma.asset.findFirst({ where: { id, parentAssetId: null }, include: { assetType: true } });
    if (!existing) throw new NotFoundError('설비');

    const existingKind = (placementKindToKind(existing.assetType.placementKind) ?? 'RACK') as EquipmentKind;

    // NOTE: 변전소당 OFD 1개 제약 제거 — OFD 로 전환 시 중복 검사 없음.

    // kind 변경 시 assetType 재해석
    let assetTypeId: string | undefined;
    if (input.kind !== undefined && input.kind !== existingKind) {
      assetTypeId = (await this.resolveAssetType(input.kind)).id;
    }

    // totalU 정규화: RACK kind 만 의미를 가짐.
    //   - RACK 인데 totalU 가 명시적 null/undefined 면 기존 값 유지(없으면 42)
    //   - kind 가 RACK 이 아니면 totalU 강제로 null
    let totalU: number | null | undefined = input.totalU;
    const effectiveKind = input.kind ?? existingKind;
    if (effectiveKind === 'RACK') {
      if (input.kind === 'RACK' && existingKind !== 'RACK') {
        // 다른 kind → RACK 으로 전환: totalU 가 없으면 42 부여
        totalU = input.totalU ?? 42;
      }
    } else if (input.kind !== undefined) {
      // 명시적으로 RACK 이 아닌 kind 로 변경 → totalU null 강제
      totalU = null;
    }

    const asset = await prisma.asset.update({
      where: { id },
      data: {
        assetTypeId,
        name: input.name,
        positionX: input.positionX,
        positionY: input.positionY,
        width2d: input.width2d,
        height2d: input.height2d,
        rotation: input.rotation,
        totalU,
        installDate:
          input.installDate !== undefined
            ? input.installDate
              ? new Date(input.installDate)
              : null
            : undefined,
        manager: input.manager,
        description: input.description,
        attributes: input.properties as Prisma.InputJsonValue | undefined,
        sortOrder: input.sortOrder,
        updatedById: userId,
      },
      include: { assetType: true },
    });

    return this.mapToDetail(asset);
  }

  async delete(id: string): Promise<void> {
    const asset = await prisma.asset.findFirst({
      where: { id, parentAssetId: null },
      include: {
        sourceCablesEq: { select: { id: true } },
        targetCablesEq: { select: { id: true } },
        children: { select: { id: true } },
      },
    });

    if (!asset) throw new NotFoundError('설비');

    const connectionCount = asset.sourceCablesEq.length + asset.targetCablesEq.length;
    if (connectionCount > 0) {
      throw new ConflictError(
        `연결된 케이블이 ${connectionCount}개 있어 삭제할 수 없습니다. 케이블을 먼저 제거하세요.`
      );
    }

    await prisma.asset.delete({ where: { id } });
  }

  /**
   * 전면/후면 이미지 갱신.
   * Asset 모델엔 front/rearImageUrl 컬럼이 없다(사진은 EquipmentPhoto 관계). 호환을 위해
   * Asset 존재만 검증하고 detail 을 반환한다. (실제 사진 관리는 EquipmentPhoto 서비스 담당)
   */
  async updateImage(
    id: string,
    _imageType: 'front' | 'rear',
    _imageUrl: string,
    userId: string
  ): Promise<EquipmentDetail> {
    const target = await prisma.asset.findFirst({ where: { id, parentAssetId: null } });
    if (!target) throw new NotFoundError('설비');
    const asset = await prisma.asset.update({
      where: { id },
      data: { updatedById: userId },
      include: { assetType: true },
    });
    return this.mapToDetail(asset);
  }

  /** 전면/후면 이미지 삭제. updateImage 와 동일하게 Asset 모델엔 컬럼이 없어 no-op 에 가깝다. */
  async deleteImage(
    id: string,
    _imageType: 'front' | 'rear',
    userId: string
  ): Promise<EquipmentDetail> {
    const target = await prisma.asset.findFirst({ where: { id, parentAssetId: null } });
    if (!target) throw new NotFoundError('설비');
    const asset = await prisma.asset.update({
      where: { id },
      data: { updatedById: userId },
      include: { assetType: true },
    });
    return this.mapToDetail(asset);
  }
}

export const equipmentService = new EquipmentService();
