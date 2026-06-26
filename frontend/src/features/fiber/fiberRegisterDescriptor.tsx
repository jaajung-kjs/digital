import { type TraceGraph } from '../trace/traceGraph';
import { buildSlotCoreRows, type SlotCoreRow } from './slotRegister';
import type { RegisterCtx, RegisterDescriptor } from '../connections/registerGrid/registerTypes';
import { EditableField } from '../assets/components/EditableField';
import { fiberSlotLabel } from './fiberSlotLabel';
import { AssetSelectCell } from './components/AssetSelectCell';
import { commitCoreMeta } from './coreMeta';
import type { Asset } from '../../types/asset';

/** __nameById·__slot 동봉 — cell(row) 시그니처에 ctx 없으므로 row 에 해소맵·슬롯 첨부. */
export type FiberRow = SlotCoreRow & { __nameById?: Map<string, string>; __slot?: Asset };

export const fiberRegisterDescriptor: RegisterDescriptor<FiberRow> = {
  emptyMessage: '이 변전소에 OFD(광단국)가 없습니다.',
  childRole: 'slot',
  selectContainers: (assets, substationId) =>
    assets.filter((a) => a.assetType?.role === 'ofd' && a.substationId === substationId),
  buildSection: (slot, ctx: RegisterCtx) => {
    const graph = ctx.graph as TraceGraph | null;
    const rows = buildSlotCoreRows(slot as never, ctx.cables as never[], graph)
      .map((r): FiberRow => ({ ...r, __nameById: graph?.nameById, __slot: slot as unknown as Asset }));
    const used = rows.filter((r) => r.occupied).length;
    const title = (graph ? fiberSlotLabel(slot.id, graph) : '') || (slot.name ?? '광경로');
    return {
      key: slot.id,
      title,
      usedLabel: `사용 ${used}/${rows.length}${ctx.isLoading ? ' · 대국 불러오는 중…' : ''}`,
      rows,
    };
  },
  rowKey: (row) => row.coreNumber,
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
      width: 'w-48',
      sortKey: (r) => (r.nearAssetId ? r.__nameById?.get(r.nearAssetId) ?? null : null),
      cell: (r) => (r.__slot ? <AssetSelectCell slot={r.__slot} coreNumber={r.coreNumber} side="local" /> : null),
    },
    {
      label: '대국설비',
      width: 'w-48',
      sortKey: (r) => r.farName,
      cell: (r) => (r.__slot ? <AssetSelectCell slot={r.__slot} coreNumber={r.coreNumber} side="remote" /> : null),
    },
    {
      label: '손실1310(dB)',
      width: 'w-24',
      sortKey: (r) => r.loss1310,
      sortType: 'number',
      cell: (r) => (
        <EditableField
          value={r.loss1310 ?? ''}
          ariaLabel="손실1310"
          placeholder="—"
          disabled={!r.opgwId}
          onCommit={(v) => r.opgwId && commitCoreMeta(r.opgwId, r.coreNumber, 'loss1310', v || null)}
        />
      ),
    },
    {
      label: '거리1310(km)',
      width: 'w-24',
      sortKey: (r) => r.dist1310,
      sortType: 'number',
      cell: (r) => (
        <EditableField
          value={r.dist1310 ?? ''}
          ariaLabel="거리1310"
          placeholder="—"
          disabled={!r.opgwId}
          onCommit={(v) => r.opgwId && commitCoreMeta(r.opgwId, r.coreNumber, 'dist1310', v || null)}
        />
      ),
    },
    {
      label: '손실1550(dB)',
      width: 'w-24',
      sortKey: (r) => r.loss1550,
      sortType: 'number',
      cell: (r) => (
        <EditableField
          value={r.loss1550 ?? ''}
          ariaLabel="손실1550"
          placeholder="—"
          disabled={!r.opgwId}
          onCommit={(v) => r.opgwId && commitCoreMeta(r.opgwId, r.coreNumber, 'loss1550', v || null)}
        />
      ),
    },
    {
      label: '거리1550(km)',
      width: 'w-24',
      sortKey: (r) => r.dist1550,
      sortType: 'number',
      cell: (r) => (
        <EditableField
          value={r.dist1550 ?? ''}
          ariaLabel="거리1550"
          placeholder="—"
          disabled={!r.opgwId}
          onCommit={(v) => r.opgwId && commitCoreMeta(r.opgwId, r.coreNumber, 'dist1550', v || null)}
        />
      ),
    },
    {
      label: '마지막점검일',
      width: 'w-32',
      sortKey: (r) => r.inspectDate,
      cell: (r) => (
        <EditableField
          value={r.inspectDate ?? ''}
          type="date"
          ariaLabel="마지막점검일"
          disabled={!r.opgwId}
          onCommit={(v) => r.opgwId && commitCoreMeta(r.opgwId, r.coreNumber, 'inspectDate', v || null)}
        />
      ),
    },
  ],
};
