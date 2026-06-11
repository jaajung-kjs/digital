import { useParams } from 'react-router-dom';
import { SubstationAssetGrid } from '../features/assets/components/SubstationAssetGrid';
import { WorkingCopyCommitBar } from '../features/workingCopy/WorkingCopyCommitBar';

export function SubstationAssetGridPage() {
  const { substationId } = useParams<{ substationId: string }>();
  if (!substationId) return null;
  return (
    <div className="h-full flex flex-col bg-surface">
      <header className="flex items-center gap-3 px-4 py-2 border-b border-line">
        <h1 className="text-base font-semibold text-content">변전소 현황 표</h1>
        {/* 통합 working copy 단일 저장 바 — dirty 0 이면 자동으로 숨겨진다. */}
        <div className="flex-1" />
        <WorkingCopyCommitBar substationId={substationId} />
      </header>
      <div className="flex-1 overflow-auto">
        <SubstationAssetGrid substationId={substationId} />
      </div>
    </div>
  );
}
