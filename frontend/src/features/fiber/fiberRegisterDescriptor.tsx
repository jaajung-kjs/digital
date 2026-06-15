import { useSubstationWorkingCopy } from '../workingCopy/substationStore';
import { remoteSlotSubstation, type TraceGraph } from '../trace/traceGraph';
import { buildSlotCoreRows, type SlotCoreRow } from './slotRegister';
import type { RegisterCtx, RegisterDescriptor } from '../connections/registerGrid/registerTypes';

const CELL_INPUT = 'w-full text-[13px] border border-line rounded px-1.5 py-1 bg-surface text-content';

/** 점유 코어 한 필드를 OUT 케이블 specParams 에 머지 스테이징(기존 키 보존). */
function commitMeta(cableId: string, field: string, value: string | null) {
  const wc = useSubstationWorkingCopy.getState();
  const cable = wc.effectiveCables().find((c) => c.id === cableId);
  const prev = ((cable?.specParams as Record<string, unknown>) ?? {});
  wc.patch('cables', cableId, { specParams: { ...prev, [field]: value } });
}

/** __nameById 동봉 — cell(row) 시그니처에 ctx 없으므로 row 에 해소맵 첨부. */
export type FiberRow = SlotCoreRow & { __nameById?: Map<string, string> };

export const fiberRegisterDescriptor: RegisterDescriptor<FiberRow> = {
  emptyMessage: '이 변전소에 OFD(광단국)가 없습니다.',
  childKind: 'conduit',
  selectContainers: (assets, substationId) =>
    assets.filter((a) => a.assetType?.placementKind === 'OFD' && a.substationId === substationId),
  buildSection: (slot, ctx: RegisterCtx) => {
    const graph = ctx.graph as TraceGraph | null;
    const ofdId = slot.parentAssetId ?? slot.id;
    const rows = buildSlotCoreRows(slot as never, ctx.cables as never[], graph)
      .map((r): FiberRow => ({ ...r, __nameById: graph?.nameById }));
    const used = rows.filter((r) => r.usage === '사용').length;
    const localSub = graph?.subNameById.get(ofdId) ?? null;
    const remoteSub = graph ? remoteSlotSubstation(slot.id, graph) : null;
    const title = [localSub, remoteSub].filter(Boolean).join(' - ') || (slot.name ?? '광경로');
    return {
      key: slot.id,
      title,
      usedLabel: `사용 ${used}/${rows.length}${ctx.isLoading ? ' · 대국 불러오는 중…' : ''}`,
      rows,
    };
  },
  rowKey: (row) => row.coreNumber,
  rowTraceCableId: (row) => row.cableId,
  onRowClick: (row, slot) => row.nearAssetId ?? (slot.parentAssetId ?? slot.id),
  columns: [
    {
      label: '코어',
      width: 'w-14',
      cell: (r) => <span className="tabular-nums text-content-muted">{r.coreNumber}</span>,
    },
    {
      label: '근접자산',
      cell: (r) => {
        const name = r.nearAssetId ? (r.__nameById?.get(r.nearAssetId) ?? null) : null;
        return (
          <span
            className="text-content max-w-[12rem] truncate inline-block align-bottom"
            title={name ?? undefined}
          >
            {name ?? <span className="text-content-faint">—</span>}
          </span>
        );
      },
    },
    {
      label: '상대국측',
      cell: (r) => (
        <span
          className="text-content-muted max-w-[12rem] truncate inline-block align-bottom"
          title={r.farName ?? undefined}
        >
          {r.farName ?? <span className="text-content-faint">—</span>}
        </span>
      ),
    },
    {
      label: '용도',
      cell: (r) => (
        <input
          aria-label="용도"
          placeholder="용도"
          defaultValue={r.purpose ?? ''}
          disabled={!r.cableId}
          key={`${r.coreNumber}-purpose-${r.purpose ?? ''}`}
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => {
            const v = e.target.value || null;
            if (r.cableId && v !== r.purpose) commitMeta(r.cableId, 'purpose', v);
          }}
          className={CELL_INPUT}
        />
      ),
    },
    {
      label: '수용내역',
      cell: (r) => (
        <input
          aria-label="수용내역"
          placeholder="수용내역"
          defaultValue={r.circuitText ?? ''}
          disabled={!r.cableId}
          key={`${r.coreNumber}-circuit-${r.circuitText ?? ''}`}
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => {
            const v = e.target.value || null;
            if (r.cableId && v !== r.circuitText) commitMeta(r.cableId, 'circuitText', v);
          }}
          className={CELL_INPUT}
        />
      ),
    },
    {
      label: '융착',
      width: 'w-24',
      cell: (r) => (
        <select
          aria-label="융착"
          value={r.spliceType ?? ''}
          disabled={!r.cableId}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            const v = e.target.value || null;
            if (r.cableId && v !== r.spliceType) commitMeta(r.cableId, 'spliceType', v);
          }}
          className={CELL_INPUT}
        >
          <option value="">—</option>
          <option value="융착">융착</option>
          <option value="패치">패치</option>
        </select>
      ),
    },
    {
      label: '사용',
      width: 'w-28',
      cell: (r) => (
        <select
          aria-label="사용"
          value={r.usageOverride ?? '자동'}
          disabled={!r.cableId}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            const v = e.target.value === '자동' ? null : e.target.value;
            if (r.cableId && v !== r.usageOverride) commitMeta(r.cableId, 'usageOverride', v);
          }}
          className={CELL_INPUT}
        >
          <option value="자동">자동{r.occupied ? '(사용)' : '(미사용)'}</option>
          <option value="사용">사용</option>
          <option value="미사용">미사용</option>
        </select>
      ),
    },
  ],
};
