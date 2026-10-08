import type { DesignInput, DLink, LaborType } from '@twin/core';
import { effectiveRows, substationName } from '../../model/store/effective';
import { emptyOverlays, type WorkingCopyState } from '../../model/store/workingCopy';
import type { Catalog, Link } from '../../model/types';
import { endLabel } from '../equipment/endpoints';

type S = Pick<WorkingCopyState, 'saved' | 'overlays'>;

/** 카탈로그 행 → core 품목(공량·단가 칸은 `LaborSpec` 이 선언한다). 이설 공량이 없는 케이블은 null. */
const laborType = (t: { id: string; name: string; laborCode: string | null; unitPrice: number | null; installManDays: number | null; removeManDays: number | null; relocateManDays?: number | null }): LaborType => ({
  id: t.id, name: t.name, laborCode: t.laborCode, unitPrice: t.unitPrice,
  installManDays: t.installManDays, removeManDays: t.removeManDays, relocateManDays: t.relocateManDays ?? null,
});

/**
 * 설계서의 입력 — **변경안 전체**의 전(저장본)과 후(저장본 ⊕ 오버레이). 국이 여럿이어도 한 변경안이다.
 *
 * - 전 = `saved`, 후 = `effectiveRows`. 삭제 펼침(`expandDeletes`)은 이미 오버레이에 들어 있다.
 * - 들르지 않은 국의 먼 연결은 **지우기로 한 것만** 전에 싣는다 — 광선로를 지우며 함께 간 상대 국 점퍼도
 *   케이블 철거다. 지우지 않은 먼 연결은 후에도 없으므로 전에 실으면 거짓 철거가 된다.
 * - 연결 이름은 그 상태에서 푼다 — 전은 저장본으로(지운 설비의 이름도 남는다), 후는 워킹카피로.
 */
export function designInput(s: S, catalog: Pick<Catalog, 'rackTypes' | 'equipmentTypes' | 'cableTypes'>, nameOf: (id: string) => string | null): DesignInput {
  const before: S = { saved: s.saved, overlays: emptyOverlays() };
  const linkOf = (state: S) => (l: Link): DLink => ({
    id: l.id, substationId: l.substationId, cableTypeId: l.cableTypeId, lengthM: l.lengthM,
    label: `${endLabel(state, l.a)} ↔ ${endLabel(state, l.b)}`,
  });
  const near = new Set(s.saved.links.map((l) => l.id));
  const gone = new Set(s.overlays.links.deletes);
  const farGone = s.saved.farLinks.filter((l) => gone.has(l.id) && !near.has(l.id));

  return {
    before: {
      racks: s.saved.racks,
      equipment: s.saved.equipment,
      links: [...s.saved.links, ...farGone].map(linkOf(before)),
      fiberLines: s.saved.fiberLines,
    },
    after: {
      racks: effectiveRows(s, 'racks'),
      equipment: effectiveRows(s, 'equipment'),
      links: effectiveRows(s, 'links').map(linkOf(s)),
      fiberLines: effectiveRows(s, 'fiberLines'),
    },
    rackTypes: catalog.rackTypes.map(laborType),
    equipmentTypes: catalog.equipmentTypes.map(laborType),
    cableTypes: catalog.cableTypes.map(laborType),
    substationName: (id) => substationName(s, id) ?? nameOf(id) ?? '—',
  };
}

/** 이설로 세는 칸 — 그 밖의 값 변경은 산출하지 않는다(core `designItems`). */
const MOVE_FIELDS = { racks: ['substationId', 'floorId', 'x', 'y'], equipment: ['substationId', 'rackId'], links: [], fiberLines: [] } as const;

/**
 * 산출하지 않는 값 변경이 있는가 — 랙·설비·연결·광선로의 고치기 중 이설이 아닌 칸(이름·길이·품목…).
 * 있으면 설계서가 「값 변경은 산출하지 않습니다」라고 한 줄 말한다(빈 설계서가 거짓말로 읽히지 않게).
 */
export function hasUnpricedChanges(s: S): boolean {
  return (Object.keys(MOVE_FIELDS) as (keyof typeof MOVE_FIELDS)[]).some((k) => {
    const moves: readonly string[] = MOVE_FIELDS[k];
    const deleted = new Set(s.overlays[k].deletes);
    return Object.entries(s.overlays[k].updates).some(([id, patch]) =>
      !deleted.has(id) && Object.keys(patch as object).some((f) => !moves.includes(f)));
  });
}
