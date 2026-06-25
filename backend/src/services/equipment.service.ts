import prisma from '../config/prisma.js';
import { NotFoundError } from '../utils/errors.js';
import type { Asset, AssetType } from '@prisma/client';
import { sourcePresetToProperties } from './sourcePreset.js';

// ==================== Types ====================

export interface EquipmentDetail {
  id: string;
  floorId: string;
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
    return {
      id: a.id,
      floorId: a.floorId ?? '',
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

  /** 도면 객체 목록 조회 — 도면에 배치된 top-level 설비 전부. */
  async getAll(): Promise<(EquipmentDetail & { substationName?: string })[]> {
    const assets = await prisma.asset.findMany({
      where: {
        parentAssetId: null,
        floorId: { not: null },
      },
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
      where: { floorId, parentAssetId: null },
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
