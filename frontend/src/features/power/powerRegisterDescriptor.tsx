import { useSubstationWorkingCopy } from '../workingCopy/substationStore';
import { other } from '../cables/cableEndpoint';
import { EditableField } from '../assets/components/EditableField';
import { useCableCategories } from '../cables/hooks/useCableCategories';
import { buildFeederInput } from './feederCircuits';
import { VOLTAGE_OPTIONS } from './voltageBus';
import { ampDigits } from './powerUnits';
import { AmpField } from './components/AmpField';
import type { Asset } from '../../types/asset';
import type { RegisterCtx, RegisterDescriptor } from '../connections/registerGrid/registerTypes';

/** 피더 입력(IN)의 공유 선택 코어 센티넬 — CB 번호는 1..N(양수)이라 0 은 입력 전용.
 *  계통뷰 그리드 행 ↔ 사이드패널 IN 슬롯이 selectedCore 로 선택을 동기화하는 데 쓴다. */
export const FEEDER_INPUT_CORE = 0;

export interface CbRow {
  cableId: string;
  loadAssetId: string | null;
  loadName: string | null;
  cbNumber: string;
  voltage: string;
  capacity: string;
  switchState: string;
  spec: string;
  categoryId: string | null;
  isInput?: boolean;
}
interface PowerCable {
  id: string;
  sourceAssetId?: string | null;
  targetAssetId?: string | null;
  sourceRole?: string | null;
  targetRole?: string | null;
  categoryName?: string | null;
  categoryId?: string | null;
  number?: number | null;
  specParams?: Record<string, unknown> | null;
}

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
    const loadAssetId = other(c, feederId);
    const sp = (c.specParams ?? {}) as Record<string, unknown>;
    return {
      cableId: c.id,
      loadAssetId,
      loadName: (loadAssetId && nameById.get(loadAssetId)) || null,
      cbNumber: asStr(c.number),
      voltage: '', // 버스(피더 입력) 전압을 buildSection 에서 주입 — CB 는 전압을 따로 갖지 않는다.
      capacity: asStr(sp.capacity),
      // 개폐(CB) 상태 기본값 = ON. 미설정(새 연결 포함)은 ON, 명시적 'OFF' 만 차단(자산 status 규약과 동일).
      switchState: asStr(sp.switchState) || 'ON',
      spec: asStr(c.categoryName),
      categoryId: c.categoryId ?? null,
    };
  });
}

/** 규격 셀 — 전원 그룹 케이블 카테고리 드롭다운으로 categoryId 를 패치한다. */
function SpecCell({ cableId, categoryId, name }: { cableId: string; categoryId: string | null; name: string }) {
  const { data: cats = [] } = useCableCategories();
  const options = cats
    .filter((c) => c.displayGroup === '전원')
    .map((c) => ({ value: c.id, label: c.name }));

  return (
    <EditableField
      value={categoryId ?? ''}
      type="select"
      ariaLabel="규격"
      options={[{ value: '', label: '—' }, ...options]}
      display={() => name || <span className="text-content-faint">—</span>}
      onCommit={(catId) => {
        const cat = cats.find((c) => c.id === catId);
        useSubstationWorkingCopy.getState().patch('cables', cableId, {
          categoryId: catId || null,
          categoryName: cat?.name ?? null,
          categoryCode: cat?.code ?? null,
          displayColor: cat?.displayColor ?? null,
          specification: cat?.name ?? null,
        });
      }}
    />
  );
}

export const powerRegisterDescriptor: RegisterDescriptor<CbRow> = {
  emptyMessage: '이 변전소에 분전반이 없습니다.',
  childRole: 'feeder',
  selectContainers: (assets, substationId) =>
    assets.filter((a) => a.substationId === substationId && a.assetType?.role === 'panel'),
  containerHeader: (panel) => panel.name,
  buildSection: (feeder, ctx: RegisterCtx) => {
    const nameById = new Map((ctx.assets as Asset[]).map((a) => [a.id, a.name]));
    const input = buildFeederInput(feeder, ctx.cables as PowerCable[], nameById);
    // 전압은 버스(입력) 단위 — 모든 CB 행에 입력 전압을 주입(상속). 입력 없으면 ''.
    const busVoltage = input?.voltage ?? '';
    const outRows: CbRow[] = buildPowerRows(feeder.id, ctx.cables as PowerCable[], nameById)
      .map((r) => ({ ...r, voltage: busVoltage }));
    const inputRow: CbRow | null = input
      ? {
          cableId: input.cableId,
          loadAssetId: input.sourceAssetId,
          loadName: input.sourceName,
          cbNumber: '입력',
          voltage: input.voltage,
          capacity: input.capacity,
          switchState: input.switchState,
          spec: input.spec,
          categoryId: input.categoryId,
          isInput: true,
        }
      : null;
    const rows = inputRow ? [inputRow, ...outRows] : outRows;
    const used = outRows.filter((r) => r.switchState.toUpperCase() === 'ON').length;
    return { key: feeder.id, title: feeder.name, usedLabel: `사용 ${used}/${outRows.length}`, rows };
  },
  rowKey: (row) => row.cableId,
  onRowClick: (_row, feeder) => feeder.id,
  rowCore: (row) => row.isInput ? FEEDER_INPUT_CORE : (parseInt(row.cbNumber, 10) || null),
  columns: [
    {
      label: '번호',
      width: 'w-16',
      sortType: 'number',
      sortKey: (r) => r.isInput ? -1 : (parseInt(r.cbNumber, 10) || 0),
      cell: (r) =>
        r.isInput ? (
          <span className="inline-flex items-center rounded bg-danger-bg px-1.5 py-0.5 text-xs font-medium text-danger">입력</span>
        ) : (
          <EditableField
            value={r.cbNumber}
            ariaLabel="번호"
            placeholder="번호"
            onCommit={(v) => {
              const n = v ? parseInt(v, 10) : NaN;
              useSubstationWorkingCopy.getState().patch('cables', r.cableId, {
                number: Number.isNaN(n) ? null : n,
              });
            }}
          />
        ),
    },
    {
      label: '부하',
      width: 'w-48', // cell 의 max-w-[12rem] 과 맞춤 — width 없으면 table-fixed 가 남는 공간을 전부 흡수해 과대폭.
      sortKey: (r) => r.loadName,
      cell: (r) => (
        <span className="text-content max-w-[12rem] truncate inline-block align-bottom" title={r.loadName ?? undefined}>
          {r.loadName ?? <span className="text-content-faint">—</span>}
        </span>
      ),
    },
    {
      label: '전압',
      width: 'w-32',
      sortKey: (r) => r.voltage,
      // 전압은 버스(입력) 단위 — 입력 행에서만 편집(select), CB 행은 버스 전압 상속(읽기전용).
      // 입력 전압을 바꾸면 buildSection 이 모든 CB 행에 새 버스 전압을 다시 주입한다.
      cell: (r) =>
        r.isInput ? (
          <EditableField
            value={r.voltage}
            type="select"
            ariaLabel="전압"
            options={VOLTAGE_OPTIONS}
            onCommit={(v) => commitMeta(r.cableId, 'voltage', v || null)}
          />
        ) : (
          <span className="text-content-muted truncate inline-block align-bottom w-full" title={r.voltage || undefined}>
            {r.voltage || <span className="text-content-faint">—</span>}
          </span>
        ),
    },
    {
      label: '용량(A)',
      width: 'w-20',
      sortType: 'number',
      sortKey: (r) => parseFloat(ampDigits(r.capacity)) || 0,
      cell: (r) => <AmpField value={r.capacity} onCommit={(v) => commitMeta(r.cableId, 'capacity', v)} />,
    },
    {
      label: '규격',
      width: 'w-52',
      sortKey: (r) => r.spec,
      cell: (r) => <SpecCell cableId={r.cableId} categoryId={r.categoryId} name={r.spec} />,
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
