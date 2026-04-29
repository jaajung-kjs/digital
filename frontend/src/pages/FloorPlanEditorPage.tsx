import { useParams } from 'react-router-dom';
import { FloorPlanEditor } from '../features/editor/components/FloorPlanEditor';

export function FloorPlanEditorPage() {
  const { floorId } = useParams<{ floorId: string }>();

  if (!floorId) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p className="text-gray-500">Floor ID가 필요합니다.</p>
      </div>
    );
  }

  return <FloorPlanEditor floorId={floorId} />;
}
