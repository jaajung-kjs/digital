import { useState } from 'react';
import { useSnapshotStore } from '../../../../editor/stores/snapshotStore';
import { InfoTab } from '../InfoTab';
import { LogsTab } from '../LogsTab';
import { useMergedEquipmentDetail } from './GenericEquipmentPanel';

interface PanelProps {
  equipmentId: string;
  floorId: string;
}

type Tab = 'info' | 'rated' | 'circuits' | 'logs';

const TABS: { key: Tab; label: string }[] = [
  { key: 'info', label: '정보' },
  { key: 'rated', label: '정격' },
  { key: 'circuits', label: '회로' },
  { key: 'logs', label: '점검/고장' },
];

interface Rated {
  voltage: number;
  phase: 1 | 3;
  mainBreakerA: number;
}
interface Circuit {
  circuitNo: number;
  label: string;
  breakerA: number;
  loadA: number | null;
  status: 'on' | 'off' | 'tripped';
  notes: string;
}

const DEFAULT_RATED: Rated = { voltage: 220, phase: 1, mainBreakerA: 100 };
const DEFAULT_CIRCUITS: Circuit[] = [
  { circuitNo: 1, label: '메인 분기', breakerA: 30, loadA: 12, status: 'on', notes: '' },
  { circuitNo: 2, label: '예비', breakerA: 20, loadA: null, status: 'off', notes: '' },
];

export function DistributionPanel({ equipmentId, floorId: _floorId }: PanelProps) {
  void _floorId;
  const snapshotActive = useSnapshotStore((s) => s.active);
  const { equipment, isLoading } = useMergedEquipmentDetail(equipmentId);
  const [activeTab, setActiveTab] = useState<Tab>('info');

  const [rated, setRated] = useState<Rated>(DEFAULT_RATED);
  const [circuits, setCircuits] = useState<Circuit[]>(DEFAULT_CIRCUITS);

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-gray-200 shrink-0">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex-1 px-2 py-2 text-sm font-medium transition-colors ${
              activeTab === t.key
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
          </div>
        ) : !equipment ? (
          <div className="p-4 text-center text-sm text-gray-400">데이터가 없습니다.</div>
        ) : (
          <>
            {activeTab === 'info' && <InfoTab equipment={equipment} readOnly={snapshotActive} />}
            {activeTab === 'rated' && (
              <RatedView rated={rated} setRated={setRated} readOnly={snapshotActive} />
            )}
            {activeTab === 'circuits' && (
              <CircuitsView circuits={circuits} setCircuits={setCircuits} readOnly={snapshotActive} />
            )}
            {activeTab === 'logs' && (
              snapshotActive ? (
                <div className="flex items-center justify-center py-12 text-sm text-gray-400">
                  이 버전의 점검/고장 이력은 포함되어 있지 않습니다
                </div>
              ) : (
                <LogsTab equipmentId={equipmentId} readOnly={false} />
              )
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PlaceholderBanner() {
  return (
    <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded px-2 py-1.5 leading-relaxed">
      ※ 임시 패널 — 데이터는 저장되지 않습니다 (백엔드 영구화는 후속 단계).
    </p>
  );
}

function RatedView({ rated, setRated, readOnly }: { rated: Rated; setRated: (r: Rated) => void; readOnly: boolean }) {
  return (
    <div className="p-4 space-y-4">
      <PlaceholderBanner />
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">전압 (V)</label>
        <input
          type="number"
          value={rated.voltage}
          disabled={readOnly}
          onChange={(e) => setRated({ ...rated, voltage: Number(e.target.value) || 0 })}
          className="w-full text-sm border border-gray-300 rounded px-2.5 py-2 focus:outline-none focus:border-blue-400 disabled:bg-gray-50"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">상수</label>
        <select
          value={rated.phase}
          disabled={readOnly}
          onChange={(e) => setRated({ ...rated, phase: Number(e.target.value) as 1 | 3 })}
          className="w-full text-sm border border-gray-300 rounded px-2.5 py-2 focus:outline-none focus:border-blue-400 disabled:bg-gray-50"
        >
          <option value={1}>단상 (1Φ)</option>
          <option value={3}>삼상 (3Φ)</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">메인 차단기 (A)</label>
        <input
          type="number"
          value={rated.mainBreakerA}
          disabled={readOnly}
          onChange={(e) => setRated({ ...rated, mainBreakerA: Number(e.target.value) || 0 })}
          className="w-full text-sm border border-gray-300 rounded px-2.5 py-2 focus:outline-none focus:border-blue-400 disabled:bg-gray-50"
        />
      </div>
    </div>
  );
}

function CircuitsView({
  circuits,
  setCircuits,
  readOnly,
}: {
  circuits: Circuit[];
  setCircuits: (c: Circuit[]) => void;
  readOnly: boolean;
}) {
  const addCircuit = () => {
    const nextNo = circuits.length === 0 ? 1 : Math.max(...circuits.map((c) => c.circuitNo)) + 1;
    setCircuits([
      ...circuits,
      { circuitNo: nextNo, label: '', breakerA: 20, loadA: null, status: 'off', notes: '' },
    ]);
  };
  const update = (idx: number, patch: Partial<Circuit>) => {
    const next = circuits.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    setCircuits(next);
  };
  const remove = (idx: number) => setCircuits(circuits.filter((_, i) => i !== idx));

  return (
    <div className="p-4 space-y-3">
      <PlaceholderBanner />
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-200">
              <th className="py-1.5 pr-2 w-10">#</th>
              <th className="py-1.5 pr-2">라벨</th>
              <th className="py-1.5 pr-2 w-14">차단기</th>
              <th className="py-1.5 pr-2 w-14">부하</th>
              <th className="py-1.5 pr-2 w-20">상태</th>
              <th className="py-1.5 w-7"></th>
            </tr>
          </thead>
          <tbody>
            {circuits.map((c, idx) => (
              <tr key={idx} className="border-b border-gray-100">
                <td className="py-1 pr-2">
                  <input
                    type="number"
                    value={c.circuitNo}
                    disabled={readOnly}
                    onChange={(e) => update(idx, { circuitNo: Number(e.target.value) || 0 })}
                    className="w-full border border-gray-200 rounded px-1.5 py-1 disabled:bg-gray-50"
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    type="text"
                    value={c.label}
                    disabled={readOnly}
                    onChange={(e) => update(idx, { label: e.target.value })}
                    className="w-full border border-gray-200 rounded px-1.5 py-1 disabled:bg-gray-50"
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    type="number"
                    value={c.breakerA}
                    disabled={readOnly}
                    onChange={(e) => update(idx, { breakerA: Number(e.target.value) || 0 })}
                    className="w-full border border-gray-200 rounded px-1.5 py-1 disabled:bg-gray-50"
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    type="number"
                    value={c.loadA ?? ''}
                    disabled={readOnly}
                    onChange={(e) =>
                      update(idx, { loadA: e.target.value === '' ? null : Number(e.target.value) })
                    }
                    className="w-full border border-gray-200 rounded px-1.5 py-1 disabled:bg-gray-50"
                  />
                </td>
                <td className="py-1 pr-2">
                  <select
                    value={c.status}
                    disabled={readOnly}
                    onChange={(e) => update(idx, { status: e.target.value as Circuit['status'] })}
                    className="w-full border border-gray-200 rounded px-1.5 py-1 disabled:bg-gray-50"
                  >
                    <option value="on">ON</option>
                    <option value="off">OFF</option>
                    <option value="tripped">TRIP</option>
                  </select>
                </td>
                <td className="py-1 text-right">
                  {!readOnly && (
                    <button
                      onClick={() => remove(idx)}
                      className="text-gray-400 hover:text-red-500"
                      title="삭제"
                    >
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {circuits.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-center text-gray-400">
                  회로가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <button
          onClick={addCircuit}
          className="w-full text-sm border border-dashed border-gray-300 text-gray-500 rounded py-2 hover:bg-gray-50 hover:border-gray-400"
        >
          + 회로 추가
        </button>
      )}
    </div>
  );
}
