import { useMemo } from 'react';
import { usePortStatus } from '../hooks/usePortStatus';
import { useEffectiveFiberCores } from '../../workingCopy/hooks';
import { buildFiberCoreRows } from '../fiberRegister';
import { useSelectionStore } from '../../workspace/selectionStore';
import { usePathHighlightStore } from '../../pathTrace/stores/pathHighlightStore';
import type { FiberCoreRow } from '../types';

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
      <td className="px-2 py-1.5 text-content-muted">{row.purpose ?? <span className="text-content-faint">—</span>}</td>
      <td className="px-2 py-1.5 text-content-muted truncate">{row.circuitText ?? <span className="text-content-faint">—</span>}</td>
      <td className="px-2 py-1.5 text-content-muted">{row.spliceType ?? <span className="text-content-faint">—</span>}</td>
      <td className="px-2 py-1.5">
        {row.usage === '사용'
          ? <span className="inline-flex items-center gap-1 text-content"><span className="h-1.5 w-1.5 rounded-full bg-danger" />사용</span>
          : <span className="text-content-faint">미사용</span>}
      </td>
    </tr>
  );
}
