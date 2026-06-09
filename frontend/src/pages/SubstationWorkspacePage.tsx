import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { FloorPlanEditor } from '../features/editor/components/FloorPlanEditor';
import { SubstationStatusView } from '../features/assets/components/SubstationStatusView';
import { SubstationConnectionsView } from '../features/connections/components/SubstationConnectionsView';
import { WorkspaceNavContext, type WorkspaceNav } from '../features/workspace/WorkspaceNavContext';
import { SelectionContext } from '../features/workspace/SelectionContext';
import { useEditorSelectionBridge } from '../features/workspace/useEditorSelectionBridge';
import { useSubstationFloors } from '../features/workspace/useSubstationFloors';
import { useWorkingCopyLoader } from '../features/workingCopy/hooks';
import { WorkingCopyCommitBar } from '../features/workingCopy/WorkingCopyCommitBar';

const VIEWS = [
  { key: 'status', label: '현황' },
  { key: 'plan', label: '평면도' },
  { key: 'connections', label: '연결' },
] as const;
type ViewKey = (typeof VIEWS)[number]['key'];

export function SubstationWorkspacePage() {
  const { substationId } = useParams<{ substationId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: floors = [] } = useSubstationFloors(substationId);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  const rawView = searchParams.get('view') ?? (searchParams.get('tab') === 'plan' ? 'plan' : null);
  const view: ViewKey =
    rawView === 'plan' ? 'plan'
    : rawView === 'connections' ? 'connections'
    : 'status';
  const floorParam = searchParams.get('floor');
  const selectedFloorId = floorParam ?? floors[0]?.id ?? null;

  const nav: WorkspaceNav = useMemo(() => ({
    gotoFloor: (floorId, assetId) =>
      setSearchParams((p) => {
        p.set('view', 'plan'); p.delete('tab'); p.set('floor', floorId);
        if (assetId) p.set('equipmentId', assetId); else p.delete('equipmentId');
        p.delete('assetId');
        return p;
      }),
    gotoRegister: (assetId) =>
      setSearchParams((p) => {
        p.set('view', 'status'); p.delete('tab');
        if (assetId) p.set('assetId', assetId); else p.delete('assetId');
        p.delete('equipmentId');
        return p;
      }),
  }), [setSearchParams]);

  useEditorSelectionBridge(selectedAssetId, setSelectedAssetId, view === 'plan');

  // 이 변전소의 통합 working copy 를 store 에 로드(idempotent; substationId 변경 시 재로드).
  useWorkingCopyLoader(substationId ?? null);

  if (!substationId) return null;

  const switchView = (key: ViewKey) =>
    setSearchParams((p) => { p.set('view', key); p.delete('tab'); return p; });

  return (
    <WorkspaceNavContext.Provider value={nav}>
      <SelectionContext.Provider value={{ selectedAssetId, setSelectedAssetId }}>
        <div className="h-full flex flex-col">
          <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-gray-200 bg-white">
            <div className="flex gap-1">
              {VIEWS.map((v) => (
                <button
                  key={v.key}
                  onClick={() => (v.key === 'plan' && selectedFloorId ? nav.gotoFloor(selectedFloorId) : switchView(v.key))}
                  className={`text-sm px-3 py-1 rounded ${view === v.key ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>
                  {v.label}
                </button>
              ))}
            </div>
            {view === 'plan' && floors.length > 0 && (
              <select
                value={selectedFloorId ?? ''}
                onChange={(e) => nav.gotoFloor(e.target.value)}
                className="text-sm px-2 py-1 border border-gray-200 rounded">
                {floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            )}
          </div>
          {(view === 'status' || view === 'connections' || view === 'plan') && (
            <WorkingCopyCommitBar substationId={substationId} />
          )}
          <div className="flex-1 min-h-0 relative">
            {/*
              평면도 에디터는 탭 전환 시 언마운트하지 않고 CSS 로만 숨긴다.
              언마운트→resetEditor→재마운트 경로를 타면 뷰포트가 0,0 으로
              리셋되므로(useFloorPlanData 의 init/save effect 가 unmount 순서에
              취약), 마운트를 유지해 editorStore 의 zoom/pan 상태를 그대로
              보존한다. 숨김 동안 컨테이너는 0 크기가 되고, 다시 표시되면
              useCanvas 의 ResizeObserver 가 복원된 크기로 재렌더한다(같은
              뷰포트 → 0,0 으로 안 떨어짐). key={selectedFloorId} 는 그대로 둬
              "층 변경" 시에만 새 에디터로 리마운트되게 한다.
            */}
            {selectedFloorId ? (
              <div className={view === 'plan' ? 'absolute inset-0' : 'hidden'}>
                <FloorPlanEditor key={selectedFloorId} floorId={selectedFloorId} />
              </div>
            ) : view === 'plan' ? (
              <div className="p-6 text-sm text-gray-500">등록된 층이 없습니다.</div>
            ) : null}
            {view === 'connections' ? (
              <SubstationConnectionsView substationId={substationId} />
            ) : view === 'status' ? (
              <SubstationStatusView substationId={substationId} />
            ) : null}
          </div>
        </div>
      </SelectionContext.Provider>
    </WorkspaceNavContext.Provider>
  );
}
