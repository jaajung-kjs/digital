import { useSubstationWorkingCopy } from '../workingCopy/substationStore';
import { type TraceGraph } from '../trace/traceGraph';
import { buildSlotCoreRows, type SlotCoreRow } from './slotRegister';
import type { RegisterCtx, RegisterDescriptor } from '../connections/registerGrid/registerTypes';
import { EditableField } from '../assets/components/EditableField';
import { fiberSlotLabel } from './fiberSlotLabel';
import { EquipmentSelectCell } from './components/EquipmentSelectCell';
import type { Asset } from '../../types/asset';

/** 점유 코어 한 필드를 OUT 케이블 specParams 에 머지 스테이징(기존 키 보존). */
function commitMeta(cableId: string, field: string, value: string | null) {
  const wc = useSubstationWorkingCopy.getState();
  const cable = wc.effectiveCables().find((c) => c.id === cableId);
  const prev = ((cable?.specParams as Record<string, unknown>) ?? {});
  wc.patch('cables', cableId, { specParams: { ...prev, [field]: value } });
}

/** __nameById·__slot 동봉 — cell(row) 시그니처에 ctx 없으므로 row 에 해소맵·슬롯 첨부. */
export type FiberRow = SlotCoreRow & { __nameById?: Map<string, string>; __slot?: Asset };

export const fiberRegisterDescriptor: RegisterDescriptor<FiberRow> = {
  emptyMessage: '이 변전소에 OFD(광단국)가 없습니다.',
  childKind: 'conduit',
  selectContainers: (assets, substationId) =>
    assets.filter((a) => a.assetType?.placementKind === 'OFD' && a.substationId === substationId),
  buildSection: (slot, ctx: RegisterCtx) => {
    const graph = ctx.graph as TraceGraph | null;
    const rows = buildSlotCoreRows(slot as never, ctx.cables as never[], graph)
      .map((r): FiberRow => ({ ...r, __nameById: graph?.nameById, __slot: slot as unknown as Asset }));
    const used = rows.filter((r) => r.usage === '사용').length;
    const title = (graph ? fiberSlotLabel(slot.id, graph) : '') || (slot.name ?? '광경로');
    return {
      key: slot.id,
      title,
      usedLabel: `사용 ${used}/${rows.length}${ctx.isLoading ? ' · 대국 불러오는 중…' : ''}`,
      rows,
    };
  },
  rowKey: (row) => row.coreNumber,
  rowTraceCableId: (row) => row.cableId,
  rowCore: (row) => row.coreNumber,
  // 코어 행 클릭 → 그 코어가 속한 경로슬롯(conduit)의 포트 사이드패널로 이동.
  // 빈 코어도 동일(슬롯 id 로 이동, rowCore 로 해당 포트 활성화).
  onRowClick: (row) => row.__slot?.id ?? null,
  columns: [
    {
      label: '코어',
      width: 'w-14',
      sortKey: (r) => r.coreNumber,
      sortType: 'number',
      cell: (r) => <span className="tabular-nums text-content-muted">{r.coreNumber}</span>,
    },
    {
      label: '자국설비',
      sortKey: (r) => (r.nearAssetId ? r.__nameById?.get(r.nearAssetId) ?? null : null),
      cell: (r) => (r.__slot ? <EquipmentSelectCell slot={r.__slot} coreNumber={r.coreNumber} side="local" /> : null),
    },
    {
      label: '대국설비',
      sortKey: (r) => r.farName,
      cell: (r) => (r.__slot ? <EquipmentSelectCell slot={r.__slot} coreNumber={r.coreNumber} side="remote" /> : null),
    },
    {
      label: '용도',
      sortKey: (r) => r.purpose,
      cell: (r) => (
        <EditableField
          value={r.purpose ?? ''}
          ariaLabel="용도"
          placeholder="용도"
          disabled={!r.cableId}
          onCommit={(v) => r.cableId && commitMeta(r.cableId, 'purpose', v || null)}
        />
      ),
    },
    {
      label: '수용내역',
      sortKey: (r) => r.circuitText,
      cell: (r) => (
        <EditableField
          value={r.circuitText ?? ''}
          ariaLabel="수용내역"
          placeholder="수용내역"
          disabled={!r.cableId}
          onCommit={(v) => r.cableId && commitMeta(r.cableId, 'circuitText', v || null)}
        />
      ),
    },
    {
      label: '융착',
      width: 'w-24',
      sortKey: (r) => r.spliceType,
      cell: (r) => (
        <EditableField
          value={r.spliceType ?? ''}
          type="select"
          ariaLabel="융착"
          disabled={!r.cableId}
          options={[{ value: '', label: '—' }, { value: '융착', label: '융착' }, { value: '패치', label: '패치' }]}
          onCommit={(v) => r.cableId && commitMeta(r.cableId, 'spliceType', v || null)}
        />
      ),
    },
    {
      label: '사용',
      width: 'w-28',
      sortKey: (r) => r.usageOverride ?? (r.occupied ? '사용' : '미사용'),
      cell: (r) => (
        <EditableField
          value={r.usageOverride ?? ''}
          type="select"
          ariaLabel="사용"
          disabled={!r.cableId}
          display={(v) => v || `자동${r.occupied ? '(사용)' : '(미사용)'}`}
          options={[
            { value: '', label: `자동${r.occupied ? '(사용)' : '(미사용)'}` },
            { value: '사용', label: '사용' },
            { value: '미사용', label: '미사용' },
          ]}
          onCommit={(v) => r.cableId && commitMeta(r.cableId, 'usageOverride', v || null)}
        />
      ),
    },
  ],
};
