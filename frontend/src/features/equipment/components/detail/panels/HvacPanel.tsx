import { useState } from 'react';
import { useSnapshotStore } from '../../../../editor/stores/snapshotStore';
import { InfoTab } from '../InfoTab';
import { LogsTab } from '../LogsTab';
import { useMergedEquipmentDetail } from './GenericEquipmentPanel';

interface PanelProps {
  equipmentId: string;
  floorId: string;
}

type Tab = 'info' | 'spec' | 'operation' | 'maintenance' | 'logs';

const TABS: { key: Tab; label: string }[] = [
  { key: 'info', label: '정보' },
  { key: 'spec', label: '사양' },
  { key: 'operation', label: '운전' },
  { key: 'maintenance', label: '유지보수' },
  { key: 'logs', label: '점검/고장' },
];

interface Spec {
  coolingCapacityKW: number;
  refrigerant: string;
  ratedPowerKW: number;
}
type HvacMode = '냉방' | '난방' | '송풍' | '제습';
interface Setting {
  targetTempC: number;
  mode: HvacMode;
}
type MaintenanceType = '필터교체' | '냉매충전' | '정기점검' | '기타';
interface MaintenanceEntry {
  date: string;
  type: MaintenanceType;
  description: string;
  cost: number | null;
}

const DEFAULT_SPEC: Spec = { coolingCapacityKW: 5.6, refrigerant: 'R-410A', ratedPowerKW: 1.8 };
const DEFAULT_SETTING: Setting = { targetTempC: 24, mode: '냉방' };
const DEFAULT_MAINT: MaintenanceEntry[] = [
  {
    date: new Date().toISOString().slice(0, 10),
    type: '필터교체',
    description: '필터 청소',
    cost: null,
  },
];

export function HvacPanel({ equipmentId, floorId: _floorId }: PanelProps) {
  void _floorId;
  const snapshotActive = useSnapshotStore((s) => s.active);
  const { equipment, isLoading } = useMergedEquipmentDetail(equipmentId);
  const [activeTab, setActiveTab] = useState<Tab>('info');

  const [spec, setSpec] = useState<Spec>(DEFAULT_SPEC);
  const [setting, setSetting] = useState<Setting>(DEFAULT_SETTING);
  const [maintenance, setMaintenance] = useState<MaintenanceEntry[]>(DEFAULT_MAINT);

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
            {activeTab === 'spec' && (
              <SpecView spec={spec} setSpec={setSpec} readOnly={snapshotActive} />
            )}
            {activeTab === 'operation' && (
              <OperationView setting={setting} setSetting={setSetting} readOnly={snapshotActive} />
            )}
            {activeTab === 'maintenance' && (
              <MaintenanceView
                entries={maintenance}
                setEntries={setMaintenance}
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

function SpecView({ spec, setSpec, readOnly }: { spec: Spec; setSpec: (s: Spec) => void; readOnly: boolean }) {
  return (
    <div className="p-4 space-y-4">
      <PlaceholderBanner />
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">냉방 능력 (kW)</label>
        <input
          type="number"
          step="0.1"
          value={spec.coolingCapacityKW}
          disabled={readOnly}
          onChange={(e) => setSpec({ ...spec, coolingCapacityKW: Number(e.target.value) || 0 })}
          className="w-full text-sm border border-gray-300 rounded px-2.5 py-2 focus:outline-none focus:border-blue-400 disabled:bg-gray-50"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">냉매</label>
        <input
          type="text"
          value={spec.refrigerant}
          disabled={readOnly}
          onChange={(e) => setSpec({ ...spec, refrigerant: e.target.value })}
          className="w-full text-sm border border-gray-300 rounded px-2.5 py-2 focus:outline-none focus:border-blue-400 disabled:bg-gray-50"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">정격 전력 (kW)</label>
        <input
          type="number"
          step="0.1"
          value={spec.ratedPowerKW}
          disabled={readOnly}
          onChange={(e) => setSpec({ ...spec, ratedPowerKW: Number(e.target.value) || 0 })}
          className="w-full text-sm border border-gray-300 rounded px-2.5 py-2 focus:outline-none focus:border-blue-400 disabled:bg-gray-50"
        />
      </div>
    </div>
  );
}

function OperationView({
  setting,
  setSetting,
  readOnly,
}: {
  setting: Setting;
  setSetting: (s: Setting) => void;
  readOnly: boolean;
}) {
  const modes: HvacMode[] = ['냉방', '난방', '송풍', '제습'];
  return (
    <div className="p-4 space-y-4">
      <PlaceholderBanner />
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">목표 온도 (°C)</label>
        <input
          type="number"
          value={setting.targetTempC}
          disabled={readOnly}
          onChange={(e) => setSetting({ ...setting, targetTempC: Number(e.target.value) || 0 })}
          className="w-full text-sm border border-gray-300 rounded px-2.5 py-2 focus:outline-none focus:border-blue-400 disabled:bg-gray-50"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">모드</label>
        <select
          value={setting.mode}
          disabled={readOnly}
          onChange={(e) => setSetting({ ...setting, mode: e.target.value as HvacMode })}
          className="w-full text-sm border border-gray-300 rounded px-2.5 py-2 focus:outline-none focus:border-blue-400 disabled:bg-gray-50"
        >
          {modes.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function MaintenanceView({
  entries,
  setEntries,
  readOnly,
}: {
  entries: MaintenanceEntry[];
  setEntries: (e: MaintenanceEntry[]) => void;
  readOnly: boolean;
}) {
  const types: MaintenanceType[] = ['필터교체', '냉매충전', '정기점검', '기타'];
  const add = () => {
    setEntries([
      ...entries,
      {
        date: new Date().toISOString().slice(0, 10),
        type: '정기점검',
        description: '',
        cost: null,
      },
    ]);
  };
  const update = (idx: number, patch: Partial<MaintenanceEntry>) => {
    setEntries(entries.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  };
  const remove = (idx: number) => setEntries(entries.filter((_, i) => i !== idx));

  return (
    <div className="p-4 space-y-3">
      <PlaceholderBanner />
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-200">
              <th className="py-1.5 pr-2 w-24">일자</th>
              <th className="py-1.5 pr-2 w-20">유형</th>
              <th className="py-1.5 pr-2">내용</th>
              <th className="py-1.5 pr-2 w-16">비용</th>
              <th className="py-1.5 w-7"></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((m, idx) => (
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
                  <select
                    value={m.type}
                    disabled={readOnly}
                    onChange={(e) => update(idx, { type: e.target.value as MaintenanceType })}
                    className="w-full border border-gray-200 rounded px-1.5 py-1 disabled:bg-gray-50"
                  >
                    {types.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-1 pr-2">
                  <input
                    type="text"
                    value={m.description}
                    disabled={readOnly}
                    onChange={(e) => update(idx, { description: e.target.value })}
                    className="w-full border border-gray-200 rounded px-1.5 py-1 disabled:bg-gray-50"
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    type="number"
                    value={m.cost ?? ''}
                    disabled={readOnly}
                    onChange={(e) =>
                      update(idx, { cost: e.target.value === '' ? null : Number(e.target.value) })
                    }
                    className="w-full border border-gray-200 rounded px-1.5 py-1 disabled:bg-gray-50"
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
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-gray-400">
                  유지보수 기록이 없습니다.
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
          + 유지보수 추가
        </button>
      )}
    </div>
  );
}
