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
          <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-line bg-surface">
            <div className="flex gap-1">
              {VIEWS.map((v) => (
                <button
                  key={v.key}
                  onClick={() => (v.key === 'plan' && selectedFloorId ? nav.gotoFloor(selectedFloorId) : switchView(v.key))}
                  className={`text-sm px-3 py-1.5 rounded font-medium transition-colors ${
                    view === v.key
                      ? 'bg-primary text-white'
                      : 'text-content-muted hover:bg-surface-2'
                  }`}>
                  {v.label}
                </button>
              ))}
            </div>
            {view === 'plan' && floors.length > 0 && (
              <select
                value={selectedFloorId ?? ''}
                onChange={(e) => nav.gotoFloor(e.target.value)}
                className="text-sm px-2 py-1.5 border border-line rounded bg-surface text-content">
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
              보존한다.
              숨길 때 display:none(0 크기)을 쓰면 다시 표시될 때 캔버스가
              리사이즈→재렌더되는데, 케이블 오버레이가 메인 캔버스보다 한
              프레임 늦게 다시 그려져 "케이블이 한박자 늦게" 보인다. 그래서
              visibility 만 끄고(invisible) absolute 크기는 유지한다 — 컨테이너
              크기가 안 바뀌어 ResizeObserver 가 안 돌고, 캔버스 버퍼가 유지돼
              탭 복귀 시 설비·케이블이 즉시 보인다(리사이즈 지연 없음).
              key={selectedFloorId} 는 그대로 둬 "층 변경" 시에만 리마운트.
            */}
            {selectedFloorId ? (
              <div className={view === 'plan' ? 'absolute inset-0' : 'absolute inset-0 invisible pointer-events-none'}>
                <FloorPlanEditor key={selectedFloorId} floorId={selectedFloorId} />
              </div>
            ) : view === 'plan' ? (
              <div className="p-6 text-sm text-content-muted">등록된 층이 없습니다.</div>
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
