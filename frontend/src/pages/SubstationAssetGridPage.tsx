import { useParams, useNavigate } from 'react-router-dom';
import { SubstationAssetGrid } from '../features/assets/components/SubstationAssetGrid';

export function SubstationAssetGridPage() {
  const { substationId } = useParams<{ substationId: string }>();
  const navigate = useNavigate();
  if (!substationId) return null;
  return (
    <div className="h-full flex flex-col bg-white">
      <header className="flex items-center gap-3 px-4 py-2 border-b border-gray-200">
        <button onClick={() => navigate('/')} className="text-sm text-gray-500 hover:text-gray-800">← 트리로</button>
        <h1 className="text-base font-semibold text-gray-900">변전소 현황 표</h1>
      </header>
      <div className="flex-1 overflow-auto">
        <SubstationAssetGrid substationId={substationId} />
      </div>
    </div>
  );
}
