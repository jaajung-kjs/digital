import { useMemo } from 'react';
import { usePortStatus } from '../hooks/usePortStatus';
import { useEffectiveFiberCores } from '../../workingCopy/hooks';
import { buildFiberCoreRows } from '../fiberRegister';
import { useSelectionStore } from '../../workspace/selectionStore';
import { usePathHighlightStore } from '../../pathTrace/stores/pathHighlightStore';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { generateTempId } from '../../../utils/idHelpers';
import type { FiberCoreRow } from '../types';

/** 코어 메타 한 필드를 워킹카피에 스테이징한다 — 희소: 기존 행은 patch, 없으면 put(신규 임시 id). */
function commitMeta(
  row: FiberCoreRow,
  field: 'purpose' | 'circuitText' | 'spliceType' | 'usageOverride',
  value: string | null,
) {
  const wc = useSubstationWorkingCopy.getState();
  if (row.coreRecordId) {
    wc.patch('fiberCores', row.coreRecordId, { [field]: value });
  } else {
    wc.put('fiberCores', {
      id: generateTempId(),
      fiberPathId: row.fiberPathId,
      coreNumber: row.coreNumber,
      purpose: null, circuitText: null, spliceType: null, usageOverride: null,
      [field]: value,
    });
  }
}

/** 한 OFD 의 선번장 — 광경로(상대국)별 섹션 + 코어 행. usePortStatus 합법 호출 단위. */
export function OfdFiberRegister({ ofdId }: { ofdId: string }) {
  const { mergedPaths, isLoading } = usePortStatus(ofdId);
  const fiberCores = useEffectiveFiberCores();

  const sections = useMemo(
    () => mergedPaths.map((p) => ({ path: p, rows: buildFiberCoreRows(p, ofdId, fiberCores) })),
    [mergedPaths, ofdId, fiberCores],
  );

  if (isLoading) return <p className="p-3 text-sm text-content-faint">불러오는 중…</p>;
  if (!sections.length) return null;

  return (
    <div className="space-y-4">
      {sections.map(({ path, rows }) => {
        const remoteName = path.ofdA.id === ofdId ? path.ofdB.substationName : path.ofdA.substationName;
        const used = rows.filter((r) => r.usage === '사용').length;
        return (
          <section key={path.id}>
            <header className="mb-1 flex items-center gap-2 px-1 text-[12px] font-medium text-content-muted">
              <span>{remoteName}</span>
              <span className="ml-auto tabular-nums text-content-faint">사용 {used}/{path.portCount}</span>
            </header>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] text-content-faint border-b border-line">
                  <th className="px-2 py-1 w-12 tabular-nums">코어</th>
                  <th className="px-2 py-1">근접자산</th>
                  <th className="px-2 py-1">상대국측</th>
                  <th className="px-2 py-1">용도</th>
                  <th className="px-2 py-1">수용내역</th>
                  <th className="px-2 py-1 w-16">융착</th>
                  <th className="px-2 py-1 w-14">사용</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => <CoreRow key={r.coreNumber} ofdId={ofdId} row={r} />)}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}

function CoreRow({ ofdId, row }: { ofdId: string; row: FiberCoreRow }) {
  const tracingCableId = usePathHighlightStore((s) => s.tracingCableId);
  const active = !!row.near && tracingCableId === row.near.cableId;

  const onClick = () => {
    if (row.near) {
      useSelectionStore.getState().setSelectedAssetId(row.near.assetId);
      usePathHighlightStore.getState().startTrace(row.near.cableId);
    } else {
      useSelectionStore.getState().setSelectedAssetId(ofdId);
    }
  };

  return (
    <tr
      onClick={onClick}
      className={`border-b border-line cursor-pointer ${active ? 'bg-info-bg' : 'hover:bg-surface-2'}`}
    >
      <td className="px-2 py-1.5 tabular-nums text-content-muted">{row.coreNumber}</td>
      <td className="px-2 py-1.5 truncate">{row.near?.assetName ?? <span className="text-content-faint">—</span>}</td>
      <td className="px-2 py-1.5 truncate text-content-muted">{row.far?.assetName ?? <span className="text-content-faint">—</span>}</td>
      <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
        <input
          aria-label="용도" placeholder="용도" defaultValue={row.purpose ?? ''}
          key={`${row.coreNumber}-purpose-${row.purpose ?? ''}`}
          onBlur={(e) => { const v = e.target.value || null; if (v !== row.purpose) commitMeta(row, 'purpose', v); }}
          className="w-full text-[12px] border border-line rounded px-1 py-0.5 bg-surface"
        />
      </td>
      <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
        <input
          aria-label="수용내역" placeholder="수용내역" defaultValue={row.circuitText ?? ''}
          key={`${row.coreNumber}-circuit-${row.circuitText ?? ''}`}
          onBlur={(e) => { const v = e.target.value || null; if (v !== row.circuitText) commitMeta(row, 'circuitText', v); }}
          className="w-full text-[12px] border border-line rounded px-1 py-0.5 bg-surface"
        />
      </td>
      <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
        <select aria-label="융착" value={row.spliceType ?? ''}
          onChange={(e) => commitMeta(row, 'spliceType', e.target.value || null)}
          className="text-[12px] border border-line rounded px-1 py-0.5 bg-surface">
          <option value="">—</option>
          <option value="융착">융착</option>
          <option value="패치">패치</option>
        </select>
      </td>
      <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
        <select aria-label="사용" value={row.usageOverride ?? '자동'}
          onChange={(e) => commitMeta(row, 'usageOverride', e.target.value === '자동' ? null : e.target.value)}
          className="text-[12px] border border-line rounded px-1 py-0.5 bg-surface">
          <option value="자동">자동{row.usage === '사용' ? '(사용)' : '(미사용)'}</option>
          <option value="사용">사용</option>
          <option value="미사용">미사용</option>
        </select>
      </td>
    </tr>
  );
}
