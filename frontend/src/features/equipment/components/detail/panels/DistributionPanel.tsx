import { useMemo, useState } from 'react';
import { useEditorStore } from '../../../../editor/stores/editorStore';
import { useSnapshotStore } from '../../../../editor/stores/snapshotStore';
import { generateTempId } from '../../../../../utils/idHelpers';
import type { DistributionCircuit } from '../../../../../types/distributionCircuit';
import { BaseEquipmentTabsPanel } from './BaseEquipmentTabsPanel';

interface PanelProps {
  equipmentId: string;
  floorId: string;
}

export function DistributionPanel({ equipmentId, floorId }: PanelProps) {
  return (
    <BaseEquipmentTabsPanel
      equipmentId={equipmentId}
      floorId={floorId}
      defaultTabIndex={4}
      fifthTab={{
        label: '회로',
        render: () => <DistributionCircuits equipmentId={equipmentId} />,
      }}
    />
  );
}

function DistributionCircuits({ equipmentId }: { equipmentId: string }) {
  const snapshotActive = useSnapshotStore((s) => s.active);
  const allCircuits = useEditorStore((s) => s.localDistributionCircuits);
  const addCircuit = useEditorStore((s) => s.addDistributionCircuit);
  const removeCircuit = useEditorStore((s) => s.removeDistributionCircuit);

  const circuits = useMemo(
    () =>
      allCircuits
        .filter((c) => c.distributionEquipmentId === equipmentId)
        .sort((a, b) => a.feederName.localeCompare(b.feederName) || a.sortOrder - b.sortOrder),
    [allCircuits, equipmentId],
  );

  // feederName → 회로 배열 그룹핑.
  const byFeeder = useMemo(() => {
    const m = new Map<string, DistributionCircuit[]>();
    for (const c of circuits) {
      if (!m.has(c.feederName)) m.set(c.feederName, []);
      m.get(c.feederName)!.push(c);
    }
    return m;
  }, [circuits]);

  const [newFeeder, setNewFeeder] = useState('');

  const handleAddFeeder = () => {
    const name = newFeeder.trim();
    if (!name || byFeeder.has(name)) return;
    // feeder 는 회로의 그룹 라벨일 뿐 — 빈 feeder 를 표현하려면 placeholder
    // branch 가 하나 필요. "L1" 을 기본 분기로 같이 만든다.
    addCircuit({
      id: generateTempId(),
      distributionEquipmentId: equipmentId,
      feederName: name,
      branchName: 'L1',
      description: null,
      sortOrder: 0,
    });
    setNewFeeder('');
  };

  const handleAddBranch = (feederName: string, count: number) => {
    addCircuit({
      id: generateTempId(),
      distributionEquipmentId: equipmentId,
      feederName,
      branchName: `L${count + 1}`,
      description: null,
      sortOrder: count,
    });
  };

  if (snapshotActive) {
    return (
      <div className="p-4 text-sm text-gray-400">
        과거 도면 보기 중에는 회로를 편집할 수 없습니다.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto p-3 gap-3">
      {byFeeder.size === 0 ? (
        <p className="text-xs text-gray-400 py-2 text-center">
          전원 계통(피더)을 추가해 회로를 구성하세요.
        </p>
      ) : (
        [...byFeeder.entries()].map(([feederName, branches]) => (
          <div key={feederName} className="rounded-md border border-gray-200">
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700 truncate">{feederName}</span>
              <span className="text-[11px] text-gray-400">{branches.length}개 분기</span>
            </div>
            <ul className="divide-y divide-gray-100">
              {branches.map((c) => (
                <li
                  key={c.id}
                  className="px-3 py-1.5 flex items-center gap-2 text-sm group"
                >
                  <span className="flex-1 truncate text-gray-700">{c.branchName}</span>
                  <button
                    type="button"
                    onClick={() => removeCircuit(c.id)}
                    className="opacity-0 group-hover:opacity-100 text-xs text-red-500 hover:text-red-700 transition-opacity"
                    title="분기 삭제"
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => handleAddBranch(feederName, branches.length)}
              className="w-full px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 transition-colors border-t border-gray-100"
            >
              + 분기 추가
            </button>
          </div>
        ))
      )}

      <div className="flex items-center gap-2 pt-1">
        <input
          type="text"
          value={newFeeder}
          onChange={(e) => setNewFeeder(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAddFeeder();
          }}
          placeholder="전원 계통 이름 (예: DC 48V Main)"
          className="flex-1 text-sm border border-gray-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-blue-400"
        />
        <button
          type="button"
          onClick={handleAddFeeder}
          disabled={!newFeeder.trim()}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          추가
        </button>
      </div>
    </div>
  );
}
