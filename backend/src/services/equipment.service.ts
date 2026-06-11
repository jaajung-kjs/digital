import prisma from '../config/prisma.js';
import { NotFoundError } from '../utils/errors.js';
import { Prisma } from '@prisma/client';
import type { Asset, AssetType } from '@prisma/client';
import { placementKindToKind, kindToPlacementCode, type PlacementKind } from './assetPlanMapper.js';
import { sourcePresetToProperties } from './sourcePreset.js';

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
      properties: sourcePresetToProperties(a.sourcePresetId),
      frontImageUrl: null,
      rearImageUrl: null,
      height3d: null,
      sortOrder: a.sortOrder,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
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
