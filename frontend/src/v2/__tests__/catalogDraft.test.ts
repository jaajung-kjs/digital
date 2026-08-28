import { describe, expect, it } from 'vitest';
import type { V2AssetType, V2Catalog } from '../types';
import { draftIssues, emptyDraft, isDraftDirty, portRow, typeToDraft } from '../catalogDraft';

// 최소 V2AssetType 팩토리
const mkType = (overrides: Partial<V2AssetType> = {}): V2AssetType => ({
  id: 'type-1',
  key: 'PITR-5000',
  name: 'PITR',
  categoryId: 'cat-comm',
  sortOrder: 1,
  assetCount: 0,
  laborCode: '통신내선공',
  installManDays: 2,
  removeManDays: 1,
  relocateManDays: 3,
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
    { id: 'g-fiber', key: 'fiber', name: '광', color: '#00f', laborCode: '통신외선공', installManDays: 0.04, removeManDays: 0.02, sortOrder: 1, categories: [] },
    { id: 'g-power', key: 'power', name: '전력', color: '#f00', laborCode: null, installManDays: 0.1, removeManDays: 0.05, sortOrder: 2, categories: [] },
  ],
});

/**
 * **저장 뒤에는 고칠 것이 없어야 한다.**
 *
 * 「고친 것이 있는가」는 초안과 원본을 JSON 으로 견줘 답한다(`isDirty`). 그래서 같은 뜻의
 * 줄은 늘 **같은 글자**여야 하는데, 편집기가 포트 줄을 손으로 지으면서 빈 값을 아예 빼
 * 버렸다(`variant`·`voltage`). 서버가 돌려주는 줄에는 `null` 로 들어 있으니 글자가 달랐고,
 * 포트를 더해 저장해도 **저장·취소 단추가 그대로 켜져 있었다.**
 *
 * 줄을 짓는 자리를 하나로 모아(`portRow`) 그 불변식을 여기서 지킨다.
 */
describe('초안의 포트 줄은 한 자리에서 짓는다', () => {
  it('편집기가 더한 줄과 서버가 돌려준 줄이 같은 글자다', () => {
    /* 편집기가 프리셋으로 더하는 줄 — 갈래도 전압도 없는 종류(네트워크). */
    const added = portRow({
      group: 'NETWORK', count: 24, direction: 'BI', medium: 'network', namePattern: '네트워크 {n}', positions: 1,
    });
    /* 저장하면 서버는 안 적은 칸을 null 로 채워 돌려준다. */
    const echoed = typeToDraft(mkType({
      portTemplates: [{
        id: 'pt-1', group: 'NETWORK', count: 24, direction: 'BI', medium: 'network',
        namePattern: '네트워크 {n}', sortOrder: 1, positions: 1, variant: null,
      }],
    })).ports[0]!;

    expect(JSON.stringify(added)).toBe(JSON.stringify(echoed));
  });

  it('포트를 더해 저장하면 「고친 것」이 남지 않는다', () => {
    const before = typeToDraft(mkType({ portTemplates: [] }));
    const afterAdd = {
      ...before,
      ports: [portRow({ group: 'POWER-IN-DC', count: 1, direction: 'IN', medium: 'power', namePattern: '전원 입력', variant: 'DC' })],
    };
    /* 저장 → 서버가 돌려준 것으로 원본이 바뀐다. 그 순간 단추는 꺼져야 한다. */
    const saved = mkType({
      portTemplates: [{
        id: 'pt-9', group: 'POWER-IN-DC', count: 1, direction: 'IN', medium: 'power',
        namePattern: '전원 입력', sortOrder: 1, positions: 1, variant: 'DC',
      }],
    });
    expect(isDraftDirty(afterAdd, saved)).toBe(false);
  });

  /* 심선 수를 안 적은 줄도 마찬가지다 — 서버는 1 로 돌려준다. */
  it('안 적은 심선 수는 1 로 적힌다 — 「빠진 것」과 「1」이 같은 글자가 되게', () => {
    const row = portRow({ group: 'GROUND', count: 1, direction: 'BI', medium: 'ground', namePattern: '접지' });
    expect(row.positions).toBe(1);
    expect(row.variant).toBeNull();
  });
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
    expect(draft.laborCode).toBe(type.laborCode);
    expect(draft.installManDays).toBe(type.installManDays);
    expect(draft.removeManDays).toBe(type.removeManDays);
    expect(draft.relocateManDays).toBe(type.relocateManDays);

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
