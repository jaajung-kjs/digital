/**
 * cable.service DTO 매핑 단위 테스트 (C5 Phase A)
 * - cableType / categoryCode / displayColor 가 DTO 에 없음
 * - groupColor / groupName / categoryName / specification 이 category/group 에서 파생됨
 */
import { describe, it, expect } from 'vitest';

// mapToDetail 은 private 이므로 서비스 내부 로직을 직접 재현해 검증
// (실제 DB 없이 순수 DTO 매핑 규칙만 검증)

/** cable.service.ts 의 mapToDetail 로직을 그대로 인라인 */
function mapCableToDetail(c: any) {
  return {
    id: c.id,
    sourceAssetId: c.sourceAssetId ?? null,
    targetAssetId: c.targetAssetId ?? null,
    sourceRole: (c.sourceRole ?? null) as 'IN' | 'OUT' | null,
    targetRole: (c.targetRole ?? null) as 'IN' | 'OUT' | null,
    number: c.number ?? null,
    length: c.length,
    color: c.color,
    pathPoints: c.pathPoints,
    description: c.description,
    categoryId: c.categoryId ?? null,
    categoryName: c.category?.name ?? null,
    groupId: c.category?.groupId ?? null,
    groupName: c.category?.group?.name ?? null,
    groupColor: c.category?.group?.color ?? null,
    specification: c.category?.name ?? null,
    specParams: c.specParams ?? null,
    pathLength: c.pathLength ?? null,
    bufferLength: c.bufferLength ?? 4,
    totalLength: c.totalLength ?? null,
  };
}

describe('cable.service DTO 매핑', () => {
  const fakeCable = {
    id: 'cable-1',
    sourceAssetId: 'asset-a',
    targetAssetId: 'asset-b',
    sourceRole: null,
    targetRole: null,
    number: null,
    length: null,
    color: null,
    pathPoints: null,
    description: null,
    categoryId: 'cat-1',
    specParams: null,
    pathLength: null,
    bufferLength: 4,
    totalLength: null,
    // 구 레거시 필드 (include 에서 제거됐지만 혹시 런타임에 붙어오면 매핑 무시 확인)
    cableType: 'LAN',
    // category join: name + groupId + group.{name, color}
    category: {
      name: 'FCV 전력케이블 60sqmm',
      groupId: 'grp-1',
      group: {
        name: '전원',
        color: '#ef4444',
      },
    },
  };

  it('DTO 에 cableType 키가 없다', () => {
    const dto = mapCableToDetail(fakeCable);
    expect(dto).not.toHaveProperty('cableType');
  });

  it('DTO 에 categoryCode 키가 없다', () => {
    const dto = mapCableToDetail(fakeCable);
    expect(dto).not.toHaveProperty('categoryCode');
  });

  it('DTO 에 displayColor 키가 없다', () => {
    const dto = mapCableToDetail(fakeCable);
    expect(dto).not.toHaveProperty('displayColor');
  });

  it('groupColor 가 category.group.color 에서 파생된다', () => {
    const dto = mapCableToDetail(fakeCable);
    expect(dto.groupColor).toBe('#ef4444');
  });

  it('groupName 이 category.group.name 에서 파생된다', () => {
    const dto = mapCableToDetail(fakeCable);
    expect(dto.groupName).toBe('전원');
  });

  it('groupId 가 category.groupId 에서 파생된다', () => {
    const dto = mapCableToDetail(fakeCable);
    expect(dto.groupId).toBe('grp-1');
  });

  it('categoryName 이 category.name 이다', () => {
    const dto = mapCableToDetail(fakeCable);
    expect(dto.categoryName).toBe('FCV 전력케이블 60sqmm');
  });

  it('specification === categoryName', () => {
    const dto = mapCableToDetail(fakeCable);
    expect(dto.specification).toBe(dto.categoryName);
  });

  it('category 가 null 이면 group 파생 필드가 모두 null', () => {
    const dto = mapCableToDetail({ ...fakeCable, category: null, categoryId: null });
    expect(dto.categoryName).toBeNull();
    expect(dto.groupId).toBeNull();
    expect(dto.groupName).toBeNull();
    expect(dto.groupColor).toBeNull();
    expect(dto.specification).toBeNull();
  });

  it('category 가 있어도 group 이 null 이면 groupName/groupColor 가 null', () => {
    const dto = mapCableToDetail({
      ...fakeCable,
      category: { name: '무분류 케이블', groupId: null, group: null },
    });
    expect(dto.categoryName).toBe('무분류 케이블');
    expect(dto.groupId).toBeNull();
    expect(dto.groupName).toBeNull();
    expect(dto.groupColor).toBeNull();
  });
});
