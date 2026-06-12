import { useMemo } from 'react';
import { usePortStatus } from '../hooks/usePortStatus';
import { useEffectiveFiberCores } from '../../workingCopy/hooks';
import { buildFiberCoreRows } from '../fiberRegister';
import { useSelectionStore } from '../../workspace/selectionStore';
import { usePathHighlightStore } from '../../pathTrace/stores/pathHighlightStore';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { generateTempId, isTempId } from '../../../utils/idHelpers';
import type { FiberCoreRow } from '../types';

/** 코어 메타 한 필드를 워킹카피에 스테이징한다 — 희소: 기존 행(저장됨/스테이징됨)은 patch, 정말 없으면 put(신규 임시 id). */
function commitMeta(
  row: FiberCoreRow,
  field: 'purpose' | 'circuitText' | 'spliceType' | 'usageOverride',
  value: string | null,
) {
  const wc = useSubstationWorkingCopy.getState();
  if (row.coreRecordId) {
    wc.patch('fiberCores', row.coreRecordId, { [field]: value });
    return;
  }
  // 같은 (fiberPathId, coreNumber) 로 이미 스테이징된 신규 create 가 있으면 거기에 patch
  // — 두 번째 put 으로 UNIQUE(fiberPathId, coreNumber) 위반/커밋 롤백을 막는다.
  const existing = wc.effectiveFiberCores().find(
    (c) => isTempId(c.id) && c.fiberPathId === row.fiberPathId && c.coreNumber === row.coreNumber,
  );
  if (existing) {
    wc.patch('fiberCores', existing.id, { [field]: value });
    return;
  }
  wc.put('fiberCores', {
    id: generateTempId(),
    fiberPathId: row.fiberPathId,
    coreNumber: row.coreNumber,
    purpose: null, circuitText: null, spliceType: null, usageOverride: null,
    [field]: value,
  });
}

// 통일 그리드 양식(현황 NodeStatusView 규약): 헤더 셀 / 본문 셀 클래스.
const TH = 'px-2 py-2 text-[12px] font-medium tracking-wide text-content-muted whitespace-nowrap';
const TD = 'px-2 text-[13px] align-middle whitespace-nowrap';
const CELL_INPUT = 'w-full text-[13px] border border-line rounded px-1.5 py-1 bg-surface text-content';

/** 한 OFD 의 선번장 — 광경로(출발-도착 변전소)별 섹션 + 코어 행. usePortStatus 합법 호출 단위. */
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
    <div className="space-y-5">
      {sections.map(({ path, rows }) => {
        // 출발 = 보고 있는 OFD 의 변전소, 도착 = 상대국.
        const localIsA = path.ofdA.id === ofdId;
        const fromName = localIsA ? path.ofdA.substationName : path.ofdB.substationName;
        const toName = localIsA ? path.ofdB.substationName : path.ofdA.substationName;
        const used = rows.filter((r) => r.usage === '사용').length;
        return (
          <section key={path.id}>
            <header className="mb-1.5 flex items-baseline gap-2 px-1">
              <h3 className="text-sm font-semibold text-content">{fromName} - {toName}</h3>
              <span className="ml-auto text-[12px] tabular-nums text-content-faint">사용 {used}/{path.portCount}</span>
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
      className={`h-9 cursor-pointer border-b border-line transition-colors ${
        active ? 'bg-info-bg shadow-[inset_3px_0_0_var(--primary)]' : 'hover:bg-surface-2 active:bg-surface-3'
      }`}
    >
      <td className={`${TD} tabular-nums text-content-muted`}>{row.coreNumber}</td>
      <td className={`${TD} text-content max-w-[12rem] truncate`} title={row.near?.assetName ?? undefined}>
        {row.near?.assetName ?? <span className="text-content-faint">—</span>}
      </td>
      <td className={`${TD} text-content-muted max-w-[12rem] truncate`} title={row.far?.assetName ?? undefined}>
        {row.far?.assetName ?? <span className="text-content-faint">—</span>}
      </td>
      <td className={TD} onClick={(e) => e.stopPropagation()}>
        <input
          aria-label="용도" placeholder="용도" defaultValue={row.purpose ?? ''}
          key={`${row.coreNumber}-purpose-${row.purpose ?? ''}`}
          onBlur={(e) => { const v = e.target.value || null; if (v !== row.purpose) commitMeta(row, 'purpose', v); }}
          className={CELL_INPUT}
        />
      </td>
      <td className={TD} onClick={(e) => e.stopPropagation()}>
        <input
          aria-label="수용내역" placeholder="수용내역" defaultValue={row.circuitText ?? ''}
          key={`${row.coreNumber}-circuit-${row.circuitText ?? ''}`}
          onBlur={(e) => { const v = e.target.value || null; if (v !== row.circuitText) commitMeta(row, 'circuitText', v); }}
          className={CELL_INPUT}
        />
      </td>
      <td className={TD} onClick={(e) => e.stopPropagation()}>
        <select aria-label="융착" value={row.spliceType ?? ''}
          onChange={(e) => { const v = e.target.value || null; if (v !== row.spliceType) commitMeta(row, 'spliceType', v); }}
          className={CELL_INPUT}>
          <option value="">—</option>
          <option value="융착">융착</option>
          <option value="패치">패치</option>
        </select>
      </td>
      <td className={TD} onClick={(e) => e.stopPropagation()}>
        <select aria-label="사용" value={row.usageOverride ?? '자동'}
          onChange={(e) => { const v = e.target.value === '자동' ? null : e.target.value; if (v !== row.usageOverride) commitMeta(row, 'usageOverride', v); }}
          className={CELL_INPUT}>
          <option value="자동">자동{row.usage === '사용' ? '(사용)' : '(미사용)'}</option>
          <option value="사용">사용</option>
          <option value="미사용">미사용</option>
        </select>
      </td>
    </tr>
  );
}
