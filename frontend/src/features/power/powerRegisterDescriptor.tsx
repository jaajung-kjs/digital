import { useSubstationWorkingCopy } from '../workingCopy/substationStore';
import { EditableField } from '../assets/components/EditableField';
import type { Asset } from '../../types/asset';
import type { RegisterCtx, RegisterDescriptor } from '../connections/registerGrid/registerTypes';

export interface CbRow { cableId: string; loadAssetId: string | null; loadName: string | null; cbNumber: string; capacity: string; switchState: string; spec: string }
interface PowerCable { id: string; sourceAssetId?: string | null; targetAssetId?: string | null; sourceRole?: string | null; targetRole?: string | null; categoryName?: string | null; specParams?: Record<string, unknown> | null }

const asStr = (v: unknown): string => (v === null || v === undefined || v === '' ? '' : String(v));

/** 점유 CB 한 필드를 케이블 specParams 에 머지 스테이징(기존 키 보존). */
export function commitMeta(cableId: string, field: string, value: string | null) {
  const wc = useSubstationWorkingCopy.getState();
  const cable = wc.effectiveCables().find((c) => c.id === cableId);
  const prev = ((cable?.specParams as Record<string, unknown>) ?? {});
  wc.patch('cables', cableId, { specParams: { ...prev, [field]: value } });
}

/** 한 피더의 CB행 — 피더 끝점 role OUT 케이블, 부하=반대편. 순수. */
export function buildPowerRows(feederId: string, cables: PowerCable[], nameById: Map<string, string>): CbRow[] {
  const cb = cables.filter(
    (c) => (c.sourceAssetId === feederId && c.sourceRole === 'OUT') || (c.targetAssetId === feederId && c.targetRole === 'OUT'),
  );
  return cb.map((c) => {
    const loadAssetId = c.sourceAssetId === feederId ? c.targetAssetId ?? null : c.sourceAssetId ?? null;
    const sp = (c.specParams ?? {}) as Record<string, unknown>;
    return {
      cableId: c.id, loadAssetId, loadName: (loadAssetId && nameById.get(loadAssetId)) || null,
      cbNumber: asStr(sp.cbNumber), capacity: asStr(sp.capacity), switchState: asStr(sp.switchState), spec: asStr(c.categoryName),
    };
  });
}

export const powerRegisterDescriptor: RegisterDescriptor<CbRow> = {
  emptyMessage: '이 변전소에 분전반이 없습니다.',
  childKind: 'distributor',
  selectContainers: (assets, substationId) =>
    assets.filter((a) => a.substationId === substationId && (a.assetType?.code === 'DIST' || a.assetType?.placementKind === 'DIST')),
  containerHeader: (panel) => panel.name,
  buildSection: (feeder, ctx: RegisterCtx) => {
    const nameById = new Map((ctx.assets as Asset[]).map((a) => [a.id, a.name]));
    const rows = buildPowerRows(feeder.id, ctx.cables as PowerCable[], nameById);
    const used = rows.filter((r) => r.switchState.toUpperCase() === 'ON').length;
    return { key: feeder.id, title: feeder.name, usedLabel: `사용 ${used}/${rows.length}`, rows };
  },
  rowKey: (row) => row.cableId,
  onRowClick: (row, feeder) => row.loadAssetId ?? feeder.id,
  columns: [
    {
      label: '번호',
      width: 'w-14',
      sortKey: (r) => r.cbNumber,
      cell: (r) => (
        <EditableField
          value={r.cbNumber}
          ariaLabel="번호"
          placeholder="번호"
          onCommit={(v) => commitMeta(r.cableId, 'cbNumber', v || null)}
        />
      ),
    },
    {
      label: '부하',
      sortKey: (r) => r.loadName,
      cell: (r) => (
        <span className="text-content max-w-[12rem] truncate inline-block align-bottom" title={r.loadName ?? undefined}>
          {r.loadName ?? <span className="text-content-faint">—</span>}
        </span>
      ),
    },
    {
      label: '용량',
      width: 'w-20',
      sortKey: (r) => r.capacity,
      cell: (r) => (
        <EditableField
          value={r.capacity}
          ariaLabel="용량"
          placeholder="용량"
          onCommit={(v) => commitMeta(r.cableId, 'capacity', v || null)}
        />
      ),
    },
    {
      label: '규격',
      sortKey: (r) => r.spec,
      cell: (r) => (
        <span className="text-content-muted max-w-[12rem] truncate inline-block align-bottom" title={r.spec || undefined}>
          {r.spec || <span className="text-content-faint">—</span>}
        </span>
      ),
    },
    {
      label: 'SW',
      width: 'w-20',
      sortKey: (r) => r.switchState,
      cell: (r) => (
        <EditableField
          value={r.switchState}
          type="select"
          ariaLabel="SW"
          options={[{ value: '', label: '—' }, { value: 'ON', label: 'ON' }, { value: 'OFF', label: 'OFF' }]}
          display={(v) => {
            const on = v.toUpperCase() === 'ON';
            return v
              ? (
                <span className="inline-flex items-center gap-1.5">
                  {on && <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />}
                  <span className={on ? 'text-content' : 'text-content-faint'}>{v}</span>
                </span>
              )
              : <span className="text-content-faint">—</span>;
          }}
          onCommit={(v) => commitMeta(r.cableId, 'switchState', v || null)}
        />
      ),
    },
  ],
};
