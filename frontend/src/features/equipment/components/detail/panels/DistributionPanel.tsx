import { useMemo, useState } from 'react';
import { useEditorStore } from '../../../../editor/stores/editorStore';
import { useSnapshotStore } from '../../../../editor/stores/snapshotStore';
import { usePathHighlightStore } from '../../../../pathTrace/stores/pathHighlightStore';
import { generateTempId } from '../../../../../utils/idHelpers';
import {
  groupCircuitsByFeeder,
  type DistributionCircuit,
} from '../../../../../types/distributionCircuit';
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

/** branchName 에서 L 숫자 추출 — 다음 분기 번호는 max+1 (삭제분 재사용 안 함). */
function nextBranchName(branches: DistributionCircuit[]): string {
  let max = 0;
  for (const b of branches) {
    const m = /^L(\d+)$/.exec(b.branchName);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `L${max + 1}`;
}

/**
 * 분전반 회로 GUI — 실제 배전반 차단기 뱅크 메타포.
 * 전원 계통(feeder)이 가로 컬럼, 분기 차단기(L1…)가 세로 칸. 랙 RackSlotGrid
 * 의 EmptySlot/ModuleCell 클릭 인터랙션 톤을 차용 — 칸 클릭=계통 추적,
 * +칸 클릭=분기 즉시 추가.
 */
function DistributionCircuits({ equipmentId }: { equipmentId: string }) {
  const snapshotActive = useSnapshotStore((s) => s.active);
  const allCircuits = useEditorStore((s) => s.localDistributionCircuits);
  const localCables = useEditorStore((s) => s.localCables);
  const addCircuit = useEditorStore((s) => s.addDistributionCircuit);
  const removeCircuit = useEditorStore((s) => s.removeDistributionCircuit);
  const startCircuitTrace = usePathHighlightStore((s) => s.startCircuitTrace);

  const byFeeder = useMemo(
    () => groupCircuitsByFeeder(allCircuits, equipmentId),
    [allCircuits, equipmentId],
  );

  // 회로별 연결 여부 — 칸 색을 결정 (연결됨=파랑, 빈=회색 점선).
  const connectedCircuitIds = useMemo(() => {
    const s = new Set<string>();
    for (const c of localCables) {
      if (c.sourceCircuitId) s.add(c.sourceCircuitId);
      if (c.targetCircuitId) s.add(c.targetCircuitId);
    }
    return s;
  }, [localCables]);

  const [addingFeeder, setAddingFeeder] = useState(false);
  const [newFeeder, setNewFeeder] = useState('');

  const handleAddFeeder = () => {
    const name = newFeeder.trim();
    if (!name) return;
    const existing = byFeeder.get(name);
    if (existing) {
      // 같은 이름이면 새 계통이 아니라 기존 계통에 분기 하나 더 (feeder 는
      // 그룹 라벨이므로 동명 = 같은 계통).
      handleAddBranch(name, existing);
    } else {
      // 새 계통 — 빈 계통은 표현 못 하므로 L1 분기를 함께 생성.
      addCircuit({
        id: generateTempId(),
        distributionEquipmentId: equipmentId,
        feederName: name,
        branchName: 'L1',
        description: null,
        sortOrder: 0,
      });
    }
    setNewFeeder('');
    setAddingFeeder(false);
  };

  const handleAddBranch = (feederName: string, branches: DistributionCircuit[]) => {
    addCircuit({
      id: generateTempId(),
      distributionEquipmentId: equipmentId,
      feederName,
      branchName: nextBranchName(branches),
      description: null,
      sortOrder: branches.length,
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
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-3">
        {byFeeder.size === 0 && (
          <p className="text-xs text-gray-400 mb-3">
            전원 계통을 추가해 분전반 회로를 구성하세요.
          </p>
        )}
        {/* 3열 고정 — 실제 배전반 뱅크처럼. 넘치면 다음 행으로 wrap (가로
            스크롤 없음). */}
        <div className="grid grid-cols-3 gap-2 items-start">
            {[...byFeeder.entries()].map(([feederName, branches]) => (
              <div
                key={feederName}
                className="rounded-md border border-gray-300 bg-white overflow-hidden"
              >
                {/* feeder 헤더 — 메인 차단기 라벨. 추적 / 삭제 */}
                <div className="bg-gray-100 border-b border-gray-300 group/feeder">
                  <button
                    type="button"
                    onClick={() => startCircuitTrace(branches.map((b) => b.id))}
                    className="w-full px-2 py-1.5 text-left hover:bg-blue-100 transition-colors"
                    title="이 계통 전체 연결 추적"
                  >
                    <span className="block text-xs font-semibold text-gray-700 truncate">
                      {feederName}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        confirm(`'${feederName}' 계통과 그 분기 ${branches.length}개를 삭제할까요?`)
                      ) {
                        branches.forEach((b) => removeCircuit(b.id));
                      }
                    }}
                    className="w-full px-2 py-0.5 text-[10px] text-red-500 opacity-0 group-hover/feeder:opacity-100 hover:bg-red-50 transition-all"
                  >
                    계통 삭제
                  </button>
                </div>

                {/* 분기 차단기 칸 세로 스택 */}
                <div className="p-1.5 flex flex-col gap-1">
                  {branches.map((c) => {
                    const connected = connectedCircuitIds.has(c.id);
                    return (
                      <div key={c.id} className="relative group/branch">
                        <button
                          type="button"
                          onClick={() => startCircuitTrace([c.id])}
                          className={`w-full px-2 py-2 rounded text-xs font-medium text-center transition-colors ${
                            connected
                              ? 'bg-blue-50 border border-blue-300 text-blue-700 hover:bg-blue-100'
                              : 'bg-gray-50 border border-dashed border-gray-300 text-gray-400 hover:bg-gray-100'
                          }`}
                          title={connected ? '연결됨 — 클릭해 계통 추적' : '미연결 분기'}
                        >
                          {c.branchName}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeCircuit(c.id)}
                          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white border border-gray-300 text-[10px] text-red-500 leading-none opacity-0 group-hover/branch:opacity-100 hover:bg-red-50 transition-opacity"
                          title="분기 삭제"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}

                  {/* + 분기 — RackView EmptySlot 톤 */}
                  <button
                    type="button"
                    onClick={() => handleAddBranch(feederName, branches)}
                    className="w-full px-2 py-2 rounded text-xs text-gray-400 border border-dashed border-gray-300 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                  >
                    ＋ 분기
                  </button>
                </div>
              </div>
            ))}

            {/* + 전원 계통 — 클릭 시에만 inline 입력 노출 (상시 input 제거) */}
            <div>
              {addingFeeder ? (
                <div className="rounded-md border border-blue-300 bg-white p-2 flex flex-col gap-1.5">
                  <input
                    type="text"
                    autoFocus
                    value={newFeeder}
                    onChange={(e) => setNewFeeder(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddFeeder();
                      if (e.key === 'Escape') {
                        setAddingFeeder(false);
                        setNewFeeder('');
                      }
                    }}
                    placeholder="예: DC 48V Main"
                    className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
                  />
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={handleAddFeeder}
                      disabled={!newFeeder.trim()}
                      className="flex-1 text-xs py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      추가
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAddingFeeder(false);
                        setNewFeeder('');
                      }}
                      className="px-2 text-xs py-1 text-gray-500 hover:bg-gray-100 rounded"
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingFeeder(true)}
                  className="w-full h-16 rounded-md border border-dashed border-gray-300 text-xs text-gray-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                >
                  ＋ 전원 계통
                </button>
              )}
            </div>
        </div>
      </div>
    </div>
  );
}
