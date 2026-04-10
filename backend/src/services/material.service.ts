import prisma from '../config/prisma.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

interface SpecTemplate {
  params: { key: string; label: string; inputType: string; options?: (string | number)[] }[];
  format: string;
}

class MaterialService {
  async resolve(categoryId: string, specParams: Record<string, any>) {
    const category = await prisma.materialCategory.findUnique({ where: { id: categoryId } });
    if (!category) throw new NotFoundError('자재 카테고리');

    const template = category.specTemplate as SpecTemplate | null;
    if (!template) throw new ValidationError('이 카테고리에는 specTemplate이 정의되어 있지 않습니다.');

    // format 문자열에 params 적용하여 specification 생성
    const specification = this.buildSpecification(template.format, specParams);

    // 기존 Material 조회
    const existing = await prisma.material.findFirst({
      where: { categoryId, specification },
    });

    if (existing) return { ...existing, created: false };

    // 신규 생성
    const count = await prisma.material.count({ where: { categoryId } });
    const code = `${category.code}-${String(count + 1).padStart(3, '0')}`;

    const created = await prisma.material.create({
      data: {
        categoryId,
        code,
        name: specification,
        specification,
        unit: category.unit || '개',
        properties: specParams,
      },
    });

    return { ...created, created: true };
  }

  async getByCategoryId(categoryId: string) {
    return prisma.material.findMany({
      where: { categoryId, isActive: true },
      orderBy: { specification: 'asc' },
    });
  }

  private buildSpecification(format: string, params: Record<string, any>): string {
    let result = format;
    for (const [key, value] of Object.entries(params)) {
      result = result.replace(`{${key}}`, String(value));
    }
    return result;
  }
}

export const materialService = new MaterialService();
