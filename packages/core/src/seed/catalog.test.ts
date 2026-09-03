import { describe, expect, it } from 'vitest';
import { SEED_ASSEMBLIES, SEED_ASSET_TYPES, SEED_CABLE_GROUPS, SEED_CATEGORIES } from './catalog.js';
import { validateAssembly, type AssemblyLinkSpec } from '../catalog/assembly.js';
import { validateTypeSpec } from '../validation/typeSpec.js';

const CTX = {
  categoryKeys: SEED_CATEGORIES.map((c) => c.key),
  mediumKeys: SEED_CABLE_GROUPS.map((g) => g.key),
};

describe('시드 카탈로그', () => {
  it('장비 품목이 제 어휘 안에서 유효하다', () => {
    for (const t of SEED_ASSET_TYPES) {
      expect({ key: t.key, issues: validateTypeSpec(t, CTX) }).toEqual({ key: t.key, issues: [] });
    }
  });

  /**
   * **설비 품목이 담은 내부 배선이 실제로 이어지는가.**
   *
   * 시드가 적어 둔 배선은 배포 때 그대로 DB 에 들어간다 — 거기서 틀리면 컨테이너가 뜨다가
   * 죽거나(더 나쁘게는) 이을 수 없는 짝이 조용히 실린다. 판정은 케이블을 이을 때와 **같은
   * 함수**(`validateConnection`)가 하므로, 여기서 통과하면 화면에서도 통과한다.
   */
  it('설비 품목의 구성과 내부 배선이 유효하다', () => {
    const typeKeys = new Set(SEED_ASSET_TYPES.map((t) => t.key));
    const portsOf = (key: string) => SEED_ASSET_TYPES.find((t) => t.key === key)?.ports;

    for (const a of SEED_ASSEMBLIES) {
      /* 시드는 항목을 **이름**으로 가리킨다(id 가 없다) — 판정에 넣으려면 id 를 붙인다.
         서버도 같은 일을 한다(`seed/next.ts` 의 `itemId` 다리). */
      const items = a.items.map((i, n) => ({ ...i, id: `i${n}` }));
      const idOf = new Map(items.map((i) => [i.name, i.id]));
      const links: AssemblyLinkSpec[] = (a.links ?? []).map((l, n) => ({
        id: `l${n}`,
        aItemId: idOf.get(l.aItem) ?? '없음', aGroup: l.aGroup, aIndex: l.aIndex,
        bItemId: idOf.get(l.bItem) ?? '없음', bGroup: l.bGroup, bIndex: l.bIndex,
      }));
      expect({ key: a.key, issue: validateAssembly({ ...a, items, links }, typeKeys, portsOf) })
        .toEqual({ key: a.key, issue: null });
    }
  });

  /* 통신용 충전기는 랙 한 대짜리 설비다 — 놓으면 장비 여섯과 배선 아홉이 함께 선다. */
  it('통신용 충전기가 장비 여섯과 배선 아홉을 들고 있다', () => {
    const chg = SEED_ASSEMBLIES.find((a) => a.key === 'CHG-48V-SET');
    expect(chg?.items).toHaveLength(6);
    expect(chg?.links).toHaveLength(9);
  });
});
