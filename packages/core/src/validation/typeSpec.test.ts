import { describe, expect, it } from 'vitest';
import { validateTypeSpec } from './typeSpec';
import { SEED_ASSET_TYPES, SEED_CATEGORIES, SEED_CABLE_GROUPS } from '../seed/catalog';
import type { AssetTypeSpec } from '../catalog/types';

const CTX = { categoryKeys: ['통신', '전원'], mediumKeys: ['fiber', 'power'] };

function base(over: Partial<AssetTypeSpec> = {}): AssetTypeSpec {
  return {
    key: 'T1', name: '테스트', categoryKey: '통신', sortOrder: 0,
    placement: { placeable: false },
    labor: { laborType: null, installHours: 0, removeHours: 0, relocateHours: 0 },
    fields: [], containers: [], ports: [], links: [],
    ...over,
  };
}

describe('validateTypeSpec', () => {
  it('유효한 스펙은 이슈 0', () => {
    expect(validateTypeSpec(base(), CTX)).toEqual([]);
  });
  it('key 형식 위반(공백/한글/빈값)과 name 빈값을 거부한다', () => {
    expect(validateTypeSpec(base({ key: '한 글' }), CTX).some((i) => i.path === 'key')).toBe(true);
    expect(validateTypeSpec(base({ key: '' }), CTX).some((i) => i.path === 'key')).toBe(true);
    expect(validateTypeSpec(base({ name: '  ' }), CTX).some((i) => i.path === 'name')).toBe(true);
  });
  it('categoryKey 미존재를 거부한다', () => {
    expect(validateTypeSpec(base({ categoryKey: '없음' }), CTX).some((i) => i.path === 'categoryKey')).toBe(true);
  });
  it('음수 공량을 거부한다', () => {
    const s = base({ labor: { laborType: '통신내선공', installHours: -1, removeHours: 0, relocateHours: 0 } });
    expect(validateTypeSpec(s, CTX).some((i) => i.path === 'labor.installHours')).toBe(true);
  });
  it('필드 key 중복과 select 옵션 없음을 거부한다', () => {
    const dup = base({ fields: [
      { key: 'a', label: 'A', type: 'text' },
      { key: 'a', label: 'B', type: 'text' },
    ] });
    expect(validateTypeSpec(dup, CTX).some((i) => i.path === 'fields[1].key')).toBe(true);
    const noOpt = base({ fields: [{ key: 's', label: 'S', type: 'select', options: [] }] });
    expect(validateTypeSpec(noOpt, CTX).some((i) => i.path === 'fields[0].options')).toBe(true);
  });
  it('컨테이너 key 중복·slotCount 0·자유형 span 을 거부한다', () => {
    const c = { name: '슬롯', allowSpan: false, accepts: {} };
    const dup = base({ containers: [
      { key: 'm', slotCount: 4, ...c },
      { key: 'm', slotCount: 4, ...c },
    ] });
    expect(validateTypeSpec(dup, CTX).some((i) => i.path === 'containers[1].key')).toBe(true);
    const zero = base({ containers: [{ key: 'm', slotCount: 0, ...c }] });
    expect(validateTypeSpec(zero, CTX).some((i) => i.path === 'containers[0].slotCount')).toBe(true);
    const freeSpan = base({ containers: [{ key: 'm', slotCount: null, name: '슬롯', allowSpan: true, accepts: {} }] });
    expect(validateTypeSpec(freeSpan, CTX).some((i) => i.path === 'containers[0].allowSpan')).toBe(true);
  });
  it('포트 group 중복·count 0·미지 매체·{n} 누락 패턴을 거부한다', () => {
    const p = { count: 2, direction: 'BI' as const, medium: 'fiber', namePattern: '코어 {n}' };
    const dup = base({ ports: [ { group: 'A', ...p }, { group: 'A', ...p } ] });
    expect(validateTypeSpec(dup, CTX).some((i) => i.path === 'ports[1].group')).toBe(true);
    const zero = base({ ports: [{ group: 'A', ...p, count: 0 }] });
    expect(validateTypeSpec(zero, CTX).some((i) => i.path === 'ports[0].count')).toBe(true);
    const badMedium = base({ ports: [{ group: 'A', ...p, medium: 'laser' }] });
    expect(validateTypeSpec(badMedium, CTX).some((i) => i.path === 'ports[0].medium')).toBe(true);
    const noN = base({ ports: [{ group: 'A', ...p, count: 2, namePattern: '코어' }] });
    expect(validateTypeSpec(noN, CTX).some((i) => i.path === 'ports[0].namePattern')).toBe(true);
  });
  it('count=1 포트는 고정 이름 패턴({n} 없음)을 허용한다', () => {
    const single = base({ ports: [
      { group: 'IN', count: 1, direction: 'IN' as const, medium: 'power', namePattern: 'IN' },
    ] });
    expect(validateTypeSpec(single, CTX)).toEqual([]);
  });
  it('링크 룰: 미존재 그룹·자기 참조·중복 쌍을 거부한다', () => {
    const ports = [
      { group: 'A', count: 2, direction: 'BI' as const, medium: 'fiber', namePattern: 'A {n}' },
      { group: 'B', count: 2, direction: 'BI' as const, medium: 'fiber', namePattern: 'B {n}' },
    ];
    const ghost = base({ ports, links: [{ fromGroup: 'A', toGroup: 'X', mapping: 'byIndex' }] });
    expect(validateTypeSpec(ghost, CTX).some((i) => i.path === 'links[0].toGroup')).toBe(true);
    const self = base({ ports, links: [{ fromGroup: 'A', toGroup: 'A', mapping: 'all' }] });
    expect(validateTypeSpec(self, CTX).some((i) => i.path === 'links[0].toGroup')).toBe(true);
    const dup = base({ ports, links: [
      { fromGroup: 'A', toGroup: 'B', mapping: 'byIndex' },
      { fromGroup: 'A', toGroup: 'B', mapping: 'all' },
    ] });
    expect(validateTypeSpec(dup, CTX).some((i) => i.path === 'links[1]')).toBe(true);
  });
  it('lineSide=true 그룹이 1개면 이슈 없음', () => {
    const s = base({ ports: [
      { group: 'A', count: 2, direction: 'BI' as const, medium: 'fiber', namePattern: 'A {n}', lineSide: false },
      { group: 'B', count: 2, direction: 'BI' as const, medium: 'fiber', namePattern: 'B {n}', lineSide: true },
    ] });
    expect(validateTypeSpec(s, CTX)).toEqual([]);
  });
  it('lineSide=true 그룹이 2개면 두 번째에 이슈 발화', () => {
    const s = base({ ports: [
      { group: 'A', count: 2, direction: 'BI' as const, medium: 'fiber', namePattern: 'A {n}', lineSide: true },
      { group: 'B', count: 2, direction: 'BI' as const, medium: 'fiber', namePattern: 'B {n}', lineSide: true },
    ] });
    const issues = validateTypeSpec(s, CTX);
    expect(issues.some((i) => i.path === 'ports[1].lineSide')).toBe(true);
  });
  it('시드 전 타입이 시드 카테고리/매체 컨텍스트에서 이슈 0 (모델 증명)', () => {
    const ctx = {
      categoryKeys: SEED_CATEGORIES.map((c) => c.key),
      mediumKeys: SEED_CABLE_GROUPS.map((g) => g.key),
    };
    for (const t of SEED_ASSET_TYPES) {
      expect({ key: t.key, issues: validateTypeSpec(t, ctx) }).toEqual({ key: t.key, issues: [] });
    }
  });
  it('전원 장비(CHARGER/UPS/BATTERY)는 power 매체 포트를 갖는다 (이월 해소)', () => {
    for (const key of ['CHARGER', 'UPS', 'BATTERY']) {
      const t = SEED_ASSET_TYPES.find((x) => x.key === key)!;
      // `every` 가 아니라 `some` — 이 장비들은 접지 포트도 갖는다.
      expect(t.ports.some((p) => p.medium === 'power')).toBe(true);
    }
  });

  /* 전원은 공급과 소비가 갈린다(`PORT_KINDS.power.pairing === 'opposite'`).
     선언이 전부 `BI` 면 규칙이 사실상 꺼진 것과 같으므로 시드가 방향을 제대로 적어야 한다. */
  it('전원 장비의 전원 포트는 입력·출력이 갈려 있다 — BI 로 뭉뚱그리지 않는다', () => {
    for (const key of ['CHARGER', 'UPS', 'BATTERY']) {
      const t = SEED_ASSET_TYPES.find((x) => x.key === key)!;
      const dirs = t.ports.filter((p) => p.medium === 'power').map((p) => p.direction);
      expect(dirs).toContain('IN');
      expect(dirs).toContain('OUT');
      expect(dirs).not.toContain('BI');
    }
  });

  it('접지 부스바가 선언돼 있다 — 여러 기기의 접지선이 모이는 곳', () => {
    const t = SEED_ASSET_TYPES.find((x) => x.key === 'GROUNDING')!;
    expect(t.ports.some((p) => p.medium === 'ground')).toBe(true);
  });
});
