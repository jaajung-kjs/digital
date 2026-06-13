import { useMemo } from 'react';
import { useEffectiveAssets, useEffectiveCables } from '../../workingCopy/hooks';
import { useSelectionStore } from '../../workspace/selectionStore';

// 통일 그리드 양식(선번장 OfdFiberRegister 규약): 헤더 셀 / 본문 셀 클래스.
const TH = 'px-2 py-2 text-[12px] font-medium tracking-wide text-content-muted whitespace-nowrap';
const TD = 'px-2 text-[13px] align-middle whitespace-nowrap';

/** effective Cable(WorkingCopyRow)에서 계통이 읽는 필드만 좁힌 형태. */
interface PowerCable {
  id: string;
  sourceAssetId: string | null;
  targetAssetId: string | null;
  sourceRole?: 'IN' | 'OUT' | null;
  targetRole?: 'IN' | 'OUT' | null;
  categoryName?: string | null;
  specParams?: Record<string, unknown> | null;
}

interface CbRow {
  cableId: string;
  loadAssetId: string | null;
  loadName: string | null;
  cbNumber: string;
  capacity: string;
  switchState: string;
  spec: string;
}
interface FeederSection {
  feederId: string;
  feederName: string;
  rows: CbRow[];
}
interface PanelSection {
  panelId: string;
  panelName: string;
  feeders: FeederSection[];
}

function asStr(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  return String(v);
}

/** 한 변전소의 계통 — 분전반 → 피더 섹션 → CB(피더 출력 케이블) 행. */
export function PanelCircuitView({ substationId }: { substationId: string }) {
  const assets = useEffectiveAssets();
  const cables = useEffectiveCables();

  const panels = useMemo<PanelSection[]>(() => {
    const nameById = new Map(assets.map((a) => [a.id, a.name]));

    const dists = assets.filter(
      (a) => a.substationId === substationId && (a.assetType?.code === 'DIST' || a.assetType?.placementKind === 'DIST'),
    );

    return dists.map((panel) => {
      const feeders = assets.filter(
        (a) => a.parentAssetId === panel.id && a.assetType?.connectionKind === 'distributor',
      );

      const feederSections: FeederSection[] = feeders.map((feeder) => {
        // Cable = 느슨한 WorkingCopyRow → 필요한 필드만 좁혀 읽는다.
        const cbCables = (cables as unknown as PowerCable[]).filter(
          (c) =>
            (c.sourceAssetId === feeder.id && c.sourceRole === 'OUT') ||
            (c.targetAssetId === feeder.id && c.targetRole === 'OUT'),
        );

        const rows: CbRow[] = cbCables.map((c) => {
          // LOAD = 피더 반대편 끝점.
          const loadAssetId = c.sourceAssetId === feeder.id ? c.targetAssetId : c.sourceAssetId;
          const sp = (c.specParams ?? {}) as Record<string, unknown>;
          return {
            cableId: c.id,
            loadAssetId: loadAssetId ?? null,
            loadName: (loadAssetId && nameById.get(loadAssetId)) || null,
            cbNumber: asStr(sp.cbNumber),
            capacity: asStr(sp.capacity),
            switchState: asStr(sp.switchState),
            spec: asStr(c.categoryName),
          };
        });

        return { feederId: feeder.id, feederName: feeder.name, rows };
      });

      return { panelId: panel.id, panelName: panel.name, feeders: feederSections };
    });
  }, [assets, cables, substationId]);

  if (!panels.length) return <p className="p-3 text-sm text-content-faint">이 변전소에 분전반이 없습니다.</p>;

  return (
    <div className="space-y-6">
      {panels.map((panel) => (
        <div key={panel.panelId} className="space-y-4">
          <h2 className="px-1 text-sm font-bold text-content">{panel.panelName}</h2>
          {panel.feeders.map((feeder) => {
            const used = feeder.rows.filter((r) => r.switchState.toUpperCase() === 'ON').length;
            return (
              <section key={feeder.feederId}>
                <header className="mb-1.5 flex items-baseline gap-2 px-1">
                  <h3 className="text-sm font-semibold text-content">{feeder.feederName}</h3>
                  <span className="ml-auto text-[12px] tabular-nums text-content-faint">사용 {used}/{feeder.rows.length}</span>
                </header>
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="text-left bg-surface-2 border-b border-line-strong">
                      <th className={`${TH} w-14`}>번호</th>
                      <th className={TH}>부하</th>
                      <th className={`${TH} w-20`}>용량</th>
                      <th className={TH}>규격</th>
                      <th className={`${TH} w-20`}>SW</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feeder.rows.map((r) => (
                      <CbRowView key={r.cableId} row={r} feederId={feeder.feederId} />
                    ))}
                  </tbody>
                </table>
              </section>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function CbRowView({ row, feederId }: { row: CbRow; feederId: string }) {
  // 행 클릭 → 공유 선택만. 하이라이트/트레이스는 사이드패널 연결탭에서(선번장 retrofit 과 동일).
  const onClick = () => {
    useSelectionStore.getState().setSelectedAssetId(row.loadAssetId ?? feederId);
  };

  const on = row.switchState.toUpperCase() === 'ON';

  return (
    <tr
      onClick={onClick}
      className="h-9 cursor-pointer border-b border-line transition-colors hover:bg-surface-2 active:bg-surface-3"
    >
      <td className={`${TD} tabular-nums text-content-muted`}>
        {row.cbNumber || <span className="text-content-faint">—</span>}
      </td>
      <td className={`${TD} text-content max-w-[12rem] truncate`} title={row.loadName ?? undefined}>
        {row.loadName ?? <span className="text-content-faint">—</span>}
      </td>
      <td className={`${TD} text-content-muted`}>
        {row.capacity || <span className="text-content-faint">—</span>}
      </td>
      <td className={`${TD} text-content-muted max-w-[12rem] truncate`} title={row.spec || undefined}>
        {row.spec || <span className="text-content-faint">—</span>}
      </td>
      <td className={TD}>
        {row.switchState ? (
          <span className="inline-flex items-center gap-1.5">
            {on && <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />}
            <span className={on ? 'text-content' : 'text-content-faint'}>{row.switchState}</span>
          </span>
        ) : (
          <span className="text-content-faint">—</span>
        )}
      </td>
    </tr>
  );
}
