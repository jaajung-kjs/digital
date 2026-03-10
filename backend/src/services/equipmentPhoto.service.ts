import prisma from '../config/prisma.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

// ==================== Types ====================

export interface EquipmentPhotoDetail {
  id: string;
  equipmentId: string;
  side: string;
  imageUrl: string;
  description: string | null;
  takenAt: Date | null;
  createdAt: Date;
}

export interface CreateEquipmentPhotoInput {
  side: string;
  imageUrl: string;
  description?: string;
  takenAt?: string;
}

// ==================== Service ====================

class EquipmentPhotoService {
  /**
   * 설비 사진 목록 조회
   */
  async getByEquipmentId(equipmentId: string): Promise<EquipmentPhotoDetail[]> {
    const equipment = await prisma.equipment.findUnique({
      where: { id: equipmentId },
    });

    if (!equipment) {
      throw new NotFoundError('설비');
    }

    const photos = await prisma.equipmentPhoto.findMany({
      where: { equipmentId },
      orderBy: { createdAt: 'desc' },
    });

    return photos.map((p) => ({
      id: p.id,
      equipmentId: p.equipmentId,
      side: p.side,
      imageUrl: p.imageUrl,
      description: p.description,
      takenAt: p.takenAt,
      createdAt: p.createdAt,
    }));
  }

  /**
   * 설비 사진 생성
   */
  async create(
    equipmentId: string,
    input: CreateEquipmentPhotoInput
  ): Promise<EquipmentPhotoDetail> {
    const equipment = await prisma.equipment.findUnique({
      where: { id: equipmentId },
    });

    if (!equipment) {
      throw new NotFoundError('설비');
    }

    if (!['front', 'rear'].includes(input.side)) {
      throw new ValidationError('side는 front 또는 rear 중 하나여야 합니다.');
    }

    const photo = await prisma.equipmentPhoto.create({
      data: {
        equipmentId,
        side: input.side,
        imageUrl: input.imageUrl,
        description: input.description,
        takenAt: input.takenAt ? new Date(input.takenAt) : null,
      },
    });

    return {
      id: photo.id,
      equipmentId: photo.equipmentId,
      side: photo.side,
      imageUrl: photo.imageUrl,
      description: photo.description,
      takenAt: photo.takenAt,
      createdAt: photo.createdAt,
    };
  }

  /**
   * 설비 사진 삭제
   */
  async delete(id: string): Promise<void> {
    const photo = await prisma.equipmentPhoto.findUnique({
      where: { id },
    });

    if (!photo) {
      throw new NotFoundError('설비 사진');
    }

    await prisma.equipmentPhoto.delete({
      where: { id },
    });
  }
}

export const equipmentPhotoService = new EquipmentPhotoService();
