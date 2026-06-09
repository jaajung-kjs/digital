import { useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { FloorPlanEditor } from '../features/editor/components/FloorPlanEditor';
import { SubstationAssetGrid } from '../features/assets/components/SubstationAssetGrid';
import { WorkspaceNavContext, type WorkspaceNav } from '../features/workspace/WorkspaceNavContext';
import { useSubstationFloors } from '../features/workspace/useSubstationFloors';

export function SubstationWorkspacePage() {
  const { substationId } = useParams<{ substationId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: floors = [] } = useSubstationFloors(substationId);

  const tab = searchParams.get('tab') === 'plan' ? 'plan' : 'register';
  const floorParam = searchParams.get('floor');
  const selectedFloorId = floorParam ?? floors[0]?.id ?? null;

  const nav: WorkspaceNav = useMemo(() => ({
    gotoFloor: (floorId, assetId) =>
      setSearchParams((p) => {
        p.set('tab', 'plan'); p.set('floor', floorId);
        if (assetId) p.set('equipmentId', assetId); else p.delete('equipmentId');
        return p;
      }),
    gotoRegister: (assetId) =>
      setSearchParams((p) => {
        p.set('tab', 'register');
        if (assetId) p.set('assetId', assetId); else p.delete('assetId');
        return p;
      }),
  }), [setSearchParams]);

  if (!substationId) return null;

  return (
    <WorkspaceNavContext.Provider value={nav}>
      <div className="h-screen flex flex-col">
        <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-gray-200 bg-white">
          <div className="flex gap-1">
            <button
              onClick={() => (selectedFloorId ? nav.gotoFloor(selectedFloorId) : setSearchParams((p) => { p.set('tab', 'plan'); return p; }))}
              className={`text-sm px-3 py-1 rounded ${tab === 'plan' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>도면</button>
            <button
              onClick={() => nav.gotoRegister()}
              className={`text-sm px-3 py-1 rounded ${tab === 'register' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>현황</button>
          </div>
          {tab === 'plan' && floors.length > 0 && (
            <select
              value={selectedFloorId ?? ''}
              onChange={(e) => nav.gotoFloor(e.target.value)}
              className="text-sm px-2 py-1 border border-gray-200 rounded">
              {floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          )}
        </div>
        <div className="flex-1 min-h-0 relative">
          {tab === 'plan' ? (
            selectedFloorId ? (
              <FloorPlanEditor key={selectedFloorId} floorId={selectedFloorId} />
            ) : (
              <div className="p-6 text-sm text-gray-500">등록된 층이 없습니다.</div>
            )
          ) : (
            <SubstationAssetGrid substationId={substationId} />
          )}
        </div>
      </div>
    </WorkspaceNavContext.Provider>
  );
}
