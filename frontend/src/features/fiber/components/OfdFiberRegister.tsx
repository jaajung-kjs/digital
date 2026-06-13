import { useMemo } from 'react';
import { useEffectiveAssets, useEffectiveCables } from '../../workingCopy/hooks';
import { useSelectionStore } from '../../workspace/selectionStore';
import { usePathHighlightStore } from '../../pathTrace/stores/pathHighlightStore';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { useTraceGraph, remoteSlotSubstation } from '../../trace/traceGraph';
import { buildSlotCoreRows, type SlotCoreRow } from '../slotRegister';
import type { Asset } from '../../../types/asset';

const TH = 'px-2 py-2 text-[12px] font-medium tracking-wide text-content-muted whitespace-nowrap';
const TD = 'px-2 text-[13px] align-middle whitespace-nowrap';
const CELL_INPUT = 'w-full text-[13px] border border-line rounded px-1.5 py-1 bg-surface text-content';

/** 점유 코어 한 필드를 OUT 케이블 specParams 에 머지 스테이징(기존 키 보존). */
function commitMeta(cableId: string, field: string, value: string | null) {
  const wc = useSubstationWorkingCopy.getState();
  const cable = wc.effectiveCables().find((c) => c.id === cableId);
  const prev = ((cable?.specParams as Record<string, unknown>) ?? {});
  wc.patch('cables', cableId, { specParams: { ...prev, [field]: value } });
}

/** 한 OFD 의 선번장 — OFD-SLOT 자식별 섹션 + 코어 행(범용 모델). */
export function OfdFiberRegister({ ofdId }: { ofdId: string }) {
  const assets = useEffectiveAssets() as Asset[];
  const cables = useEffectiveCables();
  const { graph, isLoading } = useTraceGraph();

  const slots = useMemo(
    () => assets.filter((a) => a.parentAssetId === ofdId && a.assetType?.connectionKind === 'conduit'),
    [assets, ofdId],
  );

  const sections = useMemo(
    () => slots.map((slot) => ({
      slot,
      rows: buildSlotCoreRows(
        slot as never,
        cables as unknown as Parameters<typeof buildSlotCoreRows>[1],
        graph,
      ),
    })),
    [slots, cables, graph],
  );

  if (!sections.length) return null;

  return (
    <div className="space-y-5">
      {sections.map(({ slot, rows }) => {
        const used = rows.filter((r) => r.usage === '사용').length;
        // 섹션 헤더 = `로컬변전소 - 대국변전소`. 로컬 = OFD(=slot 부모)의 변전소,
        // 대국 = 슬롯 OPGW twin 슬롯의 변전소. slot.name 은 dev 에서 전부 'OFD' 라 안 씀.
        const localSub = graph?.subNameById.get(ofdId) ?? null;
        const remoteSub = graph ? remoteSlotSubstation(slot.id, graph) : null;
        const title = [localSub, remoteSub].filter(Boolean).join(' - ') || (slot.name ?? '광경로');
        return (
          <section key={slot.id}>
            <header className="mb-1.5 flex items-baseline gap-2 px-1">
              <h3 className="text-sm font-semibold text-content">{title}</h3>
              <span className="ml-auto text-[12px] tabular-nums text-content-faint">
                사용 {used}/{rows.length}{isLoading ? ' · 대국 불러오는 중…' : ''}
              </span>
            </header>
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-left bg-surface-2 border-b border-line-strong">
                  <th className={`${TH} w-14`}>코어</th>
                  <th className={TH}>근접자산</th>
                  <th className={TH}>상대국측</th>
                  <th className={TH}>용도</th>
                  <th className={TH}>수용내역</th>
                  <th className={`${TH} w-24`}>융착</th>
                  <th className={`${TH} w-28`}>사용</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => <CoreRow key={r.coreNumber} ofdId={ofdId} nameById={graph?.nameById} row={r} />)}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}

function CoreRow({ ofdId, row, nameById }: { ofdId: string; row: SlotCoreRow; nameById?: Map<string, string> }) {
  const tracingCableId = usePathHighlightStore((s) => s.tracingCableId);
  const active = !!row.cableId && tracingCableId === row.cableId;
  const nearName = row.nearAssetId ? (nameById?.get(row.nearAssetId) ?? null) : null;

  const onClick = () => {
    useSelectionStore.getState().setSelectedAssetId(row.nearAssetId ?? ofdId);
  };

  return (
    <tr
      onClick={onClick}
      className={`h-9 cursor-pointer border-b border-line transition-colors ${
        active ? 'bg-info-bg shadow-[inset_3px_0_0_var(--primary)]' : 'hover:bg-surface-2 active:bg-surface-3'
      }`}
    >
      <td className={`${TD} tabular-nums text-content-muted`}>{row.coreNumber}</td>
      <td className={`${TD} text-content max-w-[12rem] truncate`} title={nearName ?? undefined}>
        {nearName ?? <span className="text-content-faint">—</span>}
      </td>
      <td className={`${TD} text-content-muted max-w-[12rem] truncate`} title={row.farName ?? undefined}>
        {row.farName ?? <span className="text-content-faint">—</span>}
      </td>
      <td className={TD} onClick={(e) => e.stopPropagation()}>
        <input aria-label="용도" placeholder="용도" defaultValue={row.purpose ?? ''} disabled={!row.cableId}
          key={`${row.coreNumber}-purpose-${row.purpose ?? ''}`}
          onBlur={(e) => { const v = e.target.value || null; if (row.cableId && v !== row.purpose) commitMeta(row.cableId, 'purpose', v); }}
          className={CELL_INPUT} />
      </td>
      <td className={TD} onClick={(e) => e.stopPropagation()}>
        <input aria-label="수용내역" placeholder="수용내역" defaultValue={row.circuitText ?? ''} disabled={!row.cableId}
          key={`${row.coreNumber}-circuit-${row.circuitText ?? ''}`}
          onBlur={(e) => { const v = e.target.value || null; if (row.cableId && v !== row.circuitText) commitMeta(row.cableId, 'circuitText', v); }}
          className={CELL_INPUT} />
      </td>
      <td className={TD} onClick={(e) => e.stopPropagation()}>
        <select aria-label="융착" value={row.spliceType ?? ''} disabled={!row.cableId}
          onChange={(e) => { const v = e.target.value || null; if (row.cableId && v !== row.spliceType) commitMeta(row.cableId, 'spliceType', v); }}
          className={CELL_INPUT}>
          <option value="">—</option>
          <option value="융착">융착</option>
          <option value="패치">패치</option>
        </select>
      </td>
      <td className={TD} onClick={(e) => e.stopPropagation()}>
        <select aria-label="사용" value={row.usageOverride ?? '자동'} disabled={!row.cableId}
          onChange={(e) => { const v = e.target.value === '자동' ? null : e.target.value; if (row.cableId && v !== row.usageOverride) commitMeta(row.cableId, 'usageOverride', v); }}
          className={CELL_INPUT}>
          <option value="자동">자동{row.occupied ? '(사용)' : '(미사용)'}</option>
          <option value="사용">사용</option>
          <option value="미사용">미사용</option>
        </select>
      </td>
    </tr>
  );
}
