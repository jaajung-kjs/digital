import { useEditorStore } from '../stores/editorStore';
import { RackView } from './RackView';

interface RackDetailPanelProps {
  rackId: string;
  roomId: string;
}

export function RackDetailPanel({ rackId, roomId: _roomId }: RackDetailPanelProps) {
  const setSelectedRackId = useEditorStore((s) => s.setSelectedRackId);

  const handleClose = () => {
    setSelectedRackId(null);
  };

  return (
    <div className="absolute right-0 top-0 bottom-0 w-[480px] bg-white border-l shadow-xl z-30 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
        <div>
          <h2 className="text-base font-semibold text-gray-900">랙 상세</h2>
        </div>
        <button
          onClick={handleClose}
          className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors"
          title="닫기"
        >
          <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Body: shared RackView */}
      <div className="flex-1 overflow-hidden">
        <RackView rackId={rackId} />
      </div>
    </div>
  );
}
