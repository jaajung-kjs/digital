import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { FloorPlanEditor } from '../features/editor/components/FloorPlanEditor';
import { ensureOfdDirectory } from '../features/fiber/hooks/useOfdDirectory';

export function FloorPlanEditorPage() {
  const { floorId } = useParams<{ floorId: string }>();

  // OFD directory prefetch — 첫 OFD 패널 진입 시 변전소명이 '?' 로 깜빡이지 않게.
  // staleTime 5분이라 한 번 warm 되면 세션 내내 즉시.
  useEffect(() => {
    void ensureOfdDirectory();
  }, []);

  if (!floorId) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p className="text-gray-500">Floor ID가 필요합니다.</p>
      </div>
    );
  }

  return <FloorPlanEditor floorId={floorId} />;
}
