import type {
  LineProperties,
  RectProperties,
  CircleProperties,
  DoorProperties,
  WindowProperties,
  TextProperties,
} from '../../../types/floorPlan';
import { distance } from '../../../utils/geometry/geometryUtils';
import { createPropertyUpdater as updateElementProperty } from '../../../utils/floorplan/elementSystem';
import { PropertyInput } from './PropertyInput';
import { useEditorStore } from '../stores/editorStore';

export function PropertyBar() {
  const selectedElement = useEditorStore(s => s.selectedElement);
  const selectedRack = useEditorStore(s => s.selectedRack);
  const selectedIds = useEditorStore(s => s.selectedIds);
  const mouseWorldPosition = useEditorStore(s => s.mouseWorldPosition);
  const setLocalElements = useEditorStore(s => s.setLocalElements);
  const setLocalRacks = useEditorStore(s => s.setLocalRacks);
  const setHasChanges = useEditorStore(s => s.setHasChanges);

  return (
    <div className="h-14 shrink-0 bg-gray-50 border-t border-gray-200 flex items-center px-4 gap-4 text-sm">
      {/* Selected type indicator */}
      <div className="flex items-center gap-2 min-w-[120px]">
        <div className={`w-3 h-3 rounded-full ${selectedIds.length > 0 ? 'bg-blue-500' : 'bg-gray-400'}`} />
        <span className="font-semibold text-gray-700">
          {selectedIds.length === 0 && '선택 없음'}
          {selectedIds.length === 1 && selectedElement && (
            <>
              {selectedElement.elementType === 'line' && '선 (Line)'}
              {selectedElement.elementType === 'rect' && '사각형 (Rect)'}
              {selectedElement.elementType === 'circle' && '원 (Circle)'}
              {selectedElement.elementType === 'door' && '문 (Door)'}
              {selectedElement.elementType === 'window' && '창문 (Window)'}
              {selectedElement.elementType === 'text' && '텍스트 (Text)'}
            </>
          )}
          {selectedIds.length === 1 && selectedRack && `랙: ${selectedRack.name}`}
          {selectedIds.length > 1 && `${selectedIds.length}개 선택됨`}
        </span>
      </div>

      <div className="w-px h-7 bg-gray-300" />

      {/* Property editors */}
      <div className="flex-1 flex items-center gap-3 overflow-x-auto">
        {/* Line */}
        {selectedElement?.elementType === 'line' && (() => {
          const props = selectedElement.properties as LineProperties;
          const points = props.points || [];
          const start = points[0] || [0, 0];
          const end = points[points.length - 1] || [0, 0];
          const len = points.length >= 2 ? Math.round(distance(start[0], start[1], end[0], end[1])) : 0;
          return (
            <>
              <PropertyInput label="X1" value={Math.round(start[0])} onChange={(v) => {
                const newPoints = [...points]; newPoints[0] = [v as number, start[1]];
                setLocalElements(updateElementProperty(selectedElement.id, 'points', newPoints)); setHasChanges(true);
              }} />
              <PropertyInput label="Y1" value={Math.round(start[1])} onChange={(v) => {
                const newPoints = [...points]; newPoints[0] = [start[0], v as number];
                setLocalElements(updateElementProperty(selectedElement.id, 'points', newPoints)); setHasChanges(true);
              }} />
              <PropertyInput label="X2" value={Math.round(end[0])} onChange={(v) => {
                const newPoints = [...points]; newPoints[newPoints.length - 1] = [v as number, end[1]];
                setLocalElements(updateElementProperty(selectedElement.id, 'points', newPoints)); setHasChanges(true);
              }} />
              <PropertyInput label="Y2" value={Math.round(end[1])} onChange={(v) => {
                const newPoints = [...points]; newPoints[newPoints.length - 1] = [end[0], v as number];
                setLocalElements(updateElementProperty(selectedElement.id, 'points', newPoints)); setHasChanges(true);
              }} />
              <PropertyInput label="길이" value={len} suffix="px" readOnly />
            </>
          );
        })()}

        {/* Rect */}
        {selectedElement?.elementType === 'rect' && (() => {
          const props = selectedElement.properties as RectProperties;
          return (
            <>
              <PropertyInput label="X" value={Math.round(props.x)} onChange={(v) => { setLocalElements(updateElementProperty(selectedElement.id, 'x', v as number)); setHasChanges(true); }} />
              <PropertyInput label="Y" value={Math.round(props.y)} onChange={(v) => { setLocalElements(updateElementProperty(selectedElement.id, 'y', v as number)); setHasChanges(true); }} />
              <PropertyInput label="W" value={Math.round(props.width)} onChange={(v) => { setLocalElements(updateElementProperty(selectedElement.id, 'width', v as number)); setHasChanges(true); }} />
              <PropertyInput label="H" value={Math.round(props.height)} onChange={(v) => { setLocalElements(updateElementProperty(selectedElement.id, 'height', v as number)); setHasChanges(true); }} />
              <PropertyInput label="R" value={props.rotation || 0} suffix="°" onChange={(v) => { setLocalElements(updateElementProperty(selectedElement.id, 'rotation', v as number)); setHasChanges(true); }} />
            </>
          );
        })()}

        {/* Circle */}
        {selectedElement?.elementType === 'circle' && (() => {
          const props = selectedElement.properties as CircleProperties;
          return (
            <>
              <PropertyInput label="X" value={Math.round(props.cx)} onChange={(v) => { setLocalElements(updateElementProperty(selectedElement.id, 'cx', v as number)); setHasChanges(true); }} />
              <PropertyInput label="Y" value={Math.round(props.cy)} onChange={(v) => { setLocalElements(updateElementProperty(selectedElement.id, 'cy', v as number)); setHasChanges(true); }} />
              <PropertyInput label="반지름" value={Math.round(props.radius)} onChange={(v) => { setLocalElements(updateElementProperty(selectedElement.id, 'radius', v as number)); setHasChanges(true); }} width="w-20" />
            </>
          );
        })()}

        {/* Door */}
        {selectedElement?.elementType === 'door' && (() => {
          const props = selectedElement.properties as DoorProperties;
          return (
            <>
              <PropertyInput label="X" value={Math.round(props.x)} onChange={(v) => { setLocalElements(updateElementProperty(selectedElement.id, 'x', v as number)); setHasChanges(true); }} />
              <PropertyInput label="Y" value={Math.round(props.y)} onChange={(v) => { setLocalElements(updateElementProperty(selectedElement.id, 'y', v as number)); setHasChanges(true); }} />
              <PropertyInput label="W" value={Math.round(props.width)} onChange={(v) => { setLocalElements(updateElementProperty(selectedElement.id, 'width', v as number)); setHasChanges(true); }} />
              <PropertyInput label="R" value={props.rotation || 0} suffix="°" onChange={(v) => { setLocalElements(updateElementProperty(selectedElement.id, 'rotation', v as number)); setHasChanges(true); }} />
            </>
          );
        })()}

        {/* Window */}
        {selectedElement?.elementType === 'window' && (() => {
          const props = selectedElement.properties as WindowProperties;
          return (
            <>
              <PropertyInput label="X" value={Math.round(props.x)} onChange={(v) => { setLocalElements(updateElementProperty(selectedElement.id, 'x', v as number)); setHasChanges(true); }} />
              <PropertyInput label="Y" value={Math.round(props.y)} onChange={(v) => { setLocalElements(updateElementProperty(selectedElement.id, 'y', v as number)); setHasChanges(true); }} />
              <PropertyInput label="W" value={Math.round(props.width)} onChange={(v) => { setLocalElements(updateElementProperty(selectedElement.id, 'width', v as number)); setHasChanges(true); }} />
              <PropertyInput label="R" value={props.rotation || 0} suffix="°" onChange={(v) => { setLocalElements(updateElementProperty(selectedElement.id, 'rotation', v as number)); setHasChanges(true); }} />
            </>
          );
        })()}

        {/* Text */}
        {selectedElement?.elementType === 'text' && (() => {
          const props = selectedElement.properties as TextProperties;
          return (
            <>
              <PropertyInput label="X" value={Math.round(props.x)} onChange={(v) => { setLocalElements(updateElementProperty(selectedElement.id, 'x', v as number)); setHasChanges(true); }} />
              <PropertyInput label="Y" value={Math.round(props.y)} onChange={(v) => { setLocalElements(updateElementProperty(selectedElement.id, 'y', v as number)); setHasChanges(true); }} />
              <PropertyInput label="크기" value={props.fontSize || 14} onChange={(v) => { setLocalElements(updateElementProperty(selectedElement.id, 'fontSize', v as number)); setHasChanges(true); }} />
              <PropertyInput label="R" value={props.rotation || 0} suffix="°" onChange={(v) => { setLocalElements(updateElementProperty(selectedElement.id, 'rotation', v as number)); setHasChanges(true); }} />
            </>
          );
        })()}

        {/* Rack */}
        {selectedRack && (
          <>
            <PropertyInput label="X" value={Math.round(selectedRack.positionX)} onChange={(v) => {
              setLocalRacks(prev => prev.map(r => r.id === selectedRack.id ? { ...r, positionX: v as number } : r));
              setHasChanges(true);
            }} />
            <PropertyInput label="Y" value={Math.round(selectedRack.positionY)} onChange={(v) => {
              setLocalRacks(prev => prev.map(r => r.id === selectedRack.id ? { ...r, positionY: v as number } : r));
              setHasChanges(true);
            }} />
            <PropertyInput label="W" value={Math.round(selectedRack.width)} onChange={(v) => {
              setLocalRacks(prev => prev.map(r => r.id === selectedRack.id ? { ...r, width: v as number } : r));
              setHasChanges(true);
            }} />
            <PropertyInput label="H" value={Math.round(selectedRack.height)} onChange={(v) => {
              setLocalRacks(prev => prev.map(r => r.id === selectedRack.id ? { ...r, height: v as number } : r));
              setHasChanges(true);
            }} />
            <PropertyInput label="R" value={selectedRack.rotation} suffix="°" onChange={(v) => {
              setLocalRacks(prev => prev.map(r => r.id === selectedRack.id ? { ...r, rotation: v as number } : r));
              setHasChanges(true);
            }} />
            <PropertyInput label="U" value={selectedRack.totalU} suffix="U" readOnly />
          </>
        )}
      </div>

      <div className="w-px h-7 bg-gray-300" />

      {/* Mouse coordinates */}
      <div className="flex items-center gap-4 font-mono text-gray-600">
        <div className="flex items-center gap-1.5">
          <span className="text-gray-400 font-semibold">X</span>
          <span className="bg-white px-3 py-1 rounded border border-gray-200 min-w-[60px] text-right">{mouseWorldPosition.x}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-gray-400 font-semibold">Y</span>
          <span className="bg-white px-3 py-1 rounded border border-gray-200 min-w-[60px] text-right">{mouseWorldPosition.y}</span>
        </div>
      </div>
    </div>
  );
}
