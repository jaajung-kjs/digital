import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEditorStore } from '../../../../editor/stores/editorStore';
import { useSnapshotStore } from '../../../../editor/stores/snapshotStore';
import { useOfdConnectionFlowStore } from '../../../../fiber/stores/ofdConnectionFlowStore';
import { FiberPathManager } from '../../../../fiber/components/FiberPathManager';
import { usePortStatus } from '../../../../fiber/hooks/usePortStatus';
import { InfoTab } from '../InfoTab';
import { LogsTab } from '../LogsTab';
import { useMergedEquipmentDetail } from './GenericEquipmentPanel';

interface PanelProps {
  equipmentId: string;
  floorId: string;
}

type Tab = 'info' | 'ports' | 'paths' | 'logs';

const TABS: { key: Tab; label: string }[] = [
  { key: 'info', label: '정보' },
  { key: 'ports', label: '포트' },
  { key: 'paths', label: '광경로' },
  { key: 'logs', label: '점검/고장' },
];

export function OfdEquipmentPanel({ equipmentId, floorId: _floorId }: PanelProps) {
  void _floorId;
  const snapshotActive = useSnapshotStore((s) => s.active);
  const { equipment, isLoading } = useMergedEquipmentDetail(equipmentId);
  const ofdPhase = useOfdConnectionFlowStore((s) => s.phase);
  const ofdFlowOfdId = useOfdConnectionFlowStore((s) => s.ofdId);
  const isFlowActive = ofdPhase === 'selectingPort' && ofdFlowOfdId === equipmentId;

  const [activeTab, setActiveTab] = useState<Tab>(isFlowActive ? 'ports' : 'info');

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
            {activeTab === 'ports' && <OfdPortsView equipmentId={equipmentId} />}
            {activeTab === 'paths' && <OfdPathsView equipmentId={equipmentId} />}
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

/* ── 포트 탭 — 광경로별 포트 그리드 요약 ────────────────────────── */

function OfdPortsView({ equipmentId }: { equipmentId: string }) {
  const { mergedPaths, isLoading } = usePortStatus(equipmentId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
      </div>
    );
  }
  if (mergedPaths.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-gray-400">
        등록된 광경로가 없습니다. 광경로 탭에서 추가하세요.
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <p className="text-[11px] text-gray-400 leading-relaxed">
        ※ 임시 포트 그리드 — 자세한 연결/해제는 「광경로」 탭에서 조작합니다.
      </p>
      {mergedPaths.map((path) => {
        const localIsA = path.ofdA.id === equipmentId;
        const remote = localIsA ? path.ofdB : path.ofdA;
        return (
          <div key={path.id} className="rounded border border-gray-200 bg-white">
            <div className="px-3 py-2 border-b border-gray-200 bg-gray-50">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-gray-700 truncate">
                  → {remote.name}
                </span>
                <span className="text-xs text-gray-400">{path.portCount}코어</span>
              </div>
            </div>
            <div className="p-3 grid grid-cols-8 gap-1">
              {path.ports.map((p) => {
                const used = (localIsA ? p.sideA : p.sideB) != null;
                return (
                  <div
                    key={p.portNumber}
                    title={`포트 ${p.portNumber}${used ? ' (사용 중)' : ''}`}
                    className={`h-6 rounded text-[10px] flex items-center justify-center ${
                      used
                        ? 'bg-blue-500 text-white font-medium'
                        : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {p.portNumber}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── 광경로 탭 ──────────────────────────────────────────────────── */

function OfdPathsView({ equipmentId }: { equipmentId: string }) {
  const navigate = useNavigate();
  const snapshotActive = useSnapshotStore((s) => s.active);
  const ofdPhase = useOfdConnectionFlowStore((s) => s.phase);
  const ofdFlowOfdId = useOfdConnectionFlowStore((s) => s.ofdId);
  const ofdDirection = useOfdConnectionFlowStore((s) => s.direction);
  const cancelOfd = useOfdConnectionFlowStore((s) => s.cancel);
  const selectPort = useOfdConnectionFlowStore((s) => s.selectPort);
  const deleteCable = useEditorStore((s) => s.deleteCable);
  const updateCable = useEditorStore((s) => s.updateCable);
  const isFlowActive = ofdPhase === 'selectingPort' && ofdFlowOfdId === equipmentId;

  if (snapshotActive) {
    return (
      <FiberPathManager
        ofdId={equipmentId}
        onNavigateRemote={(remoteRoomId) => navigate(`/floors/${remoteRoomId}/plan`)}
      />
    );
  }

  return (
    <div>
      {isFlowActive && (
        <div className="mx-4 mt-3 mb-1 flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
          <p className="text-xs text-blue-700">
            {ofdDirection === 'ofdAsTarget' ? '포트를 선택하여 연결을 완료하세요' : '포트를 선택하세요'}
          </p>
          <button onClick={cancelOfd} className="text-xs text-blue-500 hover:text-blue-700 font-medium">
            취소
          </button>
        </div>
      )}
      {ofdPhase === 'selectingTarget' && ofdFlowOfdId === equipmentId && (
        <div className="mx-4 mt-3 mb-1 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
          <p className="text-xs text-green-700">캔버스에서 대상 설비를 클릭하세요</p>
        </div>
      )}
      <FiberPathManager
        ofdId={equipmentId}
        onPortConnect={(portNumber, fiberPathId) => {
          if (isFlowActive) {
            selectPort(fiberPathId, portNumber);
          } else {
            const store = useOfdConnectionFlowStore.getState();
            store.startFromOfd(equipmentId);
            store.selectPort(fiberPathId, portNumber);
          }
        }}
        onPortDelete={(cableId) => deleteCable(cableId)}
        onPortSwitch={(cableId, _eqId, newFiberPathId, newPortNumber) => {
          updateCable(cableId, { fiberPathId: newFiberPathId, fiberPortNumber: newPortNumber });
        }}
        onNavigateRemote={(remoteRoomId) => {
          const { hasChanges } = useEditorStore.getState();
          if (hasChanges) {
            if (!confirm('저장하지 않은 변경사항이 있습니다. 대국 도면으로 이동하시겠습니까?')) return;
          }
          navigate(`/floors/${remoteRoomId}/plan`);
        }}
      />
    </div>
  );
}
