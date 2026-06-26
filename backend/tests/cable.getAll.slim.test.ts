/**
 * cable.service getAll slim DTO 단위 테스트 (Task-2 Phase 1 cleanup)
 * - SlimCableDTO 필드만 존재 (heavy nested 필드 부재) 검증
 * - DB 없이 순수 매핑 로직 인라인 검증
 */
import { describe, it, expect } from 'vitest';

/** cable.service.ts 의 getAll rows.map 로직과 동일 */
function mapToSlim(r: {
  id: string;
  sourceAssetId: string;
  targetAssetId: string;
  sourceRole: 'IN' | 'OUT' | null;
  targetRole: 'IN' | 'OUT' | null;
  number: number | null;
  categoryId: string | null;
  specParams: unknown;
  description: string | null;
  category: { name: string; groupId: string | null } | null;
}) {
  return {
    id: r.id, sourceAssetId: r.sourceAssetId, targetAssetId: r.targetAssetId,
    sourceRole: r.sourceRole, targetRole: r.targetRole, number: r.number,
    categoryId: r.categoryId, groupId: r.category?.groupId ?? null,
    categoryName: r.category?.name ?? null,
    specParams: r.specParams, description: r.description,
  };
}

const fakeRow = {
  id: 'cable-slim-1',
  sourceAssetId: 'asset-src',
  targetAssetId: 'asset-tgt',
  sourceRole: 'IN' as const,
  targetRole: 'OUT' as const,
  number: 3,
  categoryId: 'cat-1',
  specParams: { voltage: '22.9kV' },
  description: '주간선',
  category: { name: 'FCV 전력케이블', groupId: 'grp-1' },
};

describe('getAll SlimCableDTO 매핑', () => {
  it('slim DTO 에 heavy 필드(source, target, length, pathPoints 등)가 없다', () => {
    const dto = mapToSlim(fakeRow);
    expect(dto).not.toHaveProperty('source');
    expect(dto).not.toHaveProperty('target');
    expect(dto).not.toHaveProperty('length');
    expect(dto).not.toHaveProperty('pathPoints');
    expect(dto).not.toHaveProperty('pathLength');
    expect(dto).not.toHaveProperty('bufferLength');
    expect(dto).not.toHaveProperty('totalLength');
    expect(dto).not.toHaveProperty('groupName');
    expect(dto).not.toHaveProperty('groupColor');
    expect(dto).not.toHaveProperty('specification');
    expect(dto).not.toHaveProperty('createdAt');
    expect(dto).not.toHaveProperty('updatedAt');
  });

  it('slim DTO 에 정의된 11개 필드가 정확히 있다', () => {
    const dto = mapToSlim(fakeRow);
    const keys = Object.keys(dto).sort();
    expect(keys).toEqual([
      'categoryId', 'categoryName', 'description', 'groupId',
      'id', 'number', 'sourceAssetId', 'sourceRole',
      'specParams', 'targetAssetId', 'targetRole',
    ]);
  });

  it('categoryName 과 groupId 가 category 조인에서 파생된다', () => {
    const dto = mapToSlim(fakeRow);
    expect(dto.categoryName).toBe('FCV 전력케이블');
    expect(dto.groupId).toBe('grp-1');
  });

  it('category 가 null 이면 categoryName/groupId 가 null', () => {
    const dto = mapToSlim({ ...fakeRow, category: null, categoryId: null });
    expect(dto.categoryName).toBeNull();
    expect(dto.groupId).toBeNull();
  });

  it('sourceRole/targetRole 값이 그대로 전달된다', () => {
    const dto = mapToSlim(fakeRow);
    expect(dto.sourceRole).toBe('IN');
    expect(dto.targetRole).toBe('OUT');
  });

  it('specParams 가 그대로 전달된다', () => {
    const dto = mapToSlim(fakeRow);
    expect(dto.specParams).toEqual({ voltage: '22.9kV' });
  });
});
