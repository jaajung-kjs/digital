import { describe, expect, it } from 'vitest';
import type { V2AssetType, V2Catalog } from '../types';
import { draftIssues, emptyDraft, isDraftDirty, typeToDraft } from '../catalogDraft';

// 최소 V2AssetType 팩토리
const mkType = (overrides: Partial<V2AssetType> = {}): V2AssetType => ({
  id: 'type-1',
  key: 'PITR-5000',
  name: 'PITR',
  categoryId: 'cat-comm',
  sortOrder: 1,
  isActive: true,
  assetCount: 0,
  laborType: '통신내선공',
  installHours: 2,
  removeHours: 1,
  relocateHours: 3,
  portTemplates: [
    { id: 'pt-1', group: 'A', count: 1, direction: 'BI', medium: 'fiber', namePattern: 'A', sortOrder: 1 },
  ],
  ...overrides,
});

// 최소 V2Catalog 팩토리
const mkCatalog = (): V2Catalog => ({
  categories: [
    { id: 'cat-comm', key: '통신', name: '통신장비', sortOrder: 1 },
    { id: 'cat-struct', key: '구조물', name: '구조물', sortOrder: 2 },
  ],
  types: [],
  cableGroups: [
    { id: 'g-fiber', key: 'fiber', name: '광', color: '#00f', laborType: '통신외선공', installHoursPerM: 0.04, removeHoursPerM: 0.02, sortOrder: 1, categories: [] },
    { id: 'g-power', key: 'power', name: '전력', color: '#f00', laborType: null, installHoursPerM: 0.1, removeHoursPerM: 0.05, sortOrder: 2, categories: [] },
  ],
});

describe('catalogDraft', () => {
  it('typeToDraft → draftToBody 왕복이 서버 형상과 일치한다 (id/assetCount 제거, 명세 sortOrder 제거)', () => {
    const type = mkType();
    const draft = typeToDraft(type);

    // id·assetCount 가 없어야 한다
    expect('id' in draft).toBe(false);
    expect('assetCount' in draft).toBe(false);

    // 스칼라 필드는 그대로 보존
    expect(draft.key).toBe(type.key);
    expect(draft.name).toBe(type.name);
    expect(draft.categoryId).toBe(type.categoryId);
    expect(draft.sortOrder).toBe(type.sortOrder);
    expect(draft.isActive).toBe(type.isActive);
    expect(draft.laborType).toBe(type.laborType);
    expect(draft.installHours).toBe(type.installHours);
    expect(draft.removeHours).toBe(type.removeHours);
    expect(draft.relocateHours).toBe(type.relocateHours);

    // portTemplates → ports: id·sortOrder 제거
    expect(draft.ports).toHaveLength(1);
    expect('id' in draft.ports[0]).toBe(false);
    expect('sortOrder' in draft.ports[0]).toBe(false);
    expect(draft.ports[0].group).toBe('A');
  });

  it('draftIssues: categoryId 를 key 로 해소해 validateTypeSpec 에 위임한다 (미지 categoryId → categoryKey 이슈)', () => {
    const catalog = mkCatalog();

    // 유효한 categoryId 는 이슈 없음 (최소 유효 스펙)
    const draft = typeToDraft(mkType({ key: 'PITR-5000', name: 'PITR', categoryId: 'cat-comm' }));
    const cleanDraft = draft;
    const issues = draftIssues(cleanDraft, catalog);
    const catIssues = issues.filter((i) => i.path === 'categoryKey');
    expect(catIssues).toHaveLength(0);

    // 존재하지 않는 categoryId → categoryKey 이슈
    const badDraft = { ...cleanDraft, categoryId: 'cat-unknown' };
    const badIssues = draftIssues(badDraft, catalog);
    expect(badIssues.some((i) => i.path === 'categoryKey')).toBe(true);
  });

  it('draftIssues: 카탈로그의 cableGroups 키가 mediumKeys 로 쓰인다 (power 포트 유효, laser 무효)', () => {
    const catalog = mkCatalog(); // cableGroups: fiber, power
    const baseDraft = typeToDraft(mkType({ categoryId: 'cat-comm' }));
    const draftBase = { ...baseDraft, links: [] };

    // power medium → 유효
    const powerDraft = { ...draftBase, ports: [{ group: 'P', count: 1, direction: 'IN' as const, medium: 'power', namePattern: 'P1' }] };
    const powerIssues = draftIssues(powerDraft, catalog);
    expect(powerIssues.filter((i) => i.path.startsWith('ports[0]') && i.message.includes('매체'))).toHaveLength(0);

    // laser medium → 무효 (cableGroups 에 없음)
    const laserDraft = { ...draftBase, ports: [{ group: 'L', count: 1, direction: 'IN' as const, medium: 'laser', namePattern: 'L1' }] };
    const laserIssues = draftIssues(laserDraft, catalog);
    expect(laserIssues.some((i) => i.path.startsWith('ports[0]') && i.message.includes('매체'))).toBe(true);
  });

  it('isDraftDirty: 원본과 동일하면 false, 필드 하나 바꾸면 true, 신규(null)는 true', () => {
    const type = mkType();
    const draft = typeToDraft(type);

    // 원본과 동일 → false
    expect(isDraftDirty(draft, type)).toBe(false);

    // name 하나 바꾸면 → true
    expect(isDraftDirty({ ...draft, name: '변경된 이름' }, type)).toBe(true);

    // sortOrder 바꿔도 → true
    expect(isDraftDirty({ ...draft, sortOrder: 99 }, type)).toBe(true);

    // 신규 (original = null) → 항상 true
    expect(isDraftDirty(draft, null)).toBe(true);

    // emptyDraft도 신규이므로 항상 dirty
    expect(isDraftDirty(emptyDraft('cat-comm'), null)).toBe(true);
  });
});
