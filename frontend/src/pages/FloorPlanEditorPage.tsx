import { useParams } from 'react-router-dom';
import { FloorPlanEditor } from '../features/editor/components/FloorPlanEditor';

export function FloorPlanEditorPage() {
  const { roomId } = useParams<{ roomId: string }>();

  if (!roomId) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p className="text-gray-500">Room ID가 필요합니다.</p>
      </div>
    );
  }

  return <FloorPlanEditor roomId={roomId} />;
}
