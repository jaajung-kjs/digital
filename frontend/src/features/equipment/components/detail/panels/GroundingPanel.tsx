import { useState } from 'react';
import { useSnapshotStore } from '../../../../editor/stores/snapshotStore';
import { InfoTab } from '../InfoTab';
import { LogsTab } from '../LogsTab';
import { useMergedEquipmentDetail } from './GenericEquipmentPanel';

interface PanelProps {
  equipmentId: string;
  floorId: string;
}

type Tab = 'info' | 'system' | 'bars' | 'measurement' | 'logs';

const TABS: { key: Tab; label: string }[] = [
  { key: 'info', label: '정보' },
  { key: 'system', label: '접지방식' },
  { key: 'bars', label: '버스바' },
  { key: 'measurement', label: '측정' },
  { key: 'logs', label: '점검/고장' },
];

type GroundingSystem = 'TT' | 'TN-S' | 'TN-C' | 'TN-C-S' | 'IT';
type GroundingType = '주접지' | '보조접지' | '특수접지';

interface BusBar {
  barNo: number;
  label: string;
  cableSpec: string;
  groundingType: GroundingType;
}
interface Measurement {
  date: string;
  resistanceOhm: number;
  inspector: string;
  pass: boolean;
}

const DEFAULT_BARS: BusBar[] = [
  { barNo: 1, label: '주 접지단자', cableSpec: 'IV 50SQ', groundingType: '주접지' },
];
const DEFAULT_MEASUREMENTS: Measurement[] = [
  { date: new Date().toISOString().slice(0, 10), resistanceOhm: 8.2, inspector: '', pass: true },
];

export function GroundingPanel({ equipmentId, floorId: _floorId }: PanelProps) {
  void _floorId;
  const snapshotActive = useSnapshotStore((s) => s.active);
  const { equipment, isLoading } = useMergedEquipmentDetail(equipmentId);
  const [activeTab, setActiveTab] = useState<Tab>('info');

  const [system, setSystem] = useState<GroundingSystem>('TN-S');
  const [bars, setBars] = useState<BusBar[]>(DEFAULT_BARS);
  const [measurements, setMeasurements] = useState<Measurement[]>(DEFAULT_MEASUREMENTS);

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-gray-200 shrink-0 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex-1 min-w-fit px-2 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
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
            {activeTab === 'system' && (
              <SystemView system={system} setSystem={setSystem} readOnly={snapshotActive} />
            )}
            {activeTab === 'bars' && (
              <BarsView bars={bars} setBars={setBars} readOnly={snapshotActive} />
            )}
            {activeTab === 'measurement' && (
              <MeasurementView
                measurements={measurements}
                setMeasurements={setMeasurements}
                readOnly={snapshotActive}
              />
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

function SystemView({
  system,
  setSystem,
  readOnly,
}: {
  system: GroundingSystem;
  setSystem: (s: GroundingSystem) => void;
  readOnly: boolean;
}) {
  const options: GroundingSystem[] = ['TT', 'TN-S', 'TN-C', 'TN-C-S', 'IT'];
  return (
    <div className="p-4 space-y-4">
      <PlaceholderBanner />
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-2">접지방식</label>
        <div className="space-y-1.5">
          {options.map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="grounding-system"
                value={opt}
                checked={system === opt}
                disabled={readOnly}
                onChange={() => setSystem(opt)}
              />
              {opt}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function BarsView({
  bars,
  setBars,
  readOnly,
}: {
  bars: BusBar[];
  setBars: (b: BusBar[]) => void;
  readOnly: boolean;
}) {
  const types: GroundingType[] = ['주접지', '보조접지', '특수접지'];
  const add = () => {
    const nextNo = bars.length === 0 ? 1 : Math.max(...bars.map((b) => b.barNo)) + 1;
    setBars([...bars, { barNo: nextNo, label: '', cableSpec: '', groundingType: '주접지' }]);
  };
  const update = (idx: number, patch: Partial<BusBar>) => {
    setBars(bars.map((b, i) => (i === idx ? { ...b, ...patch } : b)));
  };
  const remove = (idx: number) => setBars(bars.filter((_, i) => i !== idx));

  return (
    <div className="p-4 space-y-3">
      <PlaceholderBanner />
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-200">
              <th className="py-1.5 pr-2 w-10">#</th>
              <th className="py-1.5 pr-2">라벨</th>
              <th className="py-1.5 pr-2">사양</th>
              <th className="py-1.5 pr-2 w-20">유형</th>
              <th className="py-1.5 w-7"></th>
            </tr>
          </thead>
          <tbody>
            {bars.map((b, idx) => (
              <tr key={idx} className="border-b border-gray-100">
                <td className="py-1 pr-2">
                  <input
                    type="number"
                    value={b.barNo}
                    disabled={readOnly}
                    onChange={(e) => update(idx, { barNo: Number(e.target.value) || 0 })}
                    className="w-full border border-gray-200 rounded px-1.5 py-1 disabled:bg-gray-50"
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    type="text"
                    value={b.label}
                    disabled={readOnly}
                    onChange={(e) => update(idx, { label: e.target.value })}
                    className="w-full border border-gray-200 rounded px-1.5 py-1 disabled:bg-gray-50"
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    type="text"
                    value={b.cableSpec}
                    disabled={readOnly}
                    placeholder="예: IV 50SQ"
                    onChange={(e) => update(idx, { cableSpec: e.target.value })}
                    className="w-full border border-gray-200 rounded px-1.5 py-1 disabled:bg-gray-50"
                  />
                </td>
                <td className="py-1 pr-2">
                  <select
                    value={b.groundingType}
                    disabled={readOnly}
                    onChange={(e) => update(idx, { groundingType: e.target.value as GroundingType })}
                    className="w-full border border-gray-200 rounded px-1.5 py-1 disabled:bg-gray-50"
                  >
                    {types.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
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
            {bars.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-gray-400">
                  버스바가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <button
          onClick={add}
          className="w-full text-sm border border-dashed border-gray-300 text-gray-500 rounded py-2 hover:bg-gray-50 hover:border-gray-400"
        >
          + 버스바 추가
        </button>
      )}
    </div>
  );
}

function MeasurementView({
  measurements,
  setMeasurements,
  readOnly,
}: {
  measurements: Measurement[];
  setMeasurements: (m: Measurement[]) => void;
  readOnly: boolean;
}) {
  const add = () => {
    setMeasurements([
      ...measurements,
      {
        date: new Date().toISOString().slice(0, 10),
        resistanceOhm: 0,
        inspector: '',
        pass: true,
      },
    ]);
  };
  const update = (idx: number, patch: Partial<Measurement>) => {
    setMeasurements(measurements.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  };
  const remove = (idx: number) => setMeasurements(measurements.filter((_, i) => i !== idx));

  return (
    <div className="p-4 space-y-3">
      <PlaceholderBanner />
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-200">
              <th className="py-1.5 pr-2 w-24">일자</th>
              <th className="py-1.5 pr-2 w-16">저항 (Ω)</th>
              <th className="py-1.5 pr-2">검사자</th>
              <th className="py-1.5 pr-2 w-14">합격</th>
              <th className="py-1.5 w-7"></th>
            </tr>
          </thead>
          <tbody>
            {measurements.map((m, idx) => (
              <tr key={idx} className="border-b border-gray-100">
                <td className="py-1 pr-2">
                  <input
                    type="date"
                    value={m.date}
                    disabled={readOnly}
                    onChange={(e) => update(idx, { date: e.target.value })}
                    className="w-full border border-gray-200 rounded px-1.5 py-1 disabled:bg-gray-50"
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    type="number"
                    step="0.1"
                    value={m.resistanceOhm}
                    disabled={readOnly}
                    onChange={(e) => update(idx, { resistanceOhm: Number(e.target.value) || 0 })}
                    className="w-full border border-gray-200 rounded px-1.5 py-1 disabled:bg-gray-50"
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    type="text"
                    value={m.inspector}
                    disabled={readOnly}
                    onChange={(e) => update(idx, { inspector: e.target.value })}
                    className="w-full border border-gray-200 rounded px-1.5 py-1 disabled:bg-gray-50"
                  />
                </td>
                <td className="py-1 pr-2 text-center">
                  <input
                    type="checkbox"
                    checked={m.pass}
                    disabled={readOnly}
                    onChange={(e) => update(idx, { pass: e.target.checked })}
                  />
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
            {measurements.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-gray-400">
                  측정 기록이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <button
          onClick={add}
          className="w-full text-sm border border-dashed border-gray-300 text-gray-500 rounded py-2 hover:bg-gray-50 hover:border-gray-400"
        >
          + 측정 추가
        </button>
      )}
    </div>
  );
}
